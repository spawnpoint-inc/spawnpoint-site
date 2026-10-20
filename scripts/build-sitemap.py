#!/usr/bin/env python3
"""Build sitemap.xml from the pages in this repo.

Every .html page a visitor can reach is listed, except pages marked noindex
(the status page, the OG image template): search engines report a sitemap
that lists a noindex page as an error. A page's lastmod is the date of the
last commit that touched it, or today when it has uncommitted changes.
Standard library only, like build-llms-full.py.

    python3 scripts/build-sitemap.py           # rewrite sitemap.xml
    python3 scripts/build-sitemap.py --check   # fail when a page is missing or extra

--check compares the list of pages, not the dates: dates depend on how much
history the checkout has, and a stale date is not worth a red build.
"""
import datetime
import os
import re
import subprocess
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SITE = "https://getspawnpoint.com"
SKIP_DIRS = {".git", ".claude", ".github", "brand", "figures", "docs", "install", "scripts", "archive"}
NOINDEX = re.compile(r"<meta[^>]+name=[\"']robots[\"'][^>]+noindex", re.I)


def pages():
    """Yield (url path, file path) for every indexable page."""
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if not name.endswith(".html"):
                continue
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            with open(path, encoding="utf-8") as f:
                if NOINDEX.search(f.read()):
                    continue
            if rel == "index.html":
                url = "/"
            elif rel.endswith("/index.html"):
                url = "/" + rel[: -len("index.html")]
            else:
                url = "/" + rel
            yield url, rel


def lastmod(rel):
    def git(*args):
        return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True).stdout.strip()
    if git("status", "--porcelain", "--", rel):
        return datetime.date.today().isoformat()
    return git("log", "-1", "--format=%cs", "--", rel) or datetime.date.today().isoformat()


def build():
    found = sorted(pages(), key=lambda p: (p[0] != "/", p[0]))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, rel in found:
        lines.append(f"  <url><loc>{SITE}{url}</loc><lastmod>{lastmod(rel)}</lastmod></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n", [SITE + u for u, _ in found]


def main():
    text, urls = build()
    out = os.path.join(ROOT, "sitemap.xml")
    if "--check" in sys.argv:
        with open(out, encoding="utf-8") as f:
            listed = re.findall(r"<loc>([^<]+)</loc>", f.read())
        missing, extra = sorted(set(urls) - set(listed)), sorted(set(listed) - set(urls))
        for u in missing:
            print(f"missing from sitemap.xml: {u}")
        for u in extra:
            print(f"in sitemap.xml but not a page (or marked noindex): {u}")
        sys.exit(1 if missing or extra else 0)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote sitemap.xml: {len(urls)} pages")


if __name__ == "__main__":
    main()
