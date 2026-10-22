"""把 Gemini 生成的白底像素圖變成真正的像素素材。

用法：python3 tools/sprite_pipeline.py 原圖.jpg 輸出資料夾 [--frame 寬 高] [--merge-small] [--flip 格子編號…]
步驟：去背 → 找出每個角色 → 偵測像素格大小 → 每格取一個顏色 → 量化 32 色 → 修外框 → 腳底對齊拼成一排
輸出：sheet.png（角色，由左到右）、small.png（小物件，例如愛心）、meta.json
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter


def flood_background(img, holes=False):
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
    # 被紅線之類圍起來的白色空洞也是背景（--holes 才開，不然白鬍子會被挖掉）：要是純白、旁邊又沒有黑外框才算
    dark = img.max(axis=2) < 90
    seen = bg.copy()
    for sy, sx in zip(*np.nonzero(white & ~bg) if holes else ()):
        if seen[sy, sx]: continue
        seen[sy, sx] = True; q = deque([(sy, sx)]); pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) < 200: continue
        p = np.array(pts)
        c = img[p[:, 0], p[:, 1]].mean(axis=0)
        if c.min() < 245 or c.max() - c.min() > 8: continue  # 白毛帶一點暖色，背景是純白
        y0, x0 = p.min(axis=0) - 4; y1, x1 = p.max(axis=0) + 5
        y0, x0 = max(y0, 0), max(x0, 0)
        reg = np.zeros((y1 - y0, x1 - x0), bool); reg[p[:, 0] - y0, p[:, 1] - x0] = True
        ring = (np.asarray(Image.fromarray(reg.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0) & ~reg
        ring &= ~bg[y0:y1, x0:x1][:ring.shape[0], :ring.shape[1]]
        if ring.sum() and dark[y0:y1, x0:x1][:ring.shape[0], :ring.shape[1]][ring].mean() < 0.05:
            bg[p[:, 0], p[:, 1]] = True
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
    """梯度在每個週期裡越集中在同一個相位，越可能是像素格大小；倍數也會很集中，所以取接近最高分裡最小的"""
    g = np.abs(np.diff(gray, axis=1)).sum(axis=0)
    scores = {}
    for P in range(6, 17):
        bins = np.zeros(P)
        for i, v in enumerate(g): bins[i % P] += v
        scores[P] = bins.max() / bins.mean()
    top = max(scores.values())
    for P in sorted(scores):
        if scores[P] >= top * 0.8 and all(scores[P] >= scores[Q] * 0.8 for Q in scores if Q % P == 0):
            return P


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
    red = (a[..., 0] > 150) & (a[..., 1] < 90)  # 紅線之類的細線維持原色
    a[edge & ~(a[..., :3].max(axis=2) < 90) & ~red, :3] = (26, 20, 24)
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main(src, out, fw=None, fh=None, merge_small=False, flip=(), height=None, holes=False):
    img = np.asarray(Image.open(src).convert('RGB')).astype(float)
    gray = img.mean(axis=2)
    fg = flood_background(img, holes)
    lab, boxes = components(fg)
    if height:
        return main_scaled(img, fg, lab, boxes, out, fw, fh, merge_small, flip, height)
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
    groups, small_ids = group_parts(lab, [b for b in boxes if (cl == b[0]).any()], merge_small)

    def crop(ids):
        m = np.isin(cl, ids)
        ys, xs = np.nonzero(m)
        a = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        a[~m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]] = 0
        return clean(a)
    parts = [crop(g) for g in groups]
    parts = [p[:, ::-1].copy() if i in flip else p for i, p in enumerate(parts)]
    write(out, parts, [crop([n]) for n in small_ids], fw, fh, P)


def group_parts(lab, boxes, merge_small):
    """大區塊各自是一格；小碎片看要不要併進最近的大區塊"""
    big = max(b[2] for b in boxes)
    present = sorted(boxes, key=lambda b: b[1])
    groups = [[b[0]] for b in present if b[2] > big * 0.25]
    small_ids = [b[0] for b in present if b[2] <= big * 0.25]
    if merge_small:
        cx = lambda ids: np.nonzero(np.isin(lab, ids))[1].mean()
        centers = [cx(g) for g in groups]
        for n in small_ids:
            c = cx([n])
            groups[int(np.argmin([abs(c - x) for x in centers]))].append(n)
        small_ids = []
    return groups, small_ids


def main_scaled(img, fg, lab, boxes, out, fw, fh, merge_small, flip, height):
    """AI 圖的像素格常常不整齊：改成整張等比例 BOX 縮小，讓最高的那格剛好 height 像素"""
    groups, small_ids = group_parts(lab, boxes, merge_small)

    def cut(ids):
        m = np.isin(lab, ids) & fg
        ys, xs = np.nonzero(m)
        a = np.zeros((ys.max() - ys.min() + 1, xs.max() - xs.min() + 1, 4), np.uint8)
        a[..., :3] = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1].clip(0, 255)
        a[..., 3] = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255
        return a
    raw = [cut(g) for g in groups] + [cut([n]) for n in small_ids]
    f = max(r.shape[0] for r in raw[:len(groups)]) / height

    def shrink(a):
        w, h = max(1, round(a.shape[1] / f)), max(1, round(a.shape[0] / f))
        # 顏色用不透明像素加權平均，避免白邊混進來
        pre = a.astype(float); pre[..., :3] *= pre[..., 3:] / 255
        im = Image.fromarray(pre.clip(0, 255).astype(np.uint8), 'RGBA').resize((w, h), Image.BOX)
        s = np.asarray(im).astype(float)
        al = s[..., 3:]
        s[..., :3] = np.where(al > 0, s[..., :3] * 255 / np.maximum(al, 1), 0)
        s[..., 3] = (s[..., 3] >= 110) * 255
        return s.clip(0, 255).astype(np.uint8)
    small = [shrink(r) for r in raw]
    # 全部一起量化成 32 色，顏色才一致
    W = sum(s.shape[1] for s in small); H = max(s.shape[0] for s in small)
    strip = np.zeros((H, W, 4), np.uint8); x = 0
    for s in small: strip[:s.shape[0], x:x + s.shape[1]] = s; x += s.shape[1]
    q = np.asarray(Image.fromarray(strip[..., :3]).quantize(32, method=Image.Quantize.MEDIANCUT).convert('RGB'))
    x = 0
    for s in small: s[..., :3] = q[:s.shape[0], x:x + s.shape[1]]; x += s.shape[1]
    parts = [clean(s) for s in small[:len(groups)]]
    parts = [p[:, ::-1].copy() if i in flip else p for i, p in enumerate(parts)]
    smalls = [clean(s) for s in small[len(groups):]]
    write(out, parts, smalls, fw, fh, round(f, 2))


def write(out, parts, smalls, fw, fh, pixel):
    fw = fw or max(p.shape[1] for p in parts) + 2
    fh = fh or max(p.shape[0] for p in parts) + 2
    sheet = Image.new('RGBA', (fw * len(parts), fh))
    for i, p in enumerate(parts):
        im = Image.fromarray(p, 'RGBA')
        sheet.alpha_composite(im, (i * fw + (fw - im.width) // 2, fh - im.height))
    sheet.save(f'{out}/sheet.png')
    meta = {'pixel': pixel, 'frameW': fw, 'frameH': fh, 'frames': len(parts)}
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
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--frame', nargs=2, type=int, help='每格寬 高')
    ap.add_argument('--merge-small', action='store_true', help='小碎片併進最近的角色，不當成獨立小物件')
    ap.add_argument('--height', type=int, help='不偵測像素格，改成等比例縮到最高的一格剛好這麼高（AI 圖格子不整齊時用）')
    ap.add_argument('--flip', type=int, nargs='*', default=[], help='要左右翻轉的格子（從 0 數）')
    ap.add_argument('--holes', action='store_true', help='被線圈圍起來的純白空洞也去背（甩紅線那種圖才用）')
    o = ap.parse_args()
    fw, fh = o.frame or (None, None)
    main(o.src, o.out, fw, fh, o.merge_small, set(o.flip), o.height, o.holes)
