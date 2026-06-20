# AcreX Build Status

Last reviewed: June 19, 2026.

## Current Status

The contractor workflow refinement pass is complete. Drawing management now routes to one authoritative inspector, duplicate project/map controls were reduced, AI questions are service-specific and minimal, applied AI recommendations move into their editable destination, and the Quote page no longer produces a hydration error for new quote numbers.

Vercel deployment compatibility was also corrected: cloud builds now emit the standard `.next` directory, while local production builds continue using `.next-build` to avoid colliding with the running iOS development server.

## Verification

- `npm run lint`: passing
- `npm run build`: passing
- Static and dynamic routes: passing, including `/exports`
- Browser console errors during final responsive check: none
- Browser console warnings during final responsive check: none
- Page-level horizontal overflow: none on tested routes
- Phone sizes verified: iPhone SE, iPhone 15, iPhone 15 Pro Max
- Portrait tablets verified: iPad Mini, iPad Air, iPad Pro
- Landscape tablet verified: 1024×768 compact rail
- Map Draw sheet verified with Grass, Brush, Woods, Fence, Driveway, House Pad, Exclusion, and Custom
- Selecting a drawing service closes the sheet and sends the drawing command
- Mobile Quote tabs, editable line cards, fixed summary actions, Settings forms, More menu, and navigation routes verified
- Mobile Map viewport regression: 393×852 rendered document, body, and dashboard bounds at exactly 393×852 with `scrollX=0` and `scrollY=0`
- Mobile Map View regression: the floating view control opened a real sheet; Satellite, Satellite Streets, Outdoors, Light, and Dark switched in place; 3D and Reset View returned expected state messages
- Mobile Locate regression: denied browser location produced explicit device-settings guidance instead of failing silently; successful coordinates now create a persistent green map marker
- iOS location readiness: `NSLocationWhenInUseUsageDescription` is present, the plist validates, and the iPhone 17 simulator build passes
- Map Quote action: opens the same reusable bottom sheet used by Draw, Project, More, Layers, and the drawing inspector
- Map Quote sheet: displays available measurements, current saved quote total, saved AI confidence when present, Add Measurements, Build Estimate, and Open Quote
- More sheet: includes Projects, Drawings, Clients, Invoices, Exports, Settings, and Account
- Project sheet: presents Save to Project, Open Project, and New Project in workflow order
- Drawing inspector: opens half-height on selection with visible measurement, project, location, quote, drawing, and expandable edit/delete controls
- Drawing inspector interaction regression: sheet controls no longer propagate into the map; rename, hide/show, delete, and delete-timeout behavior were exercised successfully
- Drawing deletion regression: Undo is available only during the temporary delete window and disappears after timeout
- Mobile Quote workspace: Estimate and Line Items remain primary; quote details, materials, labor/equipment, scope, review, and pricing open on demand
- Quote preview/export: customer-ready preview opens on desktop and mobile with zero horizontal overflow and Print / Save PDF support
- Quote pricing defaults: newly added measurements use matching Settings defaults while existing edited quote rates remain unchanged
- Invoice conversion: saved quote IDs route into `/invoices?quote=...` and preselect the matching quote
- Settings persistence: saved browser settings reload correctly for the current account
- Gemini connectivity: the configured server-side key returned HTTP 200 from the current `gemini-3.5-flash` endpoint; the key was not logged or exposed client-side
- Location marker: uses an HTML Mapbox marker with a centered dot, crosshairs, and accuracy halo that remains visible across style changes
- `npx tsc --noEmit`: passing
- Latest iPhone 17 simulator build and launch: passing with no Xcode warnings or errors
- Landing page: shared app logo, local high-resolution visuals, consistent icons, and all requested sections present
- Landing CTA routes: `/signup`, `/login`, `/terms`, `/privacy`, and support email verified
- Landing responsive regression: 393px phone and 1440px desktop layouts have exact viewport-width documents with no horizontal overflow
- Landing hero regression: image and text remain separate on phone and desktop with no overlap
- Auth text audit: no “Early Access” text remains in tracked application source
- Signup navigation: the back arrow routes directly to `/`
- Signup identity: no AcreX logo is rendered on signup; login retains the shared AcreX logo
- iPhone SE auth regression: 375×667 signup card fits in the viewport with no horizontal overflow
- Desktop signup regression: form card reduced to approximately 554px tall with no removed fields
- Landing header: top CTA removed with the logo and desktop information navigation retained
- Landing width regression: document and body widths exactly matched 320px, 375px, 393px, 768px, and 1440px viewports
- Responsive application regression: no horizontal overflow at 320×568, 393×852, 430×932, 768×1024, 820×1180, 1024×1366, or 1366×1024 across Projects, Project Detail, Drawings, Quotes, Clients, Invoices, Settings, and Map
- Mobile Map viewport regression: document dimensions exactly matched 320×568 and 393×852; search, account control, bottom bar, and sheets remained overlays without page scroll
- Accessibility label audit: no visible unnamed buttons, links, images, or form controls remain on tested routes
- Drawing manager: each saved drawing now opens its exact project drawing in the map inspector through project and drawing route parameters
- Drawing actions: direct list deletion was removed so editing, visibility, zoom, and destructive actions have one authoritative location
- Project detail: duplicate header/tab Map and Quote actions were removed while preserving the workflow inside the relevant tabs
- Mobile Map: the duplicate style selector was removed from More; Map View remains the single style/3D location
- AI estimator: essential follow-up questions remain visible, optional job details are disclosed on demand, and unrelated service questionnaires are no longer inferred from descriptive notes
- AI application flow: accepted line items, materials, costs, and scope text immediately open in their editable quote tab
- Quote runtime: deterministic server markup prevents the previous new-quote React hydration error
- Current browser regression: no horizontal overflow at 375×667, 834×1112, 1194×834, or 1440×900; mobile Map remained exactly one viewport with one open sheet

## Remaining Release Work

- Configure `CAPACITOR_SERVER_URL` for the production Vercel deployment.
- Complete final native assets, privacy configuration, version/build numbers, archive validation, and TestFlight/App Store submission.
