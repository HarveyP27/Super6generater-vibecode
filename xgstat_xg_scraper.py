#!/usr/bin/env python3
"""
xG Stat scraper (https://www.xgstat.com) for the Super 6 Generator
------------------------------------------------------------------
Collects the *projected* xG for the home and away team of every upcoming
Premier League fixture and writes xg.json in the same shape the old PitchOdds
API used:

{
  "updated": "2026-10-13T09:00:00+00:00",
  "source": "https://www.xgstat.com",
  "fixtures": [
    {"home": "Coventry City", "away": "Newcastle United",
     "expectedGoals": {"home": 1.6, "away": 1.2},
     "date": "2026-10-12", "gameweek": 6, "url": "..."}
  ]
}

Usage:
    pip install requests beautifulsoup4
    python xgstat_xg_scraper.py                 # default page + current & next gameweek
    python xgstat_xg_scraper.py --gameweek 7 8  # specific gameweeks only
    python xgstat_xg_scraper.py --debug

Keep it polite (--delay) and check xgstat.com's terms before wider use.
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://www.xgstat.com"
FIXTURES_URL = BASE + "/competitions/premier-league/fixtures"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Super6xGBot/1.0; personal use)",
    "Accept-Language": "en-GB,en;q=0.9",
}
MATCH_HREF = re.compile(
    r"/competitions/premier-league/(\d{4}-\d{4})/matches/([a-z0-9-]+)-(\d{4}-\d{2}-\d{2})(/preview)?$"
)


def fetch(session, url, delay):
    time.sleep(delay)
    r = session.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def parse_fixture_list(html):
    """One dict per match link found on a fixtures page, flagged played / not played."""
    soup = BeautifulSoup(html, "html.parser")
    matches = {}
    for a in soup.find_all("a", href=True):
        m = MATCH_HREF.search(a["href"].split("?")[0])
        if not m:
            continue
        _, slug, date, _ = m.groups()
        url = urljoin(BASE, a["href"].split("?")[0].removesuffix("/preview"))
        text = " ".join(a.get_text(" ").split())
        entry = matches.setdefault(url, {"url": url, "date": date, "slug": slug})
        entry["played"] = bool(re.search(r"•\s*FT", text))
    return list(matches.values())


def parse_preview(html):
    """Team names, projected xG and gameweek from a match preview page."""
    soup = BeautifulSoup(html, "html.parser")
    home = away = None
    title = soup.find("title")
    if title:
        m = re.match(r"\s*(.+?)\s+vs\s+(.+?)\s+preview", title.get_text())
        if m:
            home, away = m.group(1), m.group(2)

    heading = soup.find(lambda t: t.name in ("h2", "h3", "h4", "h5")
                        and "projected xg" in t.get_text().lower())
    if not heading or not home:
        return None
    chunk = " ".join(s.strip() for s in list(heading.find_all_next(string=True))[:60] if s.strip())
    chunk = re.split(r"Attacking zones|xG edge|Position vs Expected", chunk)[0]
    nums = re.findall(r"(?<![\w.])(\d+\.\d+)(?![\w.])", chunk)
    if len(nums) < 2:
        return None

    gw = None
    link = soup.find("a", href=re.compile(r"gameweek=\d+"))
    if link:
        gw = int(re.search(r"gameweek=(\d+)", link["href"]).group(1))
    return {"home": home, "away": away,
            "expectedGoals": {"home": float(nums[0]), "away": float(nums[1])},
            "gameweek": gw}


def scrape(args):
    s = requests.Session()
    fixtures, seen = [], set()
    pending = [FIXTURES_URL] if not args.gameweek else [f"{FIXTURES_URL}?gameweek={g}" for g in args.gameweek]
    done_pages, gws_found = set(), set()

    while pending:
        list_url = pending.pop(0)
        if list_url in done_pages:
            continue
        done_pages.add(list_url)
        try:
            html = fetch(s, list_url, args.delay)
        except requests.RequestException as e:
            print(f"[warn] {list_url}: {e}", file=sys.stderr)
            continue
        listing = parse_fixture_list(html)
        if args.debug:
            print(f"[debug] {list_url}: {len(listing)} matches", file=sys.stderr)

        for item in listing:
            if item["played"] or item["url"] in seen:
                continue
            seen.add(item["url"])
            try:
                page = fetch(s, item["url"] + "/preview", args.delay)
            except requests.RequestException as e:
                print(f"[warn] {item['url']}: {e}", file=sys.stderr)
                continue
            data = parse_preview(page)
            if args.debug:
                print(f"[debug] {item['slug']}: {data}", file=sys.stderr)
            if data:
                data.update({"date": item["date"], "url": item["url"] + "/preview"})
                fixtures.append(data)
                if data["gameweek"]:
                    gws_found.add(data["gameweek"])

        # With no --gameweek given, also pull the current and next gameweek so a
        # whole Super 6 round is covered even if it spans more than the default page.
        if not args.gameweek and len(done_pages) == 1 and gws_found:
            for g in (min(gws_found), min(gws_found) + 1):
                pending.append(f"{FIXTURES_URL}?gameweek={g}")

    return fixtures


def main():
    p = argparse.ArgumentParser(description="Scrape projected per-team xG from xgstat.com")
    p.add_argument("--gameweek", type=int, nargs="*", help="Specific gameweek(s)")
    p.add_argument("--delay", type=float, default=1.5, help="Seconds between requests")
    p.add_argument("--out", default="xg.json")
    p.add_argument("--debug", action="store_true")
    args = p.parse_args()

    fixtures = scrape(args)
    if not fixtures:
        print("No upcoming fixtures with projected xG found (layout change, or none scheduled).",
              file=sys.stderr)
        sys.exit(1)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "source": BASE, "fixtures": fixtures}, f, indent=2, ensure_ascii=False)

    for r in fixtures:
        print(f'{r["home"]} {r["expectedGoals"]["home"]} - {r["expectedGoals"]["away"]} {r["away"]}')
    print(f"\nSaved {len(fixtures)} fixtures to {args.out}")


if __name__ == "__main__":
    main()
