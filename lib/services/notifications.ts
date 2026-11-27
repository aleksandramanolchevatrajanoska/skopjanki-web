import { pricesFor } from "../pricing";
import { formatDateTime } from "../time";
import { payingCounts, type Outbox, type Tx } from "./common";

/** The partner's confirmation: date, time and the list of girls (with price and any debt to collect). */
export async function partnerListMail(tx: Tx, eventId: string, out: Outbox, why: "new" | "locked" | "changed") {
  const e = await tx.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { partner: true, captain: true, reservations: { where: { status: "CONFIRMED" }, include: { user: true } } },
  });
  if (!e.partner?.email || e.kind === "FUSION") return;
  if (e.startsAt < new Date()) return; // an event added afterwards, for the record: nothing to tell the partner
  const c = payingCounts(e, e.reservations);
  const prices =
    e.lockedPriceMember != null && e.lockedPriceNonMember != null
      ? { member: e.lockedPriceMember, nonMember: e.lockedPriceNonMember }
      : pricesFor(e, c.nonMembers, c.members);
  const lines = e.reservations.map((r, i) => {
    const captain = r.userId === e.captainId;
    const price = captain ? "captain, free" : prices ? `${r.isMember ? prices.member : prices.nonMember} MKD` : "";
    return `${i + 1}. ${r.user.name}${r.isMember ? " (member)" : ""} – ${price}`;
  });
  const head =
    why === "new" ? "New Skopjanki term" : why === "locked" ? "Final list (prices are now fixed)" : "Updated list";
  out.push({
    to: e.partner.email,
    subject: `${head}: ${e.title}, ${formatDateTime(e.startsAt, "en")}`,
    text: `${head}\n\n${e.title}\n${formatDateTime(e.startsAt, "en")}\nGirls signed up: ${e.reservations.length} / ${e.maxSpots}\n\n${lines.join("\n") || "(nobody yet)"}\n\nThe girls pay in cash on the spot. The Skopjanki discount applies only to girls on this list.`,
  });
}
