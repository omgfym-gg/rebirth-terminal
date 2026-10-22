#!/usr/bin/env python3
"""把已經去背的角色格子（透明 PNG，每格一張）縮成真正的像素大小，拼成一排 spritesheet。

用法：python3 tools/unit_sheet.py 輸出.png 高度 格子1.png 格子2.png ...
最高的那一格縮到「高度」像素，其他格同比例；腳底對齊底邊、左右置中，統一 48 色。
"""
import sys
import numpy as np
from PIL import Image


def shrink(f, s):
    a = np.asarray(f).astype(float)
    al = a[..., 3:] / 255
    pm = np.concatenate([a[..., :3] * al, al * 255], 2).astype(np.uint8)  # 先乘 alpha，邊緣才不會發白
    w2, h2 = max(1, round(f.width * s)), max(1, round(f.height * s))
    r = np.asarray(Image.fromarray(pm, 'RGBA').resize((w2, h2), Image.BOX)).astype(float)
    alpha = r[..., 3]
    rgb = np.where(alpha[..., None] > 0, r[..., :3] * 255 / np.maximum(alpha[..., None], 1), 0)
    out = np.zeros((h2, w2, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255)
    out[..., 3] = (alpha >= 110) * 255
    return Image.fromarray(out, 'RGBA')


def main(out, height, files):
    frames = [Image.open(p).convert('RGBA') for p in files]
    frames = [f.crop(f.getbbox()) for f in frames]
    s = height / max(f.height for f in frames)
    small = [shrink(f, s) for f in frames]
    fw, fh = max(i.width for i in small), max(i.height for i in small)
    sheet = Image.new('RGBA', (fw * len(small), fh), (0, 0, 0, 0))
    for k, i in enumerate(small):
        sheet.paste(i, (k * fw + (fw - i.width) // 2, fh - i.height))
    q = sheet.convert('RGB').quantize(48, method=Image.MEDIANCUT).convert('RGB')
    res = Image.new('RGBA', sheet.size)
    res.paste(q)
    res.putalpha(sheet.getchannel('A'))
    res.save(out)
    print(out, fw, fh, len(small))


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3:])
