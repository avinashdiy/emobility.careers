import { Prisma } from "@prisma/client";
import { slugify } from "@/lib/utils";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

/**
 * Race-safe slug allocator: tries the base slug, retries with a numeric
 * suffix on Prisma's P2002 unique-violation error. Also skips reserved words
 * — candidate slugs live at the URL root, so we cannot allow "jobs", "admin",
 * etc. (Auto-generated slugs are prefixed with `u-` if their natural form
 * would collide.)
 *
 *   await withUniqueSlug("Acme Corp", async (slug) =>
 *     tx.company.create({ data: { ...rest, slug } })
 *   );
 */
export async function withUniqueSlug<T>(
  base: string,
  create: (slug: string) => Promise<T>,
  maxAttempts = 8,
): Promise<T> {
  const rawBase = slugify(base) || `x-${Math.random().toString(36).slice(2, 10)}`;
  // If the natural slug collides with a reserved word, prefix it.
  const baseSlug = RESERVED_SLUGS.has(rawBase) ? `u-${rawBase}` : rawBase;
  let attempt = 0;
  while (attempt < maxAttempts) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    if (RESERVED_SLUGS.has(slug)) {
      attempt += 1;
      continue;
    }
    try {
      return await create(slug);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not allocate a unique slug for "${base}" after ${maxAttempts} attempts`);
}
