import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT, LEVELS, SPORTS, TOPICS } from "@/lib/i18n";
import { topicLabel } from "@/components/Topics";
import { isMember } from "@/lib/membership";
import { matchesCommunityFilter } from "@/lib/services/club";

export default async function Community({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const sport = SPORTS.includes(sp.sport ?? "") ? sp.sport : undefined;
  const level = LEVELS.includes(sp.level ?? "") ? sp.level : undefined;
  const topic = TOPICS.includes(sp.topic ?? "") ? sp.topic : undefined;
  const girls = await prisma.user.findMany({
    where: { status: "APPROVED", OR: [{ showInCommunity: true }, { id: user.id }] },
    select: { id: true, name: true, bio: true, about: true, topics: true, instagram: true, levels: true, isOwner: true, memberUntil: true },
    orderBy: { name: "asc" },
  });
  const shown = girls.filter(
    (g) => matchesCommunityFilter((g.levels ?? {}) as Record<string, string>, sport, level) && (!topic || g.topics.includes(topic)),
  );
  return (
    <>
      <h1>{t.community}</h1>
      <p className="meta">{t.communityIntro}</p>
      <form className="filters" role="search" aria-label={t.filter}>
        <select name="sport" defaultValue={sport ?? ""} aria-label={t.sport}>
          <option value="">{t.allSports}</option>
          {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="level" defaultValue={level ?? ""} aria-label={t.level}>
          <option value="">{t.allLevels}</option>
          {LEVELS.map((l) => <option key={l} value={l}>{t.levels[l]}</option>)}
        </select>
        <select name="topic" defaultValue={topic ?? ""} aria-label={t.myTopics}>
          <option value="">{t.topicFilter}</option>
          {TOPICS.map((k) => <option key={k} value={k}>{t.topicNames[k]}</option>)}
        </select>
        <button className="btn sm" type="submit">{t.filter}</button>
        {(sport || level || topic) && <a className="btn sm ghost" href="/app/community">{t.clear}</a>}
      </form>
      <p className="meta" style={{ marginTop: 12 }}>{shown.length}</p>
      <div className="grid">
        {shown.map((g) => {
          const lv = Object.entries((g.levels ?? {}) as Record<string, string>);
          return (
            <div className="card" key={g.id}>
              <div className="between">
                <h3>{g.name}{g.id === user.id && <span className="meta"> ({t.you})</span>}</h3>
                {isMember(g) && <span className="tag p" title={t.member}>♛</span>}
              </div>
              {g.bio && <p><strong>{g.bio}</strong></p>}
              {g.about && <p style={{ whiteSpace: "pre-line" }}>{g.about}</p>}
              {g.topics.length > 0 && (
                <p className="row" style={{ marginTop: 8 }}>
                  {g.topics.map((k) => <span key={k} className={`tag ${k === topic ? "p" : ""}`}>{topicLabel(k, locale)}</span>)}
                </p>
              )}
              {lv.length > 0 && (
                <p className="row" style={{ marginTop: 8 }}>
                  {lv.map(([s, l]) => <span key={s} className={`tag ${s === sport ? "p" : "c"}`}>{s} · {t.levels[l] ?? l}</span>)}
                </p>
              )}
              {g.instagram && <p style={{ marginTop: 6 }}><a href={`https://instagram.com/${g.instagram}`} target="_blank" rel="noopener noreferrer">@{g.instagram}</a></p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
