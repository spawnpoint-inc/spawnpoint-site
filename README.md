# spawnpoint-site

The marketing landing page for **spawnpoint**, the easiest way to bring your software online. Static
HTML/CSS/JS with no build step, deployed via **GitHub Pages**.

## Live

https://mannan.dev/spawnpoint-site/ (custom domain; `mannanshukla.github.io/spawnpoint-site/` also resolves)

## Contents

- `index.html` — the page
- `styles.css` — the design system (Rutgers scarlet, Space Grotesk, light + dark)
- `app.js` — small vanilla JS (theme toggle, nav, FAQ accordion)
- `favicon.svg` — the `sp` mark
- `.nojekyll` — tells Pages to serve files as-is (no Jekyll processing)

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Notes

- This is a standalone copy of the landing page from the main `spawnpoint` app repo.
  Changes to the product's landing page should be mirrored here.
- The product isn't live yet, so the primary CTAs point to an early-access mailto
  (`founders@spawnpoint.dev`). Swap them for the app URL once it's deployed.
