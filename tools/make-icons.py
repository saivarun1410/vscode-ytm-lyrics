#!/usr/bin/env python3
"""Generates the extension artwork from code, so the icons are reproducible and versioned.

The mark is original: a stack of lyric lines with the current one lit, and an eighth note
rising out of them — the extension's job in one picture. Deliberately not modelled on any
existing product mark.

    python3 tools/make-icons.py
"""
from PIL import Image, ImageDraw

SUPERSAMPLE = 4          # draw large, downsample once, for clean edges without a blur pass
CANVAS = 256
S = CANVAS * SUPERSAMPLE

TOP_COLOR = (99, 91, 255)      # indigo
BOTTOM_COLOR = (168, 66, 224)  # violet
CORNER_RADIUS = int(S * 0.195)


def gradient_background() -> Image.Image:
    """Vertical indigo-to-violet wash, clipped to a rounded square."""
    base = Image.new("RGB", (1, S))
    pixels = base.load()
    for y in range(S):
        ratio = y / (S - 1)
        pixels[0, y] = tuple(
            round(top + (bottom - top) * ratio)
            for top, bottom in zip(TOP_COLOR, BOTTOM_COLOR)
        )
    background = base.resize((S, S))

    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], CORNER_RADIUS, fill=255)

    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(background, (0, 0), mask)
    return canvas


def cubic_bezier(p0, p1, p2, p3, steps=80):
    points = []
    for step in range(steps + 1):
        t = step / steps
        u = 1 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def draw_lyric_lines(draw: ImageDraw.ImageDraw) -> None:
    """Three text lines; the middle one is 'active', the way the panel highlights."""
    bars = [
        (0.105, 0.560, 0.360, 110),   # x, y (centre), width, alpha — all as canvas fractions
        (0.105, 0.680, 0.300, 255),   # the lit line
        (0.105, 0.800, 0.330, 110),
    ]
    height = 0.052 * S
    for x_fraction, y_fraction, width_fraction, alpha in bars:
        x0 = x_fraction * S
        y0 = y_fraction * S - height / 2
        draw.rounded_rectangle(
            [x0, y0, x0 + width_fraction * S, y0 + height],
            radius=height / 2,
            fill=(255, 255, 255, alpha),
        )


def draw_note(canvas: Image.Image) -> None:
    """An eighth note: tilted head, stem, and a swept flag."""
    note = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(note)
    white = (255, 255, 255, 255)

    stem_x = 0.700 * S
    stem_width = 0.042 * S
    draw.rounded_rectangle(
        [stem_x, 0.200 * S, stem_x + stem_width, 0.760 * S],
        radius=stem_width / 2,
        fill=white,
    )

    flag = cubic_bezier(
        (stem_x + stem_width * 0.6, 0.205 * S),
        (0.880 * S, 0.290 * S),
        (0.870 * S, 0.430 * S),
        (0.735 * S, 0.500 * S),
    ) + cubic_bezier(
        (0.735 * S, 0.430 * S),
        (0.800 * S, 0.395 * S),
        (0.800 * S, 0.320 * S),
        (stem_x + stem_width * 0.6, 0.275 * S),
    )
    draw.polygon(flag, fill=white)

    # The head is drawn flat on its own layer, then rotated, which keeps its edge smooth.
    head_w, head_h = 0.250 * S, 0.185 * S
    head_layer = Image.new("RGBA", (int(head_w * 1.6), int(head_h * 1.6)), (0, 0, 0, 0))
    ImageDraw.Draw(head_layer).ellipse(
        [0, 0, head_w, head_h], fill=white,
    )
    head_layer = head_layer.rotate(20, resample=Image.BICUBIC, expand=False)
    note.alpha_composite(head_layer, (int(stem_x - head_w * 0.86), int(0.665 * S)))

    canvas.alpha_composite(note)


def build() -> Image.Image:
    canvas = gradient_background()
    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw_lyric_lines(ImageDraw.Draw(overlay))
    canvas.alpha_composite(overlay)
    draw_note(canvas)
    return canvas.resize((CANVAS, CANVAS), Image.LANCZOS)


if __name__ == "__main__":
    import os
    icon = build()
    icon.save("icon.png")
    os.makedirs("browser-extension/icons", exist_ok=True)
    for size in (16, 32, 48, 128):
        icon.resize((size, size), Image.LANCZOS).save(f"browser-extension/icons/icon{size}.png")
    print("wrote icon.png and browser-extension/icons/icon{16,32,48,128}.png")
