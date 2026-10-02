#!/usr/bin/env python3
"""Generate the deterministic overlay-first Snapmark reference GIF."""

from __future__ import annotations

import math

from PIL import Image, ImageDraw, ImageFilter

import generate_full_flow_gif as base


OUTPUT = base.ROOT / "gif" / "e-inline-selection-comment.gif"
FPS = 10
DURATION = 13.4
CROP = (470, 184, 896, 438)


def dim_outside(img: Image.Image, crop=CROP):
    """Apply the specified 12% shade and a deliberately subtle blur outside the crop."""
    blurred = img.filter(ImageFilter.GaussianBlur(radius=3))
    mask = Image.new("L", (base.W, base.H), 255)
    ImageDraw.Draw(mask).rectangle(crop, fill=0)
    img.paste(blurred, (0, 0), mask)
    base.dim_except(img, crop, opacity=31)


def inline_ui(img: Image.Image, hover: str | None = None):
    d = ImageDraw.Draw(img)
    left, top, right, bottom = CROP
    base.rr(d, (left, 134, right, 174), 8, base.C["panel"])
    d.ellipse((484, 149, 494, 159), fill=base.C["annotation"])
    d.text((500, 145), "#FF4D2E", font=base.F11, fill=base.C["text"])
    d.line((568, 146, 589, 146), fill=base.C["text"], width=4)
    d.text((598, 145), "4 px", font=base.F11, fill=base.C["text_2"])
    d.line((716, 143, 716, 165), fill=base.C["separator"])
    base.button(d, 724, 140, "undo")
    base.button(d, 758, 140, "redo", disabled=True)
    base.button(d, 792, 140, "copy", hovered=hover == "copy")
    base.button(d, 826, 140, "save", hovered=hover == "save")
    base.button(d, 860, 140, "close")

    base.rr(d, (420, top, 460, bottom), 8, base.C["panel"])
    for y, name in zip((190, 224, 258, 292, 326, 360), ("select", "arrow", "rect", "ellipse", "pencil", "text")):
        base.button(d, 426, y, name, active=name == "arrow")
    d.line((429, 397, 451, 397), fill=base.C["separator"])
    base.button(d, 426, 404, "close")

    if hover == "copy":
        base.tooltip(d, 806, 184, "Копировать  ·  Enter")
    if hover == "save":
        base.tooltip(d, 840, 184, "Сохранить  ·  Ctrl+S")


def coral_annotation(draw: ImageDraw.ImageDraw, progress: float, text_progress: float = 0, editing: bool = True):
    start = (776, 389)
    end = base.mix(start, (622, 339), progress)
    draw.line((*start, *end), fill="#FFFFFF", width=9)
    draw.line((*start, *end), fill=base.C["annotation"], width=4)
    if progress > .72:
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        halo = [(end[0] - math.cos(angle + da) * 18, end[1] - math.sin(angle + da) * 18) for da in (2.65, -2.65)]
        head = [(end[0] - math.cos(angle + da) * 14, end[1] - math.sin(angle + da) * 14) for da in (2.65, -2.65)]
        draw.polygon([end, *halo], fill="#FFFFFF")
        draw.polygon([end, *head], fill=base.C["annotation"])
    if progress < 1:
        return
    base.rr(draw, (704, 351, 882, 423), 10, base.C["panel"], base.C["blue"] if editing else None, 2)
    value = "Кнопка перекрывает\nтекст на экране"
    visible = value[: round(len(value) * base.clamp(text_progress))]
    draw.multiline_text((718, 365), visible, font=base.F12, fill=base.C["text"], spacing=3)
    if editing:
        base.rr(draw, (846, 357, 874, 385), 6, base.C["blue"])
        base.icon(draw, "check", 860, 371, base.C["white"])
        draw.text((704, 428), "Новая строка · Shift/Ctrl+Enter", font=base.F11, fill="#52647B")


def fallback_scene(img: Image.Image, progress: float):
    d = ImageDraw.Draw(img)
    layer = Image.new("RGBA", (base.W, base.H), (15, 23, 42, round(38 * base.ease(progress))))
    img.alpha_composite(layer)
    y = round(134 + (1 - base.ease(progress)) * 18)
    base.rr(d, (205, y, 755, y + 334), 12, base.C["white"], "#CBD5E1")
    d.rectangle((205, y, 755, y + 42), fill="#F3F6FA")
    d.ellipse((224, y + 15, 236, y + 27), fill="#EF4444")
    d.ellipse((244, y + 15, 256, y + 27), fill="#F59E0B")
    d.ellipse((264, y + 15, 276, y + 27), fill="#94A3B8")
    d.text((296, y + 13), "Snapmark · fallback", font=base.F13, fill=base.C["ink"])
    base.rr(d, (237, y + 66, 723, y + 116), 8, "#FFF7ED", "#FDBA74")
    d.text((253, y + 78), "Chrome запретил overlay на этой странице.", font=base.F13, fill="#9A3412")
    d.text((253, y + 96), "Редактор открыт отдельно только как fallback.", font=base.F11, fill="#9A3412")
    base.rr(d, (237, y + 140, 723, y + 303), 8, "#E2E8F0")
    base.rr(d, (311, y + 170, 649, y + 270), 6, base.C["white"], base.C["blue"], 2)
    d.text((357, y + 208), "Тот же редактор и экспорт PNG", font=base.F13, fill=base.C["ink"])


