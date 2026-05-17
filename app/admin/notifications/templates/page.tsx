import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  upsertNotificationTemplate,
  deleteNotificationTemplate,
  toggleNotificationTemplateActive,
  previewNotificationTemplate,
} from "@/server/notifications/template-actions";
import { NotificationTemplateChannel } from "@prisma/client";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notification templates · Admin" };
export const dynamic = "force-dynamic";

const ALL_CHANNELS: NotificationTemplateChannel[] = [
  "IN_APP",
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "PUSH",
];

/**
 * Admin CRUD for `NotificationTemplate`. Each row overrides the
 * inline title/body/channels of `dispatchNotification(type)` for
 * matching `type`. Behaviour is opt-in: deleting the row restores
 * the inline copy.
 *
 * UI pattern: a create form at the top, then one collapsible card
 * per existing template with inline edit. Per-row preview button
 * fires the template to the admin's own inbox so they can spot-
 * check copy without staging.
 */
export default async function NotificationTemplatesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const templates = await db.notificationTemplate.findMany({
    orderBy: [{ active: "desc" }, { key: "asc" }],
    include: { author: { select: { name: true, email: true } } },
  });

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Notifications"
          title="Templates"
          subtitle="Override the title / body / channels of any in-app, email, SMS, WhatsApp, or push notification by key. Deleting a row restores inline copy."
        />

        {/* Create new template */}
        <Card className="p-6">
          <h2 className="text-section text-emce-text">New template</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Use the same key string passed at the call site (e.g.{" "}
            <code className="rounded bg-emce-light-soft px-1">application.stage_changed</code>).
            Placeholders: <code>{"{{title}}"}</code>, <code>{"{{body}}"}</code>, plus
            any payload key the call passes.
          </p>
          <TemplateForm />
        </Card>

        {/* Existing templates */}
        <div className="space-y-4">
          <h2 className="text-section text-emce-text">
            Existing templates ({templates.length})
          </h2>
          {templates.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-body text-emce-text-sec">
                No templates yet. All notifications use inline copy.
              </p>
            </Card>
          ) : (
            templates.map((t) => (
              <Card key={t.id} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="rounded bg-emce-light-soft px-2 py-0.5 text-sm font-bold text-emce-darkest">
                        {t.key}
                      </code>
                      {t.label && (
                        <span className="text-sm text-emce-text-sec">{t.label}</span>
                      )}
                      <Badge variant={t.active ? "success" : "outline"} size="sm">
                        {t.active ? "active" : "inactive"}
                      </Badge>
                      {t.channels.length > 0 && (
                        <Badge variant="default" size="sm">
                          {t.channels.join(" · ")}
                        </Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-1 text-hint text-emce-text-sec">{t.description}</p>
                    )}
                    <p className="mt-1 text-[10px] text-emce-text-muted">
                      Last updated {relativeTime(t.updatedAt)}
                      {t.author?.name ? ` by ${t.author.name}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <form action={toggleNotificationTemplateActive}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                        {t.active ? "Pause" : "Activate"}
                      </SubmitButton>
                    </form>
                    <form action={previewNotificationTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="Sending…">
                        📤 Preview to self
                      </SubmitButton>
                    </form>
                    <form action={deleteNotificationTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <ConfirmSubmit
                        size="sm"
                        variant="ghost"
                        confirm={`Delete template for "${t.key}"? Inline copy will resume immediately.`}
                        pendingLabel="…"
                        className="text-emce-red-deep"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>

                <details className="mt-4 border-t border-emce-border pt-3">
                  <summary className="cursor-pointer text-hint font-bold text-emce-dark hover:underline">
                    ✏️ Edit
                  </summary>
                  <TemplateForm template={t} />
                </details>
              </Card>
            ))
          )}
        </div>

        <p className="text-hint text-emce-text-sec">
          ℹ️ Email/SMS/WhatsApp dispatch is currently template-aware for the
          title and body, but per-provider template ids (Resend, MSG91) are
          still env-managed. Wire those through the worker as a follow-up.
        </p>
      </div>
    </AdminShell>
  );
}

function TemplateForm({
  template,
}: {
  template?: {
    id: string;
    key: string;
    label: string | null;
    description: string | null;
    titleOverride: string | null;
    bodyOverride: string | null;
    channels: NotificationTemplateChannel[];
    variables: string[];
    active: boolean;
  };
}) {
  const idSuffix = template?.id ?? "new";
  return (
    <form action={upsertNotificationTemplate} className="mt-4 space-y-3">
      {template?.id && <input type="hidden" name="id" value={template.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`key-${idSuffix}`}>Key *</Label>
          <Input
            id={`key-${idSuffix}`}
            name="key"
            defaultValue={template?.key ?? ""}
            placeholder="application.stage_changed"
            required
            maxLength={120}
            readOnly={!!template?.id}
            className={template?.id ? "bg-emce-light-soft text-emce-text-muted" : ""}
          />
        </div>
        <div>
          <Label htmlFor={`label-${idSuffix}`}>Label (admin-facing)</Label>
          <Input
            id={`label-${idSuffix}`}
            name="label"
            defaultValue={template?.label ?? ""}
            placeholder="ATS stage change"
            maxLength={120}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`description-${idSuffix}`}>Description / when this fires</Label>
        <Textarea
          id={`description-${idSuffix}`}
          name="description"
          defaultValue={template?.description ?? ""}
          rows={2}
          maxLength={2000}
          placeholder="Sent to the candidate whenever a recruiter moves their application to a new pipeline stage."
        />
      </div>
      <div>
        <Label htmlFor={`titleOverride-${idSuffix}`}>
          Title override (blank = use inline)
        </Label>
        <Input
          id={`titleOverride-${idSuffix}`}
          name="titleOverride"
          defaultValue={template?.titleOverride ?? ""}
          placeholder="{{title}} — emobility.careers"
          maxLength={200}
        />
      </div>
      <div>
        <Label htmlFor={`bodyOverride-${idSuffix}`}>
          Body override (blank = use inline)
        </Label>
        <Textarea
          id={`bodyOverride-${idSuffix}`}
          name="bodyOverride"
          defaultValue={template?.bodyOverride ?? ""}
          rows={4}
          maxLength={2000}
          placeholder="Hi {{candidateName}}, your application for {{jobTitle}} at {{companyName}} is now {{stage}}."
        />
      </div>
      <div>
        <Label>Channel override (none checked = use inline channels)</Label>
        <div className="mt-2 flex flex-wrap gap-3">
          {ALL_CHANNELS.map((c) => (
            <label
              key={c}
              className="inline-flex items-center gap-1.5 rounded-md border border-emce-border bg-white px-3 py-1.5 text-xs font-bold"
            >
              <input
                type="checkbox"
                name="channels"
                value={c}
                defaultChecked={template?.channels.includes(c) ?? false}
              />
              {c}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor={`variables-${idSuffix}`}>
          Available payload variables (comma-separated, doc only)
        </Label>
        <Input
          id={`variables-${idSuffix}`}
          name="variables"
          defaultValue={template?.variables.join(", ") ?? ""}
          placeholder="candidateName, jobTitle, companyName, stage"
          maxLength={500}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emce-border pt-3">
        <label className="inline-flex items-center gap-2 text-sm text-emce-text-sec">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={template?.active ?? true}
          />
          Active (live for dispatches)
        </label>
        <SubmitButton size="sm" pendingLabel="Saving…">
          {template?.id ? "Save changes" : "Create template"}
        </SubmitButton>
      </div>
    </form>
  );
}
