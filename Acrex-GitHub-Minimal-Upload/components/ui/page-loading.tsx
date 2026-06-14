type PageLoadingProps = {
  label?: string;
};

export function PageLoading({ label = "Loading Acrex workspace" }: PageLoadingProps) {
  return (
    <main className="app-loading-shell" aria-busy="true" aria-live="polite">
      <section className="skeleton-sidebar">
        <span className="skeleton-block skeleton-logo" />
        {Array.from({ length: 6 }, (_, index) => (
          <span className="skeleton-block skeleton-nav-item" key={index} />
        ))}
      </section>
      <section className="skeleton-workspace">
        <div className="skeleton-header">
          <span className="skeleton-block skeleton-title" />
          <span className="skeleton-block skeleton-chip" />
        </div>
        <div className="skeleton-content-grid">
          <div className="skeleton-map-panel">
            <span className="skeleton-block skeleton-search" />
            <span className="skeleton-block skeleton-toolbar" />
          </div>
          <div className="skeleton-card-stack">
            {Array.from({ length: 4 }, (_, index) => (
              <span className="skeleton-block skeleton-card" key={index} />
            ))}
          </div>
        </div>
        <span className="loading-label">{label}</span>
      </section>
    </main>
  );
}