def frame_at(t: float) -> Image.Image:
    img = Image.new("RGBA", (base.W, base.H), base.C["page"])
    base.draw_page(img)
    d = ImageDraw.Draw(img)

    if t < 1.0:
        base.rr(d, (342, 548, 618, 583), 8, base.C["panel"])
        base.centered(d, (480, 565), "Ctrl+Shift+S · живая страница", base.F12, base.C["text"])
        base.cursor(d, 774, 345)
        return img

    if t < 3.2:
        p = base.clamp((t - 1.0) / 1.9)
        start = (470, 184)
        end = base.mix(start, (896, 438), p)
        dim_outside(img, (start[0], start[1], end[0], end[1]))
        d = ImageDraw.Draw(img)
        d.rectangle((start[0], start[1], end[0], end[1]), outline=base.C["blue"], width=2)
        if p > .08:
            base.rr(d, (end[0] - 102, end[1] + 9, end[0], end[1] + 33), 5, base.C["panel"])
            base.centered(d, (end[0] - 51, end[1] + 21), f"{end[0]-start[0]} × {end[1]-start[1]}", base.F11, base.C["text"])
        base.cursor(d, end[0], end[1], click=p < .94)
        return img

    if t < 3.45:
        # Capture happens once with Snapmark visuals hidden; the transparent blocker remains.
        return img

    dim_outside(img)
    d = ImageDraw.Draw(img)
    d.rectangle(CROP, outline=base.C["blue"], width=2)
    inline_ui(img)
    d = ImageDraw.Draw(img)

    if t < 4.3:
        base.cursor(d, 440, 238)
        return img

    arrow_p = base.clamp((t - 4.3) / 1.2)
    if t < 5.55:
        coral_annotation(d, arrow_p)
        point = base.mix((776, 389), (622, 339), arrow_p)
        base.cursor(d, point[0], point[1], click=arrow_p < .93)
        return img

    text_p = base.clamp((t - 5.55) / 2.15)
    editing = t < 8.2
    coral_annotation(d, 1, text_p, editing)
    if t < 7.2:
        if t > 6.55:
            base.rr(d, (334, 548, 626, 583), 8, base.C["panel"])
            base.centered(d, (480, 565), "Ctrl/Shift+Enter · новая строка", base.F12, base.C["text"])
        return img
    if t < 8.25:
        base.rr(d, (357, 548, 603, 583), 8, base.C["panel"])
        base.centered(d, (480, 565), "Enter · применить текст", base.F12, base.C["text"])
        base.cursor(d, 860, 371, click=t > 7.9)
        return img
    if t < 9.25:
        inline_ui(img, "copy")
        coral_annotation(ImageDraw.Draw(img), 1, 1, False)
        base.rr(ImageDraw.Draw(img), (360, 548, 600, 583), 8, base.C["panel"])
        base.centered(ImageDraw.Draw(img), (480, 565), "второй Enter · копировать", base.F12, base.C["text"])
        base.cursor(ImageDraw.Draw(img), 806, 154)
        return img
    if t < 10.5:
        inline_ui(img, "save")
        coral_annotation(ImageDraw.Draw(img), 1, 1, False)
        base.cursor(ImageDraw.Draw(img), 840, 154, click=t > 10.05)
        return img
    if t < 11.55:
        coral_annotation(d, 1, 1, False)
        base.save_dialog(img, base.clamp((t - 10.5) / .25))
        base.cursor(ImageDraw.Draw(img), 650, 425)
        return img

    fallback_scene(img, base.clamp((t - 11.55) / .35))
    return img


def main():
    base.load_tabler_icons()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [frame_at(index / FPS).convert("RGB").quantize(colors=128, method=Image.Quantize.MEDIANCUT)
              for index in range(round(DURATION * FPS))]
    frames[0].save(OUTPUT, save_all=True, append_images=frames[1:], duration=round(1000 / FPS),
                   loop=0, optimize=True, disposal=2)
    print(OUTPUT)


if __name__ == "__main__":
    main()
