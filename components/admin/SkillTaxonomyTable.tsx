"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Search, Pencil, X, Save } from "lucide-react";
import { updateSkill, deleteSkill } from "@/server/admin/actions";

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  evDomain: { id: string; name: string } | null;
}

interface Props {
  skills: SkillRow[];
  evDomains: { id: string; name: string }[];
}

/**
 * Searchable / filterable skill table with inline rename + domain
 * reassignment. Skills come pre-loaded (top 500 alphabetised by domain
 * then name) — search is client-side because the dataset fits in
 * memory and instant feedback is better UX than round-tripping for
 * every keystroke.
 */
export function SkillTaxonomyTable({ skills, evDomains }: Props) {
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDomainId, setEditDomainId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.slug.toLowerCase().includes(q)) {
        return false;
      }
      if (domainFilter === "NONE") return s.evDomain === null;
      if (domainFilter !== "ALL" && s.evDomain?.id !== domainFilter) return false;
      return true;
    });
  }, [skills, query, domainFilter]);

  function startEdit(s: SkillRow) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditDomainId(s.evDomain?.id ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDomainId("");
  }

  function saveEdit(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("name", editName);
    fd.set("evDomainId", editDomainId);
    startTransition(async () => {
      await updateSkill(fd);
      cancelEdit();
    });
  }

  return (
    <>
      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-muted"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or slug…"
              aria-label="Search skills"
              className="pl-8"
            />
          </div>
          <NativeSelect
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            aria-label="Filter by EV domain"
            className="sm:w-64"
          >
            <option value="ALL">All EV domains</option>
            <option value="NONE">— Uncategorised —</option>
            {evDomains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </NativeSelect>
        </div>
        <p className="mt-2 text-hint text-emce-text-muted" role="status" aria-live="polite">
          {filtered.length === skills.length
            ? `Showing all ${skills.length} skills`
            : `Showing ${filtered.length} of ${skills.length} skills`}
        </p>
      </Card>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
            <tr>
              <th scope="col" className="p-3">Skill</th>
              <th scope="col" className="p-3">Domain</th>
              <th scope="col" className="p-3">Slug</th>
              <th scope="col" className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emce-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-emce-text-sec">
                  No skills match. Try a different search or filter.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  {editingId === s.id ? (
                    <>
                      <td className="p-3">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label={`Rename ${s.name}`}
                          autoFocus
                        />
                      </td>
                      <td className="p-3">
                        <NativeSelect
                          value={editDomainId}
                          onChange={(e) => setEditDomainId(e.target.value)}
                          aria-label={`Reassign domain for ${s.name}`}
                        >
                          <option value="">— None —</option>
                          {evDomains.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </NativeSelect>
                      </td>
                      <td className="p-3 text-hint text-emce-text-muted">{s.slug}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            disabled={pending || editName.trim().length === 0}
                            onClick={() => saveEdit(s.id)}
                          >
                            <Save className="mr-1 h-3.5 w-3.5" aria-hidden /> Save
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={cancelEdit} aria-label="Cancel edit">
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-bold text-emce-text">{s.name}</td>
                      <td className="p-3">
                        {s.evDomain ? <Badge variant="success">{s.evDomain.name}</Badge> : "—"}
                      </td>
                      <td className="p-3 text-hint text-emce-text-muted">{s.slug}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(s)}
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden /> Edit
                          </Button>
                          <form action={deleteSkill}>
                            <input type="hidden" name="id" value={s.id} />
                            <ConfirmSubmit
                              confirm={`Delete skill "${s.name}"? Candidates with this skill will lose the link.`}
                              size="sm"
                              variant="ghost"
                            >
                              Delete
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
