// lib/ev-jobs-week — the "EV jobs this week" list on /jobs/this-week: openings at Indian EV
// employers, each checked on the employer's own careers site / ATS on `verifiedOn` and linked
// there (we never copy listings from LinkedIn / Naukri). The list is a JSON file read at request
// time, so the weekly refresh is a file upload, not a rebuild:
//   data/ev-jobs-week.json in the app directory (pm2 cwd), or EV_JOBS_WEEK_FILE.
// Entries older than MAX_AGE_DAYS since verification drop off automatically.


import { readFile } from "node:fs/promises";
import path from "node:path";

export type EvTrack = "technician" | "battery" | "embedded" | "charging" | "design" | "business";

export interface WeeklyJob {
  title: string;
  company: string;
  companyWebsite?: string | null;
  location: string;
  type: "Full-time" | "Internship" | "Contract";
  level: "Entry" | "Mid" | "Senior";
  track: EvTrack;
  applyUrl: string;
  postedOn?: string | null;
  verifiedOn: string;
  experience?: string | null;
}

export interface WeeklyJobsFile {
  edition: string; // "Week of 10 Nov 2026"
  updatedOn: string; // ISO date
  jobs: WeeklyJob[];
}

export const TRACK_LABEL: Record<EvTrack, string> = {
  technician: "EV service & technicians",
  battery: "Battery, cells & BMS",
  embedded: "Embedded, software & ADAS",
  charging: "Charging & swapping",
  design: "Vehicle design, powertrain & testing",
  business: "Sales, fleet & business",
};

export const MAX_AGE_DAYS = 21;

const isHttp = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u);

export async function loadWeeklyJobs(now: Date = new Date()): Promise<WeeklyJobsFile | null> {
  const file = process.env.EV_JOBS_WEEK_FILE || path.join(process.cwd(), "data", "ev-jobs-week.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as WeeklyJobsFile;
    const cutoff = now.getTime() - MAX_AGE_DAYS * 86_400_000;
    const jobs = (parsed.jobs ?? []).filter(
      (j) => j && j.title && j.company && isHttp(j.applyUrl) && TRACK_LABEL[j.track] && Date.parse(j.verifiedOn) >= cutoff,
    );
    return { edition: parsed.edition, updatedOn: parsed.updatedOn, jobs };
  } catch {
    return null;
  }
}
