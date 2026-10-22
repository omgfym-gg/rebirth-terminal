// 佔位用的像素圖：16×16，每個字元對應調色盤裡的一個顏色
'use strict';

const PALETTE = {
  k: '#14121c', // 輪廓
  s: '#f0c8a0', // 皮膚
  h: '#6b4226', // 褐髮
  a: '#8b5a2b', // 皮甲
  c: '#4a6a8a', // 披風
  w: '#dcdce6', // 金屬
  b: '#3a2a1a', // 靴子
  W: '#f6f2e8', // 白袍
  g: '#e8c040', // 金
  y: '#f5d020', // 黃外套
  r: '#a02828', // 暗紅
  R: '#d04040', // 紅
  o: '#ff9a30', // 橘光
  d: '#2a2030', // 深色
  p: '#7a5aa0', // 紫
  P: '#c8a0f0', // 淡紫
  u: '#4a90d0', // 藍
  U: '#a0d8ff', // 淡藍
  e: '#8a8a96', // 灰
  E: '#5a5a66', // 深灰
  n: '#1e1a28', // 黑
  t: '#3a7a5a', // 墨綠
};

const SPRITES = {
  human: [
    '................',
    '.....kkkkk......',
    '....khhhhhk.....',
    '....khhhhhhk....',
    '....khssssk.....',
    '....kskssk......',
    '.....kssssk.....',
    '....kcaaaack..w.',
    '...kccaaaaack.w.',
    '...kcaaaaaask.w.',
    '...kc.aaaa.skkw.',
    '....k.aaaa..k...',
    '......kaak......',
    '.....kb..bk.....',
    '.....kb..bk.....',
    '.....kk..kk.....',
  ],
  angel: [
    '.....gggggg.....',
    '................',
    '.....kkkkk......',
    '....kggggk......',
    'U...kssssk...U..',
    'UU..kskssk..UU..',
    'UUU..kssk..UUU..',
    '.UUkWWWWWWkUU.g.',
    '..UkWWgWWWWkU.g.',
    '...kWWgWWWWsk.g.',
    '...kWWWWWWWkkkg.',
    '...kWWWWWWWk..g.',
    '...kWWWWWWWk....',
    '...kWWWWWWWk....',
    '....kWWWWWk.....',
    '.....kkkkk......',
  ],
  demon: [
    '..k.........k...',
    '..kk.......kk...',
    '...kk.kkk.kk....',
    '....krrrrrk.....',
    '....krrrrrk.....',
    '....kokrokk.....',
    '.....krrrk......',
    '....knnnnnk.....',
    '...knnnnnnnk....',
    '..krnnnnnnnrk...',
    '..kr.nnnnn.rk...',
    '.....nnnnn......',
    '.....nnnnnk.....',
    '.....kr..rk..rr.',
    '.....kr..rk.r...',
    '.....kk..kkr....',
  ],
  dog: [
    '................',
    '................',
    '................',
    '................',
    '.kk.............',
    'knnk............',
    'knRnk...........',
    'knnnnk.......k..',
    '.knnnnkkkkkkknk.',
    '..knnnnnnnnnnk..',
    '..knnnnnnnnnnk..',
    '..knnnnnnnnnnk..',
    '...knk.kk.knk...',
    '...knk.kk.knk...',
    '...kk..kk..kk...',
    '................',
  ],
  shade: [
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kknnnnkk....',
    '...knnnnnnnnk...',
    '..knnnnnnnnnnk..',
    '..knnUnnnnUnnk..',
    '..knnUnnnnUnnk..',
    '..knnnnnnnnnnk..',
    '..knnnnkknnnnk..',
    '..knnnnnnnnnnk..',
    '..knnnnnnnnnnk..',
    '...knnknnknnk...',
    '...kk.kk.kk.k...',
    '................',
  ],
  wisp: [
    '................',
    '.......U........',
    '......UU........',
    '.....UUuU.......',
    '.....UuuU.U.....',
    '....UUuuuUU.....',
    '....UuuUuuU.....',
    '...UuuWuuWuU....',
    '...UuuWuuWuU....',
    '...UuuuuuuuU....',
    '....UuuuuuU.....',
    '.....UuuuU......',
    '......UUU.......',
    '................',
    '................',
    '................',
  ],
  husk: [
    '................',
    '.....kkkkk......',
    '....keeeeek.....',
    '....keeeeek.....',
    '....keeeeek.....',
    '....keeeeek.....',
    '.....keeek......',
    '....kEEwEEk.....',
    '...kEEEwEEEk....',
    '...kEEEREEEk....',
    '...kEEERE.ek....',
    '...ke.EEEE.k....',
    '......EEEE......',
    '.....kE..Ek.....',
    '.....kn..nk.....',
    '.....kk..kk.....',
  ],
  hunter: [
    '................',
    '.....kkkkk......',
    '....krrrrrk.....',
    '...krrrrrrrk....',
    '...krnnnnnrk....',
    '...krnRnRnrk....',
    '...krnnnnnrk....',
    '...krrrrrrrk.w..',
    '..krrrrrrrrrkw..',
    '..krrnnnnnrrkw..',
    '..krrnnnnnrrkk..',
    '...krnnnnnrk....',
    '....knnnnnk.....',
    '....kn...nk.....',
    '....kn...nk.....',
    '....kk...kk.....',
  ],
  boss: [
    '....kkkkkkk.....',
    '...keeeeeeek....',
    '...keeeeeeek....',
    '...keeeeeeek....',
    '...keeeeeeek....',
    '....keeeeek.....',
    '..kkEEEEEEEkk...',
    '.kEEwEEEEEwEEk..',
    '.kEwEEEEEEEwEk..',
    '.kE.wEEEEEw.Ek..',
    'kU..EEEEEEE..kw.',
    'UuU.EEEEEEE...w.',
    'kUk.EEEEEEE...w.',
    '....kEE.EEk.....',
    '....kEE.EEk.....',
    '....kkk.kkk.....',
  ],
  redgirl: [
    '................',
    '................',
    '.....kkkkk......',
    '....knnnnnk.....',
    '...knnnnnnnk....',
    '...knnssnnnk....',
    '...knnkknnnk....',
    '...knnssnnnk....',
    '....kRRRRRk.....',
    '...kRRRRRRRk....',
    '...ksRRRRRsk....',
    '...kRRRRRRRk....',
    '..kRRRRRRRRRk...',
    '...kkkkkkkkk....',
    '.....ks.sk......',
    '.....kk.kk......',
  ],
  mirror: [
    '................',
    '.....kkkkk......',
    '....kUUUUUk.....',
    '....kUwUUUk.....',
    '....kUkUkUk.....',
    '....kUUwUUk.....',
    '.....kUUUk......',
    '....kwUUwUUk....',
    '...kUUUwUUUUk...',
    '...kUUwUUUUUk...',
    '...kU.UUwU.Uk...',
    '......UUUw......',
    '.....kUUUUk.....',
    '.....kU..Uk.....',
    '.....kU..Uk.....',
    '.....kk..kk.....',
  ],
  horus: [
    '.....kkkk.......',
    '....knnnnk......',
    '...knngnnkk.....',
    '...knnnnnnggk...',
    '...knnnnnk..k...',
    '....knnnk.......',
    '..kkgggggkk.....',
    '.knnngggnnnk....',
    '.knnnnnnnnnk.g..',
    '.kn.nnnnn.nk.g..',
    '.kn.nnnnn.nkkgk.',
    '....ngggn....g..',
    '....nnnnn....g..',
    '....kn.nk.......',
    '....kn.nk.......',
    '....kk.kk.......',
  ],
  soul: [
    '................',
    '................',
    '......UUUU......',
    '.....UUUUUU.....',
    '....UUWUUWUU....',
    '....UUWUUWUU....',
    '....UUUUUUUU....',
    '....UUUUUUUU....',
    '....UUUUUUUU....',
    '.....UUUUUUU....',
    '.....UUUUUU.....',
    '......UUUU......',
    '.......UU.......',
    '........U.......',
    '................',
    '................',
  ],
  courier: [
    '................',
    '.....kkkkk......',
    '....knnnnnk.....',
    '....knsssk......',
    '....kskssk......',
    '.....ksssk......',
    '...kkyyyyyk.kkk.',
    '..kyyyyyyyykRRk.',
    '..kyyykyyyykRRk.',
    '..kyyykyyyykRRk.',
    '..kskyyyyyskkkk.',
    '....kyyyyyk.....',
    '....kEEEEEk.....',
    '....kE...Ek.....',
    '....kn...nk.....',
    '....kk...kk.....',
  ],
  doctor: [
    '................',
    '.....kkkkk......',
    '....kEnEnEk.....',
    '....kssssk......',
    '....kdkkdk......',
    '.....ksssk......',
    '...kkWWuWWkk....',
    '..kWWWWuWWWWk...',
    '..kWWWuuuWWWk...',
    '..kWWWWWWWWWk...',
    '..ksWWWWWWWsk...',
    '...kWWWWWWWk....',
    '...kWWWWWWWk....',
    '....kE...Ek.....',
    '....kn...nk.....',
    '....kk...kk.....',
  ],
};

