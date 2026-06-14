import Link from "next/link";

const industries = [
  "Land Clearing",
  "Mowing",
  "Brush Cutting",
  "Fencing",
  "Excavation",
  "Driveways",
  "House Pads",
  "Sod & Irrigation"
];

const features = [
  "Search an address",
  "Draw property boundaries",
  "Mark grass, brush, driveway, building, and excluded zones",
  "Calculate acreage and square footage",
  "Save clients and projects",
  "Generate quotes"
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
    name: "Early Access",
    price: "$0",
    note: "For contractors testing the first version.",
    points: ["Map takeoffs", "Acreage calculator", "Project saves"]
  },
  {
    name: "Pro",
    price: "$79",
    note: "For solo operators quoting every week.",
    points: ["Client projects", "Quote builder", "Work zone tools"]
  },
  {
    name: "Contractor Team",
    price: "$149",
    note: "For crews that need shared estimating.",
    points: ["Team workspace", "Saved clients", "Proposal workflow"]
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
            <h1>Measure. Quote. Win.</h1>
            <p className="hero-subheadline">Property measurements and quoting tools for land contractors.</p>
            <p className="hero-copy">
              Acrex helps contractors measure acreage, mark work zones, and build better quotes faster.
            </p>
            <div className="hero-actions">
              <Link className="green-button large-button" href="/signup">
                Start Free Trial
              </Link>
              <a className="ghost-button large-button" href="#how-it-works">
                View Demo
              </a>
            </div>
            <p className="hero-note">No credit card required</p>
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
            <article key={industry}>
              <span aria-hidden="true" />
              <h3>{industry}</h3>
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
            <article key={feature}>
              <div className="feature-icon" aria-hidden="true">+</div>
              <h3>{feature}</h3>
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
            <article key={plan.name} className={plan.name === "Pro" ? "featured-plan" : ""}>
              <h3>{plan.name}</h3>
              <strong>{plan.price}<span>/mo</span></strong>
              <p>{plan.note}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link className="green-button" href="/signup">Get Started</Link>
            </article>
          ))}
        </div>
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
        <p className="section-kicker">Acrex</p>
        <h2>Start measuring better quotes today.</h2>
        <Link className="green-button large-button" href="/signup">Start Free Trial</Link>
      </section>

      <footer className="landing-footer">
        <Link className="landing-wordmark" href="/" aria-label="Acrex home">
          ACRE<span>X</span>
        </Link>
        <p>Property measurements and quoting tools for land contractors.</p>
        <div>
          <Link href="/login">Login</Link>
          <Link href="/signup">Get Started</Link>
        </div>
      </footer>
    </main>
  );
}
