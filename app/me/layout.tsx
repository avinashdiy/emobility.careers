import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Chrome for every /me/* route. Centralises the LinkedIn-style top nav +
 * footer so individual pages can focus on content. Pages MUST NOT also
 * render <SiteHeader/> — that would double-stack the bar.
 *
 * Auth gating still happens in `middleware.ts` (the /me/:path* matcher
 * redirects unauthenticated visitors to /signin), so this layout assumes
 * an authenticated viewer and just renders chrome.
 */
export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
