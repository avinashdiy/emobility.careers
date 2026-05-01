"use client";

import { useTransition, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import {
  saveEvent,
  cancelEvent,
  deleteEvent,
  presignEventCoverUpload,
} from "@/server/events/actions";
import { toast } from "sonner";

interface EventForEdit {
  id?: string;
  title?: string;
  description?: string;
  eventType?: "WEBINAR" | "IN_PERSON" | "HYBRID";
  status?: "DRAFT" | "OPEN" | "CANCELLED" | "COMPLETED";
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  timezone?: string;
  registrationDeadline?: Date | string | null;
  location?: string | null;
  meetingUrl?: string | null;
  coverImageUrl?: string | null;
  capacity?: number | null;
}

/** Format a Date (or ISO string) as a `datetime-local` input value. */
function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local expects "YYYY-MM-DDTHH:mm" in *local* time. We render
  // the user's local clock, which is what they think they want when
  // setting an event time.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventEditor({ event }: { event?: EventForEdit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEditing = Boolean(event?.id);
  const [eventType, setEventType] = useState<EventForEdit["eventType"]>(event?.eventType ?? "WEBINAR");
  // Cover image state. Mirrors the server-side `coverImageUrl` field
  // so it round-trips through the form's hidden input on save.
  // Lifecycle: pick file → presign → PUT to MinIO → store the public
  // URL in state → on submit, the hidden input ships that URL with
  // the rest of the form. Removal just nulls the state.
  const [coverUrl, setCoverUrl] = useState<string | null>(event?.coverImageUrl ?? null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  async function handleCoverPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Cover image must be 5MB or smaller.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a JPG, PNG, or WEBP image.");
      return;
    }
    setCoverUploading(true);
    try {
      const presign = await presignEventCoverUpload({
        mime: file.type,
        byteSize: file.size,
        fileName: file.name,
      });
      if (!presign.ok) {
        toast.error(presign.message);
        return;
      }
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        toast.error(`Upload failed (${put.status}). Try again or use a smaller file.`);
        return;
      }
      setCoverUrl(presign.publicUrl);
      toast.success("Cover uploaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Check your connection.",
      );
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveEvent(fd);
      if (r.ok) {
        toast.success(isEditing ? "Event updated." : "Event created.");
        router.push("/employer/events");
        router.refresh();
      } else {
        toast.error(r.message ?? "Couldn't save event.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {event?.id && <input type="hidden" name="id" value={event.id} />}

      <Card className="p-6 space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={160}
            defaultValue={event?.title ?? ""}
            placeholder="EV Battery Pack Design — Recruiter Q&A with Ola Electric"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            required
            minLength={20}
            maxLength={20_000}
            rows={6}
            defaultValue={event?.description ?? ""}
            placeholder="What you'll cover, who should attend, what attendees will walk away with."
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Markdown isn&apos;t parsed yet — plain text only.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="eventType">Event type</Label>
            <NativeSelect
              id="eventType"
              name="eventType"
              value={eventType}
              onChange={(e) =>
                setEventType(e.target.value as "WEBINAR" | "IN_PERSON" | "HYBRID")
              }
            >
              <option value="WEBINAR">Webinar (online)</option>
              <option value="IN_PERSON">In person</option>
              <option value="HYBRID">Hybrid</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <NativeSelect
              id="status"
              name="status"
              defaultValue={event?.status ?? "DRAFT"}
            >
              <option value="DRAFT">Draft (private)</option>
              <option value="OPEN">Open (public, accepting registrations)</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="COMPLETED">Completed (archive)</option>
            </NativeSelect>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="text-section text-emce-text">When</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="startsAt">Starts at</Label>
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toLocalInput(event?.startsAt)}
            />
          </div>
          <div>
            <Label htmlFor="endsAt">Ends at (optional)</Label>
            <Input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              defaultValue={toLocalInput(event?.endsAt)}
            />
          </div>
          <div>
            <Label htmlFor="timezone">Timezone (IANA)</Label>
            <Input
              id="timezone"
              name="timezone"
              required
              defaultValue={event?.timezone ?? "Asia/Kolkata"}
              placeholder="Asia/Kolkata"
            />
          </div>
          <div>
            <Label htmlFor="registrationDeadline">Registration deadline (optional)</Label>
            <Input
              id="registrationDeadline"
              name="registrationDeadline"
              type="datetime-local"
              defaultValue={toLocalInput(event?.registrationDeadline)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="text-section text-emce-text">Where</h3>
        {(eventType === "IN_PERSON" || eventType === "HYBRID") && (
          <div>
            <Label htmlFor="location">Venue address</Label>
            <Input
              id="location"
              name="location"
              maxLength={240}
              defaultValue={event?.location ?? ""}
              placeholder="Ola Electric Innovation Centre, Bengaluru"
            />
          </div>
        )}
        {(eventType === "WEBINAR" || eventType === "HYBRID") && (
          <div>
            <Label htmlFor="meetingUrl">Meeting URL</Label>
            <Input
              id="meetingUrl"
              name="meetingUrl"
              type="url"
              maxLength={500}
              defaultValue={event?.meetingUrl ?? ""}
              placeholder="https://zoom.us/j/…"
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Visible only to registered attendees on the public event page.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="text-section text-emce-text">Optional</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Cover image</Label>
            {/* Hidden input holds the resolved public URL after upload.
                The picker below sets it via state — submit ships the
                value alongside the rest of the form. Empty string is
                normalised to null on the server. */}
            <input
              type="hidden"
              name="coverImageUrl"
              value={coverUrl ?? ""}
            />
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleCoverPick(e.target.files?.[0])}
              className="hidden"
            />

            {coverUrl ? (
              <div className="relative mt-1 overflow-hidden rounded-md border border-emce-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="Event cover preview"
                  className="h-32 w-full object-cover"
                />
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={coverUploading}
                    className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-60"
                    aria-label="Replace cover"
                    title="Replace"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverUrl(null)}
                    disabled={coverUploading}
                    className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-60"
                    aria-label="Remove cover"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                className="mt-1 flex h-32 w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-emce-border bg-emce-light-soft text-emce-text-sec transition hover:border-emce-mid hover:text-emce-dark disabled:opacity-60"
              >
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs font-bold">
                  {coverUploading ? "Uploading…" : "Upload cover image"}
                </span>
                <span className="text-[10px]">JPG / PNG / WEBP · up to 5 MB</span>
              </button>
            )}
            <p className="mt-1 text-hint text-emce-text-muted">
              Falls back to the brand gradient if blank.
            </p>
          </div>
          <div>
            <Label htmlFor="capacity">Capacity (optional)</Label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              max={100_000}
              defaultValue={event?.capacity ?? ""}
              placeholder="e.g. 100"
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Leave blank for unlimited.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEditing ? "Save changes" : "Create event"}
        </Button>
      </div>

      {/* Destructive actions — only on edit */}
      {isEditing && event?.status !== "CANCELLED" && (
        <DangerActions eventId={event!.id!} status={event!.status ?? "DRAFT"} />
      )}
    </form>
  );
}

