import type { CompassResult } from "@/lib/skill-compass";

/**
 * Pokémon-stat-card-style EV Skill Compass. Designed to be screenshotted
 * and posted to LinkedIn / X / WhatsApp — the visual hierarchy is:
 *
 *   1. Big candidate identity at top (name + headline + DIYguru chip)
 *   2. Six radial bars, one per EV domain, sized by level
 *   3. "Archetype" tag (Polymath / Specialist / Generalist)
 *   4. Overall number out of 10 (top-3 domain average)
 *   5. Tiny attribution at the bottom — "emobility.careers/{slug}/compass"
 *
 * The card is rendered as plain HTML (no external chart deps) so it
 * works inside server components AND inside `next/og` ImageResponse
 * unchanged. Sizing prop lets a parent shrink it for thumbnails.
 */
export function SkillCompassCard({
  result,
  candidate,
  size = "lg",
}: {
  result: CompassResult;
  candidate: {
    name: string;
    headline: string | null;
    avatarUrl: string | null;
    slug: string;
    isDIYguruVerified: boolean;
  };
  /** "lg" = 600x600 hero card, "sm" = 320x320 thumbnail. */
  size?: "lg" | "sm";
}) {
  const dim = size === "lg" ? "w-[600px] h-[600px]" : "w-[320px] h-[320px]";
  const headlineSize = size === "lg" ? "text-2xl" : "text-base";
  const numSize = size === "lg" ? "text-7xl" : "text-4xl";

  const archetypeTone =
    result.archetype === "Polymath" ? "bg-emce-mid text-emce-darkest"
    : result.archetype === "Specialist" ? "bg-emce-orange text-white"
    : "bg-emce-light text-emce-darkest";

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-emce-darkest via-emce-dark to-[#3d5e58] p-6 text-white shadow-emce-modal ${dim}`}
    >
      {/* Top: identity */}
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-emce-mid text-xl font-extrabold text-emce-darkest ring-2 ring-white">
          {candidate.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={candidate.avatarUrl} alt={candidate.name} className="h-full w-full object-cover" />
          ) : (
            candidate.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold leading-tight ${headlineSize}`}>{candidate.name}</p>
          {candidate.headline && (
            <p className="line-clamp-1 text-sm text-white/75">{candidate.headline}</p>
          )}
        </div>
        {candidate.isDIYguruVerified && (
          <span className="rounded-full bg-emce-mid px-2 py-0.5 text-[10px] font-bold text-emce-darkest">
            ⭐ DIYguru
          </span>
        )}
      </div>

      {/* Centre: overall number + archetype */}
      <div className="mt-3 flex items-baseline gap-3">
        <div className="flex items-baseline">
          <span className={`font-extrabold leading-none text-emce-mid ${numSize}`}>
            {result.overall.toFixed(1)}
          </span>
          <span className="ml-1 text-lg font-bold text-white/60">/10</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${archetypeTone}`}>
          {result.archetype}
        </span>
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-widest text-white/55">
        EV Skill Compass · top-3 domain average
      </p>

      {/* Six domains: each is a row with emoji, name, level number, and a 0..10 bar */}
      <div className="mt-5 flex-1 space-y-2.5">
        {result.domains.map((d) => {
          const pct = (d.raw / 10) * 100;
          return (
            <div key={d.slug} className="flex items-center gap-3">
              <span className="w-7 flex-shrink-0 text-center text-lg" aria-hidden>
                {d.emoji}
              </span>
              <span className="w-24 flex-shrink-0 text-sm font-bold">{d.name}</span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emce-mid"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right font-extrabold tabular-nums">
                {d.level}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: shareable URL */}
      <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-3 text-[11px] text-white/65">
        <span className="font-bold tracking-wide">
          emobility.careers/<span className="text-emce-mid">{candidate.slug}</span>/compass
        </span>
        <span className="font-extrabold uppercase tracking-widest text-emce-mid">
          ⚡ EV Compass
        </span>
      </div>
    </div>
  );
}
