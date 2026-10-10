# Site rework: say what spawnpoint is for

Design doc for roadmap item 15 in the app repo (`docs/ROADMAP.md`, requested
2026-10-09). It fixes the page outline, the claims the page may make, and the
screenshots to capture, before any page work. Approved sections become their own
small PRs (listed at the end).

## Goal

getspawnpoint.com reads as a generic deploy tool. It should read as the one place
an organization keeps its internal small software: the to-do app, the lunch
order form, the dashboard, the tool one team wrote for itself. The page shows the
range of what runs there and shows the product working inside the agents people
already use.

What stays fixed:

- The H1 and tagline: "The easiest way to bring your software online". The
  revolver word in the hero stays.
- Branding, nav, footer, docs pages, pricing, legal pages.
- The visual system. `styles.css` here and `static/styles.css` in the app repo
  move together; `diff` them after the change and confirm only intended drift.
- Copy follows the fourteen writing rules in the app repo's `CLAUDE.md`
  (the reader is not a developer; no em dashes; literal phrasing; no stock
  headers; no big-cloud contrasts) and `DESIGN.md` (lowercase spawnpoint).
- The page claims only what works today. Built-in inference is not built
  (#160 banked), so the page says nothing about AI apps on open models until it
  ships.

Related issues in the app repo: #189 (landing visuals should convey ownership)
and #190 (less red). #190 lands first or in the same PR as the hero, so the new
hero is designed once against the final tokens.

## Page outline

In order, top to bottom. "Keep" means the section stays as it is today.

### 1. Hero

H1 unchanged. The subline moves from the mechanism to the audience. Today:

> Your agent builds it; spawnpoint puts it online and hands you a link that is
> private by default and shared like a Google Doc. Works with Claude Code,
> Codex, Cursor, Copilot, and many more.

New:

> One place for everything your team builds with an agent: a form, a tracker, a
> dashboard, a tool only your team uses. Your agent builds it, spawnpoint puts
> it online, and you get a link that is private until you share it. Works with
> Claude Code, Codex, Cursor, Copilot, and many more.

Visual: the ownership card from #189, not a screenshot. It is the console's
project card drawn in the site's own HTML and CSS: project name, the green
running pill, the real-looking link, and "shared with 3 people". It states what
the user gets (an app, a link, control over who opens it) without a paragraph.
Drawing it in HTML keeps it crisp at every width, keeps it in step with the
design system, and keeps the hero light on a phone. It uses the same `.card` and
`.pill` classes as the rest of the page.

### 2. What runs here (new band, after the hero)

The range, as example apps rather than runtimes or features.

Eyebrow: "What runs here". Heading: "Everything your team builds, in one
place". Line under it: "Small software: the apps a team writes for itself, kept
where the team can find them."

Three cards:

> A page or a site. A launch page, a team wiki, a report someone opens on their
> phone. Your agent writes it and it is online a minute later.

> An app with data. A to-do app, a lunch order form, a photo gallery. When an
> app needs somewhere to keep its data, spawnpoint provides it and your agent
> wires it in. The data stays with the app.

> A tool for other agents. An MCP server is a small program that agents can ask
> for things. Your agent builds one, spawnpoint puts it online, and your team's
> agents can use it from then on.

The third card has no screenshot. Nothing about AI apps on open models until
inference ships. When it does, it becomes the fourth card in a PR of its own.

### 3. How it works (keep the three steps, add the screenshots)

The three steps stay (add spawnpoint, log in, tell your agent to spawn it). Under
them, a row of three screenshots, one per agent: Claude Code, Codex, Cursor. Each
shows the whole arc in one frame: the user says "deploy this", the agent calls
spawnpoint's deploy tool, and the agent comes back with the link. The three
shots show the same app so the eye compares the agents, not the apps.

On a phone the row stacks; each image is lazy-loaded and has alt text that
describes the moment ("Claude Code deploying lunch-orders and returning its
link").

### 4. Sharing (keep)

### 5. Simple by design (rewrite the subhead)

The cards stay (agent-native, instant link, the link never goes stale). The
subhead "Big clouds were built to scale big software. We deleted all of that."
contrasts spawnpoint with big-cloud machinery, which rule 14 forbids. New:

> You sign in once. Your agent does the rest, and there is nothing for you to
> set up, watch, or keep running.

### 6. Pricing (keep)

### 7. FAQ (two edits)

"What can my agent build?" opens with the range from band 2 in the same words.
The first sentence today is "Any small web app: a static site, a Node service,
or a Python tool." It becomes:

> Any small web app: a page or a site, an app that keeps data (a to-do app, a
> lunch order form, a photo gallery), or an MCP server your team's agents share.
> Your agent picks what the app needs, including a database or file storage,
> and spawnpoint provides it.

The rest of that answer (frameworks, build and start scripts) stays as it is.

A new item follows it:

> Can my team run an MCP server on it?
>
> Yes. An MCP server is a small program that agents can ask for things. Your
> agent builds one, spawnpoint puts it online, and anyone whose agent you give
> the link to can use it. Set the project to public for this: a private project
> opens only in a browser for now.

No docs page describes deploying an MCP server yet (the MCP page documents
spawnpoint's own server and its tools), so the answer stands alone. The deploy
skill carries the working recipe; a short section on the MCP page can follow in
its own PR, and the answer gains a link then.

## Claims and what backs them

Every claim on the page maps to something that works on production today.

| Claim on the page | Backed by |
|---|---|
| Pages, sites, Node apps, Python apps, Docker apps run | The four runtimes (`static`, `node`, `python`, `docker`), all live |
| An app gets a database when it needs one | `add_database`, live; its Node connection fix verified on production 2026-10-07 |
| An app gets file storage when it needs one | `add_storage`, merged 2026-10-07 (#433) and documented on the MCP page |
| A team can run an MCP server | Node and Python MCP servers deployed and called from Claude Code on production, 2026-10-09; public projects only (a restricted one blocks non-browser callers until the gate work lands) |
| Private by default, shared by email, flip to public | Gated sharing, live since August |
| The same link serves every new version | In-place redeploy, live since August |
| Works with Claude Code, Codex, Cursor | The three screenshots below, each a real deploy |
| AI apps on open models | Not claimed. #160 is banked |

## Screenshots

Three images, one per agent, all captured from real deploys of the same app.
No mockups, no composites, no retouching beyond cropping and the redactions
listed below. If one agent cannot be captured in time, the band ships with the
other two and the third comes in a follow-up PR; a drawn stand-in never ships.

The app: a small to-do or lunch-order app under one project name, `lunch-orders`,
deployed from a scratch folder. The same files go through all three agents, and
the project is terminated after the last capture.

| File | Agent | What the frame shows |
|---|---|---|
| `img/claude-code.png` | Claude Code in a terminal | The prompt "deploy this", the `deploy_project` call with its approval line, `watch_deploy` reporting running, and the agent's closing sentence with the link |
| `img/codex.png` | Codex CLI in a terminal | The same arc in Codex's own transcript style |
| `img/cursor.png` | Cursor's agent panel | The same arc in Cursor's chat panel, with the editor showing the app's files beside it |

Capture rules:

- Each agent in its default look, as a user sees it. Terminal shots stay in
  their default theme; the page frames each image in a `.card` so dark terminals
  sit well on the light page.
- Nothing personal in frame: no account email, no API token, no other project
  names, no shell prompt with a home path. A fresh terminal profile and a
  scratch folder handle most of this; crop the rest.
- Codex runs with an isolated home directory carrying only the spawnpoint MCP
  entry, and never with auto-approval. Its spawnpoint sign-in is confirmed
  working before the capture starts.
- Cursor is a desktop app, so its capture is taken by hand on a Mac.
- Size: capture at 2x on a 1600 by 1000 point window, export PNG, and keep each
  file under 300 KB (WebP if PNG cannot get there). Images are lazy-loaded; the
  hero carries none, so first paint does not change.
- Images live in a new `img/` directory, served as-is by GitHub Pages. The
  README's file table gets a row for it.

## PR plan

1. This document.
2. Less red (#190): the token change in both repos, stylesheets rebuilt and
   diffed. Before or with PR 3.
3. Hero: new subline and the ownership card. Site only, plus the app repo copy
   of any shared component rule.
4. "What runs here" band and the FAQ edits. Copy only.
5. Screenshots: capture the three images, add the row under "How it works".
6. Regenerate `llms-full.txt` (`python3 scripts/build-llms-full.py`) in
   whichever PR last touches `index.html`, and update `llms.txt` in both repos
   if the positioning line changes there too.

Each PR is reviewed as copy against the writing rules before merge: a mechanical
scan for bold, lists that should be paragraphs, banned words, and dashes, then a
read as the non-developer reader.