// 把像素圖預先畫成 canvas：正常、反白（受擊閃光）、左右翻轉
const SpriteCache = {};

function buildSprite(name) {
  const rows = SPRITES[name];
  const make = (white, flip) => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) {
      const row = (rows[y] || '').padEnd(16, '.').slice(0, 16);
      for (let x = 0; x < 16; x++) {
        const ch = row[x];
        if (ch === '.' || !PALETTE[ch]) continue;
        g.fillStyle = white ? '#ffffff' : PALETTE[ch];
        g.fillRect(flip ? 15 - x : x, y, 1, 1);
      }
    }
    return c;
  };
  SpriteCache[name] = {
    normal: make(false, false),
    flipped: make(false, true),
    white: make(true, false),
    whiteFlipped: make(true, true),
  };
}

function getSprite(name, { flip = false, white = false } = {}) {
  if (!SpriteCache[name]) buildSprite(name);
  const s = SpriteCache[name];
  if (white) return flip ? s.whiteFlipped : s.white;
  return flip ? s.flipped : s.normal;
}

// 立繪：把像素圖放大畫在指定的 canvas 上
function drawPortrait(canvas, name, scale = 6) {
  canvas.width = 16 * scale;
  canvas.height = 16 * scale;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(getSprite(name), 0, 0, canvas.width, canvas.height);
}

