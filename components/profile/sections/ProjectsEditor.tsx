"use client";

import { useActionState, useEffect, useState } from "react";
import type { Project } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FieldError } from "@/components/ui/field-error";
import { saveProject, deleteProject } from "@/server/candidates/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";
import { Trash2 } from "lucide-react";

function ProjectForm() {
  const [state, formAction] = useActionState<FormState, FormData>(saveProject, emptyFormState);
  const e = state.fieldErrors ?? {};
  const v = state.prevValues ?? {};

  const [showOk, setShowOk] = useState(false);
  useEffect(() => {
    if (state.ok && state.message) {
      setShowOk(true);
      const t = setTimeout(() => setShowOk(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      {state.ok && showOk && state.message && (
        <Alert variant="success" className="mb-3">✓ {state.message}</Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mb-3">{state.message}</Alert>
      )}
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Label htmlFor="proj-title" required>Title</Label>
          <Input
            id="proj-title"
            name="title"
            required
            maxLength={140}
            defaultValue={v.title ?? ""}
            placeholder="e.g. 50kW DC fast-charger BMS firmware"
            aria-invalid={!!e.title}
          />
          <FieldError error={e.title} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="proj-desc" optional>Description</Label>
          <Textarea
            id="proj-desc"
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={v.description ?? ""}
            placeholder="What you built, scale, outcome."
            aria-invalid={!!e.description}
          />
          <FieldError error={e.description} />
        </div>
        <div>
          <Label htmlFor="proj-url" optional>URL (GitHub, demo, paper)</Label>
          <Input
            id="proj-url"
            name="url"
            type="url"
            defaultValue={v.url ?? ""}
            placeholder="github.com/you/repo (https:// auto-added)"
            aria-invalid={!!e.url}
          />
          <FieldError error={e.url} />
        </div>
        <div>
          <Label htmlFor="proj-tech" optional>Tech / tools (comma-separated)</Label>
          <Input
            id="proj-tech"
            name="techStack"
            defaultValue={v.techStack ?? ""}
            placeholder="e.g. C, ARM Cortex, FreeRTOS, CAN"
            aria-invalid={!!e.techStack}
          />
          <FieldError error={e.techStack} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">Add</Button>
        </div>
      </form>
    </>
  );
}

export function ProjectsEditor({ projects }: { projects: Project[] }) {
  return (
    <Card>
      <h2 className="text-section text-emce-text">Projects</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        EV-related side projects, capstone, builds, GitHub repos, papers.
      </p>

      {projects.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No projects yet.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {projects.map((p) => (
            <li key={p.id} className="rounded-md border border-emce-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emce-text">{p.title}</span>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-hint font-bold text-emce-dark hover:underline">
                        View →
                      </a>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 text-body text-emce-text-sec">{p.description}</p>
                  )}
                  {p.techStack.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.techStack.map((t) => (
                        <Badge key={t} variant="outline">{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <form action={deleteProject}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit
                    confirm={`Delete project "${p.title}"?`}
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add project
        </summary>
        <div className="mt-4">
          <ProjectForm />
        </div>
      </details>
    </Card>
  );
}
