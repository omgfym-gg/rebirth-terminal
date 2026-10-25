'use strict';
// 聲音：音效用 WebAudio 即時合成（8-bit 晶片音，不用載檔案）；
// 背景音樂有檔案就放檔案（assets/audio/），沒有就用程式寫的晶片循環曲頂著。
// 手機瀏覽器要等玩家先點一下畫面才准出聲，所以第一次點擊時才真的開始。
const Snd = (() => {
// 背景音樂檔：放進 assets/audio/ 之後在這裡登記，沒登記的用晶片曲。
// 一首就單曲循環；寫成陣列就是歌單，一首播完接下一首，每次進場從下一首開始
const FILES = {
  // Stable Audio Open 生成，原檔留在小黑電腦的下載資料夾（git 歷史裡也有）；已去尾端靜音、頭尾交叉淡化成可無縫循環
  title: 'assets/audio/title.mp3?v=1',
  floor: ['assets/audio/floor.mp3?v=1', 'assets/audio/floor-2.mp3?v=1', 'assets/audio/floor-3.mp3?v=1'],
  boss: 'assets/audio/boss.mp3?v=1',
};
const pos = {};
const KEY = 'rebirth-terminal-sound-v1';
let pref = { mute: false };
try { pref = { ...pref, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* 私密模式 */ }
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, unlocked = false;
let want = null, playing = null, src = null, seq = null, fileBus = null, tok = 0, nextAt = null;
const buffers = {};

function init() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = pref.mute ? 0 : 1; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
  fileBus = ctx.createGain(); fileBus.gain.value = 0.55; fileBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function unlock() {
  init(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!unlocked) { unlocked = true; if (want) { const w = want; want = null; bgm(w); } }
}
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else if (unlocked) ctx.resume();
});

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// 一個音：波形、頻率（可滑音）、長度、音量
function tone(bus, t, { type = 'square', f, f2, dur = 0.1, vol = 0.3, attack = 0.005 }) {
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + dur + 0.02);
}
function noise(bus, t, { dur = 0.1, vol = 0.3, hp = 0, lp = 0 }) {
  const s = ctx.createBufferSource(), gn = ctx.createGain(); let n = s;
  s.buffer = noiseBuf;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; n.connect(f); n = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); n = f; }
  gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(gn); gn.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

