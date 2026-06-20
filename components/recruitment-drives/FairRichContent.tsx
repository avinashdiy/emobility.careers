import { Card } from "@/components/ui/card";

/**
 * Structured "brochure" content for a recruitment drive, rendered as
 * designed sections instead of a wall of prose inside the description.
 * Driven by RecruitmentDrive.richContent (Json) — see the schema note.
 * Every block is independently optional, so partially-filled fairs only
 * render what they have. Styling mirrors the rest of the fair page
 * (eyebrow labels, Cards, chips, oversized numerals).
 */

export interface FairTalentSegment {
  count: string;
  label: string;
  detail?: string;
}
export interface FairRole {
  role: string;
  qualification: string;
  ctc: string;
  count: string;
}
export interface FairAgendaDay {
  title: string;
  tag?: string;
  items: string[];
}
export interface FairRichContentData {
  talentPool?: FairTalentSegment[];
  talentPoolIntro?: string;
  roles?: FairRole[];
  agenda?: { day1?: FairAgendaDay; day2?: FairAgendaDay };
  partners?: { confirmed?: string[]; expected?: string[]; note?: string };
  whyHost?: { title?: string; blurb?: string; stats?: string[] };
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">{children}</p>
);

export function FairRichContent({ data }: { data: FairRichContentData | null | undefined }) {
  if (!data) return null;
  const { talentPool, talentPoolIntro, roles, agenda, partners, whyHost } = data;
  const agendaDays = [agenda?.day1, agenda?.day2].filter(Boolean) as FairAgendaDay[];
  const hasPartners = (partners?.confirmed?.length ?? 0) + (partners?.expected?.length ?? 0) > 0;

  return (
    <>
      {/* Talent pool — who you'll meet */}
      {talentPool && talentPool.length > 0 && (
        <section>
          <Eyebrow>Who you&apos;ll meet</Eyebrow>
          <h2 className="mt-1 text-section text-emce-text">The talent pool</h2>
          {talentPoolIntro && (
            <p className="mt-1 max-w-2xl text-hint text-emce-text-sec">{talentPoolIntro}</p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {talentPool.map((t, i) => (
              <Card key={i} className="h-full">
                <p className="text-3xl font-extrabold leading-none text-emce-dark">{t.count}</p>
                <p className="mt-2 font-bold text-emce-text">{t.label}</p>
                {t.detail && <p className="mt-1 text-hint text-emce-text-sec">{t.detail}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Roles you can hire for — table */}
      {roles && roles.length > 0 && (
        <section>
          <Eyebrow>For hiring partners</Eyebrow>
          <h2 className="mt-1 text-section text-emce-text">Roles you can hire for</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-emce-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-emce-light-soft">
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-emce-text-sec">
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Qualification</th>
                    <th className="px-4 py-3">Expected CTC</th>
                    <th className="px-4 py-3 text-right">Candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emce-border">
                  {roles.map((r, i) => (
                    <tr key={i} className="align-top transition-colors hover:bg-emce-light-soft/40">
                      <td className="px-4 py-3 font-semibold text-emce-text">{r.role}</td>
                      <td className="px-4 py-3 text-emce-text-sec">{r.qualification}</td>
                      <td className="px-4 py-3 font-semibold text-emce-mid-muted">{r.ctc}</td>
                      <td className="px-4 py-3 text-right font-extrabold text-emce-text">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 2-day agenda — two columns */}
      {agendaDays.length > 0 && (
        <section>
          <Eyebrow>Event format</Eyebrow>
          <h2 className="mt-1 text-section text-emce-text">The 2-day agenda</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {agendaDays.map((d, i) => (
              <Card key={i} className="h-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold text-emce-text">{d.title}</h3>
                  {d.tag && (
                    <span className="rounded-full bg-emce-light-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emce-dark">
                      {d.tag}
                    </span>
                  )}
                </div>
                <ul className="mt-3 space-y-2">
                  {d.items.map((it, j) => (
                    <li key={j} className="flex gap-2.5 text-sm text-emce-text-sec">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emce-mid" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Hiring partners on board — chips */}
      {hasPartners && (
        <section>
          <Eyebrow>On board</Eyebrow>
          <h2 className="mt-1 text-section text-emce-text">Hiring partners</h2>
          {partners?.confirmed && partners.confirmed.length > 0 && (
            <div className="mt-3">
              <p className="text-hint font-bold text-emce-text-sec">Confirmed</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {partners.confirmed.map((c) => (
                  <span key={c} className="rounded-full bg-emce-dark px-3 py-1 text-xs font-bold text-emce-light">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {partners?.expected && partners.expected.length > 0 && (
            <div className="mt-4">
              <p className="text-hint font-bold text-emce-text-sec">Confirmation in progress</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {partners.expected.map((c) => (
                  <span key={c} className="rounded-full border border-emce-border bg-white px-3 py-1 text-xs font-semibold text-emce-text-sec">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {partners?.note && <p className="mt-3 text-hint text-emce-text-muted">{partners.note}</p>}
        </section>
      )}

      {/* Why host / why DIYguru — dark callout band */}
      {whyHost && (whyHost.blurb || (whyHost.stats?.length ?? 0) > 0) && (
        <section className="relative left-1/2 w-screen -translate-x-1/2 bg-emce-darkest py-14 text-white md:py-16">
          <div className="container mx-auto max-w-4xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid">
              {whyHost.title ?? "Why DIYguru"}
            </p>
            {whyHost.blurb && (
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/85 md:text-lg">
                {whyHost.blurb}
              </p>
            )}
            {whyHost.stats && whyHost.stats.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {whyHost.stats.map((s) => (
                  <span key={s} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
