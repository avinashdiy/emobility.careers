import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Download, AlertTriangle } from "lucide-react";
import { softDeleteAccount } from "@/server/account/data-rights";

export const metadata = { title: "Account & data rights" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/account");

  return (
    <>
      <SiteHeader />
      <div className="container max-w-2xl py-10">
        <h1 className="text-dashboard text-emce-text">Account &amp; data rights</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Your DPDPA / GDPR rights — download a copy of your data, or close
          your account and erase your record.
        </p>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Download my data</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            One JSON file containing every row we have on you: profile,
            applications, posts, comments, reactions, sent messages, saved
            jobs, alerts, and your audit trail. Counter-party data
            (recruiter notes / ratings on your applications) is stripped —
            that's the recruiter's record, not yours.
          </p>
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <a href="/api/account/export" download>
                <Download className="mr-1 h-4 w-4" aria-hidden /> Download JSON
              </a>
            </Button>
          </div>
        </Card>

        <Card className="mt-4 border-emce-red bg-emce-red-light/30 p-5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-emce-red" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-section text-emce-red">Close my account</h2>
              <p className="mt-1 text-sm text-emce-text-sec">
                Closes your account and immediately scrubs your name, photo,
                and contact info from every public surface. Your posts +
                profile become PRIVATE so nobody else can see them. After
                30 days the remaining records are permanently deleted. You
                have those 30 days to email{" "}
                <strong>support@emobility.careers</strong> if you change your
                mind.
              </p>
              <form action={softDeleteAccount} className="mt-3 space-y-2">
                <Textarea
                  name="reason"
                  rows={2}
                  placeholder="Optional — anything we could've done better?"
                  maxLength={500}
                  aria-label="Reason for closing account"
                />
                <ConfirmSubmit
                  variant="destructive"
                  size="sm"
                  confirm="Close your account? Your name + photo are scrubbed immediately, your data deletes permanently after 30 days. This is reversible by emailing support."
                >
                  Close my account
                </ConfirmSubmit>
              </form>
            </div>
          </div>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
