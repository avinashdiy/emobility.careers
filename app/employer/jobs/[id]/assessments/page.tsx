import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import { createAssessment } from "@/server/assessments/actions";

export default async function JobAssessmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const job = await db.jobPosting.findUnique({
    where: { id },
    include: {
      assessments: {
        include: { _count: { select: { attempts: true } } },
      },
    },
  });
  if (!job) notFound();
  if (session.user.role !== "ADMIN" && job.companyId !== employer.companyId) redirect("/403");

  const sampleMCQ = JSON.stringify(
    [
      {
        q: "What is the typical nominal voltage of an EV battery cell (NMC chemistry)?",
        options: ["1.2V", "3.7V", "12V", "48V"],
        correctIndex: 1,
        weight: 1,
      },
      {
        q: "Which protocol is used for AC charger ↔ CMS communication?",
        options: ["Modbus", "OCPP", "CAN bus", "MQTT"],
        correctIndex: 1,
        weight: 1,
      },
    ],
    null,
    2,
  );

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <div className="mb-4 flex items-center justify-between">
          <Link href={`/employer/jobs/${id}`} className="text-hint font-bold text-emce-text-sec hover:text-emce-dark">
            ← Job
          </Link>
        </div>
        <h1 className="text-dashboard text-emce-text">Assessments — {job.title}</h1>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">{sp.error}</div>
        )}

        {job.assessments.length > 0 ? (
          <ul className="mt-6 space-y-3">
            {job.assessments.map((a) => (
              <li key={a.id}>
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-emce-text">{a.title}</h3>
                      <p className="text-hint text-emce-text-sec">
                        {a.type} · pass at {a.passingScore}% · {a._count.attempts} attempts
                      </p>
                      {a.gateAdvance && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emce-orange-light px-2 py-0.5 text-[10px] font-bold text-emce-orange">
                          🚧 Pre-placement gate · blocks forward stage advance until passed
                        </p>
                      )}
                    </div>
                    <Badge variant="default">{a.type}</Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="mt-6 p-6">
            <p className="text-hint text-emce-text-sec">
              No assessments yet for this job. MCQ assessments auto-grade and can move applicants to Interview when they pass.
            </p>
          </Card>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Add a new assessment</h2>
          <form action={createAssessment} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="jobId" value={id} />
            <div className="sm:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required minLength={2} placeholder="e.g. EV Fundamentals MCQ" />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <NativeSelect id="type" name="type" defaultValue="MCQ">
                <option value="MCQ">MCQ (auto-graded)</option>
                <option value="CODING">Coding</option>
                <option value="SKILL_TASK">Skill task</option>
                <option value="VIDEO_RESPONSE">Video response</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="passingScore">Passing score (%)</Label>
              <Input id="passingScore" name="passingScore" type="number" min="0" max="100" defaultValue="60" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="durationMins">Duration (minutes, optional)</Label>
              <Input id="durationMins" name="durationMins" type="number" min="1" max="180" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 rounded-md bg-emce-orange-light/60 p-3 text-sm">
              <input
                type="checkbox"
                name="gateAdvance"
                value="true"
                className="mt-0.5 h-4 w-4 accent-emce-orange"
              />
              <span>
                <strong className="block text-emce-text">Pre-placement gate</strong>
                <span className="text-emce-text-sec">
                  Block this candidate from moving past the Assessment stage until they have an attempt with score ≥ passing score. Use for sanity-check tests you don't want to bypass.
                </span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="questionsJson">Questions JSON</Label>
              <Textarea id="questionsJson" name="questionsJson" rows={10} required defaultValue={sampleMCQ} />
              <p className="mt-1 text-hint text-emce-text-muted">
                For MCQ: <code>[{`{q, options[], correctIndex, weight?}`}]</code>
              </p>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Create</Button>
            </div>
          </form>
        </Card>
      </div>
    </EmployerShell>
  );
}
