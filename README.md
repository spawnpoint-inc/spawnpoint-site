# spawnpoint-site

The public site for **spawnpoint**, the easiest way to bring your software online. Static
HTML/CSS/JS, no build step, served by **GitHub Pages**.

## Live

**https://spawnpoint.lol** (the `CNAME` file; `spawnpoint-inc.github.io/spawnpoint-site` also resolves)

It also serves the one-line installer:

```bash
curl -fsSL https://spawnpoint.lol/install | bash
```

## Contents

| File | What it is |
|---|---|
| `index.html` | The landing page |
| `getting-started.html`, `mcp.html`, `api-tokens.html` | Docs pages |
| `about.html`, `security.html` | About and security pages |
| `install` | The installer script served at `/install` |
| `styles.css` | The design system: warm paper, Rutgers scarlet, DM Sans, light only |
| `app.js` | Small vanilla JS (nav, FAQ accordion) |
| `llms.txt`, `robots.txt`, `sitemap.xml` | For agents and crawlers |
| `og-image.html`, `og.png` | Social card (source + render) |
| `favicon.svg` | The `sp` mark |

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Keeping it in sync

The landing page, stylesheet, `app.js`, `llms.txt`, and `robots.txt` are duplicated in the
private app repo (`spawnpoint-inc/spawnpoint`, under `static/`); nothing syncs them
automatically, so a change to one belongs in both. The stylesheets have diverged on purpose
(this repo adds the docs-page and about-page rules; the app adds console-only rules), so apply
the same edit to each rather than copying files wholesale.

Copy rules live in the app repo's `DESIGN.md`. The short version: the brand is always
lowercase `spawnpoint`, and no em dashes.
