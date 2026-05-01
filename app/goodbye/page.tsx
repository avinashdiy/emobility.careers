import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata = {
  title: "Account closed",
  robots: { index: false, follow: false },
};

export default function GoodbyePage() {
  return (
    <>
      <SiteHeader />
      <div className="container max-w-xl py-16 text-center">
        <Card className="p-8">
          <h1 className="text-dashboard text-emce-text">Your account is closed</h1>
          <p className="mt-3 text-sm text-emce-text-sec">
            We've scrubbed your name, photo, and contact details from every
            public surface. Posts and profile are now private. After 30 days
            we permanently delete the remaining records.
          </p>
          <p className="mt-3 text-sm text-emce-text-sec">
            Changed your mind? Email <strong>support@emobility.careers</strong>{" "}
            within 30 days and we'll restore.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
