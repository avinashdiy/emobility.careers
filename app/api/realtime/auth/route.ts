import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { realtime } from "@/lib/realtime";
import { db } from "@/lib/db";

/**
 * Pusher / Soketi private-channel auth endpoint.
 * Verifies the user can subscribe to the requested channel before signing.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const form = await req.formData();
  const socketId = String(form.get("socket_id") ?? "");
  const channel = String(form.get("channel_name") ?? "");
  if (!socketId || !channel) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  if (channel === `private-user-${session.user.id}`) {
    // own channel — OK
  } else if (channel.startsWith("private-thread-")) {
    const threadId = channel.replace("private-thread-", "");
    const thread = await db.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

    const allowed = await isThreadParticipant(
      thread.candidateUserId,
      thread.employerUserId,
      thread.applicationId,
      session.user.id,
      session.user.role,
    );
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "channel not allowed" }, { status: 403 });
  }

  const payload = realtime.authorizeChannel(socketId, channel);
  return NextResponse.json(payload);
}

async function isThreadParticipant(
  candidateUserId: string | null,
  employerUserId: string | null,
  applicationId: string | null,
  userId: string,
  role: string,
): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (candidateUserId === userId || employerUserId === userId) return true;
  if (applicationId) {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      include: { candidate: true, job: { include: { company: { include: { team: true } } } } },
    });
    if (!app) return false;
    if (app.candidate.userId === userId) return true;
    if (app.job.company.team.some((t) => t.userId === userId)) return true;
  }
  return false;
}
