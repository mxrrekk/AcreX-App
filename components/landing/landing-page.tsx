import Link from "next/link";

const industries = [
  { name: "Land Clearing", icon: "LC" },
  { name: "Lawn Care", icon: "LC" },
  { name: "Excavation", icon: "EX" },
  { name: "Fencing", icon: "FN" },
  { name: "Gravel Driveways", icon: "RD" },
  { name: "House Pads", icon: "HP" },
  { name: "Irrigation", icon: "IR" },
  { name: "Real Estate", icon: "RE" }
];

const features = [
  { label: "Search an address", icon: "pin" },
  { label: "Draw property boundaries", icon: "boundary" },
  { label: "Mark grass, brush, driveway, building, and excluded zones", icon: "layers" },
  { label: "Calculate acreage and square footage", icon: "measure" },
  { label: "Save clients and projects", icon: "folder" },
  { label: "Generate quotes", icon: "quote" }
];

const workflow = [
  "Search property",
  "Draw or load boundary",
  "Mark work zones",
  "Generate quote",
  "Save/send to customer"
];

const pricing = [
  {
    name: "Free",
    price: "$0",
    note: "For homeowners and users exploring AcreX.",
    cta: "Get Started Free",
    points: ["Limited property searches", "Basic acreage measurements", "Basic parcel viewing", "Up to 3 saved projects", "View-only property reports"]
  },
  {
    name: "AcreX Pro",
    price: "$24.99",
    note: "For contractors and professionals.",
    cta: "Start 14-Day Free Trial",
    points: ["Unlimited property searches", "Unlimited saved projects", "Advanced drawing tools", "Quote builder", "Customer & project management", "PDF exports"]
  },
  {
    name: "AcreX Business",
    price: "$49.99",
    note: "For companies and teams.",
    cta: "Contact Sales",
    points: ["Everything in Pro", "Team workspaces", "Shared projects", "Company branding", "Future lead marketplace access", "Priority support"]
  }
];

const faqs = [
  {
    question: "Does Acrex show property lines?",
    answer: "Acrex can show boundaries when parcel data is connected. Manual drawing works even without parcel data."
  },
  {
    question: "Can I draw manually?",
    answer: "Yes. Draw the work area, adjust the boundary, and calculate acreage from the selected polygon."
  },
  {
    question: "What if trees cover the grass?",
    answer: "You can mark visible work zones manually and exclude areas that should not be included in the quote."
  },
  {
    question: "Can I generate quotes?",
    answer: "The V1 includes basic quote math from acreage and price per acre, with more proposal tools planned."
  }
];

function FeatureIcon({ icon }: { icon: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {icon === "pin" ? <path d="M12 21s6-5.3 6-11a6 6 0 0 0-12 0c0 5.7 6 11 6 11Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" {...common} /> : null}
      {icon === "boundary" ? <path d="m5 6 6-2 7 3 1 8-8 5-7-4 1-10Z M5 6l6 5 7-4 M11 11v9" {...common} /> : null}
      {icon === "layers" ? <path d="m12 3 8 4-8 4-8-4 8-4Z M4 12l8 4 8-4 M4 17l8 4 8-4" {...common} /> : null}
      {icon === "measure" ? <path d="M4 17 17 4l3 3L7 20H4v-3Z M14 7l3 3 M6 15l3 3" {...common} /> : null}
      {icon === "folder" ? <path d="M3 7.5h7l2 2H21v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" {...common} /> : null}
      {icon === "quote" ? <path d="M6 4h8l4 4v12H6V4Z M14 4v4h4 M8.5 12h7 M8.5 15.5h7 M8.5 9h3" {...common} /> : null}
    </svg>
  );
}

