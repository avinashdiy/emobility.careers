"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { requireEmailVerified, EmailNotVerifiedError } from "@/lib/anti-spam";
import { extractHashtags, extractMentions } from "@/lib/social/extract";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { isRouterControlError } from "@/lib/server-action-errors";
import { logger } from "@/lib/logger";
import type { FormState } from "@/lib/form-state";

/**
 * Resolve a list of mention slugs (e.g. ["alice", "bob-singh"]) to
 * the User IDs of the candidates with those slugs. Used to fan out
 * notifications when an answer or post @-mentions someone. Slugs
 * that don't resolve are silently dropped — typos shouldn't error.
 */
async function resolveMentionUserIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const profiles = await db.candidateProfile.findMany({
    where: { slug: { in: slugs } },
    select: { userId: true },
  });
  return profiles.map((p) => p.userId);
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

const AnswerSchema = z.object({
  postId: z.string().min(1),
  body: z.string().trim().min(20).max(20_000),
});

/**
 * Submit an answer to a QUESTION-kind post. Email verification is
 * required (same gate as posting) so we don't get drive-by spam from
 * unverified accounts. Refuses to attach answers to non-QUESTION posts
 * so the data stays clean.
 *
 * Returns a FormState for callers that want to surface errors via
 * useActionState. Server-component <form action={…}> callsites should
 * use the void wrapper at the bottom of this file instead.
 */
export async function submitAnswerWithState(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  try {
    await requireEmailVerified(session.user.id);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) {
      return { ok: false, message: "Verify your email before answering. Check your inbox for the link." };
    }
    throw e;
  }

  await rateLimitOrThrow(`answer:${session.user.id}`, "message").catch(() => undefined);

  const parsed = AnswerSchema.safeParse({
    postId: formData.get("postId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Answer must be 20–20,000 characters.",
    };
  }

  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    select: { id: true, kind: true, authorId: true, visibility: true },
  });
  if (!post) return { ok: false, message: "Question not found." };
  if (post.kind !== "QUESTION") {
    return { ok: false, message: "Answers can only be added to questions." };
  }
  if (post.authorId === session.user.id) {
    return { ok: false, message: "You can't answer your own question — edit the question instead." };
  }

  // Visibility gate — mirrors the post detail page's logic so a direct
  // form post can't bypass the read-side hide. Private questions are
  // unanswerable by anyone but the asker (already blocked above);
  // CONNECTIONS questions require an accepted connection.
  if (post.visibility === "PRIVATE") {
    return { ok: false, message: "Question not found." };
  }
  if (post.visibility === "CONNECTIONS") {
    const conn = await db.connection.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: session.user.id, recipientId: post.authorId },
          { requesterId: post.authorId, recipientId: session.user.id },
        ],
      },
      select: { id: true },
    });
    if (!conn) return { ok: false, message: "Question not found." };
  }

  const hashtags = extractHashtags(parsed.data.body);
  const mentions = extractMentions(parsed.data.body);

  // Create the answer + bump Post.answerCount inside one transaction
  // so feed-card display, post-detail aggregate, and the row itself
  // can never disagree.
  const answer = await db.$transaction(async (tx) => {
    const created = await tx.answer.create({
      data: {
        postId: post.id,
        authorId: session.user.id,
        body: parsed.data.body,
        hashtags,
        mentions,
      },
    });
    await tx.post.update({
      where: { id: post.id },
      data: { answerCount: { increment: 1 } },
    });
    return created;
  });

  await audit({
    actorId: session.user.id,
    action: "answer.created",
    entity: "Answer",
    entityId: answer.id,
    meta: { postId: post.id },
  });

  // Notify the question author + everyone @-mentioned in the answer.
  // De-dupe so a self-mention or a mention of the question author
  // doesn't cause double pings, and skip the answerer themselves.
  const mentionUserIds = await resolveMentionUserIds(mentions);
  const recipients = new Set<string>([post.authorId, ...mentionUserIds]);
  recipients.delete(session.user.id);

  for (const userId of recipients) {
    const isAuthor = userId === post.authorId;
    await dispatchNotification({
      userId,
      type: isAuthor ? "social.answer" : "social.mention",
      title: isAuthor
        ? "New answer to your question"
        : "You were mentioned in an answer",
      body: parsed.data.body.slice(0, 140),
      link: `/posts/${post.id}#answer-${answer.id}`,
      channels: ["IN_APP", "EMAIL"],
    }).catch(() => undefined);
  }

  revalidatePath(`/posts/${post.id}`);
  return { ok: true };
}

const EditAnswerSchema = z.object({
  id: z.string().min(1),
  body: z.string().trim().min(20).max(20_000),
});

