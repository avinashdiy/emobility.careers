"use client";

import { useState } from "react";

/**
 * About-style long-text wrapper. Clamps to 3 lines until the viewer
 * clicks "…see more". The character threshold is a proxy for "long
 * enough to need clamping" so short bios skip the toggle entirely.
 */
export function ExpandableText({
  text,
  threshold = 240,
}: {
  text: string;
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = text.length > threshold;
  return (
    <>
      <p
        className={`whitespace-pre-line text-body text-emce-text-sec ${
          needsClamp && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {needsClamp && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-sm font-bold text-emce-dark hover:underline"
        >
          …see more
        </button>
      )}
    </>
  );
}
