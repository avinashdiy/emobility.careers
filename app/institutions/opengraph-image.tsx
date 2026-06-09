import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV colleges and institutions on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Institutions",
    title: "Colleges powering the EV workforce.",
    subtitle:
      "Universities, polytechnics and ITIs training the next generation of EV engineers and technicians.",
    chips: ["Universities", "Polytechnics", "ITIs", "Placement cells"],
    footerLeft: "Explore institutions · List your college",
  });
}
