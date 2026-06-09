import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "EV companies hiring on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "EV Companies",
    title: "The companies building electric mobility.",
    subtitle:
      "From global OEMs and battery makers to charging networks and EV startups — see who's hiring.",
    chips: ["OEMs", "Battery", "Charging networks", "Startups", "Fleets"],
    footerLeft: "Explore companies · See open roles",
  });
}
