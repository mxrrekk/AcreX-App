# AcreX Prioritized TODO

Last updated: June 20, 2026.

## Completed — Customer-Ready Invoice Workflow

- [x] Convert saved quotes into customer-safe invoices with linked customer, project, company, line-item, tax, discount, deposit, and payment-term data.
- [x] Filter deleted drawing references and contractor-only AI, confidence, warning, profit, debug, and pricing-assumption content from invoices.
- [x] Add one authoritative invoice preview used for review, PDF/save-to-PDF, printing, and email preparation.
- [x] Add editable customer contact, amount paid, line descriptions, scope, notes, and payment terms without exposing internal quote data.
- [x] Add server-side Gemini invoice wording polish with explicit Apply and Ignore controls and no price, quantity, unit, or total mutation.
- [x] Persist the structured customer invoice payload and restore it when a saved invoice is reopened.
- [x] Keep Saved Invoices behind its explicit tab and route saved records back into the preview/editor.
- [x] Fit the invoice editor, actions, line items, and preview at mobile width without horizontal overflow.
- [x] Add invoice conversion and persistence regression coverage.

## Completed — Workspace-First Saved Resources

- [x] Make Projects open to a clean Start New Project workspace instead of the full saved list.
- [x] Put project search, filters, open, and protected delete actions behind Saved Projects.
- [x] Make Quotes open to the AI quote workspace and keep saved estimates behind Saved Quotes.
- [x] Add saved quote search, status, project/customer/address, total, updated date, open/edit, duplicate, project, and delete actions.
- [x] Support opening a specific quote by quote ID without losing its linked project context.
- [x] Make Invoices open to the invoice builder and keep saved invoices behind Saved Invoices.
- [x] Add saved invoice search, open/edit, project/quote links, status actions, and protected delete; print/email remain in the opened authoritative preview.
- [x] Keep workspace/saved segmented controls fitted at mobile width with no horizontal overflow.

## Completed — Data Safety and Project Backups

- [x] Add a versioned, restore-ready AcreX project backup format.
- [x] Include project, client, drawings, measurements, quotes, quote lines, invoices, invoice lines, file metadata, exports, settings, AI snapshots, activity, and integrity results.
- [x] Add authenticated JSON backup downloads from Project Detail and Exports.
- [x] Add shared Saved, Saving…, and Save failed status definitions.
- [x] Add durable project activity records for project, drawing, quote, invoice, file, and export events.
- [x] Add integrity checks for deleted drawing references, deleted quote references, orphan drawings, and missing pricing defaults.
- [x] Surface integrity warnings in the existing Project Overview without redesigning the page.

## In Progress — Durable Supabase Storage

- [x] Define normalized drawings, measurements, quote line items, invoice line items, exports, attachments, settings, and AI snapshot records.
- [x] Add private `acrex-files` bucket configuration and user-folder storage policies.
- [x] Add RLS ownership policies for every new record type.
- [x] Add centralized project, drawing, quote, invoice, settings, AI snapshot, upload, list, and delete helpers.
- [x] Preserve legacy quote-item compatibility until the production migration is applied.
- [x] Persist project drawings and measurements separately while retaining project GeoJSON compatibility.
- [x] Copy quote lines into invoice line items during invoice creation.
- [ ] Apply `supabase/schema.sql` to the production Supabase project using an authorized database session.
- [x] Add a self-cleaning authenticated live test for project, drawing, measurement, quote, invoice, private file, refresh reads, and two-user isolation.
- [ ] Supply two dedicated test accounts and run `npm run test:storage:live` after the migration is applied.

## Completed — AI-First Quote Workspace

- [x] Automatically generate an AI draft when a newly selected project has valid drawings and no existing quote content.
- [x] Prevent duplicate automatic requests for the same project, measurement, and pricing context.
- [x] Restore the current AI draft during the browser session instead of charging for another request after navigation or reload.
- [x] Keep existing saved or contractor-edited quotes from being overwritten automatically.
- [x] Show the AI draft total in the primary quote header before the contractor accepts it.
- [x] Allow the AI draft to render as customer-ready PDF preview content before acceptance.
- [x] Make Generate AI Estimate the primary Quote action and remove old Build Estimate wording.
- [x] Reduce the primary workspace to AI Estimate, Quote, Scope, and PDF / Send.
- [x] Add a compact project, customer, address, measurement count, and live total header.
- [x] Show AI suggestions as a contractor approval workflow with Accept, Edit, Regenerate, and Generate PDF actions.
- [x] Keep the AI change command hidden until an estimate exists and rename its action to Update Estimate.
- [x] Replace visible confidence percentages with actionable AI notes.
- [x] Keep editable line items in Quote while hiding materials, labor, equipment, pricing adjustments, and detailed quote metadata under Advanced Options.
- [x] Keep Save, Preview/PDF, Email, and Invoice conversion available in the final PDF / Send step.
- [x] Verify the four-tab workflow and zero horizontal overflow at a 393px mobile viewport.