export function LandingPage() {
  return (
    <main className="landing-page phase-two-landing">
      <div className="landing-hero-stage">
        <header className="landing-header">
          <Link className="landing-wordmark" href="/" aria-label="Acrex home">
            ACRE<span>X</span>
          </Link>
          <nav className="landing-nav" aria-label="Primary navigation">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Login</Link>
          </nav>
          <Link className="green-button header-button" href="/signup">
            Get Started
          </Link>
        </header>

        <section className="landing-hero">
          <div className="hero-content">
            <p className="hero-eyebrow">Contractor quoting workspace</p>
            <h1>From Property Search to Professional Quote in Minutes</h1>
            <p className="hero-subheadline">AcreX helps contractors, homeowners, real estate professionals, farmers, and landowners measure properties, generate reports, and build accurate estimates from one platform.</p>
            <p className="hero-copy">
              Search an address, mark work zones, measure acreage, classify surfaces, and move from takeoff to quote without switching tools.
            </p>
            <div className="hero-actions">
              <Link className="green-button large-button" href="/signup">
                Start Measuring
              </Link>
              <a className="ghost-button large-button" href="#how-it-works">
                View Features
              </a>
            </div>
            <p className="hero-note">No credit card required · Desktop & Mobile · Built for real field work</p>
          </div>

          <div className="acrex-product-mockup" aria-label="Acrex dashboard and map preview">
            <div className="mockup-window-chrome" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="mockup-topbar">
              <strong>ACRE<span>X</span></strong>
              <div className="mockup-search">
                <span>Search address...</span>
                <b>123 Main St, Dallas, TX</b>
              </div>
              <div className="mockup-header-actions">
                <span className="mockup-secondary-button">Share</span>
                <span>New Quote</span>
              </div>
            </div>
            <div className="mockup-body">
              <aside className="mockup-tools" aria-label="Preview drawing tools">
                <span data-tool="cursor">Select</span>
                <span data-tool="draw">Draw</span>
                <span data-tool="grass">Grass</span>
                <span data-tool="brush">Brush</span>
                <span data-tool="drive">Driveway</span>
                <span data-tool="exclude">Excluded</span>
                <span data-tool="measure">Measure</span>
              </aside>
              <div className="mockup-map">
                <div className="map-control-pill">Satellite</div>
                <div className="mock-layer-panel">
                  <span>Layers</span>
                  <strong>Property Lines</strong>
                  <strong>Measurements</strong>
                </div>
                <div className="mock-zoom-stack" aria-hidden="true">
                  <span>+</span>
                  <span>-</span>
                </div>
                <svg className="mock-boundary" viewBox="0 0 100 68" aria-hidden="true">
                  <polygon className="parcel-boundary" points="15,12 42,7 76,12 90,30 82,54 48,62 20,50" />
                  <polygon className="grass-zone" points="22,15 42,11 64,16 71,35 59,51 30,47 20,32" />
                  <polygon className="brush-zone" points="60,14 76,17 86,30 78,42 67,37" />
                  <polygon className="driveway-zone" points="34,48 61,43 70,51 48,60" />
                  <polygon className="excluded-zone" points="34,28 47,26 50,38 36,40" />
                  <circle cx="15" cy="12" r="1.25" />
                  <circle cx="42" cy="7" r="1.25" />
                  <circle cx="76" cy="12" r="1.25" />
                  <circle cx="90" cy="30" r="1.25" />
                  <circle cx="82" cy="54" r="1.25" />
                  <circle cx="48" cy="62" r="1.25" />
                  <circle cx="20" cy="50" r="1.25" />
                  <circle cx="20" cy="32" r="1.25" />
                </svg>
                <div className="zone-label label-grass">
                  <span>Grass</span>
                  <strong>1.18 ac</strong>
                </div>
                <div className="zone-label label-brush">
                  <span>Brush</span>
                  <strong>0.91 ac</strong>
                </div>
                <div className="zone-label label-driveway">
                  <span>Driveway</span>
                  <strong>0.14 ac</strong>
                </div>
                <div className="zone-label label-excluded">
                  <span>Excluded</span>
                  <strong>0.40 ac</strong>
                </div>
                <div className="acreage-badge">
                  <span>Total Acreage</span>
                  <strong>2.63 acres</strong>
                </div>
                <div className="map-status-bar">Click and drag points to adjust the work boundary.</div>
              </div>
              <aside className="mock-quote">
                <div className="mock-quote-heading">
                  <span>Project Summary</span>
                  <span className="summary-edit-button">Edit</span>
                </div>
                <p>123 Main St<br />Dallas, TX 75201</p>
                <div className="summary-row"><em>Parcel total</em><strong>2.63 ac</strong></div>
                <div className="summary-row"><em>Grass</em><strong>1.18 ac</strong></div>
                <div className="summary-row"><em>Brush</em><strong>0.91 ac</strong></div>
                <div className="summary-row"><em>Driveway</em><strong>0.14 ac</strong></div>
                <div className="summary-row"><em>Excluded</em><strong>0.40 ac</strong></div>
                <div className="mock-total"><em>Net billable</em><strong>1.69 ac</strong></div>
                <span className="mock-generate-button">Generate Quote</span>
              </aside>
            </div>
          </div>
        </section>
      </div>

      <section className="landing-section" id="who-its-for">
        <div className="section-heading-row">
          <p className="section-kicker">Who It&apos;s For</p>
          <h2>Built for contractors who quote work from the property first.</h2>
        </div>
        <div className="industry-card-grid">
          {industries.map((industry) => (
            <article key={industry.name}>
              <span aria-hidden="true">{industry.icon}</span>
              <h3>{industry.name}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section feature-section" id="features">
        <div className="section-heading-row">
          <p className="section-kicker">Features</p>
          <h2>Everything needed to turn a property into a quote.</h2>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article key={feature.label}>
              <div className="feature-icon" aria-hidden="true"><FeatureIcon icon={feature.icon} /></div>
              <h3>{feature.label}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section split-section" id="how-it-works">
        <div>
          <p className="section-kicker">How It Works</p>
          <h2>Simple field-to-office workflow.</h2>
        </div>
        <ol className="workflow-list">
          {workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="landing-section pricing-section" id="pricing">
        <div className="section-heading-row">
          <p className="section-kicker">Pricing</p>
          <h2>Start lean. Upgrade when your quoting volume grows.</h2>
        </div>
        <div className="pricing-grid">
          {pricing.map((plan) => (
            <article key={plan.name} className={plan.name === "AcreX Pro" ? "featured-plan" : ""}>
              <h3>{plan.name}</h3>
              <strong>{plan.price}<span>/mo</span></strong>
              <p>{plan.note}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link className="green-button" href="/signup">{plan.cta}</Link>
            </article>
          ))}
        </div>
        <p className="pricing-note">One average project can pay for an entire year of AcreX. No contracts · Cancel anytime · Secure cloud storage.</p>
      </section>

      <section className="landing-section faq-section">
        <div className="section-heading-row">
          <p className="section-kicker">FAQ</p>
          <h2>Questions contractors ask before switching workflows.</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((faq) => (
            <article key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section final-cta">
        <p className="section-kicker">AcreX</p>
        <h2>Start measuring better quotes today.</h2>
        <Link className="green-button large-button" href="/signup">Start Measuring</Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-wordmark" href="/" aria-label="Acrex home">
          ACRE<span>X</span>
        </Link>
        <p>Property measurements and quoting tools for land contractors.</p>
        <div>
          <Link href="/login">Login</Link>
          <Link href="/signup">Get Started</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms & Conditions</Link>
          <a href="mailto:support@getacrex.com">Contact</a>
        </div>
      </footer>
    </main>
  );
}
