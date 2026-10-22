"""把 side.html 打包成單一檔案（CSS、JS、圖片都內嵌），給 Artifact 用。用法：python3 tools/build_side.py 輸出.html"""
import re, base64, sys, os, json
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '')
h = open(R + 'side.html', encoding='utf8').read()
h = re.sub(r'<link rel="stylesheet" href="style.css[^"]*">', lambda m: '<style>\n' + open(R + 'style.css', encoding='utf8').read() + '\n</style>', h)
h = re.sub(r'<a class="btn wide" href="./"[^>]*>回遊戲</a>\n?', '', h)
imgs = {}
for d in sorted({a for a in re.findall(r"dir: '(assets/[^']+/)'", open(R + 'js/sprites.js', encoding='utf8').read())} | {'assets/units/'}):
    for f in os.listdir(R + d):
        if f.endswith('.png'): imgs[d + f] = 'data:image/png;base64,' + base64.b64encode(open(R + d + f, 'rb').read()).decode()

def js(m):
    src = open(R + m.group(1), encoding='utf8').read()
    if 'sprites.js' in m.group(1):
        src = src.replace("im.src = key + '?v=' + ASSET_V;", "im.src = (window.EMBED && EMBED[key]) || key + '?v=' + ASSET_V;")
        assert 'EMBED' in src
        src = 'window.EMBED = ' + json.dumps(imgs) + ';\n' + src
    return '<script>\n' + src + '\n</script>'
h = re.sub(r'<script src="([^"?]+)[^"]*"></script>', js, h)
open(sys.argv[1], 'w', encoding='utf8').write(h)
print(len(h))
