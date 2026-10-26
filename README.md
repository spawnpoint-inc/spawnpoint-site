# spawnpoint-site

The public site for **spawnpoint**, the place where your team's AI lives. Static
HTML/CSS/JS, no build step, served by **GitHub Pages**.

## Live

**https://getspawnpoint.com** (the `CNAME` file; `spawnpoint-inc.github.io/spawnpoint-site` also resolves)

It also serves the one-line installer:

```bash
curl -fsSL https://getspawnpoint.com/install | bash
```

## Contents

| File | What it is |
|---|---|
| `index.html` | The landing page |
| `getting-started.html`, `mcp.html`, `api-tokens.html` | Docs pages |
| `about.html`, `security.html` | About and security pages |
| `install` | The installer script served at `/install` |
| `blog/` | The blog, **generated**: built by `cmd/blogbuild` in the app repo from its `blog/*.md` and committed here (`./scripts/build-blog.sh` there, or its `publish-blog` workflow). Never hand-edit; edit the markdown in the app repo. |
| `styles.css` | The design system, dark only: a byte copy of the app repo's compiled `static/styles.css`, which is the source |
| `app.js` | Small vanilla JS (nav, FAQ accordion) |
| `llms.txt`, `robots.txt` | For agents and crawlers |
| `sitemap.xml` | Every indexable page, **generated**: run `python3 scripts/build-sitemap.py` after adding or removing a page, and commit both. The `sitemap` check fails when a page is missing; pages marked `noindex` stay out |
| `.well-known/security.txt` | Where to report a vulnerability (RFC 9116). Renew its `Expires` line before 2027-10-04 |
| `llms-full.txt` | `llms.txt` plus every docs page as markdown, **generated**: run `python3 scripts/build-llms-full.py` after editing a docs page or `llms.txt`, and commit both |
| `d66d058d8e28358b8bfa5b27d8bd98f6.txt` | The IndexNow key (indexnow.org): lets Bing and others be told the moment a page changes (`python3 scripts/ping-indexnow.py --all`, or name the pages). Not a secret; it only proves we own the domain |
| `og-image.html`, `og.png` | Social card (source + render): screenshot `og-image.html` at 1200x630 with reduced motion on, then bump `og.png?v=` on every page and in the app repo's blog template |
| `brand/` | Brand art and the landing page's scripts. `flock.js` draws the hero from `flock-frames.js`, which is **generated** from `flock-pink.mp4` by `python3 scripts/build-flock.py`; `fig-*.js` are **generated** by `figures/`; `icon-512.png` is the square logo that listings show (the MCP registry entry's `icons`, and through it Glama) |
| `figures/` | The landing page's explainer figures: `node figures/<name>/build.mjs` writes `brand/fig-<name>.js`. Drawn with the anatomy skill, whose kit is vendored in `figures/anatomy/` (MIT) |
| (none) | Design docs for site changes go in the app repo's `docs/` (`docs/site-rework.md`: the 2026-10 positioning), never here: Pages serves every file in this repo to anyone |
| `favicon.svg` | The block S mark |
| `.nojekyll` | Tells Pages to serve files as-is, no Jekyll |

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Homepage increment

The homepage adds a centered hero and terminal, a compatible-agent carousel, and
three team-app illustrations. `landing.css` and `landing-feature-cards.css` apply
only to these sections and their navigation treatment; `styles.css` remains the
shared product stylesheet. The later homepage sections retain their existing
markup and styles. The marketing site lives in this repository; the product
server redirects its root here.

Motion respects reduced-motion preferences, tab visibility, and viewport
visibility. Desktop uses six sea angels, narrow desktop uses two, and screens
below 881px load no creature engine. The terminal and cards retain completed HTML
fallbacks; the carousel becomes a static list without JavaScript or with reduced
motion. Automatic animations have no manual pause control, a known accessibility
limitation of this iteration.

Run the dependency-free motion checks:

```bash
node scripts/test-sea-angels.cjs
node scripts/test-sea-angel-stability.cjs
```

For browser checks, provide Playwright through `NODE_PATH`, start the local server,
and run these from the repository root. `CHROME_BIN` may override the default
macOS Chrome executable. These are development checks; the website needs no build.

```bash
HOMEPAGE_URL=http://127.0.0.1:8000 node scripts/test-homepage.cjs
HERO_LAB_URL=http://127.0.0.1:8000 node scripts/test-hero-terminal.cjs
python3 scripts/build-sitemap.py --check
python3 scripts/build-llms-full.py
git diff --exit-code -- llms-full.txt
```

Browser screenshots and reports go to the OS temporary directory by default.
`HOMEPAGE_OUTPUT` and `TERMINAL_OUTPUT` override those destinations. The integration
suite compares the lower homepage with production baseline `20bc154`; override
`HOMEPAGE_BASE` only when intentionally advancing that baseline. After a hero
geometry change, copy the validated `measured-layouts.json` report to
`scripts/sea-angel-layouts.json` and rerun the motion checks.

Do not copy the entire site stylesheet into the product repository: its console
and this site's docs have separate additions. Copy rules live in the app repo's
`DESIGN.md`: the brand is lowercase `spawnpoint`, and no em dashes.
