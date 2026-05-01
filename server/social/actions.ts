"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { requireEmailVerified } from "@/lib/anti-spam";
import { extractHashtags, extractMentions } from "@/lib/social/extract";
import { findBannedWord, autoFlagContent } from "@/lib/social/banned-words";
import {
  ConnectionStatus,
  PostVisibility,
  ReactionType,
} from "@prisma/client";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

/**
 * Bouncer for actions that an unverified-email account should not be able
 * to perform: posting, commenting, connection requests, messaging, etc.
 * Lets verified users + admins through, redirects everyone else to the
 * verify-email page so the action becomes harmless instead of a silent
 * failure.
 */
async function requireUserVerified() {
  const session = await requireUser();
  try {
    await requireEmailVerified(session.user.id);
  } catch {
    redirect("/verify-email?required=1");
  }
  return session;
}

// ─── Posts ─────────────────────────────────────────────────

const postCreateSchema = z.object({
  body: z.string().min(1).max(8000),
  visibility: z.nativeEnum(PostVisibility).default(PostVisibility.PUBLIC),
  asCompanyId: z.string().optional(),
  attachedJobId: z.string().optional(),
  repostOfId: z.string().optional(),
});

export async function createPost(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  await rateLimitOrThrow(`post:${session.user.id}`, "message");

  const parsed = postCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { body, visibility, asCompanyId, attachedJobId, repostOfId } = parsed.data;

  // Optional "post as company" — only allowed if the user is a verified team
  // member of that company.
  if (asCompanyId) {
    const ok = await db.employerProfile.findFirst({
      where: { userId: session.user.id, companyId: asCompanyId },
      select: { id: true },
    });
    if (!ok) return;
  }

  // Reposts copy hashtags from the original to keep tag pages coherent.
  let inheritedTags: string[] = [];
  if (repostOfId) {
    const orig = await db.post.findUnique({ where: { id: repostOfId }, select: { hashtags: true, authorId: true } });
    if (!orig) return;
    inheritedTags = orig.hashtags;
  }

  // Shadow-ban check: if the author is shadow-banned, force visibility
  // to PRIVATE silently. The author keeps seeing their own posts
  // (because feed queries OR-include `authorId === viewerId`), but
  // they don't reach the public surface — that's the entire point.
  const author = await db.user.findUnique({
    where: { id: session.user.id },
    select: { shadowBannedAt: true },
  });
  const shadowBanned = !!author?.shadowBannedAt;

  // Auto-moderation — check the body against the admin-maintained
  // banned-word list BEFORE insert. If matched, we still create the
  // row (don't burn the user's draft) but force visibility=PRIVATE
  // so it's hidden from public feeds until a moderator approves.
  const bannedWord = await findBannedWord(body);
  const effectiveVisibility = (bannedWord || shadowBanned) ? "PRIVATE" : visibility;

  const post = await db.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: session.user.id,
        body,
        visibility: effectiveVisibility,
        asCompanyId: asCompanyId ?? null,
        attachedJobId: attachedJobId ?? null,
        repostOfId: repostOfId ?? null,
        hashtags: [...new Set([...extractHashtags(body), ...inheritedTags])],
        mentions: extractMentions(body),
      },
    });
    // Increment author's posts count + parent post's repost count
    await tx.candidateProfile.updateMany({
      where: { userId: session.user.id },
      data: { postsCount: { increment: 1 } },
    });
    if (repostOfId) {
      await tx.post.update({
        where: { id: repostOfId },
        data: { repostsCount: { increment: 1 } },
      });
    }
    return created;
  });

  // If we auto-flagged, push the report into the same /admin/post-reports
  // queue user-reports flow into. Done after the transaction so a stuck
  // audit-write doesn't block the post creation.
  if (bannedWord) {
    await autoFlagContent({
      entity: "Post",
      entityId: post.id,
      authorId: session.user.id,
      matchedWord: bannedWord,
      body,
    });
  }

  // Notify the original author of a repost
  if (repostOfId) {
    const orig = await db.post.findUnique({
      where: { id: repostOfId },
      select: { authorId: true, body: true },
    });
    if (orig && orig.authorId !== session.user.id) {
      await notificationsQueue.add("repost", {
        userId: orig.authorId,
        type: "social.repost",
        title: "Your post was reposted",
        body: body.slice(0, 140),
        link: `/posts/${post.id}`,
        channels: ["IN_APP"],
      });
    }
  }

  revalidatePath("/feed");
  revalidatePath(`/posts/${post.id}`);
  // Hashtag pages
  for (const tag of post.hashtags) revalidatePath(`/tag/${tag}`);
}

