import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card className="p-8">
        <h1 className="text-2xl font-extrabold text-emce-text">Reset link missing</h1>
        <p className="mt-2 text-sm text-emce-text-sec">
          The reset link looks broken.{" "}
          <Link href="/forgot-password" className="font-bold text-emce-dark hover:underline">
            Request a new one →
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">Set a new password</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        We&apos;ll sign you in automatically once you save.
      </p>
      <div className="mt-6">
        <ResetPasswordForm token={token} />
      </div>
    </Card>
  );
}