// ───────── 音效 ─────────
const SFX = {
  click: (t) => tone(sfxBus, t, { f: 880, dur: 0.05, vol: 0.15 }),
  draw: (t) => tone(sfxBus, t, { type: 'triangle', f: 520, f2: 780, dur: 0.08, vol: 0.2 }),
  snap: (t) => { noise(sfxBus, t, { dur: 0.12, vol: 0.4, hp: 2000 }); tone(sfxBus, t, { f: 300, f2: 80, dur: 0.15, vol: 0.2 }); },
  charge: (t) => tone(sfxBus, t, { type: 'sawtooth', f: 200, f2: 900, dur: 0.3, vol: 0.12, attack: 0.05 }),
  shoot: (t) => tone(sfxBus, t, { f: 1200, f2: 220, dur: 0.18, vol: 0.2 }),
  hit: (t) => { noise(sfxBus, t, { dur: 0.08, vol: 0.35, lp: 3000 }); tone(sfxBus, t, { f: 260, f2: 90, dur: 0.1, vol: 0.25 }); },
  crit: (t) => { noise(sfxBus, t, { dur: 0.14, vol: 0.45, lp: 5000 }); tone(sfxBus, t, { f: 520, f2: 110, dur: 0.16, vol: 0.3 }); },
  kill: (t) => { [660, 520, 390, 260].forEach((f, i) => tone(sfxBus, t + i * 0.05, { f, dur: 0.07, vol: 0.2 })); noise(sfxBus, t + 0.1, { dur: 0.25, vol: 0.25, lp: 1200 }); },
  hurt: (t) => { tone(sfxBus, t, { f: 180, f2: 60, dur: 0.2, vol: 0.35 }); noise(sfxBus, t, { dur: 0.12, vol: 0.3, lp: 800 }); },
  fall: (t) => [392, 330, 262, 196].forEach((f, i) => tone(sfxBus, t + i * 0.12, { type: 'triangle', f, dur: 0.16, vol: 0.3 })),
  heal: (t) => [72, 76, 79, 84].forEach((n, i) => tone(sfxBus, t + i * 0.05, { type: 'triangle', f: midi(n), dur: 0.12, vol: 0.2 })),
  shield: (t) => tone(sfxBus, t, { type: 'triangle', f: 600, f2: 1200, dur: 0.2, vol: 0.2 }),
  cross: (t) => { [84, 88, 91, 96].forEach((n, i) => tone(sfxBus, t + i * 0.04, { f: midi(n), dur: 0.2, vol: 0.14 })); noise(sfxBus, t, { dur: 0.3, vol: 0.3, hp: 1500 }); },
  win: (t) => [[72, 0], [76, 0.1], [79, 0.2], [84, 0.3]].forEach(([n, d]) => tone(sfxBus, t + d, { f: midi(n), dur: d === 0.3 ? 0.5 : 0.12, vol: 0.2 })),
  lose: (t) => [[69, 0], [65, 0.25], [62, 0.5], [57, 0.75]].forEach(([n, d]) => tone(sfxBus, t + d, { type: 'triangle', f: midi(n), dur: 0.4, vol: 0.3 })),
  rebirth: (t) => { for (let i = 0; i < 8; i++) tone(sfxBus, t + i * 0.06, { type: 'triangle', f: midi(60 + [0, 4, 7, 11, 12, 16, 19, 24][i]), dur: 0.3, vol: 0.15 }); },
};
const last = {};
function sfx(name) {
  if (!ctx || !unlocked || pref.mute || !SFX[name]) return;
  // 同一個音效一下子連發太多次會糊成一團，太近的跳過
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < 0.045) return;
  last[name] = now;
  SFX[name](now + 0.01);
}

// ───────── 背景音樂：晶片循環曲（沒有音樂檔時用） ─────────
// 和弦：[根音 MIDI, 小調 m / 大調 M / 減 d]；每小節 8 拍（八分音符）
const SONGS = {
  title: { bpm: 84, chords: [[57, 'm'], [53, 'M'], [50, 'm'], [52, 'M']], drums: 0, lead: 0.6 },
  floor: { bpm: 118, chords: [[50, 'm'], [46, 'M'], [48, 'M'], [45, 'M']], drums: 1, lead: 0.8 },
  boss: { bpm: 148, chords: [[52, 'm'], [48, 'M'], [52, 'm'], [51, 'd']], drums: 2, lead: 1 },
};
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6] };
// 固定的旋律走法（和弦音的位置），每首每小節換一種，聽起來像寫好的曲子
const MOTIFS = [[0, 1, 2, 1, 3, 2, 1, 0], [2, -1, 1, -1, 0, 1, 2, 3], [3, 2, -1, 1, 2, -1, 0, -1], [0, -1, 2, 3, 4, 3, 2, -1]];
function startSeq(name) {
  const S = SONGS[name], step = 60 / S.bpm / 2;
  let i = 0, t = ctx.currentTime + 0.1;
  const id = setInterval(() => {
    while (t < ctx.currentTime + 0.3) {
      const bar = Math.floor(i / 8) % S.chords.length, b = i % 8, [root, q] = S.chords[bar], tri = TRIAD[q];
      // 低音：根音八分音符，跳八度
      tone(musicBus, t, { type: 'triangle', f: midi(root - 12 + (b % 2 ? 12 : 0)), dur: step * 0.9, vol: 0.5 });
      // 主旋律：方波
      const m = MOTIFS[(bar + Math.floor(i / 32)) % MOTIFS.length][b];
      if (m >= 0 && (S.lead >= 1 || b % 2 === 0 || S.lead > 0.7)) {
        const n = root + 12 + tri[m % 3] + 12 * Math.floor(m / 3);
        tone(musicBus, t, { type: 'square', f: midi(n), dur: step * (S.lead >= 1 ? 0.7 : 1.6), vol: 0.13 });
      }
      // 鼓：1 = 踩鈸＋小鼓，2 = 再加大鼓
      if (S.drums) {
        noise(musicBus, t, { dur: 0.03, vol: 0.12, hp: 7000 });
        if (b === 2 || b === 6) noise(musicBus, t, { dur: 0.12, vol: 0.3, lp: 4000 });
        if (S.drums > 1 && b % 2 === 0) tone(musicBus, t, { type: 'sine', f: 150, f2: 40, dur: 0.12, vol: 0.7 });
        else if (b === 0 || b === 4) tone(musicBus, t, { type: 'sine', f: 120, f2: 40, dur: 0.12, vol: 0.5 });
      }
      t += step; i++;
    }
  }, 60);
  return () => clearInterval(id);
}

