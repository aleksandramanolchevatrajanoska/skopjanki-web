import { beforeEach, describe, expect, it } from "vitest";
import { db, girl, hours, reset, T0, weekly } from "./helpers";
import { reserve, cancelReservation, acceptOffer, confirmPayment, expireStale } from "@/lib/services/reservations";
import { proposePlan, decidePlan, cancelEvent, createEvent } from "@/lib/services/events";
import { applyCaptain, decideCaptain } from "@/lib/services/captains";
import { saveAttendance, openDebts, markDebtPaid } from "@/lib/services/attendance";
import { requestJoin, decideUser } from "@/lib/services/users";
import { runLifecycle } from "@/lib/services/lifecycle";
import { DAY } from "@/lib/time";

const code = (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code ?? String(e));

beforeEach(reset);

describe("access", () => {
  it("join requests wait for the organiser; only approved girls can reserve", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    await requestJoin(db, { name: "Ana", email: "Ana@Mail.mk", levels: { padel: "Beginner" } });
    const ana = await db.user.findUniqueOrThrow({ where: { email: "ana@mail.mk" } });
    expect(ana.status).toBe("PENDING");
    expect(await code(reserve(db, ana.id, e.id, T0))).toBe("NOT_APPROVED");
    await decideUser(db, ana.id, true, T0);
    expect(await code(reserve(db, ana.id, e.id, T0))).toBe("OK");
    const mails = await db.emailLog.findMany();
    expect(mails.some((m) => m.subject.startsWith("New join request"))).toBe(true);
    expect(mails.some((m) => m.subject.startsWith("Welcome"))).toBe(true);
  });
});

describe("members first, then everyone", () => {
  it("non-members can book only 48h after publication", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id, {}, T0);
    const member = await girl({ member: true });
    const free = await girl();
    expect(await code(reserve(db, member.id, e.id, hours(1)))).toBe("OK");
    expect(await code(reserve(db, free.id, e.id, hours(47)))).toBe("MEMBERS_FIRST");
    expect(await code(reserve(db, free.id, e.id, hours(48)))).toBe("OK");
  });
});

describe("waiting list", () => {
  it("full term -> waiting list; a freed seat is offered for 12h, then goes to the next girl", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id, { minSpots: 1, maxSpots: 2 });
    const [a, b, c, d] = [await girl(), await girl(), await girl(), await girl()];
    await reserve(db, a.id, e.id, T0);
    await reserve(db, b.id, e.id, T0);
    expect((await reserve(db, c.id, e.id, T0)).status).toBe("WAITLIST");
    expect((await reserve(db, d.id, e.id, hours(1))).status).toBe("WAITLIST");
    await cancelReservation(db, a.id, e.id, hours(2));
    const rc = await db.reservation.findFirstOrThrow({ where: { userId: c.id } });
    expect(rc.status).toBe("OFFERED");
    await expireStale(db, hours(15));
    expect((await db.reservation.findFirstOrThrow({ where: { userId: c.id } })).status).toBe("CANCELLED");
    expect((await db.reservation.findFirstOrThrow({ where: { userId: d.id } })).status).toBe("OFFERED");
    expect((await acceptOffer(db, d.id, e.id, hours(16))).status).toBe("CONFIRMED");
  });
});

