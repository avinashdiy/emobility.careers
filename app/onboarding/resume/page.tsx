import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadAndParseResume } from "@/server/candidates/actions";

export const metadata = { title: "Upload your resume" };

export default async function ResumeUploadStep() {
  const session = await auth();
  const profile = session?.user?.id
    ? await db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { resumeUrl: true, onboardingCompletedAt: true },
      })
    : null;
  const hasExisting = Boolean(profile?.resumeUrl);
  const isReupload = hasExisting && Boolean(profile?.onboardingCompletedAt);
  return (
    <Card className="p-8">
      <Badge variant="default" className="mb-2">{isReupload ? "Update" : "Step 2 of 5"}</Badge>
      <h1 className="text-2xl font-extrabold text-emce-text">
        {isReupload ? "Re-upload your resume" : "Upload your resume"}
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        {isReupload
          ? "We'll re-parse your resume and let you review the changes before they replace your existing profile sections."
          : "Our AI will extract your experience, skills, and education in seconds. You'll review everything on the next screen before we save it."}
      </p>

      <form action={uploadAndParseResume} className="mt-6 space-y-4" encType="multipart/form-data">
        <label className="block">
          <div className="rounded-lg border-2 border-dashed border-emce-border bg-emce-light-soft/30 p-8 text-center transition hover:border-emce-mid hover:bg-emce-light-soft">
            <div className="text-4xl">📄</div>
            <div className="mt-3 font-bold text-emce-text">Drop your resume or click to browse</div>
            <div className="mt-1 text-hint text-emce-text-sec">PDF or DOCX · max 10MB</div>
          </div>
          <input
            type="file"
            name="resume"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            className="sr-only"
          />
        </label>

        <p className="text-hint text-emce-text-muted">
          Don&apos;t have one? You can{" "}
          <Link href="/me/profile" className="font-bold text-emce-dark underline">
            fill out your profile manually
          </Link>{" "}
          instead.
        </p>

        <div className="flex justify-between pt-4">
          <Button asChild variant="outline">
            <Link href={isReupload ? "/me/profile" : "/onboarding"}>← Back</Link>
          </Button>
          <SubmitButton size="lg" pendingLabel="Parsing…">
            Upload &amp; parse →
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
