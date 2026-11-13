"""Download the pre-cached Unsplash background pool used by PRISM.

The app never needs the network: every launch picks 10 images at random from
this local pool. Re-run this script only if you want to refresh the pool.
"""
from __future__ import annotations

import concurrent.futures as futures
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "backgrounds"

PHOTOS = [
    ("photo-1462331940025-496dfbfc7564", "Nebula", "Deep-space clouds", "space"),
    ("photo-1534796636912-3b95b3ab5986", "Starfield", "A sky full of stars", "space"),
    ("photo-1465101162946-4377e57745c3", "Cosmos", "Blue-violet nebula", "space"),
    ("photo-1502134249126-9f3755a50d78", "Orbit", "Night sky over the horizon", "space"),
    ("photo-1519681393784-d120267933ba", "Alpine Night", "Snow peaks under stars", "night"),
    ("photo-1470071459604-3b5ec3a7fe05", "Mist", "Fog rolling through a forest", "nature"),
    ("photo-1433086966358-54859d0ed716", "Falls", "Waterfall in a green gorge", "nature"),
    ("photo-1518837695005-2083093ee35b", "Tide", "Ocean swell at blue hour", "water"),
    ("photo-1507525428034-b723cf961d3e", "Shoreline", "Pale sand and turquoise water", "water"),
    ("photo-1500534314209-a25ddb2bd429", "Dunes", "Desert ridges at dusk", "earth"),
    ("photo-1493246507139-91e8fad9978e", "Highlands", "Mountain range in haze", "earth"),
    ("photo-1470252649378-9c29740c9fa8", "First Light", "Sunrise over an open field", "light"),
    ("photo-1523712999610-f77fbcfc3843", "Sunbeam", "Light through a pine forest", "light"),
    ("photo-1441974231531-c6227db76b6e", "Canopy", "Sunlit forest from below", "nature"),
    ("photo-1541701494587-cb58502866ab", "Chroma", "Liquid abstract colour", "abstract"),
    ("photo-1557682250-33bd709cbe85", "Gradient", "Violet gradient light", "abstract"),
    ("photo-1579546929518-9e396f3cc809", "Spectrum", "Soft rainbow gradient", "abstract"),
    ("photo-1550859492-d5da9d8e45f3", "Prism", "Iridescent abstract shapes", "abstract"),
    ("photo-1492684223066-81342ee5ff30", "Crowd", "Concert lights and silhouettes", "music"),
    ("photo-1470229722913-7c0e2dbbafd3", "Stage", "Live show from the floor", "music"),
    ("photo-1514525253161-7a46d19cd819", "Neon Night", "Purple concert haze", "music"),
    ("photo-1516339901601-2e1b62dc0c45", "Emission", "Burning nebula in darkness", "space"),
    ("photo-1521337581100-8ca9a73a5f79", "Live", "A band under warm stage light", "music"),
]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"


def fetch(item):
    pid, title, alt, mood = item
    path = OUT / f"{pid}.jpg"
    url = (
        f"https://images.unsplash.com/{pid}"
        "?auto=format&fit=crop&w=1920&h=1200&q=72&fm=jpg"
    )
    if path.exists() and path.stat().st_size > 30_000:
        return {"id": pid, "title": title, "alt": alt, "mood": mood, "file": path.name,
                "bytes": path.stat().st_size, "cached": True}
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/jpeg"})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
    if len(data) < 20_000:
        raise RuntimeError(f"{pid}: tiny response ({len(data)} bytes)")
    path.write_bytes(data)
    return {"id": pid, "title": title, "alt": alt, "mood": mood, "file": path.name,
            "bytes": len(data), "cached": False}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch, PHOTOS))
    results.sort(key=lambda x: [p[0] for p in PHOTOS].index(x["id"]))
    (ROOT / "tools" / "backgrounds.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    total = sum(r["bytes"] for r in results)
    for r in results:
        print(f"{'cached' if r['cached'] else 'new':6} {r['bytes']/1024:7.1f} KB  {r['file']}  {r['title']}")
    print(f"\n{len(results)} images, {total/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