describe("weekly cash rules", () => {
  async function tenGirls() {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const captain = await girl({ member: true });
    await applyCaptain(db, captain.id, e.id, T0);
    const app = await db.captainApplication.findFirstOrThrow();
    await decideCaptain(db, app.id, true, T0);
    const members = [];
    for (let i = 0; i < 6; i++) { const g = await girl({ member: true }); await reserve(db, g.id, e.id, T0); members.push(g); }
    const non = [];
    for (let i = 0; i < 3; i++) { const g = await girl(); await reserve(db, g.id, e.id, T0); non.push(g); }
    return { owner, e, captain, members, non };
  }

  it("price locks 48h before: 310 non-member / 250 member, captain free", async () => {
    const { e } = await tenGirls();
    await runLifecycle(db, new Date(e.startsAt.getTime() - 47 * 3600_000));
    const locked = await db.event.findUniqueOrThrow({ where: { id: e.id } });
    expect([locked.lockedPriceNonMember, locked.lockedPriceMember]).toEqual([310, 250]);
    const mails = await db.emailLog.findMany({ where: { subject: { contains: "bring" } } });
    expect(mails).toHaveLength(10);
  });

  it("cancel 48h+ before: nothing owed. Later: she owes her part to the club", async () => {
    const { e, members, non } = await tenGirls();
    const early = await cancelReservation(db, non[0].id, e.id, new Date(e.startsAt.getTime() - 49 * 3600_000));
    expect(early).toEqual({ late: false, debt: 0, credit: 0 });
    const late = await cancelReservation(db, members[0].id, e.id, new Date(e.startsAt.getTime() - 10 * 3600_000));
    expect(late.late).toBe(true);
    expect(late.debt).toBeGreaterThan(0);
    expect((await openDebts(db, members[0].id))).toHaveLength(1);
  });

  it("late canceller is let off if a girl takes her seat", async () => {
    const { e, members } = await tenGirls();
    await cancelReservation(db, members[0].id, e.id, new Date(e.startsAt.getTime() - 10 * 3600_000));
    const newGirl = await girl({ member: true });
    await reserve(db, newGirl.id, e.id, new Date(e.startsAt.getTime() - 9 * 3600_000));
    expect(await openDebts(db, members[0].id)).toHaveLength(0);
  });

  it("no-show: the girls who came share her part (350/280), she owes 250 to the club", async () => {
    const { e, captain, members, non } = await tenGirls();
    const came = [captain, ...members.slice(1), ...non].map((g) => g.id);
    const prices = await saveAttendance(db, captain.id, e.id, came, e.startsAt);
    expect(prices).toEqual({ nonMember: 350, member: 280 });
    const debts = await openDebts(db, members[0].id);
    expect(debts.map((d) => [d.amount, d.reason])).toEqual([[250, "NO_SHOW"]]);
    // next term: that term's captain collects it
    const e2 = await weekly((await db.user.findFirstOrThrow({ where: { isOwner: true } })).id, { startsAt: new Date(T0.getTime() + 12 * DAY) });
    await db.event.update({ where: { id: e2.id }, data: { captainId: captain.id } });
    await reserve(db, members[0].id, e2.id, T0);
    await markDebtPaid(db, captain.id, debts[0].id);
    expect(await openDebts(db, members[0].id)).toHaveLength(0);
  });

  it("only the captain or the organiser can mark attendance", async () => {
    const { e, members } = await tenGirls();
    expect(await code(saveAttendance(db, members[0].id, e.id, [], e.startsAt))).toBe("FORBIDDEN");
  });

  it("cancelled for too few girls: nobody owes anything", async () => {
    const { e, members } = await tenGirls();
    await cancelReservation(db, members[0].id, e.id, new Date(e.startsAt.getTime() - 10 * 3600_000));
    await cancelEvent(db, e.id, "minimum not reached", new Date(e.startsAt.getTime() - 9 * 3600_000));
    expect(await openDebts(db, members[0].id)).toHaveLength(0);
  });
});

describe("captains", () => {
  it("only paying members can apply; approval gives a seat and rejects the others", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const free = await girl();
    expect(await code(applyCaptain(db, free.id, e.id, T0))).toBe("MEMBERS_ONLY");
    const m1 = await girl({ member: true });
    const m2 = await girl({ member: true });
    await applyCaptain(db, m1.id, e.id, T0);
    await applyCaptain(db, m2.id, e.id, T0);
    const app1 = await db.captainApplication.findFirstOrThrow({ where: { userId: m1.id } });
    await decideCaptain(db, app1.id, true, T0);
    expect((await db.event.findUniqueOrThrow({ where: { id: e.id } })).captainId).toBe(m1.id);
    expect((await db.reservation.findFirstOrThrow({ where: { userId: m1.id } })).status).toBe("CONFIRMED");
    expect((await db.captainApplication.findFirstOrThrow({ where: { userId: m2.id } })).status).toBe("REJECTED");
  });
});

describe("member plans", () => {
  const plan = (startsAt: Date) => ({ title: "Running in City Park", startsAt, minSpots: 2, maxSpots: 8, pricingMode: "PER_PERSON" as const, priceNonMember: 0 });

  it("one plan per member per week, needs approval; rejecting frees the week", async () => {
    await girl({ owner: true });
    const m = await girl({ member: true });
    const free = await girl();
    expect(await code(proposePlan(db, free.id, plan(new Date(T0.getTime() + 2 * DAY)), T0))).toBe("MEMBERS_ONLY");
    const p1 = await proposePlan(db, m.id, plan(new Date(T0.getTime() + 2 * DAY)), T0);
    expect(p1.status).toBe("PENDING");
    expect(await code(proposePlan(db, m.id, plan(new Date(T0.getTime() + 4 * DAY)), T0))).toBe("ONE_PLAN_PER_WEEK");
    expect(await code(proposePlan(db, m.id, plan(new Date(T0.getTime() + 7 * DAY)), T0))).toBe("OK");
    const other = await girl({ member: true });
    expect(await code(reserve(db, other.id, p1.id, T0))).toBe("EVENT_NOT_OPEN");
    await decidePlan(db, p1.id, false, T0);
    expect(await code(proposePlan(db, m.id, plan(new Date(T0.getTime() + 4 * DAY)), T0))).toBe("OK");
  });

  it("the database itself refuses a second plan in the same week", async () => {
    const m = await girl({ member: true });
    const base = { kind: "MEMBER_PLAN" as const, title: "x", startsAt: T0, weekKey: "2026-W49", maxSpots: 5, pricingMode: "PER_PERSON" as const, createdById: m.id, status: "PENDING" as const };
    await db.event.create({ data: base });
    await expect(db.event.create({ data: base })).rejects.toThrow();
  });
});

