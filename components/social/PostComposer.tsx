"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { createPost } from "@/server/social/actions";
import { toast } from "sonner";
import { ImageIcon, BriefcaseIcon, X } from "lucide-react";

interface Props {
  user: {
    name: string;
    profilePhotoUrl: string | null;
    headline: string | null;
    slug: string;
  };
  // Companies the user can post on behalf of
  companies?: { id: string; name: string; logoUrl: string | null }[];
}

export function PostComposer({ user, companies = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "CONNECTIONS">("PUBLIC");
  const [asCompanyId, setAsCompanyId] = useState<string>("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setBody("");
    setVisibility("PUBLIC");
    setAsCompanyId("");
    setOpen(false);
  }

  function submit() {
    if (!body.trim() || body.length < 1) return;
    const fd = new FormData();
    fd.append("body", body.trim());
    fd.append("visibility", visibility);
    if (asCompanyId) fd.append("asCompanyId", asCompanyId);
    start(async () => {
      try {
        await createPost(fd);
        toast.success("Posted");
        reset();
      } catch {
        toast.error("Couldn't post — try again.");
      }
    });
  }

  if (!open) {
    return (
      <Card className="cursor-pointer p-3 sm:p-4" onClick={() => {
        setOpen(true);
        setTimeout(() => ref.current?.focus(), 50);
      }}>
        <div className="flex items-center gap-3">
          <Avatar src={user.profilePhotoUrl} name={user.name} size="md" />
          <button
            type="button"
            className="flex-1 rounded-full border border-emce-border bg-white px-4 py-2.5 text-left text-sm text-emce-text-muted hover:bg-emce-light-soft"
          >
            Start a post, {user.name?.split(" ")[0] ?? "there"}…
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 border-t border-emce-border pt-2 text-hint text-emce-text-sec">
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-emce-light-soft">
            <ImageIcon className="h-4 w-4 text-emce-mid" /> Photo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-emce-light-soft">
            <BriefcaseIcon className="h-4 w-4 text-emce-orange" /> Share a job
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/${user.slug}`} className="flex items-center gap-3">
          <Avatar src={user.profilePhotoUrl} name={user.name} size="md" />
          <div>
            <div className="font-bold text-emce-text">{user.name}</div>
            {user.headline && (
              <p className="text-hint text-emce-text-sec line-clamp-1">{user.headline}</p>
            )}
            <NativeSelect
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "CONNECTIONS")}
              className="mt-1 inline-flex h-7 w-auto px-2 text-xs"
            >
              <option value="PUBLIC">🌐 Anyone</option>
              <option value="CONNECTIONS">👥 Connections only</option>
            </NativeSelect>
          </div>
        </Link>
        <button
          type="button"
          aria-label="Close composer"
          onClick={reset}
          className="grid h-8 w-8 place-items-center rounded-full text-emce-text-sec hover:bg-emce-light-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {companies.length > 0 && (
        <div className="mt-3">
          <NativeSelect
            value={asCompanyId}
            onChange={(e) => setAsCompanyId(e.target.value)}
            className="text-sm"
          >
            <option value="">Posting as {user.name}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                Post as {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        maxLength={8000}
        placeholder="What do you want to share with the EV community?"
        className="mt-3 border-0 text-base focus-visible:ring-0"
      />

      {body.match(/(?:^|\s)#[a-z0-9_-]+/i) && (
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(body.match(/(?:^|\s)#([a-z0-9_-]+)/gi)?.map((s) => s.trim().slice(1).toLowerCase()) ?? [])].map((t) => (
            <Badge key={t} variant="default">#{t}</Badge>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-emce-border pt-3">
        <span className="text-hint text-emce-text-muted">
          {body.length} / 8000 · Use <code>#tag</code> to add hashtags
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || !body.trim()}
            onClick={submit}
          >
            {pending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
