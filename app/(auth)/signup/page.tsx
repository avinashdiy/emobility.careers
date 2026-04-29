import { Card } from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { turnstilePublicKey } from "@/lib/anti-spam";

export const metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const defaultRole = sp.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">Create your account</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Free for candidates. Employers can post jobs after company verification.
      </p>
      <div className="mt-6">
        <SignUpForm
          defaultRole={defaultRole}
          next={sp.next}
          turnstileSiteKey={turnstilePublicKey}
        />
      </div>
    </Card>
  );
}
