/**
 * Single source of truth for the "Discover" pillar links — used by:
 *  • `DiscoverMenu` (the header megamenu dropdown)
 *  • The Discover widget on `/feed` left sidebar
 *
 * Adding / removing an entry here propagates to both surfaces. If a
 * third surface ever wants the same list (e.g. a mobile drawer), it
 * imports from here too — never duplicate the array.
 */

import {
  Briefcase,
  Trophy,
  GraduationCap,
  Users,
  Building2,
  BookOpen,
  Calendar,
  Compass,
  Award,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export const DISCOVER_ITEMS = [
  { href: "/jobs", label: "Jobs", desc: "EV roles across India", icon: Briefcase },
  { href: "/ai-tools", label: "AI Tools", desc: "Resume, interview prep, cover letter, and more", icon: Sparkles },
  { href: "/career-explorer", label: "Career Explorer", desc: "AI-mapped next moves with skill gaps", icon: Compass },
  { href: "/me/skill-swap", label: "Skill Swap", desc: "Pair with someone who knows what you're learning", icon: Users },
  { href: "/skills", label: "Verified skill badges", desc: "MCQ tests recruiters can filter on", icon: ShieldCheck },
  { href: "/awards", label: "Best EV Employers", desc: "Annual rankings from real reviews", icon: Award },
  { href: "/articles", label: "Knowledge", desc: "Explainers, deep dives, career guides", icon: BookOpen },
  { href: "/fairs", label: "Job fairs", desc: "Multi-company recruitment drives", icon: Calendar },
  { href: "/competitions", label: "Competitions", desc: "Hackathons, case studies, ideathons", icon: Trophy },
  { href: "/mentors", label: "Mentors", desc: "Book 1:1 sessions with EV experts", icon: GraduationCap },
  { href: "/people", label: "People", desc: "Engineers, students, faculty, leaders", icon: Users },
  { href: "/companies", label: "Companies", desc: "Browse EV companies hiring", icon: Building2 },
] as const;

export type DiscoverItem = (typeof DISCOVER_ITEMS)[number];
