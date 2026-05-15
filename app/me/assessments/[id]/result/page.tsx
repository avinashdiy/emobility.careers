import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function AssessmentResult({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const attempt = await db.assessmentAttempt.findUnique({
    where: { id },
    include: { assessment: true },
  });
  if (!attempt || attempt.candidateId !== profile.id) notFound();
  if (!attempt.submittedAt) redirect(`/me/assessments/${id}`);

  return (
    <div className="container max-w-xl py-12">
      <Card className="p-8 text-center">
        <div className="text-5xl">{attempt.passed ? "🎉" : "📊"}</div>
        <h1 className="mt-3 text-2xl font-extrabold text-emce-text">
          {attempt.passed ? "You passed!" : "Assessment complete"}
        </h1>
        <p className="mt-1 text-emce-text-sec">{attempt.assessment.title}</p>
        <div className="mt-4">
          <Badge variant={attempt.passed ? "success" : "warning"}>
            Score: {attempt.score ?? 0}% · Pass at {attempt.assessment.passingScore}%
          </Badge>
        </div>
        <Button asChild className="mt-6">
          <Link href="/me/applications">Back to my applications →</Link>
        </Button>
      </Card>
    </div>
  );
}
