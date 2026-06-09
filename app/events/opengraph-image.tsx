import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV industry events on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Events",
    title: "Where the EV industry meets.",
    subtitle:
      "Webinars, workshops, summits and meetups across the electric mobility ecosystem.",
    chips: ["Webinars", "Workshops", "Summits", "Meetups"],
    footerLeft: "Browse events · Register · Attend",
  });
}