## Completed — App-Wide Space Management

- [x] Replace the mobile selected-drawing scroll drawer with Summary, More Actions, and Location subviews.
- [x] Keep Add to Quote, Save/Open Project, Zoom To, and More Actions visible in the default drawing view.
- [x] Keep rename, service, color, visibility, location, and Delete Drawing in compact in-place subpanels.
- [x] Apply the same summary/More Actions hierarchy to the desktop Drawing Inspector.
- [x] Resize short-screen mobile map sheets so Draw, Project, Quote, More, Map View, and drawing actions fit without internal scrolling.
- [x] Replace the five-button mobile map-style grid with one compact style selector.
- [x] Replace horizontally scrolling Quote, Settings, and Project Detail tabs with fitted segmented grids.
- [x] Collapse Quote line items to service, quantity, rate, total, and Edit; retain all detailed fields inside the inline editor.
- [x] Replace desktop quote editor tables with responsive cards for lines, materials, and labor/equipment.
- [x] Keep Build Estimate visible near the top of the mobile and desktop estimator and collapse job questions until requested.
- [x] Keep Settings Save visible directly below navigation with sticky feedback while sections scroll.
- [x] Verify readable controls, no clipped labels, and zero horizontal overflow at 320px, 393px, 834px, and 1440px widths.

## Completed — Mobile Precision Drawing

- [x] Add a fixed AcreX crosshair at the mobile map center while drawing.
- [x] Keep the map pannable and place each new vertex at the coordinate under the crosshair.
- [x] Add compact Add Point, Undo Point, Finish, and Cancel controls above the mobile action bar.
- [x] Require three polygon points or two line points before Finish is enabled.
- [x] Show live point count, line total, polygon area, square footage, and perimeter.
- [x] Render live segment-length labels on completed draft edges with collision-safe placement.
- [x] Finish through the existing drawing save pipeline and open the drawing inspector immediately.
- [x] Preserve desktop Mapbox click-to-place drawing behavior.
- [x] Verify zero mobile page scroll and complete control fit at iPhone SE and iPhone 15 Pro dimensions.

## Completed — Focused Post-Quote QA Audit

- [x] Remove the duplicate mobile Quote tools button and keep one clear extras entry point.
- [x] Remove the mobile “Review job questions” action when there are no relevant questions.
- [x] Prevent stale deleted-project drafts from restoring project drawings, address, or selection.
- [x] Prevent a new map search from silently overwriting the saved address/title of an active project.
- [x] Keep one drawing Delete action in the detailed inspector instead of duplicating it in the drawing list.
- [x] Clarify mobile drawing actions with Open Quote/Open Project states and project-save loading feedback.
- [x] Disable Quote Preview/Export until quote content exists.
- [x] Disable Quote Save until a project is selected and validate quote number before persistence.
- [x] Reverify Settings pricing, drawing-to-quote sync, mobile map viewport lock, text clipping, empty states, and responsive layouts.

## Completed — Quote + AI Estimator Workflow Rework

- [x] Add a compact project, customer, and address summary above the Quote workspace.
- [x] Keep Estimate, Line Items, Materials, Labor / Equipment, Scope / Terms, and Review as the primary quote sections.
- [x] Expand service-specific questions for mowing, brush, fence, driveway, house pad, and land clearing without cross-service prompts.
- [x] Read quote rates only from user-saved Settings defaults; leave rates blank when no matching default exists.
- [x] Add land-clearing rate, crew size, overhead, and target-profit defaults to Settings.
- [x] Pass sanitized labor, crew, equipment, mobilization, fuel, overhead, and profit defaults to the server-side AI route.
- [x] Give pending AI line, material, cost, scope, exclusion, and term suggestions explicit Apply, Edit, and Ignore controls.
- [x] Keep applied AI suggestions out of the review panel and move the user to the editable destination tab.
- [x] Refine confidence using measurements, matching pricing, answered relevant questions, complete rates, materials, job costs, and totals.
- [x] Show target profit guidance from Settings in the sticky pricing summary.
- [x] Verify mowing, brush, fence, driveway, house-pad, land-clearing, saved-pricing, no-pricing, and manual-edit scenarios.

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

- [ ] Complete V1 App Store submission: confirm App Store Connect metadata, validate the signed archive, and upload to TestFlight.

## Completed — iOS V1 Release Preparation

