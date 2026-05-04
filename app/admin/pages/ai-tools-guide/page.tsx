import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";

export const metadata = { title: "AI tools integration guide — admin" };

const PROMPT_FOR_CLAUDE = `You are generating a self-contained HTML landing page for an AI tool that will be embedded on emobility.careers. The page will be pasted into our admin Page editor and rendered inside a style-isolated iframe.

REQUIREMENTS

1. Single HTML document — full <!DOCTYPE html><html>...</html> shell. All CSS in inline <style> blocks (no external stylesheets except Google Fonts). All JS in inline <script> blocks at the bottom of <body>.

2. ALL CSS selectors MUST be scoped under a unique root container ID (e.g. #my-tool-name) so styles can never leak even if the iframe sandbox changes. Do not target body/html directly except inside that scoped block.

3. The OpenAI API call goes through OUR server-side proxy at /api/ai/proxy. DO NOT include any API key in the HTML. DO NOT call api.openai.com directly. Use this exact pattern:

   const CONFIG = {
     apiEndpoint: '/api/ai/proxy'
   };

   async function callOpenAI(messages, temperature = 0.7, maxTokens = 1500) {
     const response = await fetch(CONFIG.apiEndpoint, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         messages: messages,
         temperature: temperature,
         max_tokens: maxTokens
       })
     });
     if (!response.ok) {
       const err = await response.json().catch(() => ({}));
       throw new Error(err.error?.message || 'AI request failed');
     }
     const data = await response.json();
     return data.choices[0].message.content;
   }

   The endpoint accepts the same body shape OpenAI's chat.completions.create expects. Response is OpenAI's native format.

4. Per-IP rate limit on the proxy: 10 requests/minute, 200/day. Catch 429 errors and show a friendly "slow down" message with a retry button.

5. Lead capture FIRST — every tool starts with a lead form (firstName, lastName, email, phone) that POSTs to HubSpot. Only unlock the AI flow after lead capture.

   HubSpot endpoint pattern:
   POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formId}
   Body: { "fields": [{ "name": "firstname", "value": "..." }, ...] }

6. Required UX states: lead form → loading spinner → main flow → results card → CTA to "Book a Counseling Call". Every loading state needs an explicit visual indicator (spinner, progress bar) — these calls take 5-15s.

7. Branding tokens (use these in your scoped CSS):
   --primary: #0a2f26
   --primary-light: #145843
   --accent: #10b981
   --accent-light: #34d399
   --bg-card: #ffffff
   --text: #1e293b
   --text-muted: #64748b
   --radius: 12px

8. Mobile-first responsive — test layout at 360px, 768px, 1280px viewports.

DO NOT:
- Include any API key (OpenAI, HubSpot secret, etc.) in the HTML.
- Call openai.com / api.openai.com / claude.ai directly. Always proxy through /api/ai/proxy.
- Use external CSS frameworks (Tailwind CDN, Bootstrap). Write the CSS inline.
- Add tracking scripts (GA, Meta Pixel) — those are loaded by the platform globally.
- Output anything outside the <!DOCTYPE html>...</html> envelope.

OUTPUT just the raw HTML, ready to paste into the admin Page editor with "Allow scripts" checked.

Now generate a tool that does: <YOUR TOOL DESCRIPTION HERE>.`;

/**
 * Single-page operator guide. Lives in /admin so only admins see
 * it — the prompt template here is sensitive operationally (it
 * embeds our endpoint shape + rate limits).
 */
