import { appUrl } from "../email";
import { AppError, flush, type Db } from "./common";

export const NOTE_MAX = 1000;

async function load(db: Db, actorId: string, eventId: string) {
  const [actor, e] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.event.findUnique({ where: { id: eventId } }),
  ]);
  if (!e) throw new AppError("NOT_FOUND");
  return { actor, e, manager: actor.isOwner || e.captainId === actorId };
}

/* ---------- Girls added by hand ---------- */

export async function addGuest(db: Db, actorId: string, eventId: string, input: { name: string; phone?: string; isMember?: boolean }) {
  const { manager } = await load(db, actorId, eventId);
  if (!manager) throw new AppError("FORBIDDEN");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new AppError("BAD_INPUT");
  return db.eventGuest.create({
    data: { eventId, name, phone: input.phone?.trim().slice(0, 40) || null, isMember: Boolean(input.isMember), addedById: actorId },
  });
}

export async function removeGuest(db: Db, actorId: string, guestId: string) {
  const g = await db.eventGuest.findUnique({ where: { id: guestId } });
  if (!g) throw new AppError("NOT_FOUND");
  const { manager } = await load(db, actorId, g.eventId);
  if (!manager) throw new AppError("FORBIDDEN");
  await db.eventGuest.delete({ where: { id: guestId } });
}

/* ---------- Event chat ---------- */

/** Girls signed up, the captain, the person who proposed it and the organiser can leave a note. */
export async function canWriteNote(db: Db, userId: string, eventId: string) {
  const { actor, e, manager } = await load(db, userId, eventId);
  if (manager || e.createdById === actor.id) return true;
  const r = await db.reservation.findUnique({ where: { eventId_userId: { eventId, userId } } });
  return Boolean(r && r.status !== "CANCELLED");
}

/** A message in the event chat, or a reply to one. A reply to a reply joins the same thread. */
export async function addNote(db: Db, userId: string, eventId: string, body: string, replyTo?: string | null) {
  const text = body.trim();
  if (!text || text.length > NOTE_MAX) throw new AppError("BAD_INPUT");
  if (!(await canWriteNote(db, userId, eventId))) throw new AppError("FORBIDDEN");
  let parentId: string | null = null;
  if (replyTo) {
    const parent = await db.eventNote.findUnique({ where: { id: replyTo } });
    if (!parent || parent.eventId !== eventId) throw new AppError("NOT_FOUND");
    parentId = parent.parentId ?? parent.id;
  }
  const note = await db.eventNote.create({ data: { eventId, userId, body: text, parentId } });
  await alertCaptain(db, eventId, userId);
  return note;
}

export const CHAT_ALERT_EVERY_MS = 60 * 60 * 1000;

/**
 * Tells the captain there are new messages in her event's chat: at most one email an hour per
 * event, with a link; she opens the chat and reads the whole thread there.
 */
async function alertCaptain(db: Db, eventId: string, authorId: string, now = new Date()) {
  const e = await db.event.findUnique({ where: { id: eventId }, include: { captain: true } });
  if (!e?.captain || e.captainId === authorId) return;
  if (e.chatAlertAt && now.getTime() - e.chatAlertAt.getTime() < CHAT_ALERT_EVERY_MS) return;
  await db.event.update({ where: { id: eventId }, data: { chatAlertAt: now } });
  const mk = e.captain.locale !== "en";
  await flush([{
    to: e.captain.email,
    subject: mk ? `Нова порака во чатот: ${e.title}` : `New message in the chat: ${e.title}`,
    text: mk
      ? `Здраво ${e.captain.name}! Има нова порака во чатот за „${e.title}“. Отвори го чатот и прочитај ја нишката:\n${appUrl(`/app/events/${e.id}#notes`)}\n\n(Ти праќаме најмногу еден мејл на час за овој чат.)`
      : `Hi ${e.captain.name}! There is a new message in the chat for "${e.title}". Open the chat to read the thread:\n${appUrl(`/app/events/${e.id}#notes`)}\n\n(You get at most one email an hour about this chat.)`,
  }]);
}

/** The event chat: everyone who may write in it (girls signed up, the captain, the organiser) reads all of it. */
export async function notesFor(db: Db, userId: string, eventId: string) {
  if (!(await canWriteNote(db, userId, eventId))) return [];
  return db.eventNote.findMany({
    where: { eventId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteNote(db: Db, userId: string, noteId: string) {
  const n = await db.eventNote.findUnique({ where: { id: noteId } });
  if (!n) throw new AppError("NOT_FOUND");
  const actor = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (n.userId !== userId && !actor.isOwner) throw new AppError("FORBIDDEN");
  await db.eventNote.delete({ where: { id: noteId } });
}

/* ---------- Participants, managed by the captain or the organiser ---------- */

/** Adds a girl from the club to the event, even when it is full: the captain or the organiser decides. */
export async function addParticipant(db: Db, actorId: string, eventId: string, userId: string, now = new Date()) {
  const { manager } = await load(db, actorId, eventId);
  if (!manager) throw new AppError("FORBIDDEN");
  const girl = await db.user.findUnique({ where: { id: userId } });
  if (!girl || girl.status !== "APPROVED") throw new AppError("NOT_FOUND");
  const member = girl.isOwner || (girl.memberUntil != null && girl.memberUntil > now);
  return db.reservation.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, status: "CONFIRMED", isMember: member },
    update: { status: "CONFIRMED", isMember: member, cancelledAt: null, lateCancel: false, offeredUntil: null, holdUntil: null },
  });
}

/** Takes a girl off the event without any debt. The captain herself stays. */
export async function removeParticipant(db: Db, actorId: string, eventId: string, userId: string, now = new Date()) {
  const { manager, e } = await load(db, actorId, eventId);
  if (!manager) throw new AppError("FORBIDDEN");
  if (userId === e.captainId) throw new AppError("BAD_INPUT");
  await db.$transaction([
    db.reservation.updateMany({ where: { eventId, userId }, data: { status: "CANCELLED", cancelledAt: now, lateCancel: false } }),
    db.debt.deleteMany({ where: { eventId, userId, paidAt: null } }),
  ]);
}
