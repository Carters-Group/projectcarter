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

Only use images you own or have a licence to use.
