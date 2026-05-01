"use client";

import { useState } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { deletePost } from "@/server/social/actions";
import { MoreHorizontal } from "lucide-react";
import { ReportPostMenuItem } from "./ReportPostMenuItem";

export function PostActions({
  postId,
  authorId,
  viewerId,
}: {
  postId: string;
  authorId: string;
  viewerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isOwner = viewerId === authorId;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Post options"
        className="grid h-8 w-8 place-items-center rounded-full text-emce-text-sec hover:bg-emce-light-soft"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-72 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-modal">
            {isOwner ? (
              <form action={deletePost}>
                <input type="hidden" name="id" value={postId} />
                <ConfirmSubmit
                  confirm="Delete this post? This can't be undone."
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start rounded-none text-emce-red"
                >
                  Delete post
                </ConfirmSubmit>
              </form>
            ) : viewerId ? (
              // Only signed-in users can report — keeps the audit log
              // attributable. Logged-out folks see the menu but no
              // report option (anon abuse-reporting via IP-keyed rate
              // limit can come later if needed).
              <ReportPostMenuItem postId={postId} onClose={() => setOpen(false)} />
            ) : null}
            <a
              href={`/posts/${postId}`}
              className="block border-t border-emce-border px-3 py-2 text-sm hover:bg-emce-light-soft"
            >
              Open post
            </a>
          </div>
        </>
      )}
    </div>
  );
}
