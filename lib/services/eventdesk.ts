import { AppError, type Db } from "./common";

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
  return db.eventNote.create({ data: { eventId, userId, body: text, parentId } });
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
