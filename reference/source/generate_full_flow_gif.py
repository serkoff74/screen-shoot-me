#!/usr/bin/env python3
"""Generate the deterministic Snapmark interaction concept GIF.

This is a reference artifact generator, not extension implementation code.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "gif" / "d-full-arrow-comment-blue.gif"

W, H = 960, 600
FPS = 10
DURATION = 13.2

C = {
    "page": "#E9EEF5",
    "white": "#FFFFFF",
    "ink": "#26364D",
    "muted": "#8796AA",
    "line": "#D7DFE9",
    "panel": "#18212F",
    "control": "#253044",
    "control_hover": "#334155",
    "separator": "#40506A",
    "text": "#F8FAFC",
    "text_2": "#AAB7C8",
    "blue": "#3B82F6",
    "blue_dark": "#2563EB",
    "blue_soft": "#1E3A5F",
    "blue_light": "#7DB1FF",
    "annotation": "#FF4D2E",
}

ICON_ORDER = ("select", "arrow", "rect", "ellipse", "pencil", "text", "undo", "redo", "copy", "save", "close", "check")
ICON_MASKS: dict[str, Image.Image] = {}

REGULAR = "/usr/local/share/fonts/chromeos/notofonts-20161129/NotoSans-Regular.ttc"
BOLD = "/usr/local/share/fonts/chromeos/notofonts-20161129/NotoSans-Bold.ttc"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


F11 = font(11)
F12 = font(12)
F13 = font(13)
F14 = font(14)
F18 = font(18, True)
F22 = font(22, True)


def clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def ease(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def mix(a: tuple[int, int], b: tuple[int, int], amount: float) -> tuple[int, int]:
    amount = ease(amount)
    return (round(a[0] + (b[0] - a[0]) * amount), round(a[1] + (b[1] - a[1]) * amount))


def rr(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def centered(draw: ImageDraw.ImageDraw, xy, text, used_font, fill):
    draw.text(xy, text, font=used_font, fill=fill, anchor="mm")


def load_tabler_icons():
    """Rasterize the checked-in Tabler sprite once, then use each cell as a mask."""
    rendered = Path("/tmp/snapmark-tabler-sprite.png")
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(ROOT / "source" / "tabler-sprite.svg"),
            "-frames:v", "1", str(rendered),
        ],
        check=True,
    )
    sprite = Image.open(rendered).convert("RGBA")
    for index, name in enumerate(ICON_ORDER):
        cell = sprite.crop((index * 24, 0, index * 24 + 24, 24)).resize((18, 18), Image.Resampling.LANCZOS)
        ICON_MASKS[name] = cell.getchannel("A")


def draw_page(img: Image.Image):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, H), fill=C["page"])
    d.rectangle((0, 0, W, 58), fill=C["white"])
    d.ellipse((23, 17, 47, 41), fill=C["blue"])
    rr(d, (58, 21, 184, 37), 5, "#CAD5E3")
    rr(d, (726, 20, 804, 38), 9, "#E2E8F0")
    rr(d, (817, 20, 923, 38), 9, "#E2E8F0")
    rr(d, (64, 94, 354, 117), 6, C["ink"])
    rr(d, (64, 132, 529, 142), 5, C["text_2"])
    rr(d, (64, 153, 456, 163), 5, "#C5CFDC")
    for x, width in ((64, 388), (470, 426)):
        rr(d, (x, 202, x + width, 440), 12, C["white"])
        rr(d, (x + 22, 227, x + 188, 241), 5, C["line"])
        rr(d, (x + 22, 258, x + width - 36, 267), 4, "#E5EAF1")
        rr(d, (x + 22, 278, x + width - 81, 287), 4, "#E5EAF1")
    rr(d, (86, 318, 226, 358), 7, "#CBD5E1")
    rr(d, (493, 318, 643, 358), 7, C["blue"])
    centered(d, (568, 338), "Отправить", F13, C["white"])
    rr(d, (64, 470, 896, 543), 10, "#DDE5EF")
    rr(d, (86, 491, 352, 502), 5, "#C4CFDC")
    rr(d, (86, 513, 565, 522), 4, "#CDD7E3")


def dim_except(img: Image.Image, box, opacity: int = 112):
    shade = Image.new("RGBA", (W, H), (15, 23, 42, opacity))
    mask = Image.new("L", (W, H), 255)
    md = ImageDraw.Draw(mask)
    md.rectangle(box, fill=0)
    img.alpha_composite(Image.composite(shade, Image.new("RGBA", (W, H)), mask))


def icon(draw: ImageDraw.ImageDraw, name: str, cx: int, cy: int, color: str, width: int = 2):
    mask = ICON_MASKS[name]
    draw.bitmap((cx - 9, cy - 9), mask, fill=color)


def button(draw: ImageDraw.ImageDraw, x: int, y: int, name: str, active=False, hovered=False, disabled=False):
    fill = C["blue_dark"] if hovered else C["blue_soft"] if active else C["control"]
    outline = C["blue"] if active else None
    rr(draw, (x, y, x + 28, y + 28), 6, fill, outline, 1)
    color = C["blue_light"] if active else C["text"]
    if disabled:
        color = "#69778A"
    icon(draw, name, x + 14, y + 14, color)


def tooltip(draw: ImageDraw.ImageDraw, cx: int, y: int, text: str):
    bbox = draw.textbbox((0, 0), text, font=F11)
    width = bbox[2] - bbox[0] + 24
    rr(draw, (cx - width // 2, y, cx + width // 2, y + 30), 6, C["panel"])
    draw.polygon([(cx - 5, y), (cx + 5, y), (cx, y - 6)], fill=C["panel"])
    centered(draw, (cx, y + 15), text, F11, C["text"])


def editor_ui(img: Image.Image, hover: str | None = None):
    d = ImageDraw.Draw(img)
    # top bar
    rr(d, (105, 24, 916, 62), 8, C["panel"])
    d.text((121, 36), "Стрелка", font=F12, fill=C["text"])
    d.line((183, 33, 183, 53), fill=C["separator"])
    controls = [
        (194, 92, "Авто"),
        (294, 64, "━  3"),
        (366, 112, "Сужающаяся"),
        (486, 126, "Подпись: авто"),
    ]
    for x, w, label in controls:
        rr(d, (x, 31, x + w, 55), 6, C["control"])
        if label == "Авто":
            d.ellipse((x + 10, 39, x + 20, 49), fill=C["annotation"])
            d.text((x + 28, 37), label, font=F11, fill=C["text"])
        else:
            d.text((x + 10, 37), label, font=F11, fill=C["text"])
    d.line((814, 33, 814, 53), fill=C["separator"])
    button(d, 826, 29, "copy", hovered=hover == "copy")
    button(d, 860, 29, "save", active=True, hovered=hover == "save")
    # left bar
    rr(d, (54, 86, 92, 418), 8, C["panel"])
    for y, name in zip((93, 125, 157, 189, 221, 253), ("select", "arrow", "rect", "ellipse", "pencil", "text")):
        button(d, 59, y, name, active=name == "arrow")
    d.line((62, 292, 84, 292), fill=C["separator"])
    button(d, 59, 300, "undo")
    button(d, 59, 332, "redo", disabled=True)
    d.line((62, 368, 84, 368), fill=C["separator"])
    button(d, 59, 376, "close")
    if hover == "copy":
        tooltip(d, 840, 76, "Копировать  ·  Enter")
    elif hover == "save":
        tooltip(d, 874, 76, "Сохранить  ·  Ctrl+S")


def cursor(draw: ImageDraw.ImageDraw, x: int, y: int, click=False):
    if click:
        draw.ellipse((x - 12, y - 12, x + 12, y + 12), outline=C["blue_light"], width=2)
    points = [(x, y), (x + 4, y + 18), (x + 9, y + 12), (x + 14, y + 22), (x + 18, y + 20), (x + 13, y + 10), (x + 20, y + 8)]
    draw.polygon(points, fill=C["white"], outline="#0F172A")


def annotation(draw: ImageDraw.ImageDraw, progress: float, text_progress: float = 0.0, editing=True):
    start = (704, 390)
    end = mix(start, (575, 331), progress)
    draw.line((*start, *end), fill=C["white"], width=9)
    draw.line((*start, *end), fill=C["annotation"], width=4)
    if progress > 0.7:
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        head = []
        for da in (2.65, -2.65):
            head.append((end[0] - math.cos(angle + da) * 14, end[1] - math.sin(angle + da) * 14))
        halo_head = []
        for da in (2.65, -2.65):
            halo_head.append((end[0] - math.cos(angle + da) * 18, end[1] - math.sin(angle + da) * 18))
        draw.polygon([end, halo_head[0], halo_head[1]], fill=C["white"])
        draw.polygon([end, head[0], head[1]], fill=C["annotation"])
    if progress >= 1:
        rr(draw, (677, 373, 879, 435), 10, C["panel"], C["blue"] if editing else None, 2)
        text = "Кнопка перекрывает\nтекст на узком экране"
        visible = text[: round(len(text) * clamp(text_progress))]
        draw.multiline_text((692, 388), visible, font=F13, fill=C["text"], spacing=4)
        if editing:
            rr(draw, (842, 379, 871, 408), 6, C["blue"])
            icon(draw, "check", 856, 393, C["white"])
        if editing and int(text_progress * 12) % 2 == 0:
            lines = visible.split("\n")
            last = lines[-1]
            box = draw.textbbox((692, 388), last, font=F13)
            cy = 388 + (len(lines) - 1) * 20
            draw.line((box[2] + 2, cy, box[2] + 2, cy + 16), fill=C["blue_light"], width=2)
        if editing:
            draw.text((677, 443), "Новая строка  ·  Shift/Ctrl+Enter", font=F11, fill="#52647B")


def save_dialog(img: Image.Image, progress: float):
    layer = Image.new("RGBA", (W, H), (15, 23, 42, round(80 * clamp(progress))))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    p = ease(progress)
    cy = round(300 + (1 - p) * 18)
    x1, y1, x2, y2 = 232, cy - 166, 728, cy + 166
    rr(d, (x1, y1, x2, y2), 12, C["white"], "#CBD5E1", 1)
    d.text((258, y1 + 24), "Сохранить снимок", font=F18, fill=C["ink"])
    d.text((258, y1 + 64), "Папка", font=F11, fill=C["muted"])
    rr(d, (258, y1 + 83, 702, y1 + 119), 7, "#F6F8FB", "#CBD5E1")
    d.text((274, y1 + 93), "Изображения  /  Snapmark", font=F13, fill=C["ink"])
    d.text((258, y1 + 143), "Имя файла", font=F11, fill=C["muted"])
    rr(d, (258, y1 + 162, 702, y1 + 198), 7, C["white"], C["blue"], 2)
    d.text((274, y1 + 172), "snapmark-2026-09-15_18-42-10.png", font=F13, fill=C["ink"])
    rr(d, (494, y2 - 58, 588, y2 - 22), 7, "#EDF1F6")
    centered(d, (541, y2 - 40), "Отмена", F12, C["ink"])
    rr(d, (600, y2 - 58, 702, y2 - 22), 7, C["blue"])
    centered(d, (651, y2 - 40), "Сохранить", F12, C["white"])


def toast(draw: ImageDraw.ImageDraw, text: str):
    rr(draw, (358, 520, 602, 562), 9, C["panel"])
    draw.ellipse((376, 532, 394, 550), fill=C["blue"])
    draw.line((381, 541, 386, 546, 391, 536), fill=C["white"], width=2)
    draw.text((406, 532), text, font=F13, fill=C["text"])


def frame_at(t: float) -> Image.Image:
    img = Image.new("RGBA", (W, H), C["page"])
    draw_page(img)
    d = ImageDraw.Draw(img)
    crop = (44, 74, 916, 500)

    if t < 0.8:
        rr(d, (347, 516, 613, 559), 9, C["panel"])
        centered(d, (480, 537), "Ctrl+Shift+S  ·  новый снимок", F13, C["text"])
        cursor(d, 786, 337)
        return img

    if t < 3.1:
        p = clamp((t - 0.8) / 2.0)
        start = (258, 132)
        end = mix(start, (836, 458), p)
        selection = (start[0], start[1], end[0], end[1])
        dim_except(img, selection)
        d = ImageDraw.Draw(img)
        d.rectangle(selection, outline=C["blue"], width=2)
        if p > 0.08:
            label = f"{max(1, end[0]-start[0])} × {max(1, end[1]-start[1])} px"
            rr(d, (end[0] - 118, end[1] + 12, end[0], end[1] + 38), 6, C["panel"])
            centered(d, (end[0] - 59, end[1] + 25), label, F11, C["text"])
        cursor(d, end[0], end[1], click=p < 0.93)
        return img

    dim_except(img, crop, 92)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(crop, radius=3, outline=C["blue"], width=2)
    editor_ui(img)
    d = ImageDraw.Draw(img)

    if t < 3.8:
        cursor(d, 73, 139)
        return img

    arrow_p = clamp((t - 3.8) / 1.15)
    if t < 5.0:
        annotation(d, arrow_p)
        pt = mix((704, 390), (575, 331), arrow_p)
        cursor(d, pt[0], pt[1], click=arrow_p < 0.93)
        return img

    text_p = clamp((t - 5.0) / 2.7)
    editing = t < 8.0
    annotation(d, 1, text_p, editing=editing)
    if t < 6.45:
        cursor(d, 849, 414)
        return img

    if t < 7.35:
        rr(d, (355, 520, 605, 557), 8, C["panel"])
        centered(d, (480, 538), "Shift+Enter  ·  новая строка", F12, C["text"])
        cursor(d, 849, 414)
        return img

    if t < 8.4:
        rr(d, (359, 520, 601, 557), 8, C["panel"])
        centered(d, (480, 538), "Enter  ·  комментарий готов", F12, C["text"])
        cursor(d, 856, 393, click=t > 8.05)
        return img

    if t < 9.3:
        editor_ui(img, "copy")
        annotation(ImageDraw.Draw(img), 1, 1, editing=False)
        rr(ImageDraw.Draw(img), (379, 520, 581, 557), 8, C["panel"])
        centered(ImageDraw.Draw(img), (480, 538), "Enter  ·  копировать", F12, C["text"])
        cursor(ImageDraw.Draw(img), 840, 43)
        return img

    if t < 10.25:
        editor_ui(img, "save")
        annotation(ImageDraw.Draw(img), 1, 1, editing=False)
        cursor(ImageDraw.Draw(img), 874, 43, click=t > 9.9)
        return img

    annotation(d, 1, 1, editing=False)
    if t < 12.35:
        save_dialog(img, clamp((t - 10.25) / 0.35))
        d = ImageDraw.Draw(img)
        cursor(d, 651, 426, click=t > 11.9)
        return img

    toast(ImageDraw.Draw(img), "PNG сохранён")
    cursor(ImageDraw.Draw(img), 651, 426)
    return img


def main():
    load_tabler_icons()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    count = round(DURATION * FPS)
    for index in range(count):
        frame = frame_at(index / FPS).convert("RGB")
        frames.append(frame.quantize(colors=128, method=Image.Quantize.MEDIANCUT))
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