export async function editAnswerWithState(formData: FormData): Promise<FormState> {
  try {
    const session = await requireUser();
    const parsed = EditAnswerSchema.safeParse({
      id: formData.get("id"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const answer = await db.answer.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, authorId: true, postId: true },
    });
    if (!answer) return { ok: false, message: "Answer not found." };
    if (answer.authorId !== session.user.id && session.user.role !== "ADMIN") {
      return { ok: false, message: "You can only edit your own answers." };
    }

    await db.answer.update({
      where: { id: answer.id },
      data: {
        body: parsed.data.body,
        hashtags: extractHashtags(parsed.data.body),
        mentions: extractMentions(parsed.data.body),
      },
    });
    revalidatePath(`/posts/${answer.postId}`);
    return { ok: true };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[answer-edit] unhandled error");
    return { ok: false, message: "Couldn't save the edit — try again in a moment." };
  }
}

export async function deleteAnswerWithState(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const id = z.string().parse(formData.get("id"));

  const answer = await db.answer.findUnique({
    where: { id },
    select: { id: true, authorId: true, postId: true },
  });
  if (!answer) return { ok: false, message: "Answer not found." };
  if (answer.authorId !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, message: "You can only delete your own answers." };
  }

  await db.$transaction(async (tx) => {
    await tx.answer.delete({ where: { id: answer.id } });
    await tx.post.update({
      where: { id: answer.postId },
      data: { answerCount: { decrement: 1 } },
    });
  });
  revalidatePath(`/posts/${answer.postId}`);
  return { ok: true };
}

/**
 * Toggle a "helpful" vote on an answer. Refuses self-votes (you can't
 * upvote your own answer). Updates the denormalised `helpfulCount` on
 * the answer in the same transaction so the sort order on the post
 * detail page stays consistent without needing a separate aggregate.
 */
export async function toggleAnswerHelpfulWithState(formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const answerId = z.string().parse(formData.get("answerId"));

  const answer = await db.answer.findUnique({
    where: { id: answerId },
    select: { id: true, authorId: true, postId: true },
  });
  if (!answer) return { ok: false, message: "Answer not found." };
  if (answer.authorId === session.user.id) {
    return { ok: false, message: "You can't vote on your own answer." };
  }

  const existing = await db.answerHelpful.findUnique({
    where: { answerId_userId: { answerId, userId: session.user.id } },
  });

  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.answerHelpful.delete({
        where: { answerId_userId: { answerId, userId: session.user.id } },
      });
      await tx.answer.update({
        where: { id: answerId },
        data: { helpfulCount: { decrement: 1 } },
      });
    } else {
      await tx.answerHelpful.create({
        data: { answerId, userId: session.user.id },
      });
      await tx.answer.update({
        where: { id: answerId },
        data: { helpfulCount: { increment: 1 } },
      });
    }
  });

  revalidatePath(`/posts/${answer.postId}`);
  return { ok: true };
}

// ─── void-returning wrappers for direct <form action={…}> usage ──
//
// React's form action prop in a server component expects
// Promise<void>. The *WithState versions above return FormState for
// useActionState callers; these thin wrappers translate validation
// failures into a redirect-with-error so the user gets feedback even
// when the form is wired directly. Posts that no longer exist or
// permission errors land back on the originating post page with a
// short notice in the URL.

function answerErrorRedirect(formData: FormData, message: string): never {
  const postIdRaw = formData.get("postId");
  const back =
    typeof postIdRaw === "string" && postIdRaw.length > 0
      ? `/posts/${postIdRaw}`
      : "/feed";
  redirect(`${back}?error=` + encodeURIComponent(message));
}

export async function submitAnswer(formData: FormData): Promise<void> {
  const r = await submitAnswerWithState(formData);
  if (!r.ok) answerErrorRedirect(formData, r.message ?? "Couldn't post your answer.");
}

export async function editAnswer(formData: FormData): Promise<void> {
  const r = await editAnswerWithState(formData);
  if (!r.ok) answerErrorRedirect(formData, r.message ?? "Couldn't update your answer.");
}

export async function deleteAnswer(formData: FormData): Promise<void> {
  const r = await deleteAnswerWithState(formData);
  if (!r.ok) answerErrorRedirect(formData, r.message ?? "Couldn't delete your answer.");
}

export async function toggleAnswerHelpful(formData: FormData): Promise<void> {
  const r = await toggleAnswerHelpfulWithState(formData);
  if (!r.ok) {
    // Helpful-toggle is fire-and-forget on every Q&A card; a redirect
    // would jar the scroll position. Quietly log instead of bouncing.
    logger.warn({ message: r.message }, "[toggleAnswerHelpful] failed silently");
  }
}
