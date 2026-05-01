import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";

/**
 * Loading shell for /me/profile. Mirrors the editor layout — a
 * tall stack of section cards (Header, Experience, Education,
 * Skills, Privacy, etc.). We render 6 placeholder sections; the
 * real page has more, but the visible viewport on first paint
 * rarely shows more than the top 4–5 anyway.
 */
export default function ProfileLoading() {
  return (
    <div className="container max-w-4xl space-y-4 py-10">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-44" />
      </div>
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Skeleton variant="circle" className="h-20 w-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </Card>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-5 w-1/4" />
          <div className="mt-3">
            <SkeletonLines count={3} />
          </div>
        </Card>
      ))}
    </div>
  );
}