export async function deletePost(formData: FormData): Promise<void> {
  const session = await requireUser();
  const id = z.string().parse(formData.get("id"));
  const post = await db.post.findUnique({
    where: { id },
    select: { authorId: true, hashtags: true },
  });
  if (!post) return;
  if (post.authorId !== session.user.id && session.user.role !== "ADMIN") return;

  await db.$transaction(async (tx) => {
    await tx.post.delete({ where: { id } });
    await tx.candidateProfile.updateMany({
      where: { userId: post.authorId },
      data: { postsCount: { decrement: 1 } },
    });
  });

  revalidatePath("/feed");
  for (const tag of post.hashtags) revalidatePath(`/tag/${tag}`);
}

// ─── Reactions ─────────────────────────────────────────────

const reactionSchema = z.object({
  postId: z.string(),
  type: z.nativeEnum(ReactionType),
});

export async function togglePostReaction(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  const parsed = reactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await rateLimitOrThrow(`react:${session.user.id}`, "ats");

  const { postId, type } = parsed.data;
  const existing = await db.postReaction.findUnique({
    where: { postId_userId: { postId, userId: session.user.id } },
  });

  if (existing && existing.type === type) {
    // Toggle off
    await db.$transaction([
      db.postReaction.delete({ where: { postId_userId: { postId, userId: session.user.id } } }),
      db.post.update({ where: { id: postId }, data: { reactionsCount: { decrement: 1 } } }),
    ]);
  } else if (existing) {
    // Switch reaction type — count unchanged
    await db.postReaction.update({
      where: { postId_userId: { postId, userId: session.user.id } },
      data: { type },
    });
  } else {
    await db.$transaction([
      db.postReaction.create({ data: { postId, userId: session.user.id, type } }),
      db.post.update({ where: { id: postId }, data: { reactionsCount: { increment: 1 } } }),
    ]);
    // Notify post author
    const post = await db.post.findUnique({
      where: { id: postId },
      select: { authorId: true, body: true },
    });
    if (post && post.authorId !== session.user.id) {
      await notificationsQueue.add("reaction", {
        userId: post.authorId,
        type: "social.reaction",
        title: `Someone ${type.toLowerCase()}d your post`,
        body: post.body.slice(0, 140),
        link: `/posts/${postId}`,
        channels: ["IN_APP"],
      });
    }
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/feed");
}

// ─── Comments ──────────────────────────────────────────────

const commentSchema = z.object({
  postId: z.string(),
  body: z.string().min(1).max(4000),
  parentId: z.string().optional(),
});

export async function addComment(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  await rateLimitOrThrow(`comment:${session.user.id}`, "message");
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { postId, body, parentId } = parsed.data;
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { authorId: true, body: true },
  });
  if (!post) return;

  // Shadow-ban + auto-moderation — for comments we have a hiddenAt
  // column instead of a visibility flag, so we stamp it directly on
  // create. The author still sees their comment (the feed queries
  // hide it for non-author viewers); from their POV nothing's wrong.
  const author = await db.user.findUnique({
    where: { id: session.user.id },
    select: { shadowBannedAt: true },
  });
  const shadowBanned = !!author?.shadowBannedAt;
  const bannedWord = await findBannedWord(body);
  const shouldHide = shadowBanned || bannedWord;

  const comment = await db.$transaction(async (tx) => {
    const c = await tx.postComment.create({
      data: {
        postId,
        authorId: session.user.id,
        body,
        parentId: parentId ?? null,
        ...(shouldHide
          ? {
              hiddenAt: new Date(),
              hiddenReason: shadowBanned
                ? "auto: shadow-banned author"
                : `auto: matched banned word`,
            }
          : {}),
      },
    });
    await tx.post.update({
      where: { id: postId },
      data: { commentsCount: { increment: 1 } },
    });
    return c;
  });

  if (bannedWord) {
    await autoFlagContent({
      entity: "Comment",
      entityId: comment.id,
      authorId: session.user.id,
      matchedWord: bannedWord,
      body,
    });
  }

  // Notify post author (and parent comment author if it's a reply)
  if (post.authorId !== session.user.id) {
    await notificationsQueue.add("comment", {
      userId: post.authorId,
      type: "social.comment",
      title: "New comment on your post",
      body: body.slice(0, 140),
      link: `/posts/${postId}#comment-${comment.id}`,
      channels: ["IN_APP", "EMAIL"],
    });
  }
  if (parentId) {
    const parent = await db.postComment.findUnique({
      where: { id: parentId },
      select: { authorId: true },
    });
    if (parent && parent.authorId !== session.user.id && parent.authorId !== post.authorId) {
      await notificationsQueue.add("reply", {
        userId: parent.authorId,
        type: "social.reply",
        title: "Someone replied to your comment",
        body: body.slice(0, 140),
        link: `/posts/${postId}#comment-${comment.id}`,
        channels: ["IN_APP"],
      });
    }
  }

  revalidatePath(`/posts/${postId}`);
  revalidatePath("/feed");
}

