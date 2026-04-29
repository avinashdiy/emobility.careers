import Link from "next/link";
import { Pencil } from "lucide-react";

/**
 * Tiny owner-only edit affordance — LinkedIn-style. Renders a 16px
 * pencil icon that links to the corresponding /me/profile section
 * (via `#anchor` so the editor scrolls into view). Parent component
 * guards visibility with the `isOwner` check; this component just
 * renders the icon link.
 */
export function EditPencil({
  href,
  label,
}: {
  href: string;
  /** Aria label e.g. "Edit experience" — section name keeps it readable. */
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="rounded-full p-1 text-emce-text-muted hover:bg-emce-light-soft hover:text-emce-dark"
    >
      <Pencil className="h-4 w-4" />
    </Link>
  );
}
