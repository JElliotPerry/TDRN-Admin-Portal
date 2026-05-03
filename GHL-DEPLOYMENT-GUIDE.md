# TDRN Admin Portal — GoHighLevel Deployment Guide
Prepared by Agent Thrive | TDRN v2.0

---

## What's In This Package

```
tdrn-v2/
├── index.html              National Dashboard
├── tennessee.html          Tennessee State Dashboard
├── warren-county.html      Warren County Hub (links to all modules)
├── wc-members.html         Member Directory
├── wc-teams.html           Team Management
├── wc-training.html        Training Records
├── wc-equipment.html       Equipment Registry
├── wc-events.html          Events & Calendar
├── wc-communications.html  Communications Center
├── wc-documents.html       Document Vault
├── wc-certifications.html  Certifications
├── wc-applicants.html      Applicant Pipeline
├── wc-partners.html        Partner Network
├── wc-readiness.html       Incident Readiness Board
├── wc-settings.html        County Settings
├── tdrn-core.css           Design System (WCAG 2.1 AA/AAA)
└── tdrn-core.js            JavaScript Engine
```

---

## GoHighLevel Deployment — Step by Step

### METHOD 1: GHL Website Pages (Recommended)

This method hosts each page as a custom GHL website page.

**Step 1 — Upload CSS and JS as Custom Files**
1. In GHL, go to: Sites → Your Website → Custom Code
2. Or go to Settings → Custom Code / Files
3. Upload `tdrn-core.css` and `tdrn-core.js`
4. Note the CDN URLs GHL assigns to each file (they will look like:
   `https://storage.googleapis.com/msgsndr/YOURACCOUNTID/media/tdrn-core.css`)
5. In each HTML file, replace:
   `<link rel="stylesheet" href="tdrn-core.css">`
   with:
   `<link rel="stylesheet" href="YOUR_GHL_CSS_CDN_URL">`
   And replace:
   `<script src="tdrn-core.js"></script>`
   with:
   `<script src="YOUR_GHL_JS_CDN_URL"></script>`

**Step 2 — Create Pages in GHL**
1. Go to Sites → Websites → Add New Page
2. Choose "Custom Code" or "Blank" template
3. For each HTML file, create a corresponding GHL page:
   - index.html → Page slug: /tdrn/dashboard
   - tennessee.html → Page slug: /tdrn/tennessee
   - warren-county.html → Page slug: /tdrn/warren-county
   - wc-members.html → Page slug: /tdrn/members
   - (and so on for each file)
4. In the GHL page editor, paste the full HTML content into the Custom Code block
5. Set page to "Password Protected" if this is an admin portal (recommended)

**Step 3 — Update Internal Links**
After creating pages, update the links in each HTML file to match your GHL slugs.
For example, in the sidebar, change:
   `href="tennessee.html"` → `href="/tdrn/tennessee"`
   `href="warren-county.html"` → `href="/tdrn/warren-county"`

**Step 4 — Set Password Protection**
1. In GHL page settings, enable Password Protection
2. Set a strong password and share only with authorized TDRN admins
3. For production: use GHL Membership areas for role-based access

---

### METHOD 2: GHL Membership Area (Best for Role-Based Access)

This is the recommended production approach — gives each user their own login.

1. Go to Sites → Memberships → Create New Course/Community
2. Create a private TDRN Admin membership product (free, invite-only)
3. Add each portal page as a lesson/module
4. Paste the HTML into the Custom Content block of each lesson
5. Assign members to the membership product when they join TDRN
6. Members see only pages their role permits

---

### METHOD 3: GHL Funnel Pages

For a quick proof-of-concept or presentation:
1. Create a new Funnel in GHL
2. Add steps for each portal page
3. Use "Custom Code" block and paste full HTML
4. Works but lacks persistent sidebar navigation — use for demos only

---

## After Deployment — Connecting Real Data

Currently the portal uses mock/static data. To connect live data:

### Option A: GHL Native CRM
- Map Members → GHL Contacts with custom fields for: Role, Skills, Certifications, Status
- Map Equipment → Custom Object in GHL CRM
- Use GHL's API to pull data into the portal via JavaScript fetch()
- Endpoint: `https://rest.gohighlevel.com/v1/contacts/`

### Option B: Supabase (Free, Recommended)
- Create free account at supabase.com
- Create tables: members, teams, equipment, events, certifications
- Replace `TDRN.data` mock data in tdrn-core.js with Supabase fetch calls
- Supabase provides real-time subscriptions — perfect for live readiness board

### Option C: Google Sheets + Apps Script
- Cheapest option for small scale
- Google Sheets as database, Apps Script as API layer
- Fetch data via fetch() in tdrn-core.js

---

## Accessibility Compliance Summary

This portal is built to:
- WCAG 2.1 AA minimum (all text/contrast ratios)
- WCAG 2.1 AAA target for most elements
- Section 508 compliant
- ADA Title II / Title III compliant

Key compliance features built in:
- All text meets 4.5:1 contrast ratio minimum
- Skip-to-main-content link on every page
- All interactive elements have aria-label attributes
- Status indicators use icon + text + color (never color alone)
- Progress bars have aria-valuenow/min/max attributes
- All form inputs have visible <label> elements
- Minimum 44x44px touch targets on all buttons
- Focus rings visible on all interactive elements
- Screen reader announcements for dynamic content
- Keyboard navigation fully supported
- Focus mode for ADD/ADHD users
- prefers-reduced-motion respected
- Print stylesheet included

---

## Quick Start Checklist

- [ ] Upload tdrn-core.css to GHL file manager
- [ ] Upload tdrn-core.js to GHL file manager
- [ ] Update CSS/JS URLs in all 15 HTML files
- [ ] Create 15 GHL pages with correct slugs
- [ ] Paste HTML content into each page
- [ ] Update all internal href links to GHL slugs
- [ ] Enable password protection or membership access
- [ ] Test all pages on desktop, tablet, and mobile
- [ ] Test keyboard navigation (Tab through all interactive elements)
- [ ] Test with a screen reader (NVDA free, VoiceOver on Mac/iOS)
- [ ] Connect backend data source (Supabase recommended)
- [ ] Set up GHL automation for member notifications

---

## Support

For questions on this build, contact your TDRN tech team.
Portal built by Agent Thrive | TDRN v2.0 | May 2026
