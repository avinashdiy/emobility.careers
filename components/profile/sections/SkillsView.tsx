import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  skills: { skill: { name: string }; proficiency: string }[];
  evDomains: { evDomain: { name: string; slug: string } }[];
}

export function SkillsView({ skills, evDomains }: Props) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Skills &amp; EV domains</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Auto-extracted from your resume. Editing UI for individual skills lands in Wave 4 (talent search).
      </p>

      {evDomains.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-bold uppercase text-emce-text-muted">EV Domains</div>
          <div className="flex flex-wrap gap-2">
            {evDomains.map((d) => (
              <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
            ))}
          </div>
        </div>
      )}

      {skills.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-bold uppercase text-emce-text-muted">Skills</div>
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <Badge key={`${s.skill.name}-${i}`} variant="default">
                {s.skill.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No skills yet. Upload a resume to auto-populate, or come back in Wave 4 to add manually.
        </p>
      )}
    </Card>
  );
}
