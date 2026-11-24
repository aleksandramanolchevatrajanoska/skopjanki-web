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

/* ---------- Notes for the captain and the organiser ---------- */

/** Girls signed up, the captain, the person who proposed it and the organiser can leave a note. */
export async function canWriteNote(db: Db, userId: string, eventId: string) {
  const { actor, e, manager } = await load(db, userId, eventId);
  if (manager || e.createdById === actor.id) return true;
  const r = await db.reservation.findUnique({ where: { eventId_userId: { eventId, userId } } });
  return Boolean(r && r.status !== "CANCELLED");
}

export async function addNote(db: Db, userId: string, eventId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > NOTE_MAX) throw new AppError("BAD_INPUT");
  if (!(await canWriteNote(db, userId, eventId))) throw new AppError("FORBIDDEN");
  return db.eventNote.create({ data: { eventId, userId, body: text } });
}

/** The captain and the organiser see every note; anyone else sees only her own. */
export async function notesFor(db: Db, userId: string, eventId: string) {
  const { manager } = await load(db, userId, eventId);
  return db.eventNote.findMany({
    where: { eventId, ...(manager ? {} : { userId }) },
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
