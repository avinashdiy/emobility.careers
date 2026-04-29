/**
 * Cookie-based i18n. The locale lives in an `emce_locale` cookie set by
 * <LanguageSwitcher/>. Server components call `getLocale()`, then `t(key, vars?, locale)`
 * to resolve the right string. URLs stay language-free.
 *
 * Why not next-intl with `[locale]` segments? That requires restructuring the
 * entire `app/` tree and breaks every existing route. The cookie approach is
 * additive — pages opt in by importing `t()` and `getLocale()`.
 */

// IMPORTANT: this module is imported by client components too. Keep it free of
// server-only deps (next/headers, prisma). Server `getLocale()` lives in
// `lib/i18n-server.ts`.

// Order in this array drives the order in the language switcher.
// English first; Indian languages next (Hindi, Tamil, Telugu, Marathi —
// the four largest EV-industry workforce languages by speaker count);
// international after that. The actual translation for non-English
// locales is done client-side by Google Translate's element widget
// (see components/translate/GoogleTranslate.tsx) — only English text
// lives in `dict` below; everything else is machine-translated at
// runtime against the user's chosen locale.
export const locales = [
  "en",
  "hi",
  "ta",
  "te",
  "mr",
  "de",
  "ar",
  "zh",
  "fr",
  "ja",
] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "emce_locale";

export const localeNames: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  ta: "தமிழ்",
  te: "తెలుగు",
  mr: "मराठी",
  de: "Deutsch",
  ar: "العربية",
  zh: "中文",
  fr: "Français",
  ja: "日本語",
};

/**
 * Maps our internal `Locale` codes to the language codes Google
 * Translate's element widget expects. Mostly identical, but Chinese
 * needs an explicit `zh-CN` (simplified — what most India-based
 * Mandarin speakers and EV manufacturers use) since `zh` is
 * ambiguous.
 */
export const googleTranslateCodeFor: Record<Locale, string> = {
  en: "",
  hi: "hi",
  ta: "ta",
  te: "te",
  mr: "mr",
  de: "de",
  ar: "ar",
  zh: "zh-CN",
  fr: "fr",
  ja: "ja",
};

