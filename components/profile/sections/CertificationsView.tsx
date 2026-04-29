import type { Certification } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function CertificationsView({ certifications }: { certifications: Certification[] }) {
  if (certifications.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Certifications</h2>
        <p className="mt-2 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No certifications yet. Upload your resume to auto-extract them.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Certifications</h2>
      <ul className="mt-4 space-y-3">
        {certifications.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-md border border-emce-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-emce-text">{c.name}</span>
                {c.diyguruVerified && <Badge variant="verified">⭐ Verified</Badge>}
                {c.isDIYguru && !c.diyguruVerified && (
                  <Badge variant="default">DIYguru (pending)</Badge>
                )}
              </div>
              {c.issuer && (
                <div className="text-hint text-emce-text-sec">{c.issuer}</div>
              )}
              {c.issueDate && (
                <div className="text-hint text-emce-text-muted">
                  Issued {c.issueDate.toISOString().slice(0, 7)}
                </div>
              )}
            </div>
            {c.credentialUrl && (
              <a
                href={c.credentialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                View →
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
