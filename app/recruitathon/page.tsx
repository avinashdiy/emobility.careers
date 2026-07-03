import { redirect } from "next/navigation";

/**
 * Bare /recruitathon has no page of its own. Rather than 404 a student who
 * types or shares the short URL, send them to the canonical entry point,
 * which self-heals (routes unauth → sign-up, profile-less → onboarding).
 */
export const dynamic = "force-dynamic";

export default function RecruitathonIndexPage() {
  redirect("/recruitathon/onboarding");
}