export default async function AiToolsGuidePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  return (
    <AdminShell>
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <header>
          <h1 className="text-dashboard text-emce-text md:text-3xl">
            AI tools integration guide
          </h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            How to author a new AI-tool landing page (Interview Simulator, CV Evaluator,
            Career Path Advisor) so it works on the platform with our shared OpenAI
            key — no per-tool config, no API key in the HTML.
          </p>
        </header>

        <Card className="p-6">
          <Badge variant="default">Architecture</Badge>
          <h2 className="mt-2 text-section text-emce-text">How it&apos;s wired</h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-emce-text-sec">
            <li>
              You author the tool as a single HTML file (HTML + CSS + JS). The previous
              setup pointed JS at <code>/wp-json/diyguru/v1/openai-proxy</code> — now it
              points at <code>/api/ai/proxy</code> instead. Same request/response shape.
            </li>
            <li>
              You paste the HTML into{" "}
              <Link href="/admin/pages/new" className="font-bold text-emce-dark hover:underline">
                /admin/pages/new
              </Link>{" "}
              and tick <strong>Allow scripts</strong>. The page renders in an iframe with
              <code> allow-same-origin allow-scripts</code> so its <code>fetch()</code> calls
              hit our endpoint same-origin (no CORS).
            </li>
            <li>
              The proxy uses our server-side <code>OPENAI_API_KEY</code>, so no key ever
              ships to the browser. Per-IP rate limited: 10/min, 200/day.
            </li>
            <li>
              Lead capture (HubSpot) runs client-side from the tool itself — same as in
              the WP version. We don&apos;t proxy HubSpot.
            </li>
          </ul>
        </Card>

        <Card className="p-6">
          <Badge variant="default">Endpoint reference</Badge>
          <h2 className="mt-2 text-section text-emce-text">/api/ai/proxy</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            POST endpoint. Mirrors OpenAI&apos;s chat-completion shape.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-emce-text p-4 text-xs text-emce-light">
{`POST /api/ai/proxy
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "You are an interview coach." },
    { "role": "user",   "content": "Generate 8 questions for ..." }
  ],
  "temperature": 0.7,        // optional, default 0.7
  "max_tokens": 1500,        // optional, default 1500, hard cap 4000
  "model": "gpt-4o-mini"     // optional, default gpt-4o-mini
}

→ 200 OK
{
  "id": "...",
  "choices": [
    { "message": { "content": "...", "role": "assistant" } }
  ],
  "usage": { ... }
}

→ 429 Too Many Requests   (per-IP rate limit hit)
→ 400 Bad Request         (validation failed)
→ 502 Bad Gateway         (OpenAI returned an error)`}
          </pre>
        </Card>

        <Card className="p-6">
          <Badge variant="default">Generation prompt</Badge>
          <h2 className="mt-2 text-section text-emce-text">
            Tell Claude this when generating a new tool
          </h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            Copy the prompt below into Claude (or any LLM). Replace{" "}
            <code>&lt;YOUR TOOL DESCRIPTION HERE&gt;</code> at the bottom with what you want.
            Claude returns one HTML file ready to paste into{" "}
            <Link href="/admin/pages/new" className="font-bold text-emce-dark hover:underline">
              /admin/pages/new
            </Link>{" "}
            with <strong>Allow scripts</strong> checked.
          </p>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-emce-border bg-emce-light-soft p-4 text-xs leading-relaxed text-emce-text">
            {PROMPT_FOR_CLAUDE}
          </pre>
          <p className="mt-3 text-hint text-emce-text-sec">
            One-off changes to the existing tools (Interview Simulator, CV Evaluator, etc.):
            open the page in <Link href="/admin/pages" className="font-bold text-emce-dark hover:underline">/admin/pages</Link>,
            click Edit, find the line that sets <code>apiEndpoint</code>, and change it from{" "}
            <code>&apos;/wp-json/diyguru/v1/openai-proxy&apos;</code> to{" "}
            <code>&apos;/api/ai/proxy&apos;</code>. Save and tick Allow scripts. Done.
          </p>
        </Card>

        <Card className="p-6">
          <Badge variant="outline">Security notes</Badge>
          <h2 className="mt-2 text-section text-emce-text">What this DOES and DOESN&apos;T protect</h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-emce-text-sec">
            <li>
              <strong>Protects:</strong> the OpenAI API key (never leaves the server),
              runaway client loops (per-IP minute limit), monthly bill blow-ups (per-IP
              daily ceiling), oversized prompts (hard caps on message count + total chars
              + max_tokens).
            </li>
            <li>
              <strong>Doesn&apos;t protect:</strong> a determined abuser cycling IPs to
              farm AI quota. If this becomes a real problem we&apos;ll add a lightweight
              JWT (issued after lead capture) that rate-limits per token instead of per IP.
              Not worth it pre-traffic.
            </li>
            <li>
              <strong>Trust trade-off on Allow scripts:</strong> any &lt;script&gt; the
              tool runs has the parent origin&apos;s cookies in scope (it&apos;s in
              <code> allow-same-origin</code> mode). Only enable it for HTML you authored
              yourself or generated through Claude with the prompt above. Never enable
              for third-party HTML drops.
            </li>
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
