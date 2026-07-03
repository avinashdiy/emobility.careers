import { redirect } from "next/navigation";

/**
 * /recruitathon/test with no slug isn't a real test URL — bounce to the
 * candidate's test list instead of rendering the global 404.
 */
export const dynamic = "force-dynamic";

export default function RecruitathonTestIndexPage() {
  redirect("/recruitathon/tests");
}
