"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Image as ImageIcon, Video, FileText, BarChart3, Newspaper, Link2, X, Plus, HelpCircle } from "lucide-react";
import { createRichPost, presignPostAttachmentUpload } from "@/server/social/rich-post-actions";
import { detectEmbed, iframeFor } from "@/lib/social/embeds";

/**
 * LinkedIn-style rich post composer. Modes:
 *
 *   • Text     — plain post (uses createRichPost with kind=TEXT)
 *   • Image    — multi-image carousel (up to 9, ≤10MB each)
 *   • Video    — single uploaded video (≤10MB)
 *   • Embed    — YouTube / Vimeo / Instagram / LinkedIn / X URL
 *   • Document — PDF / DOCX / PPTX (≤10MB)
 *   • Poll     — question + 2–4 options + duration
 *   • Article  — title + cover image + long body
 *
 * The collapsed surface is identical to the simple composer (avatar +
 * "Start a post" pill). Once expanded, tabs flip the content area to the
 * selected mode. All uploads go through `presignPostAttachmentUpload`
 * which enforces the 10MB cap + MIME whitelist server-side.
 */

type Mode = "TEXT" | "IMAGE" | "VIDEO" | "EMBED" | "DOCUMENT" | "POLL" | "ARTICLE" | "QUESTION";

interface UploadedAttachment {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  url: string;
  fileName: string;
  mime: string;
  byteSize: number;
}

interface Props {
  user: {
    name: string;
    profilePhotoUrl: string | null;
    headline: string | null;
    slug: string;
  };
  companies: { id: string; name: string; logoUrl: string | null }[];
}

