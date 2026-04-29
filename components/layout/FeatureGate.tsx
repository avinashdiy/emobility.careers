import Link from "next/link";
import { getBooleanSetting } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Async wrapper for any route that should be hidden when its feature flag
 * is off. The flag's setting key is supplied as a prop; if the value is not
 * "true" the wrapper renders a friendly "coming soon" page instead of the
 * children. Admins always pass through (handled separately by the layout
 * gate — feature flags are user-facing, not admin-facing).
 *
 * Usage at the top of a page component:
 *
 *   const off = await isFeatureOff("feature.mentorship_enabled");
 *   if (off) return <FeatureOffNotice title="Mentorship" />;
 */

export async function isFeatureOff(key: string): Promise<boolean> {
  return !(await getBooleanSetting(key));
}

export function FeatureOffNotice({ title, body }: { title: string; body?: string }) {
  return (
    <>
      <SiteHeader />
      <main className="container max-w-xl py-20 text-center">
        <Card className="p-10">
          <div className="text-5xl">🚧</div>
          <h1 className="mt-3 text-section text-emce-text md:text-2xl">{title} is paused</h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            {body ?? "This area is temporarily disabled by the platform admin. Other parts of the site are unaffected."}
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Back to home</Link>
          </Button>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
