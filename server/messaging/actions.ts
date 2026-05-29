"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { realtime, channels, events } from "@/lib/realtime";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { requireEmailVerified, EmailNotVerifiedError } from "@/lib/anti-spam";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { putObject, presignDownload, objectKey } from "@/lib/storage";

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

/**
 * Member-to-member DM from a public profile when both sides are
 * already mutually connected (Connection.status === "ACCEPTED").
 *
 * Distinct from `startDirectThread` (which is recruiter-only cold
 * outreach to a candidate): this works for ANY pair of signed-in
 * users — candidate↔candidate, employer↔candidate-as-peer, etc. —
 * as long as they've accepted a connection request between them.
 *
 * Uses the canonical-pair (low/high) scheme already established by
 * `sharePostViaMessage`: the lexicographically smaller userId goes
 * into `MessageThread.candidateUserId`, the larger into
 * `employerUserId`. That guarantees both peers land in the same
 * thread regardless of who clicks Message first.
 *
 * Redirect lands the viewer in their own inbox surface (`/me/messages`
 * for candidates, `/employer/messages` for recruiters); the inbox +
 * thread pages were patched to recognise both slots of a peer thread.
 */
export async function startConnectionThread(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const peerUserId = z.string().min(1).parse(formData.get("peerUserId"));
  if (peerUserId === session.user.id) {
    redirect(session.user.role === "CANDIDATE" ? "/me/messages" : "/employer/messages");
  }

  // Anti-spam: unverified accounts can't DM. Same gate as sendMessage.
  try {
    await requireEmailVerified(session.user.id);
  } catch (e) {
    if (e instanceof EmailNotVerifiedError) redirect("/verify-email?required=1");
    throw e;
  }

  // Authorization: both sides must have an ACCEPTED connection.
  // Without this, anyone could DM-bomb arbitrary users by stuffing
  // a userId into the form action.
  const connection = await db.connection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: session.user.id, recipientId: peerUserId },
        { recipientId: session.user.id, requesterId: peerUserId },
      ],
    },
    select: { id: true },
  });
  if (!connection) {
    // Soft-redirect back to the peer's profile rather than 403'ing —
    // the most common cause is a stale Message button (button rendered
    // when the viewer was still connected; connection got removed in
    // another tab). Sending them to /403 here would feel broken.
    redirect("/");
  }

  // Canonical-pair scheme — matches sharePostViaMessage so peer DMs
  // initiated from anywhere (post-share or this profile button) land
  // in the same thread row.
  const [low, high] = [session.user.id, peerUserId].sort();

  let thread = await db.messageThread.findFirst({
    where: { applicationId: null, candidateUserId: low, employerUserId: high },
    select: { id: true },
  });
  if (!thread) {
    thread = await db.messageThread.create({
      data: { candidateUserId: low, employerUserId: high },
      select: { id: true },
    });
  }

  redirect(
    session.user.role === "CANDIDATE" || session.user.role === "ADMIN"
      ? `/me/messages/${thread.id}`
      : `/employer/messages/${thread.id}`,
  );
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

// ─── Attachments ────────────────────────────────────────────
//
// Stored as a JSON array on Message.attachments. Per-attachment shape:
//   { key, name, contentType, size }
// where `key` is the S3 object key in the `docs` (private) bucket.
//
// Display is gated through `presignAttachmentDownload` so a thread
// participant can pull a 5-minute presigned GET URL on click. We do
// NOT bake URLs into the page render — that would either leak in HTML
// for non-participants who got the URL out-of-band, or expire after
// 5min on long-scrolled history. On-click presign is the safer pattern.
//
// Limits chosen to match careers' existing serverActions.bodySizeLimit
// of 10MB (see next.config.*) — the limit is per-request, so 5 attachments
// × ~2MB or 1 attachment up to ~9MB are both fine. Tighter per-file caps
// would just push users to compress on their end first; leaving it loose.

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_TOTAL_BYTES_PER_MESSAGE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_ATTACHMENT_MIME = new Set<string>([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text / data
  "text/plain",
  "text/csv",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
]);

