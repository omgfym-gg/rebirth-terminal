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
