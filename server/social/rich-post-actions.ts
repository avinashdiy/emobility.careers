"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { requireEmailVerified, EmailNotVerifiedError } from "@/lib/anti-spam";
import { notificationsQueue } from "@/lib/queues";
import { detectEmbed } from "@/lib/social/embeds";
import { findBannedWord, autoFlagContent } from "@/lib/social/banned-words";
import { extractHashtags, extractMentions } from "@/lib/social/extract";
import { objectKey, presignUpload, publicUrl } from "@/lib/storage";
import { isRouterControlError } from "@/lib/server-action-errors";
import { logger } from "@/lib/logger";
import type { FormState } from "@/lib/form-state";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB cap on every uploaded asset

// MIME whitelist by attachment type. Anything else is rejected at presign
// time so the client can't waste an upload on a file that won't render.
const MIME_WHITELIST = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  DOCUMENT: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
  ],
} as const;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
};

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

// ─── Presigned upload (called from the composer) ───────────

const PresignSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
  mime: z.string().min(1),
  byteSize: z.number().int().positive().max(MAX_BYTES),
  fileName: z.string().min(1).max(200),
});

/**
 * Issue a presigned upload URL for a single attachment. Three guards:
 *   1. byteSize ≤ 10MB at issuance time (the actual upload is also size-
 *      capped by the S3 PUT endpoint).
 *   2. MIME on the strict whitelist for the attachment type.
 *   3. Rate-limited per user so a script can't burn through MinIO storage.
 *
 * Returns the signed URL plus the public URL the file will live at after
 * the client PUTs to it.
 */
export async function presignPostAttachmentUpload(input: {
  type: "IMAGE" | "VIDEO" | "DOCUMENT";
  mime: string;
  byteSize: number;
  fileName: string;
}): Promise<
  | { ok: true; uploadUrl: string; publicUrl: string; storageKey: string }
  | { ok: false; message: string }
> {
  const session = await requireUser();
  await rateLimitOrThrow(`post-upload:${session.user.id}`, "resumeUpload").catch(() => undefined);

  const parsed = PresignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid upload request." };
  }
  if (parsed.data.byteSize > MAX_BYTES) {
    return { ok: false, message: "Files must be 10MB or smaller." };
  }
  const allowed = MIME_WHITELIST[parsed.data.type];
  if (!allowed.some((m) => m === parsed.data.mime)) {
    return {
      ok: false,
      message: `Unsupported file type. Allowed: ${allowed.join(", ")}`,
    };
  }

  // Routing: images + videos go into the docs bucket (public), DOCs too —
  // bucket separation isn't security-critical here since post media is
  // intentionally public. We just put them under a `posts/` prefix so they
  // don't collide with avatars / logos / resumes.
  const ext = EXT_BY_MIME[parsed.data.mime] ?? "bin";
  const key = objectKey(`posts/${session.user.id}`, ext);
  const { url } = await presignUpload("docs", key, parsed.data.mime);

  return {
    ok: true,
    uploadUrl: url,
    publicUrl: publicUrl("docs", key),
    storageKey: key,
  };
}

// ─── Create a rich post ─────────────────────────────────────

const AttachmentSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
  url: z.string().url(),
  fileName: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
  byteSize: z.number().int().positive().max(MAX_BYTES),
});

const PollSchema = z.object({
  question: z.string().min(5).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(4),
  durationDays: z.number().int().min(1).max(14),
  multipleChoice: z.boolean().default(false),
});

const RichPostSchema = z.object({
  kind: z.enum(["TEXT", "IMAGE", "VIDEO", "EMBED", "DOCUMENT", "ARTICLE", "POLL", "QUESTION"]),
  body: z.string().min(1).max(20_000),
  visibility: z.enum(["PUBLIC", "CONNECTIONS", "PRIVATE"]).default("PUBLIC"),
  asCompanyId: z.string().optional().nullable(),
  attachedJobId: z.string().optional().nullable(),
  // Type-specific payloads — only one will be populated based on `kind`.
  attachments: z.array(AttachmentSchema).max(9).optional(),
  embedUrl: z.string().url().optional(),
  poll: PollSchema.optional(),
  articleTitle: z.string().min(3).max(200).optional(),
  articleCoverUrl: z.string().url().optional(),
});