export function RichPostComposer({ user, companies }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("TEXT");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "CONNECTIONS">("PUBLIC");
  const [asCompanyId, setAsCompanyId] = useState("");
  const [pending, startTransition] = useTransition();

  // Mode-specific state
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [embedUrl, setEmbedUrl] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleCoverUrl, setArticleCoverUrl] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState(7);
  const [pollMulti, setPollMulti] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setBody("");
    setAttachments([]);
    setEmbedUrl("");
    setArticleTitle("");
    setArticleCoverUrl(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollDuration(7);
    setPollMulti(false);
    setAsCompanyId("");
    setMode("TEXT");
  }

  async function handleFile(
    file: File,
    type: "IMAGE" | "VIDEO" | "DOCUMENT",
  ): Promise<UploadedAttachment | null> {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(`${file.name} is over 10MB. Please pick a smaller file.`);
      return null;
    }
    const presign = await presignPostAttachmentUpload({
      type,
      mime: file.type,
      byteSize: file.size,
      fileName: file.name,
    });
    if (!presign.ok) {
      toast.error(presign.message);
      return null;
    }
    // Direct PUT to MinIO using the presigned URL.
    const upload = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!upload.ok) {
      toast.error("Upload failed. Try again.");
      return null;
    }
    return {
      type,
      url: presign.publicUrl,
      fileName: file.name,
      mime: file.type,
      byteSize: file.size,
    };
  }

  async function pickFiles(type: "IMAGE" | "VIDEO" | "DOCUMENT") {
    const input = fileRef.current;
    if (!input) return;
    const accept =
      type === "IMAGE" ? "image/jpeg,image/png,image/webp,image/gif"
      : type === "VIDEO" ? "video/mp4,video/webm,video/quicktime"
      : "application/pdf,.doc,.docx,.ppt,.pptx";
    const multiple = type === "IMAGE";
    input.accept = accept;
    input.multiple = multiple;
    input.value = "";
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      // Sequential to keep the toast order sensible and not hammer the
      // bucket; users rarely upload more than 3-4 images.
      const newOnes: UploadedAttachment[] = [];
      for (const f of files) {
        const a = await handleFile(f, type);
        if (a) newOnes.push(a);
      }
      // For VIDEO + DOCUMENT we replace; for IMAGE we append (carousel).
      setAttachments((curr) => {
        if (type === "IMAGE") return [...curr, ...newOnes].slice(0, 9);
        return newOnes.slice(0, 1);
      });
    };
    input.click();
  }

  function submit() {
    if (mode === "TEXT" && body.trim().length < 1) {
      toast.error("Add something to share.");
      return;
    }
    if (mode === "EMBED" && !detectEmbed(embedUrl)) {
      toast.error("Paste a YouTube, Vimeo, Instagram, LinkedIn, or X URL.");
      return;
    }
    if (mode === "POLL" && pollOptions.filter((o) => o.trim().length > 0).length < 2) {
      toast.error("A poll needs at least two options.");
      return;
    }
    if (mode === "ARTICLE" && articleTitle.trim().length < 3) {
      toast.error("Articles need a title.");
      return;
    }
    if (mode === "QUESTION" && body.trim().length < 15) {
      toast.error("Add a clearer question — at least a sentence (15+ chars).");
      return;
    }
    if ((mode === "IMAGE" || mode === "VIDEO" || mode === "DOCUMENT") && attachments.length === 0) {
      toast.error(`Add at least one ${mode.toLowerCase()}.`);
      return;
    }

    startTransition(async () => {
      const payload = {
        kind: mode,
        body: body.trim() || (mode === "ARTICLE" ? articleTitle : "Shared an attachment."),
        visibility,
        asCompanyId: asCompanyId || null,
        attachments:
          mode === "IMAGE" || mode === "VIDEO" || mode === "DOCUMENT"
            ? attachments
            : undefined,
        embedUrl: mode === "EMBED" ? embedUrl.trim() : undefined,
        articleTitle: mode === "ARTICLE" ? articleTitle.trim() : undefined,
        articleCoverUrl: mode === "ARTICLE" && articleCoverUrl ? articleCoverUrl : undefined,
        poll:
          mode === "POLL"
            ? {
                question: pollQuestion.trim(),
                options: pollOptions.map((o) => o.trim()).filter(Boolean),
                durationDays: pollDuration,
                multipleChoice: pollMulti,
              }
            : undefined,
      };
      const r = await createRichPost(payload);
      if (r.ok) {
        toast.success("Posted.");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.message ?? "Couldn't post.");
      }
    });
  }

  if (!open) {
    return (
      <Card className="cursor-pointer p-3" onClick={() => setOpen(true)}>
        <div className="flex items-center gap-2">
          <Avatar src={user.profilePhotoUrl} name={user.name} size="md" />
          <button
            type="button"
            className="flex-1 rounded-full border border-emce-border bg-white px-4 py-2 text-left text-sm font-semibold text-emce-text-sec hover:bg-emce-light-soft"
          >
            Start a post
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-1 pt-1.5 text-sm font-semibold text-emce-text-sec">
          <ModeChip icon={<ImageIcon className="h-5 w-5 text-emce-mid-muted" />} label="Photo" onClick={() => { setMode("IMAGE"); setOpen(true); }} />
          <ModeChip icon={<Video className="h-5 w-5 text-emce-orange-deep" />} label="Video" onClick={() => { setMode("VIDEO"); setOpen(true); }} />
          <ModeChip icon={<Newspaper className="h-5 w-5 text-emce-darkest" />} label="Article" onClick={() => { setMode("ARTICLE"); setOpen(true); }} />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <input ref={fileRef} type="file" className="hidden" />

      <div className="flex items-start gap-3">
        <Avatar src={user.profilePhotoUrl} name={user.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emce-text">{user.name}</span>
            {companies.length > 0 && (
              <NativeSelect value={asCompanyId} onChange={(e) => setAsCompanyId(e.target.value)} className="h-7 text-xs">
                <option value="">Posting as me</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>As {c.name}</option>
                ))}
              </NativeSelect>
            )}
            <NativeSelect value={visibility} onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "CONNECTIONS")} className="h-7 text-xs">
              <option value="PUBLIC">Public</option>
              <option value="CONNECTIONS">Connections only</option>
            </NativeSelect>
          </div>
        </div>
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-emce-text-sec hover:text-emce-text" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-8">
        <ModeTab active={mode === "TEXT"} onClick={() => setMode("TEXT")} label="Text" />
        <ModeTab active={mode === "IMAGE"} onClick={() => setMode("IMAGE")} label="Image" />
        <ModeTab active={mode === "VIDEO"} onClick={() => setMode("VIDEO")} label="Video" />
        <ModeTab active={mode === "EMBED"} onClick={() => setMode("EMBED")} label="Embed" icon={<Link2 className="h-3.5 w-3.5" />} />
        <ModeTab active={mode === "DOCUMENT"} onClick={() => setMode("DOCUMENT")} label="Doc" icon={<FileText className="h-3.5 w-3.5" />} />
        <ModeTab active={mode === "POLL"} onClick={() => setMode("POLL")} label="Poll" icon={<BarChart3 className="h-3.5 w-3.5" />} />
        <ModeTab active={mode === "ARTICLE"} onClick={() => setMode("ARTICLE")} label="Article" icon={<Newspaper className="h-3.5 w-3.5" />} />
        <ModeTab active={mode === "QUESTION"} onClick={() => setMode("QUESTION")} label="Question" icon={<HelpCircle className="h-3.5 w-3.5" />} />
      </div>

      {/* Body — common to all modes */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={mode === "ARTICLE" ? 8 : 4}
        placeholder={
          mode === "ARTICLE"
            ? "Write your article. The first paragraph is the preview shown in the feed."
            : mode === "POLL"
            ? "Optional caption for the poll…"
            : mode === "QUESTION"
            ? "Ask a clear, specific question — e.g. 'What's the typical battery degradation rate for LFP cells in Indian climate after 2 years?' Include any context that helps people answer."
            : "What do you want to share?"
        }
        className="mt-3 resize-none border-0 px-0 text-base shadow-none focus:ring-0"
      />

      {/* ─── Mode-specific UI ──────────────────────────────── */}

      {mode === "IMAGE" && (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => pickFiles("IMAGE")}>
            <ImageIcon className="mr-1 h-4 w-4" /> Add image{attachments.length > 0 ? "s" : ""} ({attachments.length}/9)
          </Button>
          {attachments.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative aspect-video overflow-hidden rounded-md border border-emce-border bg-emce-light-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments((curr) => curr.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
                  ><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "VIDEO" && (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => pickFiles("VIDEO")}>
            <Video className="mr-1 h-4 w-4" /> {attachments[0] ? "Replace video" : "Choose video (≤10MB)"}
          </Button>
          {attachments[0] && (
            <div className="mt-2 rounded-md border border-emce-border bg-black">
              <video src={attachments[0].url} controls className="w-full rounded-md" />
              <p className="mt-1 px-2 py-1 text-xs text-emce-text-sec">{attachments[0].fileName} · {fmtBytes(attachments[0].byteSize)}</p>
            </div>
          )}
        </div>
      )}

      {mode === "EMBED" && (
        <div className="mt-2">
          <Label htmlFor="embed">Paste a link</Label>
          <Input
            id="embed"
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            placeholder="YouTube / Vimeo / LinkedIn post / Instagram / X URL"
          />
          <p className="mt-1 text-[11px] text-emce-text-sec">
            YouTube, Vimeo &amp; LinkedIn posts render inline in the feed.
            Instagram &amp; X show as a link card (their embed APIs require auth).
          </p>
          {(() => {
            const det = embedUrl ? detectEmbed(embedUrl) : null;
            if (!embedUrl) return null;
            if (!det) {
              return (
                <p className="mt-1 text-xs text-emce-red-deep">
                  Unsupported URL — we support YouTube, Vimeo, LinkedIn, Instagram, X.
                </p>
              );
            }
            const iframeSrc = iframeFor(det);
            const providerLabel = det.provider.toLowerCase();
            return (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-emce-mid-muted">
                  ✓ Detected: {providerLabel}
                  {det.iframe ? " — will render inline" : " — will show as link card"}
                </p>
                {iframeSrc && det.provider === "LINKEDIN" && (
                  <div className="overflow-hidden rounded-md border border-emce-border bg-white">
                    <iframe
                      src={iframeSrc}
                      title="LinkedIn post preview"
                      allow="encrypted-media"
                      className="h-[28rem] w-full"
                    />
                  </div>
                )}
                {iframeSrc && (det.provider === "YOUTUBE" || det.provider === "VIMEO") && (
                  <div className="aspect-video overflow-hidden rounded-md border border-emce-border bg-black">
                    <iframe
                      src={iframeSrc}
                      title={`${providerLabel} preview`}
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full"
                    />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {mode === "DOCUMENT" && (
        <div className="mt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => pickFiles("DOCUMENT")}>
            <FileText className="mr-1 h-4 w-4" /> {attachments[0] ? "Replace document" : "Choose PDF / DOCX / PPTX"}
          </Button>
          {attachments[0] && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-emce-border bg-emce-light-soft p-2.5 text-sm">
              <FileText className="h-5 w-5 text-emce-darkest" />
              <span className="flex-1 truncate font-bold">{attachments[0].fileName}</span>
              <span className="text-xs text-emce-text-sec">{fmtBytes(attachments[0].byteSize)}</span>
            </div>
          )}
        </div>
      )}

      {mode === "POLL" && (
        <div className="mt-2 space-y-2 rounded-md border border-emce-border bg-emce-light-soft/30 p-3">
          <div>
            <Label htmlFor="poll-q">Poll question</Label>
            <Input id="poll-q" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="e.g. Which battery chemistry will dominate Indian 2-wheelers in 2027?" maxLength={200} />
          </div>
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={opt}
                onChange={(e) => setPollOptions((curr) => curr.map((o, idx) => (idx === i ? e.target.value : o)))}
                placeholder={`Option ${i + 1}`}
                maxLength={80}
              />
              {pollOptions.length > 2 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPollOptions((curr) => curr.filter((_, idx) => idx !== i))}>×</Button>
              )}
            </div>
          ))}
          {pollOptions.length < 4 && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPollOptions((curr) => [...curr, ""])}>
              <Plus className="mr-1 h-3 w-3" /> Add option
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-1 text-xs">
              <span>Open for</span>
              <NativeSelect value={pollDuration} onChange={(e) => setPollDuration(Number(e.target.value))} className="h-7 text-xs">
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
              </NativeSelect>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={pollMulti} onChange={(e) => setPollMulti(e.target.checked)} />
              Allow multiple selections
            </label>
          </div>
        </div>
      )}

      {mode === "ARTICLE" && (
        <div className="mt-2 space-y-2">
          <div>
            <Label htmlFor="art-title">Title</Label>
            <Input id="art-title" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} placeholder="A short, punchy title" maxLength={200} />
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={async () => {
              const input = fileRef.current;
              if (!input) return;
              input.accept = "image/jpeg,image/png,image/webp";
              input.multiple = false;
              input.value = "";
              input.onchange = async () => {
                const f = input.files?.[0];
                if (!f) return;
                const a = await handleFile(f, "IMAGE");
                if (a) setArticleCoverUrl(a.url);
              };
              input.click();
            }}>
              <ImageIcon className="mr-1 h-4 w-4" /> {articleCoverUrl ? "Replace cover" : "Add cover image"}
            </Button>
            {articleCoverUrl && (
              <div className="mt-2 aspect-[3/1] overflow-hidden rounded-md border border-emce-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={articleCoverUrl} alt="Article cover" className="h-full w-full object-cover" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit row */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-emce-border pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending
            ? (mode === "QUESTION" ? "Asking…" : "Posting…")
            : (mode === "QUESTION" ? "Ask question" : "Post")}
        </Button>
      </div>
    </Card>
  );
}

function ModeTab({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold ${
        active ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ModeChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-emce-light-soft"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
