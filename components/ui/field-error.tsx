import { cn } from "@/lib/utils";

export function FieldError({
  error,
  id,
  className,
}: {
  error?: string;
  id?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn("mt-1 text-hint font-bold text-emce-red", className)}
    >
      {error}
    </p>
  );
}
