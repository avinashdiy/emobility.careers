import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Find an EV mentor on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Mentors",
    title: "Learn from people who've done it.",
    subtitle:
      "Book 1:1 sessions with engineers and leaders across battery, charging, powertrain and software.",
    chips: ["Battery", "Charging", "Powertrain", "Software", "Careers"],
    footerLeft: "Find a mentor · Book a session",
  });
}
