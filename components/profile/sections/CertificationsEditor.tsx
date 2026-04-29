import type { Certification } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveCertification, deleteCertification } from "@/server/candidates/actions";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

export function CertificationsEditor({ certifications }: { certifications: Certification[] }) {
  return (
    <Card>
      <h2 className="text-section text-emce-text">Certifications</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Industry certifications, course completion certificates, professional licences. DIYguru certs are auto-flagged when imported by an admin.
      </p>

      {certifications.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No certifications yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {certifications.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 rounded-md border border-emce-border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emce-text">{c.name}</span>
                  {c.diyguruVerified && <Badge variant="verified">⭐ Verified</Badge>}
                  {c.isDIYguru && !c.diyguruVerified && <Badge variant="default">DIYguru (pending)</Badge>}
                </div>
                <div className="text-hint text-emce-text-sec">
                  {[c.issuer, c.issueDate ? `Issued ${formatMonthYear(c.issueDate)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {c.credentialUrl && (
                  <a
                    href={c.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    Credential →
                  </a>
                )}
              </div>
              <form action={deleteCertification}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmSubmit
                  confirm={`Delete certification "${c.name}"?`}
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add certification
        </summary>
        <form action={saveCertification} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cert-name">Name</Label>
            <Input id="cert-name" name="name" required maxLength={140} placeholder="e.g. AIS-156 Battery Safety" />
          </div>
          <div>
            <Label htmlFor="cert-issuer">Issuer</Label>
            <Input id="cert-issuer" name="issuer" maxLength={120} placeholder="e.g. ARAI" />
          </div>
          <div>
            <Label htmlFor="cert-date">Issued</Label>
            <Input id="cert-date" name="issueDate" type="month" />
          </div>
          <div>
            <Label htmlFor="cert-id">Credential ID</Label>
            <Input id="cert-id" name="credentialId" maxLength={120} />
          </div>
          <div>
            <Label htmlFor="cert-url">Credential URL</Label>
            <Input id="cert-url" name="credentialUrl" type="url" placeholder="https://" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm">Add</Button>
          </div>
        </form>
      </details>
    </Card>
  );
}
