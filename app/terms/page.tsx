import { AcrexLogo } from "@/components/ui/acrex-logo";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <section className="legal-card">
        <AcrexLogo className="landing-wordmark" />
        <p className="section-kicker">Terms & Conditions</p>
        <h1>AcreX Terms & Conditions</h1>
        <p>
          AcreX provides property measurement, mapping, estimating, project management, quote, and reporting tools for planning and business workflow purposes.
        </p>
        <h2>Estimates Only</h2>
        <p>
          AcreX measurements, parcel data, pricing suggestions, reports, maps, drawings, and quote calculations are estimates only. They must be independently verified before legal, surveying, engineering, property transaction, construction, permitting, bidding, or contract decisions.
        </p>
        <h2>User Responsibility</h2>
        <p>
          You are responsible for confirming property boundaries, site conditions, production rates, prices, taxes, regulations, customer requirements, and final contract terms before relying on any AcreX output.
        </p>
        <h2>No Professional Advice</h2>
        <p>
          AcreX does not provide legal, surveying, engineering, financial, insurance, tax, or construction advice. Use qualified professionals where those decisions require licensed review.
        </p>
        <h2>Accounts and Access</h2>
        <p>
          You are responsible for keeping your account credentials secure and for activity that occurs under your account. AcreX may update, limit, or discontinue features as the product develops.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to <a href="mailto:support@getacrex.com">support@getacrex.com</a>.
        </p>
      </section>
    </main>
  );
}
