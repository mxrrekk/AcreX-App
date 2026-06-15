import Link from "next/link";

export default function LeadsFoundationPage() {
  return (
    <main className="shared-project-page">
      <section className="shared-project-card">
        <Link className="landing-wordmark" href="/" aria-label="Acrex home">
          ACRE<span>X</span>
        </Link>
        <p className="section-kicker">Future Lead Marketplace</p>
        <h1>Lead marketplace foundation</h1>
        <p>
          AcreX can now support future lead request and lead match records in the schema. The marketplace is not launched yet, so no homeowner submission or contractor matching workflow is active.
        </p>
        <div className="shared-project-preview">
          <span>Address</span>
          <span>Service needed</span>
          <span>Timeline</span>
          <span>Contractor match</span>
        </div>
        <Link className="green-button" href="/dashboard">
          Back to Dashboard
        </Link>
      </section>
    </main>
  );
}
