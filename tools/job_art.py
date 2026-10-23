"""把 RC 傳上來的職業原圖（assets/jobs/gemini3/<id>/ 的 idle/walk/hurt/s1/s2/ult，每張 3 格；
或省額度版 base（待機/走路/受傷三排）+ skills（s1/s2/ult 三排））做成遊戲用的圖。

用法：python3 tools/job_art.py 職業id [高度=80]
輸出到 assets/<id>/，最後印出 sprites.js 的 JOB_ART 要填的每格寬高。
"""
import glob, json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
job, height = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '80'
src = os.path.join(ROOT, 'assets/jobs/gemini3', job)
out = os.path.join(ROOT, 'assets', job)
os.makedirs(out, exist_ok=True)


def split_rows(path, names, tmpdir):
    """一張圖裡上下三排（省 Gemini 額度的畫法）：用整排空白的地方切開"""
    import numpy as np
    from PIL import Image
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    ink = ((a.min(axis=2) < 225) | (a.max(axis=2) - a.min(axis=2) > 30)).sum(axis=1) > 2
    runs, y = [], 0
    while y < len(ink):
        if ink[y]:
            y0 = y
            while y < len(ink) and ink[y]: y += 1
            runs.append([y0, y])
        y += 1
    runs = [r for r in runs if r[1] - r[0] > 8]
    while len(runs) > len(names):  # 把最近的兩段併起來（角色身上的特效可能斷開）
        i = min(range(len(runs) - 1), key=lambda k: runs[k + 1][0] - runs[k][1])
        runs[i:i + 2] = [[runs[i][0], runs[i + 1][1]]]
    if len(runs) != len(names): raise SystemExit(f'{path} 切出 {len(runs)} 排，應該是 {len(names)} 排')
    out = {}
    for n, (y0, y1) in zip(names, runs):
        out[n] = os.path.join(tmpdir, n + '.png')
        im.crop((0, max(0, y0 - 6), im.width, min(im.height, y1 + 6))).save(out[n])
    return out


srcs = {}
rowdir = tempfile.mkdtemp()
for combo, names in [('base', ['idle', 'walk', 'hurt']), ('skills', ['s1', 's2', 'ult'])]:
    g = sorted(glob.glob(os.path.join(src, combo + '.*')))
    if g: srcs.update(split_rows(g[0], names, rowdir))
w, h = {}, 0
for name in ['idle', 'walk', 'hurt', 's1', 's2', 'ult']:
    f = srcs.get(name) or sorted(glob.glob(os.path.join(src, name + '.*')))[0]
    tmp = tempfile.mkdtemp()
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/sprite_pipeline.py'), f, tmp, '--merge-small', '--height', height], check=True, stdout=subprocess.DEVNULL)
    meta = json.load(open(os.path.join(tmp, 'meta.json')))
    if meta['frames'] != 3: print(f'注意：{name} 切出 {meta["frames"]} 格（應該是 3 格）', file=sys.stderr)
    shutil.copy(os.path.join(tmp, 'sheet.png'), os.path.join(out, name + '.png'))
    w[name] = meta['frameW']; h = max(h, meta['frameH'])
print(json.dumps({'h': h, 'w': w}, ensure_ascii=False))
