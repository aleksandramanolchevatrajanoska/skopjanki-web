import { requireOwner } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <>
      <nav className="row" aria-label="Admin" style={{ marginBottom: 20 }}>
        <a className="btn sm ghost" href="/admin">Approvals</a>
        <a className="btn sm ghost" href="/admin/events">Events</a>
        <a className="btn sm ghost" href="/admin/girls">Girls</a>
        <a className="btn sm ghost" href="/admin/partners">Partners</a>
      </nav>
      {children}
    </>
  );
}
