import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export default async function Waiting() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.status === "APPROVED") redirect("/app");
  const { t } = await getT(user.locale);
  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }} className="card tilt">
      <h1>{t.waitingTitle}</h1>
      <p>{user.status === "REJECTED" ? t.rejectedText : t.waitingText}</p>
    </div>
  );
}