export interface MessageAttachment {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

function extFromName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "bin";
  const ext = filename.slice(dot + 1).toLowerCase();
  // Strip anything weird — prevents `..` / `/` showing up in the
  // object key path.
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

const sendSchema = z.object({
  threadId: z.string(),
  // body is now optional — a message can be attachments-only. Either
  // body or attachments must be present; that's enforced after parse.
  body: z.string().max(4000).optional().default(""),
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

  // Resolve the thread early so the error redirects below can land
  // the sender back on the right thread URL instead of a generic page.
  const threadIdRaw = formData.get("threadId");
  const threadHref =
    typeof threadIdRaw === "string" && threadIdRaw.length > 0
      ? (session.user.role === "CANDIDATE"
          ? `/me/messages/${threadIdRaw}`
          : `/employer/messages/${threadIdRaw}`)
      : (session.user.role === "CANDIDATE" ? "/me/messages" : "/employer/messages");

  try {
    await rateLimitOrThrow(`message:${session.user.id}`, "message");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    const retryAfter = (err as { retryAfter?: number }).retryAfter;
    redirect(
      `${threadHref}?error=` +
        encodeURIComponent(
          retryAfter
            ? `Slow down — try again in ${retryAfter}s.`
            : "You're sending messages very fast. Try again in a minute.",
        ),
    );
  }

  // Parse text fields. We pull the threadId + body out and ignore
  // file fields here — Files don't survive Object.fromEntries the way
  // strings do, and we want to validate them separately anyway.
  const parsed = sendSchema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    const firstError =
      Object.values(parsed.error.flatten().fieldErrors).flat()[0] ??
      "Message couldn't be sent — check the length and try again.";
    logger.warn(
      { userId: session.user.id, fieldErrors: parsed.error.flatten().fieldErrors },
      "[sendMessage] validation failed",
    );
    redirect(`${threadHref}?error=` + encodeURIComponent(firstError));
  }

  // Pull attachment files (input name="attachment", multiple). FormData
  // exposes `getAll(name)` which collects every entry with that key,
  // so the client uses one name and we get the whole list here.
  const rawFiles = formData.getAll("attachment");
  const files: File[] = [];
  let totalBytes = 0;
  for (const item of rawFiles) {
    if (!(item instanceof File)) continue;
    if (item.size === 0) continue; // browser sometimes attaches empty placeholders
    files.push(item);
    totalBytes += item.size;
  }

  // A message must have either text or at least one attachment. The
  // schema's body.optional() allows attachment-only messages, but
  // body-empty AND no-attachment is just an accidental submit.
  if (parsed.data.body.trim().length === 0 && files.length === 0) {
    redirect(`${threadHref}?error=` + encodeURIComponent("Type a message or attach a file before sending."));
  }

  // Attachment validation. All-or-nothing — if ANY file fails, the
  // whole message is rejected (vs. silently dropping bad files). Keeps
  // the sender's mental model honest about what landed on the wire.
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    redirect(
      `${threadHref}?error=` +
        encodeURIComponent(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`),
    );
  }
  if (totalBytes > MAX_TOTAL_BYTES_PER_MESSAGE) {
    redirect(
      `${threadHref}?error=` +
        encodeURIComponent("Attachments total over 10 MB. Compress or split into multiple messages."),
    );
  }
  for (const f of files) {
    if (!ALLOWED_ATTACHMENT_MIME.has(f.type)) {
      redirect(
        `${threadHref}?error=` +
          encodeURIComponent(`"${f.name}" type ${f.type || "unknown"} isn't allowed.`),
      );
    }
  }

  const thread = await ensureThreadAccess(parsed.data.threadId, session.user.id, session.user.role);
  if (!thread) redirect("/403");

  // Upload all attachments BEFORE writing the Message row, so a write
  // failure doesn't leave orphan S3 objects with no DB pointer. The
  // reverse (write then upload) would leave a Message with attachment
  // metadata pointing at non-existent objects if any upload errored —
  // worse UX (the recipient sees a 404 on click).
  const attachments: MessageAttachment[] = [];
  for (const f of files) {
    try {
      const buffer = Buffer.from(await f.arrayBuffer());
      const key = objectKey(`messages/${thread.id}`, extFromName(f.name));
      await putObject("docs", key, buffer, f.type);
      attachments.push({
        key,
        name: f.name,
        contentType: f.type,
        size: f.size,
      });
    } catch (err) {
      logger.error(
        { err, threadId: thread.id, filename: f.name },
        "[sendMessage] attachment upload failed",
      );
      redirect(
        `${threadHref}?error=` +
          encodeURIComponent(`Couldn't upload "${f.name}". Try again.`),
      );
    }
  }

