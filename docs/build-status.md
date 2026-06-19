# AcreX Build Status

Last reviewed: June 19, 2026.

## Current Status

The compact landing-page rebuild is complete. The homepage now explains AcreX in one short visual flow with clear audience, workflow, benefit, and CTA sections while leaving all authenticated app functionality unchanged.

## Verification

- `npm run lint`: passing
- `npm run build`: passing
- Static and dynamic routes: passing, including `/exports`
- Browser console errors during final responsive check: none
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
- Map Quotes action: routes directly to `/quotes` instead of opening a limited snapshot sheet
- Drawing inspector: opens half-height on selection with visible measurement, project, location, quote, drawing, and expandable edit/delete controls
- Mobile Quote workspace: Estimate and Line Items remain primary; quote details, materials, labor/equipment, scope, review, and pricing open on demand
- Location marker: uses an HTML Mapbox marker with a centered dot, crosshairs, and accuracy halo that remains visible across style changes
- `npx tsc --noEmit`: passing
- Latest iPhone 17 simulator build and launch: passing with no Xcode warnings or errors
- Landing page: shared app logo, local high-resolution visuals, consistent icons, and all requested sections present
- Landing CTA routes: `/signup`, `/login`, `/terms`, `/privacy`, and support email verified
- Landing responsive regression: 393px phone and 1440px desktop layouts have exact viewport-width documents with no horizontal overflow
- Landing hero regression: image and text remain separate on phone and desktop with no overlap

## Remaining Release Work

- Configure `CAPACITOR_SERVER_URL` for the production Vercel deployment.
- Complete final native assets, privacy configuration, version/build numbers, archive validation, and TestFlight/App Store submission.
