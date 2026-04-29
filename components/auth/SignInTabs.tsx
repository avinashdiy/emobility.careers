"use client";

import { useState } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";

interface Props {
  next?: string;
  passwordLabels: React.ComponentProps<typeof SignInForm>["labels"];
  magicLinkLabels: { tab: string; email: string; button: string; pending: string; help: string };
  passwordTabLabel: string;
}

/**
 * Two-tab sign-in: password (default) and magic link. Tabs are client-side
 * state — no URL change, no extra navigation. Each tab keeps its own form
 * state independently.
 */
export function SignInTabs({ next, passwordLabels, magicLinkLabels, passwordTabLabel }: Props) {
  const [tab, setTab] = useState<"password" | "magic">("password");

  return (
    <>
      <div role="tablist" aria-label="Sign-in method" className="mb-4 flex gap-1 rounded-md border border-emce-border p-1">
        <button
          role="tab"
          aria-selected={tab === "password"}
          onClick={() => setTab("password")}
          className={`flex-1 rounded px-3 py-1.5 text-xs font-bold ${tab === "password" ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
        >
          {passwordTabLabel}
        </button>
        <button
          role="tab"
          aria-selected={tab === "magic"}
          onClick={() => setTab("magic")}
          className={`flex-1 rounded px-3 py-1.5 text-xs font-bold ${tab === "magic" ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
        >
          {magicLinkLabels.tab}
        </button>
      </div>

      {tab === "password" ? (
        <SignInForm next={next} labels={passwordLabels} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-emce-text-sec">{magicLinkLabels.help}</p>
          <MagicLinkForm
            next={next}
            emailLabel={magicLinkLabels.email}
            buttonLabel={magicLinkLabels.button}
            pendingLabel={magicLinkLabels.pending}
          />
        </div>
      )}
    </>
  );
}