export async function deleteComment(formData: FormData): Promise<void> {
  const session = await requireUser();
  const id = z.string().parse(formData.get("id"));
  const comment = await db.postComment.findUnique({
    where: { id },
    select: { authorId: true, postId: true },
  });
  if (!comment) return;
  if (comment.authorId !== session.user.id && session.user.role !== "ADMIN") return;

  await db.$transaction([
    db.postComment.delete({ where: { id } }),
    db.post.update({
      where: { id: comment.postId },
      data: { commentsCount: { decrement: 1 } },
    }),
  ]);
  revalidatePath(`/posts/${comment.postId}`);
}

// ─── Connections ───────────────────────────────────────────

const connectRequestSchema = z.object({
  recipientId: z.string(),
  message: z.string().max(300).optional(),
});

export async function requestConnection(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  await rateLimitOrThrow(`connect:${session.user.id}`, "saveItem");
  const parsed = connectRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { recipientId, message } = parsed.data;
  if (recipientId === session.user.id) return;

  const [a, b] = [session.user.id, recipientId].sort();
  // Idempotent: upsert a single row keyed on the pair
  const existing = await db.connection.findFirst({
    where: {
      OR: [
        { requesterId: session.user.id, recipientId },
        { requesterId: recipientId, recipientId: session.user.id },
      ],
    },
  });
  if (existing) {
    // If the other party already requested us, accept it.
    if (existing.recipientId === session.user.id && existing.status === "PENDING") {
      await acceptConnectionInternal(existing.id, session.user.id);
    }
    return;
  }
  void a; void b;

  await db.connection.create({
    data: {
      requesterId: session.user.id,
      recipientId,
      message: message ?? null,
      status: ConnectionStatus.PENDING,
    },
  });

  await notificationsQueue.add("connect-request", {
    userId: recipientId,
    type: "connection.request",
    title: "New connection request",
    body: message ?? "Someone wants to connect with you.",
    link: "/me/network",
    channels: ["IN_APP", "EMAIL"],
  });

  revalidatePath("/me/network");
}

async function acceptConnectionInternal(connectionId: string, byUserId: string) {
  const conn = await db.connection.findUnique({ where: { id: connectionId } });
  if (!conn) return;
  if (conn.recipientId !== byUserId || conn.status !== "PENDING") return;
  await db.$transaction([
    db.connection.update({
      where: { id: connectionId },
      data: { status: ConnectionStatus.ACCEPTED, acceptedAt: new Date() },
    }),
    db.candidateProfile.updateMany({
      where: { userId: { in: [conn.requesterId, conn.recipientId] } },
      data: { connectionsCount: { increment: 1 } },
    }),
  ]);
  await notificationsQueue.add("connect-accepted", {
    userId: conn.requesterId,
    type: "connection.accepted",
    title: "You're now connected",
    body: "Your connection request was accepted.",
    link: "/me/network",
    channels: ["IN_APP"],
  });
}

export async function respondConnection(formData: FormData): Promise<void> {
  const session = await requireUser();
  const id = z.string().parse(formData.get("id"));
  const accept = formData.get("accept") === "true";
  if (accept) {
    await acceptConnectionInternal(id, session.user.id);
  } else {
    await db.connection.updateMany({
      where: { id, recipientId: session.user.id, status: "PENDING" },
      data: { status: ConnectionStatus.DECLINED },
    });
  }
  revalidatePath("/me/network");
}

export async function withdrawConnection(formData: FormData): Promise<void> {
  const session = await requireUser();
  const id = z.string().parse(formData.get("id"));
  await db.connection.updateMany({
    where: { id, requesterId: session.user.id, status: "PENDING" },
    data: { status: ConnectionStatus.WITHDRAWN },
  });
  revalidatePath("/me/network");
}

