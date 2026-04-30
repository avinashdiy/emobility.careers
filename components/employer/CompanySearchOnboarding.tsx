"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { searchCompanies, type CompanyMatch } from "@/server/entities/actions";
import { joinExistingCompany } from "@/server/employer/actions";

/**
 * Step 1 of employer onboarding. The user searches for their company.
 * If they find it, they confirm + supply their designation, and we
 * link them as a recruiter on the existing roster. If they don't find
 * it (or skip), the page swaps to the "Create your company" form by
 * routing to ?create=1.
 *
 * Debounced 250ms — fast enough to feel live, slow enough to not hit
 * the search endpoint on every keystroke.
 */
export function CompanySearchOnboarding() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CompanyMatch[]>([]);
  const [searchPending, startSearch] = useTransition();
  const [picked, setPicked] = useState<CompanyMatch | null>(null);
  const [submitPending, startSubmit] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchCompanies(q);
        setResults(r);
      });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  if (picked) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Avatar src={picked.logoUrl} name={picked.name} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-emce-text">{picked.name}</h2>
            {picked.hqLocation && (
              <p className="text-hint text-emce-text-sec">{picked.hqLocation}</p>
            )}
            <p className="mt-1 text-hint text-emce-text-muted">
              You&apos;ll be added as a recruiter at {picked.name}. The company admin
              can promote you to admin later from the team page.
            </p>
          </div>
        </div>

        <form
          action={(fd) => {
            startSubmit(() => joinExistingCompany(fd));
          }}
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="companyId" value={picked.id} />
          <div>
            <Label htmlFor="designation">Your designation at {picked.name}</Label>
            <Input
              id="designation"
              name="designation"
              required
              minLength={1}
              maxLength={120}
              placeholder="Talent Acquisition Lead"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPicked(null)}
              disabled={submitPending}
            >
              ← Pick a different company
            </Button>
            <Button type="submit" disabled={submitPending}>
              {submitPending ? "Joining…" : `Join ${picked.name}`}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-extrabold text-emce-text">
        Search for your company
      </h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        If your company is already on eMobility Careers, join the existing
        page instead of creating a duplicate. Type at least 2 characters.
      </p>

      <div className="mt-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-muted" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Ola Electric, Ather Energy, Tata Motors EV…"
          className="pl-9"
        />
      </div>

      {/* Results */}
      <div className="mt-3 min-h-[6rem]">
        {searchPending && q.trim().length >= 2 && (
          <p className="text-hint text-emce-text-muted">Searching…</p>
        )}
        {!searchPending && q.trim().length >= 2 && results.length === 0 && (
          <div className="rounded-md border border-dashed border-emce-border bg-emce-light-soft p-4 text-sm">
            <p className="font-bold text-emce-text">No matches for &ldquo;{q}&rdquo;</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Looks like {q} isn&apos;t on eMobility Careers yet. Create the
              company page so candidates can find you.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href={`/employer/onboarding?create=1&name=${encodeURIComponent(q)}`}>
                Create &ldquo;{q}&rdquo; →
              </Link>
            </Button>
          </div>
        )}
        {results.length > 0 && (
          <ul className="divide-y divide-emce-border rounded-md border border-emce-border">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPicked(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-emce-light-soft"
                >
                  <Avatar src={c.logoUrl} name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-emce-text">{c.name}</p>
                    {c.hqLocation && (
                      <p className="line-clamp-1 text-hint text-emce-text-sec">
                        {c.hqLocation}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px]">Join</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t border-emce-border pt-4">
        <p className="text-hint text-emce-text-muted">
          Can&apos;t find your company?{" "}
          <Link
            href="/employer/onboarding?create=1"
            className="font-bold text-emce-dark hover:underline"
          >
            Create a new company page →
          </Link>
        </p>
      </div>
    </Card>
  );
}
