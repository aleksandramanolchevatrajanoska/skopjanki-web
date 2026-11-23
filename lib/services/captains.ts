import { appUrl } from "../email";
import { isMember } from "../membership";
import { formatDateTime } from "../time";
import { AppError, flush, lockEventRow, ownerEmailsFromDb, type Db, type Outbox } from "./common";

/** Only a paying member can apply to be the captain of a weekly / week-4 term. */
export async function applyCaptain(db: Db, userId: string, eventId: string, now = new Date()) {
  const out: Outbox = [];
  await db.$transaction(async (tx) => {
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    if (e.status !== "APPROVED" || e.startsAt <= now) throw new AppError("EVENT_NOT_OPEN");
    if (e.kind !== "WEEKLY" && e.kind !== "SPECIAL") throw new AppError("NO_CAPTAIN_FOR_EVENT");
    if (e.captainId) throw new AppError("CAPTAIN_TAKEN");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!isMember(user, now)) throw new AppError("MEMBERS_ONLY");
    const existing = await tx.captainApplication.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (existing?.status === "PENDING") throw new AppError("ALREADY_APPLIED");
    await tx.captainApplication.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
      update: { status: "PENDING", createdAt: now },
    });
    out.push({
      to: await ownerEmailsFromDb(tx),
      subject: `Captain request: ${e.title}`,
      text: `${user.name} wants to be the captain of "${e.title}" on ${formatDateTime(e.startsAt, "en")}.\nApprove: ${appUrl("/admin")}`,
    });
  });
  await flush(out);
}

export async function decideCaptain(db: Db, applicationId: string, approve: boolean, now = new Date()) {
  const out: Outbox = [];
  await db.$transaction(async (tx) => {
    const app = await tx.captainApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { user: true } });
    await lockEventRow(tx, app.eventId);
    const e = await tx.event.findUniqueOrThrow({ where: { id: app.eventId } });
    if (app.status !== "PENDING") throw new AppError("NOT_PENDING");
    if (!approve) {
      await tx.captainApplication.update({ where: { id: app.id }, data: { status: "REJECTED" } });
      return;
    }
    if (e.captainId) throw new AppError("CAPTAIN_TAKEN");
    if (!isMember(app.user, now)) throw new AppError("CAPTAIN_NOT_MEMBER");
    await tx.captainApplication.update({ where: { id: app.id }, data: { status: "APPROVED" } });
    await tx.event.update({ where: { id: e.id }, data: { captainId: app.userId, captainAlertSentAt: null } });
    // The captain always has a seat, even if the term filled up meanwhile.
    await tx.reservation.upsert({
      where: { eventId_userId: { eventId: e.id, userId: app.userId } },
      create: { eventId: e.id, userId: app.userId, status: "CONFIRMED", isMember: true },
      update: { status: "CONFIRMED", isMember: true, cancelledAt: null, lateCancel: false, offeredUntil: null },
    });
    const others = await tx.captainApplication.findMany({ where: { eventId: e.id, status: "PENDING" }, include: { user: true } });
    await tx.captainApplication.updateMany({ where: { eventId: e.id, status: "PENDING" }, data: { status: "REJECTED" } });
    out.push({
      to: app.user.email,
      subject: `You're the captain: ${e.title}`,
      text: `You're the captain of "${e.title}" on ${formatDateTime(e.startsAt, "en")}. You play free. Welcome the girls, bring a ball if needed and mark who came on the event page:\n${appUrl(`/app/events/${e.id}`)}`,
    });
    if (others.length)
      out.push({ to: others.map((o) => o.user.email), subject: `Captain chosen: ${e.title}`, text: `Thanks for offering to captain "${e.title}". Another member was chosen this time.` });
  });
  await flush(out);
}

export async function removeCaptain(db: Db, eventId: string) {
  await db.event.update({ where: { id: eventId }, data: { captainId: null } });
}
