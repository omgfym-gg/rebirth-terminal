"""把 Gemini 生成的白底像素圖變成真正的像素素材。

用法：python3 tools/sprite_pipeline.py 原圖.jpg 輸出資料夾 [每格寬 每格高]
步驟：去背 → 找出每個角色 → 偵測像素格大小 → 每格取一個顏色 → 量化 32 色 → 修外框 → 腳底對齊拼成一排
輸出：sheet.png（角色，由左到右）、small.png（小物件，例如愛心）、meta.json
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter


def flood_background(img):
    H, W, _ = img.shape
    white = (img.min(axis=2) > 225) & ((img.max(axis=2) - img.min(axis=2)) < 30)
    bg = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if white[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if white[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    m = Image.fromarray((~bg * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    return np.asarray(m) > 128


def components(fg, grow=17):
    d = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(grow))) > 128
    H, W = d.shape
    lab = np.zeros((H, W), int); n = 0; boxes = []
    for sy, sx in zip(*np.nonzero(d)):
        if lab[sy, sx]: continue
        n += 1; lab[sy, sx] = n; q = deque([(sy, sx)]); xs = []
        while q:
            y, x = q.popleft(); xs.append(x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and d[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
        boxes.append((n, min(xs), len(xs)))
    return lab, boxes


def detect_grid(gray):
    """梯度在每個週期裡越集中在同一個相位，越可能是像素格大小"""
    best = None
    g = np.abs(np.diff(gray, axis=1)).sum(axis=0)
    for P in range(6, 13):
        bins = np.zeros(P)
        for i, v in enumerate(g): bins[i % P] += v
        score = bins.max() / bins.mean()
        if best is None or score > best[0]: best = (score, P)
    return best[1]


def phase(gray, P, axis):
    g = np.abs(np.diff(gray, axis=axis)).sum(axis=1 - axis)
    bins = np.zeros(P)
    for i, v in enumerate(g): bins[(i + 1) % P] += v
    return int(bins.argmax())


def clean(a):
    a = a.copy()
    al = a[..., 3] > 0
    pad = np.pad(~al, 1, constant_values=True)
    edge = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    a[(a[..., :3].min(axis=2) > 190) & al & edge] = 0
    al = a[..., 3] > 0
    pad = np.pad(~al, 1, constant_values=True)
    edge = (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]) & al
    a[edge & ~(a[..., :3].max(axis=2) < 90), :3] = (26, 20, 24)
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main(src, out, fw=None, fh=None):
    img = np.asarray(Image.open(src).convert('RGB')).astype(float)
    gray = img.mean(axis=2)
    fg = flood_background(img)
    lab, boxes = components(fg)
    # 用最大的角色來量像素格
    n = max(boxes, key=lambda b: b[2])[0]
    ys, xs = np.nonzero(lab == n)
    crop = gray[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    P = detect_grid(crop)
    X0 = (phase(crop, P, 1) + xs.min()) % P
    Y0 = (phase(crop, P, 0) + ys.min()) % P
    H, W = fg.shape
    ny, nx = (H - Y0) // P, (W - X0) // P
    rgba = np.zeros((ny, nx, 4), np.uint8); cl = np.zeros((ny, nx), int)
    for j in range(ny):
        for i in range(nx):
            y, x = Y0 + j * P, X0 + i * P
            cell = fg[y:y + P, x:x + P]
            if cell.mean() * 255 < 110: continue
            rgba[j, i, :3] = np.median(img[y + 2:y + P - 2, x + 2:x + P - 2].reshape(-1, 3), axis=0).clip(0, 255)
            rgba[j, i, 3] = 255
            cl[j, i] = np.bincount(lab[y:y + P, x:x + P][cell]).argmax()
    q = Image.fromarray(rgba[..., :3]).quantize(32, method=Image.Quantize.MEDIANCUT).convert('RGB')
    rgba[..., :3] = np.asarray(q)
    big = max(b[2] for b in boxes)
    parts, smalls = [], []
    for n, x0, size in sorted(boxes, key=lambda b: b[1]):
        if not (cl == n).any(): continue
        ys, xs = np.nonzero(cl == n)
        a = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        a[cl[ys.min():ys.max() + 1, xs.min():xs.max() + 1] != n] = 0
        (parts if size > big * 0.25 else smalls).append(clean(a))
    fw = fw or max(p.shape[1] for p in parts) + 2
    fh = fh or max(p.shape[0] for p in parts) + 2
    sheet = Image.new('RGBA', (fw * len(parts), fh))
    for i, p in enumerate(parts):
        im = Image.fromarray(p, 'RGBA')
        sheet.alpha_composite(im, (i * fw + (fw - im.width) // 2, fh - im.height))
    sheet.save(f'{out}/sheet.png')
    meta = {'pixel': P, 'frameW': fw, 'frameH': fh, 'frames': len(parts)}
    if smalls:
        sw = max(s.shape[1] for s in smalls); sh = max(s.shape[0] for s in smalls)
        sm = Image.new('RGBA', (sw * len(smalls), sh))
        for i, s in enumerate(smalls):
            im = Image.fromarray(s, 'RGBA')
            sm.alpha_composite(im, (i * sw + (sw - im.width) // 2, (sh - im.height) // 2))
        sm.save(f'{out}/small.png')
        meta.update(smallW=sw, smallH=sh, smalls=len(smalls))
    json.dump(meta, open(f'{out}/meta.json', 'w'))
    print(meta)


if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], *(int(v) for v in a[3:5]))