// ───────── 職業專屬像素圖（Gemini 畫的，有連續動作）─────────
// big：轉生櫃台、城鎮用的大圖；mini：戰鬥格子用的縮小版。每張是一排等寬格子，腳底對齊底邊。
// pose 那張的格子順序：站、走、坐、睡、出拳（出拳朝左）。
const ART = {
  yuelao: {
    dir: 'assets/yuelao/',
    mark: 'heart', // 身邊飄愛心，一眼認得出是月老
    big: { pose: ['sheet.png', 49, 78] },
    mini: { pose: ['mini/pose.png', 18, 28], walk: ['mini/walk.png', 16, 28], punch: ['mini/punch.png', 22, 28], cast: ['mini/cast.png', 29, 28], hurt: ['mini/hurt.png', 27, 27] },
  },
};
// 動作：用哪張、每格停多久（毫秒）
const ART_ANIMS = {
  walk: { sheet: 'walk', ms: [110, 110, 110, 110], loop: true },
  punch: { sheet: 'punch', ms: [60, 70, 220, 90] },
  cast: { sheet: 'cast', ms: [90, 90, 90, 260] },
  hurt: { sheet: 'hurt', ms: [140, 240] },
};

const ArtImages = {};
function artSheet(job, size, sheet) {
  const a = ART[job], spec = a && a[size][sheet];
  if (!spec) return null;
  const key = a.dir + spec[0];
  if (!ArtImages[key]) { const im = new Image(); im.src = key; ArtImages[key] = im; }
  const img = ArtImages[key];
  return img.complete && img.naturalWidth ? { img, fw: spec[1], fh: spec[2] } : null;
}
function preloadArt() {
  for (const job in ART) for (const size of ['big', 'mini']) for (const sheet in ART[job][size]) artSheet(job, size, sheet);
}
preloadArt();

// 把第 i 格畫到 g 上，(cx, bottom) 是腳底中心
const artTmp = document.createElement('canvas');
function drawArt(g, job, size, sheet, i, cx, bottom, scale, { flip = false, white = false } = {}) {
  const s = artSheet(job, size, sheet);
  if (!s) return false;
  const { img, fw, fh } = s;
  artTmp.width = fw; artTmp.height = fh;
  const tg = artTmp.getContext('2d');
  tg.drawImage(img, i * fw, 0, fw, fh, 0, 0, fw, fh);
  if (white) { tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = '#fff'; tg.fillRect(0, 0, fw, fh); }
  const w = fw * scale, h = fh * scale, x = Math.round(cx - w / 2), y = Math.round(bottom - h);
  g.save();
  g.imageSmoothingEnabled = false;
  if (flip) { g.translate(x + w, y); g.scale(-1, 1); g.drawImage(artTmp, 0, 0, w, h); }
  else g.drawImage(artTmp, x, y, w, h);
  g.restore();
  return true;
}

// 職業記號：小像素圖，戰鬥時飄在角色身邊
const MARKS = {
  heart: { color: '#ff5c8d', light: '#ffc0d4', rows: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.', '..x..'] },
};
function drawMark(g, name, x, y, s, alpha = 1) {
  const m = MARKS[name];
  g.globalAlpha = alpha;
  // 先畫一圈深色外框，在深色地板上也看得清楚
  const o = Math.max(1, s / 2);
  g.fillStyle = '#1a1418';
  m.rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
    if (ch === 'x') g.fillRect(Math.round(x + xx * s - o), Math.round(y + yy * s - o), s + 2 * o, s + 2 * o);
  }));
  m.rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
    if (ch !== 'x') return;
    g.fillStyle = yy === 1 && xx === 1 ? m.light : m.color;
    g.fillRect(Math.round(x + xx * s), Math.round(y + yy * s), s, s);
  }));
  g.globalAlpha = 1;
}

// 卡片上的職業大圖（圖還沒載入就等載入後再畫）
function artImg(job, height = 72) {
  const c = document.createElement('canvas');
  c.className = 'art';
  const spec = ART[job].big.pose;
  c.width = spec[1]; c.height = spec[2];
  c.style.height = height + 'px';
  const paint = () => drawArt(c.getContext('2d'), job, 'big', 'pose', 0, spec[1] / 2, spec[2], 1);
  if (!paint()) ArtImages[ART[job].dir + spec[0]].addEventListener('load', paint, { once: true });
  return c;
}
