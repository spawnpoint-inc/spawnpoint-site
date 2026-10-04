#!/usr/bin/env python3
"""Build llms-full.txt: llms.txt plus every docs page, as one markdown file.

Agents that read documentation do better with one fetch of plain markdown
than with scraping HTML page by page, so this concatenates the <main> of each
page below, converted to markdown, after llms.txt itself. Standard library
only, because this repo has no build step and should not grow one beyond this
script.

Run it after editing any page it lists, and commit the result:

    python3 scripts/build-llms-full.py
"""
import html
import os
import re
from html.parser import HTMLParser
from urllib.parse import urljoin

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SITE = "https://getspawnpoint.com"
PAGES = [
    ("index.html", "/"),
    ("getting-started.html", "/getting-started.html"),
    ("agents.html", "/agents.html"),
    ("mcp.html", "/mcp.html"),
    ("api-tokens.html", "/api-tokens.html"),
    ("security.html", "/security.html"),
]
SKIP = {"script", "style", "svg", "nav", "button", "form", "noscript", "template"}


class Markdown(HTMLParser):
    """Converts the inside of <main> to markdown, keeping what an agent needs:
    headings, paragraphs, lists, tables, code, and links with absolute URLs."""

    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.out = []
        self.in_main = 0
        self.skip = 0          # nesting depth inside the element being skipped
        self.skip_tag = None   # that element's tag
        self.pre = 0
        self.lists = []
        self.href = []
        self.row = None
        self.rows = []

    def emit(self, text):
        if self.row is not None:
            self.row[-1] += text
        else:
            self.out.append(text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.in_main += 1
            return
        if not self.in_main:
            return
        if self.skip:
            if tag == self.skip_tag:
                self.skip += 1
            return
        if tag in SKIP or a.get("aria-hidden") == "true":
            self.skip, self.skip_tag = 1, tag
            return
        if tag in ("h1", "h2", "h3", "h4"):
            self.emit("\n\n" + "#" * int(tag[1]) + " ")
            if a.get("aria-label"):
                # the label is the heading as read aloud; the markup inside is decoration
                self.emit(a["aria-label"])
                self.skip, self.skip_tag = 1, tag
        elif tag in ("p", "div", "section", "blockquote", "details"):
            self.emit("\n\n")
        elif tag == "summary":
            self.emit("\n\n**")
        elif tag in ("ul", "ol"):
            self.lists.append([tag, 0])
        elif tag == "li":
            kind = self.lists[-1] if self.lists else ["ul", 0]
            kind[1] += 1
            indent = "  " * (len(self.lists) - 1)
            self.emit("\n" + indent + ("%d. " % kind[1] if kind[0] == "ol" else "- "))
        elif tag == "pre":
            self.pre += 1
            self.emit("\n\n```\n")
        elif tag == "code" and not self.pre:
            self.emit("`")
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in ("em", "i"):
            self.emit("*")
        elif tag == "br":
            self.emit("\n")
        elif tag == "a":
            href = a.get("href", "")
            if href and not href.startswith("#"):
                href = urljoin(self.base, href)
            self.href.append(href)
            self.emit("[")
        elif tag == "table":
            self.rows = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.row.append("")
        elif tag == "dt":
            self.emit("\n\n**")
        elif tag == "dd":
            self.emit("\n")

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main -= 1
            return
        if not self.in_main:
            return
        if self.skip:
            if tag == self.skip_tag:
                self.skip -= 1
                if self.skip == 0:
                    self.skip_tag = None
            return
        if tag == "summary" or tag == "dt":
            self.emit("**")
        elif tag in ("ul", "ol") and self.lists:
            self.lists.pop()
            self.emit("\n")
        elif tag == "pre":
            self.pre -= 1
            self.emit("\n```\n")
        elif tag == "code" and not self.pre:
            self.emit("`")
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in ("em", "i"):
            self.emit("*")
        elif tag == "a":
            href = self.href.pop() if self.href else ""
            self.emit("](%s)" % href if href and not href.startswith("#") else "]")
        elif tag == "tr" and self.row is not None:
            self.rows.append([re.sub(r"\s+", " ", c).strip() for c in self.row])
            self.row = None
        elif tag == "table" and self.rows:
            width = max(len(r) for r in self.rows)
            lines = []
            for i, r in enumerate(self.rows):
                r = r + [""] * (width - len(r))
                lines.append("| " + " | ".join(c.replace("|", "\\|") for c in r) + " |")
                if i == 0:
                    lines.append("|" + "---|" * width)
            self.emit("\n\n" + "\n".join(lines) + "\n")
            self.rows = []

    def handle_data(self, data):
        if not self.in_main or self.skip:
            return
        self.emit(data if self.pre else re.sub(r"\s+", " ", data))

    def text(self):
        s = "".join(self.out)
        s = re.sub(r"\[\]\([^)]*\)", "", s)          # links with no text (icons)
        lines, code = [], False
        for line in s.split("\n"):
            if line.startswith("```"):
                code = not code
            lines.append(line.rstrip() if code else line.strip() if not re.match(r"^\s+(- |\d+\. )", line) else line.rstrip())
        s = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
        return s.strip()


def page(path, url):
    src = open(os.path.join(ROOT, path), encoding="utf-8").read()
    title = re.search(r"<title>(.*?)</title>", src, re.S)
    p = Markdown(SITE + url)
    p.feed(src)
    name = html.unescape(title.group(1).strip()) if title else path
    return "\n\n---\n\n<!-- %s%s -->\n\n%s\n\nSource: %s%s" % (SITE, url, p.text(), SITE, url) if p.text() else "", name


def main():
    head = open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read().rstrip()
    parts = [head, "\n\n---\n\n# The full docs\n\nEvery page below is the same content as the HTML page at its source URL, converted to markdown."]
    for path, url in PAGES:
        body, _ = page(path, url)
        parts.append(body)
    out = "".join(parts).rstrip() + "\n"
    with open(os.path.join(ROOT, "llms-full.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    print("llms-full.txt: %d bytes, %d pages" % (len(out.encode()), len(PAGES)))


if __name__ == "__main__":
    main()