- [x] Add an explicit production Capacitor sync command using the stable Vercel URL.
- [x] Sync the native iOS wrapper to `https://acre-x-app.vercel.app` with HTTPS-only transport.
- [x] Replace the generic blue Capacitor icon and splash art with the AcreX brand.
- [x] Add the app privacy manifest to the native target.
- [x] Declare that AcreX does not use non-exempt encryption.
- [x] Remove the obsolete `armv7` device requirement.
- [x] Preserve the existing location permission explanation.
- [x] Fix public landing-page safe-area spacing for the iPhone status bar and Dynamic Island.
- [x] Verify a clean Release build and live Vercel launch on an iPhone 17 simulator.

## Completed — Quote Service Matching and Pricing

- [x] Centralize drawing, quote, AI, and Settings service matching in one service catalog.
- [x] Restrict AI quote suggestions to selected measurements and explicit manual services.
- [x] Prevent mowing, brush, fence, driveway, house pad, and land-clearing estimates from adding unrelated services.
- [x] Generate service lines with the source drawing quantity and the catalog unit.
- [x] Use the matching saved Settings rate as the primary quote rate.
- [x] Keep rates editable and show `No pricing default set` when no saved rate exists.
- [x] Filter AI materials and labor/equipment suggestions that belong to inactive services.
- [x] Ask only the guided questions defined for the active service type.
- [x] Group Available Measurements by service.
- [x] Mark existing source-linked lines with conflicting services as possibly mismatched and require explicit removal.
- [x] Include configured mobilization and fuel surcharge context without hardcoding final service prices.
- [x] Add regression tests for mowing, brush, fence, mixed services, selected scope, saved defaults, and missing defaults.

## Completed — Cross-App Data Sync and Cascades

- [x] Add one shared project/drawing/quote/invoice invalidation event path across routes and browser tabs.
- [x] Refresh Projects, Drawings, Project Detail, Quotes, Invoices, and the active Map workspace after related mutations.
- [x] Persist drawing creation, geometry edits, service changes, names, colors, measurements, deletes, undo, and reverse-geocoded metadata immediately for saved projects.
- [x] Reconcile linked quote lines when source drawings change.
- [x] Automatically update untouched linked lines while preserving manually edited lines with an update-available warning.
- [x] Preserve quote lines whose source drawing was deleted and label them as `Source drawing deleted`.
- [x] Remove deleted drawings from Available Measurements and AI measurement context.
- [x] Exclude deleted-source lines from AI service detection and guided questions.
- [x] Cascade project deletion through draft quotes and draft invoices while blocking deletion when sent, accepted, overdue, or paid financial records exist.
- [x] Add safe draft quote deletion with related draft invoice cleanup.
- [x] Add safe draft invoice deletion and linked quote status updates.
- [x] Propagate project reference changes into linked quotes and invoices.
- [x] Propagate quote totals and references into linked draft invoices.
- [x] Display the latest linked invoice status on Projects so invoice mutations have an immediate visible result.
- [x] Synchronize project notes between Map and Project Detail through the shared invalidation path.
- [x] Synchronize project tags between Map and Projects.
- [x] Propagate client edits/deletes through linked projects, quotes, invoices, active project forms, and AI context.
- [x] Propagate Settings pricing/map changes into open Map and Quote workspaces without overwriting edited quote lines.
- [x] Clear stale AI suggestions whenever project measurements or source links change.
- [x] Preserve legacy linked quote lines when edit history is unavailable instead of risking silent overwrite.
- [x] Verify protected quote and invoice status directly from Supabase before destructive cascades.
- [x] Verify source reconciliation and cascade protection with executable assertions and browser-rendered acceptance checks.
- [x] Propagate source-drawing edits into linked draft invoice totals through the draft quote.
- [x] Roll back quote, quote-item, invoice, and project-reference writes when a dependent cascade fails.
- [x] Separate same-tab invalidation from cross-tab refresh so immediate Undo state is not remounted away.
- [x] Preserve contractor-edited rates and notes while refreshing untouched source quantities, units, services, and default notes.
- [x] Verify drawing Undo survives navigation and project deletion removes linked drafts and measurements after refresh.

## Completed — First-Time Contractor Acceptance Test

- [x] Walk the public landing, signup, and login experience at phone and desktop sizes.
- [x] Exercise property search, drawing creation, drawing editing, visibility, deletion, and project saving.
- [x] Verify Projects, Drawings, Project Detail, Quotes, Settings, and Account navigation on mobile and desktop.
- [x] Clarify project draft/saved status and prevent empty projects from being saved.
- [x] Remove the redundant unavailable drawing-inspector action before a project exists.
- [x] Clarify quote pricing-default status without overwriting existing edited rates.
- [x] Keep AI results review compact on mobile while preserving explicit Apply controls.
- [x] Improve singular/plural measurement and quote item labels.
- [x] Rename ambiguous project and quote navigation labels.
- [x] Verify quote editing, totals, preview/PDF workflow, Settings persistence, and AI suggestion application.
- [x] Run lint, TypeScript validation, and a production build.
