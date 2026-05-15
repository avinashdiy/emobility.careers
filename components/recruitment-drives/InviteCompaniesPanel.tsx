"use client";

import { useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteCompanyToDrive } from "@/server/recruitment-drives/actions";

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/**
 * Admin panel to invite verified companies to a recruitment drive.
 * Filterable list with one-click invite. Server-side action is
 * idempotent (re-invites a previously-withdrawn company). On
 * success the row drops from the list (parent re-renders with the
 * fresh `candidates` prop).
 */
export function InviteCompaniesPanel({
  driveId,
  candidates,
}: {
  driveId: string;
  candidates: CompanyOption[];
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 25);
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 25);
  }, [candidates, query]);

  function invite(companyId: string) {
    setError(null);
    setInviting(companyId);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("driveId", driveId);
      fd.append("companyId", companyId);
      const r = await inviteCompanyToDrive(fd);
      if (!r.ok) setError(r.message ?? "Couldn't invite.");
      setInviting(null);
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-hint text-emce-text-muted">
        No more verified companies left to invite — every eligible company is
        already on this drive.
      </p>
    );
  }

  return (
    <div>
      <Label htmlFor="company-search">Invite a verified company</Label>
      <Input
        id="company-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search verified companies…"
        autoComplete="off"
        className="mt-1"
      />
      {error && (
        <div role="alert" className="mt-2 rounded-md bg-emce-red-light p-2 text-hint text-emce-red-deep">
          {error}
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="mt-2 text-hint text-emce-text-muted">
          No matches. Try a different name.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-emce-border bg-white p-2"
            >
              <Avatar src={c.logoUrl} name={c.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-emce-text">
                {c.name}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => invite(c.id)}
                disabled={pending && inviting === c.id}
              >
                {pending && inviting === c.id ? "Inviting…" : "Invite"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 25 && (
        <p className="mt-2 text-hint text-emce-text-muted">
          Showing first 25 — type to filter.
        </p>
      )}
    </div>
  );
}