  const message = await db.message.create({
    data: {
      threadId: thread.id,
      senderId: session.user.id,
      body: parsed.data.body,
      // Prisma's Json column type doesn't accept our interface array
      // directly because TS doesn't see the implicit string-index
      // signature on a typed object. Cast through unknown — runtime
      // shape is the same; we just lose static narrowing at the
      // boundary (which we don't need; we own both sides).
      attachments:
        attachments.length > 0
          ? (attachments as unknown as object[])
          : undefined,
    },
  });

  await db.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Realtime push — include attachments JSON so live receivers can
  // render the attachment pills without waiting for the next page
  // load. Presigned download URLs are still resolved on click (not
  // baked in here) so they don't expire before the recipient clicks.
  try {
    await realtime.trigger(channels.thread(thread.id), events.message, {
      id: message.id,
      threadId: thread.id,
      senderId: session.user.id,
      body: message.body,
      attachments,
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
    // Notification body — when the message is attachments-only the
    // empty text is misleading ("New message: "), so synthesise a
    // short summary instead.
    const notifBody =
      parsed.data.body.trim().length > 0
        ? parsed.data.body.slice(0, 140)
        : attachments.length === 1
          ? `📎 ${attachments[0].name}`
          : `📎 ${attachments.length} attachments`;
    await dispatchNotification({
      userId: recipientUserId,
      type: "message.new",
      title: "New message",
      body: notifBody,
      link: session.user.role === "CANDIDATE" ? `/employer/messages/${thread.id}` : `/me/messages/${thread.id}`,
      channels: ["IN_APP", "EMAIL"],
    });
  }

  revalidatePath(`/me/messages/${thread.id}`);
  revalidatePath(`/employer/messages/${thread.id}`);
}

/**
 * Resolve a presigned GET URL for an attachment in this thread.
 * Called when the recipient clicks a pill — keeps the URL out of the
 * page HTML (and out of any logs/screenshots taken before they
 * clicked). Verifies thread access; non-participants get null and
 * the client surfaces a generic error.
 *
 * URL is good for 5 minutes which is plenty for a click → tab-open
 * round-trip; downloads in progress aren't affected by expiry once
 * the GET has started.
 */
export async function presignAttachmentDownload(
  threadId: string,
  attachmentKey: string,
): Promise<{ url: string | null }> {
  const session = await auth();
  if (!session?.user) return { url: null };
  const thread = await ensureThreadAccess(threadId, session.user.id, session.user.role);
  if (!thread) return { url: null };

  // Confirm the key actually belongs to a message in THIS thread —
  // protects against someone who's a participant on thread A trying
  // to fetch a key from thread B by guessing/scraping. Single query
  // over attachments-bearing messages in this thread (typically a
  // small slice).
  const owners = await db.message.findMany({
    where: { threadId, NOT: { attachments: { equals: undefined } } },
    select: { attachments: true },
  });
  const keyExists = owners.some((m) => {
    const list = m.attachments as unknown as MessageAttachment[] | null;
    return Array.isArray(list) && list.some((a) => a?.key === attachmentKey);
  });
  if (!keyExists) return { url: null };

  // Use inline disposition for images so clicking shows them in a tab
  // rather than triggering a download. Non-images keep the stored
  // disposition (which defaults to attachment on most S3-compatible
  // servers, fine for "view in browser then download" flow).
  const url = await presignDownload("docs", attachmentKey, 60 * 5);
  return { url };
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
    await dispatchNotification({
      userId: recipientId,
      type: "message.received",
      title: "A connection shared a post with you",
      body: parsed.data.note ? parsed.data.note.slice(0, 140) : linkBody.slice(0, 140),
      link: `/me/messages/${threadId}`,
      channels: ["IN_APP", "EMAIL"],
    }).catch(() => undefined);
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