function stopMusic() {
  if (seq) { seq(); seq = null; }
  if (src) { fadeOut(src); src = null; }
  clearTimeout(nextAt); tok++;
  playing = null;
}
// 換背景音樂：'title' 首頁／'floor' 一般關卡／'boss' 魔王關；同一首不會重頭播
function bgm(name) {
  if (name === playing) return;
  if (!unlocked) { want = name; return; }
  stopMusic();
  playing = name;
  if (!name) return;
  if (FILES[name]) {
    const list = [].concat(FILES[name]), my = tok;
    pos[name] = pos[name] === undefined ? Math.floor(Math.random() * list.length) : (pos[name] + 1) % list.length;
    playFile(name, list, my);
  } else seq = startSeq(name);
}
// 用 WebAudio 解碼後播放，循環接縫不會有空白；檔案抓不到就改用晶片曲
function load(url) {
  if (!buffers[url]) buffers[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((a) => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no)))
    .catch((e) => { delete buffers[url]; throw e; });
  return buffers[url];
}
function fadeOut(s) { const t = ctx.currentTime; s.gn.gain.setTargetAtTime(0, t, 0.4); s.stop(t + 2.5); }
function playFile(name, list, my) {
  const url = list[pos[name]];
  load(url).then((buf) => {
    if (tok !== my) return;
    const s = ctx.createBufferSource(), gn = ctx.createGain(), t = ctx.currentTime;
    s.buffer = buf; s.loop = list.length === 1; s.gn = gn;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(1, t + 0.8);
    s.connect(gn); gn.connect(fileBus); s.start(t);
    if (src) fadeOut(src);
    src = s;
    if (list.length > 1) {
      // 歌單：快播完時先把下一首載好，最後 1.5 秒交叉淡入
      load(list[(pos[name] + 1) % list.length]).catch(() => {});
      // 用音訊時鐘算剩多少（切到背景時聲音會暫停，計時器卻還在跑）
      const next = () => {
        if (tok !== my || src !== s) return;
        const left = buf.duration - (ctx.currentTime - t) - 1.5;
        if (left > 0.2) { nextAt = setTimeout(next, left * 1000); return; }
        pos[name] = (pos[name] + 1) % list.length; playFile(name, list, my);
      };
      nextAt = setTimeout(next, Math.max(1000, (buf.duration - 1.5) * 1000));
    }
  }).catch(() => { if (tok === my && !seq && !src) seq = startSeq(name); });
}

function setMute(m) {
  pref.mute = m;
  try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* 私密模式 */ }
  if (master) master.gain.value = m ? 0 : 1;
  for (const b of document.querySelectorAll('.sound')) b.textContent = m ? '🔇' : '🔊';
}
// 有 class="sound" 的按鈕都是靜音開關
function bindButtons() {
  for (const b of document.querySelectorAll('.sound')) {
    b.textContent = pref.mute ? '🔇' : '🔊';
    b.onclick = () => { unlock(); setMute(!pref.mute); };
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons); else bindButtons();

return { sfx, bgm, setMute, get muted() { return pref.mute; } };
})();
