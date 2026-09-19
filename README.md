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
index.html                      home — hero, a short about teaser, projects, a short "what I do" teaser, each linking to its own standalone page
about.html                      standalone About page — Trent's full bio, who he works with, service area, links to every calculator
approach.html                   standalone Approach page — the four-stage process, all six service pillars in depth, links to every calculator
project-haig-on-the-park.html   project detail — Haig On The Park (completed)
project-royal-terraces.html     project detail — Royal Terraces (construction commencing)
project-city-west-villas.html   project detail — City West Villas (construction commencing)
roi-calculator.html             property-hold ROI model — costs, rent growth, interest, debt reduction, value uplift; downloads a PDF, pings Formspree
noi-calculator.html             single-year net operating income model — optional purchase price, income lines, operating expenses (every line, property management included, has a "recovered from tenant" tick that drops it from the total), strata/body corp line, NOI, net operating income as a % (of income and of purchase price), implied value from a cap rate; same reveal gate, PDF and Formspree ping as the ROI page
da-calculator.html              "Development Site (DA)" — cost to take a block to development approval. Starts with a "The site" block: an address that is geocoded once on blur via the same-origin `/api/geocode` proxy to OpenStreetMap/Nominatim (confirms the suburb, sets the state that drives stamp duty + demolition, and rewrites the address field as a tidy title-cased one-liner from the matched parts when a road resolves, keeping the leading street number the user typed if the map data has none; the council field is never auto-filled, since the exact LGA name drives the LEP/DCP lookup and map data is unreliable; fails soft, nothing stored), a development-type select, and a 13-box "site characteristics" checklist (heritage, demolition, trees, slope, flood, bushfire, acoustic, contamination, vegetation, stormwater, no mains water/sewer, corner). A rules engine (`RULES`) tags every consultant line "Standard for most DAs", "✳ Likely for this site" or "May be required" from those ticks + the development type, and rolls the likely/possible sets into a "Reports for this site" panel. Every consultant line also carries a static **typical fee range** (`.field-range`, e.g. "single dwelling $10,000–$20,000; large multi-storey $60,000–$250,000+") as a reference point only — it never fills the field — since pricing is the thing clients ask consultants about most; figures are drawn from published Australian cost guides and industry pricing pages, sense-checked against real quotes where given, but still an estimate, not a quote. The **no mains water or sewer** tick also raises a standing `.calc-warn` callout in that panel (and a line in the PDF + Formspree summary) that the block has a major servicing constraint, not just a cost line. Tree costs are a **single** consultant line, "Arborist / tree works" (report plus any approved removal), so they are not double counted with a standing instruction to always hold a council pre-lodgement (pre-DA) meeting before lodging unless the outcome is already certain (repeated on the site-characteristics and council fields and in the PDF disclaimer). Costs: land + buying costs (state-based stamp duty estimator, shared with the ROI page), site works, DA consultants (24 lines), council/statutory fees (DA lodgement, advertising, pre-DA, rezoning only — infrastructure charges and the long service levy live on the GRV page, since they fall due at or after construction certificate), per-year holding costs pro-rated over a DA timeframe in months, optional rental income during the DA netted off, contingency %, PM allowance, and an optional land loan with interest compounded monthly and capitalised over the DA period (tick to also draw the development costs from the loan). All dollar line items start at 0 (no example figures); rate/timeframe/contingency keep illustrative placeholders. The demolition field has its own estimator: with a state set and a demolition footprint area entered, it fills with a single indicative figure at a $/m² rate that glides from a small-job rate down to a large-job rate as the footprint grows (`DEMO_RATES` hi/lo per state, house vs commercial, `DEMO_SMALL`/`DEMO_LARGE` band, min-job floor); ticking "asbestos likely" adds a configurable % uplift. Outputs total cost to DA, cash (equity) required, debt at DA, cost excl. land and cost as a % of land price, plus a month-by-month schedule. Same reveal gate (pc_da_unlocked), PDF (includes the site block + report tiers) and Formspree ping as the other two.
grv-calculator.html             "GRV Calculator" — development feasibility from DA to settled sales. Picks up from the DA calculator with a single "Land + total cost to DA" figure (plus, separately, the land price for GST) rather than re-entering that build-up. A **building-contract toggle** (Design & Construct vs Construct only / trade contracts): under D&C the builder-carried lines (`DC_CARRIED`: architect docs to CC, structural & civil, hydraulic, MEP & fire, facade, landscape doc, ESD, acoustic, geotech & civil cert, **building surveyor / certifier**, **CC / building permit fee**, **long service levy**, and **contract works & public liability insurance**) are **disabled, struck through** (`.field.is-included`), flagged "Carried by the builder under D&C." (`DC_FLAG_IDS`) and excluded from the consultant / statutory / holding totals; a `.calc-note` under the toggle lists them and points the developer's own PI / latent-defects cover at "Other holding cost". The rest read "Developer cost." Post-DA consultant lines also carry the same **typical fee range** reference as the DA page (single dwelling vs. large multi-storey, drawn from published Australian cost guides and sense-checked against real quotes where given), which drops off a line entirely once it is builder-carried under D&C (`.field.is-included .field-range { display: none; }`), since it is no longer a cost the developer is pricing. Under construct-only every line is a developer cost and a builder's-margin % applies. **Dwelling types**: repeatable cards (`#typeCards`, "Add another dwelling type", up to 12), each with a label, count ("how many"), GFA, build cost, sale price and selling-cost % (default 2). Totals roll up as Σ(count × …). Each card also shows two derived per-dwelling figures: **construction only / dwelling** (build + its GFA-share of basement, × builder's margin) and **blended land + build / dwelling** (that plus its share of the land + cost to DA, spread across types by GFA × count share). All cost inputs are entered **ex-GST** (stated on the page, PDF and assumptions; input tax credits not modelled). A **2026 construction cost estimator** (`BUILD_RATES` per building type × quality, `STATE_LOADING` per state, `BASEMENT_RATE`) sets a $/m² GFA rate from state + building type (single dwellings / townhouses & villas / low-rise / mid-rise / high-rise apartments) + quality (basic / medium / high) and fills each type's build cost from its GFA, plus a basement line from the basement area; a single `touched.build` flag stops auto-fill once any build figure is edited. **Builder's margin** % is added on top of the dwelling + basement build (note: leave at 0 when using the estimator, whose rate already includes prelims & margin). Post-DA consultant lines, post-DA council/statutory lines (CC/permit fee, **infrastructure charges / s7.11 / s7.12**, **long service levy** — both moved here from the DA page — bonds & inspections, plan registration/titles, other), construction extras (solar, landscaping, building extras, marketing, sales legals), **contingency % (defaults to 10, `value="10"`, editable)** on consultants + statutory + construction, development-management allowance. **Finance charges** are a repeatable list (`#financeRows`, `addFinance`/`financeModel`, up to `MAXF` = 8, seeded with interest / line fee / establishment-and-admin-fee rows): each row is a rate + a basis (`debt` = debt required, `facility` = facility limit or debt required if `#facilityLimit` blank, `total` = total project cost, `flat` = $ amount — the `.input-pct`/`.input-money` affix on `[data-rate-wrap]` toggles with the basis) + a frequency (`pa` pro-rated × months/12, or `oneoff`). A **`debt` + `pa` row is the interest rate** (BBSY + margin, or fixed) and is run through `drawdownInterest()` instead of charged flat: costs draw on a smoothstep S-curve over the months, equity is spent before debt (`daTotal` treated as incurred at the start), and interest accrues monthly on the outstanding balance and capitalises. Results also expose **average debt drawn** and **peak debt** (end of period). Rates on `debt`/`total` use the **pre-finance total** so finance is never levied on finance. Plus per-year holding line items (council rates / land tax / insurances / other × months/12); **no holding income** (site is under construction). GST: margin-scheme estimate `(GRV − land price) / 11`, a "no GST (input-taxed)" option, and a manual override; input tax credits on construction not modelled. **Funding**: two equity inputs — **equity invested to reach DA** (`#daEquity`, brought across from the DA calculator's "cash equity required") and an **additional cash contribution** (`#cashIn`) — sum to **total equity contributed**; results show **Debt required** (= total project cost − total equity) and **cash-on-cash return** (= profit ÷ total equity). Outputs also include cost per dwelling, profit per dwelling, total project cost, net sales proceeds, expected profit, **profit on cost**, profit margin on GRV, and a two-lever **what-if** (sale prices −X%, consultant + construction costs +Y%, plus the combined worst case) feeding "Profit — worst case" and "Profit on cost — worst case" rows and a what-if table. Same reveal gate (`pc_grv_unlocked`) and Formspree ping as the other three; the jsPDF is a **P&L-style report** (Inputs & assumptions, Dwelling types, Development P&L with a bracketed `EXPECTED PROFIT / (LOSS)` bottom line, Funding, Finance charges, Worst case) that flows onto a second A4 page via an `ensure()` page-break guard, with losses shown in accounting brackets.
pr-calculator.html              "Portfolio Review (PR)" — a multi-property, single-year after-tax cash-flow / gearing review, ported from the client's spreadsheet. A portfolio-level marginal tax rate, then repeatable **property cards** (`#propertyCards`, "Add another property", up to 15, at least 1): each has a name, value, LVR % (loan + equity shown), interest rate (interest-only), rent $/week (gross rent + gross yield shown), a "Yearly running costs" block (property management % of rent, letting fee $, council rates, body corporate / strata, land tax $, insurance, maintenance $/week, vacancy allowance in weeks × the weekly rent, annual loan fees, sundry), an optional depreciation block (building at cost × rate, default 2.5%; fittings at cost × rate, default 10%) and an optional "this property is being purchased" toggle that reveals one-off acquisition costs (stamp duty with the shared state estimator — `STAMP`/`REGO`/`stampEstimate`/`regoFees`, per-card state select + commercial tick — plus conveyancing, borrowing costs, an "Other" one-off lump sum for anything else — BA/planning fees, building or pest reports, a QS report, other specialist consultants — and improvements). Each card shows its own net yield, pre-tax cash flow, annual & weekly surplus/(deficit) and the weekly rent needed for neutral gearing (`neutralWk`, solved holding all else equal). Per property: net rent = gross rent − expenses; pre-tax cash flow = net rent − interest; then, matching the spreadsheet's two steps, tax benefit/(cost) before depreciation = −(pre-tax cash flow) × rate (a loss is refunded, a profit taxed) and the depreciation tax credit = depreciation × rate; annual surplus = pre-tax cash flow + that tax benefit + the depreciation credit; weekly = ÷ 52. The `#calcResults` panel sums every property: combined value / debt / equity / portfolio LVR (teaser rows, always shown), blended gross & net yields, combined operating expenses, net rental income, loan interest, pre-tax cash flow, tax benefit, depreciation credit, **combined annual and weekly surplus/(deficit)** (the headline), result vs portfolio value, shortfall to neutral gearing $/week, and — only when a card has acquisition costs — total acquisition costs and cash required to complete. A "Property by property" table under the panel mirrors the schedule on the other pages with a Portfolio total row. Same reveal gate (`pc_pr_unlocked`) and Formspree ping as the other calculators; the one-page jsPDF is laid out as a **plain-English P&L** (Portfolio at a glance, then a Yearly cash flow block: rent collected less each running-cost line that has a value, a subtotal rule to net rent, less interest to cash flow before tax, plus the tax refund and depreciation saving, then a ruled `AFTER-TAX CASH FLOW (PER YEAR)` bold line, the weekly figure, % of value and break-even rent; an "If buying" section only when a card has purchase costs; then the per-property table and disclaimer), with an `ensure()` page-break guard. The **"Portfolio name"** field prefills from the signed-in account (`<surname> Family`, or the full name / email local-part) while it is still empty and untouched and no `?report=` is being opened. Input placeholders are all `0` except the genuine conventions kept as real values (depreciation 2.5% / 10%, tax rate 37%); property management is a grey `4.4` placeholder hint only, not an auto-filled value, since PM fees vary too much to default. A **net lease** auto-ticks the usual recoverable outgoings but never auto-ticks **land tax** — many retail leases can't pass land tax through even on a net lease, so that tick is always left to the user. The **post-Budget negative-gearing tick is residential-only** (hidden on commercial cards and forced off in the model for commercial), since the 2026 Budget change didn't touch commercial negative gearing. Tax rate is capped at 99% to keep the break-even-rent solve finite. The `$` / `%` input affixes were tightened site-wide (`styles.css` `padding-left: 22px`; the `--pct-x` JS offset `+ 3` → `+ 1` in all five calculators).
enquire.html                    multi-step lead-capture page (full site header, no footer)
api/email-reputation.js         Vercel serverless function - same-origin POST {email} proxy for the enquiry form's deliverability check via abstractapi.com, so ABSTRACTAPI_KEY stays server-side (a Vercel env var), never in client-side JS; rate-limited, fails open
api/geocode.js                  Vercel serverless function - same-origin proxy for the DA calculator's Nominatim address lookup (OSM requires an identifying User-Agent, which browsers can't set); rate-limited, fails soft
thanks.html                     post-submit confirmation page (drop ad conversion tags here)
account.html                    sign in / sign up (magic link or password) + the signed-in dashboard: a "Your portfolio" card (combined value, debt, equity, LVR, useable equity at 70% and 80%, cash flow before tax, land tax, "if you sold everything" cash in hand, a debt-reduction goal, a portfolio plan that seeds an ROI projection, and a three-scenario risk check, all derived live from the property register), a "Your properties" register (one accordion per property, entered once, with a live summary strip plus leases / WALE), a "Tax position" card (land tax by state, capital gains tax if sold with line-by-line workings and an accountant checklist), "Quick access" calculator cards, a "Recently saved calculations" list, a profile photo and an editable details form
pc-auth.js                      shared Supabase client - window.pcAuth (auth, save/list/get/rename/delete/duplicate report, properties + leases CRUD, tax settings, getPortfolioSummary for the calculators' funds-available, update profile incl. occupation), auth status bar, subscription gate (canSave, always true for now)
tax.js                          land tax + capital gains tax estimators (window.pcTax, pure functions, unit-tested in tax.test.js) - see "Property register and tax position" below
portfolio.js                    portfolio metrics from the property register (window.pcPortfolio, pure, unit-tested in portfolio.test.js): equity / LVR / useable equity, yield, cash flow, growth, land tax share, cash in hand if sold, portfolio totals and the summary the calculators pull
pc-report.js                    shared per-calculator wiring - "Project name or address" field, "Save report" button, ?report=<id> rehydration
supabase-schema.sql             one-time SQL for the Supabase project: profiles (incl. occupation, tax_settings) + reports + properties/leases tables (properties carry the land tax / CGT fields), row-level security, subscription_status column, one-master-portfolio-per-user constraint
styles.css                      design system + layout (home, project pages, landing, calculator, account)
script.js                       header scroll state, mobile nav, scroll reveals
assets/images/projects/         project photography (scraped from cartersinvestments.com.au)
assets/images/team/             Trent portrait
.nojekyll                       leftover GitHub Pages marker (production is Vercel; harmless if kept)
sitemap.xml                     lists every indexable page (noindex pages excluded) for search engines
robots.txt                      allows all crawlers, points at sitemap.xml
```

Every link on the site opens in the same tab (no `target="_blank"`); visitors use
the browser back button to return. Every page (home, project details,
`roi-calculator.html`, `noi-calculator.html`, `da-calculator.html`,
`grv-calculator.html`, `pr-calculator.html`, `cl-calculator.html`, `enquire.html`) carries the same fixed site header and
footer. Top-nav order is **About, Projects, Approach, Calculators**, then the
**Enquire** button. **About** and **Approach** are their own pages
(`about.html`, `approach.html`); **Projects** stays an in-page anchor to the
project grid on `index.html`. **Calculators** is a dropdown (`.nav-dropdown`, toggled by
`script.js`) listing, in order, **Portfolio Review (PR)**, **Commercial
Lending (CL)**, **Return on Investment (ROI)**, **Net Operating Income
(NOI)**, **Development Site (DA)** and **Gross Realisation Value (GRV)** -
matched by the calculators.html card grid; on mobile it expands inline in the slide-down menu. The footer nav
lists About, Projects, Approach, Calculators, Account and Contact.

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
background. Both forms share the same Formspree endpoint (`https://formspree.io/f/xqpkjvkb`).

The brand wordmark is **"PROJECT CARTER"** only (no "DEVELOPMENT" sub-line).

## Accounts and saved reports (Supabase)

Every calculator now has a **"Project name or address"** field at the top of the
inputs (on `da-calculator.html` the existing address field doubles as it). It
prints on the PDF header, goes into the Formspree email, and is used as the
title when a report is saved.

Signed-in visitors get the calculators **unmasked** - the full figures update
live, no download needed - and a **"Save report"** button next to the download
button. A saved report stores the **input values only** (as JSON); opening it
from `account.html`, or via `<calculator>.html?report=<id>`, rehydrates the
calculator and it recomputes. Anonymous visitors are unchanged: masked figures
behind the Formspree lead modal.

Sign-in is **passwordless magic link**. Sign-up collects name + phone + email
and still pings Formspree once, so every new account also lands in your inbox as
a lead. Signed-in visitors can update their name and phone any time from a
"Your details" form on `account.html`.

### Your portfolio (the property register)

The **property register** on `account.html` is the single source of truth for a
visitor's portfolio. Each property is entered **once**, in the order an owner
thinks about it: the property (name, type, state, owned by), what was paid
(contract date, price, buying costs), what has been put in (capital
improvements, building write-off), what it is worth and owed today (current
value, unimproved land value, loan balance, interest rate, yearly running
costs), what it earns (the leases, with rent and expiry) and an "if you sold"
scenario (sale date, sale price, optional 1 July 2027 value). Blank means "not
entered" and `0` means "none" (a loan balance of 0 is a property with no loan).

`portfolio.js` (`window.pcPortfolio`, pure and unit-tested in
`portfolio.test.js`) derives every figure from those fields, so no number is
ever asked for twice and none can disagree: per property, equity, LVR, useable
equity at 70% and 80%, gross yield, cash flow before tax (rent from current
leases less running costs less interest), growth since purchase, land tax share
and cash in hand if sold (net proceeds less the loan less capital gains tax);
for the portfolio, the sums plus land tax by state, a blended interest rate and
the cash in hand if everything were sold. Totals only count properties that
have what each figure needs, and a "To complete your picture" list names who is
missing what rather than guessing. Each collapsed property shows a one-line
summary strip (value, equity, LVR, yield, cash flow, cash if sold) that updates
live as the form is edited.

The "Your portfolio" card on top of the page reads from that, and so do its
debt-reduction goal, portfolio plan (which also seeds a saved ROI projection)
and three-scenario risk check (rate rise or vacancy, shown separately). The
lending, ROI and development calculators pull **useable equity** as "funds
available" through `pcAuth.getPortfolioSummary()`, which computes it live from
the register. Portfolio Review (`pr-calculator.html`) stays a standalone
after-tax cash-flow model with its own saved reports; the old master-portfolio
flag (`reports.is_master`) is no longer read anywhere on the account page.
`account.html` lists every saved report under "Recently saved calculations"
(Rename, Duplicate, Delete).

### Property register and tax position

The register (a "Your properties" card, one accordion per property, backed by
the `properties` / `leases` tables) also tracks tenants, expiries, reviews and
options, with a portfolio WALE and an upcoming-dates timeline. A **Tax
position** card underneath rolls the same fields up, live from the saved data
(nothing is asked twice; state, owner type, land value, purchase details,
improvements, building write-off and the sale scenario all live in the
property form):

- **Land tax.** Grouped per state per owner type (thresholds do not stack across
  states), tax worked out on the aggregated unimproved value and split back to
  each property pro-rata by land value. "Other taxable land you hold in your own
  name" per state (in the settings box) joins the individual group. Schedules
  (`LAND` in `tax.js`): NSW (2026, frozen thresholds, special-trust rates),
  VIC (2024-2033 general + trust tables from the SRO), QLD (individual vs
  company/trust, from the Queensland Revenue Office), WA (plus the Perth-metro
  MRIT tick), SA, TAS. ACT and NT are flagged "not modelled". SMSFs are taxed at
  general rates outside QLD; foreign-owner/absentee surcharges and exemptions
  (own home) are left out.
- **Capital gains tax if sold.** Current law: 50% discount (individual/trust,
  held over 12 months), one-third (super fund, taxed at 15%), none (company,
  30%), tax taken as the extra tax on top of "other taxable income" using the
  resident scale plus Medicare. For a sale on or after 1 July 2027 it also shows
  the **announced 2026-27 Budget reform** (announced, not yet confirmed as law):
  cost-base indexation by an editable CPI assumption plus a 30% minimum tax,
  with a split-gain transition (gain to 1 July 2027 keeps the 50% discount, the
  1 July 2027 value being the visitor's figure or a steady-growth estimate) and a
  new-build election that takes the cheaper regime. Rates and dates live in one
  config block at the top of `tax.js` so a legislated change is a small edit.
  Cost base = purchase price + buying costs + capital improvements - building
  write-off (Division 43), which reduces it whether or not it was claimed (s110-45);
  plant and equipment (Division 40) is a separate balancing adjustment and is not
  in this estimate. The dates are contract dates, and the 12-month discount test
  leaves out both the purchase day and the sale day (a sale exactly on the
  anniversary is still short). Each property has a "How this was worked out"
  panel showing every line, and the section ends with a "get the final numbers
  from your accountant" callout (what changes the answer, what records to bring).
  A purchase before 20 September 1985 is flagged as outside CGT and not modelled.
- **Settings** (`profiles.tax_settings`, jsonb): other taxable income, CPI,
  selling-cost %, other land per state. Read/written on their own, not through
  `PROFILE_COLS`, so a missing migration only disables this card, never sign-in.

Re-run `supabase-schema.sql` before deploying this (it adds the property tax
columns, the current value / loan balance / interest rate / running costs
columns and `profiles.tax_settings`); until then saving a property shows a
prompt to do so. Run `node --test portfolio.test.js tax.test.js stamp.test.js`
for the estimator tests.

Everything is **free**. `profiles.subscription_status` (defaults to `'free'`)
and the `pc_can_save()` SQL function are the hooks for a future paywall - today
`pc_can_save()` always returns true. Wiring Stripe later is a contained change
(flip the column, tighten that one function and the `reports` INSERT policy).

### One-time setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase **SQL editor**, run `supabase-schema.sql` (safe to re-run).
3. **Settings - API**: the live **Project URL** and **anon / public** key are
   already in `pc-auth.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Both are
   safe to commit - the anon key grants nothing without a signed-in user,
   because row-level security scopes every row to its owner. Clearing those
   values hides the status bar and Save button and shows a "not switched on
   yet" note on `account.html`; the calculators still work.
4. **Authentication - URL Configuration**: set the **Site URL** to your deployed
   origin and add `<origin>/account` (plus `http://localhost:PORT/account` for
   local work) to **Redirect URLs**, exactly matching the clean URL the site
   links to (`vercel.json` rewrites `/account` to `account.html`) - the magic
   link's `redirectTo` is always `<origin>/account`, and Supabase requires an
   exact match, so whitelisting `account.html` instead silently breaks
   sign-in (the visitor never gets a session and just sees the sign-in form
   again). The same redirect covers the "change email" confirmation link
   used by the Email section on the account page - no separate setup needed.
5. Optional: **Authentication - Providers - Email** - turn **"Confirm email"**
   off, since the magic link already proves the address.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000

## Deploy — Vercel

Production is a Vercel static deployment of this folder. There is no build
step, no `package.json`, and no output directory to configure.

1. Import the GitHub repo in [Vercel](https://vercel.com) (Framework Preset:
   **Other**, Root Directory: the repo root).
2. Leave **Build Command** and **Output Directory** empty so Vercel publishes
   the HTML/CSS/JS as-is.
3. Attach the production domain in the Vercel project **Domains** settings.
   `vercel.json` already maps clean URLs (`/about` → `about.html`, and the rest
   of the redirects/rewrites) and sets security headers.

GitHub Pages is obsolete for this site. `.nojekyll` can stay; it is unused on
Vercel.

### Security headers

`vercel.json` sends `Content-Security-Policy` on every path, plus the existing
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and
`Permissions-Policy`. Framing stays denied (`X-Frame-Options` and
`frame-ancestors 'none'`).

The CSP allows `'unsafe-inline'` in `script-src` and `style-src`. Pages ship
large inline `<script>` IIFEs (every calculator, enquire, account). Hashing or
noncing those scripts would mean extracting them into files; a policy without
`'unsafe-inline'` would black-screen the calculators. That tradeoff is
intentional until the scripts are externalised.

Third-party allowlist matches what the HTML actually loads:

- Google Fonts (`fonts.googleapis.com` CSS, `fonts.gstatic.com` font files)
- jsPDF 2.5.1 from cdnjs (`cdnjs.cloudflare.com`)
- `@supabase/supabase-js@2` from jsDelivr (`cdn.jsdelivr.net`)
- Formspree (`formspree.io`) for form posts and `fetch`
- Supabase project host `rqbdumfqucptklmhlskr.supabase.co` (https and wss)
- Nominatim (`nominatim.openstreetmap.org`) on the DA calculator
- AbstractAPI email reputation (`emailreputation.abstractapi.com`) on enquire
- Vercel Web Analytics (`/_vercel/insights/script.js` plus
  `vitals.vercel-insights.com`)

HSTS is left to Vercel, which already sets it on `.vercel.app` and custom
domains. Putting our own `Strict-Transport-Security` in `vercel.json` would
also apply to preview deployments.

## Content that still needs real input

Everything below is placeholder and should be replaced before the site goes public:

| Item | Where |
| --- | --- |
| Landing background photo or video | `enquire.html` → `.landing-media` (instructions in the file + `assets/images/README.md`) |
| Ad conversion tracking (Google Ads / Meta Pixel) | `thanks.html` → `AD CONVERSION TRACKING` comment |
| About / bio copy | `index.html` → `#about` |
| Project copy, stats and galleries | `project-*.html` |
| Contact phone / email | `enquire.html` (currently `0411 940 010` / `trent@cartersinvestments.com.au`) |
| Royal Terraces / City West Villas renders | placeholder concept images — swap for final renders when available (`assets/images/projects/`) |
| ABN / registered entity details | footer, if required |

Already in place (not placeholders): Supabase URL + anon key in `pc-auth.js`,
the `ABSTRACTAPI_KEY` env var on the Vercel project (read server-side by
`api/email-reputation.js`), LinkedIn / Instagram / Facebook / TikTok
URLs in the footer, and a Privacy Policy page linked from every footer.

### Project images

Photography and renders under `assets/images/projects/` were pulled from
**cartersinvestments.com.au** (your own site), resized to 1800px wide and
recompressed. Haig On The Park has real completion photography; Royal Terraces
and City West Villas currently use concept renders / line drawings — replace
these with final renders or photography as they're produced. The floor-plan PNGs
on the City West Villas page are the WIP plans from the current site.

## Making the enquiry form email you

The landing page form (`enquire.html`) is wired for [Formspree](https://formspree.io),
which emails you every submission, no backend needed, works on this static Vercel
site, includes spam filtering. Already configured, pointing at
`https://formspree.io/f/xqpkjvkb` across `enquire.html`, all six calculators and
`pc-auth.js`. If you ever need to change it, update the `action` attribute on each
calculator's lead-capture form, `enquire.html`'s own form, and
`FORMSPREE_ENDPOINT` in `pc-auth.js`. If you haven't already, submit the form once
yourself and confirm the verification email from Formspree so submissions come
straight through.

After a successful submit the visitor is sent to `thanks.html` (via the hidden
`_next` field) — put your Google Ads / Meta conversion tag on that page so a
conversion only fires on a real enquiry. On Formspree's free plan `_next` needs
the full URL, e.g. `https://your-domain.com/thanks`.

Alternatives if you'd rather not use Formspree: [Netlify Forms](https://docs.netlify.com/forms/setup/)
(only if you host on Netlify) or [Basin](https://usebasin.com) — same idea, swap
the `<form>` `action`.
