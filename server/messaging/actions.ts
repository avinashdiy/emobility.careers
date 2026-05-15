"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { realtime, channels, events } from "@/lib/realtime";
import { notificationsQueue } from "@/lib/queues";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { requireEmailVerified, EmailNotVerifiedError } from "@/lib/anti-spam";

async function ensureThreadAccess(threadId: string, userId: string, role: string) {
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    include: {
      application: {
        include: {
          candidate: { select: { userId: true } },
          job: { include: { company: { include: { team: true } } } },
        },
      },
    },
  });
  if (!thread) return null;
  if (role === "ADMIN") return thread;
  const allowed =
    thread.candidateUserId === userId ||
    thread.employerUserId === userId ||
    thread.application?.candidate.userId === userId ||
    thread.application?.job.company.team.some((t) => t.userId === userId);
  return allowed ? thread : null;
}

/**
 * Cold-outreach DM from a recruiter (or admin) to a candidate. Used
 * by the "Message" button on the candidate's public profile when
 * the viewer is an employer. Upserts on (candidateUserId,
 * employerUserId, applicationId=null) so re-clicking the button
 * always lands the recruiter back in the same thread instead of
 * spawning duplicates.
 *
 * The schema (MessageThread.candidateUserId + employerUserId) was
 * always meant for this case — it just had no UI hook before, so
 * recruiters reported "can't message candidates from their profile".
 */
export async function startDirectThread(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const candidateUserId = z.string().min(1).parse(formData.get("candidateUserId"));
  if (candidateUserId === session.user.id) {
    redirect("/me/messages");
  }
  // Sanity: the target must actually have a candidate persona, else
  // we'd be creating a meaningless thread.
  const candidate = await db.candidateProfile.findUnique({
    where: { userId: candidateUserId },
    select: { userId: true },
  });
  if (!candidate) redirect("/employer");

  // Find-or-create the cold-outreach thread. We can't use `upsert`
  // because the unique key is the (candidateUserId, employerUserId,
  // applicationId=null) triple and Prisma doesn't have a composite
  // unique constraint for the application-null case — so we do a
  // findFirst + create. Idempotent under concurrent clicks because
  // a duplicate `create` would just produce a second thread that
  // the next click picks up; not perfect, but acceptable for cold
  // outreach (the recruiter sees both rows in their inbox if they
  // race themselves; they don't).
  const existing = await db.messageThread.findFirst({
    where: {
      applicationId: null,
      candidateUserId,
      employerUserId: session.user.id,
    },
    select: { id: true },
  });
  const thread =
    existing ??
    (await db.messageThread.create({
      data: {
        candidateUserId,
        employerUserId: session.user.id,
      },
      select: { id: true },
    }));

  redirect(`/employer/messages/${thread.id}`);
}

export async function startThreadFromApplication(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const applicationId = z.string().parse(formData.get("applicationId"));
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: { select: { userId: true } },
      job: { include: { company: { include: { team: true } } } },
    },
  });
  if (!application) redirect("/employer");
  // Authorization
  const role = session.user.role;
  const isCand = application.candidate.userId === session.user.id;
  const isTeam = application.job.company.team.some((t) => t.userId === session.user.id);
  if (role !== "ADMIN" && !isCand && !isTeam) redirect("/403");

  const thread = await db.messageThread.upsert({
    where: { applicationId },
    create: {
      applicationId,
      candidateUserId: application.candidate.userId,
      employerUserId: isTeam ? session.user.id : undefined,
    },
    update: {},
  });

  redirect(role === "CANDIDATE" ? `/me/messages/${thread.id}` : `/employer/messages/${thread.id}`);
}

const sendSchema = z.object({
  threadId: z.string(),
  body: z.string().min(1).max(4000),
});

