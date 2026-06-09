import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV community groups on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Community Groups",
    title: "Find your people in EV.",
    subtitle:
      "Domain communities for battery, charging, motors and software — share knowledge and grow together.",
    chips: ["Battery", "Charging", "Motors", "Software"],
    footerLeft: "Join a group · Start a discussion",
  });
}
