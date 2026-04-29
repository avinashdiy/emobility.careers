import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinor } from "@/components/mentorship/PriceLabel";

interface Props {
  c: {
    slug: string;
    title: string;
    tagline: string | null;
    bannerImageUrl: string | null;
    type: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    registrationsCount: number;
    totalPrizePoolMinor: number;
    prizeCurrency: string;
    isFeatured: boolean;
    hostCompany: { name: string; logoUrl: string | null; slug: string };
    _count: { registrations: number; perks: number };
  };
}

export function CompetitionCard({ c }: Props) {
  const now = Date.now();
  const live = c.status === "LIVE" && c.startsAt.getTime() <= now && c.endsAt.getTime() >= now;
  const upcoming = c.status === "LIVE" && c.startsAt.getTime() > now;
  return (
    <Card className="overflow-hidden p-0">
      <Link href={`/competitions/${c.slug}`} className="block">
        <div
          className="aspect-video w-full bg-emce-light-soft bg-cover bg-center"
          style={c.bannerImageUrl ? { backgroundImage: `url(${c.bannerImageUrl})` } : undefined}
        >
          {!c.bannerImageUrl && (
            <div className="grid h-full place-items-center text-3xl">🏆</div>
          )}
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {live && <Badge variant="verified" className="text-[10px]">Live now</Badge>}
            {upcoming && <Badge variant="warning" className="text-[10px]">Upcoming</Badge>}
            {c.status === "RESULTS" && <Badge variant="default" className="text-[10px]">Results</Badge>}
            {c.isFeatured && <Badge variant="warning" className="text-[10px]">Featured</Badge>}
            <Badge variant="outline" className="text-[10px]">{c.type.replace("_", " ")}</Badge>
          </div>
          <h3 className="mt-2 line-clamp-2 text-section font-bold text-emce-text">{c.title}</h3>
          {c.tagline && <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">{c.tagline}</p>}
          <div className="mt-2 flex items-center gap-2 text-xs text-emce-text-sec">
            <span>{c.hostCompany.name}</span>
            <span>·</span>
            <span>{c._count.registrations} registered</span>
            {c.totalPrizePoolMinor > 0 && (
              <>
                <span>·</span>
                <span className="font-bold text-emce-text">
                  {formatMinor(c.totalPrizePoolMinor, c.prizeCurrency)} pool
                </span>
              </>
            )}
            {c._count.perks > 0 && (
              <>
                <span>·</span>
                <span>Internship/job perks</span>
              </>
            )}
          </div>
        </div>
      </Link>
    </Card>
  );
}
