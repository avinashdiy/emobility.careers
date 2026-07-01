/**
 * Shared constants for the Recruitathon proctored exam. Kept out of the
 * "use server" actions file (which may only export async functions) so
 * both the server actions and the client runner / take page can import
 * them.
 */

/** Integrity flags that trip an automatic termination (detect → warn → cancel). */
export const PROCTOR_FLAG_LIMIT = 6;

/** Grace window (ms) past the hard deadline before the server refuses
 *  late writes — absorbs clock skew + in-flight requests. */
export const DEADLINE_GRACE_MS = 15_000;

/** Max JDs a candidate can pick to be tested on. */
export const MAX_JD_SELECTIONS = 3;
