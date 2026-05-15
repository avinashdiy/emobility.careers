"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { submitMentorKyc, setMentorPublished } from "@/server/mentorship/actions";

interface Props {
  kycStatus: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  isPublished: boolean;
  rejectionNote?: string | null;
  hasProfile: boolean;
}

const STATUS_BADGE: Record<Props["kycStatus"], { label: string; tone: "default" | "warning" | "verified" | "outline" }> = {
  DRAFT: { label: "Not submitted", tone: "outline" },
  PENDING: { label: "Under review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "verified" },
  REJECTED: { label: "Changes requested", tone: "warning" },
};

export function MentorKycPanel(props: Props) {
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[props.kycStatus];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section text-emce-text">KYC & publishing</h2>
        <Badge variant={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="mt-2 text-sm text-emce-text-sec">
        We verify each mentor before they go live. Save a complete profile, then submit for review. Approval typically takes 1–2 business days.
      </p>

      {props.kycStatus === "REJECTED" && props.rejectionNote && (
        <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          <strong>Reviewer note:</strong> {props.rejectionNote}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(props.kycStatus === "DRAFT" || props.kycStatus === "REJECTED") && (
          <Button
            variant="accent"
            disabled={pending || !props.hasProfile}
            onClick={() => {
              startTransition(async () => {
                const r = await submitMentorKyc();
                r.ok ? toast.success(r.message ?? "Submitted.") : toast.error(r.message ?? "Failed.");
              });
            }}
          >
            {props.kycStatus === "REJECTED" ? "Resubmit for review" : "Submit for review"}
          </Button>
        )}
        {props.kycStatus === "APPROVED" && (
          <Button
            variant={props.isPublished ? "outline" : "accent"}
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const r = await setMentorPublished(!props.isPublished);
                r.ok
                  ? toast.success(props.isPublished ? "Mentor profile is now hidden." : "You're live in /mentors!")
                  : toast.error(r.message ?? "Failed.");
              });
            }}
          >
            {props.isPublished ? "Hide my mentor profile" : "Publish to /mentors"}
          </Button>
        )}
      </div>
    </Card>
  );
}
