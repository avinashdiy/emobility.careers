"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { uploadAndParseResume } from "@/server/candidates/actions";

/**
 * CV upload with an animated parse-progress bar. The upload + AI parse
 * runs as a server action that can take several seconds; without a
 * pending state the page looks frozen. While the action is pending we
 * swap the file picker for a determinate-looking progress bar that eases
 * toward ~92% and cycles status messages, then the server redirect
 * completes the navigation.
 */

const STAGES = [
  { at: 0, label: "Uploading your CV…" },
  { at: 25, label: "Reading the document…" },
  { at: 50, label: "Extracting your details with AI…" },
  { at: 75, label: "Matching your skills & experience…" },
  { at: 90, label: "Almost there…" },
];

function ParsingProgress() {
  const [pct, setPct] = useState(6);
  useEffect(() => {
    // Ease toward 92% — slows as it climbs so it never "arrives" before
    // the real redirect. The redirect unmounts this component.
    const id = setInterval(() => {
      setPct((p) => (p >= 92 ? 92 : p + Math.max(0.6, (92 - p) * 0.08)));
    }, 350);
    return () => clearInterval(id);
  }, []);

  const stage = [...STAGES].reverse().find((s) => pct >= s.at) ?? STAGES[0];

  return (
    <div className="py-2" role="status" aria-live="polite">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-emce-text">{stage.label}</p>
        <p className="text-sm font-extrabold text-emce-dark">{Math.round(pct)}%</p>
      </div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-emce-light-soft">
        <div
          className="h-full rounded-full bg-emce-mid transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-hint text-emce-text-sec">
        Hang tight — this usually takes 5–15 seconds. Please don&apos;t close or refresh this tab.
      </p>
    </div>
  );
}

function Fields() {
  const { pending } = useFormStatus();
  if (pending) return <ParsingProgress />;
  return (
    <div className="space-y-3">
      <input
        type="file"
        name="resume"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        required
        className="block w-full text-sm text-emce-text-sec file:mr-3 file:rounded-md file:border-0 file:bg-emce-dark file:px-4 file:py-2 file:text-sm file:font-bold file:text-emce-light hover:file:bg-emce-darkest"
      />
      <Button type="submit" size="lg">
        Upload &amp; find my roles →
      </Button>
    </div>
  );
}

export function CvUploadForm({ redirectTo }: { redirectTo: string }) {
  return (
    <form action={uploadAndParseResume} className="mt-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Fields />
    </form>
  );
}