export async function removeConnection(formData: FormData): Promise<void> {
  const session = await requireUser();
  const otherId = z.string().parse(formData.get("userId"));
  const conn = await db.connection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: session.user.id, recipientId: otherId },
        { requesterId: otherId, recipientId: session.user.id },
      ],
    },
  });
  if (!conn) return;
  await db.$transaction([
    db.connection.delete({ where: { id: conn.id } }),
    db.candidateProfile.updateMany({
      where: { userId: { in: [conn.requesterId, conn.recipientId] } },
      data: { connectionsCount: { decrement: 1 } },
    }),
  ]);
  revalidatePath("/me/network");
}

// ─── Follows ───────────────────────────────────────────────

export async function followUser(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  const followeeId = z.string().parse(formData.get("userId"));
  if (followeeId === session.user.id) return;
  await rateLimitOrThrow(`follow:${session.user.id}`, "saveItem");

  const existing = await db.follow.findUnique({
    where: { followerId_followeeUserId: { followerId: session.user.id, followeeUserId: followeeId } },
  });
  if (existing) return;

  await db.$transaction([
    db.follow.create({
      data: { followerId: session.user.id, followeeUserId: followeeId },
    }),
    db.candidateProfile.updateMany({
      where: { userId: session.user.id },
      data: { followingCount: { increment: 1 } },
    }),
    db.candidateProfile.updateMany({
      where: { userId: followeeId },
      data: { followersCount: { increment: 1 } },
    }),
  ]);
  await notificationsQueue.add("follow", {
    userId: followeeId,
    type: "social.follow",
    title: "Someone followed you",
    body: "You have a new follower on eMobility Careers.",
    link: "/me/network",
    channels: ["IN_APP"],
  });
}

export async function unfollowUser(formData: FormData): Promise<void> {
  const session = await requireUser();
  const followeeId = z.string().parse(formData.get("userId"));
  const existing = await db.follow.findUnique({
    where: { followerId_followeeUserId: { followerId: session.user.id, followeeUserId: followeeId } },
  });
  if (!existing) return;
  await db.$transaction([
    db.follow.delete({ where: { id: existing.id } }),
    db.candidateProfile.updateMany({
      where: { userId: session.user.id },
      data: { followingCount: { decrement: 1 } },
    }),
    db.candidateProfile.updateMany({
      where: { userId: followeeId },
      data: { followersCount: { decrement: 1 } },
    }),
  ]);
}

export async function followCompany(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  const companyId = z.string().parse(formData.get("companyId"));
  await rateLimitOrThrow(`follow:${session.user.id}`, "saveItem");
  const existing = await db.follow.findUnique({
    where: { followerId_followeeCompanyId: { followerId: session.user.id, followeeCompanyId: companyId } },
  });
  if (existing) return;
  await db.$transaction([
    db.follow.create({
      data: { followerId: session.user.id, followeeCompanyId: companyId },
    }),
    db.company.update({
      where: { id: companyId },
      data: { followersCount: { increment: 1 } },
    }),
  ]);
}

export async function unfollowCompany(formData: FormData): Promise<void> {
  const session = await requireUser();
  const companyId = z.string().parse(formData.get("companyId"));
  const existing = await db.follow.findUnique({
    where: { followerId_followeeCompanyId: { followerId: session.user.id, followeeCompanyId: companyId } },
  });
  if (!existing) return;
  await db.$transaction([
    db.follow.delete({ where: { id: existing.id } }),
    db.company.update({
      where: { id: companyId },
      data: { followersCount: { decrement: 1 } },
    }),
  ]);
}

// ─── Quick utility: share a job to the feed ────────────────

export async function shareJobToFeed(formData: FormData): Promise<void> {
  const session = await requireUserVerified();
  const jobId = z.string().parse(formData.get("jobId"));
  const note = String(formData.get("note") ?? "").slice(0, 1000);
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    select: { id: true, title: true, status: true, company: { select: { name: true } } },
  });
  if (!job || job.status !== "OPEN") return;

  const body =
    note ||
    `Open role at ${job.company.name}: ${job.title}. Worth a look! #evjobs`;

  await createPost(
    formDataFromObject({
      body,
      visibility: PostVisibility.PUBLIC,
      attachedJobId: jobId,
    }),
  );
}

function formDataFromObject(o: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
}

// Audit hook so admins can review social activity if needed.
void audit;
