# AcreX Prioritized TODO

Last updated: June 19, 2026.

## Completed — Contractor Workflow Refinement

- [x] Make the map Drawing Inspector the primary drawing editor for rename, service, color, measurement, location, visibility, zoom, project save, quote access, and delete.
- [x] Route saved drawing rows directly to the exact drawing in the map inspector.
- [x] Remove duplicate drawing deletion from the Drawings manager while keeping deletion and Undo in the inspector.
- [x] Remove duplicate project Map and Quote actions from project detail.
- [x] Remove the duplicate mobile map-style picker and retain one Map View control.
- [x] Standardize project wording on “Save to Project.”
- [x] Limit AI follow-up questions to essential service-specific facts and place optional details behind a disclosure.
- [x] Prevent service descriptions and notes from incorrectly adding unrelated AI questionnaires.
- [x] Move applied AI recommendations directly into their editable quote tab.
- [x] Fix new-quote hydration errors caused by time-based quote numbers during server rendering.
- [x] Verify landing, authentication, map, drawing inspector, quote measurement, responsive navigation, and AI fallback workflows in the browser.

## Completed — Landing Header Fit

- [x] Remove the top landing-page CTA button.
- [x] Simplify the landing header grid after removing the CTA.
- [x] Verify the landing page has no horizontal overflow at 320px, 375px, 393px, 768px, or 1440px.

## Completed — Production QA and Polish Pass

- [x] Verify all public and protected routes, navigation targets, legal pages, and authentication redirects.
- [x] Fix iOS/Capacitor viewport sizing and safe-area placement so web content renders at device width.
- [x] Add confirmation dialogs for drawing and client deletion and keep failed deletions visible.
- [x] Verify map search, drawing, inspector editing, hide, delete, undo, style switching, 3D, reset, and location feedback.
- [x] Stop mobile bottom-sheet interactions from clearing the selected map drawing.
- [x] Keep unsaved drawing actions honest by requiring project save before opening the drawing manager.
- [x] Add a working customer-ready quote preview with print/PDF support and a direct mobile Preview & Export action.
- [x] Route saved quotes into invoice creation and preserve quote selection.
- [x] Verify Settings persistence and confirm new quote lines use pricing defaults without overwriting edited lines.
- [x] Replace dead billing/export controls with clear availability states and restore the mobile Exports route.
- [x] Improve mobile Clients, Drawings, Quotes, Invoices, and Settings layouts at iPhone SE through iPad Pro sizes.
- [x] Fix desktop client history overflow, invoice setup proportions, AI context truncation, and logo aspect-ratio warnings.
- [x] Add accessible labels to unlabeled project filters and invoice status controls.
- [x] Verify the configured Gemini key and `gemini-3.5-flash` endpoint server-side without exposing the key.
- [x] Run lint, TypeScript, production build, browser route/workflow checks, and iOS simulator validation.
- [x] Restore Vercel’s standard `.next` output while retaining the separate local production build directory used by iOS development.

## Completed — Compact Authentication Pages

- [x] Remove “AcreX Early Access” text from the application.
- [x] Replace signup-page logo links with one back arrow to the public information page.
- [x] Remove the duplicate signup logo while retaining the login-page AcreX identity.
- [x] Hide the long signup marketing panel on phones and tablets.
- [x] Compact signup fields into a clear two-column layout where space allows.
- [x] Keep all existing Supabase signup and login fields, validation, and routing unchanged.
- [x] Verify signup and login fit cleanly on an iPhone SE-sized viewport without horizontal overflow.

## Completed — Compact Landing Page Rebuild

- [x] Rebuild the public homepage without changing authenticated application functionality.
- [x] Use the shared AcreX app logo in the header and footer.
- [x] Keep the page compact: header, hero, product explanation, audiences, three-step workflow, benefits, CTA, and footer.
- [x] Use local high-resolution property and contractor imagery with a consistent SVG icon system.
- [x] Route Try AcreX, Login, Terms, Privacy, Contact, and section navigation correctly.
- [x] Remove the long pricing and FAQ sections from the homepage.
- [x] Verify phone and desktop layouts have no horizontal overflow or image/text overlap.

## Completed — Mobile Quote and Map Workflow Refinement

- [x] Integrate the Map action bar Quote control into the shared mobile bottom-sheet shell.
- [x] Keep the Quote sheet compact with measurement count, quote total, saved AI confidence, and links to the full editor.
- [x] Keep full quote editing on `/quotes` instead of duplicating the editor over the map.
- [x] Open the selected drawing inspector at a usable half-height on phones and portrait tablets.
- [x] Keep essential drawing facts and quote actions visible while placing rename, service, color, visibility, zoom, and delete controls under one detail disclosure.
- [x] Replace the location dot with a precise dot-and-crosshair marker.
- [x] Reduce the mobile Quote workspace to Estimate and Line Items as primary tabs.
- [x] Move quote details, materials, labor/equipment, scope/terms, review, and pricing into an on-demand mobile tools panel.
- [x] Keep the fixed total, review, and save controls available without rendering the full pricing card in the page flow.

## Completed — Mobile Map View and Location Controls

- [x] Lock the phone and portrait-tablet Map workspace to exactly one viewport.
- [x] Prevent horizontal and vertical document scrolling while preserving Mapbox pan and zoom gestures.
- [x] Replace the no-feedback Layers toggle with a real Map View bottom sheet.
- [x] Keep Satellite, Satellite Streets, Outdoors, Light, and Dark styles in the Map View sheet.
- [x] Move 3D and Reset View into the Map View sheet and remove duplicate floating controls.
- [x] Disable parcel-boundary controls when no parcel data is available.
- [x] Add iOS location permission usage text.
- [x] Show clear locating, success, permission-denied, and unavailable states.
- [x] Add a visible green user-location marker when coordinates are returned.
- [x] Preserve the user marker across Mapbox style changes.
- [x] Verify map styles, 3D, reset, location feedback, viewport dimensions, and zero scroll.

## Completed — Mobile Application Layout

- [x] Use bottom navigation for Map, Projects, Quotes, Clients, and More on phones and portrait tablets.
- [x] Route Drawings, Invoices, Exports, Settings, and Account through More.
- [x] Keep the Map full-screen with its existing Draw, Project, Quote, and More sheet workflow.
- [x] Keep Draw, Project, Quote, More, Layers, and selected drawings inside one mutually exclusive bottom-sheet system.
- [x] Show all eight drawing services in large mobile sheet controls.
- [x] Use a compact selected-drawing sheet with quote/project actions and expanded location metadata.
- [x] Render Projects and project detail as cards and segmented tabs.
- [x] Render Quote line items, materials, and labor/equipment as labeled mobile cards.
- [x] Keep AI Estimate prominent and guided questions usable on phone.
- [x] Use a compact fixed total/review/save bar without covering the full quote editor.
- [x] Render Settings as grouped, one-column mobile preferences.
- [x] Use a compact left rail on tablet landscape.
- [x] Eliminate page-level horizontal overflow across required phone and tablet sizes.
- [x] Verify the Map document remains exactly one visible viewport at 320×568 and 393×852 with all four bottom actions visible.

## Next Priority

- [ ] Complete V1 release readiness: production Capacitor URL, icons, privacy declarations, App Store metadata, archive validation, and TestFlight upload.