export async function sendMessage(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Block unverified accounts from messaging — keeps newly-created spam
  // accounts from DM-bombing recruiters before they click the verify link.
  try {
    await requireEmailVerified(session.user.id);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) redirect("/verify-email?required=1");
    throw e;
  }
  await rateLimitOrThrow(`message:${session.user.id}`, "message");
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const thread = await ensureThreadAccess(parsed.data.threadId, session.user.id, session.user.role);
  if (!thread) redirect("/403");

  const message = await db.message.create({
    data: {
      threadId: thread.id,
      senderId: session.user.id,
      body: parsed.data.body,
    },
  });

  await db.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Realtime push
  try {
    await realtime.trigger(channels.thread(thread.id), events.message, {
      id: message.id,
      threadId: thread.id,
      senderId: session.user.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    });
  } catch {
    // Soketi might not be running — in-app notification still fires below
  }

  // Notify the other side
  const recipientUserId =
    thread.candidateUserId && thread.candidateUserId !== session.user.id
      ? thread.candidateUserId
      : thread.employerUserId && thread.employerUserId !== session.user.id
      ? thread.employerUserId
      : null;
  if (recipientUserId) {
    await notificationsQueue.add("message", {
      userId: recipientUserId,
      type: "message.new",
      title: "New message",
      body: parsed.data.body.slice(0, 140),
      link: session.user.role === "CANDIDATE" ? `/employer/messages/${thread.id}` : `/me/messages/${thread.id}`,
      channels: ["IN_APP", "EMAIL"],
    });
  }

  revalidatePath(`/me/messages/${thread.id}`);
  revalidatePath(`/employer/messages/${thread.id}`);
}

// ─── Share post via DM ───────────────────────────────────────
//
// LinkedIn-style "Send" feature on a post: the user picks one or more
// connections, optionally adds a note, and we drop the post URL into
// each chosen recipient's DM thread. Reuses the existing
// MessageThread + Message tables — for peer-to-peer threads (which
// are technically outside the original candidate↔employer naming),
// we canonicalise the participant pair (smaller userId →
// candidateUserId, larger → employerUserId) so the same pair always
// maps to the same thread regardless of who initiated.

const sharePostSchema = z.object({
  postId: z.string().min(1),
  recipientIds: z.array(z.string().min(1)).min(1).max(20),
  note: z.string().trim().max(2000).optional(),
});

export async function sharePostViaMessage(input: {
  postId: string;
  recipientIds: string[];
  note?: string;
}): Promise<{ ok: boolean; sent: number; message?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, sent: 0, message: "Sign in first." };
  try {
    await requireEmailVerified(session.user.id);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) {
      return { ok: false, sent: 0, message: "Verify your email before sharing." };
    }
    throw e;
  }
  await rateLimitOrThrow(`share:${session.user.id}`, "message").catch(() => undefined);

  const parsed = sharePostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, sent: 0, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Verify the post exists + caller can see it. PRIVATE posts can't be
  // shared (the recipient wouldn't be able to open the link anyway);
  // CONNECTIONS-only posts are sharable since recipients of the share
  // are by definition connections of the sender (we restrict
  // recipientIds to accepted connections below).
  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    select: { id: true, visibility: true, body: true, kind: true, articleTitle: true },
  });
  if (!post) return { ok: false, sent: 0, message: "Post not found." };
  if (post.visibility === "PRIVATE") {
    return { ok: false, sent: 0, message: "Private posts can't be shared." };
  }

  // Lock recipientIds to the sender's accepted connections. Without
  // this, anyone could DM-bomb arbitrary users by stuffing IDs into
  // the request. Also de-dupe + drop self.
  const dedup = [...new Set(parsed.data.recipientIds)].filter(
    (id) => id !== session.user.id,
  );
  const validConnections = await db.connection.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: session.user.id, recipientId: { in: dedup } },
        { recipientId: session.user.id, requesterId: { in: dedup } },
      ],
    },
    select: { requesterId: true, recipientId: true },
  });
  const allowedRecipients = new Set(
    validConnections.map((c) =>
      c.requesterId === session.user.id ? c.recipientId : c.requesterId,
    ),
  );
  const recipients = dedup.filter((id) => allowedRecipients.has(id));
  if (recipients.length === 0) {
    return {
      ok: false,
      sent: 0,
      message: "Pick at least one connection. You can only DM accepted connections.",
    };
  }

  // Compose body once. Title for ARTICLEs, first 140 chars of body
  // otherwise, plus the canonical link. Note appears on its own line.
  const linkBody =
    post.kind === "ARTICLE" && post.articleTitle
      ? post.articleTitle
      : post.body.slice(0, 140);
  const url = `/posts/${post.id}`;
  const composed = parsed.data.note
    ? `${parsed.data.note.trim()}\n\n${linkBody}\n${url}`
    : `${linkBody}\n${url}`;

  let sent = 0;
  for (const recipientId of recipients) {
    // Canonical pair so the same two users always land in the same
    // thread, regardless of who shares first. This avoids accidentally
    // creating two parallel threads (one with A in candidateUserId,
    // one with A in employerUserId) for the same conversation.
    const [low, high] = [session.user.id, recipientId].sort();

    // No @@unique on (candidateUserId, employerUserId) on MessageThread
    // — applicationId is the only unique key — so we manual find-or-
    // create. Canonical pair sort above means subsequent sends in
    // either direction land in the same thread. Concurrent first-shares
    // can race and create two rows; acceptable for v1 (low-frequency
    // feature). A composite @@unique can be added later if drift
    // becomes a problem.
    let threadRow = await db.messageThread.findFirst({
      where: {
        applicationId: null,
        candidateUserId: low,
        employerUserId: high,
      },
      select: { id: true },
    });
    if (!threadRow) {
      threadRow = await db.messageThread.create({
        data: { candidateUserId: low, employerUserId: high },
        select: { id: true },
      });
    }
    const threadId = threadRow.id;

    await db.message.create({
      data: {
        threadId,
        senderId: session.user.id,
        body: composed,
      },
    });
    await db.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
    sent += 1;

    // Notify the recipient. Best-effort — a queue outage shouldn't
    // roll back the message itself, which has already been written.
    await notificationsQueue
      .add("post-shared", {
        userId: recipientId,
        type: "message.received",
        title: "A connection shared a post with you",
        body: parsed.data.note ? parsed.data.note.slice(0, 140) : linkBody.slice(0, 140),
        link: `/me/messages/${threadId}`,
        channels: ["IN_APP", "EMAIL"],
      })
      .catch(() => undefined);
  }

  return { ok: true, sent };
}

