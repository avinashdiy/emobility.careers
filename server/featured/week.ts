/**
 * IST week-boundary helper for the Featured This Week curation.
 * Lives outside the "use server" file so Next.js doesn't try to treat
 * a sync function as a Server Action — that produces a "Server Actions
 * must be async functions" build error.
 *
 * The audience is India-centric, so a "week" rolls over at Monday
 * 00:00 IST rather than UTC midnight.
 */
export function startOfThisWeekIST(): Date {
  const now = new Date();
  // Convert to IST, find Monday 00:00, convert back to UTC.
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0..6 (Sun..Sat)
  const daysSinceMonday = (day + 6) % 7; // Mon = 0
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
}
