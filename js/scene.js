'use strict';
// 戰鬥場景：每個主題的地板、牆、水，用 2 像素一格的細像素畫，畫好存起來重複用。
// 牆有頂面和正面，會在下方地板投影；水會流動、靠岸處有白邊。

const SCENE_GRAIN = 2;

// 每個主題的畫法：floor 地板花紋、wall 牆的正面樣式、顏色
const SCENES = {
  corridor: { floor: 'slab',   wall: 'brick',  base: '#2a2533', dark: '#1e1a26', light: '#36303f', accent: '#4a3f5c', top: '#4a4458', front: '#332d40', line: '#231f2c' },
  archive:  { floor: 'plank',  wall: 'drawer', base: '#2a2620', dark: '#1d1a15', light: '#3a3428', accent: '#4a6a8a', top: '#5a5e66', front: '#41454e', line: '#2a2d33' },
  office:   { floor: 'carpet', wall: 'panel',  base: '#2c1f26', dark: '#21171c', light: '#3a2a32', accent: '#5a3a46', top: '#6a6470', front: '#4c4652', line: '#34303a' },
  morgue:   { floor: 'tile',   wall: 'drawer', base: '#3a4644', dark: '#2a3432', light: '#4c5a57', accent: '#203330', top: '#7a8682', front: '#5a6662', line: '#3a4442' },
  shaft:    { floor: 'metal',  wall: 'girder', base: '#2a2a2c', dark: '#1c1c1e', light: '#3c3c40', accent: '#8a6a20', top: '#4a4a50', front: '#36363c', line: '#222226' },
  garden:   { floor: 'grass',  wall: 'hedge',  base: '#24402a', dark: '#1a3020', light: '#30543a', accent: '#c06080', top: '#3a6a40', front: '#2a5030', line: '#1a3420' },
};

