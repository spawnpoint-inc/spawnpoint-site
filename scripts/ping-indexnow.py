#!/usr/bin/env python3
"""Tell search engines that pages changed, through IndexNow.

Bing, Yandex, and the other IndexNow engines share one endpoint. They check
the key against the key file at the site root (the 32-character .txt), so
this works without a webmaster account. ChatGPT's search reads Bing's index,
so this is the fastest way to get a changed page in front of it.

    python3 scripts/ping-indexnow.py --all                 # every page in sitemap.xml
    python3 scripts/ping-indexnow.py blog/x/index.html ...  # files or URLs
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
HOST = "getspawnpoint.com"
SITE = "https://" + HOST


def key():
    for name in os.listdir(ROOT):
        if re.fullmatch(r"[0-9a-f]{32}\.txt", name):
            with open(os.path.join(ROOT, name), encoding="utf-8") as f:
                return f.read().strip()
    sys.exit("no IndexNow key file at the site root")


def to_url(arg):
    if arg.startswith("https://"):
        return arg
    rel = arg.lstrip("./")
    if rel == "index.html":
        return SITE + "/"
    if rel.endswith("/index.html"):
        return SITE + "/" + rel[: -len("index.html")]
    return SITE + "/" + rel


def main():
    args = sys.argv[1:]
    if args == ["--all"]:
        with open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8") as f:
            urls = re.findall(r"<loc>([^<]+)</loc>", f.read())
    else:
        urls = [to_url(a) for a in args]
    if not urls:
        print("nothing to ping")
        return
    k = key()
    body = json.dumps({"host": HOST, "key": k, "keyLocation": f"{SITE}/{k}.txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(f"IndexNow answered {resp.status} for {len(urls)} URLs")


if __name__ == "__main__":
    main()
