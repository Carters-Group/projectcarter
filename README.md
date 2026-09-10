# Project Carter — website

Website for **Project Carter** — Trent Macartney, a corporate property advisor
working with property developments, value-add commercial, family offices and
managed funds. Positioning: a creative angle where others see roadblocks —
"there is always a solution to every property".

The site's structure and visual language are modelled on
[essentialsstudio.com.au](https://www.essentialsstudio.com.au) — a dark,
editorial layout with an amber accent.

## Stack

Plain static site. No build step, no framework, no dependencies.

```
index.html                      home — hero, about (Trent), projects, "what I do"
project-haig-on-the-park.html   project detail — Haig On The Park (completed)
project-royal-terraces.html     project detail — Royal Terraces (construction commencing)
project-city-west-villas.html   project detail — City West Villas (construction commencing)
roi-calculator.html             property-hold ROI model — costs, rent growth, interest, debt reduction, value uplift; downloads a PDF, pings Formspree
noi-calculator.html             single-year net operating income model — optional purchase price, income lines, operating expenses (every line, property management included, has a "recovered from tenant" tick that drops it from the total), strata/body corp line, NOI, net operating income as a % (of income and of purchase price), implied value from a cap rate; same reveal gate, PDF and Formspree ping as the ROI page
da-calculator.html              "Development Site (DA)" — cost to take a block to development approval. Starts with a "The site" block: an address that is geocoded once on blur via the free keyless OpenStreetMap/Nominatim `/search` API (confirms the suburb, sets the state that drives stamp duty + demolition, and rewrites the address field as a tidy title-cased one-liner from the matched parts when a road resolves, keeping the leading street number the user typed if the map data has none; the council field is never auto-filled, since the exact LGA name drives the LEP/DCP lookup and map data is unreliable; fails soft, nothing stored), a development-type select, and a 13-box "site characteristics" checklist (heritage, demolition, trees, slope, flood, bushfire, acoustic, contamination, vegetation, stormwater, no mains water/sewer, corner). A rules engine (`RULES`) tags every consultant line "Standard for most DAs", "✳ Likely for this site" or "May be required" from those ticks + the development type, and rolls the likely/possible sets into a "Reports for this site" panel. The **no mains water or sewer** tick also raises a standing `.calc-warn` callout in that panel (and a line in the PDF + Formspree summary) that the block has a major servicing constraint, not just a cost line. Tree costs are a **single** consultant line, "Arborist / tree works" (report plus any approved removal), so they are not double counted with a standing instruction to always hold a council pre-lodgement (pre-DA) meeting before lodging unless the outcome is already certain (repeated on the site-characteristics and council fields and in the PDF disclaimer). Costs: land + buying costs (state-based stamp duty estimator, shared with the ROI page), site works, DA consultants (24 lines), council/statutory fees (DA lodgement, advertising, pre-DA, rezoning only — infrastructure charges and the long service levy live on the GRV page, since they fall due at or after construction certificate), per-year holding costs pro-rated over a DA timeframe in months, optional rental income during the DA netted off, contingency %, PM allowance, and an optional land loan with interest compounded monthly and capitalised over the DA period (tick to also draw the development costs from the loan). All dollar line items start at 0 (no example figures); rate/timeframe/contingency keep illustrative placeholders. The demolition field has its own estimator: with a state set and a demolition footprint area entered, it fills with a single indicative figure at a $/m² rate that glides from a small-job rate down to a large-job rate as the footprint grows (`DEMO_RATES` hi/lo per state, house vs commercial, `DEMO_SMALL`/`DEMO_LARGE` band, min-job floor); ticking "asbestos likely" adds a configurable % uplift. Outputs total cost to DA, cash (equity) required, debt at DA, cost excl. land and cost as a % of land price, plus a month-by-month schedule. Same reveal gate (pc_da_unlocked), PDF (includes the site block + report tiers) and Formspree ping as the other two.
grv-calculator.html             "GRV Calculator" — development feasibility from DA to settled sales. Picks up from the DA calculator with a single "Land + total cost to DA" figure (plus, separately, the land price for GST) rather than re-entering that build-up. A **building-contract toggle** (Design & Construct vs Construct only / trade contracts): under D&C the eight builder-carried design lines (`DC_BUILDER`: structural & civil, hydraulic, MEP & fire, facade, landscape doc, ESD, acoustic, geotech & civil cert) are **disabled, struck through** (`.field.is-included`), excluded from the consultant total and explained in a `.calc-note` under the toggle; the rest read "Developer cost." Under construct-only every line is a developer cost and a builder's-margin % applies. **Dwelling types**: repeatable cards (`#typeCards`, "Add another dwelling type", up to 12), each with a label, count ("how many"), GFA, build cost, sale price and selling-cost % (default 2). Totals roll up as Σ(count × …). A **2026 construction cost estimator** (`BUILD_RATES` per building type × quality, `STATE_LOADING` per state, `BASEMENT_RATE`) sets a $/m² GFA rate from state + building type (single dwellings / townhouses & villas / low-rise / mid-rise / high-rise apartments) + quality (basic / medium / high) and fills each type's build cost from its GFA, plus a basement line from the basement area; a single `touched.build` flag stops auto-fill once any build figure is edited. **Builder's margin** % is added on top of the dwelling + basement build (note: leave at 0 when using the estimator, whose rate already includes prelims & margin). Post-DA consultant lines, post-DA council/statutory lines (CC/permit fee, **infrastructure charges / s7.11 / s7.12**, **long service levy** — both moved here from the DA page — bonds & inspections, plan registration/titles, other), construction extras (solar, landscaping, building extras, marketing, sales legals), contingency % on consultants + statutory + construction, development-management allowance. Finance & holding as manual line items (construction loan interest & fees, land/residual loan holding cost, per-year council rates / land tax / insurances / other charged × months/12); **no holding income** (site is under construction). GST: margin-scheme estimate `(GRV − land price) / 11`, a "no GST (input-taxed)" option, and a manual override; input tax credits on construction not modelled. **Funding**: enter your cash (equity) contribution → results show **Debt required** (= total project cost − contribution) and **cash-on-cash return** (= profit ÷ contribution). Outputs also include cost per dwelling, profit per dwelling, total project cost, net sales proceeds, expected profit, **profit on cost**, profit margin on GRV, and a two-lever **what-if** (sale prices −X%, consultant + construction costs +Y%, plus the combined worst case) feeding "Profit — worst case" and "Profit on cost — worst case" rows and a what-if table. Same reveal gate (`pc_grv_unlocked`), one-page jsPDF (with a per-type breakdown) and Formspree ping as the other three.
enquire.html                    multi-step lead-capture page (full site header, no footer)
thanks.html                     post-submit confirmation page (drop ad conversion tags here)
styles.css                      design system + layout (home, project pages, landing, calculator)
script.js                       header scroll state, mobile nav, scroll reveals
assets/images/projects/         project photography (scraped from cartersinvestments.com.au)
assets/images/team/             Trent portrait
.nojekyll                       serve files as-is on GitHub Pages
```

Every link on the site opens in the same tab (no `target="_blank"`); visitors use
the browser back button to return. Every page (home, project details,
`roi-calculator.html`, `noi-calculator.html`, `da-calculator.html`,
`grv-calculator.html`, `enquire.html`) carries the same fixed site header and
footer. Top-nav order is **About, Projects, Approach, Calculators**, then the
**Enquire** button. **Calculators** is a dropdown (`.nav-dropdown`, toggled by
`script.js`) with **Net Operating Income (NOI)**, **Return on Equity (ROI)**,
**Development Site (DA)** then **Gross Realisation Value (GRV)**; on mobile it
expands inline in the slide-down menu. The footer nav lists all four calculators
flat plus a **Contact** link.

`enquire.html` is the multi-step lead-capture form (no footer, no personal phone
or email; enquiries arrive only through the form). `roi-calculator.html` is a
client-side property-hold ROI model. You enter the purchase price, the loan (as a
% of price), one-off buying costs (stamp duty, loan/valuation, legal, building
inspection, other), the Year 1 net rent, rental growth, interest rate, term, the
share of annual profit used to pay down the loan, and an optional value uplift
(year, new base rent, new growth rate). It builds a year-by-year schedule and
reports total cash required, net sale proceeds, total profit, total ROI, return
per year, equity multiple and IRR.

**Stamp duty estimator.** Focusing the stamp duty field opens a state/territory
picker plus a **Commercial / non-residential** checkbox; choosing a state fills
the field from that jurisdiction's published **general transfer duty scale** for
the purchase price — the rate a company or investor purchase attracts (no
first-home or owner-occupier concession). Scales for all eight jurisdictions are
in `STAMP` / `stampEstimate()` in the page script, keyed off published **2024–25**
general rates (NT uses its quadratic formula under $525k). Commercial handling
(current for 2025–26): **SA** → nil (abolished on qualifying non-residential
property from 1 July 2018); **ACT** → nil up to `ACT_COMM_THRESHOLD` ($2.1M from
1 July 2026), then a flat 5% of the whole value; **VIC** → still charged (with a
note that commercial/industrial pays duty once more post-1 July 2024 then moves
to annual CIPT); other states → same as the general scale. The filled figure
also **folds in the land-titles-office registration fees** — a `REGO` /
`regoFees()` table of per-state transfer-registration fees (flat in some
states, price-scaled in QLD/WA/SA/VIC) plus a flat mortgage-registration fee
that is only added when a loan (`#lvr`) is set; discharge of the seller's
mortgage is the seller's cost and is left out. The reveal note spells the
components out ("Includes $3,585 transfer registration and $231 mortgage
registration"), and the results/PDF label becomes "Stamp duty + registration".
It is an estimate, not the SRO's or titles registry's figure, and excludes
foreign-purchaser surcharges and concessions; a disclaimer says so by the
field and in the PDF. Editing the field pins your own number; clearing it
re-enables the estimate. The same estimator (duty + registration fees) runs
on `roi-calculator.html` and `da-calculator.html`; `noi-calculator.html` has
no acquisition-cost fields. **Other purchasing cost** is a plain
optional field (no auto-default). There is also an optional **exit cap rate on sale**: the capitalisation rate used
for value glides straight-line from the entry net yield in year 1 to that exit
cap rate by the final year (blank holds the entry yield), so yield compression or
softening can be modelled. The "Your return" figures and the year-by-year table
**update live but every digit after the first is masked** (`$4••,•••`,
`1••.••%`) until the visitor submits the modal behind the **Download ROI
summary (PDF)** button; the unlock is remembered per browser in `localStorage`
(`pc_roi_unlocked`) and the button then becomes "Download the PDF again". A
handful of input-derived rows (loan, deposit, total cash required, entry/exit
yield) and the schedule's Year column stay in full as a teaser. The modal has an
optional **"Can you review these figures and summarise them for me?"** checkbox
(`Assessment requested`) that also bumps the Formspree `_subject`. Masking is
done in JS so the real values are not in the DOM, but a determined visitor can
still re-run the model from the script; a true gate needs server-side rendering,
which a static site can't do. With JavaScript off, nothing is masked. Figures update live, the
modal form builds a one-page PDF with **jsPDF** (loaded from cdnjs) that downloads
in the browser, and the figures + contact details are POSTed to Formspree in the
background. Both forms share the same `YOUR_FORM_ID` Formspree placeholder.

The brand wordmark is **"PROJECT CARTER"** only (no "DEVELOPMENT" sub-line).

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000

## Deploy — GitHub Pages

1. Push to `main` (already the default branch).
2. On GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/ (root)** → **Save**
3. The site publishes at `https://carters-group.github.io/projectcarter/`
   within a minute or two.

### Custom domain (when ready)

1. Add a file named `CNAME` at the repo root containing just the domain, e.g.
   `projectcarter.com.au`
2. At your DNS provider, point the domain at GitHub Pages
   ([current IPs / CNAME target](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site)).
3. Back in **Settings → Pages**, enter the domain and enable **Enforce HTTPS**.

## Content that still needs real input

Everything below is placeholder and should be replaced before the site goes public:

| Item | Where |
| --- | --- |
| **Formspree form ID** (so enquiries reach your inbox) | `enquire.html`, `roi-calculator.html`, `noi-calculator.html`, `da-calculator.html` and `grv-calculator.html` → `action="https://formspree.io/f/YOUR_FORM_ID"` |
| Landing page headline + sub-text | `enquire.html` → between the `EDIT THIS WORDING` comments |
| Landing background photo or video | `enquire.html` → `.landing-media` (instructions in the file + `assets/images/README.md`) |
| Ad conversion tracking (Google Ads / Meta Pixel) | `thanks.html` → `AD CONVERSION TRACKING` comment |
| Hero words ("Every property / has a / solution") | `index.html` → `.hero-words` |
| About / bio copy | `index.html` → `#about` |
| Project copy, stats and galleries | `project-*.html` |
| Contact phone / email | `enquire.html` (currently `0411 940 010` / `trent@cartersinvestments.com.au`) |
| Royal Terraces / City West Villas renders | placeholder concept images — swap for final renders when available (`assets/images/projects/`) |
| LinkedIn / Instagram URLs | `index.html` → footer (not yet added) |
| Privacy Policy link | footer (all pages) |
| ABN / registered entity details | footer, if required |

### Project images

Photography and renders under `assets/images/projects/` were pulled from
**cartersinvestments.com.au** (your own site), resized to 1800px wide and
recompressed. Haig On The Park has real completion photography; Royal Terraces
and City West Villas currently use concept renders / line drawings — replace
these with final renders or photography as they're produced. The floor-plan PNGs
on the City West Villas page are the WIP plans from the current site.

## Making the enquiry form email you

The landing page form (`enquire.html`) is wired for [Formspree](https://formspree.io),
which emails you every submission — no backend, works on GitHub Pages, includes
spam filtering.

1. Sign up at [formspree.io](https://formspree.io) with the inbox you want
   enquiries to land in.
2. Create a new form; Formspree gives you an endpoint like
   `https://formspree.io/f/abcdwxyz`.
3. In `enquire.html`, replace `YOUR_FORM_ID` in the form `action` with that id
   (e.g. `action="https://formspree.io/f/abcdwxyz"`).
4. Submit the form once yourself and confirm the verification email from
   Formspree so future submissions come straight through.

After a successful submit the visitor is sent to `thanks.html` (via the hidden
`_next` field) — put your Google Ads / Meta conversion tag on that page so a
conversion only fires on a real enquiry. On Formspree's free plan `_next` needs
the full URL, e.g. `https://your-domain.com/thanks.html`.

Alternatives if you'd rather not use Formspree: [Netlify Forms](https://docs.netlify.com/forms/setup/)
(only if you host on Netlify) or [Basin](https://usebasin.com) — same idea, swap
the `<form>` `action`.
