import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Linkedin, Upload, Sparkles } from "lucide-react";

interface Props {
  /** True when the user already signed in via LinkedIn (we have the OAuth
      account row). Used to flip the LinkedIn tile from "Connect" to
      "✓ Connected — name + photo imported". */
  hasLinkedinAccount: boolean;
  /** True when CandidateProfile.resumeUrl is set OR resumeParsedAt
      exists. Used to flip the résumé tile from "Upload" to "✓ Parsed". */
  hasParsedResume: boolean;
  /** LinkedIn vanity URL the user has already pasted, if any. Drives the
      third tile's state. */
  linkedinUrl: string | null;
}

/**
 * Three-tile autofill helper rendered at the top of /me/profile. Aimed
 * at first-time users who'd otherwise type every field by hand —
 * surfaces the realistic data-import paths in priority order:
 *
 *   1. LinkedIn OAuth — we already pull name, email, profile photo
 *      via the LinkedIn provider's OIDC scope. The button just
 *      re-auths to refresh the user's record.
 *   2. Résumé upload — best autofill path. Our parser extracts
 *      Experience, Education, Skills, Certifications. Strongly
 *      recommended over manual entry.
 *   3. LinkedIn URL paste — the field-level fallback when full data
 *      import isn't available (LinkedIn API restrictions). The URL
 *      shows on the public profile as a "View on LinkedIn →" link.
 *
 * Card collapses (renders only the title row) once all three are
 * complete so it doesn't permanently occupy the top of the editor.
 */
export function ImportProfileCard({
  hasLinkedinAccount,
  hasParsedResume,
  linkedinUrl,
}: Props) {
  const allDone = hasLinkedinAccount && hasParsedResume && Boolean(linkedinUrl);
  if (allDone) return null;

  return (
    <Card className="mb-6 overflow-hidden p-0">
      <div className="border-b border-emce-border bg-emce-light-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emce-mid-muted" />
          <h2 className="text-section text-emce-text">
            Quick-start: autofill instead of typing
          </h2>
        </div>
        <p className="mt-1 text-hint text-emce-text-sec">
          Pull your details from LinkedIn or your résumé so you don&apos;t have
          to fill every field by hand.
        </p>
      </div>

      <ul className="divide-y divide-emce-border">
        <li className="flex items-start gap-3 px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#0a66c2]/10 text-[#0a66c2]">
            <Linkedin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emce-text">
              {hasLinkedinAccount
                ? "✓ Signed in with LinkedIn"
                : "Sign in with LinkedIn"}
            </p>
            <p className="mt-0.5 text-hint text-emce-text-sec">
              {hasLinkedinAccount
                ? "Your name + photo were imported. To refresh, sign out and back in via LinkedIn."
                : "Auto-fills your name, email, and profile picture from LinkedIn. Sign out and sign back in via the LinkedIn button."}
            </p>
          </div>
          {!hasLinkedinAccount && (
            <Link
              href="/signout"
              className="shrink-0 rounded-md bg-emce-darkest px-3 py-1.5 text-xs font-bold text-emce-mid hover:bg-emce-dark"
            >
              Sign out to retry →
            </Link>
          )}
        </li>

        <li className="flex items-start gap-3 px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emce-light-soft text-emce-darkest">
            <Upload className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emce-text">
              {hasParsedResume ? "✓ Résumé uploaded" : "Upload résumé to autofill"}
            </p>
            <p className="mt-0.5 text-hint text-emce-text-sec">
              {hasParsedResume
                ? "We've parsed your résumé. Scroll down to verify the extracted experience, education, and skills."
                : "PDF or DOCX. Our parser extracts experience, education, skills, and certifications — review + edit, then save. Best path for richest autofill."}
            </p>
            {!hasParsedResume && (
              <p className="mt-1 text-[11px] text-emce-text-muted">
                💡 Tip: download your LinkedIn data (Settings &amp; Privacy → Get a copy
                of your data) to grab a current PDF résumé.
              </p>
            )}
          </div>
          {!hasParsedResume && (
            <Link
              href="/onboarding/resume"
              className="shrink-0 rounded-md bg-emce-darkest px-3 py-1.5 text-xs font-bold text-emce-mid hover:bg-emce-dark"
            >
              Upload →
            </Link>
          )}
        </li>

        <li className="flex items-start gap-3 px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#0a66c2]/10 text-[#0a66c2]">
            <Linkedin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emce-text">
              {linkedinUrl
                ? "✓ LinkedIn URL on profile"
                : "Add your LinkedIn profile URL"}
            </p>
            <p className="mt-0.5 text-hint text-emce-text-sec">
              {linkedinUrl
                ? "Visitors see a 'View on LinkedIn →' link on your public profile."
                : "Adds a 'View on LinkedIn' link to your public profile. Set it in the Header section below."}
            </p>
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[11px] font-bold text-emce-dark hover:underline"
              >
                {linkedinUrl}
              </a>
            )}
          </div>
        </li>
      </ul>
    </Card>
  );
}
