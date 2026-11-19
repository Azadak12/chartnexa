"""Builds the store icon and splash image from the brand logo in /assets.

The logo's blue square holds a white candlestick-and-book mark. The App Store needs a 1024x1024
icon with no transparency, so the white mark is lifted out and placed on the same brand blue.
Run from apps/mobile:  python3 scripts/make-icons.py
A designer-made 1024x1024 master should replace this when one exists.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[3]
logo = Image.open(root / "assets" / "ChartNexa_Working_Logo.png").convert("RGBA")
out = Path(__file__).resolve().parents[1] / "assets"
BLUE = (37, 99, 235)

mark = logo.crop((8, 8, 249, 249))
# White strength of each pixel inside the mark, 0 (brand blue) to 255 (white).
glyph_box = mark.crop((30, 30, 211, 211)).convert("RGB")
mask = glyph_box.point(lambda v: 0).convert("L")
px = glyph_box.load()
mp = mask.load()
for y in range(glyph_box.height):
    for x in range(glyph_box.width):
        r, g, b = px[x, y]
        mp[x, y] = max(0, min(255, int((r - BLUE[0]) * 255 / (255 - BLUE[0]))))

size = 1024
icon = Image.new("RGB", (size, size), BLUE)
target = 640
scaled_mask = mask.resize((target, target), Image.LANCZOS)
white = Image.new("RGB", (target, target), (255, 255, 255))
icon.paste(white, ((size - target) // 2, (size - target) // 2), scaled_mask)
icon.save(out / "icon.png", optimize=True)

splash = mark.resize((600, 600), Image.LANCZOS)
splash.save(out / "splash-icon.png", optimize=True)
print("wrote", out / "icon.png", out / "splash-icon.png")
