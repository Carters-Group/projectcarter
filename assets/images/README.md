# Images

The site currently ships with no photography — the hero and project cards use
CSS gradients and a blueprint-grid motif so the site looks finished with zero
assets.

## Add a hero photograph

1. Drop a landscape image here, e.g. `hero.jpg` (recommended 2400×1600, < 500 KB).
2. In `styles.css`, find `.hero-media` and add the image as the top layer:

   ```css
   .hero-media {
     background:
       linear-gradient(180deg, rgba(14,14,15,0.35), rgba(14,14,15,0.85)),
       url("assets/images/hero.jpg") center / cover no-repeat;
   }
   ```

## Add project images

1. Save each as `project-1.jpg`, `project-2.jpg`, `project-3.jpg` (4:3, ~1200×900).
2. In `index.html`, on each `<div class="card-media" ...>` add an inline style:

   ```html
   <div class="card-media" style="background-image:url('assets/images/project-1.jpg')" data-label="Townhouses"></div>
   ```

3. In `styles.css`, add to `.card-media`:

   ```css
   background-size: cover;
   background-position: center;
   ```

## Add a background to the landing page (`enquire.html`)

The landing page has a full-bleed media layer behind the form. With nothing
added it falls back to the same dark gradient + grid as the home hero.

**Image** — add an inline style to the `.landing-media` div in `enquire.html`:

```html
<div class="landing-media" aria-hidden="true"
     style="background-image:url('assets/images/landing.jpg')"></div>
```

Recommended ~2400×1600, < 500 KB. A dark scrim already sits over it for text
contrast, so a mid-to-bright photo works fine.

**Video** — uncomment the `<video class="landing-video">` block already in
`enquire.html`. Use a short, muted, looping `.mp4` under ~5 MB and set a
`poster` image for the first frame / slow connections.

Only use images or video you own or have a licence to use.
