#!/usr/bin/env python3
"""
Composites a caption bar on every captured frame so the same files work as
screenshots and as video frames.

  python3 scripts/demo/caption.py

Reads demo-out/manifest.json, renders demo-out/captioned/ (1600x1000), and
writes the final video with ffmpeg. Fonts are loaded from the system so no
ffmpeg drawtext build is needed.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo-out"
MANIFEST = OUT / "manifest.json"
CAPTIONED = OUT / "captioned"
SHOTS = OUT / "screenshots"
W, H = 1600, 1000
BAR = 104

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Avenir Next.ttc",
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
MONO_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/SFNSMono.ttf",
]

BG = (253, 252, 250)
INK = (61, 43, 31)
MUTED = (150, 138, 128)
ACCENT = (139, 80, 52)
RULE = (232, 225, 212)


def font(paths, size, index=0):
    for path in paths:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


def wrap(draw, text, fnt, width):
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def main():
    manifest = json.loads(MANIFEST.read_text())
    frames = manifest["frames"]
    if not frames:
        sys.exit("no frames in manifest")

    shutil.rmtree(CAPTIONED, ignore_errors=True)
    CAPTIONED.mkdir(parents=True)
    shutil.rmtree(SHOTS, ignore_errors=True)
    SHOTS.mkdir(parents=True)

    title_font = font(FONT_CANDIDATES, 34)
    caption_font = font(FONT_CANDIDATES, 26)
    label_font = font(MONO_CANDIDATES, 19)

    captioned = []
    total = len(frames)
    for i, frame in enumerate(frames, start=1):
        src = Image.open(frame["file"]).convert("RGB")
        # Playwright captured at 2x; resample down so text stays sharp.
        if src.size != (W, H):
            src = src.resize((W, H), Image.LANCZOS)

        canvas = Image.new("RGB", (W, H + BAR), BG)
        canvas.paste(src, (0, 0))
        draw = ImageDraw.Draw(canvas)

        top = H
        draw.line([(0, top), (W, top)], fill=RULE, width=1)
        # Step counter chip
        chip = f"{i:02d} / {total:02d}"
        cw = draw.textlength(chip, font=label_font)
        draw.rounded_rectangle([48, top + 26, 48 + cw + 26, top + 26 + 44], radius=8, fill=(243, 236, 226))
        draw.text((48 + 13, top + 34), chip, font=label_font, fill=ACCENT)

        # Caption, wrapped if long
        text_x = 48 + cw + 26 + 26
        lines = wrap(draw, frame["caption"], caption_font, W - text_x - 70)
        y = top + (BAR - len(lines) * 34) // 2
        for line in lines[:2]:
            draw.text((text_x, y), line, font=caption_font, fill=INK)
            y += 34

        out = CAPTIONED / Path(frame["file"]).name
        canvas.save(out, optimize=True)
        captioned.append(out)

        # A still screenshot variant with the same caption: useful on its own.
        canvas.save(SHOTS / f"{i:02d}-{Path(frame['file']).stem.split('-', 1)[1]}.png", optimize=True)

    video = OUT / "mindflow-demo.mp4"
    seconds = 4.0
    fade = 0.55
    inputs = []
    for out in captioned:
        inputs += ["-loop", "1", "-t", str(seconds), "-i", str(out)]
    filters = []
    for i in range(len(captioned)):
        filters.append(f"[{i}:v]fps=30,setsar=1,format=yuv420p[v{i}]")
    chain = []
    last = "v0"
    for i in range(1, len(captioned)):
        offset = i * (seconds - fade)
        chain.append(f"[{last}][v{i}]xfade=transition=fade:duration={fade}:offset={offset:.2f}[x{i}]")
        last = f"x{i}"
    graph = ";".join(filters + chain) + f";[{last}]format=yuv420p[out]"
    if len(captioned) == 1:
        graph = filters[0] + ";[v0]format=yuv420p[out]"

    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
         "-filter_complex", graph, "-map", "[out]",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video)],
        check=True,
    )

    # A vertical-ready square poster from the first frame, for the post itself.
    poster = Image.open(captioned[0]).convert("RGB")
    poster = poster.resize((1280, int(1280 * poster.height / poster.width)), Image.LANCZOS)
    poster.save(OUT / "mindflow-demo-poster.png", optimize=True)

    print(f"✓ {len(captioned)} captioned frames → {CAPTIONED}")
    print(f"✓ screenshots → {SHOTS}")
    print(f"✓ video → {video}")


if __name__ == "__main__":
    main()
