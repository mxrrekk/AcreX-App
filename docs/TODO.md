# AcreX Prioritized TODO

Last updated: June 19, 2026.

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

- [x] Route the Map action bar Quotes control directly to the full Quotes workspace.
- [x] Remove the duplicate Map quote snapshot sheet.
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
- [x] Show all eight drawing services in large mobile sheet controls.
- [x] Use a compact selected-drawing sheet with quote/project actions and expanded location metadata.
- [x] Render Projects and project detail as cards and segmented tabs.
- [x] Render Quote line items, materials, and labor/equipment as labeled mobile cards.
- [x] Keep AI Estimate prominent and guided questions usable on phone.
- [x] Use a compact fixed total/review/save bar without covering the full quote editor.
- [x] Render Settings as grouped, one-column mobile preferences.
- [x] Use a compact left rail on tablet landscape.
- [x] Eliminate page-level horizontal overflow across required phone and tablet sizes.

## Next Priority

- [ ] Complete V1 release readiness: production Capacitor URL, icons, privacy declarations, App Store metadata, archive validation, and TestFlight upload.
