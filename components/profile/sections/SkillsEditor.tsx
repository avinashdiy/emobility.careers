"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addSkillToProfile, removeSkillFromProfile, searchSkills } from "@/server/candidates/actions";
import { X } from "lucide-react";
import { toast } from "sonner";

interface SkillItem {
  skillId: string;
  name: string;
  proficiency: string;
}
interface DomainItem {
  slug: string;
  name: string;
}

export function SkillsEditor({
  initialSkills,
  evDomains,
}: {
  initialSkills: SkillItem[];
  evDomains: DomainItem[];
}) {
  const [skills, setSkills] = useState(initialSkills);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const r = await searchSkills(query);
      setSuggestions(r.filter((s) => !skills.some((x) => x.name.toLowerCase() === s.name.toLowerCase())));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, skills]);

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Skill already on your profile.");
      return;
    }
    const fd = new FormData();
    fd.append("name", trimmed);
    fd.append("proficiency", "INTERMEDIATE");
    startTransition(async () => {
      await addSkillToProfile(fd);
      // Optimistic add — server will revalidate
      setSkills((prev) => [...prev, { skillId: `local-${trimmed}`, name: trimmed, proficiency: "INTERMEDIATE" }]);
      setQuery("");
      setSuggestions([]);
      toast.success(`Added "${trimmed}"`);
    });
  }

  function remove(skillId: string, name: string) {
    if (skillId.startsWith("local-")) {
      // unsynced optimistic addition — just drop locally
      setSkills((prev) => prev.filter((s) => s.skillId !== skillId));
      return;
    }
    const fd = new FormData();
    fd.append("skillId", skillId);
    startTransition(async () => {
      await removeSkillFromProfile(fd);
      setSkills((prev) => prev.filter((s) => s.skillId !== skillId));
      toast.success(`Removed "${name}"`);
    });
  }

  return (
    <Card>
      <h2 className="text-section text-emce-text">Skills</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Searchable across the canonical EV taxonomy ({evDomains.length} domains). Add anything missing.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {skills.length === 0 && (
          <span className="text-hint italic text-emce-text-muted">No skills yet — add a few below.</span>
        )}
        {skills.map((s) => (
          <span key={s.skillId} className="inline-flex items-center gap-1 rounded-full bg-emce-light-soft px-3 py-1 text-badge font-bold uppercase tracking-wide text-emce-dark">
            {s.name}
            <button
              type="button"
              onClick={() => remove(s.skillId, s.name)}
              aria-label={`Remove ${s.name}`}
              className="ml-1 rounded-full p-0.5 hover:bg-emce-mid"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <Input
          placeholder="Type a skill (e.g. BMS, OCPP, PMSM)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              e.preventDefault();
              add(query);
            }
          }}
          aria-autocomplete="list"
        />
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-md border border-emce-border bg-white shadow-emce">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => add(s.name)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-emce-light-soft"
                >
                  {s.name}
                </button>
              </li>
            ))}
            {query.length >= 2 && !suggestions.some((s) => s.name.toLowerCase() === query.toLowerCase()) && (
              <li>
                <button
                  type="button"
                  onClick={() => add(query)}
                  className="w-full px-3 py-2 text-left text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  + Add &ldquo;{query}&rdquo;
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="mt-2 text-hint text-emce-text-muted">Press Enter to add, click ✕ to remove.</p>

      {evDomains.length > 0 && (
        <div className="mt-4 border-t border-emce-border pt-3">
          <div className="mb-2 text-xs font-bold uppercase text-emce-text-muted">Your EV domains</div>
          <div className="flex flex-wrap gap-1.5">
            {evDomains.map((d) => (
              <Badge key={d.slug} variant="success">{d.name}</Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
