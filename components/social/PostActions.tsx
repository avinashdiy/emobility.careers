"use client";

import { useState } from "react";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { deletePost } from "@/server/social/actions";
import { MoreHorizontal } from "lucide-react";

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
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-modal">
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
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  alert("Reporting will be available soon.");
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-emce-light-soft"
              >
                Report post
              </button>
            )}
            <a
              href={`/posts/${postId}`}
              className="block px-3 py-2 text-sm hover:bg-emce-light-soft"
            >
              Open post
            </a>
          </div>
        </>
      )}
    </div>
  );
}
