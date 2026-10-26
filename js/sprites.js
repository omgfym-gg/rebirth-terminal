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
// 每張是一排等寬格子，腳底對齊底邊。戰鬥裡用 1 倍畫（不跟著格子放大），細節才不會糊掉。
// pose 那張的格子順序：站、走、坐、睡、出拳。
const ART = {
  yuelao: {
    dir: 'assets/yuelao/',
    mark: 'heart', // 身邊飄愛心，一眼認得出是月老
    sheets: { pose: ['sheet.png', 49, 78], walk: ['walk.png', 42, 78], punch: ['punch.png', 56, 78], cast: ['cast.png', 80, 78], hurt: ['hurt.png', 81, 78] },
  },
  horusshadow: {
    dir: 'assets/horusshadow/',
    mark: 'eye', // 身邊飄荷魯斯之眼
    // punch 是權杖射金光，cast 是面具上的眼睛放暗影
    sheets: { pose: ['sheet.png', 64, 86], walk: ['walk.png', 70, 86], punch: ['punch.png', 94, 86], cast: ['cast.png', 75, 86], hurt: ['hurt.png', 92, 86] },
  },
  redgirl: {
    dir: 'assets/redgirl/',
    mark: 'fog', // 身邊飄紅色山霧
    // punch 是蹲低撲上去抓，cast 是揮手召出紅霧
    sheets: { pose: ['sheet.png', 63, 76], walk: ['walk.png', 61, 76], punch: ['punch.png', 76, 76], cast: ['cast.png', 71, 76], hurt: ['hurt.png', 88, 76] },
  },
};
// 新一批職業圖（tools/job_art.py 產生，每張 3 格）：idle 待機、walk 走路、hurt 受傷、s1/s2 兩招技能、ult 大招
// atk：普攻借用哪一張的動作；melee：普攻要不要衝上前；color：招式特效的顏色
const JOB_ART = {
  brigid: { mark: 'flame', atk: 's2', melee: true, color: '#ff8a30', h: 82, w: { idle: 73, walk: 75, hurt: 82, s1: 94, s2: 103, ult: 104 } },
  tudigong: { mark: 'ingot', atk: 's2', melee: false, color: '#ffc830', h: 82, w: { idle: 62, walk: 60, hurt: 74, s1: 94, s2: 95, ult: 94 } },
  guangong: { mark: 'crescent', atk: 's1', melee: true, color: '#40d070', h: 82, w: { idle: 97, walk: 99, hurt: 97, s1: 97, s2: 108, ult: 135 } },
  hermes: { mark: 'wing', atk: 's2', melee: true, color: '#f0d070', h: 82, w: { idle: 76, walk: 79, hurt: 96, s1: 129, s2: 88, ult: 130 } },
  dagda: { mark: 'pot', atk: 's2', melee: true, color: '#d8a060', h: 82, w: { idle: 77, walk: 77, hurt: 98, s1: 93, s2: 82, ult: 121 } },
  hanako: { mark: 'wisp', atk: 's2', melee: true, color: '#b060e0', h: 82, w: { idle: 71, walk: 68, hurt: 77, s1: 86, s2: 87, ult: 98 } },
  anubis: { mark: 'ankh', atk: 's1', melee: true, color: '#f0c040', h: 82, w: { idle: 72, walk: 72, hurt: 78, s1: 92, s2: 102, ult: 96 } },
  hachi: { mark: 'hat', atk: 's1', melee: false, color: '#e8e8ff', h: 94, w: { idle: 66, walk: 64, hurt: 80, s1: 117, s2: 101, ult: 113 } },
  yukionna: { mark: 'snow', atk: 's1', melee: false, color: '#a0e0ff', h: 82, w: { idle: 81, walk: 70, hurt: 96, s1: 156, s2: 112, ult: 144 } },
  medusa: { mark: 'snake', atk: 's2', melee: true, color: '#70d060', h: 82, w: { idle: 68, walk: 64, hurt: 81, s1: 130, s2: 68, ult: 105 } },
  // 拿專屬兵器的樣子（裝備專屬兵器時換這套）
  'yuelao-ex': { mark: 'heart', atk: 's1', melee: false, color: '#ff5c8d', h: 82, w: { idle: 48, walk: 60, hurt: 85, s1: 84, s2: 74, ult: 86 } },
  'guangong-ex': { mark: 'crescent', atk: 's1', melee: true, color: '#40d070', h: 82, w: { idle: 100, walk: 103, hurt: 114, s1: 125, s2: 92, ult: 150 } },
  'brigid-ex': { mark: 'flame', atk: 's2', melee: true, color: '#ff8a30', h: 82, w: { idle: 77, walk: 78, hurt: 78, s1: 83, s2: 74, ult: 78 } },
  'tudigong-ex': { mark: 'ingot', atk: 's2', melee: false, color: '#ffc830', h: 82, w: { idle: 62, walk: 58, hurt: 87, s1: 82, s2: 98, ult: 108 } },
  'hermes-ex': { mark: 'wing', atk: 's2', melee: true, color: '#f0d070', h: 82, w: { idle: 75, walk: 84, hurt: 91, s1: 92, s2: 110, ult: 139 } },
  'dagda-ex': { mark: 'pot', atk: 's2', melee: true, color: '#d8a060', h: 82, w: { idle: 86, walk: 89, hurt: 84, s1: 116, s2: 101, ult: 144 } },
  'horusshadow-ex': { mark: 'eye', atk: 's1', melee: false, color: '#e0b850', h: 82, w: { idle: 62, walk: 64, hurt: 75, s1: 110, s2: 83, ult: 111 } },
  'redgirl-ex': { mark: 'fog', atk: 's1', melee: true, color: '#ff4050', h: 82, w: { idle: 74, walk: 70, hurt: 69, s1: 141, s2: 92, ult: 151 } },
  'hanako-ex': { mark: 'wisp', atk: 's2', melee: true, color: '#b060e0', h: 82, w: { idle: 97, walk: 103, hurt: 106, s1: 140, s2: 122, ult: 100 } },
  'anubis-ex': { mark: 'ankh', atk: 's1', melee: true, color: '#f0c040', h: 82, w: { idle: 95, walk: 95, hurt: 95, s1: 135, s2: 107, ult: 152 } },
  'hachi-ex': { mark: 'hat', atk: 's1', melee: false, color: '#e8e8ff', h: 82, w: { idle: 60, walk: 66, hurt: 78, s1: 100, s2: 81, ult: 142 } },
  'yukionna-ex': { mark: 'snow', atk: 's1', melee: false, color: '#a0e0ff', h: 82, w: { idle: 83, walk: 91, hurt: 93, s1: 112, s2: 87, ult: 103 } },
  'medusa-ex': { mark: 'snake', atk: 's2', melee: true, color: '#70d060', h: 82, w: { idle: 77, walk: 77, hurt: 86, s1: 109, s2: 92, ult: 112 } },
};
for (const [id, j] of Object.entries(JOB_ART)) {
  const sheet = (n) => [n + '.png', j.w[n], j.h];
  ART[id] = {
    dir: 'assets/' + id + '/', mark: j.mark, color: j.color, melee: j.melee, atk: j.atk,
    sheets: { pose: sheet('idle'), walk: sheet('walk'), hurt: sheet('hurt'), s1: sheet('s1'), s2: sheet('s2'), ult: sheet('ult'), punch: sheet(j.atk), cast: sheet('s1') },
    anims: {
      walk: { sheet: 'walk', ms: [120, 120, 120], loop: true },
      punch: { sheet: 'punch', ms: [90, 200, 160] },
      cast: { sheet: 's1', ms: [110, 180, 240] },
      hurt: { sheet: 'hurt', ms: [140, 240] },
      s1: { sheet: 's1', ms: [130, 220, 320] },
      s2: { sheet: 's2', ms: [130, 220, 320] },
      ult: { sheet: 'ult', ms: [160, 260, 460] },
    },
  };
}

