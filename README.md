# Project Carter — website

Marketing website for **Project Carter**, an Australian property development
business delivering boutique townhouse communities and commercial value-add
projects nationwide.

The site's structure and visual language are modelled on
[essentialsstudio.com.au](https://www.essentialsstudio.com.au) — a dark,
editorial, single-page layout with an amber accent — adapted for a property
developer.

## Stack

Plain static site. No build step, no framework, no dependencies.

```
index.html      home page — hero, about, projects, approach
enquire.html    standalone ad landing page (form over a photo/video background)
thanks.html     post-submit confirmation page (drop ad conversion tags here)
styles.css      design system + layout (home + landing)
script.js       header scroll state, mobile nav, scroll reveals
assets/         favicon, social image, image drop-in guide
.nojekyll       serve files as-is on GitHub Pages
```

Every "Enquire" / "Contact" / "View project" link on the home page now points to
`enquire.html`. There is no in-page contact section anymore — send all ad traffic
straight to `enquire.html`.

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
| **Formspree form ID** (so enquiries reach your inbox) | `enquire.html` → `action="https://formspree.io/f/YOUR_FORM_ID"` |
| Landing page headline + sub-text | `enquire.html` → between the `EDIT THIS WORDING` comments |
| Landing background photo or video | `enquire.html` → `.landing-media` (instructions in the file + `assets/images/README.md`) |
| Ad conversion tracking (Google Ads / Meta Pixel) | `thanks.html` → `AD CONVERSION TRACKING` comment |
| Project names, sizes, locations, descriptions | `index.html` → `#projects` section |
| LinkedIn / Instagram URLs | `index.html` → footer |
| Hero + project photography | see `assets/images/README.md` |
| Privacy Policy link | footer (`index.html`) |
| ABN / registered entity details | footer, if required |

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
