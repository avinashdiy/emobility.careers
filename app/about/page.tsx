import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "About",
  description: "eMobility Careers — India's specialised hiring platform for the EV industry.",
};

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">About</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Built for the EV industry, by people in it.
      </h1>
      <p className="mt-3 text-emce-text-sec">
        eMobility Careers connects technicians and engineers across battery, charging, powertrain,
        motors, and vehicle engineering with India&apos;s fastest-growing EV companies — from
        startups to OEMs to charging operators.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-section text-emce-text">Why we exist</h3>
          <p className="mt-2 text-body text-emce-text-sec">
            Generic job boards don&apos;t understand EV. We curate the talent network around
            domain-specific skills, lab exposure, and verified certifications so hiring is faster
            and signal-rich.
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="text-section text-emce-text">Powered by DIYguru</h3>
          <p className="mt-2 text-body text-emce-text-sec">
            DIYguru-trained graduates carry a verified badge, with their lab tags, capstone
            projects, and certifications surfaced to employers.
          </p>
        </Card>
      </div>
    </div>
  );
}
