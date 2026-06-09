import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV innovation challenges on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Challenges",
    title: "Compete. Get noticed. Get hired.",
    subtitle:
      "Innovation challenges and hackathons from EV companies — solve real problems and put your work in front of recruiters.",
    chips: ["Hackathons", "Case challenges", "Prizes", "Recruiter visibility"],
    footerLeft: "Browse challenges · Enter · Win",
  });
}
