import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">Reset your password</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Enter the email you signed up with and we&apos;ll send you a reset link.
      </p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </Card>
  );
}
