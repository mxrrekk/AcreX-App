import Image from "next/image";
import Link from "next/link";
import { AcrexLogo } from "@/components/ui/acrex-logo";

type IconName =
  | "map"
  | "draw"
  | "quote"
  | "clearing"
  | "mowing"
  | "fence"
  | "dirt"
  | "farm"
  | "real-estate"
  | "clock"
  | "folder"
  | "document"
  | "measure"
  | "sparkles"
  | "services";

const audienceCards: Array<{ icon: IconName; title: string; copy: string }> = [
  { icon: "clearing", title: "Land clearing contractors", copy: "Measure brush, woods, and clearing areas before quoting." },
  { icon: "mowing", title: "Mowing & maintenance", copy: "Turn grass acreage and recurring work into organized estimates." },
  { icon: "fence", title: "Fence contractors", copy: "Measure fence runs and keep project details in one place." },
  { icon: "dirt", title: "Dirt work contractors", copy: "Plan driveways, house pads, access, and site preparation." },
  { icon: "farm", title: "Farmers & landowners", copy: "Understand property areas and plan outdoor work clearly." },
  { icon: "real-estate", title: "Real estate professionals", copy: "Present land measurements and project context with confidence." }
];

const benefitCards: Array<{ icon: IconName; title: string }> = [
  { icon: "clock", title: "Faster site takeoffs" },
  { icon: "folder", title: "Cleaner project organization" },
  { icon: "document", title: "More professional quotes" },
  { icon: "measure", title: "Less manual measuring" },
  { icon: "sparkles", title: "AI-assisted estimating" },
  { icon: "services", title: "Built for multiple outdoor services" }
];

