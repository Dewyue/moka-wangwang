#!/usr/bin/env python3
"""从 Image/moka_*.png 生成 dog-data.js（分享卡用）。"""
from pathlib import Path
import base64
import io
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

ROOT = Path(__file__).resolve().parents[1]
CLOSE = ROOT / "Image" / "moka_close_mouth.png"
OPEN = ROOT / "Image" / "moka_open_mouth.png"
OUT = ROOT / "dog-data.js"


def to_data_url(path: Path, max_size=720) -> str:
    im = Image.open(path).convert("RGBA")
    im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


if not CLOSE.exists() or not OPEN.exists():
    sys.exit(f"缺少图片：{CLOSE.name} / {OPEN.name}")

OUT.write_text(
    "/* 摩卡图片 data URL：分享卡 / canvas 绘制用（由 scripts/build-dog-data.py 生成） */\n"
    f'window.DOG_CARD_DATA_URL = "{to_data_url(CLOSE)}";\n'
    f'window.DOG_OPEN_DATA_URL = "{to_data_url(OPEN)}";\n'
)
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