// 戰鬥角色（敵人、引魂犬）：每張 3 格，待機、攻擊、被打，都面向右邊；登記成 ART['u:名字']
const UNIT_ART = {"dog": [52, 50], "shade": [69, 70], "wisp": [74, 54], "husk": [81, 74], "redgirl": [55, 62], "mirror": [57, 78], "hunter": [117, 76], "boss": [142, 104], "horus": [138, 100], "zombie": [82, 78], "printer": [81, 64], "judge": [87, 123], "dullahan": [165, 114], "wendigo": [97, 118], "guhuoniao": [94, 110], "lintoujie": [96, 94], "tengu": [101, 94], "mothman": [98, 98], "jinmenken": [68, 58], "mizuki": [59, 78], "gaki": [64, 76], "diaoxigui": [66, 82], "jerseydevil": [81, 82], "amanojaku": [59, 66]};
for (const [k, [w, h]] of Object.entries(UNIT_ART)) ART['u:' + k] = { dir: 'assets/units/', sheets: { pose: [k + '.png', w, h] } };

// 動作：用哪張、每格停多久（毫秒）
const ART_ANIMS = {
  walk: { sheet: 'walk', ms: [110, 110, 110, 110], loop: true },
  punch: { sheet: 'punch', ms: [60, 70, 220, 90] },
  cast: { sheet: 'cast', ms: [90, 90, 90, 260] },
  hurt: { sheet: 'hurt', ms: [140, 240] },
};

