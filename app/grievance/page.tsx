import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { GrievanceForm } from "@/components/legal/GrievanceForm";
import { getSetting } from "@/lib/settings";

export const metadata = {
  title: "Grievance officer",
  description:
    "Grievance officer details and complaint form, per the Indian IT Rules 2021.",
};

/**
 * Indian IT Rules 2021 §3(2)(a) compliance page — every intermediary
 * serving Indian users must publish the grievance officer's contact
 * details and offer a way to file complaints. The officer details are
 * editable by admins via /admin/settings (legal category) so launch
 * config doesn't require a code change.
 */
export default async function GrievancePage() {
  const [name, designation, email, phone, address, supportEmail] = await Promise.all([
    getSetting("legal.grievance_officer_name"),
    getSetting("legal.grievance_officer_designation"),
    getSetting("legal.grievance_officer_email"),
    getSetting("legal.grievance_officer_phone"),
    getSetting("legal.grievance_officer_address"),
    getSetting("site.support_email"),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-3xl py-10">
        <h1 className="text-dashboard text-emce-text">Grievance officer</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          As required by the Indian Information Technology Rules 2021,
          eMobility Careers publishes a designated grievance officer and a
          mechanism to file complaints. Tickets are acknowledged within 24
          hours and resolved within 15 days.
        </p>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Officer contact</h2>
          {name ? (
            <dl className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-3 sm:gap-x-6">
              <dt className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Name
              </dt>
              <dd className="sm:col-span-2 text-emce-text">{name}</dd>
              <dt className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                Designation
              </dt>
              <dd className="sm:col-span-2 text-emce-text">{designation || "Grievance Officer"}</dd>
              {email && (
                <>
                  <dt className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                    Email
                  </dt>
                  <dd className="sm:col-span-2">
                    <a href={`mailto:${email}`} className="font-bold text-emce-dark hover:underline">
                      {email}
                    </a>
                  </dd>
                </>
              )}
              {phone && (
                <>
                  <dt className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                    Phone
                  </dt>
                  <dd className="sm:col-span-2">
                    <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-bold text-emce-dark hover:underline">
                      {phone}
                    </a>
                  </dd>
                </>
              )}
              {address && (
                <>
                  <dt className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
                    Address
                  </dt>
                  <dd className="sm:col-span-2 whitespace-pre-line text-emce-text">{address}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="mt-2 text-hint text-emce-text-sec">
              The grievance officer's details haven't been configured yet.
              For complaints, please email{" "}
              <a href={`mailto:${supportEmail}`} className="font-bold text-emce-dark hover:underline">
                {supportEmail || "support@emobility.careers"}
              </a>{" "}
              and we'll route your message internally.
            </p>
          )}
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">File a grievance</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Use the form below to submit a complaint. We log every submission
            and track it through our internal queue. You'll get an email
            confirmation with the ticket id.
          </p>
          <div className="mt-4">
            <GrievanceForm />
          </div>
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="text-section text-emce-text">Escalation</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            If you're unsatisfied with the resolution, you may escalate to
            the relevant Indian regulatory body. For digital-services
            disputes, the Grievance Appellate Committee under the Ministry
            of Electronics &amp; IT is the designated forum.
          </p>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
