import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <Link className="landing-wordmark" href="/" aria-label="Acrex home">
          ACRE<span>X</span>
        </Link>
        <p className="section-kicker">Privacy Policy</p>
        <h1>AcreX Privacy Policy</h1>
        <p>
          AcreX collects information needed to operate the product, including account details, project information, addresses, drawings, measurements, clients, quotes, invoices, and technical usage data.
        </p>
        <h2>Information You Provide</h2>
        <p>
          You may provide names, emails, company details, phone numbers, addresses, project notes, map drawings, pricing inputs, quote data, invoice data, and uploaded or linked project materials.
        </p>
        <h2>How Information Is Used</h2>
        <p>
          AcreX uses information to provide mapping, measurement, estimating, quoting, project management, customer management, support, security, and product improvement.
        </p>
        <h2>Property and Measurement Data</h2>
        <p>
          Property measurements, parcel data, reports, drawings, and pricing suggestions are estimates only. They should be independently verified before legal, surveying, engineering, property transaction, construction, permitting, bidding, or contract decisions.
        </p>
        <h2>Service Providers</h2>
        <p>
          AcreX may rely on infrastructure, authentication, mapping, parcel data, hosting, analytics, payment, and communication providers to operate the service.
        </p>
        <h2>Contact</h2>
        <p>
          Privacy questions can be sent to <a href="mailto:support@getacrex.com">support@getacrex.com</a>.
        </p>
      </section>
    </main>
  );
}