// 這個職業有沒有這個動作（新一批職業有自己的 s1/s2/ult，舊的只有 ART_ANIMS 那四種）
function artAnim(job, name) {
  const a = ART[job];
  return (a && a.anims ? a.anims[name] : ART_ANIMS[name]) || null;
}

// 圖檔更新時改這個，手機才不會一直用快取的舊圖
const ASSET_V = '20261026a';
const ArtImages = {};
function artSheet(job, sheet) {
  const a = ART[job], spec = a && a.sheets[sheet];
  if (!spec) return null;
  const key = a.dir + spec[0];
  if (!ArtImages[key]) { const im = new Image(); im.src = key + '?v=' + ASSET_V; ArtImages[key] = im; }
  const img = ArtImages[key];
  return img.complete && img.naturalWidth ? { img, fw: spec[1], fh: spec[2] } : null;
}
function preloadArt() {
  for (const job in ART) for (const sheet in ART[job].sheets) artSheet(job, sheet);
}
preloadArt();

// 把第 i 格畫到 g 上，(cx, bottom) 是腳底中心
const artTmp = document.createElement('canvas');
function drawArt(g, job, sheet, i, cx, bottom, scale, { flip = false, white = false } = {}) {
  const s = artSheet(job, sheet);
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
  wisp: { color: '#b060e0', light: '#f0c0ff', rows: ['..x.', '.xx.', 'xxx.', '.xxx', '..x.'] },
  ankh: { color: '#f0c040', light: '#fff0b0', rows: ['.x.', 'x.x', '.x.', 'xxx', '.x.', '.x.'] },
  hat: { color: '#f0f0ff', light: '#ffffff', rows: ['..xx..', '.xxxx.', 'xxxxxx'] },
  snow: { color: '#c0ecff', light: '#ffffff', rows: ['x.x.x', '.xxx.', 'xx.xx', '.xxx.', 'x.x.x'] },
  snake: { color: '#70d060', light: '#e0ffa0', rows: ['.xx..', 'x..x.', '..x..', '.x..x', '..xx.'] },
  pot: { color: '#606878', light: '#ffd080', rows: ['.x.x.', 'xxxxx', 'xxxxx', '.xxx.'] },
  wing: { color: '#f4f4ff', light: '#ffffff', rows: ['x....', 'xx...', 'xxx..', '.xxxx', '..xx.'] },
  crescent: { color: '#40d070', light: '#c0ffd0', rows: ['..xx', '...x', '...x', '..xx', 'xxx.'] },
  ingot: { color: '#ffc830', light: '#fff4b0', rows: ['.xxx.', 'xx.xx', 'xxxxx'] },
  flame: { color: '#ffa020', light: '#fff0a0', rows: ['..x..', '..xx.', '.xxx.', '.xxxx', 'xxxxx', '.xxx.'] },
  fog: { color: '#d0404a', light: '#ffb0b0', rows: ['.xx...', 'xxxx.x', '.xxxxx', '..xx..'] },
  eye: { color: '#f0c040', light: '#3050c0', rows: ['.xxxx.', 'xx.xxx', '.xxxx.', '..x.x.', '.x...x'] },
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
  const spec = ART[job].sheets.pose;
  c.width = spec[1]; c.height = spec[2];
  c.style.height = height + 'px';
  const paint = () => drawArt(c.getContext('2d'), job, 'pose', 0, spec[1] / 2, spec[2], 1);
  if (!paint()) ArtImages[ART[job].dir + spec[0]].addEventListener('load', paint, { once: true });
  return c;
}