/**
 * Returns the current user's accepted connections, for the
 * Send-via-DM picker. Light shape — just enough to render an
 * avatar + name + headline row in the modal. Sorted by recent
 * activity so the most-relevant people surface first.
 *
 * Optional `q` filters by candidateProfile firstName / lastName /
 * headline (case-insensitive substring) so the modal can have a
 * search input that filters live without a second round-trip.
 */
export async function getMyConnectionsForShare(
  q?: string,
): Promise<
  Array<{
    userId: string;
    name: string;
    headline: string | null;
    profilePhotoUrl: string | null;
    slug: string;
  }>
> {
  const session = await auth();
  if (!session?.user) return [];

  const trimmed = (q ?? "").trim();
  const nameFilter = trimmed.length >= 1
    ? {
        OR: [
          { firstName: { contains: trimmed, mode: "insensitive" as const } },
          { lastName: { contains: trimmed, mode: "insensitive" as const } },
          { headline: { contains: trimmed, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const connections = await db.connection.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: session.user.id }, { recipientId: session.user.id }],
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      requesterId: true,
      recipientId: true,
      requester: {
        select: {
          id: true,
          candidateProfile: {
            select: { slug: true, firstName: true, lastName: true, headline: true, profilePhotoUrl: true },
          },
        },
      },
      recipient: {
        select: {
          id: true,
          candidateProfile: {
            select: { slug: true, firstName: true, lastName: true, headline: true, profilePhotoUrl: true },
          },
        },
      },
    },
  });

  const peers = connections.map((c) =>
    c.requesterId === session.user.id ? c.recipient : c.requester,
  );

  return peers
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.candidateProfile))
    .filter((p) => {
      if (!nameFilter) return true;
      const cp = p.candidateProfile!;
      const fn = cp.firstName.toLowerCase();
      const ln = (cp.lastName ?? "").toLowerCase();
      const hl = (cp.headline ?? "").toLowerCase();
      const t = trimmed.toLowerCase();
      return fn.includes(t) || ln.includes(t) || hl.includes(t);
    })
    .map((p) => {
      const cp = p.candidateProfile!;
      return {
        userId: p.id,
        name: `${cp.firstName} ${cp.lastName ?? ""}`.trim(),
        headline: cp.headline,
        profilePhotoUrl: cp.profilePhotoUrl,
        slug: cp.slug,
      };
    });
}