function sceneHash(x, y, k = 0) {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 把顏色調亮或調暗：amt 介於 -1 和 1
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

class Scene {
  constructor(themeId, cols, rows, tileSize) {
    this.st = SCENES[themeId] || SCENES.corridor;
    this.cols = cols; this.rows = rows; this.T = tileSize;
    this.cache = document.createElement('canvas');
    this.cache.width = cols * tileSize; this.cache.height = rows * tileSize;
    this.key = '';
    this.vignette = null;
  }

  // 一格細像素
  dot(g, px, py, cx, cy, color, w = 1, h = 1) {
    g.fillStyle = color;
    g.fillRect(px + cx * SCENE_GRAIN, py + cy * SCENE_GRAIN, w * SCENE_GRAIN, h * SCENE_GRAIN);
  }

  // 地形有變（例如技能造水）才重畫
  draw(g, tiles, now) {
    const k = tiles.map((r) => r.join('')).join('|');
    if (k !== this.key) { this.key = k; this.build(tiles); }
    g.drawImage(this.cache, 0, 0);
    this.drawWater(g, tiles, now);
  }

  build(tiles) {
    const g = this.cache.getContext('2d');
    const T = this.T, at = (x, y) => (tiles[y] && tiles[y][x]) || 'wall';
    g.clearRect(0, 0, this.cache.width, this.cache.height);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (at(x, y) !== 'wall') this.floorTile(g, x, y, x * T, y * T);
    }
    // 牆的影子落在下面的地板
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (at(x, y) !== 'wall' || y + 1 >= this.rows || at(x, y + 1) === 'wall') continue;
      const grd = g.createLinearGradient(0, (y + 1) * T, 0, (y + 1) * T + 14);
      grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x * T, (y + 1) * T, T, 14);
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (at(x, y) === 'wall') this.wallTile(g, x, y, x * T, y * T, at(x, y + 1) === 'wall', at(x, y - 1) === 'wall');
    }
  }

  floorTile(g, x, y, px, py) {
    const s = this.st, N = this.T / SCENE_GRAIN, d = (cx, cy, c, w, h) => this.dot(g, px, py, cx, cy, c, w, h);
    g.fillStyle = s.base; g.fillRect(px, py, this.T, this.T);
    // 底色雜點
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      const r = sceneHash(x * N + cx, y * N + cy, 1);
      if (r < 0.06) d(cx, cy, s.dark); else if (r > 0.95) d(cx, cy, s.light);
    }
    const H = (k) => sceneHash(x, y, k);
    if (s.floor === 'slab') {
      // 四塊大石板，縫是暗線、左上亮邊
      const half = N / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const ox = i * half, oy = j * half;
        d(ox, oy, s.dark, half, 1); d(ox, oy, s.dark, 1, half);
        d(ox + 1, oy + 1, s.light, half - 2, 1); d(ox + 1, oy + 1, s.light, 1, half - 2);
      }
      if (H(2) < 0.3) { let cx = 4 + Math.floor(H(3) * 20), cy = 4 + Math.floor(H(4) * 10); for (let k = 0; k < 7; k++) { d(cx, cy, s.dark); cx += H(10 + k) < 0.5 ? 1 : 0; cy += 1; } }
    } else if (s.floor === 'plank') {
      // 橫向木板，錯開的接縫，有水漬
      for (let r = 0; r < 4; r++) {
        const oy = r * 8; d(0, oy, s.dark, N, 1); d(0, oy + 1, s.light, N, 1);
        const seam = Math.floor(sceneHash(x + r, y, 5) * N); d(seam, oy, s.dark, 1, 8);
        for (let k = 0; k < 3; k++) d(Math.floor(sceneHash(x, y * 4 + r, 20 + k) * N), oy + 3 + k, shade(s.base, -0.18), 4, 1);
      }
      if (H(6) < 0.35) { const cx = Math.floor(H(7) * 18) + 4, cy = Math.floor(H(8) * 18) + 4; d(cx, cy, 'rgba(74,106,138,0.45)', 7, 4); d(cx + 2, cy - 1, 'rgba(74,106,138,0.45)', 4, 6); }
    } else if (s.floor === 'carpet') {
      // 地毯菱形花紋
      for (let cy = 0; cy < N; cy += 2) for (let cx = 0; cx < N; cx += 2) {
        if ((Math.abs((cx % 16) - 8) + Math.abs((cy % 16) - 8)) === 8) d(cx, cy, s.accent, 2, 2);
      }
      if (H(2) < 0.2) d(Math.floor(H(3) * 24) + 2, Math.floor(H(4) * 24) + 2, '#6a2a30', 5, 3); // 污漬
    } else if (s.floor === 'tile') {
      // 白磁磚，4×4 小格，偶爾裂開
      for (let i = 0; i < 4; i++) { d(i * 8, 0, s.dark, 1, N); d(0, i * 8, s.dark, N, 1); }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) d(i * 8 + 1, j * 8 + 1, s.light, 3, 1);
      if (H(2) < 0.25) { const cx = Math.floor(H(3) * 4) * 8; d(cx + 2, 10, s.dark, 1, 3); d(cx + 3, 13, s.dark, 1, 2); d(cx + 4, 15, s.dark, 1, 1); }
      if (H(5) < 0.15) d(Math.floor(H(6) * 20) + 4, Math.floor(H(7) * 20) + 4, 'rgba(110,20,30,0.6)', 4, 3);
    } else if (s.floor === 'metal') {
      // 金屬板：防滑紋、四角鉚釘
      for (let cy = 2; cy < N - 2; cy += 4) for (let cx = 2 + (cy % 8 ? 2 : 0); cx < N - 2; cx += 4) { d(cx, cy, s.light, 2, 1); d(cx + 1, cy + 1, s.dark, 1, 1); }
      d(0, 0, s.dark, N, 1); d(0, 0, s.dark, 1, N);
      for (const [cx, cy] of [[2, 2], [N - 3, 2], [2, N - 3], [N - 3, N - 3]]) { d(cx, cy, '#5a5a62'); d(cx, cy + 1, s.dark); }
      if (H(2) < 0.2) { for (let k = 0; k < N; k += 4) d(k, N - 3, s.accent, 2, 2); } // 黃黑警示條
    } else if (s.floor === 'grass') {
      // 草地，小草叢、偶爾開花、踏腳石
      for (let k = 0; k < 14; k++) {
        const cx = Math.floor(sceneHash(x, y, 30 + k) * (N - 2)), cy = Math.floor(sceneHash(x, y, 60 + k) * (N - 3)) + 2;
        d(cx, cy, s.light); d(cx + 1, cy - 1, s.light); d(cx + 2, cy, s.light);
      }
      if (H(2) < 0.3) { const cx = Math.floor(H(3) * 24) + 3, cy = Math.floor(H(4) * 24) + 3; d(cx, cy, s.accent); d(cx - 1, cy + 1, s.accent); d(cx + 1, cy + 1, s.accent); d(cx, cy + 2, s.accent); d(cx, cy + 1, '#ffe080'); }
      if (H(5) < 0.25) { const cx = Math.floor(H(6) * 20) + 4, cy = Math.floor(H(7) * 20) + 4; d(cx, cy, '#5a5e58', 6, 4); d(cx + 1, cy, '#72766e', 4, 1); }
    }
  }

  wallTile(g, x, y, px, py, wallBelow, wallAbove) {
    const s = this.st, N = this.T / SCENE_GRAIN, d = (cx, cy, c, w, h) => this.dot(g, px, py, cx, cy, c, w, h);
    const cap = wallBelow ? N : 10; // 下面還是牆就只看得到頂面
    // 頂面
    g.fillStyle = s.top; g.fillRect(px, py, this.T, cap * SCENE_GRAIN);
    for (let cy = 0; cy < cap; cy++) for (let cx = 0; cx < N; cx++) if (sceneHash(x * N + cx, y * N + cy, 9) < 0.08) d(cx, cy, shade(s.top, -0.12));
    if (!wallAbove) d(0, 0, shade(s.top, 0.25), N, 1);
    if (wallBelow) return;
    d(0, cap - 1, shade(s.top, 0.15), N, 1);
    // 正面
    const fy = cap, fh = N - cap;
    g.fillStyle = s.front; g.fillRect(px, py + fy * SCENE_GRAIN, this.T, fh * SCENE_GRAIN);
    if (s.wall === 'brick') {
      for (let r = 0; r * 5 < fh; r++) {
        const oy = fy + r * 5; d(0, oy, s.line, N, 1);
        for (let cx = (r % 2 ? 4 : 0); cx < N; cx += 8) d(cx, oy, s.line, 1, 5);
        for (let cx = (r % 2 ? 5 : 1); cx < N; cx += 8) d(cx, oy + 1, shade(s.front, 0.12), 5, 1);
      }
    } else if (s.wall === 'drawer') {
      // 檔案櫃／停屍櫃：兩排抽屜，各有把手和名牌
      const dh = Math.floor(fh / 2);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const ox = c * 16 + 1, oy = fy + r * dh + 1;
        d(ox, oy, s.line, 14, 1); d(ox, oy, s.line, 1, dh - 1); d(ox + 13, oy, s.line, 1, dh - 1); d(ox, oy + dh - 2, s.line, 14, 1);
        d(ox + 1, oy + 1, shade(s.front, 0.15), 12, 1);
        d(ox + 5, oy + 3, '#d8d0b0', 4, 2); d(ox + 6, oy + dh - 5, '#9aa0a8', 2, 1);
      }
    } else if (s.wall === 'panel') {
      // 辦公室隔板：布面＋上緣鋁條，偶爾貼便利貼
      d(0, fy, '#8a8a94', N, 2);
      for (let cy = fy + 3; cy < N; cy += 3) d(0, cy, shade(s.front, -0.1), N, 1);
      d(15, fy + 2, s.line, 2, fh - 2);
      if (sceneHash(x, y, 11) < 0.5) d(4 + Math.floor(sceneHash(x, y, 12) * 18), fy + 5, '#f0d860', 4, 4);
    } else if (s.wall === 'girder') {
      // 鋼樑：工字鋼加鉚釘、斜撐
      d(0, fy, s.line, N, 2); d(0, N - 2, s.line, N, 2);
      for (let k = 0; k < fh - 4; k++) { d(Math.floor(k * N / (fh - 4)), fy + 2 + k, shade(s.front, 0.2), 2, 1); }
      for (let cx = 3; cx < N; cx += 7) { d(cx, fy + 3, '#6a6a72'); d(cx, N - 4, '#6a6a72'); }
      if (sceneHash(x, y, 13) < 0.4) for (let k = 0; k < N; k += 4) d(k, fy, s.accent, 2, 2);
    } else if (s.wall === 'hedge') {
      // 樹籬：一叢叢葉子，偶爾有花
      for (let k = 0; k < 40; k++) {
        const cx = Math.floor(sceneHash(x, y, 100 + k) * (N - 2)), cy = fy + Math.floor(sceneHash(x, y, 200 + k) * (fh - 2));
        d(cx, cy, sceneHash(x, y, 300 + k) < 0.5 ? shade(s.front, 0.2) : shade(s.front, -0.25), 2, 2);
      }
      if (sceneHash(x, y, 14) < 0.5) { const cx = 6 + Math.floor(sceneHash(x, y, 15) * 18); d(cx, fy + 6, s.accent, 2, 2); }
    }
    d(0, N - 1, 'rgba(0,0,0,0.5)', N, 1);
  }

  drawWater(g, tiles, now) {
    const T = this.T, N = T / SCENE_GRAIN, at = (x, y) => (tiles[y] && tiles[y][x]) || 'wall';
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (at(x, y) !== 'water') continue;
      const px = x * T, py = y * T, d = (cx, cy, c, w, h) => this.dot(g, px, py, cx, cy, c, w, h);
      g.fillStyle = '#16304e'; g.fillRect(px, py, T, T);
      // 流動的波紋
      for (let r = 0; r < 6; r++) {
        const cy = 3 + r * 5, phase = now / 500 + r * 1.7 + x * 2.1 + y;
        const cx = Math.floor((Math.sin(phase) * 0.5 + 0.5) * (N - 8));
        d(cx, cy, '#2c5a8a', 6, 1); d(cx + 2, cy - 1, '#4a80b0', 3, 1);
      }
      // 靠岸的白邊
      const foam = 'rgba(200,230,255,0.55)';
      if (at(x, y - 1) !== 'water') d(0, 0, foam, N, 1);
      if (at(x, y + 1) !== 'water') d(0, N - 1, foam, N, 1);
      if (at(x - 1, y) !== 'water') d(0, 0, foam, 1, N);
      if (at(x + 1, y) !== 'water') d(N - 1, 0, foam, 1, N);
    }
  }

  // 四周暗、中間亮，像是只有一盞燈
  drawLight(g, w, h) {
    if (!this.vignette) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const vg = c.getContext('2d');
      const grd = vg.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.5)');
      vg.fillStyle = grd; vg.fillRect(0, 0, w, h);
      this.vignette = c;
    }
    g.drawImage(this.vignette, 0, 0);
  }
}
