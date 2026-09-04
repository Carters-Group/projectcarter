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
index.html      all page content
styles.css      design system + layout
script.js       header scroll state, mobile nav, scroll reveals
assets/         favicon, social image, image drop-in guide
.nojekyll       serve files as-is on GitHub Pages
```

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
| Project names, sizes, locations, descriptions | `index.html` → `#projects` section |
| Contact email / phone | `index.html` → `#contact` (and the `mailto:` in the form + footer) |
| LinkedIn / Instagram URLs | `index.html` → `.socials` and footer |
| Hero + project photography | see `assets/images/README.md` |
| Privacy Policy link | footer (`index.html`) |
| ABN / registered entity details | footer, if required |

## Making the contact form send properly

The form currently uses a `mailto:` action, which opens the visitor's email
client. For a proper submission (no client needed, spam protection, notifications)
switch to a form service — [Formspree](https://formspree.io),
[Netlify Forms](https://docs.netlify.com/forms/setup/) (if you host on Netlify),
or [Basin](https://usebasin.com). Replace the `<form>` `action` with the endpoint
they give you.