describe("fusion (online, Stripe)", () => {
  async function fusion() {
    const owner = await girl({ owner: true });
    return createEvent(db, owner.id, { kind: "FUSION", title: "Sip & Serve", startsAt: new Date(T0.getTime() + 20 * DAY), minSpots: 1, maxSpots: 2, pricingMode: "ONLINE", priceNonMember: 1800, priceMember: 1500 }, new Date(T0.getTime() - 3 * DAY));
  }

  it("seat confirmed only after payment; members pay 1500; non-members cannot book", async () => {
    const e = await fusion();
    const m = await girl({ member: true });
    const r = await reserve(db, m.id, e.id, T0);
    expect(r).toMatchObject({ status: "PENDING_PAYMENT", amountDue: 1500 });
    await db.reservation.update({ where: { id: r.reservationId }, data: { stripeSessionId: "cs_1" } });
    expect(await confirmPayment(db, "cs_1", "pi_1", 1500, T0)).toBe("CONFIRMED");
    const g = await girl();
    expect(await code(reserve(db, g.id, e.id, T0))).toBe("MEMBERS_ONLY_EVENT"); // fusion events are for members only
  });

  it("unpaid holds expire after 30 minutes and the seat is free again", async () => {
    const e = await fusion();
    const [a, b, c] = [await girl({ member: true }), await girl({ member: true }), await girl({ member: true })];
    await reserve(db, a.id, e.id, T0);
    await reserve(db, b.id, e.id, T0);
    expect((await reserve(db, c.id, e.id, T0)).status).toBe("WAITLIST");
    await expireStale(db, new Date(T0.getTime() + 31 * 60_000));
    expect((await db.reservation.findFirstOrThrow({ where: { userId: c.id } })).status).toBe("OFFERED");
  });

  it("cancel 7+ days before: amount kept as credit and used for the next fusion", async () => {
    const e = await fusion();
    const m = await girl({ member: true });
    const r = await reserve(db, m.id, e.id, T0);
    await db.reservation.update({ where: { id: r.reservationId }, data: { stripeSessionId: "cs_2" } });
    await confirmPayment(db, "cs_2", "pi_2", 1500, T0);
    expect((await cancelReservation(db, m.id, e.id, T0)).credit).toBe(1500);
    expect((await reserve(db, m.id, e.id, T0)).status).toBe("CONFIRMED");
    expect((await db.user.findUniqueOrThrow({ where: { id: m.id } })).creditBalance).toBe(0);
  });

  it("organiser cancels a fusion: payments listed for full refund", async () => {
    const e = await fusion();
    const m = await girl({ member: true });
    const r = await reserve(db, m.id, e.id, T0);
    await db.reservation.update({ where: { id: r.reservationId }, data: { stripeSessionId: "cs_3" } });
    await confirmPayment(db, "cs_3", "pi_3", 1500, T0);
    expect(await cancelEvent(db, e.id, "rain", T0)).toEqual([{ paymentIntentId: "pi_3", amount: 1500 }]);
  });
});

describe("partner applications", () => {
  it("anyone can apply; accepting creates a partner with the deal in the notes", async () => {
    const { submitPartnerApplication, decidePartnerApplication } = await import("@/lib/services/partners");
    await girl({ owner: true });
    const base = { business: "Pointer", kind: "Спортски терен", person: "Marko", phone: "070", email: "p@x.mk", sports: ["Тенис", "Падел"], offers: [], hostWeekly: true, hostFusion: true, days: [], consent: true };
    expect(await code(submitPartnerApplication(db, base))).toBe("OFFER_REQUIRED");
    expect(await code(submitPartnerApplication(db, { ...base, offers: ["discount_session"], consent: false }))).toBe("CONSENT_REQUIRED");
    const a = await submitPartnerApplication(db, { ...base, offers: ["discount_session", "hack"], discountPct: 20, priceRegular: 1600, priceGroup: 1300, perUnit: 4 });
    expect(a.offers).toEqual(["discount_session"]);
    await decidePartnerApplication(db, a.id, true);
    const p = await db.partner.findFirstOrThrow({ where: { name: "Pointer" } });
    expect(p.notes).toContain("Skopjanki 1300 MKD");
    expect(await code(decidePartnerApplication(db, a.id, true))).toBe("NOT_PENDING");
  });
});
