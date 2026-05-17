import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { AdminShell } from "@/components/layout/admin-shell";
import { EditFairForm } from "@/components/recruitment-drives/EditFairForm";

export const metadata: Metadata = { title: "Edit fair · admin" };
export const dynamic = "force-dynamic";

/**
 * Admin-only page to edit the BASE fields of a recruitment drive —
 * title, tagline, description, venue, dates, banner / hero URLs.
 *
 * The other admin-curated content (tracks, partners, speakers,
 * hero stat targets + pitch blocks, contact + FAQ, banner/hero
 * upload widget, company invites) lives on the parent
 * /admin/fairs/[id] detail page in dedicated editors, so the edit
 * form here stays focused on the always-present base fields.
 */
export default async function EditFairPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      tagline: true,
      description: true,
      city: true,
      state: true,
      country: true,
      venueName: true,
      venueAddress: true,
      venueLat: true,
      venueLng: true,
      startsAt: true,
      endsAt: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      bannerImageUrl: true,
      heroImageUrl: true,
    },
  });
  if (!drive) notFound();

  return (
    <AdminShell>
      <div className="container max-w-3xl space-y-6 py-6 md:py-8">
        <div>
          <Link
            href={`/admin/fairs/${drive.id}`}
            className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
          >
            ← Back to fair detail
          </Link>
          <h1 className="mt-2 text-dashboard text-emce-text">
            Edit base fields · {drive.title}
          </h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Title, dates, venue, description. For tracks, speakers,
            partners, contact, FAQ, or pitch blocks — use the dedicated
            editors on the{" "}
            <Link
              href={`/admin/fairs/${drive.id}`}
              className="font-bold text-emce-dark hover:underline"
            >
              detail page
            </Link>
            .
          </p>
        </div>

        <Card className="p-5 md:p-6">
          <EditFairForm
            initial={{
              driveId: drive.id,
              title: drive.title,
              tagline: drive.tagline,
              description: drive.description,
              city: drive.city,
              state: drive.state,
              country: drive.country,
              venueName: drive.venueName,
              venueAddress: drive.venueAddress,
              venueLat: drive.venueLat ? drive.venueLat.toString() : null,
              venueLng: drive.venueLng ? drive.venueLng.toString() : null,
              // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm`
              // without timezone — slice off the seconds + Z. Storing
              // continues to use the original Date (server-side parses
              // back into a real Date via z.coerce.date()).
              startsAt: drive.startsAt.toISOString().slice(0, 16),
              endsAt: drive.endsAt.toISOString().slice(0, 16),
              registrationOpensAt: drive.registrationOpensAt
                ? drive.registrationOpensAt.toISOString().slice(0, 16)
                : null,
              registrationClosesAt: drive.registrationClosesAt
                ? drive.registrationClosesAt.toISOString().slice(0, 16)
                : null,
              bannerImageUrl: drive.bannerImageUrl,
              heroImageUrl: drive.heroImageUrl,
            }}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