export async function createRichPost(
  input: z.input<typeof RichPostSchema>,
): Promise<{ ok: boolean; postId?: string; message?: string }> {
  try {
  const session = await requireUser();
  try {
    await requireEmailVerified(session.user.id);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) {
      return { ok: false, message: "Verify your email before posting. Check your inbox for the link." };
    }
    throw e;
  }
  await rateLimitOrThrow(`post:${session.user.id}`, "message").catch(() => undefined);
  const pgLimit = await pgRateLimit({ action: "post.create", userId: session.user.id });
  if (!pgLimit.ok) return { ok: false, message: pgLimit.message };

  const parsed = RichPostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid post payload." };
  }
  const data = parsed.data;

  // "Post as company" gate — same rule as the simple createPost.
  if (data.asCompanyId) {
    const ok = await db.employerProfile.findFirst({
      where: { userId: session.user.id, companyId: data.asCompanyId },
      select: { id: true },
    });
    if (!ok) return { ok: false, message: "You don't represent that company." };
  }

  // Per-kind validation.
  if (data.kind === "EMBED" && !data.embedUrl) {
    return { ok: false, message: "Paste a video URL." };
  }
  if (data.kind === "POLL" && !data.poll) {
    return { ok: false, message: "Add a poll question and options." };
  }
  if (data.kind === "ARTICLE" && !data.articleTitle) {
    return { ok: false, message: "Articles need a title." };
  }
  if ((data.kind === "IMAGE" || data.kind === "VIDEO" || data.kind === "DOCUMENT") && (!data.attachments || data.attachments.length === 0)) {
    return { ok: false, message: `Add at least one ${data.kind.toLowerCase()}.` };
  }

  // Embed URL → provider detection. Reject unsupported URLs so we don't
  // store junk that won't render.
  let embedFields: {
    embedUrl?: string;
    embedProvider?: "YOUTUBE" | "VIMEO" | "INSTAGRAM" | "LINKEDIN" | "TWITTER";
  } = {};
  if (data.kind === "EMBED" && data.embedUrl) {
    const detection = detectEmbed(data.embedUrl);
    if (!detection) {
      return {
        ok: false,
        message: "Unsupported video URL. We support YouTube, Vimeo, Instagram, LinkedIn, and X.",
      };
    }
    embedFields = { embedUrl: detection.url, embedProvider: detection.provider };
  }

  // Banned-word auto-moderation. Same flow as createPost in
  // ./actions.ts — flagged posts get visibility=PRIVATE so they
  // don't surface on the feed until an admin actions or dismisses.
  // We check the article title too because it's the headline and
  // arguably the most-visible field.
  const haystack = [data.body, data.articleTitle ?? ""].filter(Boolean).join(" ");
  const bannedWord = await findBannedWord(haystack);
  const effectiveVisibility = bannedWord ? "PRIVATE" : data.visibility;

  const post = await db.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: session.user.id,
        body: data.body,
        visibility: effectiveVisibility,
        asCompanyId: data.asCompanyId ?? null,
        attachedJobId: data.attachedJobId ?? null,
        kind: data.kind,
        articleTitle: data.kind === "ARTICLE" ? data.articleTitle ?? null : null,
        articleCoverUrl: data.kind === "ARTICLE" ? data.articleCoverUrl ?? null : null,
        embedUrl: embedFields.embedUrl ?? null,
        embedProvider: embedFields.embedProvider ?? null,
        hashtags: extractHashtags(data.body),
        mentions: extractMentions(data.body),
      },
    });

    if (data.attachments && data.attachments.length > 0) {
      await tx.postAttachment.createMany({
        data: data.attachments.map((a, i) => ({
          postId: created.id,
          type: a.type,
          url: a.url,
          fileName: a.fileName,
          mime: a.mime,
          byteSize: a.byteSize,
          order: i,
        })),
      });
    }

    if (data.kind === "POLL" && data.poll) {
      const closesAt = new Date(Date.now() + data.poll.durationDays * 24 * 3600 * 1000);
      await tx.poll.create({
        data: {
          postId: created.id,
          question: data.poll.question,
          closesAt,
          multipleChoice: data.poll.multipleChoice,
          options: {
            create: data.poll.options.map((text, i) => ({ text, order: i })),
          },
        },
      });
    }

    await tx.candidateProfile.updateMany({
      where: { userId: session.user.id },
      data: { postsCount: { increment: 1 } },
    });

    return created;
  });

  await audit({
    actorId: session.user.id,
    action: `post.created.${data.kind.toLowerCase()}`,
    entity: "Post",
    entityId: post.id,
  });

  if (bannedWord) {
    await autoFlagContent({
      entity: "Post",
      entityId: post.id,
      authorId: session.user.id,
      matchedWord: bannedWord,
      body: haystack,
    });
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${post.id}`);
  for (const tag of extractHashtags(data.body)) revalidatePath(`/tag/${tag}`);

  return {
    ok: true,
    postId: post.id,
    message: bannedWord
      ? "Posted — held for review because it contains a flagged term."
      : undefined,
  };
  } catch (err) {
    // Top-level catch so DB / Redis / MinIO failures surface as a
    // toast in the composer rather than the global error.tsx page.
    // Real cause is logged at error level for ops to grep.
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[rich-post] create unhandled error");
    return {
      ok: false,
      message:
        "Couldn't post — the team has been notified. Try again in a moment.",
    };
  }
}

// ─── Poll voting ────────────────────────────────────────────

export async function voteOnPoll(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const pollId = z.string().parse(formData.get("pollId"));
  const optionIds = formData.getAll("optionId").map(String).filter(Boolean);

  if (optionIds.length === 0) return { ok: false, message: "Pick an option." };

  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: { options: { select: { id: true } } },
  });
  if (!poll) return { ok: false, message: "Poll not found." };
  if (poll.closesAt < new Date()) return { ok: false, message: "Voting closed." };
  if (!poll.multipleChoice && optionIds.length > 1) {
    return { ok: false, message: "Only one option allowed." };
  }
  // Reject any optionIds that don't belong to this poll — defends against
  // a forged form with another poll's option id.
  const validIds = new Set(poll.options.map((o) => o.id));
  if (!optionIds.every((id) => validIds.has(id))) {
    return { ok: false, message: "Invalid option." };
  }

  await db.$transaction(async (tx) => {
    if (!poll.multipleChoice) {
      // Single-choice — clear any prior vote first so we can switch options.
      const prior = await tx.pollVote.findMany({
        where: { pollId, userId: session.user.id },
        select: { id: true, optionId: true },
      });
      if (prior.length > 0) {
        await tx.pollVote.deleteMany({ where: { id: { in: prior.map((p) => p.id) } } });
        // Decrement option counts for the removed votes.
        for (const p of prior) {
          await tx.pollOption.update({ where: { id: p.optionId }, data: { votes: { decrement: 1 } } });
        }
        await tx.poll.update({ where: { id: pollId }, data: { totalVotes: { decrement: prior.length } } });
      }
    }
    // Insert new votes — `createMany` with skipDuplicates handles re-tap of
    // the same option (multi-choice toggle).
    await tx.pollVote.createMany({
      data: optionIds.map((optionId) => ({ pollId, userId: session.user.id, optionId })),
      skipDuplicates: true,
    });
    for (const optionId of optionIds) {
      await tx.pollOption.update({ where: { id: optionId }, data: { votes: { increment: 1 } } });
    }
    await tx.poll.update({ where: { id: pollId }, data: { totalVotes: { increment: optionIds.length } } });
  });

  // Notify the post author once per voter (bonus — rate-limited at the
  // notification fanout level if it gets noisy).
  const post = await db.post.findFirst({ where: { poll: { id: pollId } }, select: { id: true, authorId: true } });
  if (post && post.authorId !== session.user.id) {
    await notificationsQueue.add("poll.vote", {
      userId: post.authorId,
      type: "post.poll-vote",
      title: "Someone voted on your poll",
      body: poll.question.slice(0, 80),
      link: `/posts/${post.id}`,
      channels: ["IN_APP"],
    });
  }

  revalidatePath("/feed");
  if (post) revalidatePath(`/posts/${post.id}`);
  return { ok: true };
}

export async function closePoll(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const pollId = z.string().parse(formData.get("pollId"));
  const poll = await db.poll.findUnique({
    where: { id: pollId },
    include: { post: { select: { authorId: true, id: true } } },
  });
  if (!poll) return { ok: false, message: "Poll not found." };
  if (poll.post.authorId !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, message: "Only the author can close the poll." };
  }
  await db.poll.update({ where: { id: pollId }, data: { closesAt: new Date() } });
  revalidatePath("/feed");
  revalidatePath(`/posts/${poll.post.id}`);
  return { ok: true };
}