function LandingIcon({ name }: { name: IconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {name === "map" ? <path d="m3.5 6.5 5-2.5 7 2.5 5-2.5v14l-5 2.5-7-2.5-5 2.5v-14Zm5-2.5v14m7-11.5v14" {...common} /> : null}
      {name === "draw" ? <path d="m5 17 10.8-10.8 2 2L7 19H5v-2Zm8.8-8.8 2 2M4 5h5M4 9V5" {...common} /> : null}
      {name === "quote" ? <path d="M6 3.5h8l4 4V20H6V3.5Zm8 0v4h4M9 11h6m-6 3h6m-6 3h4" {...common} /> : null}
      {name === "clearing" ? <path d="M4 20h16M7 20v-5m10 5v-8M5 15l2-7 2 7m5-3 3-9 3 9" {...common} /> : null}
      {name === "mowing" ? <path d="M5 16h10l2 3H7l-2-3Zm2 0 2-5h5l1 5m-3-5V7m0 0 3-2m-3 2L9 5" {...common} /> : null}
      {name === "fence" ? <path d="M5 20V6l2-2 2 2v14m6 0V6l2-2 2 2v14M9 9h6M9 15h6" {...common} /> : null}
      {name === "dirt" ? <path d="M3 18h18M5 18l4-8h6l4 8M8 13h8m-6-6h4" {...common} /> : null}
      {name === "farm" ? <path d="M4 20V9l8-5 8 5v11M8 20v-6h8v6M6 10h12" {...common} /> : null}
      {name === "real-estate" ? <path d="M4 20V8l8-5 8 5v12H4Zm5 0v-6h6v6m-7-9h2m4 0h2" {...common} /> : null}
      {name === "clock" ? <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2" {...common} /> : null}
      {name === "folder" ? <path d="M3 7h7l2 2h9v9.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5V7Z" {...common} /> : null}
      {name === "document" ? <path d="M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6m-6 4h6" {...common} /> : null}
      {name === "measure" ? <path d="M4 17 17 4l3 3L7 20H4v-3Zm10-10 3 3M7 14l3 3" {...common} /> : null}
      {name === "sparkles" ? <path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3L12 3Zm6 11 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" {...common} /> : null}
      {name === "services" ? <path d="m12 3 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 17l8 4 8-4" {...common} /> : null}
    </svg>
  );
}

export function LandingPage() {
  return (
    <main className="home-page">
      <header className="home-header">
        <AcrexLogo className="home-logo" priority />
        <nav className="home-nav" aria-label="Primary navigation">
          <a href="#what-acrex-does">What it does</a>
          <a href="#who-its-for">Who it&apos;s for</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/login">Login</Link>
        </nav>
        <Link className="home-button home-button-primary home-header-cta" href="/signup">Try AcreX</Link>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-kicker">Property measuring and estimating, together</span>
          <h1>AcreX turns property measurements into professional estimates.</h1>
          <p>Measure land, organize projects, and build quotes from map drawings in one simple workspace.</p>
          <div className="home-actions">
            <Link className="home-button home-button-primary" href="/signup">Try AcreX</Link>
            <a className="home-button home-button-secondary" href="#how-it-works">See how it works</a>
          </div>
          <small>Made for real outdoor work—from the property to the quote.</small>
        </div>

        <div className="home-product-visual" aria-label="AcreX property measurement preview">
          <Image src="/assets/satellite-yard.png" alt="Aerial property viewed inside AcreX" fill priority sizes="(max-width: 760px) 94vw, 50vw" />
          <svg className="home-property-overlay" viewBox="0 0 100 70" aria-hidden="true">
            <polygon points="14,12 45,7 82,15 90,38 72,61 29,58 10,35" />
            <circle cx="14" cy="12" r="1.5" />
            <circle cx="45" cy="7" r="1.5" />
            <circle cx="82" cy="15" r="1.5" />
            <circle cx="90" cy="38" r="1.5" />
            <circle cx="72" cy="61" r="1.5" />
            <circle cx="29" cy="58" r="1.5" />
            <circle cx="10" cy="35" r="1.5" />
          </svg>
          <div className="home-map-label home-map-label-area"><span>Brush clearing</span><strong>2.63 acres</strong></div>
          <div className="home-map-label home-map-label-quote"><span>Estimate</span><strong>$8,940</strong><small>Measurements ready</small></div>
          <div className="home-visual-topline"><span>AcreX Map</span><strong>Satellite Streets</strong></div>
        </div>
      </section>

      <section className="home-section home-what" id="what-acrex-does">
        <div className="home-photo-card">
          <Image src="/assets/jobsite-clearing.png" alt="Land clearing equipment working on a wooded property" fill sizes="(max-width: 760px) 94vw, 44vw" />
          <div><span>Built for field work</span><strong>Plan the job before equipment arrives.</strong></div>
        </div>
        <div className="home-section-copy">
          <span className="home-kicker">What AcreX does</span>
          <h2>One clear workflow for property-based work.</h2>
          <div className="home-capability-list">
            {[
              ["Search a property", "Start with the place where the work will happen."],
              ["Draw and measure", "Mark acreage, square footage, and linear footage."],
              ["Save the project", "Keep drawings, customer context, and job details together."],
              ["Build the quote", "Create editable estimates with pricing and AI support."]
            ].map(([title, copy], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <div><strong>{title}</strong><p>{copy}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section" id="who-its-for">
        <div className="home-section-heading">
          <span className="home-kicker">Who it&apos;s for</span>
          <h2>Useful across the outdoor work that starts with a property.</h2>
        </div>
        <div className="home-audience-grid">
          {audienceCards.map((item) => (
            <article key={item.title}>
              <div className="home-icon"><LandingIcon name={item.icon} /></div>
              <div><h3>{item.title}</h3><p>{item.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-how" id="how-it-works">
        <div className="home-section-heading">
          <span className="home-kicker">How it works</span>
          <h2>From property to estimate in three steps.</h2>
        </div>
        <div className="home-step-grid">
          {[
            { icon: "map" as const, number: "01", title: "Find the property", copy: "Search the address and open the job location on the map." },
            { icon: "draw" as const, number: "02", title: "Draw the work", copy: "Mark each service area and let AcreX calculate the quantity." },
            { icon: "quote" as const, number: "03", title: "Build the estimate", copy: "Move measurements into an editable, professional quote." }
          ].map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <div className="home-step-icon"><LandingIcon name={step.icon} /></div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-benefits">
        <div className="home-section-heading">
          <span className="home-kicker">Why AcreX</span>
          <h2>Less measuring by hand. More confidence in the work.</h2>
        </div>
        <div className="home-benefit-grid">
          {benefitCards.map((benefit) => (
            <article key={benefit.title}>
              <LandingIcon name={benefit.icon} />
              <strong>{benefit.title}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="home-final-cta">
        <div>
          <span className="home-kicker">Ready when you are</span>
          <h2>See your next property more clearly.</h2>
          <p>Start measuring, organizing, and estimating in one AcreX workspace.</p>
        </div>
        <Link className="home-button home-button-primary" href="/signup">Try AcreX</Link>
      </section>

      <footer className="home-footer">
        <div>
          <AcrexLogo className="home-logo" />
          <p>Property measurements and professional estimates in one workspace.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Login</Link>
          <a href="mailto:support@getacrex.com">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
