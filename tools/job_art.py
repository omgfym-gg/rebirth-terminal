"""把 RC 傳上來的職業原圖（assets/jobs/gemini3/<id>/ 的 idle/walk/hurt/s1/s2/ult，每張 3 格）做成遊戲用的圖。

用法：python3 tools/job_art.py 職業id [高度=80]
輸出到 assets/<id>/，最後印出 sprites.js 的 JOB_ART 要填的每格寬高。
"""
import glob, json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
job, height = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '80'
src = os.path.join(ROOT, 'assets/jobs/gemini3', job)
out = os.path.join(ROOT, 'assets', job)
os.makedirs(out, exist_ok=True)
w, h = {}, 0
for name in ['idle', 'walk', 'hurt', 's1', 's2', 'ult']:
    f = sorted(glob.glob(os.path.join(src, name + '.*')))[0]
    tmp = tempfile.mkdtemp()
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools/sprite_pipeline.py'), f, tmp, '--merge-small', '--height', height], check=True, stdout=subprocess.DEVNULL)
    meta = json.load(open(os.path.join(tmp, 'meta.json')))
    if meta['frames'] != 3: print(f'注意：{name} 切出 {meta["frames"]} 格（應該是 3 格）', file=sys.stderr)
    shutil.copy(os.path.join(tmp, 'sheet.png'), os.path.join(out, name + '.png'))
    w[name] = meta['frameW']; h = max(h, meta['frameH'])
print(json.dumps({'h': h, 'w': w}, ensure_ascii=False))
