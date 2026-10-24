"""把 Gemini 畫的技能打擊特效原圖（assets/skills/gemini/<id>.png，純黑底、3 排 × 5 格）
切成遊戲用的整齊格子：assets/skills/<id>.png，每格 CELL×CELL，3 排（s1/s2/ult）× 5 格。
黑底不用去背：遊戲裡用 'lighter'（加亮）疊上去，黑色自然消失。

用法：python3 tools/skill_fx.py [id ...]   （不給 id 就處理全部）
"""
import glob, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CELL, ROWS, COLS = 96, 3, 5


def runs(ink, n):
    """找出連續有墨水的區段，太多就把最近的併起來，太少就平均切"""
    r, i = [], 0
    while i < len(ink):
        if ink[i]:
            j = i
            while j < len(ink) and ink[j]: j += 1
            if j - i > 3: r.append([i, j])
            i = j
        i += 1
    while len(r) > n:
        k = min(range(len(r) - 1), key=lambda k: r[k + 1][0] - r[k][1])
        r[k:k + 2] = [[r[k][0], r[k + 1][1]]]
    if len(r) < n:
        L = len(ink); r = [[L * k // n, L * (k + 1) // n] for k in range(n)]
    return r


def lum(a): return a.max(axis=2)


def do(id_):
    src = os.path.join(ROOT, 'assets/skills/gemini', id_ + '.png')
    im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int)
    a[lum(a) < 48] = 0  # 壓掉 JPEG 黑底的雜訊
    L = lum(a)
    # 排用墨水斷開的地方切；格子用整張圖墨水範圍平均分五等分（Gemini 排得很平均，淡出的格子常常幾乎空白）
    xs = np.where((L > 60).sum(axis=0) > 2)[0]; X0, X1 = xs.min(), xs.max() + 1
    cw = (X1 - X0) / COLS
    bands = runs((L > 60).sum(axis=1) > 2, ROWS)
    side = max(cw, max(y1 - y0 for y0, y1 in bands))
    s = CELL / side  # 同一張圖用同一個縮放，格子大小才不會跳
    out = Image.new('RGB', (CELL * COLS, CELL * ROWS))
    for ri, (y0, y1) in enumerate(bands):
        for ci in range(COLS):
            x0, x1 = int(X0 + ci * cw), int(X0 + (ci + 1) * cw)
            c = Image.fromarray(a[y0:y1, x0:x1].astype('uint8'))
            c = c.resize((max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))), Image.LANCZOS)
            out.paste(c, (ci * CELL + (CELL - c.size[0]) // 2, ri * CELL + (CELL - c.size[1]) // 2))
    dst = os.path.join(ROOT, 'assets/skills', id_ + '.png')
    out.save(dst, optimize=True)
    print(id_, im.size, '->', dst)


ids = sys.argv[1:] or [os.path.basename(p)[:-4] for p in sorted(glob.glob(os.path.join(ROOT, 'assets/skills/gemini/*.png')))]
for i in ids: do(i)
