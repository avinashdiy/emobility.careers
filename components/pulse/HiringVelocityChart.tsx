import { Card } from "@/components/ui/card";
import type { VelocitySummary } from "@/lib/pulse";

/**
 * 30-day hiring-velocity sparkline. Pure server component, no chart
 * library — we build the SVG path by hand because the data is small
 * (30 points) and the visual is simple (one line + one fill). Saves
 * a 50KB dep and keeps Pulse's first-paint snappy.
 *
 * Two metrics on the same axis:
 *   • Jobs published per day (primary line, brand colour)
 *   • Hires per day (secondary line, accent colour)
 *
 * Side-by-side WoW deltas show the directional trend in plain language
 * — the chart is the eye-candy, the numbers are the source of truth.
 */

const WIDTH = 600;
const HEIGHT = 120;
const PAD_X = 8;
const PAD_Y = 12;

function buildPolyline(values: number[], maxY: number, color: string, fill: boolean): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const stepX = (WIDTH - 2 * PAD_X) / Math.max(1, values.length - 1);
  const usableH = HEIGHT - 2 * PAD_Y;
  const points = values.map((v, i) => {
    const x = PAD_X + i * stepX;
    const y = HEIGHT - PAD_Y - (maxY > 0 ? (v / maxY) * usableH : 0);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = points.join(" ");
  const area = `${PAD_X},${HEIGHT - PAD_Y} ${line} ${PAD_X + (values.length - 1) * stepX},${HEIGHT - PAD_Y}`;
  return { line, area };
}

function pctChange(curr: number, prev: number): { pct: number; sign: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { pct: 0, sign: "flat" };
  if (prev === 0) return { pct: 100, sign: "up" };
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return { pct: 0, sign: "flat" };
  return { pct: Math.abs(pct), sign: pct > 0 ? "up" : "down" };
}

export function HiringVelocityChart({ data }: { data: VelocitySummary }) {
  const jobsValues = data.points.map((p) => p.jobsNew);
  const hiresValues = data.points.map((p) => p.hires);
  // Shared Y-axis so the two lines stay comparable (jobs/day usually
  // dwarfs hires/day, which is the point — visualises the bottleneck).
  const maxY = Math.max(1, ...jobsValues, ...hiresValues);

  const jobs = buildPolyline(jobsValues, maxY, "#374a47", true);
  const hires = buildPolyline(hiresValues, maxY, "#ff8b3d", false);

  const jobsDelta = pctChange(data.thisWeekJobs, data.prevWeekJobs);
  const hiresDelta = pctChange(data.thisWeekHires, data.prevWeekHires);

  // Pick representative date labels — first, middle, last — so the
  // axis carries enough context without a full tick array.
  const firstLabel = data.points[0]?.date ?? "";
  const lastLabel = data.points[data.points.length - 1]?.date ?? "";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Hiring velocity · 30 days
          </p>
          <h3 className="mt-1 text-section text-emce-text">
            How busy is the EV job market this month?
          </h3>
        </div>
        <div className="flex gap-4 text-sm">
          <DeltaBlock
            label="Jobs · last 7d"
            value={data.thisWeekJobs}
            delta={jobsDelta}
            colorClass="text-emce-darkest"
            dotClass="bg-emce-darkest"
          />
          <DeltaBlock
            label="Hires · last 7d"
            value={data.thisWeekHires}
            delta={hiresDelta}
            colorClass="text-emce-orange-deep"
            dotClass="bg-emce-orange"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-32 w-full min-w-[400px]"
          role="img"
          aria-label="Daily hiring activity over the last 30 days"
        >
          {/* Subtle background grid — three horizontal lines at 0, mid,
              max so users can sanity-check magnitude without numbers. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={PAD_Y + (HEIGHT - 2 * PAD_Y) * (1 - f)}
              y2={PAD_Y + (HEIGHT - 2 * PAD_Y) * (1 - f)}
              stroke="#d4e8d8"
              strokeDasharray="2 4"
              strokeWidth={1}
            />
          ))}
          {/* Jobs filled area + line */}
          <polygon points={jobs.area} fill="#374a47" fillOpacity="0.12" />
          <polyline
            points={jobs.line}
            fill="none"
            stroke="#374a47"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Hires line — no fill so it's distinct from jobs */}
          <polyline
            points={hires.line}
            fill="none"
            stroke="#ff8b3d"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray="2 3"
          />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-hint text-emce-text-muted">
        <span>{firstLabel}</span>
        <span>Max {maxY}/day</span>
        <span>{lastLabel}</span>
      </div>
    </Card>
  );
}

function DeltaBlock({
  label,
  value,
  delta,
  colorClass,
  dotClass,
}: {
  label: string;
  value: number;
  delta: { pct: number; sign: "up" | "down" | "flat" };
  colorClass: string;
  dotClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        <span className="text-hint text-emce-text-muted">{label}</span>
      </div>
      <div className={`mt-0.5 text-xl font-extrabold ${colorClass}`}>{value}</div>
      <div
        className={`text-hint font-bold ${
          delta.sign === "up"
            ? "text-emce-darkest"
            : delta.sign === "down"
              ? "text-emce-red-deep"
              : "text-emce-text-muted"
        }`}
      >
        {delta.sign === "up" ? "↑" : delta.sign === "down" ? "↓" : "—"} {delta.pct}% WoW
      </div>
    </div>
  );
}
