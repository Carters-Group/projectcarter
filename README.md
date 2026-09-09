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
`roi-calculator.html`, `enquire.html`) carries the same fixed site header
and footer. Top-nav order is **About, Projects, Approach, ROI Calculator**,
then the **Enquire** button; the footer nav adds a **Contact** link.

`enquire.html` is the multi-step lead-capture form (no footer, no personal phone
or email; enquiries arrive only through the form). `roi-calculator.html` is a
client-side property-hold ROI model. You enter the purchase price, the loan (as a
% of price), one-off buying costs (stamp duty, loan/valuation, solicitor, other),
the Year 1 net rent, rental growth, interest rate, term, the share of annual
profit used to pay down the loan, and an optional value uplift (year, new base
rent, new growth rate). It builds a year-by-year schedule and reports total cash
required, net sale proceeds, total profit, total ROI, return per year, equity
multiple and IRR. There is also an optional **exit cap rate on sale**: the capitalisation rate used
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
| **Formspree form ID** (so enquiries reach your inbox) | `enquire.html` and `roi-calculator.html` → `action="https://formspree.io/f/YOUR_FORM_ID"` |
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
