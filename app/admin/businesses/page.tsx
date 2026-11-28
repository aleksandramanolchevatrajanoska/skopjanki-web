import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { str } from "@/lib/act";
import { decideBusiness, removeBusiness } from "@/lib/services/businesses";

async function decide(form: FormData) {
  "use server";
  await requireOwner();
  await decideBusiness(prisma, str(form.get("id")), form.get("approve") === "1");
  revalidatePath("/admin/businesses");
}

async function remove(form: FormData) {
  "use server";
  const owner = await requireOwner();
  await removeBusiness(prisma, owner.id, str(form.get("id")));
  revalidatePath("/admin/businesses");
}

export default async function BusinessesAdmin() {
  const list = await prisma.memberBusiness.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
  });
  return (
    <>
      <h1>Member businesses</h1>
      <p className="meta">Paying members list their businesses at /app/biznisi. Approve them to show them to the girls.</p>
      {list.length === 0 && <p className="meta" style={{ marginTop: 16 }}>Nothing yet.</p>}
      <div className="stack" style={{ marginTop: 16 }}>
        {list.map((b) => (
          <div className="card" key={b.id}>
            <div className="between">
              <div>
                <h3>{b.name} <span className="tag">{b.status.toLowerCase()}</span></h3>
                <p className="meta">{b.category} · {b.user.name} ({b.user.email})</p>
              </div>
              <div className="row">
                {b.status !== "APPROVED" && <form action={decide}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="approve" value="1" /><button className="btn sm pink" type="submit">Approve</button></form>}
                {b.status === "PENDING" && <form action={decide}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="approve" value="0" /><button className="btn sm ghost" type="submit">Decline</button></form>}
                {b.status === "APPROVED" && <form action={decide}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="approve" value="0" /><button className="btn sm ghost" type="submit">Hide</button></form>}
                <a className="btn sm ghost" href={`/app/biznisi/${b.id}`}>Page</a>
                <a className="btn sm ghost" href={`/app/biznisi/${b.id}/uredi`}>Edit</a>
                <form action={remove}><input type="hidden" name="id" value={b.id} /><button className="btn sm ghost" type="submit">Delete</button></form>
              </div>
            </div>
            {b.description && <p>{b.description}</p>}
            <p className="meta">{[b.offer && `For members: ${b.offer}`, b.instagram && `@${b.instagram}`, b.website, b.contact].filter(Boolean).join(" · ")}</p>
          </div>
        ))}
      </div>
    </>
  );
}
