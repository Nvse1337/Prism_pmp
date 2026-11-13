"""Generate the PRISM Windows shortcut icon (multi-resolution .ico)."""
from __future__ import annotations

import math
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "prism.ico"
PREVIEW = ROOT / "assets" / "prism-icon.png"
S = 1024
rng = np.random.default_rng(12)


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((18, 18, size - 18, size - 18), radius=radius, fill=255)
    return mask


def main():
    yy, xx = np.mgrid[0:S, 0:S]
    # deep midnight diagonal gradient
    g = (xx * 0.55 + yy * 0.45) / S
    base = np.zeros((S, S, 3), dtype=np.float64)
    base[:, :, 0] = 9 - g * 5
    base[:, :, 1] = 15 - g * 9
    base[:, :, 2] = 28 - g * 17

    # warm / cool atmosphere
    cx, cy = S * 0.5, S * 0.47
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (S * 0.62)
    glow = np.clip(1 - dist, 0, 1) ** 2.5
    base[:, :, 0] += glow * 19
    base[:, :, 1] += glow * 30
    base[:, :, 2] += glow * 44

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    # subtle colour clouds around the prism
    cloud = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cloud)
    cd.ellipse((S * 0.08, S * 0.18, S * 0.62, S * 0.78), fill=(50, 225, 255, 44))
    cd.ellipse((S * 0.40, S * 0.08, S * 0.96, S * 0.70), fill=(255, 120, 215, 36))
    cd.ellipse((S * 0.35, S * 0.48, S * 0.92, S * 0.96), fill=(255, 195, 120, 24))
    img.alpha_composite(cloud.filter(ImageFilter.GaussianBlur(S * 0.12)))

    # glow layer for the prism lines
    glow_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    tri = [(S * 0.5, S * 0.145), (S * 0.83, S * 0.80), (S * 0.17, S * 0.80)]
    gd.line(tri + [tri[0]], fill=(105, 238, 255, 155), width=44, joint="curve")
    gd.line((S * 0.5, S * 0.145, S * 0.5, S * 0.80), fill=(255, 150, 224, 110), width=24)
    img.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(32)))

    # crisp prism
    line = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line)
    ld.line(tri + [tri[0]], fill=(188, 249, 255, 235), width=11, joint="curve")
    ld.line((S * 0.5, S * 0.145, S * 0.5, S * 0.80), fill=(255, 166, 227, 180), width=6)
    ld.line((S * 0.333, S * 0.80, S * 0.5, S * 0.47), fill=(134, 240, 255, 125), width=5)
    ld.line((S * 0.5, S * 0.47, S * 0.667, S * 0.80), fill=(255, 198, 140, 110), width=5)
    img.alpha_composite(line)

    # luminous core + tiny dust
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    for radius, alpha in ((125, 18), (76, 34), (44, 72)):
        cd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(150, 246, 255, alpha))
    core = core.filter(ImageFilter.GaussianBlur(28))
    img.alpha_composite(core)
    cd = ImageDraw.Draw(img)
    cd.ellipse((cx - 17, cy - 17, cx + 17, cy + 17), fill=(250, 255, 255, 255))
    cd.ellipse((cx - 31, cy - 31, cx + 31, cy + 31), outline=(180, 247, 255, 120), width=3)

    for _ in range(42):
        a = rng.uniform(0, math.tau)
        r = abs(rng.normal(0, S * 0.26))
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        if 0 < x < S and 0 < y < S:
            size = rng.uniform(1.2, 3.6)
            alpha = int(rng.uniform(40, 150))
            cd.ellipse((x - size, y - size, x + size, y + size), fill=(220, 250, 255, alpha))

    # rounded mask + subtle edge highlight
    img.putalpha(rounded_mask(S, 220))
    edge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rounded_rectangle((20, 20, S - 20, S - 20), radius=218, outline=(223, 247, 255, 86), width=4)
    img.alpha_composite(edge)

    img.resize((256, 256), Image.LANCZOS).save(PREVIEW, quality=95)
    img.save(
        OUT,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
    print(f"wrote {PREVIEW}")


if __name__ == "__main__":
    main()
