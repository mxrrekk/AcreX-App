import Link from "next/link";
import { AcrexLogo } from "@/components/ui/acrex-logo";

type SharePageProps = {
  params: {
    token: string;
  };
};

export default function ShareProjectPage({ params }: SharePageProps) {
  return (
    <main className="shared-project-page">
      <section className="shared-project-card">
        <AcrexLogo className="landing-wordmark" />
        <p className="section-kicker">Customer View</p>
        <h1>Shared project view foundation</h1>
        <p>
          This route is reserved for read-only customer project links. Once share links are enabled, token
          <code>{params.token}</code> will show the project map, highlighted work areas, measurements, notes, quote details, and an estimate acceptance placeholder.
        </p>
        <div className="shared-project-preview">
          <span>Map and work areas</span>
          <span>Measurements</span>
          <span>Notes</span>
          <span>Quote</span>
        </div>
        <button type="button" disabled>
          Accept estimate coming soon
        </button>
      </section>
    </main>
  );
}