function DangerActions({
  eventId,
  status,
}: {
  eventId: string;
  status: "DRAFT" | "OPEN" | "CANCELLED" | "COMPLETED";
}) {
  const router = useRouter();
  return (
    <Card className="border-emce-orange p-6">
      <h3 className="text-section text-emce-orange">Danger zone</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {status !== "DRAFT" && (
          <form
            action={async (fd) => {
              const r = await cancelEvent(fd);
              if (r.ok) {
                toast.success("Event cancelled.");
                router.refresh();
              } else {
                toast.error(r.message ?? "Couldn't cancel.");
              }
            }}
          >
            <input type="hidden" name="id" value={eventId} />
            <Button type="submit" variant="outline" size="sm">
              Cancel event
            </Button>
          </form>
        )}
        {status !== "COMPLETED" && (
          <form
            action={async (fd) => {
              if (!confirm("Delete this event? This is permanent.")) return;
              const r = await deleteEvent(fd);
              if (r.ok) {
                toast.success("Event deleted.");
                router.push("/employer/events");
                router.refresh();
              } else {
                toast.error(r.message ?? "Couldn't delete.");
              }
            }}
          >
            <input type="hidden" name="id" value={eventId} />
            <Button type="submit" variant="ghost" size="sm" className="text-emce-orange">
              Delete
            </Button>
          </form>
        )}
      </div>
      <p className="mt-2 text-hint text-emce-text-muted">
        Cancelling keeps the event visible to registered users with a &quot;cancelled&quot; banner.
        Deleting removes it entirely (only allowed for draft / upcoming events).
      </p>
    </Card>
  );
}