const dict = {
  en: {
    // Header / footer
    "nav.findJobs": "Find jobs",
    "nav.companies": "Companies",
    "nav.forEmployers": "For employers",
    "nav.about": "About",
    "nav.diyguru": "DIYguru",
    "nav.signIn": "Sign in",
    "nav.joinFree": "Join free",
    "nav.myProfile": "My profile",
    "nav.dashboard": "Dashboard",
    "nav.admin": "Admin",
    "nav.signOut": "Sign out",
    "nav.feed": "Feed",
    "nav.network": "Network",
    "nav.notifications": "Notifications",
    "nav.people": "People",
    "nav.mentors": "Mentors",
    "nav.competitions": "Competitions",
    "footer.candidates": "Candidates",
    "footer.employers": "Employers",
    "footer.company": "Company",
    "footer.copy": "© {year} eMobility Careers. Powered by DIYguru.",

    // Landing
    "hero.pill": "India's #1 EV-only career platform",
    "hero.title.lead": "EV careers,",
    "hero.title.accent": "supercharged.",
    "hero.subtitle":
      "Find your next role in battery tech, charging infrastructure, powertrain, motors, and EV manufacturing — or hire vetted technicians and engineers, including DIYguru-verified graduates.",
    "cta.findJob": "Find an EV job →",
    "cta.hireTalent": "Hire EV talent",
    "search.placeholder.q": "Job title, skill, or company",
    "search.placeholder.location": "City or 'Remote'",
    "search.button": "Search",
    "stats.activeCandidates": "Active candidates",
    "stats.companies": "EV companies hiring",
    "stats.openRoles": "Open roles",
    "stats.diyguru": "Verified graduates",
    "domains.title": "Browse by what you build",
    "domains.tag": "EV Domains",
    "domains.allCategories": "All categories →",
    "value.candidates.tag": "For candidates",
    "value.candidates.title": "Get matched, not buried",
    "value.candidates.bullet1": "AI resume parser builds your profile in 30 seconds",
    "value.candidates.bullet2": "Smart job matching by EV domain & skill stack",
    "value.candidates.bullet3": "DIYguru-verified badge for cohort graduates",
    "value.candidates.bullet4": "Free for candidates, always",
    "value.candidates.cta": "Create your profile →",
    "value.employers.tag": "For employers",
    "value.employers.title": "Post a JD. Meet candidates in minutes.",
    "value.employers.bullet1": "Paste a JD — AI returns ranked candidates",
    "value.employers.bullet2": "Full ATS pipeline with stage SLAs & team notes",
    "value.employers.bullet3": "Built-in interview scheduler & assessments",
    "value.employers.bullet4": "Reach 12k+ EV-specialised candidates",
    "value.employers.cta": "Start hiring",
    "diyguru.banner.tagline":
      "DIYguru graduates get a verified badge — proven hands-on EV training.",
    "diyguru.banner.cta": "Learn how verification works →",

    // Auth
    "auth.signin.title": "Welcome back",
    "auth.signin.subtitle": "Sign in to continue to your eMobility Careers account.",
    "auth.signin.email": "Email",
    "auth.signin.password": "Password",
    "auth.signin.forgot": "Forgot?",
    "auth.signin.button": "Sign in",
    "auth.signin.pending": "Signing in…",
    "auth.signin.continueWith": "or continue with",
    "auth.signin.newHere": "New here?",
    "auth.signin.createAccount": "Create an account",
    "auth.signin.passwordTab": "Email + password",
    "auth.signin.magicTab": "Email link",
    "auth.signin.magicButton": "Send sign-in link",
    "auth.signin.magicPending": "Sending…",
    "auth.signin.magicHelp": "We'll email you a one-time link. No password needed — first-time users are signed up automatically.",
    "auth.signup.title": "Create your account",
    "auth.signup.subtitle":
      "Free for candidates. Employers can post jobs after company verification.",
    "auth.signup.iAmCandidate": "I'm a candidate",
    "auth.signup.iAmHiring": "I'm hiring",
    "auth.signup.fullName": "Full name",
    "auth.signup.email": "Work email",
    "auth.signup.password": "Password",
    "auth.signup.passwordHint": "Minimum 8 characters.",
    "auth.signup.button": "Create account",
    "auth.signup.pending": "Creating account…",
    "auth.signup.alreadyHave": "Already have an account?",

    // Common
    "common.applyNow": "Apply now",
    "common.viewProfile": "View profile",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.loading": "Loading...",
    "common.signIn": "Sign in",
    "common.signOut": "Sign out",
    "common.continue": "Continue",
    "common.back": "Back",
    "diyguru.verified": "DIYguru Verified",
    "verifyEmail.title": "Verify your email",
    "verifyEmail.cta": "Send verification email",
    "verifyEmail.body":
      "Verify your email to apply to jobs and post listings. We'll send a link to {email}.",
  },
  hi: {
    "nav.findJobs": "नौकरी खोजें",
    "nav.companies": "कंपनियाँ",
    "nav.forEmployers": "नियोक्ताओं के लिए",
    "nav.about": "हमारे बारे में",
    "nav.diyguru": "DIYguru",
    "nav.signIn": "साइन इन",
    "nav.joinFree": "मुफ्त में जुड़ें",
    "nav.myProfile": "मेरी प्रोफ़ाइल",
    "nav.dashboard": "डैशबोर्ड",
    "nav.admin": "एडमिन",
    "nav.signOut": "साइन आउट",
    "nav.feed": "फ़ीड",
    "nav.network": "नेटवर्क",
    "nav.notifications": "सूचनाएँ",
    "nav.people": "लोग",
    "nav.mentors": "मेंटर्स",
    "nav.competitions": "प्रतियोगिताएँ",
    "footer.candidates": "उम्मीदवार",
    "footer.employers": "नियोक्ता",
    "footer.company": "कंपनी",
    "footer.copy": "© {year} eMobility Careers. DIYguru द्वारा संचालित।",

    "hero.pill": "भारत का #1 EV करियर प्लेटफ़ॉर्म",
    "hero.title.lead": "EV करियर,",
    "hero.title.accent": "सुपरचार्ज्ड।",
    "hero.subtitle":
      "बैटरी, चार्जिंग, पावरट्रेन, मोटर और EV निर्माण में अपनी अगली भूमिका पाएं — या टेक्नीशियन व इंजीनियर हायर करें, जिनमें DIYguru-प्रमाणित स्नातक शामिल हैं।",
    "cta.findJob": "EV नौकरी खोजें →",
    "cta.hireTalent": "EV प्रतिभा हायर करें",
    "search.placeholder.q": "जॉब टाइटल, स्किल, या कंपनी",
    "search.placeholder.location": "शहर या 'Remote'",
    "search.button": "खोजें",
    "stats.activeCandidates": "सक्रिय उम्मीदवार",
    "stats.companies": "हायरिंग कर रही EV कंपनियाँ",
    "stats.openRoles": "खुली भूमिकाएँ",
    "stats.diyguru": "प्रमाणित स्नातक",
    "domains.title": "जो आप बनाते हैं उससे ब्राउज़ करें",
    "domains.tag": "EV डोमेन",
    "domains.allCategories": "सभी श्रेणियाँ →",
    "value.candidates.tag": "उम्मीदवारों के लिए",
    "value.candidates.title": "मैच पाएं, दबें नहीं",
    "value.candidates.bullet1": "AI रिज़्यूमे पार्सर 30 सेकंड में आपकी प्रोफ़ाइल बनाता है",
    "value.candidates.bullet2": "EV डोमेन और स्किल स्टैक से स्मार्ट जॉब मैचिंग",
    "value.candidates.bullet3": "DIYguru ग्रुप ग्रेजुएट्स के लिए वेरिफाइड बैज",
    "value.candidates.bullet4": "उम्मीदवारों के लिए हमेशा मुफ्त",
    "value.candidates.cta": "अपनी प्रोफ़ाइल बनाएँ →",
    "value.employers.tag": "नियोक्ताओं के लिए",
    "value.employers.title": "JD पोस्ट करें। मिनटों में उम्मीदवार पाएं।",
    "value.employers.bullet1": "JD पेस्ट करें — AI रैंक्ड उम्मीदवार लौटाता है",
    "value.employers.bullet2": "पूरा ATS पाइपलाइन SLA और टीम नोट्स के साथ",
    "value.employers.bullet3": "इन-बिल्ट इंटरव्यू शेड्यूलर और असेसमेंट्स",
    "value.employers.bullet4": "12 हज़ार+ EV-विशेषज्ञ उम्मीदवारों तक पहुँचें",
    "value.employers.cta": "हायरिंग शुरू करें",
    "diyguru.banner.tagline":
      "DIYguru स्नातकों को वेरिफाइड बैज मिलता है — प्रमाणित प्रैक्टिकल EV ट्रेनिंग।",
    "diyguru.banner.cta": "वेरिफिकेशन कैसे काम करता है →",

    "auth.signin.title": "वापस स्वागत है",
    "auth.signin.subtitle": "अपने eMobility Careers खाते में जारी रखने के लिए साइन इन करें।",
    "auth.signin.email": "ईमेल",
    "auth.signin.password": "पासवर्ड",
    "auth.signin.forgot": "भूल गए?",
    "auth.signin.button": "साइन इन",
    "auth.signin.pending": "साइन इन हो रहा है…",
    "auth.signin.continueWith": "या जारी रखें",
    "auth.signin.newHere": "नए हैं?",
    "auth.signin.createAccount": "खाता बनाएँ",
    "auth.signin.passwordTab": "ईमेल + पासवर्ड",
    "auth.signin.magicTab": "ईमेल लिंक",
    "auth.signin.magicButton": "साइन-इन लिंक भेजें",
    "auth.signin.magicPending": "भेज रहे हैं…",
    "auth.signin.magicHelp": "हम आपको एक बार उपयोग होने वाला लिंक ईमेल करेंगे। पासवर्ड की ज़रूरत नहीं — पहली बार आने वाले उपयोगकर्ता स्वचालित रूप से साइन अप होते हैं।",
    "auth.signup.title": "अपना खाता बनाएँ",
    "auth.signup.subtitle":
      "उम्मीदवारों के लिए मुफ्त। नियोक्ता कंपनी सत्यापन के बाद नौकरियाँ पोस्ट कर सकते हैं।",
    "auth.signup.iAmCandidate": "मैं उम्मीदवार हूँ",
    "auth.signup.iAmHiring": "मैं हायरिंग कर रहा हूँ",
    "auth.signup.fullName": "पूरा नाम",
    "auth.signup.email": "वर्क ईमेल",
    "auth.signup.password": "पासवर्ड",
    "auth.signup.passwordHint": "कम से कम 8 अक्षर।",
    "auth.signup.button": "खाता बनाएँ",
    "auth.signup.pending": "खाता बनाया जा रहा है…",
    "auth.signup.alreadyHave": "पहले से खाता है?",

    "common.applyNow": "अभी आवेदन करें",
    "common.viewProfile": "प्रोफ़ाइल देखें",
    "common.save": "सहेजें",
    "common.cancel": "रद्द करें",
    "common.loading": "लोड हो रहा है...",
    "common.signIn": "साइन इन",
    "common.signOut": "साइन आउट",
    "common.continue": "जारी रखें",
    "common.back": "वापस",
    "diyguru.verified": "DIYguru प्रमाणित",
    "verifyEmail.title": "अपना ईमेल सत्यापित करें",
    "verifyEmail.cta": "सत्यापन ईमेल भेजें",
    "verifyEmail.body":
      "नौकरियों के लिए आवेदन करने और लिस्टिंग पोस्ट करने के लिए अपना ईमेल सत्यापित करें। हम {email} पर एक लिंक भेजेंगे।",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["en"];
type Vars = Record<string, string | number>;

/**
 * Resolve a translation. Falls back to English then the key itself.
 * Supports `{var}` interpolation: `t("verifyEmail.body", { email: "x@y.z" }, "en")`.
 */
export function t(key: TranslationKey, varsOrLocale?: Vars | Locale, maybeLocale?: Locale): string {
  const locale: Locale = typeof varsOrLocale === "string" ? varsOrLocale : (maybeLocale ?? defaultLocale);
  const vars = typeof varsOrLocale === "object" ? varsOrLocale : undefined;
  // The dict object only carries hand-written translations for `en`
  // (and historically `hi`) — every other locale falls back to the
  // English string here, then Google Translate's element widget
  // re-translates the served-English DOM client-side. Cast through
  // `unknown` so the partial-coverage doesn't trip TypeScript.
  const dictAny = dict as unknown as Partial<Record<Locale, Record<string, string>>>;
  const raw =
    dictAny[locale]?.[key] ??
    dictAny.en?.[key] ??
    key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}
