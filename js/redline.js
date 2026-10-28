'use strict';
// 一筆紅線戰鬥模組：主遊戲（index.html）和試玩頁（redline.html）共用。Redline.start(設定) 開打一層。
const Redline = (() => {
// 一筆紅線：神魔輪流上場。輪到誰，就選他的一招，再照那招的畫法在戰場上畫：
// 直線（從自己身上拉出一刀）、自由線（一筆穿過好幾個目標）、圈（圈住的目標都中）。
// 戰場座標 600×700；畫面只顯示 VIEW_Y 以下（上面那段牆沒有人站，裁掉讓手機一個畫面放得下）
const W = 600, H = 700, FLOOR = 230, VIEW_Y = 160;
const cv = document.querySelector('.stage'), g = cv.getContext('2d');
// 戰場跟著剩下的空間縮放，整個戰鬥畫面不用捲動
function fitStage() {
  const r = cv.parentElement.getBoundingClientRect(); if (!r.width || !r.height) return;
  const k = Math.min(r.width / 600, r.height / 540);
  cv.style.width = Math.floor(600 * k) + 'px'; cv.style.height = Math.floor(540 * k) + 'px';
}
if (window.ResizeObserver) new ResizeObserver(fitStage).observe(cv.parentElement);
const $ = (s) => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 音效（js/audio.js）；試玩頁沒載入聲音就不出聲
const sfx = (n) => { if (typeof Snd !== 'undefined') Snd.sfx(n); };
// gen：第幾場。換場（重新 start）之後，上一場還在等的動作就永遠不會繼續，不會跑進新的一場
let gen = 0;
const wait = (ms) => { const my = gen; return new Promise((r) => setTimeout(() => { if (my === gen) r(); }, ms)); };
const HIT_R = 42;

const SHAPES = { line: '直線', dash: '衝刺', free: '自由線', zigzag: '折線', circle: '畫圈', tap: '連點' };
const HOW = {
  line: '從<b>自己身上</b>往想打的方向拉一條直線，線上的敵人都會中。',
  dash: '從<b>自己身上</b>往敵人拉直線，會<b>衝到第一個敵人面前</b>砍下去。距離很短，要站得夠近。',
  free: '從<b>自己身上</b>開始，<b>一筆</b>畫過想打的目標，經過的順序有編號。同一個敵人穿過兩次就打兩下。',
  zigzag: '從<b>自己身上</b>開始一筆畫，每<b>穿過</b>敵人一次算過一關，<b>在敵人身上轉彎</b>再多一關，關數越多越痛。',
  circle: '在戰場上<b>畫一個圈</b>，頭尾接起來，圈住的目標都會中。',
  tap: '依序<b>點</b>想串起來的目標，紅線會在他們之間彈過去。',
};
// 每位神魔固定：3 個主動招（普通、冷卻 1、大招冷卻 3）＋ 1 個被動（核心玩法）＋ 1 個天賦（隊友的線穿過他時發動）
// 每招：shape 畫法、len 墨水長度、cd 冷卻、melee 近身（神魔自己跑過去打；沒有的話站著放，招式飛過去）、run 算出每個目標的效果
// 角色欄位：faith 神／魔、hp 生命、res 自己的資源 [名字, 上限]、onHit 每打中一下、mod 改這一招的效果（只算不改狀態）、
// talent 天賦發動（ctx.h 畫線的人、ctx.en 那條線打到的敵人、ctx.later 出招跑完後再做）、round 每輪開始
const firstEnemy = (en) => en.slice(0, 1);
const addRes = (h, n) => { const R = HEROES[h.id] && HEROES[h.id].res; if (!R || !n) return; const v = Math.max(0, Math.min(h.cap || R[1], h.res + n)); if (v !== h.res) { h.res = v; float(h, `${R[0]} ${v}`, h.color, 18); } };
const HEROES = {
  guangong: {
    name: '關公', faith: '神', hp: 52, color: '#40d070', role: '近戰重擊', res: ['氣勢', 5],
    passive: { n: '氣勢', d: '關公每打中敵人一下，氣勢 +1（最多 5，頭上顯示「氣」），一整世累積。放偃月斬時用掉全部氣勢，每 1 點氣勢讓每一下多 4 傷害。' },
    talent: { n: '溫酒斬華雄', d: '隊友的線穿過關公（或穿過關公這回合留下的線），關公下一招每一下傷害 +5、氣勢 +1。' },
    onHit: (h) => addRes(h, 1),
    talentFx: (t) => { t.wine = 5; addRes(t, 1); },
    skills: [
      { name: '青龍突刺', shape: 'dash', len: 300, melee: true, anim: 's1', desc: '衝到第一個敵人面前刺 9 傷害，目標生命不到一半改成 14。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: u.hp < u.maxHp / 2 ? 14 : 9 })) },
      { name: '過關斬將', xc: { d: '多過一關（接著算傷害），打在最後一個敵人身上', fx: (res, n, h, en) => { const t = en.slice(0, 5); const u = t[t.length - 1]; if (!u) return res; return [...res, ...Array.from({ length: n }, (_, i) => ({ u, dmg: 5 + (t.length + i) * 3 + run.up.dmg + (h.wine || 0) }))]; } }, shape: 'zigzag', len: 900, cd: 1, melee: true, anim: 's2', desc: '每穿過敵人一次過一關，在敵人身上轉彎再多一關，最多 5 關，傷害 5、8、11、14、17。',
        run: (en) => en.slice(0, 5).map((u, i) => ({ u, dmg: 5 + i * 3 })) },
      { name: '偃月斬', shape: 'line', len: 560, cd: 3, anim: 'ult', spendRes: true, desc: '揮出一道刀氣，直線上的敵人各受 12 傷害，每點氣勢多 4，用掉全部氣勢。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 12 + 4 * h.res })) },
    ],
  },
  yuelao: {
    name: '月老', faith: '神', hp: 40, color: '#ff5c8d', role: '牽線支援',
    passive: { n: '紅線', d: '月老打到的敵人綁上紅線（到下一輪）。綁紅線的敵人受傷，其他綁紅線的敵人也受一半。' },
    talent: { n: '向月檢書', d: '隊友的線穿過月老（或穿過月老這回合留下的線），月老回 6 生命，那條線打到的敵人全部綁紅線。' },
    talentFx: (t, c) => { apply({ u: t, heal: 6 }); for (const e of c.en) e.red = true; },
    skills: [
      { name: '赤繩牽緣', xc: { d: '全隊各回 3 生命', fx: (res, n) => [...res, ...heroes.filter((u) => !u.dead).map((u) => ({ u, heal: 3 * n }))] }, shape: 'free', len: 820, anim: 'cast', desc: '紅繩飛過去：經過的敵人各受 5 傷害並綁紅線，經過的隊友各回 6 生命。',
        run: (en, al) => [...en.map((u) => ({ u, dmg: 5, red: true })), ...al.map((u) => ({ u, heal: 6 }))] },
      { name: '千里一線', shape: 'tap', max: 4, any: true, len: 1, cd: 1, anim: 'cast', desc: '依序點最多 4 個目標串起來：敵人各受 4 傷害並綁紅線，隊友各得 6 護盾。',
        run: (en, al) => [...en.map((u) => ({ u, dmg: 4, red: true })), ...al.map((u) => ({ u, shield: 6 }))] },
      { name: '亂點鴛鴦', shape: 'free', len: 900, cd: 3, anim: 'ult', desc: '經過的敵人被配錯姻緣：下次行動改打自己的同伴，各受 6 傷害並綁紅線。',
        run: (en) => en.map((u) => ({ u, dmg: 6, confuse: true, red: true })) },
    ],
  },
  yukionna: {
    name: '雪女', faith: '魔', hp: 36, color: '#a0e0ff', role: '冰凍控制',
    passive: { n: '冰霜', d: '打中疊冰霜，疊到 3 層就凍住（下次不能行動）。每輪少 1 層。打凍住的敵人叫碎冰。' },
    talent: { n: '雪地足跡', d: '隊友的線穿過雪女（或穿過雪女這回合留下的線），那條線結成雪地，敵人走過去打人時疊 2 層冰霜。' },
    talentFx: (t, c) => c.later(() => { if (path.length > 1) zones.push({ type: 'snow', pts: densify(path, 10).map((p) => ({ x: p.x, y: p.y + 46 })), done: new Set() }); }),
    skills: [
      { name: '冰柱', xc: { d: '每個敵人多疊 1 層冰霜', fx: (res, n) => res.map((s) => (s.frost ? { ...s, frost: s.frost + n } : s)) }, shape: 'line', len: 540, anim: 's1', desc: '射出冰柱：直線上的敵人各受 8 傷害、冰霜 1 層。凍住的敵人改成碎冰 16 傷害，但會解凍。',
        run: (en) => en.map((u) => (u.frozen ? { u, dmg: 16, thaw: true } : { u, dmg: 8, frost: 1 })) },
      { name: '暴風雪', shape: 'circle', len: 640, cd: 1, anim: 's2', desc: '圈住的敵人各受 4 傷害、冰霜 2 層。',
        run: (en) => en.map((u) => ({ u, dmg: 4, frost: 2 })) },
      { name: '雪夜冰封', shape: 'free', len: 1000, cd: 3, anim: 'ult', desc: '暴風雪沿著線吹過去：經過的敵人全部凍住，各受 10 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 10, freeze: true })) },
    ],
  },
  brigid: {
    name: '布麗姬', faith: '神', hp: 44, color: '#ff8a30', role: '聖火與療癒',
    passive: { n: '永恆之火', d: '布麗姬打中燃燒中的敵人，那一下傷害 +4。燃燒的敵人每輪開始受 3 傷害，燒完就熄。' },
    talent: { n: '布麗姬十字', d: '隊友的線穿過布麗姬（或穿過她這回合留下的線），那條線打到的敵人全部燃燒 2 輪。' },
    mod: (h, s) => (s.dmg && s.u.burn ? { ...s, dmg: s.dmg + 4 } : s),
    talentFx: (t, c) => { for (const e of c.en) addBurn(e, 2); },
    skills: [
      { name: '聖火之路', xc: { d: '燃燒多 1 輪', fx: (res, n) => res.map((s) => (s.burn ? { ...s, burn: s.burn + n } : s)) }, shape: 'free', len: 800, anim: 's2', desc: '聖火沿著線燒過去：經過的敵人各受 5 傷害、燃燒 2 輪。',
        run: (en) => en.map((u) => ({ u, dmg: 5, burn: 2 })) },
      { name: '鍛鐵之盾', shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '圈住的隊友各得 8 護盾，圈住的敵人各受 4 傷害。',
        run: (en, al) => [...al.map((u) => ({ u, shield: 8 })), ...en.map((u) => ({ u, dmg: 4 }))] },
      { name: '火之聖詩', shape: 'tap', max: 3, any: true, len: 1, cd: 3, anim: 'ult', desc: '點最多 3 個目標唱詩：隊友回 12 生命，敵人受 8 傷害、燃燒 3 輪。',
        run: (en, al) => [...al.map((u) => ({ u, heal: 12 })), ...en.map((u) => ({ u, dmg: 8, burn: 3 }))] },
    ],
  },
  tudigong: {
    name: '土地公', faith: '神', hp: 54, color: '#ffc830', role: '守護與元寶', res: ['元寶', 5],
    passive: { n: '元寶', d: '土地公每打中敵人一下，元寶 +1（最多 5，頭上顯示「元」），一整世累積。土地神威會用掉全部元寶，每個多 3 傷害。' },
    talent: { n: '虎爺', d: '隊友的線穿過土地公（或穿過他這回合留下的線），虎爺跳出來咬那條線打到的第一個敵人 8 傷害。' },
    onHit: (h) => addRes(h, 1),
    talentFx: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => { float(e, '虎爺！', '#ffc830', 18); apply({ u: e, dmg: 8, shared: true }); }, 200); },
    skills: [
      { name: '金光巡境', xc: { d: '元寶 +1', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'free', len: 760, anim: 's2', desc: '拐杖指路，金光沿線巡過去：經過的敵人各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '福德庇護', shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '圈住的隊友各得 9 護盾；圈到幾位隊友，元寶就加幾個。',
        run: (en, al, h) => [...al.map((u) => ({ u, shield: 9 })), ...(al.length ? [{ u: h, res: al.filter((u) => u !== h).length || 1 }] : [])] },
      { name: '土地神威', shape: 'line', len: 600, cd: 3, anim: 'ult', spendRes: true, desc: '土地公生前的真身現身：直線上的敵人各受 12 傷害，每個元寶多 3，用掉全部元寶。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 12 + 3 * h.res })) },
    ],
  },
  hermes: {
    name: '赫爾墨斯', faith: '神', hp: 40, color: '#f0d070', role: '神速遊走', ink: 1.4, noCut: true,
    passive: { n: '有翼涼鞋', d: '赫爾墨斯的墨水多 40%，畫的線不會被典獄長的鎖鏈剪斷。' },
    talent: { n: '引魂者', d: '隊友的線穿過赫爾墨斯（或穿過他這回合留下的線），那條線打到、生命不到兩成的敵人直接被帶走（精英除外）。' },
    talentFx: (t, c) => { for (const e of c.en) if (!e.elite && e.hp <= e.maxHp * 0.2) apply({ u: e, execute: '引魂' }); },
    skills: [
      { name: '疾風神行', xc: { d: '每一下 +2 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 2 * n } : s)) }, shape: 'free', len: 900, melee: true, anim: 's2', desc: '飛奔穿過去：經過的敵人各受 4 傷害，同一個敵人每多穿一次再 +2。',
        run: (en) => { const n = new Map(); return en.map((u) => { const k = n.get(u) || 0; n.set(u, k + 1); return { u, dmg: 4 + 2 * k }; }); } },
      { name: '神偷突襲', shape: 'dash', len: 340, cd: 1, melee: true, anim: 's1', desc: '衝到第一個敵人面前偷襲 7 傷害，順手偷走他的力氣：他下次攻擊減半（恐懼）。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 7, fear: true })) },
      { name: '疾影連斬', shape: 'zigzag', len: 1000, cd: 3, melee: true, anim: 'ult', desc: '吹笛讓阿耳戈斯睡著再斬：每過一關 9 傷害，最多 5 關。',
        run: (en) => en.slice(0, 5).map((u) => ({ u, dmg: 9 })) },
    ],
  },
  dagda: {
    name: '達格達', faith: '神', hp: 60, color: '#d8a060', role: '巨棒與大鍋', res: ['飽足', 20],
    passive: { n: '飽足', d: '達格達回血超過生命上限的部分存成飽足（最多 20，頭上顯示「飽」），一整世累積。巨棒橫掃會用掉全部飽足，每點多 1 傷害。' },
    talent: { n: '豐饒之鍋', d: '隊友的線穿過達格達（或穿過他這回合留下的線），畫線的那位隊友回 8 生命。' },
    talentFx: (t, c) => apply({ u: c.h, heal: 8 }),
    skills: [
      { name: '巨棒橫掃', shape: 'line', len: 380, melee: true, wide: true, anim: 's2', spendRes: true, desc: '扛著巨棒衝過去橫掃（判定特別寬）：直線上的敵人各受 9 傷害，用掉全部飽足，每點多 1。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 9 + h.res })) },
      { name: '豐收之歌', xc: { d: '每位隊友多回 4 生命', fx: (res, n) => res.map((s) => (s.heal ? { ...s, heal: s.heal + 4 * n } : s)) }, shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '彈奏豐收之歌：圈住的隊友各回 10 生命（達格達自己回滿的部分變飽足）。',
        run: (en, al) => al.map((u) => ({ u, heal: 10 })) },
      { name: '生死一擊', shape: 'dash', len: 320, cd: 3, melee: true, anim: 'ult', desc: '巨棒一端殺人一端救人：衝去砸第一個敵人 26 傷害；打倒的話全隊回 8 生命。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 26, killHeal: 8 })) },
    ],
  },
  hanako: {
    name: '花子', faith: '魔', hp: 42, color: '#b060e0', role: '恐懼與敲門', res: ['敲門', 3],
    passive: { n: '敲門', d: '花子每打中敵人一下就敲一次門（頭上顯示「敲」）。敲門次數到下一層也接著數。敲滿 3 次，那一下把敵人拉進隔間，多 12 傷害，然後重新數。' },
    talent: { n: '沖水', d: '隊友的線穿過花子（或穿過她這回合留下的線），那條線打到的敵人全部恐懼（下次攻擊減半）。' },
    // 照順序數敲門，數到 3 的那一下多 12（預覽和出招用同一套算法）
    post: (h, res) => { let r = h.res; return res.map((s) => { if (!s.dmg || s.u.side !== 'enemy' || s.cross) return s; r++; if (r < (h.cap || 3)) return s; r = 0; return { ...s, dmg: s.dmg + (h.pullDmg || 12), pull: true }; }); },
    onHit: (h, s) => { if (s.pull) { h.res = 0; float(s.u, '拉進隔間！', '#b060e0'); } else addRes(h, 1); },
    talentFx: (t, c) => { for (const e of c.en) e.fear = true; },
    skills: [
      { name: '叩門三響', shape: 'tap', max: 3, len: 1, anim: 's1', desc: '點最多 3 個敵人，各敲一下門：各受 4 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 4 })) },
      { name: '誰在門後', xc: { d: '多敲一次門', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'circle', len: 700, cd: 1, anim: 's2', desc: '圈住的敵人各受 3 傷害並恐懼（下次攻擊減半）。',
        run: (en) => en.map((u) => ({ u, dmg: 3, fear: true })) },
      { name: '血色紅裙', shape: 'free', len: 900, cd: 3, anim: 'ult', desc: '血色紅裙捲過去：經過的敵人各受 8 傷害，恐懼中的改受 16。',
        run: (en) => en.map((u) => ({ u, dmg: u.fear ? 16 : 8 })) },
    ],
  },
  anubis: {
    name: '阿努比斯', faith: '魔', hp: 48, color: '#f0c040', role: '冥界審判',
    passive: { n: '天秤', d: '阿努比斯打生命比例比自己低的敵人，傷害加五成。' },
    talent: { n: '木乃伊包紮', d: '隊友的線穿過阿努比斯（或穿過他這回合留下的線），畫線的那位隊友得 8 護盾。' },
    mod: (h, s) => (s.dmg && s.u.side === 'enemy' && !s.cross && s.u.hp / s.u.maxHp < h.hp / h.maxHp ? { ...s, dmg: Math.round(s.dmg * (h.scale || 1.5)) } : s),
    talentFx: (t, c) => apply({ u: c.h, shield: 8 }),
    skills: [
      { name: '胡狼突擊', shape: 'dash', len: 320, melee: true, anim: 's1', desc: '衝去用權杖重擊第一個敵人 9 傷害。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 9 })) },
      { name: '冥界詛咒', xc: { d: '每一下 +3 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 3 * n } : s)) }, shape: 'line', len: 560, cd: 1, anim: 's2', desc: '直線上的敵人各受 5 傷害並恐懼（下次攻擊減半）。',
        run: (en) => en.map((u) => ({ u, dmg: 5, fear: true })) },
      { name: '靈魂吞噬', shape: 'dash', len: 360, cd: 3, melee: true, anim: 'ult', desc: '衝向第一個敵人：生命不到三成的一般敵人直接被吞掉、阿努比斯回 10；其他的受 20 傷害。',
        run: (en, al, h) => firstEnemy(en).flatMap((u) => (!u.elite && u.hp < u.maxHp * 0.3 ? [{ u, execute: '吞掉' }, { u: h, heal: 10 }] : [{ u, dmg: 20 }])) },
    ],
  },
  hachi: {
    name: '八尺大人', faith: '魔', hp: 46, color: '#e8e8ff', role: '恐懼與標記',
    passive: { n: '七日之期', d: '八尺大人打到的敵人被標記（頭上顯示「標」），整層都在。被標記的敵人受到每一下攻擊都 +2，誰打都算。' },
    talent: { n: '帽簷下的視線', d: '隊友的線穿過八尺大人（或穿過她這回合留下的線），那條線打到的敵人全部被標記。' },
    onHit: (h, s) => { s.u.mark = true; },
    talentFx: (t, c) => { for (const e of c.en) e.mark = true; },
    skills: [
      { name: '波波怪聲', xc: { d: '每個敵人再多「波」一下（3 傷害）', fx: (res, n, h, en) => [...res, ...[...new Set(en)].flatMap((u) => Array.from({ length: n }, () => ({ u, dmg: 3 })))] }, shape: 'line', len: 560, anim: 's1', desc: '低沉的「波、波、波」：直線上的敵人各受 6 傷害並恐懼。',
        run: (en) => en.map((u) => ({ u, dmg: 6, fear: true })) },
      { name: '白影籠罩', shape: 'circle', len: 700, cd: 1, anim: 's2', desc: '圈住的隊友各得 7 護盾，圈住的敵人各受 2 傷害並恐懼。',
        run: (en, al) => [...al.map((u) => ({ u, shield: 7 })), ...en.map((u) => ({ u, dmg: 2, fear: true }))] },
      { name: '致命凝視', shape: 'tap', max: 2, len: 1, cd: 3, anim: 'ult', desc: '盯上最多 2 個敵人：各受 18 傷害，恐懼中的改成 28。',
        run: (en) => en.map((u) => ({ u, dmg: u.fear ? 28 : 18 })) },
    ],
  },
  medusa: {
    name: '美杜莎', faith: '魔', hp: 44, color: '#70d060', role: '石化',
    passive: { n: '石化', d: '美杜莎每打中敵人一下疊 1 層石化（頭上顯示「石」），疊到 3 層變成石像，下次不能行動。' },
    talent: { n: '蛇毒', d: '隊友的線穿過美杜莎（或穿過她這回合留下的線），那條線打到的敵人各疊 1 層石化。' },
    onHit: (h, s) => addStone(s.u, 1),
    talentFx: (t, c) => { for (const e of c.en) addStone(e, 1); },
    skills: [
      { name: '萬蛇噬咬', shape: 'free', len: 760, melee: true, anim: 's2', desc: '蛇髮一路咬過去：經過的敵人各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '石化凝視', xc: { d: '每個敵人多疊 1 層石化', fx: (res, n) => res.map((s) => (s.stone ? { ...s, stone: s.stone + n } : s)) }, shape: 'line', len: 600, cd: 1, anim: 's1', desc: '直線上的敵人各受 4 傷害、多疊 1 層石化。',
        run: (en) => en.map((u) => ({ u, dmg: 4, stone: 1 })) },
      { name: '石像崩碎', shape: 'circle', len: 700, cd: 3, anim: 'ult', desc: '圈住的敵人各受 6 傷害、多疊 2 層石化；已經是石像的直接碎掉，改受 20。',
        run: (en) => en.map((u) => (u.stun ? { u, dmg: 20, unstun: true } : { u, dmg: 6, stone: 2 })) },
    ],
  },
  horusshadow: {
    name: '荷魯斯之影', faith: '魔', hp: 46, color: '#e0b850', role: '暗影與碎片', res: ['眼之碎片', 6],
    passive: { n: '眼之碎片', d: '戰場上會掉出眼之碎片（金色小眼睛），任何人畫的線經過就撿起來給荷魯斯之影（最多 6，頭上顯示「眼」，一整世累積）。天空審判會用掉全部碎片，集滿 6 片傷害加倍。' },
    talent: { n: '真知之眼', d: '隊友的線穿過荷魯斯之影（或穿過他這回合留下的線），眼之碎片 +2。' },
    talentFx: (t) => addRes(t, 2),
    skills: [
      { name: '鷹眼金光', xc: { d: '眼之碎片 +1', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'line', len: 600, anim: 'punch', desc: '權杖射出金光：直線上的敵人各受 7 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 7 })) },
      { name: '暗影之瞳', shape: 'tap', max: 3, len: 1, cd: 1, anim: 'cast', desc: '點最多 3 個敵人，面具上的眼睛放出暗影：各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '天空審判', shape: 'circle', len: 700, cd: 3, anim: 'cast', spendRes: true, desc: '圈住的敵人各受 10 傷害，每片碎片多 2；集滿 6 片再加倍。用掉全部碎片。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: (10 + 2 * h.res) * (h.res >= (h.cap || 6) ? 2 : 1) })) },
    ],
  },
  redgirl: {
    name: '紅衣小女孩', faith: '魔', hp: 44, color: '#ff4050', role: '迷途',
    passive: { n: '迷途', d: '紅衣小女孩每打中敵人一下疊 1 層迷途（頭上顯示「迷」），疊到 5 層敵人就迷路：下次行動改打自己的同伴。' },
    talent: { n: '跟我走', d: '隊友的線穿過紅衣小女孩（或穿過她這回合留下的線），那條線打到的敵人各疊 1 層迷途。' },
    onHit: (h, s) => addLost(s.u, 1),
    talentFx: (t, c) => { for (const e of c.en) addLost(e, 1); },
    skills: [
      { name: '冰冷小手', shape: 'dash', len: 320, melee: true, anim: 'punch', desc: '撲到第一個敵人面前抓住他：6 傷害、多疊 2 層迷途。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 6, lost: 2 })) },
      { name: '紅霧迷蹤', xc: { d: '每個敵人多疊 1 層迷途', fx: (res, n) => res.map((s) => (s.lost ? { ...s, lost: s.lost + n } : s)) }, shape: 'circle', len: 700, cd: 1, anim: 'cast', desc: '召出紅色山霧：圈住的敵人各受 3 傷害、多疊 1 層迷途。',
        run: (en) => en.map((u) => ({ u, dmg: 3, lost: 1 })) },
      { name: '鬼打牆', shape: 'free', len: 1000, cd: 3, anim: 'cast', desc: '把敵人帶進深山：經過的敵人各受 5 傷害、多疊 2 層迷途；已經迷路的再多受 10。',
        run: (en) => en.map((u) => ({ u, dmg: u.confused ? 15 : 5, lost: 2 })) },
    ],
  },
  // ───── 第二批：孫悟空、后羿、媽祖、閻羅王、口裂女 ─────
  wukong: {
    name: '孫悟空', faith: '神', hp: 48, color: '#ffc040', role: '分身連打', res: ['毫毛', 3],
    passive: { n: '七十二變', d: '孫悟空打倒一個敵人，毫毛 +1（最多 3，頭上顯示「毫」），一整世累積。每根毫毛變一隻分身：悟空每一招打完，分身跟著打第一個敵人 3 傷害。' },
    talent: { n: '火眼金睛', d: '隊友的線穿過孫悟空（或穿過他這回合留下的線），那條線打到的敵人現出原形：到下一輪為止，受到每一下攻擊 +3。' },
    onKill: (h) => addRes(h, 1),
    post: (h, res) => { const u = (res.find((s) => s.dmg && s.u.side === 'enemy') || {}).u; return u && !skill().spendRes && h.res ? [...res, ...Array.from({ length: h.res }, () => ({ u, dmg: 3, clone: true }))] : res; },
    talentFx: (t, c) => { for (const e of c.en) if (!e.dead) { e.exposed = true; float(e, '現出原形', '#ffc040', 18); } },
    skills: [
      { name: '金箍橫掃', xc: { d: '每一下 +2 傷害', fx: (res, n) => res.map((s) => (s.dmg && !s.clone ? { ...s, dmg: s.dmg + 2 * n } : s)) }, shape: 'line', len: 420, melee: true, anim: 's1', desc: '扛著金箍棒衝過去橫掃：直線上的敵人各受 8 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 8 })) },
      { name: '筋斗雲', shape: 'zigzag', len: 1000, cd: 1, melee: true, anim: 's2', desc: '一個筋斗十萬八千里：每穿過敵人一次過一關，在敵人身上轉彎再多一關，最多 6 關，傷害 6、8、10、12、14、16。',
        run: (en) => en.slice(0, 6).map((u, i) => ({ u, dmg: 6 + 2 * i })) },
      { name: '大鬧天宮', shape: 'free', len: 1000, cd: 3, melee: true, anim: 'ult', spendRes: true, desc: '一路打上凌霄寶殿：經過的敵人各受 10 傷害；每根毫毛變一隻分身，沿同一條線再打一次（每下 5），用掉全部毫毛。',
        run: (en, al, h) => [...en.map((u) => ({ u, dmg: 10 })), ...Array.from({ length: h.res }, () => en.map((u) => ({ u, dmg: 5 }))).flat()] },
    ],
  },
  houyi: {
    name: '后羿', faith: '神', hp: 44, color: '#ff8040', role: '神射手', res: ['落日', 9],
    passive: { n: '神射', d: '后羿打倒一個敵人，落日 +1（最多 9，頭上顯示「落」），一整世累積。后羿的直線招，線上最後一個敵人多受 4 傷害。九日墜落會用掉全部落日。' },
    talent: { n: '張弓', d: '隊友的線穿過后羿（或穿過他這回合留下的線），后羿立刻朝那條線打到的第一個敵人補一箭，7 傷害。' },
    onKill: (h) => addRes(h, 1),
    post: (h, res) => { if (!lineShape(skill())) return res; let k = -1; res.forEach((s, i) => { if (s.dmg && s.u.side === 'enemy') k = i; }); return res.map((s, i) => (i === k ? { ...s, dmg: s.dmg + (h.lastBonus || 4) } : s)); },
    talentFx: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => { float(e, '補一箭', '#ff8040', 18); apply({ u: e, dmg: 7, shared: true }); }, 200); },
    skills: [
      { name: '烈日之箭', xc: { d: '每一下 +2 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 2 * n } : s)) }, shape: 'line', len: 640, anim: 's1', desc: '一箭射出去：直線上的敵人各受 7 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 7 })) },
      { name: '連珠箭', shape: 'tap', max: 3, len: 1, cd: 1, anim: 's2', desc: '在凶水射殺九頭怪九嬰：點最多 3 個敵人，各中一箭 7 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 7 })) },
      { name: '九日墜落', shape: 'line', len: 700, cd: 3, anim: 'ult', spendRes: true, desc: '十個太陽一起出來那年：射出「1＋落日數」支箭，輪流射向線上的敵人，每支 6 傷害，用掉全部落日。',
        run: (en, al, h) => { const t = [...new Set(en)]; return t.length ? Array.from({ length: 1 + h.res + (wears(h, 'ex_houyi') ? 2 : 0) }, (_, i) => ({ u: t[i % t.length], dmg: 6 })) : []; } },
    ],
  },
  mazu: {
    name: '媽祖', faith: '神', hp: 46, color: '#ff6a80', role: '護航與治療', res: ['香火', 6],
    passive: { n: '千里眼・順風耳', d: '媽祖治療一位隊友，香火 +1（最多 6，頭上顯示「香」），一整世累積。媽祖打到的敵人，他這次瞄準的那位隊友先得 4 護盾。' },
    talent: { n: '湄洲護航', d: '隊友的線穿過媽祖（或穿過她這回合留下的線），畫線的那位隊友得 6 護盾。' },
    onHit: (h, s) => { const t = s.u.intent && s.u.intent.target; if (t && !t.dead && t.side === 'ally') setTimeout(() => apply({ u: t, shield: 4 }), 150); },
    onHeal: (h) => addRes(h, 1),
    talentFx: (t, c) => apply({ u: c.h, shield: 6 }),
    skills: [
      { name: '慈航普渡', xc: { d: '每位隊友多回 3 生命', fx: (res, n) => res.map((s) => (s.heal ? { ...s, heal: s.heal + 3 * n } : s)) }, shape: 'free', len: 820, anim: 's1', desc: '把草拋進海裡化成大木救商船：經過的隊友各回 6 生命，經過的敵人各受 4 傷害。',
        run: (en, al) => [...al.map((u) => ({ u, heal: 6 })), ...en.map((u) => ({ u, dmg: 4 }))] },
      { name: '護身銅符', shape: 'tap', max: 2, any: true, len: 1, cd: 1, anim: 's2', desc: '少女時在井邊得到的銅符：點最多 2 個目標，隊友各得 8 護盾，敵人各受 6 傷害並恐懼（下次攻擊減半）。',
        run: (en, al) => [...al.map((u) => ({ u, shield: 8 })), ...en.map((u) => ({ u, dmg: 6, fear: true }))] },
      { name: '海神顯聖', shape: 'circle', len: 700, cd: 3, anim: 'ult', spendRes: true, desc: '海上顯靈：全隊各回 10 生命，每點香火多回 3；圈住的敵人被海浪打 8。用掉全部香火。',
        run: (en, al, h) => [...heroes.filter((u) => !u.dead).map((u) => ({ u, heal: 10 + 3 * h.res })), ...en.map((u) => ({ u, dmg: 8 }))] },
    ],
  },
  yama: {
    name: '閻羅王', faith: '魔', hp: 50, color: '#8a70ff', role: '生死簿', res: ['陰德', 10],
    passive: { n: '生死簿', d: '閻羅王打到的敵人寫上名字（頭上顯示「名」），整層都在；寫上名字的一般敵人生命掉到兩成以下直接勾銷。任何敵人倒下，陰德 +1（最多 10，頭上顯示「陰」），一整世累積。' },
    talent: { n: '牛頭馬面', d: '隊友的線穿過閻羅王（或穿過他這回合留下的線），牛頭馬面鎖住那條線打到的第一個敵人，下次不能行動（精英改受 10 傷害）。' },
    onHit: (h, s) => { const u = s.u; u.book = true; setTimeout(() => { if (!u.dead && !u.elite && u.hp <= u.maxHp * bookAt(h)) { apply({ u, execute: '勾銷' }); if (wears(h, 'ex_yama')) for (const a of heroes) if (!a.dead) apply({ u: a, heal: 4 }); } }, 260); },
    onAnyKill: (h) => addRes(h, 1),
    talentFx: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => { float(e, '牛頭馬面', '#8a70ff', 18); apply(e.elite ? { u: e, dmg: 10, shared: true } : { u: e, sleep: '被鎖住' }); }, 200); },
    skills: [
      { name: '判官硃筆', xc: { d: '每一下 +2 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 2 * n } : s)) }, shape: 'free', len: 800, anim: 's1', desc: '判官筆一路勾過去：經過的敵人各受 5 傷害，全部寫上名字。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '閻羅審判', shape: 'tap', max: 1, len: 1, cd: 1, anim: 's2', desc: '點一個敵人拉上十殿受審：10 傷害；已經寫上名字的改受 18。',
        run: (en) => en.map((u) => ({ u, dmg: u.book ? 18 : 10 })) },
      { name: '索命勾魂', shape: 'circle', len: 700, cd: 3, anim: 'ult', spendRes: true, desc: '圈住的敵人各受 10 傷害；寫上名字的一般敵人，生命低於「兩成＋每點陰德 3%」直接勾魂。用掉全部陰德。',
        run: (en, al, h) => en.map((u) => (!u.elite && u.book && u.hp <= u.maxHp * (bookAt(h) + 0.03 * h.res) ? { u, execute: '勾魂' } : { u, dmg: 10 })) },
    ],
  },
  kuchisake: {
    name: '口裂女', faith: '魔', hp: 44, color: '#f06070', role: '恐懼與追殺', res: ['提問', 3],
    passive: { n: '我漂亮嗎？', d: '每輪開始，口裂女問離她最近的敵人一次，那個敵人恐懼（下次攻擊減半）。她打中恐懼中的敵人，提問 +1（最多 3，頭上顯示「提」），一整世累積。' },
    talent: { n: '鼈甲糖', d: '隊友的線穿過口裂女（或穿過她這回合留下的線），她追著那條線剪一刀：打到的敵人各受 4 傷害，提問 +1。' },
    onHit: (h, s) => { if (s.u.fear) addRes(h, 1); },
    round: (h) => { if (h.dead) return; const near = foes.filter((e) => !e.dead).sort((a, b) => dist(a, h) - dist(b, h)).slice(0, h.askN || 1); for (const e of near) { e.fear = true; float(e, '我漂亮嗎？', '#f06070', 18); } },
    talentFx: (t, c) => { for (const e of c.en) setTimeout(() => apply({ u: e, dmg: 4, shared: true }), 200); if (c.en.length) addRes(t, 1); },
    skills: [
      { name: '利剪突襲', shape: 'dash', len: 320, melee: true, anim: 's1', desc: '衝到第一個敵人面前剪一刀：10 傷害，恐懼中的改成 15。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: u.fear ? 15 : 10 })) },
      { name: '百米狂奔', xc: { d: '提問 +1', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'zigzag', len: 900, cd: 1, melee: true, anim: 's2', desc: '來回狂奔：每穿過敵人一次過一關，最多 5 關，每關 6 傷害；在敵人身上每轉一次彎，提問 +1。',
        run: (en, al, h) => { const t = en.slice(0, 5), turn = t.length - new Set(t).size; return [...t.map((u) => ({ u, dmg: 6 })), ...(turn ? [{ u: h, res: turn }] : [])]; } },
      { name: '撕下口罩', shape: 'dash', len: 340, cd: 3, melee: true, anim: 'ult', spendRes: true, desc: '拉下口罩：剪第一個敵人 12 傷害，每點提問多 8，用掉全部提問。',
        run: (en, al, h) => firstEnemy(en).map((u) => ({ u, dmg: 12 + 8 * h.res })) },
    ],
  },
};
// ───── 升級成長 ─────
// Lv1 第一招＋被動、Lv2 第二招、Lv3 大招、Lv4 天賦、Lv7 第四招；Lv3/6/8 強化二選一（選了永久生效）
// 強化欄位：setup(h) 開打時改自己（招式已經複製一份，可以直接改）、mod(h, s, i) 改自己第 i 招打出的每一下、
// aura(s) 改全隊任何人打出的每一下、round(h) 每輪開始、talent(t, c) 天賦多做的事
const SKILL_LV = [1, 2, 3, 7], TALENT_LV = 4, PICK_LV = [3, 6, 8];
const atSk = (i, f) => (h, s, k) => (k === i ? f(s, h) : s);
const plus = (i, n) => atSk(i, (s) => (s.dmg && s.u.side === 'enemy' ? { ...s, dmg: s.dmg + n } : s));
const skSet = (i, f) => (h) => f(h.skills[i]);
const cdDown = (i) => skSet(i, (sk) => { sk.cd = Math.max(0, sk.cd - 1); });
const GROWTH = {
  guangong: {
    sk: { name: '水淹七軍', shape: 'circle', len: 700, cd: 2, anim: 's1', fx: 1, desc: '引漢水淹于禁七軍：圈住的敵人各受 6 傷害並恐懼（下次攻擊減半），圈到幾個敵人，氣勢就加幾點。',
      run: (en, al, h) => [...en.map((u) => ({ u, dmg: 6, fear: true })), ...(en.length ? [{ u: h, res: en.length }] : [])] },
    3: [{ n: '單刀赴會', d: '青龍突刺每一下 +3 傷害。', mod: plus(0, 3) },
        { n: '拖刀計', d: '每輪開始，氣勢 +1。', round: (h) => addRes(h, 1) }],
    6: [{ n: '千里走單騎', d: '過關斬將的墨水 +30%。', setup: skSet(1, (sk) => { sk.len = Math.round(sk.len * 1.3); }) },
        { n: '刮骨療毒', d: '每輪開始，關公回 4 生命。', round: (h) => apply({ u: h, heal: 4 }) }],
    8: [{ n: '武聖', d: '偃月斬每點氣勢多 6 傷害（原本 4）。', mod: atSk(2, (s, h) => (s.dmg ? { ...s, dmg: s.dmg + 2 * h.res } : s)) },
        { n: '赤兔馬', d: '氣勢上限變成 8。', setup: (h) => { h.cap = 8; } }],
  },
  yuelao: {
    sk: { name: '姻緣結', shape: 'circle', len: 700, cd: 2, anim: 'cast', fx: 1, desc: '韋固在定婚店遇見月下老人：圈住的敵人綁紅線，各受 4 傷害；已經綁紅線的改受 10。',
      run: (en) => en.map((u) => ({ u, dmg: u.red ? 10 : 4, red: true })) },
    3: [{ n: '赤繩子', d: '赤繩牽緣經過的隊友多回 4 生命。', mod: atSk(0, (s) => (s.heal ? { ...s, heal: s.heal + 4 } : s)) },
        { n: '月下翻書', d: '每輪開始，隨機一個敵人綁上紅線。', round: () => { const e = pick(foes.filter((x) => !x.dead && !x.noStatus)); if (e) { e.red = true; float(e, '紅線', '#ff5c8d', 18); } } }],
    6: [{ n: '天下有情人', d: '千里一線可以點 5 個目標。', setup: skSet(1, (sk) => { sk.max = 5; }) },
        { n: '姻緣簿', d: '亂點鴛鴦冷卻少 1 輪。', setup: cdDown(2) }],
    8: [{ n: '月老祠', d: '月老打綁紅線的敵人，每一下 +3 傷害。', mod: (h, s) => (s.dmg && s.u.side === 'enemy' && s.u.red ? { ...s, dmg: s.dmg + 3 } : s) },
        { n: '月下牽緣', d: '天賦發動時，全隊各得 5 護盾。', talent: () => { for (const u of heroes) if (!u.dead) apply({ u, shield: 5 }); } }],
  },
  yukionna: {
    sk: { name: '寒冰吐息', shape: 'dash', len: 320, cd: 2, melee: true, anim: 's1', fx: 0, desc: '像小泉八雲故事裡吹向茂作那樣：衝到第一個敵人面前吹一口白氣，12 傷害、冰霜 2 層。',
      run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 12, frost: 2 })) },
    3: [{ n: '碎冰', d: '冰柱打凍住的敵人改成 22 傷害（原本 16）。', mod: atSk(0, (s) => (s.thaw ? { ...s, dmg: s.dmg + 6 } : s)) },
        { n: '細雪', d: '暴風雪的墨水 +40%。', setup: skSet(1, (sk) => { sk.len = Math.round(sk.len * 1.4); }) }],
    6: [{ n: '永凍', d: '雪女打凍住的敵人，每一下 +4 傷害。', mod: (h, s) => (s.dmg && s.u.frozen ? { ...s, dmg: s.dmg + 4 } : s) },
        { n: '霜衣', d: '每輪開始，雪女得 6 護盾。', round: (h) => apply({ u: h, shield: 6 }) }],
    8: [{ n: '雪夜重逢', d: '雪夜冰封冷卻少 1 輪。', setup: cdDown(2) },
        { n: '巳之吉的誓言', d: '凍住的敵人受到任何隊友的攻擊，每一下 +3。', aura: (s) => (s.dmg && s.u.side === 'enemy' && s.u.frozen ? { ...s, dmg: s.dmg + 3 } : s) }],
  },
  brigid: {
    sk: { name: '聖泉淨化', shape: 'circle', len: 700, cd: 2, anim: 's1', fx: 1, desc: '基爾代爾聖井的水：圈住的隊友各回 8 生命；圈住燃燒中的敵人立刻燒完，受「剩下輪數 ×4」傷害，其他敵人受 2。',
      run: (en, al) => [...al.map((u) => ({ u, heal: 8 })), ...en.map((u) => (u.burn ? { u, dmg: 4 * u.burn, unburn: true } : { u, dmg: 2 }))] },
    3: [{ n: '聖火不滅', d: '燃燒每輪造成 5 傷害（原本 3），全隊都算。', setup: () => { run.burnDmg = 5; } },
        { n: '鐵砧', d: '鍛鐵之盾的護盾 +4。', mod: atSk(1, (s) => (s.shield ? { ...s, shield: s.shield + 4 } : s)) }],
    6: [{ n: '詩人的守護', d: '火之聖詩可以點 4 個目標。', setup: skSet(2, (sk) => { sk.max = 4; }) },
        { n: '火鍛', d: '永恆之火的加成變成 +7（原本 +4）。', mod: (h, s) => (s.dmg && s.u.burn ? { ...s, dmg: s.dmg + 3 } : s) }],
    8: [{ n: '聖布麗姬斗篷', d: '每輪開始，全隊各得 3 護盾。', round: () => { for (const u of heroes) if (!u.dead) apply({ u, shield: 3 }); } },
        { n: '三相合一', d: '聖火之路每一下 +2 傷害、燃燒多 1 輪。', mod: atSk(0, (s) => (s.dmg ? { ...s, dmg: s.dmg + 2, burn: (s.burn || 0) + 1 } : s)) }],
  },
  tudigong: {
    sk: { name: '招財進寶', shape: 'tap', max: 3, any: true, len: 1, cd: 2, anim: 's1', fx: 1, desc: '土地婆出來幫忙：點最多 3 個目標，隊友回 8 生命、敵人受 6 傷害，每點一個元寶 +1。',
      run: (en, al, h) => [...al.map((u) => ({ u, heal: 8 })), ...en.map((u) => ({ u, dmg: 6 })), ...(en.length + al.length ? [{ u: h, res: en.length + al.length }] : [])] },
    3: [{ n: '財神庇佑', d: '元寶上限變成 8。', setup: (h) => { h.cap = 8; } },
        { n: '龍頭拐杖', d: '金光巡境每一下 +2 傷害。', mod: plus(0, 2) }],
    6: [{ n: '虎爺出巡', d: '天賦的虎爺咬 14 傷害（原本 8）。', talent: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => apply({ u: e, dmg: 6, shared: true }), 320); } },
        { n: '安民', d: '福德庇護的護盾 +4。', mod: atSk(1, (s) => (s.shield ? { ...s, shield: s.shield + 4 } : s)) }],
    8: [{ n: '福德正神', d: '土地神威每個元寶多 5 傷害（原本 3）。', mod: atSk(2, (s, h) => (s.dmg ? { ...s, dmg: s.dmg + 2 * h.res } : s)) },
        { n: '地基主', d: '每輪開始，元寶 +1。', round: (h) => addRes(h, 1) }],
  },
  hermes: {
    sk: { name: '七弦催眠', shape: 'circle', len: 700, cd: 2, anim: 's1', fx: 1, desc: '用龜殼做的七弦琴彈一曲：圈住的敵人各受 3 傷害並睡著（下次不能行動）；精英和魔王不會睡著。',
      run: (en) => en.map((u) => ({ u, dmg: 3, sleep: true })) },
    3: [{ n: '飛毛腿', d: '墨水再多 20%（變成多 60%）。', setup: (h) => { h.ink = 1.6; } },
        { n: '傳令', d: '疾風神行同一個敵人每多穿一次 +3（原本 +2）。', setup: skSet(0, (sk) => { sk.run = (en) => { const n = new Map(); return en.map((u) => { const k = n.get(u) || 0; n.set(u, k + 1); return { u, dmg: 4 + 3 * k }; }); }; }) }],
    6: [{ n: '商旅之神', d: '神偷突襲冷卻少 1 輪。', setup: cdDown(1) },
        { n: '冥河引路', d: '引魂者帶走生命不到三成的敵人（原本兩成）。', talent: (t, c) => { for (const e of c.en) if (!e.dead && !e.elite && e.hp <= e.maxHp * 0.3) apply({ u: e, execute: '引魂' }); } }],
    8: [{ n: '斬首', d: '疾影連斬每關 12 傷害（原本 9）。', mod: plus(2, 3) },
        { n: '神盾', d: '赫爾墨斯每打中一個敵人，自己得 2 護盾。', setup: (h) => { const o = h.onHit; h.onHit = (x, s) => { if (o) o(x, s); x.shield += 2; }; } }],
  },
  dagda: {
    sk: { name: '悲鳴琴音', shape: 'circle', len: 700, cd: 2, anim: 's1', fx: 1, desc: '達格達的豎琴能叫季節輪轉：圈住的隊友各得 8 護盾，圈住的敵人各受 5 傷害並恐懼。',
      run: (en, al) => [...al.map((u) => ({ u, shield: 8 })), ...en.map((u) => ({ u, dmg: 5, fear: true }))] },
    3: [{ n: '大鍋盛宴', d: '豐收之歌每位隊友多回 4 生命。', mod: atSk(1, (s) => (s.heal ? { ...s, heal: s.heal + 4 } : s)) },
        { n: '好胃口', d: '飽足上限變成 30。', setup: (h) => { h.cap = 30; } }],
    6: [{ n: '豐饒不竭', d: '豐饒之鍋的天賦回 14 生命（原本 8）。', talent: (t, c) => apply({ u: c.h, heal: 6 }) },
        { n: '生之一端', d: '生死一擊打倒敵人時，全隊回 14 生命（原本 8）。', mod: atSk(2, (s) => (s.killHeal ? { ...s, killHeal: 14 } : s)) }],
    8: [{ n: '眾神之父', d: '生死一擊冷卻少 1 輪。', setup: cdDown(2) },
        { n: '神之大鍋', d: '每輪開始，達格達回 5 生命（滿的部分變飽足）。', round: (h) => apply({ u: h, heal: 5 }) }],
  },
  hanako: {
    sk: { name: '隔間囚禁', shape: 'tap', max: 1, len: 1, cd: 2, anim: 's2', fx: 1, desc: '點一個敵人，把他關進三樓第三間廁所：10 傷害，下次不能行動；精英和魔王關不住，改受 16。',
      run: (en) => en.map((u) => (u.elite ? { u, dmg: 16 } : { u, dmg: 10, sleep: '被關住' })) },
    3: [{ n: '拖進馬桶', d: '敲滿三次那一下多 18 傷害（原本 12）。', setup: (h) => { h.pullDmg = 18; } },
        { n: '四聲', d: '叩門三響可以點 4 個敵人。', setup: skSet(0, (sk) => { sk.max = 4; }) }],
    6: [{ n: '沖水聲', d: '天賦發動時，那條線打到的敵人各再受 4 傷害。', talent: (t, c) => { for (const e of c.en) setTimeout(() => apply({ u: e, dmg: 4, shared: true }), 300); } },
        { n: '門後的手', d: '花子打恐懼中的敵人，每一下 +3。', mod: (h, s) => (s.dmg && s.u.fear ? { ...s, dmg: s.dmg + 3 } : s) }],
    8: [{ n: '第二聲就開門', d: '敲門只要 2 次就把敵人拉進隔間。', setup: (h) => { h.cap = 2; } },
        { n: '紅色或藍色', d: '血色紅裙冷卻少 1 輪。', setup: cdDown(2) }],
  },
  anubis: {
    sk: { name: '秤心審判', shape: 'tap', max: 1, len: 1, cd: 2, anim: 's2', fx: 1, desc: '把敵人的心放上天秤和瑪特的羽毛比：10 傷害；他的生命比例比阿努比斯低，再多 10，阿努比斯回 6 生命。',
      run: (en, al, h) => en.flatMap((u) => (u.hp / u.maxHp < h.hp / h.maxHp ? [{ u, dmg: 20 }, { u: h, heal: 6 }] : [{ u, dmg: 10 }])) },
    3: [{ n: '瑪特的羽毛', d: '天秤加成變成七成（原本五成）。', setup: (h) => { h.scale = 1.7; } },
        { n: '胡狼之牙', d: '胡狼突擊每一下 +4 傷害。', mod: plus(0, 4) }],
    6: [{ n: '防腐師', d: '木乃伊包紮的護盾變成 14（原本 8）。', talent: (t, c) => apply({ u: c.h, shield: 6 }) },
        { n: '法老之怒', d: '冥界詛咒冷卻少 1 輪。', setup: cdDown(1) }],
    8: [{ n: '阿米特的胃口', d: '靈魂吞噬對生命不到四成的敵人就能吞掉，吞掉回 16 生命。', setup: skSet(2, (sk) => { sk.run = (en, al, h) => firstEnemy(en).flatMap((u) => (!u.elite && u.hp < u.maxHp * 0.4 ? [{ u, execute: '吞掉' }, { u: h, heal: 16 }] : [{ u, dmg: 20 }])); }) },
        { n: '死者之書', d: '每輪開始，阿努比斯得 6 護盾。', round: (h) => apply({ u: h, shield: 6 }) }],
  },
  hachi: {
    sk: { name: '七日之咒', shape: 'circle', len: 700, cd: 2, anim: 's2', fx: 1, desc: '被她看上的人，七天內一定會被帶走：圈住的敵人各受 3 傷害並被標記；已經被標記的改受 10。',
      run: (en) => en.map((u) => ({ u, dmg: u.mark ? 10 : 3 })) },
    3: [{ n: '盯上了', d: '被標記的敵人受到每一下攻擊 +3（原本 +2），誰打都算。', setup: () => { run.markDmg = 3; } },
        { n: '波波波波', d: '波波怪聲打恐懼中的敵人，每一下 +4。', mod: atSk(0, (s) => (s.dmg && s.u.fear ? { ...s, dmg: s.dmg + 4 } : s)) }],
    6: [{ n: '窗外的帽子', d: '致命凝視可以盯 3 個敵人。', setup: skSet(2, (sk) => { sk.max = 3; }) },
        { n: '八尺之高', d: '白影籠罩的護盾 +4。', mod: atSk(1, (s) => (s.shield ? { ...s, shield: s.shield + 4 } : s)) }],
    8: [{ n: '地藏也擋不住', d: '致命凝視冷卻少 1 輪。', setup: cdDown(2) },
        { n: '村口的聲音', d: '每輪開始，隨機一個敵人被標記並恐懼。', round: () => { const e = pick(foes.filter((x) => !x.dead)); if (e) { e.mark = true; e.fear = true; float(e, '波…', '#e8e8ff', 18); } } }],
  },
  medusa: {
    sk: { name: '生死之血', shape: 'tap', max: 2, any: true, len: 1, cd: 2, anim: 's1', fx: 0, desc: '右邊血管的血救人、左邊的血殺人：點最多 2 個目標，隊友回 10 生命，敵人受 8 傷害。',
      run: (en, al) => [...al.map((u) => ({ u, heal: 10 })), ...en.map((u) => ({ u, dmg: 8 }))] },
    3: [{ n: '粉碎', d: '石像崩碎打碎石像改成 28 傷害（原本 20）。', mod: atSk(2, (s) => (s.unstun ? { ...s, dmg: s.dmg + 8 } : s)) },
        { n: '毒牙', d: '萬蛇噬咬每一下 +2 傷害。', mod: plus(0, 2) }],
    6: [{ n: '一眼成石', d: '石化只要 2 層就變石像，全隊都算。', setup: () => { run.stoneAt = 2; } },
        { n: '冷眼', d: '石化凝視冷卻少 1 輪。', setup: cdDown(1) }],
    8: [{ n: '蛇窟', d: '蛇毒天賦多疊 1 層石化（變成 2 層）。', talent: (t, c) => { for (const e of c.en) addStone(e, 1); } },
        { n: '石像花園', d: '石像受到任何隊友的攻擊，每一下 +4。', aura: (s) => (s.dmg && s.u.side === 'enemy' && s.u.stun ? { ...s, dmg: s.dmg + 4 } : s) }],
  },
  horusshadow: {
    sk: { name: '真視之眼', shape: 'circle', len: 700, cd: 2, anim: 'cast', fx: 1, desc: '被賽特挖出又被治好的那隻眼：圈住的隊友各回 8 生命，圈住的敵人各受 4 傷害，圈到幾位隊友眼之碎片就加幾片。',
      run: (en, al, h) => [...al.map((u) => ({ u, heal: 8 })), ...en.map((u) => ({ u, dmg: 4 })), ...(al.length ? [{ u: h, res: al.length }] : [])] },
    3: [{ n: '碎片雨', d: '每輪多掉 1 片眼之碎片。', setup: () => { run.shardN = 3; } },
        { n: '鷹神金光', d: '鷹眼金光每一下 +3 傷害。', mod: plus(0, 3) }],
    6: [{ n: '千眼', d: '暗影之瞳可以點 4 個敵人。', setup: skSet(1, (sk) => { sk.max = 4; }) },
        { n: '全知', d: '真知之眼天賦多給 1 片碎片（變成 3 片）。', talent: (t) => addRes(t, 1) }],
    8: [{ n: '荷魯斯的審判', d: '天空審判每片碎片多 3 傷害（原本 2）。', mod: atSk(2, (s, h) => (s.dmg ? { ...s, dmg: s.dmg + h.res * (h.res >= h.cap ? 2 : 1) } : s)) },
        { n: '五片就夠', d: '眼之碎片上限變成 5，集滿 5 片就加倍。', setup: (h) => { h.cap = 5; } }],
  },
  redgirl: {
    sk: { name: '魔神牽引', shape: 'tap', max: 1, len: 1, cd: 2, anim: 'cast', fx: 1, desc: '山裡的魔神仔把人牽走：點一個敵人，受 6 傷害並直接迷路（下次行動改打自己的同伴）。',
      run: (en) => en.map((u) => ({ u, dmg: 6, confuse: true })) },
    3: [{ n: '握緊', d: '冰冷小手多疊 1 層迷途（變成 3 層）。', mod: atSk(0, (s) => (s.lost ? { ...s, lost: s.lost + 1 } : s)) },
        { n: '熟悉的山路', d: '迷途只要 4 層就迷路，全隊都算。', setup: () => { run.lostAt = 4; } }],
    6: [{ n: '起霧了', d: '紅霧迷蹤冷卻少 1 輪。', setup: cdDown(1) },
        { n: '回不去了', d: '鬼打牆打已經迷路的敵人改成 23 傷害（原本 15）。', mod: atSk(2, (s) => (s.dmg && s.u.confused ? { ...s, dmg: s.dmg + 8 } : s)) }],
    8: [{ n: '錄影帶裡的她', d: '鬼打牆冷卻少 1 輪。', setup: cdDown(2) },
        { n: '跟在後面', d: '每輪開始，每個敵人疊 1 層迷途。', round: () => { for (const e of foes) if (!e.dead) addLost(e, 1); } }],
  },
  wukong: {
    sk: { name: '定身術', shape: 'tap', max: 2, len: 1, cd: 2, anim: 's2', fx: 1, desc: '念咒一指，「定！」：點最多 2 個敵人，各受 5 傷害並定住（下次不能行動）；精英定不住，改受 12。',
      run: (en) => en.map((u) => (u.elite ? { u, dmg: 12 } : { u, dmg: 5, sleep: '定住' })) },
    3: [{ n: '齊天大聖', d: '金箍橫掃每一下 +3 傷害。', mod: plus(0, 3) },
        { n: '拔一把毫毛', d: '每輪開始，毫毛 +1。', round: (h) => addRes(h, 1) }],
    6: [{ n: '身外身法', d: '毫毛上限變成 5。', setup: (h) => { h.cap = 5; } },
        { n: '十萬八千里', d: '筋斗雲的墨水 +30%。', setup: skSet(1, (sk) => { sk.len = Math.round(sk.len * 1.3); }) }],
    8: [{ n: '鬥戰勝佛', d: '大鬧天宮冷卻少 1 輪。', setup: cdDown(2) },
        { n: '八卦爐煉成', d: '現出原形的敵人受到每一下 +5（原本 +3），誰打都算。', setup: () => { run.exposeDmg = 5; } }],
  },
  houyi: {
    sk: { name: '箭雨', shape: 'circle', len: 700, cd: 2, anim: 's2', fx: 1, desc: '在青丘射下大風鳥：圈住的敵人各受 8 傷害；飛在高處或會瞬移的敵人改受 16 並被射下來（下次不能行動）。',
      run: (en) => en.map((u) => (u.high || u.blink ? { u, dmg: 16, sleep: '被射下來' } : { u, dmg: 8 })) },
    3: [{ n: '百發百中', d: '烈日之箭每一下 +3 傷害。', mod: plus(0, 3) },
        { n: '扶桑樹下', d: '每輪開始，落日 +1。', round: (h) => addRes(h, 1) }],
    6: [{ n: '射河伯', d: '連珠箭可以點 4 個敵人。', setup: skSet(1, (sk) => { sk.max = 4; }) },
        { n: '誅封豨', d: '神射讓最後一個敵人多受 8（原本 4）。', setup: (h) => { h.lastBonus = 8; } }],
    8: [{ n: '斷修蛇', d: '九日墜落冷卻少 1 輪。', setup: cdDown(2) },
        { n: '殺鑿齒', d: '每輪開始，后羿得 5 護盾。', round: (h) => apply({ u: h, shield: 5 }) }],
  },
  mazu: {
    sk: { name: '二將護駕', shape: 'circle', len: 700, cd: 2, anim: 's2', fx: 1, desc: '桃花山收服的兩位將軍一起出手：圈住的敵人各受 10 傷害，圈住的隊友各得 10 護盾。',
      run: (en, al) => [...en.map((u) => ({ u, dmg: 10 })), ...al.map((u) => ({ u, shield: 10 }))] },
    3: [{ n: '海上女神', d: '慈航普渡經過的隊友多回 4 生命。', mod: atSk(0, (s) => (s.heal ? { ...s, heal: s.heal + 4 } : s)) },
        { n: '天上聖母', d: '香火上限變成 9。', setup: (h) => { h.cap = 9; } }],
    6: [{ n: '媽祖遶境', d: '護身銅符可以點 4 個目標。', setup: skSet(1, (sk) => { sk.max = 4; }) },
        { n: '順風耳', d: '每輪開始，媽祖得 5 護盾。', round: (h) => apply({ u: h, shield: 5 }) }],
    8: [{ n: '湄洲祖廟', d: '海神顯聖冷卻少 1 輪。', setup: cdDown(2) },
        { n: '天后', d: '每輪開始，全隊各回 3 生命。', round: () => { for (const u of heroes) if (!u.dead) apply({ u, heal: 3 }); } }],
  },
  yama: {
    sk: { name: '孟婆湯', shape: 'tap', max: 2, any: true, len: 1, cd: 2, anim: 's2', fx: 1, desc: '奈何橋邊的一碗湯：點最多 2 個目標，隊友回 10 生命；敵人受 4 傷害並忘了自己是誰（下次行動改打自己的同伴）。',
      run: (en, al) => [...al.map((u) => ({ u, heal: 10 })), ...en.map((u) => ({ u, dmg: 4, confuse: true }))] },
    3: [{ n: '判官', d: '閻羅審判打寫上名字的敵人改成 24 傷害（原本 18）。', mod: atSk(1, (s) => (s.dmg && s.u.book ? { ...s, dmg: s.dmg + 6 } : s)) },
        { n: '陰司', d: '陰德上限變成 15。', setup: (h) => { h.cap = 15; } }],
    6: [{ n: '黑白無常', d: '牛頭馬面天賦再讓那個敵人受 6 傷害。', talent: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => apply({ u: e, dmg: 6, shared: true }), 320); } },
        { n: '鬼門關', d: '每輪開始，陰德 +1。', round: (h) => addRes(h, 1) }],
    8: [{ n: '十殿閻羅', d: '索命勾魂冷卻少 1 輪。', setup: cdDown(2) },
        { n: '生死有命', d: '生死簿勾銷的門檻再加一成。', setup: (h) => { h.bookAt = 0.3; } }],
  },
  kuchisake: {
    sk: { name: '恐懼低語', shape: 'circle', len: 700, cd: 2, anim: 's2', fx: 1, desc: '傳說喊三聲「髮油」她就會停下來：圈住的敵人各受 5 傷害並恐懼；已經恐懼的被黏在原地（下次不能行動，精英除外）。',
      run: (en) => en.map((u) => (u.fear ? { u, dmg: 5, sleep: '黏住了' } : { u, dmg: 5, fear: true })) },
    3: [{ n: '口罩', d: '利剪突襲每一下 +3 傷害。', mod: plus(0, 3) },
        { n: '岐阜的夜路', d: '提問上限變成 5。', setup: (h) => { h.cap = 5; } }],
    6: [{ n: '百米三秒', d: '百米狂奔的墨水 +30%。', setup: skSet(1, (sk) => { sk.len = Math.round(sk.len * 1.3); }) },
        { n: '風衣', d: '每輪開始，口裂女得 6 護盾。', round: (h) => apply({ u: h, shield: 6 }) }],
    8: [{ n: '跟我一樣', d: '撕下口罩每點提問多 12 傷害（原本 8）。', mod: atSk(2, (s, h) => (s.dmg ? { ...s, dmg: s.dmg + 4 * h.res } : s)) },
        { n: '我漂亮嗎？我漂亮嗎？', d: '每輪開始問 2 個最近的敵人。', setup: (h) => { h.askN = 2; } }],
  },
};
for (const [id, G] of Object.entries(GROWTH)) HEROES[id].skills.push(G.sk);
// 這位神魔在這個等級、這些選擇下有的強化
function perksOf(id, lv, picks) {
  const G = GROWTH[id]; if (!G) return [];
  return PICK_LV.filter((l) => lv >= l).map((l) => G[l][(picks && picks[l]) || 0]);
}
// 交會加成：這招的線每交會一處，額外的效果（寫進招式說明）
for (const H of Object.values(HEROES)) for (const sk of H.skills) if (sk.xc) sk.desc += `<b>交會加成</b>：每交會一處，${sk.xc.d}。`;
const ALL_IDS = Object.keys(HEROES);
// 敵人：都是都市傳說或怪物（60 位可玩神魔不會拿來當敵人）。elite 精英、boss 魔王（精英和魔王不會被嘲諷、不會被直接帶走）
// chains 拉幾條鎖鏈、gaze 改用凝視打全隊的機率、twice 一次打兩下、armor 每一下少受的傷害、judge 每 3 次行動審判全隊
const FOES = {
  zombie:  { name: '夜行殭屍', sprite: 'zombie', hp: 30, atk: 11, exp: 8, d: '半夜還抱著公文在走廊遊蕩的殭屍。會走到目標面前咬一口。' },
  wisp:    { name: '鬼火', sprite: 'wisp', hp: 16, atk: 8, exp: 5, d: '飄忽不定的藍色火焰，生命不多，會飄到目標身邊燒一下。' },
  shade:   { name: '影子怪', sprite: 'shade', hp: 22, atk: 9, exp: 6, seize: true, sp: '會搶魂：場上有倒下隊友的靈魂，會先去把靈魂抓走。', d: '從燈照不到的角落爬出來的影子，會貼到目標身上咬一口。' },
  husk:    { name: '空殼職員', sprite: 'husk', hp: 38, atk: 10, exp: 9, seize: true, sp: '會搶魂：自己的靈魂沒了，看到別人的就想搶。', d: '靈魂早就被抽走、只剩身體還在上班的職員。很耐打。' },
  printer: { name: '卡紙印表機', sprite: 'printer', hp: 24, atk: 9, exp: 6, d: '一直吐出寫著你名字的紙，會衝過來用紙割人。' },
  mirror:  { name: '鏡中人', sprite: 'mirror', hp: 28, atk: 12, exp: 8, d: '鏡子裡的你，比你本人更想活下去。攻擊比較痛。' },
  hunter:  { name: '追殺者', sprite: 'hunter', hp: 80, atk: 10, exp: 25, elite: true, twice: true, d: '精英。專挑生命最少的神魔，一次連砍兩下。不會被嘲諷。' },
  warden:  { name: '無臉典獄長', sprite: 'boss', hp: 110, atk: 17, exp: 25, elite: true, chains: 2, gaze: 0.4, d: '精英。每次行動都會先甩出兩條鎖鏈擋在戰場中間，直線和自由線碰到就被剪斷，畫圈不受影響。有四成機率改用凝視打全隊（傷害六成）。不會被嘲諷。' },
  judge:   { name: '考績審判官', sprite: 'judge', hp: 170, atk: 16, exp: 50, elite: true, boss: true, armor: 3, judge: true, d: '魔王。穿著硬殼，每一下傷害少 3。每行動 3 次就審判一次全隊（傷害八成）。不會被嘲諷。' },
  wardenX: { name: '典獄長本尊', sprite: 'boss', hp: 230, atk: 18, exp: 60, elite: true, boss: true, chains: 3, gaze: 0.4, d: '魔王。每次行動都先甩出三條鎖鏈，直線和自由線碰到就被剪斷，畫圈不受影響。有四成機率改用凝視打全隊（傷害六成）。不會被嘲諷。' },
  // 下面這批的圖臉朝左（faceL）。sp：一般敵人的特性，開場框會寫出來
  jinmenken:   { name: '人面犬', sprite: 'jinmenken', faceL: true, hp: 18, atk: 8, exp: 5, dodge: true, sp: '第一下一定會閃開。', d: '長著大叔臉的狗，半夜在路邊跟你說「別管我」。第一下一定會閃開。' },
  mizuki:      { name: '水鬼', sprite: 'mizuki', faceL: true, hp: 30, atk: 10, exp: 7, chains: 1, chainKind: 'water', d: '在水邊等人替死的鬼。每次行動都先潑出一灘水窪（藍色），近身招式的線碰到就被剪斷。' },
  gaki:        { name: '餓鬼', sprite: 'gaki', faceL: true, hp: 34, atk: 9, exp: 7, noStatus: true, sp: '綁不上紅線、凍不住，也吸不到他的血。', d: '肚子永遠填不飽的鬼。綁不上紅線、不會疊冰霜也凍不住，吸血也吸不到他。' },
  diaoxigui:   { name: '吊死鬼', sprite: 'diaoxigui', faceL: true, hp: 24, atk: 11, exp: 7, high: true, sp: '吊在半空，近身招式打不到，要用遠程。', d: '吊在半空晃來晃去的鬼。近身招式打不到他，要用遠程的招。' },
  jerseydevil: { name: '澤西惡魔', sprite: 'jerseydevil', faceL: true, hp: 26, atk: 11, exp: 8, blink: true, sp: '每輪瞬間移動，冰地、雪地、火路都踩不到他。', d: '新澤西松林裡的飛天怪物。每輪會瞬間移動，冰地、雪地、火路都困不住他。' },
  amanojaku:   { name: '天邪鬼', sprite: 'amanojaku', faceL: true, hp: 26, atk: 10, exp: 7, rtl: true, sp: '專唱反調：線要從右往左穿過他才是全傷害，不然只有一半。', d: '專門唱反調的小鬼。線要從右往左穿過他才打得全，其他方向只有一半傷害。' },
  lintoujie:   { name: '林投姐', sprite: 'lintoujie', faceL: true, hp: 95, atk: 14, exp: 25, elite: true, chains: 2, chainKind: 'tree', d: '精英。林投樹下的女鬼。每次行動都先長出兩條林投樹根（綠色），直線和自由線碰到就被剪斷，畫圈不受影響。不會被嘲諷。' },
  tengu:       { name: '天狗', sprite: 'tengu', faceL: true, hp: 90, atk: 13, exp: 25, elite: true, gust: true, d: '精英。山裡的天狗。每隔一次行動就搧起狂風打全隊（傷害六成），把大家吹得到處都是。不會被嘲諷。' },
  mothman:     { name: '莫斯曼', sprite: 'mothman', faceL: true, hp: 85, atk: 15, exp: 25, elite: true, curse: true, d: '精英。紅眼的蛾人。每隔一次行動就瞪紅眼打全隊（傷害五成），下一輪大家的墨水都只剩一半。不會被嘲諷。' },
  guhuoniao:   { name: '姑獲鳥', sprite: 'guhuoniao', faceL: true, hp: 160, atk: 15, exp: 50, elite: true, boss: true, circleOnly: true, carry: true, seize: true, d: '魔王。會搶魂。披著羽毛的鳥女。只有畫圈打得全，其他招式傷害減半。每行動 3 次就抓走一位神魔，那位下一輪不能出招。不會被嘲諷。' },
  dullahan:    { name: '杜拉漢', sprite: 'dullahan', faceL: true, hp: 230, atk: 18, exp: 60, elite: true, boss: true, head: true, d: '魔王。無頭騎士，頭顱飄在別的地方（白色骷髏）。線要同時經過頭顱才是全傷害，不然只有一半。不會被嘲諷。' },
  // 追債人：因果債太多才會出現，借追殺者的圖染成紅黑色
  debtor:      { name: '追債人', sprite: 'hunter', tint: true, hp: 85, atk: 10, exp: 30, elite: true, seize: true, rip: true, d: '精英。因果債欠太多才會找上門的討債者。專挑生命最少的神魔，打到生命不到三成的，直接把魂抽走封印。倒下隊友的靈魂他也會搶。打倒他，被他封印的靈魂就會放出來。不會被嘲諷。' },
  wendigo:     { name: '溫迪戈', sprite: 'wendigo', faceL: true, hp: 200, atk: 14, exp: 60, elite: true, boss: true, devour: true, d: '魔王。永遠飢餓的雪原巨怪。輪到牠時會吃掉這輪大家畫過的線，每條讓牠攻擊 +2（一直累積）。不會被嘲諷。' },
};
// 會剪斷線的東西：名字、外框色、內線色
const CUT = { chain: ['鎖鏈', '#555060', '#9a96a8'], tree: ['樹根', '#2e1e0e', '#7fbf5a'], water: ['水窪', '#1f4a70', '#6ab0e8'] };
let curse = 1;

let run, cfg, heroes, foes, chains = [], path = [], closed, hits = [], hitAt = [], inside = new Set(), drawing, busy, effects, turn, who = -1, skillIdx = 0;
// trails：這一回合大家畫過的線（換回合就清掉）；bolts：遠程招飛出去的光球；zz：折線每個敵人身上的轉彎紀錄
let trails = [], bolts = [], zz = new Map();

// 開打一層。c：
//   floor 第幾層、title 標題、note 開場的說明（可省略）
//   party 出戰的三位 [{ id, hp, maxHp, gear: [裝備], tag: '今世' 之類的標籤（可省略）, res: 帶進來的元寶之類（可省略） }]，順序就是出手順序
//   foes 敵人 [key]、scale 敵人強度倍率、up { dmg 每一下多幾傷害, ink 墨水倍率 }
//   gearButton 開場框裡「整理裝備」按下去要做什麼（可省略，換完裝備由呼叫的人重新 start 這一層）、onEnd({ win, hp: {id: 生命}, res: {id: 元寶之類}, kills, exp }) 打完
function start(c) {
  gen++;
  cfg = c;
  run = { floor: c.floor, burnDmg: 3, markDmg: 2, exposeDmg: 3, stoneAt: 3, lostAt: 5, shardN: 2, up: { dmg: 0, ink: 1, ...(c.up || {}) }, executes: 0 };
  heroes = c.party.map((p) => ({ ...HEROES[p.id], id: p.id, tag: p.tag || '', side: 'ally', art: (p.gear || []).includes('ex_' + p.id) && ART[p.id + '-ex'] ? p.id + '-ex' : p.id, gear: p.gear || [], maxHp: p.maxHp, hp: Math.max(0, Math.min(p.maxHp, p.hp)), dead: p.hp <= 0, soul: 0, sealed: false, faded: p.hp <= 0, dmgMul: p.dmgMul || 1, x: 0, y: 0, shield: 0, flash: 0, cds: [0, 0, 0, 0], anim: null, taunt: false, res: p.res || 0, wine: 0, lv: p.lv || 99, picks: p.picks || {} }));
  // 等級：招式複製一份給強化改，再套上選過的強化
  for (const h of heroes) { h.skills = h.skills.map((sk) => ({ ...sk })); h.perks = perksOf(h.id, h.lv, h.picks); }
  for (const h of heroes) for (const p of h.perks) if (p.setup) p.setup(h);
  const k = c.scale || 1;
  // 追債人：債越多越強（債 5 以上每多 1 點，生命攻擊再 +6%）
  const kk = (key) => k * (key === 'debtor' ? 1 + 0.06 * Math.max(0, (c.debt || 0) - 5) : 1);
  foes = c.foes.map((key) => ({ key, ...FOES[key], side: 'enemy', maxHp: Math.round(FOES[key].hp * kk(key)), hp: Math.round(FOES[key].hp * kk(key)), atk: Math.round(FOES[key].atk * kk(key)), dead: false, frozen: false, confused: false, frost: 0, red: false, burn: 0, fear: false, mark: false, exposed: false, book: false, stone: 0, stun: false, lost: 0, flash: 0, x: 0, y: 0, acts: 0, dodged: false, headAt: null }));
  place(true);
  effects = []; trails = []; bolts = []; shards = []; zones = []; chains = []; turn = 0; who = -1; busy = false; demo = null; curse = 1; gearNewRound(true);
  renderHelp();
  nextHero();
  const kinds = [...new Set(foes.filter((e) => e.chains).map((e) => e.chainKind || 'chain'))];
  const sps = [...new Set(foes.filter((e) => e.sp).map((e) => `<b>${e.name}</b>：${e.sp}`))];
  const boss = foes.find((e) => e.boss), elite = foes.find((e) => e.elite);
  showBox(`<h2>${c.title || `第 ${c.floor} 層`}</h2>
    <p>敵人：${foes.map((e) => e.name).join('、')}</p>
    ${c.note || ''}
    ${boss || elite ? `<p>${(boss || elite).d}</p>` : '<p>三位神魔輪流上場。輪到誰，就從下面選他的一招，照那招的畫法在戰場上畫，畫好按出招。</p>'}
    ${sps.map((t) => `<p class="muted">${t}</p>`).join('')}
    ${kinds.includes('chain') ? '<p class="muted">典獄長每次行動都會先<b>甩出鎖鏈</b>擋在戰場中間。直線和自由線碰到鎖鏈就會被剪斷，畫圈不受影響；典獄長倒下，鎖鏈就消失。</p>' : ''}
    ${kinds.includes('tree') ? '<p class="muted">林投姐每次行動都會先長出樹根。直線和自由線碰到<b>樹根</b>（咖啡色、長葉子）就會被剪斷，畫圈不受影響。</p>' : ''}
    ${kinds.includes('water') ? '<p class="muted">水鬼每次行動都會先潑出水窪。近身招式的線碰到<b>水窪</b>（藍色一灘水）就會被剪斷，遠程招不受影響。</p>' : ''}
    <button class="btn primary wide ok">開始</button>`);
  $('.box .ok').onclick = hideBox;
  tutIntro();
  if (foes.some((e) => e.key === 'debtor')) lesson('debtor');
  if (c.gearButton) {
    const b = Object.assign(document.createElement('button'), { className: 'btn wide', textContent: '整理裝備' });
    b.style.marginTop = '8px';
    b.onclick = () => c.gearButton();
    $('.box').appendChild(b);
  }
}

// 站位：每一輪大家都換位置，路線每次都要重想
function place(first) {
  const spots = [];
  for (const e of [...heroes, ...foes]) {
    if (e.dead) continue;
    let best = null;
    for (let t = 0; t < 60; t++) {
      const p = e.side === 'ally' ? { x: rnd(60, 290), y: rnd(310, 660) } : { x: rnd(250, 548), y: e.high ? rnd(300, 400) : rnd(310, 660) };
      if (!spots.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 120)) { best = p; break; }
      best = best || p;
    }
    spots.push(best);
    if (first) { e.x = best.x; e.y = best.y; } else { e.from = { x: e.x, y: e.y }; e.to = best; }
  }
}

// 換下一位神魔上場；三位都輪過一次就算一輪，大家換位置
async function nextHero() {
  if (!heroes.some((h) => !h.dead)) return;
  let n = who, fresh = who < 0;
  for (;;) {
    n = (n + 1) % heroes.length;
    if (n === 0 && !fresh) { await newRound(); fresh = true; if (foes.every((e) => e.dead)) return winFloor(); }
    const x = heroes[n];
    if (x.dead) continue;
    if (x.carried) { x.carried = false; float(x, '被抓走了，跳過', '#d0b0ff', 18); await wait(500); continue; }
    break;
  }
  who = n; turn++;
  const h = heroes[who];
  h.cds = h.cds.map((c) => Math.max(0, c - 1));
  h.moved = false; moving = false;
  skillIdx = 0;
  if (fresh) for (const e of foes) if (!e.dead) setIntent(e);
  clearPath(); renderSkills();
}

async function newRound() {
  gearNewRound();
  trails = [];
  for (const h of heroes) { h.taunt = false; if (h.round) h.round(h); if (!h.dead) for (const p of h.perks) if (p.round) p.round(h); }
  // 靈魂只撐幾輪，沒人救就魂散
  for (const h of heroes) if (h.dead && h.soul > 0 && --h.soul === 0) { h.faded = true; float(h, '魂散', '#9fb0c0', 20); lesson('faded'); }
  for (const e of foes) { e.frost = Math.max(0, e.frost - 1); e.red = false; e.exposed = false; }
  // 燃燒：每輪開始燒 3
  for (const e of foes) if (!e.dead && e.burn) { e.burn--; tickDmg(e, run.burnDmg, '#ff8a30'); fxPush({ type: 'burst', x: e.x, y: e.y - 46, color: '#ff8a30', dur: 450, seed: 2 }); }
  freeSouls();
  fleeCheck();
  spawnShards();
  // 新的一輪：敵人退回右邊重整隊形，神魔留在上一手停下的位置
  await Promise.all(foes.filter((e) => !e.dead).map((e) => e.x < 330 || (e.high && e.y > 420) ? moveTo(e, { x: rnd(340, 545), y: e.high ? rnd(300, 400) : e.y }, 0.8).then(() => { e.face = -1; }) : null));
  // 澤西惡魔：瞬間移動到別的地方
  for (const e of foes) if (!e.dead && e.blink) { fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#c080ff', dur: 400 }); e.x = rnd(260, 545); e.y = rnd(320, 650); fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#c080ff', dur: 400 }); }
  await settle();
}

function setIntent(e) {
  const a = heroes.filter((h) => !h.dead);
  // 搶魂：場上有還沒人去抓的靈魂，先去抓
  if (e.seize) {
    const s = heroes.find((h) => h.dead && h.soul > 0 && !foes.some((o) => o !== e && !o.dead && o.intent && o.intent.seize === h));
    if (s) { e.intent = { seize: s, dmg: 0 }; lesson('seize'); return; }
  }
  const tank = a.find((h) => h.taunt);
  if (tank && !e.elite) { e.intent = { target: tank, dmg: e.atk }; return; }
  e.acts++;
  if (e.head) e.headAt = { x: rnd(120, 520), y: rnd(300, 600) };
  if (e.gust && e.acts % 2 === 0) { e.intent = { all: true, dmg: Math.round(e.atk * 0.6), label: '狂風', gust: true }; return; }
  if (e.curse && e.acts % 2 === 0) { e.intent = { all: true, dmg: Math.round(e.atk * 0.5), label: '紅眼', curse: true }; return; }
  if (e.carry && e.acts % 3 === 0) { e.intent = { target: pick(a), dmg: e.atk, carry: true }; return; }
  // 審判官每 3 次行動審判全隊；追殺者專挑生命最少的
  if (e.judge && e.acts % 3 === 0) { e.intent = { all: true, dmg: Math.round(e.atk * 0.8), judge: true }; return; }
  if (e.gaze && Math.random() < e.gaze) { e.intent = { all: true, dmg: Math.round(e.atk * 0.6) }; return; }
  const low = a.slice().sort((x, y) => x.hp - y.hp)[0];
  e.intent = { target: e.twice || e.rip ? low : (!e.elite && tank) || pick(a), dmg: e.atk, twice: e.twice };
}

// 典獄長、水鬼、林投姐在自己的回合把障礙物甩到戰場中間：舊的收回、換新的，死掉就全部消失
const THROW = { chain: ['甩出鎖鏈！', '#c8c4d8'], water: ['潑出水窪！', '#6ab0e8'], tree: ['長出樹根！', '#7fbf5a'] };
function makeChains(w) {
  chains = chains.filter((c) => c.owner !== w);
  const kind = w.chainKind || 'chain', born = performance.now();
  for (let i = 0; i < w.chains; i++) {
    let x, y, n = 0;
    do { x = rnd(220, 330); y = rnd(300, 640); } while (n++ < 12 && chains.some((o) => Math.hypot((o.x1 + o.x2) / 2 - x, (o.y1 + o.y2) / 2 - y) < 110));
    const a = rnd(-1.3, 1.3), L = 160, from = { x: w.x - 20, y: w.y - 50 };
    if (kind === 'water') chains.push({ x1: x, y1: y, x2: x, y2: y, cx: x, cy: y, rx: 50, ry: 38, kind, owner: w, born, from, edge: Array.from({ length: 24 }, () => rnd(-0.06, 0.06)) });
    else chains.push({ x1: x - Math.cos(a) * L / 2, y1: y - Math.sin(a) * L / 2, x2: x + Math.cos(a) * L / 2, y2: y + Math.sin(a) * L / 2, kind, owner: w, born, from });
  }
}
async function throwChains(w) {
  if (!w.chains || w.dead) return;
  const [t, col] = THROW[w.chainKind || 'chain'];
  w.lunge = performance.now(); float(w, t, col, 20); sfx('snap');
  makeChains(w);
  await wait(700);
}
const CHAIN_FLY = 500;
// 這一招的線會被哪些東西剪斷（水窪只剪近身招）
const cutters = () => (hero().noCut ? [] : chains.filter((c) => !c.owner.dead && (c.kind !== 'water' || skill().melee)));

const hero = () => heroes && heroes[who];
const skill = () => hero().skills[skillIdx];
const inkMax = () => Math.round(skill().len * run.up.ink * (hero().ink || 1) * (hero().inkBuff || 1) * (wears(hero(), 'ex_wukong') && lineShape(skill()) ? 1.5 : 1) * (1 + gstat(hero(), 'ink')) * curse);
function clearPath() { path = []; hits = []; hitAt = []; inside = new Set(); zz = new Map(); closed = false; drawing = false; crossMemo = null; updateUi(); }

// ───── 畫線 ─────
const center = (u) => ({ x: u.x, y: u.y - 46 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function toCanvas(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * (H - VIEW_Y) / r.height + VIEW_Y }; }
function segHitsCircle(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L));
  return Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y) < r;
}
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// 線 a→b 碰到障礙物的話，回傳被剪斷的那一點；沒碰到回傳 null。水窪是一灘圓的，線從外面走進去就斷
function cutHit(a, b, c) {
  if (c.kind === 'water') {
    const q = (p) => ({ x: (p.x - c.cx) / c.rx, y: (p.y - c.cy) / c.ry }), A = q(a), B = q(b);
    if (A.x * A.x + A.y * A.y <= 1) return null;
    const dx = B.x - A.x, dy = B.y - A.y, aa = dx * dx + dy * dy, bb = 2 * (A.x * dx + A.y * dy), cc = A.x * A.x + A.y * A.y - 1, D = bb * bb - 4 * aa * cc;
    if (!aa || D < 0) return null;
    const t = (-bb - Math.sqrt(D)) / (2 * aa);
    return t >= 0 && t <= 1 ? { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } : null;
  }
  return segCross(a, b, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }) ? cutAt(a, b, c) : null;
}
function cutAt(a, b, c) {
  // 線和鎖鏈的交點
  const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y, x3 = c.x1, y3 = c.y1, x4 = c.x2, y4 = c.y2;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (!den) return b;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
}
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const pathLen = () => path.reduce((s, p, i) => i ? s + dist(p, path[i - 1]) : 0, 0);
const living = () => [...heroes, ...foes].filter((u) => !u.dead);

// 直線：從神魔身上往手指方向拉，最長 len，碰到戰場邊或鎖鏈就停（八咫鏡會反射、青龍偃月刀斬殺後會延長）
function straight(to) {
  const h = hero(), s = center(h), d = dist(s, to) || 1, dir = { x: (to.x - s.x) / d, y: (to.y - s.y) / d };
  path = rayPath(s, dir, Math.min(d, inkMax()));
  hits = lineHits();
  if (wears(h, 'ex_guangong')) for (let k = 0, extra = 0; k < 4; k++) {
    const want = 160 * lineKills(); if (want <= extra) break;
    extra = want; path = rayPath(s, dir, Math.min(d, inkMax()), extra); hits = lineHits();
  }
  // 衝刺：只砍第一個敵人，線停在他身上
  const first = skill().shape === 'dash' && hits.find((u) => u.side === 'enemy');
  if (first) {
    const L = along(first);
    hits = hits.filter((u) => u === first || (u.side === 'ally' && along(u) < L));
    path = cutPath(path, L);
  }
}
function cutPath(pts, L) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], d = dist(a, pts[i]);
    if (d >= L) { out.push({ x: a.x + (pts[i].x - a.x) * L / (d || 1), y: a.y + (pts[i].y - a.y) * L / (d || 1) }); break; }
    out.push(pts[i]); L -= d;
  }
  return out;
}
// 連點：點到誰就把誰串進來
function tapAt(p) {
  const sk = skill(), h = hero();
  const u = living().filter((x) => x !== h && (sk.any || x.side === 'enemy')).sort((a, b) => dist(center(a), p) - dist(center(b), p))[0];
  if (!u || dist(center(u), p) > hitR() + 18) { tip(`點<b>${sk.any ? '敵人或隊友' : '敵人'}身上</b>，把他們串起來。`); return; }
  if (hits.includes(u)) { tip('已經串過他了，點別人。'); return; }
  if (hits.length >= sk.max) { tip(`最多串 ${sk.max} 個，不滿意按重畫。`); return; }
  if (!path.length) path = [center(h)];
  hits.push(u); hitAt.push(path.length); path.push(center(u)); crossMemo = null;
  updateUi();
}

cv.addEventListener('pointerdown', (ev) => {
  if (flying && !$('.overlay').classList.contains('show')) { flying(toCanvas(ev)); return; }
  demo = null;
  if (busy || !heroes || $('.overlay').classList.contains('show')) return;
  if (moving) { walkTo(toCanvas(ev)); return; }
  const p = toCanvas(ev), sk = skill(), h = hero();
  pressStart(p, sk.shape === 'tap');
  if (sk.shape === 'tap') return;
  clearPath();
  if (sk.shape !== 'circle' && dist(center(h), p) > HIT_R + 16) { tip(`這招要從<b>${h.name}身上</b>開始畫（腳下有金色光圈的那位）。`); return; }
  drawing = true; sfx('draw');
  if (lineShape(sk)) straight(p);
  else if (freeShape(sk)) path = [center(h)];
  else path = [p];
  cv.setPointerCapture(ev.pointerId);
  updateUi();
});
cv.addEventListener('pointermove', (ev) => {
  pressMove(toCanvas(ev));
  if (!drawing) return;
  const p = toCanvas(ev), sk = skill();
  crossMemo = null;
  if (lineShape(sk)) { straight(p); updateUi(); return; }
  const last = path[path.length - 1], d = dist(p, last);
  if (d < 6) return;
  const used = pathLen(), max = inkMax();
  if (used + d > max) { const k = (max - used) / d; p.x = last.x + (p.x - last.x) * k; p.y = last.y + (p.y - last.y) * k; }
  if (freeShape(sk)) {
    for (const c of cutters()) { const cut = cutHit(last, p, c); if (!cut) continue; path.push(cut); fxPush({ type: 'snap', x: p.x, y: p.y, dur: 600 }); sfx('snap'); drawing = false; updateUi(); tip(`紅線被<b>${CUT[c.kind][0]}</b>剪斷了。`); return; }
    path.push(p);
    if (sk.shape === 'zigzag') zigzagStep(last, p);
    // 線每「穿進」敵人一次就多打一下；隊友只算一次
    else for (const u of living()) {
      if (u === hero()) continue;
      const touch = segHitsCircle(last, p, center(u), hitR());
      if (touch && !inside.has(u) && (u.side === 'enemy' || !hits.includes(u))) { hits.push(u); hitAt.push(path.length - 1); }
      if (dist(p, center(u)) < hitR()) inside.add(u); else inside.delete(u);
    }
  } else path.push(p);
  if (pathLen() >= max - 0.5) endDraw();
  updateUi();
});
// 折線：線每穿進敵人一次算過一關，在敵人身上轉彎（超過 60 度）再多一關；隊友經過算一次
function zigzagStep(a, b) {
  const L = dist(a, b) || 1, d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, cap = 5;
  for (const u of living()) {
    if (u === hero()) continue;
    if (u.side === 'ally') { if (!hits.includes(u) && segHitsCircle(a, b, center(u), hitR())) hits.push(u), hitAt.push(path.length - 1); continue; }
    const inNow = dist(b, center(u)) < hitR(), v = zz.get(u);
    // 一下子劃過去（這一段經過、但終點已經在外面）也算穿進一次
    if (!inNow && !v && segHitsCircle(a, b, center(u), hitR())) { if (hits.filter((x) => x.side === 'enemy').length < cap) { hits.push(u); hitAt.push(path.length - 1); } continue; }
    if (!inNow) { zz.delete(u); continue; }
    const full = hits.filter((x) => x.side === 'enemy').length >= cap;
    // 穿進敵人就算過一關
    if (!v) { zz.set(u, { d, done: false }); if (!full) { hits.push(u); hitAt.push(path.length - 1); } continue; }
    // 在敵人身上轉彎再多過一關
    if (!v.done && v.d.x * d.x + v.d.y * d.y < 0.5 && !full) {
      v.done = true; hits.push(u); hitAt.push(path.length - 1);
      fxPush({ type: 'ring', x: b.x, y: b.y, color: '#ffe070', dur: 400 });
    }
  }
}
function endDraw() {
  if (!drawing) return;
  drawing = false;
  crossMemo = null;
  if (skill().shape === 'circle') {
    // 頭尾要夠近才算圈起來
    closed = path.length > 8 && dist(path[0], path[path.length - 1]) < Math.max(90, pathLen() * 0.25);
    hits = closed ? living().filter((u) => inPoly(center(u), path) || inPoly({ x: u.x, y: u.y - 10 }, path)) : [];
  }
  updateUi();
  if (skill().shape === 'circle' && !closed) tip('圈沒有<b>收口</b>，頭尾要接起來，再畫一次。');
}
cv.addEventListener('pointerup', (ev) => {
  endDraw();
  const pr = pressEnd();
  if (!pr || busy || $('.overlay').classList.contains('show')) return;
  // 連點招式：點一下是選目標（長按才看說明）；其他招式：點一下角色就看說明
  if (skill().shape === 'tap') tapAt(pr.p);
  else if (pr.tap && pr.u) { clearPath(); showInfo(pr.u); }
});
cv.addEventListener('pointercancel', () => { endDraw(); pressEnd(); });

function results() {
  const h = hero(), en = hits.filter((u) => u.side === 'enemy'), al = hits.filter((u) => u.side === 'ally');
  const bonus = run.up.dmg + (h.wine || 0);
  let res = skill().run(en, al, h).map((s) => (s.dmg ? { ...s, dmg: s.dmg + bonus } : s));
  if (h.mod) res = res.map((s) => h.mod(h, s));
  for (const p of h.perks) if (p.mod) res = res.map((s) => p.mod(h, s, skillIdx));
  // 七日之期：被標記的敵人每一下 +2
  res = res.map((s) => (s.dmg && s.u.mark ? { ...s, dmg: s.dmg + run.markDmg } : s));
  // 火眼金睛：現出原形的敵人每一下 +3
  res = res.map((s) => (s.dmg && s.u.exposed ? { ...s, dmg: s.dmg + run.exposeDmg } : s));
  for (const x of heroes) if (!x.dead) for (const p of x.perks) if (p.aura) res = res.map(p.aura);
  if (h.post) res = h.post(h, res);
  const xn = crossings().length;
  if (xn && skill().xc) res = skill().xc.fx(res, xn, h, en, al);
  res = gearResults(h, res);
  res = res.map(foeMod);
  if (h.dmgMul !== 1) res = res.map((s) => (s.dmg && s.u.side === 'enemy' ? { ...s, dmg: Math.round(s.dmg * h.dmgMul) } : s));
  // 硬殼：每一下少受幾點傷害（最少 1）
  res = res.map((s) => (s.dmg && s.u.armor ? { ...s, dmg: Math.max(1, s.dmg - s.u.armor) } : s));
  // 紅線交會：交叉點附近的敵人各受 6 傷害
  for (const c of crossings()) for (const e of foes) if (!e.dead && dist(center(e), c) < 90) res.push({ u: e, dmg: 6, cross: c });
  return res;
}

// 敵人特性改傷害：吊死鬼、天邪鬼、姑獲鳥、杜拉漢；餓鬼不吃狀態
function foeMod(s) {
  const u = s.u, sk = skill();
  if (u.side !== 'enemy') return s;
  if (u.noStatus && (s.red || s.frost || s.freeze)) s = { ...s, red: false, frost: 0, freeze: false, nope: s.dmg ? '' : '不吃這套' };
  if (!s.dmg) return s;
  if (u.high && sk.melee) return { ...s, dmg: 0, nope: '搆不到' };
  let half = false;
  if (u.circleOnly && sk.shape !== 'circle') half = true;
  if (u.rtl && path.length > 1) {
    const c = center(u); let best = 1e9, dx = 0;
    for (let i = 1; i < path.length; i++) { const m = { x: (path[i - 1].x + path[i].x) / 2, y: (path[i - 1].y + path[i].y) / 2 }, d = dist(m, c); if (d < best) { best = d; dx = path[i].x - path[i - 1].x; } }
    if (dx >= 0) half = true;
  }
  if (u.head && u.headAt && !(closed ? inPoly(u.headAt, path) : path.some((p, i) => i && segHitsCircle(path[i - 1], p, u.headAt, hitR())))) half = true;
  return half ? { ...s, dmg: Math.max(1, Math.ceil(s.dmg / 2)), half: true } : s;
}

// 這一招的線和這回合隊友留下的線交叉的地方（最多 3 處）
let crossMemo = null;
function crossings() {
  if (crossMemo) return crossMemo;
  const h = hero(), out = [];
  const segs = (pts, loop) => { const r = []; for (let i = 1; i < pts.length; i++) r.push([pts[i - 1], pts[i]]); if (loop && pts.length > 2) r.push([pts[pts.length - 1], pts[0]]); return r; };
  if (path.length > 1 && !drawing) {
    const mine = segs(path, skill().shape === 'circle' && closed);
    for (const t of trails) {
      if (t.owner === h) continue;
      for (const [a, b] of mine) for (const [c, d] of segs(t.pts, t.loop)) {
        if (!segCross(a, b, c, d)) continue;
        const p = cutAt(a, b, { x1: c.x, y1: c.y, x2: d.x, y2: d.y });
        if (out.length < 3 && !out.some((q) => dist(q, p) < 60)) out.push({ ...p, owner: t.owner });
      }
    }
  }
  return (crossMemo = out);
}
// 這一招會觸發誰的天賦：線穿過的隊友，加上被交會到的線的主人
function talentsHit() {
  const h = hero(), s = new Set(hits.filter((u) => u.side === 'ally' && u !== h && !u.dead));
  for (const c of crossings()) if (!c.owner.dead) s.add(c.owner);
  return [...s].filter((t) => t.lv >= TALENT_LV);
}
function fireTalents(list, h) {
  const later = [], en = [...new Set(hits.filter((u) => u.side === 'enemy' && !u.dead))];
  for (const t of list) {
    float(t, t.talent.n, t.color, 20);
    fxPush({ type: 'ring', x: t.x, y: t.y - 46, color: t.color, dur: 600 });
    const c = { h, en, later: (f) => later.push(f) };
    if (t.talentFx) t.talentFx(t, c);
    for (const p of t.perks) if (p.talent) p.talent(t, c);
  }
  return later;
}

// ───── 出招 ─────
async function go() {
  if (busy || (!hits.length && !soulHits().length)) return;
  const h = hero(), sk = skill(), steps = results(), tal = talentsHit(), cx = crossings(), saves = soulHits();
  busy = true; casting = true; updateUi(); renderSkills();
  gearLink(h);
  h.cds[skillIdx] = (sk.cd || 0) + 1;
  if (sk.spendRes) h.res = 0;
  h.wine = 0;
  float(h, sk.name, h.color, 26);
  run.glow = { t0: performance.now(), ms: 350 };
  const later = fireTalents(tal, h);
  const self = steps.filter((x) => x.u === h && !x.cross), others = steps.filter((x) => x.u !== h && !x.cross);
  if (sk.shape === 'circle') {
    // 畫圈：近身招跳到圈的中間施法，遠程招站在原地施法；圈裡的目標一起中
    const c = path.reduce((a, p) => ({ x: a.x + p.x / path.length, y: a.y + p.y / path.length }), { x: 0, y: 0 });
    if (sk.melee) { await moveTo(h, { x: c.x, y: c.y + 46 }, 1.1, true); await skillAnim(h, sk); }
    else {
      // 遠程畫圈：先蓄力，射一發到圈中間，再在整個圈炸開
      h.face = c.x < h.x ? -1 : 1;
      await windUp(h, sk);
      const b = newBolt(h); bolts.push(b);
      await moveTo(b, { x: c.x, y: c.y + 46 }, 0.6); b.moving = false;
      bolts = bolts.filter((x) => x !== b);
      fxPush({ type: 'area', poly: path.slice(), color: h.color, dur: 600 });
      fxPush({ type: 'burst', x: c.x, y: c.y, color: h.color, dur: 600, seed: 1 });
      await wait(150);
    }
    for (const st of others) { if (st.u.dead) continue; apply(st); await wait(70); }
  } else {
    // 近身招：神魔沿著線跑過去，經過誰就對誰出招，停在線的終點（衝刺停在敵人面前）
    // 遠程招：神魔站著出手，招式化成光球沿著線飛過去
    const foot = densify(path).map((p) => ({ x: p.x, y: p.y + 46 }));
    const mover = sk.melee ? h : newBolt(h);
    if (!sk.melee) { h.face = path[1].x < path[0].x ? -1 : 1; await windUp(h, sk); bolts.push(mover); }
    const cum = [0]; for (let i = 1; i < foot.length; i++) cum.push(cum[i - 1] + dist(foot[i], foot[i - 1]));
    const at = (u) => { const c = { x: u.x, y: u.y }; let bi = 0, bd = 1e9; foot.forEach((p, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } }); return Math.max(0, cum[bi] - 55); };
    // 自由線：照穿過的那一刻排；直線：照離起點的距離排
    const queue = new Map();
    if (freeShape(sk) || sk.shape === 'tap') hits.forEach((u, k) => { if (!queue.has(u)) queue.set(u, []); let L = 0; for (let i = 1; i <= Math.min(hitAt[k], path.length - 1); i++) L += dist(path[i], path[i - 1]); queue.get(u).push(Math.max(0, L - (sk.melee ? 55 : 0))); });
    const plan = others.map((st) => ({ st, s: queue.has(st.u) && queue.get(st.u).length ? queue.get(st.u).shift() : at(st.u) })).sort((a, b) => a.s - b.s);
    const speed = !sk.melee ? 0.6 : lineShape(sk) ? 1.5 : 0.85;
    let pos = 0;
    for (const { st, s: sAt } of plan) {
      // 敵人已經倒下，剩下對他的那幾下就不打了，直接往下一個目標
      if (st.u.side === 'enemy' && st.u.dead) continue;
      await travel(mover, foot, cum, pos, sAt, speed); pos = Math.max(pos, sAt);
      if (st.u.side === 'enemy' && sk.melee) { await skillAnim(h, sk, 0.55); apply(st); await wait(120); }
      else { if (st.u.side === 'enemy') fxPush({ type: 'ring', x: st.u.x, y: st.u.y - 46, color: '#fff', dur: 300 }); apply(st); await wait(st.u.side === 'enemy' && !sk.melee ? 160 : 60); }
    }
    if (sk.shape !== 'dash') await travel(mover, foot, cum, pos, cum[cum.length - 1], speed);
    bolts = bolts.filter((b) => b !== mover);
  }
  // 紅線交會：交叉點炸開
  for (const c of cx) {
    fxPush({ type: 'burst', x: c.x, y: c.y, color: '#ffe070', dur: 600, seed: 0 });
    fxPush({ type: 'ring', x: c.x, y: c.y, color: '#ff3048', dur: 600 });
    float({ x: c.x, y: c.y + 70 }, '紅線交會', '#ffe070', 20); sfx('cross');
    for (const st of steps.filter((x) => x.cross === c)) apply(st);
    await wait(250);
  }
  for (const st of self) apply(st);
  // 救魂：線穿過倒下隊友的靈魂，救回一半生命
  for (const u of saves) if (u.dead && u.soul > 0) { revive(u, Math.ceil(u.maxHp / 2), '救回來了'); await wait(200); }
  freeSouls();
  casting = false;
  h.moving = false;
  // 同一回合畫過的線都留著，換回合才清掉
  trails.push({ owner: h, pts: path.slice(), loop: sk.shape === 'circle' });
  later.forEach((f) => f());
  pickShards();
  await gearAfterMove(h, sk);
  await settle();
  await wait(350);
  run.glow = null; path = []; hits = [];
  if (foes.every((e) => e.dead)) return winFloor();
  // 三位神魔都出過招，敵人才行動
  if (heroes.some((x, i) => i > who && !x.dead && !x.carried)) { busy = false; return nextHero(); }
  await enemyTurn();
}

const clampPos = (p) => ({ x: Math.max(40, Math.min(560, p.x)), y: Math.max(300, Math.min(675, p.y)) });

// 沿著線從 s0 走到 s1（線長的位置），走路動作、面向前進方向
function travel(h, foot, cum, s0, s1, speed) {
  if (s1 <= s0) return Promise.resolve();
  h.moving = true;
  const t0 = performance.now(), ms = (s1 - s0) / speed, my = gen;
  return new Promise((res) => {
    const f = () => {
      if (my !== gen) return;
      const k = Math.min(1, (performance.now() - t0) / ms), sNow = s0 + (s1 - s0) * k;
      let i = 1; while (i < cum.length - 1 && cum[i] < sNow) i++;
      const a = foot[i - 1], b = foot[i], seg = cum[i] - cum[i - 1] || 1, q = Math.min(1, Math.max(0, (sNow - cum[i - 1]) / seg));
      const p = clampPos({ x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q });
      if (Math.abs(p.x - h.x) > 0.5) h.face = p.x < h.x ? -1 : 1;
      h.x = p.x; h.y = p.y;
      k < 1 ? requestAnimationFrame(f) : res();
    };
    requestAnimationFrame(f);
  });
}

// 直接走到某個點
function moveTo(u, to, speed = 0.9, hop = false) {
  to = clampPos(to);
  const from = { x: u.x, y: u.y }, d = dist(from, to);
  if (d < 2) return Promise.resolve();
  u.moving = true; u.face = to.x < from.x ? -1 : 1;
  const t0 = performance.now(), ms = d / speed, my = gen;
  return new Promise((res) => {
    const f = () => {
      if (my !== gen) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      u.x = from.x + (to.x - from.x) * k; u.y = from.y + (to.y - from.y) * k;
      u.hop = hop ? Math.sin(k * Math.PI) * 40 : 0;
      if (k < 1) requestAnimationFrame(f); else { u.moving = false; u.hop = 0; res(); }
    };
    requestAnimationFrame(f);
  });
}

// 遠程招的飛行物：關公青色刀氣、月老紅心拖著紅線、雪女冰刺拖著霜
function newBolt(h) { return { x: h.x, y: h.y, color: h.color, kind: h.id, trail: [] }; }
async function windUp(h, sk) {
  fxPush({ type: 'charge', u: h, color: h.color, dur: 450 }); sfx('charge');
  await skillAnim(h, sk, 0.5);
  sfx('shoot');
}

// 播技能動作，等到出手那一格
async function skillAnim(h, sk, part = 0.6) {
  // 拿專屬兵器的圖只有 s1/s2/ult：月老這種舊圖用 punch/cast 的角色，照第幾招換
  const name = h.art.endsWith('-ex') && !/^(s1|s2|ult)$/.test(sk.anim) ? ['s1', 's2', 'ult'][h.skills.indexOf(sk)] || 's1' : sk.anim;
  const a = artAnim(h.art, name) || artAnim(h.art, 'punch');
  const total = a ? a.ms.reduce((x, y) => x + y, 0) : 500;
  h.moving = false;
  h.anim = { a, t0: performance.now() };
  await wait(total * part);
}

// 站太近的人往外推開，避免疊在一起
function settle() {
  const all = [...heroes, ...foes].filter((u) => !u.dead), want = new Map(all.map((u) => [u, { x: u.x, y: u.y }]));
  for (let it = 0; it < 20; it++) for (const a of all) for (const b of all) {
    if (a === b) continue;
    const pa = want.get(a), pb = want.get(b), d = dist(pa, pb);
    if (d < 120) { const k = (120 - d) / 2 / (d || 1), dx = (pa.x - pb.x || 1) * k, dy = (pa.y - pb.y) * k; Object.assign(pa, clampPos({ x: pa.x + dx, y: pa.y + dy })); Object.assign(pb, clampPos({ x: pb.x - dx, y: pb.y - dy })); }
  }
  return Promise.all(all.map((u) => { const w = want.get(u); if (dist(w, u) < 3) return null; const f = u.face; return moveTo(u, w, 0.5).then(() => { u.face = f; }); }));
}

function apply(s) {
  const u = s.u;
  if (u.dead) return;
  if (s.nope) float(u, s.nope, '#c0c0c0');
  if (s.dmg && u.dodge && !u.dodged) { u.dodged = true; float(u, '閃開', '#c0c0c0'); s = { ...s, dmg: 0 }; }
  if (s.red && !u.red) { u.red = true; setTimeout(() => float(u, '紅線', '#ff5c8d', 18), 120); }
  if (s.dmg && u.side === 'enemy' && !s.shared && !s.linked && !s.cross) {
    const h = hero();
    if (h.onHit) h.onHit(h, s);
    // 紅線：一個受傷，其他綁紅線的也受一半
    const v = Math.floor(s.dmg / 2);
    if (u.red && v > 0) for (const o of foes) if (o !== u && o.red && !o.dead) setTimeout(() => { fxPush({ type: 'thread', a: center(u), b: center(o), dur: 500 }); apply({ u: o, dmg: v, shared: true, linked: true }); }, 200);
  }
  if (s.dmg) {
    u.hp -= s.dmg; u.flash = performance.now() + 200;
    float(u, String(s.dmg), s.dmg >= 15 ? '#ffe070' : '#fff'); sfx(s.dmg >= 15 ? 'crit' : 'hit');
    fxPush({ type: 'burst', x: u.x, y: u.y - 46, color: hero().color, dur: 450, seed: Math.random() * 6 });
    skillFx(u);
    if (u.hp <= 0) { if (u.side === 'ally') fall(u); else { u.hp = 0; u.dead = true; u.deadAt = performance.now(); sfx('kill'); foeDown(u, true); } }
  }
  if (s.execute && !u.dead) { u.hp = 0; u.dead = true; u.deadAt = performance.now(); sfx('kill'); float(u, s.execute + '！', '#ffe070'); owe(u); fxPush({ type: 'burst', x: u.x, y: u.y - 46, color: '#ffe070', dur: 600, seed: 3 }); foeDown(u, true); return; }
  if (s.killHeal && u.dead) for (const a of heroes) if (!a.dead) apply({ u: a, heal: s.killHeal });
  if (s.burn && !u.dead) addBurn(u, s.burn);
  if (s.unburn && !u.dead) u.burn = 0;
  if (s.sleep && !u.dead && !u.elite) { u.stun = true; u.stunTxt = s.sleep === true ? '睡著了' : s.sleep; setTimeout(() => float(u, u.stunTxt, '#d0d0ff'), 200); }
  if (s.fear && !u.dead && !u.fear) { u.fear = true; setTimeout(() => float(u, '恐懼', '#d0b0ff', 18), 200); }
  if (s.stone && !u.dead) addStone(u, s.stone);
  if (s.unstun && !u.dead) { u.stun = false; float(u, '石像碎裂', '#c0c0c0'); }
  if (s.lost && !u.dead) addLost(u, s.lost);
  if (s.res) addRes(u, s.res);
  if (s.thaw && !u.dead) { u.frozen = false; setTimeout(() => float(u, '碎冰', '#c0ecff'), 150); fxPush({ type: 'ice', x: u.x, y: u.y, dur: 500 }); }
  if (s.frost && !u.dead) addFrost(u, s.frost);
  if (s.freeze && !u.dead) { u.frozen = true; u.frost = 0; fxPush({ type: 'ice', x: u.x, y: u.y, dur: 700 }); float(u, '凍住', '#a0e0ff'); }
  if (s.confuse && !u.dead) { u.confused = true; setTimeout(() => float(u, '亂點鴛鴦', '#ff5c8d'), 200); }
  if (s.heal && u.id === 'dagda' && s.heal > u.maxHp - u.hp) addRes(u, s.heal - (u.maxHp - u.hp));
  if (s.heal && u.side === 'ally' && casting && hero().onHeal) hero().onHeal(hero(), s);
  if (s.heal) { const v = Math.min(s.heal, u.maxHp - u.hp); if (v > 0) { u.hp += v; float(u, '+' + v, '#7fe07f'); sfx('heal'); skillFx(u); fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#7fe07f', dur: 500 }); } }
  if (s.shield) { u.shield += s.shield; sfx('shield'); skillFx(u); setTimeout(() => float(u, '盾 +' + s.shield, '#ffe070'), 150); fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#ffe070', dur: 500 }); }
  if (s.taunt) { u.taunt = true; for (const e of foes) if (!e.dead && !e.elite) e.intent = { target: u, dmg: e.atk }; float(u, '嘲諷', '#40d070'); }
  gearOnApply(s);
}

// 敵人倒下：出招的人（孫悟空、后羿）和場上的閻羅王加資源
function foeDown(u, byHero) {
  const h = hero();
  if (byHero && casting && h && h.onKill) h.onKill(h, u);
  for (const x of heroes) if (!x.dead && x.onAnyKill) x.onAnyKill(x, u);
}
// 生死簿勾銷的門檻（兩成，強化和專屬兵器再加）
const bookAt = (h) => (h.bookAt || 0.2) + (wears(h, 'ex_yama') ? 0.1 : 0);
// 不經過出招的傷害（燃燒）
function tickDmg(u, n, color) {
  if (u.dead) return;
  u.hp -= n; u.flash = performance.now() + 200; float(u, String(n), color);
  if (u.hp <= 0) { u.hp = 0; u.dead = true; u.deadAt = performance.now(); sfx('kill'); foeDown(u); }
}
function addBurn(u, n) { if (u.dead) return; u.burn = Math.max(u.burn, n); setTimeout(() => float(u, '燃燒', '#ff8a30', 18), 220); }
// 石化疊到 3 層變石像（下次不能行動）
function addStone(u, n) {
  if (u.dead || u.stun) return;
  u.stone += n;
  if (u.stone < run.stoneAt) return;
  u.stone = 0; u.stun = true; u.stunTxt = null; setTimeout(() => float(u, '變成石像', '#c0c0c0'), 240);
}
// 迷途疊到 5 層就迷路（下次打自己人）
function addLost(u, n) {
  if (u.dead) return;
  u.lost += n;
  if (u.lost < run.lostAt) return;
  u.lost = 0; u.confused = true; setTimeout(() => float(u, '迷路了', '#ff4050'), 240);
}
// 眼之碎片：隊伍裡有荷魯斯之影才會掉，場上最多 4 片
let shards = [];
function spawnShards() {
  const ho = heroes.find((h) => h.id === 'horusshadow' && !h.dead);
  if (!ho) return;
  for (let i = 0; i < run.shardN && shards.length < 4; i++) shards.push({ x: rnd(80, 540), y: rnd(290, 640) });
}
function pickShards() {
  const ho = heroes.find((h) => h.id === 'horusshadow' && !h.dead);
  if (!ho || path.length < 2) return;
  const pts = densify(path, 10);
  shards = shards.filter((c) => { if (!pts.some((p) => dist(p, c) < 34)) return true; addRes(ho, 1); fxPush({ type: 'ring', x: c.x, y: c.y, color: '#e0b850', dur: 500 }); return false; });
}

// 冰霜疊到 3 層就凍住；回傳這次有沒有凍住
function addFrost(u, n) {
  if (u.frozen || u.noStatus) return false;
  u.frost += n;
  if (u.frost < 3) { setTimeout(() => float(u, '冰霜 ' + u.frost, '#a0e0ff', 18), 150); return false; }
  u.frost = 0; u.frozen = true;
  fxPush({ type: 'ice', x: u.x, y: u.y, dur: 700 }); setTimeout(() => float(u, '凍住', '#a0e0ff'), 150);
  return true;
}

async function enemyTurn() {
  curse = 1;
  for (const h of heroes) h.carried = false;
  for (const e of foes) {
    if (e.dead) continue;
    // 溫迪戈：吃掉這輪畫過的線，每條攻擊 +2
    if (e.devour && trails.length && !e.frozen && !e.stun) {
      const n = trails.length; trails = []; e.atk += 2 * n; if (e.intent && e.intent.dmg) e.intent.dmg += 2 * n;
      fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#a0e0ff', dur: 600 }); float(e, `吃掉 ${n} 條線 攻擊+${2 * n}`, '#a0e0ff', 20); await wait(500);
    }
    if (e.frozen) { e.frozen = false; float(e, '凍住，跳過', '#a0e0ff'); await wait(380); continue; }
    if (e.stun) { e.stun = false; float(e, `${e.stunTxt || '石像'}，跳過`, '#c0c0c0'); e.stunTxt = null; await wait(380); continue; }
    // 先在原地把障礙物甩出來，再去攻擊
    await throwChains(e);
    // 恐懼：這次攻擊減半
    const scare = e.fear; e.fear = false;
    const hit = (n) => (scare ? Math.ceil(n / 2) : n);
    const alive = heroes.filter((h) => !h.dead);
    if (e.confused) {
      e.confused = false;
      const mates = foes.filter((o) => !o.dead && o !== e);
      if (mates.length) {
        const o = pick(mates);
        if (!await approach(e, o)) { await wait(380); continue; }
        e.lunge = performance.now(); await wait(180);
        o.hp -= hit(e.atk); o.flash = performance.now() + 200; sfx('hit'); float(o, String(hit(e.atk)), '#ff5c8d');
        if (o.hp <= 0) { o.hp = 0; o.dead = true; o.deadAt = performance.now(); }
      } else float(e, '發呆', '#ff5c8d');
    } else if (e.intent.seize) {
      const s = e.intent.seize;
      if (s.dead && s.soul > 0) {
        if (await approach(e, s)) { e.lunge = performance.now(); await wait(180); if (s.dead && s.soul > 0) seal(s, e); }
      } else {
        // 靈魂已經被救回去了：改打活著的人
        const t = s.dead ? pick(alive) : s;
        if (t && await approach(e, t)) { e.lunge = performance.now(); await wait(180); hurt(t, hit(e.atk)); }
      }
    } else if (e.intent.all) {
      // 全隊攻擊：典獄長原地放出凝視、審判官審判
      e.lunge = performance.now(); fxPush({ type: 'gaze', x: e.x, y: e.y - 60, dur: 600 }); float(e, e.intent.label || (e.intent.judge ? '審判' : '凝視'), '#ff8a8a', 22); await wait(250);
      for (const h of alive) hurt(h, hit(e.intent.dmg));
      if (e.intent.curse) { curse = 0.5; await wait(300); for (const h of alive) if (!h.dead) float(h, '墨水減半', '#ff4050', 18); }
      if (e.intent.gust) { await wait(300); await Promise.all(alive.filter((h) => !h.dead).map((h) => moveTo(h, { x: rnd(60, 290), y: rnd(320, 660) }, 1.4))); }
    } else {
      const t = e.intent.target.dead ? pick(alive) : e.intent.target;
      if (t && await approach(e, t)) {
        e.lunge = performance.now(); await wait(180); hurt(t, hit(e.intent.dmg));
        if (e.intent.twice && !t.dead) { await wait(260); e.lunge = performance.now(); await wait(180); hurt(t, hit(e.intent.dmg)); }
        if (e.intent.carry && !t.dead) { t.carried = true; float(t, '被抓走', '#d0b0ff', 20); }
        // 追債人：生命不到三成直接把魂抽走
        if (e.rip && !t.dead && t.hp < t.maxHp * 0.3) { await wait(200); t.hp = 0; t.dead = true; t.deadAt = performance.now(); sfx('fall'); float(t, '魂被抽走', '#c080ff', 20); seal(t, e); }
      }
    }
    await wait(380);
    freeSouls();
    if (heroes.every((h) => h.dead)) return lose();
  }
  if (foes.every((e) => e.dead)) return winFloor();
  await settle();
  busy = false;
  await nextHero();
}

// 敵人走到目標旁邊（預設站右邊、面向左；右邊沒位置就站左邊）
async function approach(e, t) {
  if (!await gearApproach(e, t)) return false;
  let to = { x: t.x + 85, y: t.y + 2 };
  if (to.x > 555) to = { x: t.x - 85, y: t.y + 2 };
  // 冰之吐息：路上踩到冰地就被凍住，這次打不出來
  const ice = !e.blink && frostOnWay(e, to);
  if (ice) { await moveTo(e, ice.at, 0.7); return frostStop(e, ice); }
  // 雪地足跡：踩過雪地疊 2 層冰霜，疊滿就凍在半路
  // 聖火之路：走過火路就燒起來（照樣攻擊）
  const fire = !e.blink && frostOnWay(e, to, 'fire');
  if (fire) { fire.z.done.add(e); addBurn(e, 2); fxPush({ type: 'burst', x: fire.at.x, y: fire.at.y - 30, color: '#ff8a30', dur: 450, seed: 1 }); }
  const snow = !e.blink && frostOnWay(e, to, 'snow');
  if (snow) {
    await moveTo(e, snow.at, 0.7); snow.z.done.add(e);
    if (addFrost(e, 2)) { e.frozen = false; float(e, '凍在半路', '#a0e0ff'); await wait(300); return false; }
  }
  await moveTo(e, to, 0.7);
  e.face = t.x < e.x ? -1 : 1;
  return ringHit(e);
}

function hurt(h, d) {
  d = gearHurt(h, d);
  const blocked = Math.min(h.shield, d); h.shield -= blocked; d -= blocked;
  if (blocked) float(h, '擋 ' + blocked, '#ffe070');
  if (d <= 0) return;
  h.hp -= d; h.flash = performance.now() + 200; sfx('hurt');
  const a = artAnim(h.art, 'hurt'); if (a) h.anim = { a, t0: performance.now() };
  setTimeout(() => float(h, String(d), '#ff7070'), blocked ? 250 : 0);
  if (h.hp <= 0) fall(h);
}

// ───── 靈魂：倒下的神魔變成靈魂，線穿過就救回；會搶魂的敵人會去抓 ─────
const SOUL_ROUNDS = 3, FLEE_ROUNDS = 2;
const lesson = (id) => { if (typeof Tutorial !== 'undefined') Tutorial.tip(id); };
function fall(u) {
  u.hp = 0; u.dead = true; u.deadAt = performance.now(); sfx('fall');
  if (u.sealed) return;
  u.soul = SOUL_ROUNDS; u.faded = false;
  setTimeout(() => float(u, '靈魂出竅', '#9fd8ff', 20), 250);
  lesson('soul');
}
function revive(u, hp, text) {
  u.dead = false; u.soul = 0; u.faded = false; u.sealed = false; u.sealedBy = null;
  u.hp = Math.max(1, Math.min(u.maxHp, hp));
  float(u, text, '#9fd8ff', 20); sfx('heal');
  fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#9fd8ff', dur: 700 });
}
function seal(u, e) {
  u.soul = 0; u.sealed = true; u.sealedBy = e;
  // 抓到靈魂的敵人過 2 輪就帶著靈魂逃走
  if (!e.fleeIn) e.fleeIn = FLEE_ROUNDS;
  fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#c080ff', dur: 700 });
  float(e, '封印 ' + u.name, '#d0b0ff', 20);
  lesson('sealed');
}
// 封印他們的敵人倒下，靈魂就放出來（回三成生命）
function freeSouls() {
  for (const u of heroes || []) if (u.sealed && u.sealedBy && u.sealedBy.dead && !u.sealedBy.fled) revive(u, Math.round(u.maxHp * 0.3), '靈魂放出來了');
}
// 抓著靈魂的敵人倒數完就逃走：靈魂跟著被帶走，這一世都回不來
function fleeCheck() {
  for (const e of foes) {
    if (e.dead || !e.fleeIn || !heroes.some((h) => h.sealed && h.sealedBy === e)) continue;
    if (--e.fleeIn > 0) continue;
    e.dead = true; e.fled = true; e.deadAt = performance.now();
    float(e, '帶著靈魂逃走了', '#d0b0ff', 20);
    fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#c080ff', dur: 700 });
  }
}
// 斬殺、吞噬這類直接帶走敵人的招式：欠一點因果債
function owe(u) {
  run.executes++;
  setTimeout(() => float(u, '因果債 +1', '#c080ff', 18), 450);
  lesson('debt');
}
// 這一筆會救到誰：線經過倒下隊友的靈魂（畫圈的話圈住也算）
function soulHits() {
  if (!heroes || path.length < 2) return [];
  return heroes.filter((u) => u.dead && u.soul > 0 && (path.some((p, i) => i && segHitsCircle(path[i - 1], p, center(u), HIT_R)) || (skill().shape === 'circle' && closed && inPoly(center(u), path))));
}

// ───── 打完一層 ─────
// 倒下的神魔過層後回三成生命，站著的回 6
function endResult(win) {
  const hp = {}, res = {};
  for (const h of heroes) { hp[h.id] = !win || h.sealed ? 0 : h.dead ? Math.round(h.maxHp * 0.3) : Math.min(h.maxHp, h.hp + 6); res[h.id] = h.res; }
  const dead = foes.filter((e) => e.dead && !e.fled);
  // sealed：被封印、這一世不能再上場的；executes：直接帶走幾個（欠的因果債）
  return { win, hp, res, kills: dead.length, exp: dead.reduce((a, e) => a + (e.exp || 0), 0), turns: turn,
    sealed: heroes.filter((h) => h.sealed).map((h) => h.id), executes: run.executes, debtorKilled: foes.some((e) => e.key === 'debtor' && e.dead && !e.fled) };
}
function winFloor() {
  busy = true; sfx('win');
  const c = cfg; wait(600).then(() => c.onEnd(endResult(true)));
}
function lose() {
  busy = true; sfx('lose');
  const c = cfg; wait(900).then(() => c.onEnd(endResult(false)));
}
// 離開戰鬥畫面：還在跑的動作全部停掉
function stop() { gen++; busy = true; hideBox(); }

function showBox(html) { $('.box').innerHTML = html; $('.overlay').classList.add('show'); }
function hideBox() { $('.overlay').classList.remove('show'); }
function tip(html) { $('.tip').innerHTML = html; }

// ───── 裝備：神器和邪物，效果都是改變線的畫法 ─────
// 每位神魔兩格（兵器、法寶）。神族只能用神器、魔族只能用邪物，專屬兵器只有本人能用。背包跟著靈魂走，存在手機裡。
const SLOT = { weapon: '兵器', charm: '法寶' };
const SIDE = Object.fromEntries(ALL_IDS.map((id) => [id, HEROES[id].faith]));
const GEAR = {
  ex_guangong: { n: '青龍偃月刀', kind: '神器', slot: 'weapon', own: 'guangong', icon: '青', color: '#40d070', from: '三國演義',
    d: '過關斬將：直線每砍死一個敵人，線就再往前多斬一段。直線招式傷害 +3。' },
  ex_yuelao: { n: '姻緣簿', kind: '神器', slot: 'weapon', own: 'yuelao', icon: '緣', color: '#ff5c8d', from: '月下老人',
    d: '一線牽：月老一招打到的敵人兩兩綁上紅線（到下一輪為止），其中一個受傷，另一個也受一半。' },
  ex_yukionna: { n: '冰之吐息', kind: '邪物', slot: 'weapon', own: 'yukionna', icon: '霜', color: '#a0e0ff', from: '日本妖怪',
    d: '雪地：雪女直線、自由線畫過的地方結冰一輪。第一個走過冰地去攻擊的敵人會被凍住、打不出來，冰也跟著碎掉。' },
  // 通用裝備，分五個等級（tier 0 白・普通 → 4 橘・傳說）。st 是通用數值：dmg 每一下加傷害、ink 墨水加成、shield 每輪護盾、regen 每輪回血
  // ── 神器・兵器 ──
  peachwood: { n: '桃木劍', kind: '神器', slot: 'weapon', tier: 0, icon: '桃', from: '民間信仰', st: { dmg: 1 },
    d: '道士驅邪用的桃木劍：每一下 +1 傷害。' },
  coinsword: { n: '銅錢劍', kind: '神器', slot: 'weapon', tier: 0, icon: '錢', from: '民間信仰', st: { ink: 0.1 },
    d: '銅錢串成的法劍：墨水 +10%。' },
  bronze: { n: '青銅古劍', kind: '神器', slot: 'weapon', tier: 1, icon: '銅', from: '上古傳說', st: { dmg: 2 },
    d: '祭祀天神用的古劍：每一下 +2 傷害。' },
  zhaoyao: { n: '照妖鏡', kind: '神器', slot: 'weapon', tier: 1, icon: '照', from: '封神演義', st: { ink: 0.2 },
    d: '照出妖怪原形的寶鏡：墨水 +20%。' },
  ruyi: { n: '芭蕉扇', kind: '神器', slot: 'weapon', tier: 2, icon: '扇', from: '西遊記', st: { dmg: 1 },
    d: '鐵扇公主的扇子，一搧就起狂風：線變粗 50%，比較容易掃到敵人；每一下 +1 傷害。' },
  kusanagi: { n: '草薙劍', kind: '神器', slot: 'weapon', tier: 2, icon: '劍', from: '日本三神器',
    d: '日本武尊在火海裡用它割草開路：自由線、折線每一下 +4 傷害。' },
  vajra: { n: '金剛杵', kind: '神器', slot: 'weapon', tier: 2, icon: '杵', from: '佛教傳說',
    d: '帝釋天打雷用的法器：畫圈、點選招每一下 +5 傷害。' },
  yata: { n: '八咫鏡', kind: '神器', slot: 'weapon', tier: 3, icon: '鏡', from: '日本三神器', st: { dmg: 2 },
    d: '照出天照大神的鏡子：直線碰到戰場邊緣會反射一次，剩下的墨水全部用來反彈；每一下 +2 傷害。' },
  qiankun: { n: '乾坤圈', kind: '神器', slot: 'weapon', tier: 3, icon: '圈', from: '封神演義', st: { dmg: 2 },
    d: '哪吒的金圈：畫的圈會留在場上一輪，敵人走進圈裡攻擊時受 10 傷害；每一下 +2 傷害。' },
  mjolnir: { n: '雷神之鎚', kind: '神器', slot: 'weapon', tier: 3, icon: '鎚', from: '北歐神話',
    d: '索爾的鎚子，丟出去一定命中：直線、衝刺招打中的第一個敵人多受 10 傷害。' },
  gungnir: { n: '永恆之槍', kind: '神器', slot: 'weapon', tier: 3, icon: '槍', from: '北歐神話', st: { dmg: 2, ink: 0.3 },
    d: '奧丁的槍岡格尼爾，擲出必中：墨水 +30%，每一下 +2 傷害。' },
  xuanyuan: { n: '軒轅劍', kind: '神器', slot: 'weapon', tier: 4, icon: '軒', from: '中華上古傳說', st: { dmg: 5, ink: 0.2 },
    d: '黃帝斬妖的聖道之劍：每一下 +5 傷害，墨水 +20%。' },
  // ── 神器・法寶 ──
  pingan: { n: '平安符', kind: '神器', slot: 'charm', tier: 0, icon: '符', from: '民間信仰', st: { shield: 2 },
    d: '廟裡求來的平安符：每輪開始得 2 護盾。' },
  incense: { n: '香火袋', kind: '神器', slot: 'charm', tier: 0, icon: '香', from: '民間信仰', st: { regen: 1 },
    d: '裝著廟裡香灰的小袋子：每輪開始回 1 生命。' },
  jadepei: { n: '護身玉珮', kind: '神器', slot: 'charm', tier: 1, icon: '玉', from: '民間信仰', st: { regen: 2 },
    d: '戴久了會替主人擋災的玉：每輪開始回 2 生命。' },
  bell: { n: '開光銅鈴', kind: '神器', slot: 'charm', tier: 1, icon: '鈴', from: '民間信仰', st: { shield: 3 },
    d: '鈴聲讓邪祟不敢靠近：每輪開始得 3 護盾。' },
  peach: { n: '蟠桃', kind: '神器', slot: 'charm', tier: 2, icon: '桃', from: '西遊記', st: { regen: 4 },
    d: '王母娘娘的仙桃，吃了延年益壽：每輪開始回 4 生命。' },
  goldbell: { n: '金鐘罩', kind: '神器', slot: 'charm', tier: 2, icon: '鐘', from: '少林傳說', st: { shield: 5 },
    d: '刀槍不入的護體金鐘：每輪開始得 5 護盾。' },
  aegis: { n: '埃癸斯神盾', kind: '神器', slot: 'charm', tier: 3, icon: '盾', from: '希臘神話', st: { shield: 8 },
    d: '雅典娜的神盾：每輪開始得 8 護盾。' },
  hagoromo: { n: '天女的羽衣', kind: '神器', slot: 'charm', tier: 3, icon: '羽', from: '日本傳說', st: { shield: 3 },
    d: '穿上就能飛：出招後可以點戰場上任何地方飛過去，自己決定站哪；每輪開始得 3 護盾。' },
  nuwa: { n: '女媧石', kind: '神器', slot: 'charm', tier: 4, icon: '媧', from: '中華上古傳說', st: { regen: 5, shield: 5 },
    d: '女媧補天剩下的五色石：每輪開始回 5 生命、得 5 護盾。' },
  // ── 邪物・兵器 ──
  boneknife: { n: '骨刀', kind: '邪物', slot: 'weapon', tier: 0, icon: '骨', from: '民間怪談', st: { dmg: 1 },
    d: '用不知道誰的骨頭磨成的刀：每一下 +1 傷害。' },
  coffinnail: { n: '棺材釘', kind: '邪物', slot: 'weapon', tier: 0, icon: '釘', from: '民間怪談', st: { ink: 0.1 },
    d: '從老棺材上拔下來的長釘：墨水 +10%。' },
  soulscythe: { n: '噬魂鐮', kind: '邪物', slot: 'weapon', tier: 1, icon: '鐮', from: '死神傳說', st: { dmg: 2 },
    d: '收割靈魂的鐮刀：每一下 +2 傷害。' },
  lantern: { n: '鬼火燈籠', kind: '邪物', slot: 'weapon', tier: 1, icon: '燈', from: '日本妖怪傳說', st: { ink: 0.2 },
    d: '提燈小僧手上那盞青色燈籠：墨水 +20%。' },
  tsuchigumo: { n: '土蜘蛛毒絲', kind: '邪物', slot: 'weapon', tier: 2, icon: '蛛', from: '日本妖怪傳說',
    d: '源賴光斬殺的巨大蜘蛛吐的絲：自由線、折線每一下 +4 傷害。' },
  kitsunebi: { n: '九尾狐火', kind: '邪物', slot: 'weapon', tier: 2, icon: '狐', from: '東亞妖怪傳說', st: { dmg: 2 },
    d: '九尾狐吐出的鬼火：每一下 +2 傷害，打到的敵人燃燒 1 輪。代價：每輪開始扣 1 生命。', roundCost: 1 },
  muramasa: { n: '妖刀村正', kind: '邪物', slot: 'weapon', tier: 3, icon: '妖', from: '日本妖刀傳說', st: { dmg: 2 },
    d: '出鞘必見血：每一下 +2 傷害；自由線同一個敵人每多穿一次，那一下再 +3。代價：每多穿一次自己扣 1 生命。' },
  tyrfing: { n: '魔劍提爾鋒', kind: '邪物', slot: 'weapon', tier: 3, icon: '魔', from: '北歐傳說', st: { dmg: 5 },
    d: '矮人被逼著打造、下了詛咒的劍，出鞘一定要見血：每一下 +5 傷害。代價：每輪開始扣 1 生命。', roundCost: 1 },
  chiyou: { n: '蚩尤戰斧', kind: '邪物', slot: 'weapon', tier: 4, icon: '蚩', from: '中華上古傳說', st: { dmg: 6, ink: 0.2 },
    d: '和黃帝大戰涿鹿的戰神之斧：每一下 +6 傷害，墨水 +20%。代價：每輪開始扣 1 生命。', roundCost: 1 },
  // ── 邪物・法寶 ──
  blackcat: { n: '黑貓鈴鐺', kind: '邪物', slot: 'charm', tier: 0, icon: '貓', from: '民間怪談', st: { shield: 2 },
    d: '黑貓脖子上掉下來的鈴鐺：每輪開始得 2 護盾。' },
  paperman: { n: '紙紮人', kind: '邪物', slot: 'charm', tier: 0, icon: '紙', from: '民間習俗', st: { regen: 1 },
    d: '燒給死人的紙紮替身：每輪開始回 1 生命。' },
  skullbeads: { n: '骷髏念珠', kind: '邪物', slot: 'charm', tier: 1, icon: '珠', from: '密教傳說', st: { shield: 3 },
    d: '一顆顆骷髏串成的念珠：每輪開始得 3 護盾。' },
  wara: { n: '丑時參的稻草人', kind: '邪物', slot: 'charm', tier: 1, icon: '咒', from: '日本詛咒',
    d: '半夜把釘子釘進稻草人：每次受傷，隨機一個敵人受 3 傷害。' },
  monkeypaw: { n: '猴爪', kind: '邪物', slot: 'charm', tier: 2, icon: '爪', from: '英國怪談',
    d: '能實現三個願望、代價卻很可怕的乾枯猴爪：每打倒一個敵人，全隊各回 4 生命。代價：每輪開始扣 1 生命。', roundCost: 1 },
  faust: { n: '浮士德的契約', kind: '邪物', slot: 'charm', tier: 2, icon: '契', from: '德國傳說', st: { ink: 0.4 },
    d: '用靈魂跟惡魔梅菲斯特換來的力量：墨水 +40%。代價：每輪開始扣 1 生命。', roundCost: 1 },
  dracula: { n: '德古拉的斗篷', kind: '邪物', slot: 'charm', tier: 3, icon: '血', from: '吸血鬼傳說',
    d: '吸血鬼伯爵的披風：打出的傷害吸回 30% 生命。代價：每輪開始扣 1 生命（怕光）。', roundCost: 1 },
  pandora: { n: '潘朵拉的盒子', kind: '邪物', slot: 'charm', tier: 3, icon: '盒', from: '希臘神話',
    d: '打開就關不回去：每輪開始開一次盒，一半機率敵人全體各受 6 傷害，一半機率自己受 3。' },
  gloryhand: { n: '光榮之手', kind: '邪物', slot: 'charm', tier: 3, icon: '手', from: '歐洲傳說',
    d: '用絞刑犯的手做的蠟燭台，點起來屋裡的人都睡死：每輪開始隨機一個一般敵人睡著（下次不能行動）。代價：每輪開始扣 1 生命。', roundCost: 1 },
  solomon: { n: '所羅門王的指環', kind: '邪物', slot: 'charm', tier: 4, icon: '環', from: '中東傳說', st: { shield: 5 },
    d: '能使喚七十二柱魔神的指環：每輪開始得 5 護盾，並讓一個一般敵人錯亂（下次行動改打自己的同伴）。代價：每輪開始扣 1 生命。', roundCost: 1 },
  // 另外 10 位的專屬兵器
  ex_brigid: { n: '布麗姬的聖火', kind: '神器', slot: 'weapon', own: 'brigid', icon: '火', color: '#ff8a30', from: '凱爾特神話',
    d: '聖火之路：布麗姬直線、自由線畫過的地方燒一輪。敵人走過火路去攻擊，會燃燒 2 輪。' },
  ex_tudigong: { n: '福德拐杖', kind: '神器', slot: 'weapon', own: 'tudigong', icon: '廟', color: '#ffc830', from: '民間信仰',
    d: '土地廟：土地公出招後停下的地方立起一座小廟（到下一輪）。站在廟附近的隊友，每次受到的傷害 -3。' },
  ex_hermes: { n: '雙蛇杖', kind: '神器', slot: 'weapon', own: 'hermes', icon: '杖', color: '#f0d070', from: '希臘神話',
    d: '信使之杖：赫爾墨斯的線經過的隊友，下一招的墨水 +50%。' },
  ex_dagda: { n: '無底大鍋', kind: '神器', slot: 'weapon', own: 'dagda', icon: '鍋', color: '#d8a060', from: '凱爾特神話',
    d: '吃不完的大鍋：達格達每打中敵人一下，自己回 2 生命（滿了就存成飽足）。' },
  ex_hanako: { n: '第三間的門把', kind: '邪物', slot: 'weapon', own: 'hanako', icon: '門', color: '#b060e0', from: '日本學校怪談',
    d: '關進隔間：花子打到的敵人這一輪走不出隔間，只能打身邊很近的人，要走過去打人就會落空。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_anubis: { n: '冥界天秤', kind: '邪物', slot: 'weapon', own: 'anubis', icon: '秤', color: '#f0c040', from: '埃及神話',
    d: '秤心：阿努比斯打完，生命剩不到四分之一的一般敵人直接被吞掉（精英除外）。代價：每吞一個自己扣 2 生命。' },
  ex_hachi: { n: '白色寬簷帽', kind: '邪物', slot: 'weapon', own: 'hachi', icon: '帽', color: '#e8e8ff', from: '日本網路怪談',
    d: '從高處往下看：八尺大人每一下 +4 傷害，打恐懼中的敵人再 +4。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_medusa: { n: '石化之眼', kind: '邪物', slot: 'weapon', own: 'medusa', icon: '蛇', color: '#70d060', from: '希臘神話',
    d: '最後一眼：美杜莎的線畫到哪裡停，那附近的敵人各疊 1 層石化。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_horusshadow: { n: '碎裂的荷魯斯之眼', kind: '邪物', slot: 'weapon', own: 'horusshadow', icon: '瞳', color: '#e0b850', from: '埃及神話',
    d: '被挖出的那隻眼：荷魯斯之影的線每碰到一個敵人，就多撿 1 片眼之碎片。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_redgirl: { n: '紅色雨衣', kind: '邪物', slot: 'weapon', own: 'redgirl', icon: '衣', color: '#ff4050', from: '臺灣都市傳說',
    d: '山裡的那件紅衣：每輪第一個要打紅衣小女孩的敵人會在山裡迷路，走到別的地方、這次打不到人。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_wukong: { n: '如意金箍棒', kind: '神器', slot: 'weapon', own: 'wukong', icon: '棒', color: '#ffc040', from: '西遊記',
    d: '東海龍宮的定海神針，一萬三千五百斤：孫悟空的直線招墨水 +50%，每一下 +3 傷害（分身不算）。' },
  ex_houyi: { n: '彤弓素矰', kind: '神器', slot: 'weapon', own: 'houyi', icon: '弓', color: '#ff8040', from: '山海經',
    d: '帝俊賜給后羿的紅弓白箭：后羿的直線招每一下 +3 傷害，九日墜落多射 2 支箭。' },
  ex_mazu: { n: '井中銅符', kind: '神器', slot: 'weapon', own: 'mazu', icon: '符', color: '#ff6a80', from: '媽祖傳說',
    d: '媽祖少女時從井裡得到的銅符：媽祖的每一下治療多回 3；每輪開始，全隊各回 2 生命。' },
  ex_yama: { n: '生死簿', kind: '邪物', slot: 'weapon', own: 'yama', icon: '簿', color: '#8a70ff', from: '民間信仰',
    d: '記著每個人壽命的簿子：勾銷的門檻再加一成，每勾銷一個敵人全隊回 4 生命。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_kuchisake: { n: '生鏽的裁縫剪', kind: '邪物', slot: 'weapon', own: 'kuchisake', icon: '剪', color: '#f06070', from: '日本都市傳說',
    d: '口罩下那道裂口就是它剪的：口裂女的衝刺招每一下 +3，打恐懼中的敵人再 +3。代價：每輪開始扣 1 生命。', roundCost: 1 },
};
// 等級：白・普通、綠・精良、藍・優良、紫・卓越、橘・傳說。專屬兵器都是傳說；color 改成等級的顏色，原本的顏色留給線（line）
const TIER = [{ n: '普通', c: '#e6e6e6' }, { n: '精良', c: '#5ad16a' }, { n: '優良', c: '#4aa0ff' }, { n: '卓越', c: '#b673ff' }, { n: '傳說', c: '#ff9a30' }];
for (const it of Object.values(GEAR)) { if (it.own) it.tier = 4; it.line = it.color; it.color = TIER[it.tier].c; it.rank = TIER[it.tier].n; }
// 裝備清單：背包和誰身上穿什麼由呼叫的人存（試玩存在手機、主遊戲存在這一世的存檔），戰鬥裡每位神魔帶著 gear 陣列上場
const gearOf = (h) => (h.gear || []).filter((id) => GEAR[id]);
const wears = (h, id) => !!h && gearOf(h).includes(id);
const gstat = (h, k) => (h ? gearOf(h).reduce((a, id) => a + ((GEAR[id].st || {})[k] || 0), 0) : 0);
// anyKind：這一世為人，神器、邪物都能用（專屬兵器還是只有本人能用）
const canUse = (heroId, id, anyKind) => { const it = GEAR[id]; return it.own ? it.own === heroId : anyKind || it.kind === (SIDE[heroId] === '神' ? '神器' : '邪物'); };
const hitR = () => HIT_R * (wears(hero(), 'ruyi') ? 1.5 : 1) * (skill().wide ? 1.5 : 1);
const lineShape = (sk) => sk.shape === 'line' || sk.shape === 'dash';
const freeShape = (sk) => sk.shape === 'free' || sk.shape === 'zigzag';
let zones = [], flying = null;
// 移動：每位神魔每次輪到可以先走一段（最遠 MOVE_R），再畫招
let moving = false;
const MOVE_R = 230;
window.__g = () => ({ gs, zones, flying: !!flying });

// 直線的路徑：碰到戰場邊就停；帶八咫鏡會反射一次；extra 是青龍偃月刀斬殺後多出來的長度
function wallHit(p, d) {
  const tx = d.x > 0 ? (W - 6 - p.x) / d.x : d.x < 0 ? (6 - p.x) / d.x : Infinity;
  const ty = d.y > 0 ? (H - 6 - p.y) / d.y : d.y < 0 ? (FLOOR + 4 - p.y) / d.y : Infinity;
  return { t: Math.max(0, Math.min(tx, ty)), flipX: tx <= ty };
}
function rayPath(s, dir, L, extra = 0) {
  const pts = [s], ink = inkMax();
  let p = s, d = { ...dir }, used = 0, rem = L, bounce = wears(hero(), 'yata') ? 1 : 0;
  for (;;) {
    const w = wallHit(p, d);
    if (bounce && rem >= w.t - 2 && ink - used - w.t > 20) {
      p = { x: p.x + d.x * w.t, y: p.y + d.y * w.t }; pts.push(p); used += w.t;
      d = w.flipX ? { x: -d.x, y: d.y } : { x: d.x, y: -d.y };
      rem = ink - used; bounce--; continue;
    }
    const len = Math.min(rem + extra, w.t);
    pts.push({ x: p.x + d.x * len, y: p.y + d.y * len });
    break;
  }
  // 鎖鏈把線剪斷
  for (let i = 1; i < pts.length; i++) for (const c of cutters()) {
    const a = pts[i - 1], b = pts[i];
    const cut = cutHit(a, b, c); if (cut) { pts[i] = cut; pts.length = i + 1; }
  }
  return pts;
}
// 目標在線上的位置（從起點算的距離），拿來排出手順序
function along(u) {
  const c = center(u); let best = 1e9, at = 0, cum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = dist(a, b) || 1;
    const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / (L * L)));
    const dd = Math.hypot(a.x + (b.x - a.x) * t - c.x, a.y + (b.y - a.y) * t - c.y);
    if (dd < best) { best = dd; at = cum + t * L; }
    cum += L;
  }
  return at;
}
const lineHits = () => living().filter((u) => u !== hero() && path.some((p, i) => i && segHitsCircle(path[i - 1], p, center(u), hitR()))).sort((a, b) => along(a) - along(b));
function lineKills() {
  const sum = new Map();
  for (const s of results()) if (s.dmg && s.u.side === 'enemy') sum.set(s.u, (sum.get(s.u) || 0) + s.dmg);
  return [...sum].filter(([u, d]) => d >= u.hp).length;
}
function densify(pts, step = 12) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
  }
  return out;
}

// 裝備對出招結果的加成
function gearResults(h, res) {
  const sk = skill();
  if (wears(h, 'ex_guangong') && lineShape(sk)) res = res.map((s) => (s.dmg && s.u.side === 'enemy' ? { ...s, dmg: s.dmg + 3 } : s));
  if ((wears(h, 'ex_wukong') || wears(h, 'ex_houyi')) && lineShape(sk)) res = res.map((s) => (s.dmg && s.u.side === 'enemy' && !s.clone ? { ...s, dmg: s.dmg + 3 } : s));
  if (wears(h, 'ex_kuchisake') && sk.shape === 'dash') res = res.map((s) => (s.dmg && s.u.side === 'enemy' ? { ...s, dmg: s.dmg + (s.u.fear ? 6 : 3) } : s));
  if (wears(h, 'ex_hachi')) res = res.map((s) => (s.dmg && s.u.side === 'enemy' ? { ...s, dmg: s.dmg + (s.u.fear ? 8 : 4) } : s));
  if (wears(h, 'ex_mazu')) res = res.map((s) => (s.heal ? { ...s, heal: s.heal + 3 } : s));
  const foeHit = (s) => s.dmg && s.u.side === 'enemy';
  const plus = gstat(h, 'dmg') + (freeShape(sk) && (wears(h, 'kusanagi') || wears(h, 'tsuchigumo')) ? 4 : 0) + ((sk.shape === 'circle' || sk.shape === 'tap') && wears(h, 'vajra') ? 5 : 0);
  if (plus) res = res.map((s) => (foeHit(s) && !s.clone ? { ...s, dmg: s.dmg + plus } : s));
  if (wears(h, 'mjolnir') && lineShape(sk)) { const i = res.findIndex(foeHit); if (i >= 0) res = res.map((s, k) => (k === i ? { ...s, dmg: s.dmg + 10 } : s)); }
  if (wears(h, 'kitsunebi')) res = res.map((s) => (foeHit(s) ? { ...s, burn: Math.max(s.burn || 0, 1) } : s));
  if (wears(h, 'monkeypaw')) res = res.map((s) => (foeHit(s) ? { ...s, killHeal: Math.max(s.killHeal || 0, 4) } : s));
  if (wears(h, 'muramasa') && freeShape(sk)) {
    const seen = new Map();
    res = res.map((s) => {
      if (!s.dmg || s.u.side !== 'enemy') return s;
      const n = seen.get(s.u) || 0; seen.set(s.u, n + 1);
      return n ? { ...s, dmg: s.dmg + 3 * n, cost: 1 } : s;
    });
  }
  return res;
}

// 姻緣簿：出招前把這一招會打到的敵人兩兩綁起來
function gearLink(h) {
  h.inkBuff = 0;
  if (!wears(h, 'ex_yuelao')) return;
  const en = [...new Set(hits.filter((u) => u.side === 'enemy' && !u.dead))];
  for (let i = 0; i + 1 < en.length; i += 2) { en[i].link = en[i + 1]; en[i + 1].link = en[i]; float(en[i + 1], '紅線', '#ff5c8d', 18); }
}

// 每一下打出去之後：紅線分傷、吸血、妖刀反噬
function gearOnApply(s) {
  const h = hero();
  if (s.dmg && s.u.side === 'enemy' && !s.linked && !s.shared) {
    if (wears(h, 'ex_dagda')) apply({ u: h, heal: 2 });
    const u = s.u;
    if (wears(h, 'ex_anubis') && !u.dead && !u.elite && u.hp <= u.maxHp / 4) {
      setTimeout(() => {
        if (u.dead) return;
        u.hp = 0; u.dead = true; u.deadAt = performance.now(); float(u, '秤心：吞掉', '#f0c040', 20); owe(u);
        fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#f0c040', dur: 600 });
        if (h.hp > 2) { h.hp -= 2; float(h, '天秤 -2', '#f0c040', 18); }
      }, 260);
    }
  }
  if (s.dmg && s.u.link && !s.linked && !s.u.link.dead) {
    const o = s.u.link, v = Math.floor(s.dmg / 2);
    if (v > 0) setTimeout(() => { fxPush({ type: 'thread', a: { x: s.u.x, y: s.u.y - 46 }, b: { x: o.x, y: o.y - 46 }, dur: 500 }); apply({ u: o, dmg: v, linked: true }); }, 160);
  }
  if (s.dmg && s.u.side === 'enemy' && !s.u.noStatus && wears(h, 'dracula')) {
    const v = Math.min(Math.max(1, Math.round(s.dmg * 0.3)), h.maxHp - h.hp);
    if (v > 0) { h.hp += v; float(h, '吸 +' + v, '#e04060', 18); }
  }
  if (s.cost && h.hp > 1) { h.hp -= 1; float(h, '妖刀 -1', '#c060ff', 18); }
}

// 出招跑完之後：留下冰地、乾坤圈；穿羽衣的可以飛
async function gearAfterMove(h, sk) {
  const en = [...new Set(hits.filter((u) => u.side === 'enemy' && !u.dead))];
  const foot = path.length > 1 ? densify(path, 10).map((p) => ({ x: p.x, y: p.y + 46 })) : [];
  if (wears(h, 'ex_brigid') && sk.shape !== 'circle' && sk.shape !== 'tap' && foot.length) zones.push({ type: 'fire', pts: foot, done: new Set() });
  if (wears(h, 'ex_tudigong')) { zones.push({ type: 'shrine', x: h.x, y: h.y }); float(h, '土地廟', '#ffc830', 18); }
  if (wears(h, 'ex_hermes')) for (const a of hits) if (a.side === 'ally' && a !== h && !a.dead) { a.inkBuff = 1.5; float(a, '墨水 +50%', '#f0d070', 18); }
  if (wears(h, 'ex_hanako')) for (const e of en) { e.trapped = true; float(e, '關進隔間', '#b060e0', 18); }
  if (wears(h, 'ex_horusshadow') && en.length) addRes(h, en.length);
  if (wears(h, 'ex_medusa') && path.length) { const end = path[path.length - 1]; for (const e of foes) if (!e.dead && dist(center(e), end) < 110) addStone(e, 1); fxPush({ type: 'ring', x: end.x, y: end.y, color: '#70d060', dur: 600 }); }
  if (wears(h, 'ex_yukionna') && sk.shape !== 'circle' && sk.shape !== 'tap' && path.length > 1) zones.push({ type: 'frost', pts: densify(path, 10).map((p) => ({ x: p.x, y: p.y + 46 })) });
  if (wears(h, 'qiankun') && sk.shape === 'circle' && closed) zones.push({ type: 'ring', poly: path.slice(), done: new Set() });
  if (!wears(h, 'hagoromo')) return;
  const go = $('.go'), txt = go.textContent;
  go.textContent = '留在這'; go.disabled = false;
  tip('<b>天女的羽衣</b>：點戰場上一個地方飛過去，或按「留在這」。');
  const to = await new Promise((res) => { flying = res; });
  flying = null; go.textContent = txt;
  if (to) await moveTo(h, { x: to.x, y: to.y + 46 }, 1.2, true);
  updateUi();
}

function gearNewRound(first) {
  zones = [];
  for (const e of foes || []) { e.link = null; e.trapped = false; }
  for (const h of heroes || []) h.rainUsed = false;
  for (const h of heroes || []) if (!h.dead) {
    const sh = gstat(h, 'shield'), rg = gstat(h, 'regen');
    if (sh) apply({ u: h, shield: sh });
    if (rg && !first) apply({ u: h, heal: rg });
  }
  if (first) return;
  for (const h of heroes) if (!h.dead) {
    const live = foes.filter((e) => !e.dead), plain = live.filter((e) => !e.elite);
    if (wears(h, 'pandora') && live.length) {
      if (Math.random() < 0.5) { float(h, '盒子：災厄飛向敵人', '#a070d0', 18); for (const e of live) tickDmg(e, 6, '#a070d0'); }
      else if (h.hp > 1) { const v = Math.min(3, h.hp - 1); h.hp -= v; float(h, '盒子反噬 -' + v, '#a070d0', 18); }
    }
    const pick = () => plain.filter((e) => !e.dead)[Math.floor(Math.random() * plain.filter((e) => !e.dead).length)];
    if (wears(h, 'gloryhand') && pick()) { const e = pick(); e.stun = true; e.stunTxt = '睡死了'; float(e, '光榮之手：睡死了', '#f0e0a0', 18); }
    if (wears(h, 'solomon') && pick()) { const e = pick(); e.confused = true; float(e, '指環：錯亂', '#ff9a30', 18); }
  }
  // 井中銅符：每輪開始全隊回 2
  for (const h of heroes) if (!h.dead && wears(h, 'ex_mazu')) for (const a of heroes) if (!a.dead) apply({ u: a, heal: 2 });
  // 邪物的代價：每輪開始扣生命（不會扣到倒下）
  for (const h of heroes) {
    const cost = gearOf(h).reduce((a, id) => a + (GEAR[id].roundCost || 0), 0);
    if (!h.dead && cost && h.hp > 1) { const v = Math.min(cost, h.hp - 1); h.hp -= v; float(h, '邪物 -' + v, '#c060ff', 18); }
  }
}
// 土地廟：附近的隊友受傷 -3
function gearHurt(h, d) {
  if (d > 0 && wears(h, 'wara')) { const live = foes.filter((e) => !e.dead); if (live.length) tickDmg(live[Math.floor(Math.random() * live.length)], 3, '#c0a060'); }
  const z = zones.find((z) => z.type === 'shrine' && dist(z, h) < 150);
  if (!z || d <= 0) return d;
  float(h, '土地廟 -3', '#ffc830', 16);
  return Math.max(0, d - 3);
}
// 敵人要走過去打人之前：紅色雨衣讓他迷路、隔間關住他
async function gearApproach(e, t) {
  if (t.side === 'ally' && wears(t, 'ex_redgirl') && !t.rainUsed) {
    t.rainUsed = true; float(e, '在山裡迷路', '#ff4050');
    await moveTo(e, { x: rnd(300, 550), y: rnd(320, 660) }, 0.8);
    return false;
  }
  if (e.trapped && dist(e, t) > 150) { float(e, '走不出隔間', '#b060e0'); await wait(300); return false; }
  return true;
}

// 敵人走過去的路上有沒有冰地
function frostOnWay(e, to, type = 'frost') {
  const a = { x: e.x, y: e.y }, n = Math.ceil(dist(a, to) / 8);
  for (let k = 1; k <= n; k++) {
    const p = { x: a.x + (to.x - a.x) * k / n, y: a.y + (to.y - a.y) * k / n };
    const z = zones.find((z) => z.type === type && !(z.done && z.done.has(e)) && z.pts.some((q) => dist(q, p) < 26));
    if (z) return { z, at: p };
  }
  return null;
}
async function frostStop(e, ice) {
  zones = zones.filter((z) => z !== ice.z);
  fxPush({ type: 'ice', x: e.x, y: e.y, dur: 800 }); float(e, '踩到冰，凍住', '#a0e0ff');
  await wait(300);
  return false;
}
// 乾坤圈：走進圈裡的敵人受傷，每個敵人一個圈只算一次
function ringHit(e) {
  for (const z of zones) {
    if (z.type !== 'ring' || z.done.has(e) || !inPoly(center(e), z.poly)) continue;
    z.done.add(e);
    e.hp -= 10; e.flash = performance.now() + 200; float(e, '乾坤圈 10', '#ffd060');
    fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#ffd060', dur: 500 });
    if (e.hp <= 0) { e.hp = 0; e.dead = true; e.deadAt = performance.now(); return false; }
  }
  return true;
}

// ───── 裝備的畫面 ─────
function gearLine(h) {
  const w = gearOf(h).find((id) => GEAR[id].slot === 'weapon');
  const color = { muramasa: '#c060ff', ruyi: '#ffb040', yata: '#ffe070' }[w] || (w && GEAR[w].own ? GEAR[w].line : '#ff3048');
  return { color, w: w === 'ruyi' ? 1.6 : 1 };
}
function gearDrawZones(now) {
  for (const z of zones) {
    if (z.type === 'snow') {
      g.globalAlpha = 0.35; g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); z.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
      g.globalAlpha = 0.8; g.fillStyle = '#e0f4ff'; z.pts.forEach((p, i) => { if (i % 3 === 0) g.fillRect(p.x - 3 + (i % 2) * 6, p.y - 3, 4, 4); });
      g.globalAlpha = 1;
    } else if (z.type === 'fire') {
      g.globalAlpha = 0.35 + 0.15 * Math.sin(now / 120); g.strokeStyle = '#ff8a30'; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); z.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
      g.globalAlpha = 0.9; g.fillStyle = '#ffe070'; z.pts.forEach((p, i) => { if (i % 4 === 0) g.fillRect(p.x - 2, p.y - 6 - ((now / 60 + i) % 8), 4, 6); });
      g.globalAlpha = 1;
    } else if (z.type === 'shrine') {
      g.globalAlpha = 0.5; g.strokeStyle = '#ffc830'; g.lineWidth = 3; g.setLineDash([10, 8]);
      g.beginPath(); g.ellipse(z.x, z.y, 150, 40, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.globalAlpha = 1; g.fillStyle = '#a03020'; g.fillRect(z.x - 14, z.y - 30, 28, 22); g.fillStyle = '#ffc830'; g.fillRect(z.x - 18, z.y - 36, 36, 7);
    } else if (z.type === 'frost') {
      g.globalAlpha = 0.45 + 0.15 * Math.sin(now / 300); g.strokeStyle = '#c0ecff'; g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); z.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
      g.fillStyle = '#fff'; z.pts.forEach((p, i) => { if (i % 4 === 0) g.fillRect(p.x - 2, p.y - 2, 4, 4); });
      g.globalAlpha = 1;
    } else if (z.type === 'ring') {
      g.globalAlpha = 0.5 + 0.2 * Math.sin(now / 250); g.strokeStyle = '#ffd060'; g.lineWidth = 5; g.setLineDash([12, 8]);
      g.beginPath(); z.poly.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffd060'; g.globalAlpha = 0.08; g.fill(); g.globalAlpha = 1;
    }
  }
  // 姻緣簿的紅線
  g.strokeStyle = '#ff5c8d'; g.lineWidth = 2; g.globalAlpha = 0.8;
  for (const e of foes || []) if (e.link && !e.dead && !e.link.dead && foes.indexOf(e) < foes.indexOf(e.link)) {
    const a = center(e), b = center(e.link), mx = (a.x + b.x) / 2, my = Math.max(a.y, b.y) + 40;
    g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(mx, my, b.x, b.y); g.stroke();
  }
  g.globalAlpha = 1;
  for (const e of effects || []) if (e.type === 'thread') {
    const k = (now - e.t0) / e.dur; if (k >= 1) continue;
    g.globalAlpha = 1 - k; g.strokeStyle = '#ff5c8d'; g.lineWidth = 5; g.beginPath(); g.moveTo(e.a.x, e.a.y); g.lineTo(e.b.x, e.b.y); g.stroke(); g.globalAlpha = 1;
  }
}
// 名字上面的小方塊：身上的裝備
function gearIcons(u, top) {
  const ids = gearOf(u);
  ids.forEach((id, i) => {
    const it = GEAR[id], x = u.x - ids.length * 11 + i * 22, y = top - 46;
    g.fillStyle = '#000'; g.fillRect(x, y, 20, 20);
    g.strokeStyle = it.color; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, 18, 18);
    g.fillStyle = it.color; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(it.icon, x + 10, y + 15);
  });
}
// 下方「輪到誰」旁邊列出裝備，點一下看效果
function gearWho(h) {
  const ids = gearOf(h); if (!ids.length) return;
  ids.forEach((id) => {
    const it = GEAR[id], b = document.createElement('button');
    b.className = 'btn gear-chip'; b.style.borderColor = it.color; b.innerHTML = `<span style="color:${it.color}">${it.icon}</span>`;
    b.onclick = () => tip(`<b style="color:${it.color}">${it.n}</b>（${it.rank}）：${it.d}`);
    $('.who').appendChild(b);
  });
}

// 整理裝備的畫面。store：{ bag 背包, eq {神魔: {兵器, 法寶}}, heroes 可以換裝的神魔, anyKind(神魔) 這位能不能神器邪物都用, save() }
// fixed：只能看、不能換的神魔（前世之影穿著死前的裝備）[{ id, gear, tag }]
function gearBox(store, done, doneText = '繼續', fixed = []) {
  const kindText = (hid) => store.anyKind && store.anyKind(hid) ? '這一世為人・神器邪物都能用' : `${SIDE[hid]}族・只能用${SIDE[hid] === '神' ? '神器' : '邪物'}`;
  const rows = store.heroes.map((hid) => `<div class="gear-hero"><b style="color:${HEROES[hid].color}">${HEROES[hid].name}</b>（${kindText(hid)}）
    ${Object.keys(SLOT).map((sl) => { const id = (store.eq[hid] || {})[sl], it = GEAR[id];
      return `<button class="btn opt gslot" data-h="${hid}" data-s="${sl}">${SLOT[sl]}：${it ? `<b style="color:${it.color}">${it.n}</b><br>${it.d}` : '<span class="muted">空的，點一下裝上</span>'}</button>`; }).join('')}</div>`).join('');
  const fix = fixed.map((f) => `<div class="gear-hero"><b style="color:${HEROES[f.id].color}">${HEROES[f.id].name}</b><span class="muted">（${f.tag || ''}・穿著原本的裝備，不能換）</span>
    ${f.gear.length ? f.gear.filter((id) => GEAR[id]).map((id) => `<p><b style="color:${GEAR[id].color}">${GEAR[id].n}</b>：${GEAR[id].d}</p>`).join('') : '<p class="muted">沒有裝備。</p>'}</div>`).join('');
  showBox(`<h2>裝備</h2><p class="muted">背包 ${store.bag.length} 件。${store.note || ''}點欄位換裝。</p>${rows}${fix}<button class="btn primary wide gdone" style="margin-top:10px">${doneText}</button>`);
  document.querySelectorAll('.box .gslot').forEach((b) => b.onclick = () => gearPickFor(store, b.dataset.h, b.dataset.s, () => gearBox(store, done, doneText, fixed)));
  $('.box .gdone').onclick = () => { store.save(); done(); };
}
function gearPickFor(store, hid, sl, back) {
  const list = store.bag.filter((id) => GEAR[id] && GEAR[id].slot === sl && canUse(hid, id, store.anyKind && store.anyKind(hid))).sort((a, b) => GEAR[b].tier - GEAR[a].tier);
  const holder = (id) => store.heroes.find((o) => (store.eq[o] || {})[sl] === id && o !== hid);
  showBox(`<h2>${HEROES[hid].name}・${SLOT[sl]}</h2>
    ${list.length ? list.map((id) => { const it = GEAR[id], o = holder(id);
      return `<button class="btn opt gpick" data-id="${id}" style="border-color:${it.color}"><b style="color:${it.color}">${it.n}</b>（${it.rank}・${it.kind}${it.from ? '・' + it.from : ''}）${o ? `<span class="muted">・現在在${HEROES[o].name}身上</span>` : ''}<br>${it.d}</button>`; }).join('') : '<p class="muted">倉庫裡沒有這一格能用的裝備。</p>'}
    <button class="btn opt gpick" data-id="">卸下</button><button class="btn wide gback" style="margin-top:8px">返回</button>`);
  document.querySelectorAll('.box .gpick').forEach((b) => b.onclick = () => {
    const id = b.dataset.id, o = id && holder(id);
    if (o) store.eq[o][sl] = null;
    store.eq[hid] = store.eq[hid] || {}; store.eq[hid][sl] = id || null;
    store.save(); back();
  });
  $('.box .gback').onclick = back;
}
// 掉落：從 ids 裡選一件放進背包；那一格空著就直接裝上，接著可以整理裝備
function gearOffer(store, ids, title, next, nextText = '繼續') {
  if (!ids.length) return next();
  const forWho = (id) => GEAR[id].own ? HEROES[GEAR[id].own].name + '專屬' : GEAR[id].kind === '神器' ? '神族能用' : '魔族能用';
  showBox(`<h2>${title}</h2><p>選一件帶走：</p>
    ${ids.map((id) => { const it = GEAR[id]; return `<button class="btn opt gget" data-id="${id}" style="border-color:${it.color}"><b style="color:${it.color}">${it.n}</b>（${it.rank}・${it.kind}・${SLOT[it.slot]}・${forWho(id)}）<br>${it.d}</button>`; }).join('')}`);
  document.querySelectorAll('.box .gget').forEach((b) => b.onclick = () => {
    const id = b.dataset.id; store.bag.push(id);
    const hid = store.heroes.find((h) => canUse(h, id, store.anyKind && store.anyKind(h)) && !(store.eq[h] || {})[GEAR[id].slot]);
    if (hid) { store.eq[hid] = store.eq[hid] || {}; store.eq[hid][GEAR[id].slot] = id; }
    store.save();
    gearBox(store, next, nextText);
  });
}
// 換了裝備，場上的神魔也要更新（例如出招說明、線的樣子）
function refreshGear() { if (heroes && who >= 0 && !busy) renderSkills(); }

// ───── 點角色看說明 ─────
// 點一下角色或敵人（不拖動）就跳出說明；連點招式時點一下是選目標，要長按才看說明
let press = null;
const unitAt = (p) => [...heroes, ...foes].filter((u) => !u.dead || u.side === 'ally').map((u) => ({ u, d: Math.min(dist(center(u), p), dist({ x: u.x, y: u.y - 20 }, p)) })).filter((x) => x.d < 52).sort((a, b) => a.d - b.d).map((x) => x.u)[0];
function pressStart(p, holdOnly) {
  const u = unitAt(p);
  press = { p, t: performance.now(), u, moved: 0, holdOnly, timer: null, done: false };
  if (u) press.timer = setTimeout(() => {
    if (!press || press.moved > 12) return;
    press.done = true; drawing = false; clearPath(); showInfo(press.u);
  }, 500);
}
function pressMove(p) { if (press) press.moved = Math.max(press.moved, dist(p, press.p)); }
function pressEnd() {
  if (!press) return null;
  clearTimeout(press.timer);
  const pr = press; press = null;
  if (pr.done) return null;
  return { p: pr.p, u: pr.u, tap: !pr.holdOnly && pr.moved < 12 && performance.now() - pr.t < 400 };
}

const FROST_MAX = 3;
function statusRows(u) {
  const r = [];
  if (u.side === 'ally') {
    if (u.dead) r.push(['倒下', '這一層不能行動，過關後回復三成生命。']);
    if (u.shield) r.push([`護盾 ${u.shield}`, '先替他擋掉這麼多傷害。']);
    const R = HEROES[u.id].res;
    if (R) r.push([`${R[0]} ${u.res}/${u.cap || R[1]}`, u.passive.d]);
    if (u.inkBuff) r.push(['雙蛇杖', '下一招的墨水 +50%。']);
    if (u.wine) r.push(['溫酒', `天賦「${u.talent.n}」發動中：下一招每一下傷害 +${u.wine}。`]);
    if (u.taunt) r.push(['嘲諷', '這一輪一般敵人都改打他（精英不受影響）。']);
    const aim = foes.filter((e) => !e.dead && !e.frozen && !e.confused && e.intent && (e.intent.all || e.intent.target === u));
    if (aim.length) r.push(['被盯上', aim.map((e) => `${e.name}要打他 ${e.intent.dmg}`).join('、') + '。']);
  } else {
    if (u.frozen) r.push(['凍住', '下一次輪到他時不能行動，之後解凍。']);
    if (u.frost) r.push([`冰霜 ${u.frost}/${FROST_MAX}`, `疊到 ${FROST_MAX} 層就凍住，每過一輪少 1 層。雪女的冰柱打凍住的敵人會碎冰重擊。`]);
    if (u.red) r.push(['紅線（緣）', '月老綁上的紅線，到下一輪為止：他受傷時，其他綁紅線的敵人也受一半。']);
    if (u.link && !u.link.dead) r.push(['姻緣簿', `和${u.link.name}綁在一起：其中一個受傷，另一個也受一半。`]);
    if (u.confused) r.push(['錯亂', '被亂點鴛鴦或迷路了：下一次行動改打自己的同伴。']);
    if (u.trapped) r.push(['關在隔間', '這一輪走不出去，只能打身邊很近的人。']);
    if (u.stun) r.push(['石像', '被美杜莎石化：下一次輪到他時不能行動。石像崩碎打石像會碎掉重擊。']);
    if (u.stone) r.push([`石化 ${u.stone}/3`, '疊到 3 層變成石像，下次不能行動。']);
    if (u.burn) r.push([`燃燒 ${u.burn} 輪`, '每輪開始受 3 傷害。布麗姬打燃燒中的敵人每一下多 4。']);
    if (u.fear) r.push(['恐懼', '下一次攻擊傷害減半。']);
    if (u.mark) r.push(['七日之期', '被八尺大人標記，整層都在：受到每一下攻擊都 +2。']);
    if (u.lost) r.push([`迷途 ${u.lost}/5`, '疊到 5 層就迷路，下次行動改打自己的同伴。']);
    if (u.exposed) r.push(['現出原形', `被孫悟空的火眼金睛看穿，到下一輪為止：受到每一下攻擊 +${run.exposeDmg}。`]);
    if (u.book) r.push(['生死簿', '被閻羅王寫上名字，整層都在：一般敵人生命掉到兩成以下直接勾銷。']);
  }
  return r;
}
function showInfo(u) {
  const st = statusRows(u), row = (k, v, c) => `<p><b style="color:${c || 'var(--gold)'}">${k}</b>：${v}</p>`;
  let html;
  if (u.side === 'ally') {
    const H = HEROES[u.id];
    html = `<h2 style="color:${H.color}">${H.name}</h2><p class="muted">${H.role}・${SIDE[u.id]}族${u.lv < 99 ? `・Lv${u.lv}` : ''}</p>
      <p>生命 ${u.hp}/${u.maxHp}</p>
      ${st.length ? '<h3>現在的狀態</h3>' + st.map(([k, v]) => row(k, v)).join('') : ''}
      <h3>被動與天賦</h3>${row('被動・' + H.passive.n, H.passive.d, H.color)}${row('天賦・' + H.talent.n + (u.lv < TALENT_LV ? `（Lv${TALENT_LV} 解鎖）` : ''), H.talent.d, u.lv < TALENT_LV ? '#888' : H.color)}
      <h3>招式</h3>${H.skills.map((sk, i) => row(`${sk.name}${i === 2 ? '★' : ''}${u.lv < SKILL_LV[i] ? `（Lv${SKILL_LV[i]} 解鎖）` : ''}`, `（${SHAPES[sk.shape]}${sk.melee ? '・近身' : ''}${sk.cd ? `・冷卻 ${sk.cd}` : ''}${u.cds[i] > 0 ? `・還要 ${u.cds[i]} 輪` : ''}）${sk.desc}`, u.lv < SKILL_LV[i] ? '#888' : '')).join('')}
      ${u.perks.length ? '<h3>強化</h3>' + u.perks.map((p) => row(p.n, p.d, H.color)).join('') : ''}
      ${gearOf(u).length ? '<h3>裝備</h3>' + gearOf(u).map((id) => row(GEAR[id].n, GEAR[id].d, GEAR[id].color)).join('') : ''}`;
  } else {
    const F = FOES[u.key], it = u.intent;
    const intent = u.frozen ? '凍住了，這一輪不會行動。' : u.confused ? '被亂點鴛鴦，下一次會打自己的同伴。' : u.stun ? `${u.stunTxt || '變成石像'}，這一輪不會行動。` : !it ? '還沒決定。' : it.seize ? `走去把${it.seize.name}的靈魂抓走封印。` : it.all ? `${it.label || (it.judge ? '審判' : '凝視')}全隊，每人 ${it.dmg} 傷害。` : `走到${it.target.name}面前打 ${it.dmg}${it.twice ? '，連砍兩下' : ''}${it.carry ? '，然後把他抓走' : ''}。`;
    html = `<h2 style="color:#ff8a8a">${u.name}</h2><p class="muted">${F.boss ? '魔王' : F.elite ? '精英敵人' : '敵人'}</p>
      <p>生命 ${u.hp}/${u.maxHp}・攻擊 ${u.atk}</p>${row('這一輪要做什麼', intent, '#ff8a8a')}
      ${st.length ? '<h3>現在的狀態</h3>' + st.map(([k, v]) => row(k, v)).join('') : '<p class="muted">沒有特殊狀態。</p>'}
      ${F.d ? '<h3>特性</h3><p>' + F.d + '</p>' : ''}`;
  }
  showBox(html + '<button class="btn primary wide info-ok">知道了</button>');
  $('.box .info-ok').onclick = hideBox;
}

// ───── 新手教學 ─────
// 第一次玩：先看四步說明；之後每遇到沒畫過的畫法，戰場上會自動示範一次（按「怎麼畫」可以再看）
const TUT_KEY = 'rebirth-redline-tut-v1';
const tut = (() => { try { return JSON.parse(localStorage.getItem(TUT_KEY)) || { intro: false, seen: [] }; } catch (e) { return { intro: false, seen: [] }; } })();
const saveTut = () => { try { localStorage.setItem(TUT_KEY, JSON.stringify(tut)); } catch (e) { /* 存不了就每次都教 */ } };
const TUT_STEPS = [
  ['輪到誰', '三位神魔輪流上場，每次只動一位。<b>腳下有金色光圈</b>的就是現在要出手的人，下方也會寫「輪到 誰」。'],
  ['選一招', '下方三個按鈕是他的三招，按鈕上寫著<b>畫法</b>（直線、衝刺、自由線、折線、畫圈、連點），選好後效果寫在按鈕下面。被動、天賦要按名字旁邊的<b>「說明」</b>。'],
  ['照畫法畫', '在戰場上用手指畫。第一次遇到某種畫法，戰場上會有<b>白色虛線的示範</b>，跟著畫就好；忘了就按左下的<b>「怎麼畫」</b>再看一次。畫完會預覽每個敵人受到多少傷害。'],
  ['出招、看敵人', '滿意就按<b>出招</b>，不滿意按<b>重畫</b>。三位都出手後敵人才行動。被盯上的神魔旁邊有紅色驚嘆號，點一下敵人可以看他這一輪要打誰、打多少。<b>點一下角色或敵人</b>可以看詳細說明。'],
];
function tutIntro() {
  if (tut.intro || run.floor !== 1) return;
  const ok = $('.box .ok'); if (!ok) return;
  ok.onclick = () => tutStep(0);
}
function tutStep(i) {
  if (i >= TUT_STEPS.length) { tut.intro = true; saveTut(); hideBox(); autoDemo(); return; }
  const [t, d] = TUT_STEPS[i];
  showBox(`<div class="tut"><p class="step">新手教學 ${i + 1}/${TUT_STEPS.length}</p><h2>${t}</h2><p>${d}</p></div>
    <button class="btn primary wide tnext">${i + 1 < TUT_STEPS.length ? '下一步' : '開始打'}</button>
    <button class="btn wide tskip">跳過教學</button>`);
  $('.box .tnext').onclick = () => tutStep(i + 1);
  $('.box .tskip').onclick = () => tutStep(TUT_STEPS.length);
}

// 示範：用真的站位算出一條示範線，白色虛線一路畫過去，手指圓點跟著走
let demo = null;
function demoFor(shape) {
  const h = center(hero()), max = inkMax();
  const en = foes.filter((e) => !e.dead).map(center).sort((a, b) => dist(a, h) - dist(b, h));
  if (!en.length) return null;
  const toward = (to, L) => { const d = dist(h, to) || 1; return { x: h.x + (to.x - h.x) / d * L, y: h.y + (to.y - h.y) / d * L }; };
  const near = en[0], far = dist(h, near);
  if (shape === 'line') return { pts: [h, toward(near, Math.min(max, far + 120))], note: '從自己身上往敵人的方向拉，放開就是一條直線。' };
  if (shape === 'dash') return { pts: [h, toward(near, Math.min(max, far))], note: far > max ? '從自己身上往敵人拉一下。<b>現在太遠了</b>，衝不到：先用別的招走近，或換別的招。' : '從自己身上往敵人拉一下，會<b>衝到第一個敵人面前</b>刺下去。' };
  if (shape === 'free') return { pts: densify([h, ...en.slice(0, 3)], 14), note: '手指不要放開，從自己身上一筆畫過想打的敵人。' };
  if (shape === 'zigzag') {
    const a = en[0], b = en[1] || { x: a.x - 90, y: a.y + 120 };
    return { pts: densify([h, a, b], 14), note: '一筆畫過去，<b>穿過敵人算一關</b>，在敵人身上<b>轉個彎</b>再多一關。' };
  }
  if (shape === 'circle') {
    const c = en[0], pts = [];
    for (let k = 0; k <= 36; k++) { const t = k / 36 * Math.PI * 2; pts.push({ x: c.x + Math.cos(t) * 80, y: c.y + Math.sin(t) * 70 }); }
    return { pts, note: '在敵人身邊畫一個圈，<b>頭尾要接起來</b>，圈裡的都會中。' };
  }
  if (shape === 'tap') return { pts: [h, ...en.slice(0, 3)], taps: en.slice(0, 3), note: '不用畫線，<b>依序點</b>想打的目標，紅線會在他們之間彈過去。' };
  return null;
}
function startDemo(shape) {
  const d = demoFor(shape); if (!d) return;
  demo = { ...d, shape, t0: performance.now() };
  tip(`<b>示範：${SHAPES[shape]}</b>　${d.note}`);
}
function autoDemo() {
  if (!heroes || busy || !tut.intro || $('.overlay').classList.contains('show')) return;
  const shape = skill().shape;
  if (tut.seen.includes(shape)) return;
  tut.seen.push(shape); saveTut();
  startDemo(shape);
}
function drawDemo(now) {
  if (!demo || busy) return;
  const DRAW = 1600, HOLD = 700, LOOPS = 3, t = now - demo.t0;
  if (t > (DRAW + HOLD) * LOOPS) { demo = null; return; }
  const k = Math.min(1, (t % (DRAW + HOLD)) / DRAW), pts = demo.pts;
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const want = cum[cum.length - 1] * k;
  let tipP = pts[0];
  g.save();
  g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.globalAlpha = 0.85; g.setLineDash([12, 9]); g.lineCap = 'round'; g.lineJoin = 'round';
  if (demo.taps) {
    // 連點：依序在目標上閃一下
    const n = Math.min(demo.taps.length, Math.floor(k * demo.taps.length + 0.001) + (k >= 1 ? 0 : 1));
    g.beginPath(); pts.slice(0, n + 1).forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke();
    demo.taps.slice(0, n).forEach((q, i) => { g.setLineDash([]); g.lineWidth = 3; g.beginPath(); g.arc(q.x, q.y, 24, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), q.x, q.y - 30); });
    tipP = demo.taps[Math.max(0, n - 1)];
  } else {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] <= want) { g.lineTo(pts[i].x, pts[i].y); tipP = pts[i]; continue; }
      const q = (want - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      tipP = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * q, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * q };
      g.lineTo(tipP.x, tipP.y); break;
    }
    g.stroke();
  }
  // 手指
  g.setLineDash([]); g.globalAlpha = 0.95; g.fillStyle = 'rgba(255,255,255,0.35)'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.arc(tipP.x, tipP.y, 16, 0, Math.PI * 2); g.fill(); g.stroke();
  // 標題
  const label = '示範：' + SHAPES[demo.shape] + '（碰一下戰場就開始畫）';
  g.font = 'bold 18px sans-serif'; g.textAlign = 'center';
  const w = g.measureText(label).width + 24;
  g.globalAlpha = 0.8; g.fillStyle = '#000'; g.fillRect(W / 2 - w / 2, FLOOR + 8, w, 30);
  g.globalAlpha = 1; g.fillStyle = '#ffe070'; g.fillText(label, W / 2, FLOOR + 30);
  g.restore();
}

// ───── 畫面 ─────
function fxPush(e) { effects.push({ t0: performance.now(), ...e }); }
// 技能打擊特效：assets/skills/<角色>.png，3 排（一招一排）× 5 格，每格 96，黑底用加亮疊上去
const SKILL_FX = {};
let casting = false; // 只有神魔出招這段時間的命中才播技能特效
function skillFx(u) {
  const h = hero();
  if (!casting || !h) return;
  const img = SKILL_FX[h.id] || (SKILL_FX[h.id] = Object.assign(new Image(), { src: (window.EMBED && EMBED[`assets/skills/${h.id}.png`]) || `assets/skills/${h.id}.png` }));
  const now = performance.now();
  if (u.fxAt && now - u.fxAt < 120) return; // 同一下連發只播一次
  u.fxAt = now;
  fxPush({ type: 'skill', img, row: skill().fx ?? skillIdx, x: u.x, y: u.y - 46, dur: 520 });
}
function float(u, text, color, size = 22) { fxPush({ type: 'text', x: u.x, y: u.y - 112, text, color, size, dur: 1000 }); }

// 戰場背景：先在 1/4 大小的小畫布上一格一格點出像素，再放大貼上（只算一次）。
// 後面是石磚牆加鐵窗，前面是透視的石板地，中間亮、四周暗
const PX = 4, bgCv = document.createElement('canvas');
let bgReady = false;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function buildBg() {
  const w = W / PX, h = H / PX, fy = FLOOR / PX;
  bgCv.width = w; bgCv.height = h;
  const c = bgCv.getContext('2d'), img = c.createImageData(w, h), d = img.data;
  const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const put = (x, y, col, k = 1) => { const i = (y * w + x) * 4; d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255; };
  const brick = hex('#2b2540'), brickHi = hex('#3a3354'), mortar = hex('#17131f'), win = hex('#0b0914'), bar = hex('#565070'), barHi = hex('#8a84a6'), sill = hex('#423a5c');
  const tileA = hex('#2c283a'), tileB = hex('#282436'), seam = hex('#16131e'), tileHi = hex('#3a3550'), moss = hex('#2a3a34'), crack = hex('#1a1724');
  const wins = [18, 56, 94, 132];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y < fy) {
      // 石磚牆：一排 4 格高、磚 9 格寬，上下排錯開
      const row = Math.floor(y / 4), bx = x + (row % 2) * 4, edge = y % 4 === 3 || bx % 9 === 0;
      let col = edge ? mortar : (y % 4 === 0 ? brickHi : brick), k = 0.85 + hash(Math.floor(bx / 9), row) * 0.3;
      // 鐵窗：上面切掉看不到，只露出下半截，裡面透一點藍光
      for (const wx of wins) {
        const dx = x - wx;
        if (Math.abs(dx) <= 7 && y >= fy - 15 && y <= fy - 5) {
          if (y === fy - 5 || y === fy - 6) { col = y === fy - 6 ? barHi : sill; k = 1; }
          else if (Math.abs(dx) === 7) { col = mortar; k = 1; }
          else if (dx % 3 === 0) { col = (dx + 7) % 6 === 1 ? barHi : bar; k = 1; }
          else { col = win; k = 1 + 2.2 * Math.max(0, 1 - Math.abs(dx) / 7) * ((y - (fy - 15)) / 10); col = [col[0] + 6, col[1] + 14, col[2] + 30]; }
        }
      }
      if (y >= fy - 2) { col = y === fy - 2 ? brickHi : sill; k = 1; }
      put(x, y, col, Math.min(k, 3));
    } else {
      // 石板地：越前面磚越大（透視），每塊磚顏色略不同，偶爾有裂縫或青苔
      const z = (y - fy) / (h - fy), sc = 0.45 + 0.75 * z, u = (x - w / 2) / sc;
      const rowF = Math.sqrt(z) * 7, row = Math.floor(rowF), col0 = Math.floor((u + (row % 2) * 7) / 14), fu = ((u + (row % 2) * 7) % 14 + 14) % 14, fv = rowF - row;
      const r = hash(col0, row);
      let col = (col0 + row) % 2 ? tileA : tileB, k = 0.88 + r * 0.24;
      if (fu < 1 / sc || fv < 0.06 + 0.04 * (1 - z)) col = seam;
      else if (fv < 0.13 + 0.06 * (1 - z)) col = tileHi;
      else if (r > 0.86 && Math.abs(fu - 7 - (fv - 0.5) * 6) < 0.6 / sc) col = crack;
      else if (r < 0.08 && hash(x, y) < 0.35) col = moss;
      else if (hash(x, y) < 0.04) k *= 0.82;
      // 光：從鐵窗照下來的光和中央亮一點，四角暗
      const cx = (x - w / 2) / (w / 2), cy = (y - (fy + 40)) / (h - fy);
      k *= 1.15 - 0.45 * Math.min(1, cx * cx * 0.8 + cy * cy * 0.9);
      if (y - fy < 6) k *= 0.7 + (y - fy) * 0.05;
      put(x, y, col, k);
    }
  }
  // 地上靠牆一排陰影
  c.putImageData(img, 0, 0);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, fy, w, 2);
  bgReady = true;
}
function drawBg(now) {
  if (!bgReady) buildBg();
  g.imageSmoothingEnabled = false;
  g.drawImage(bgCv, 0, 0, W, H);
  // 鐵窗之間的藍色魂火，一閃一閃
  for (let i = 0; i < 3; i++) {
    const x = (37 + i * 38) * PX, y = FLOOR - 13 * PX, fl = Math.sin(now / 160 + i * 2.1);
    g.fillStyle = '#3e3656'; g.fillRect(x - 6, y + 8, 12, 8); g.fillStyle = '#5a5278'; g.fillRect(x - 6, y + 8, 12, 4);
    g.fillStyle = 'rgba(120,200,255,0.12)'; g.fillRect(x - 24, y - 24, 48, 40);
    g.fillStyle = '#4aa8ff'; g.fillRect(x - 6, y - 4, 12, 12);
    g.fillStyle = '#9fe0ff'; g.fillRect(x - 4, y - 8 - (fl > 0 ? 4 : 0), 8, 12);
    g.fillStyle = '#ffffff'; g.fillRect(x - 2, y, 4, 4);
  }
}
// 鎖鏈：一節一節的鐵環，兩頭釘在地上的鐵樁，底下有影子
function drawChain(c) {
  const L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1), ang = Math.atan2(c.y2 - c.y1, c.x2 - c.x1), n = Math.max(2, Math.round(L / 15)), step = L / n;
  g.save(); g.translate(c.x1, c.y1); g.rotate(ang);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 4, L, 8);
  for (let i = 0; i < n; i++) {
    const x = i * step + step / 2;
    if (i % 2 === 0) {
      // 正面的環：看得到中間的洞
      g.fillStyle = '#15121c'; g.fillRect(x - 11, -8, 22, 16);
      g.fillStyle = '#6e6a84'; g.fillRect(x - 9, -6, 18, 12);
      g.fillStyle = '#b8b4cc'; g.fillRect(x - 9, -6, 18, 3);
      g.fillStyle = '#15121c'; g.fillRect(x - 5, -2, 10, 4);
    } else {
      // 側面的環：一條扁扁的鐵
      g.fillStyle = '#15121c'; g.fillRect(x - 11, -4, 22, 8);
      g.fillStyle = '#8a86a2'; g.fillRect(x - 9, -2, 18, 4);
      g.fillStyle = '#d8d4ec'; g.fillRect(x - 7, -2, 8, 2);
    }
  }
  g.restore();
  for (const [x, y] of [[c.x1, c.y1], [c.x2, c.y2]]) {
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x - 12, y + 4, 24, 10);
    g.fillStyle = '#15121c'; g.fillRect(x - 10, y - 12, 20, 22);
    g.fillStyle = '#4a4560'; g.fillRect(x - 8, y - 10, 16, 18);
    g.fillStyle = '#7a7494'; g.fillRect(x - 8, y - 10, 16, 4);
    g.fillStyle = '#c8c4d8'; g.fillRect(x - 2, y - 4, 4, 4);
  }
}
// 水窪：一灘圓的水，邊緣一格一格像素，水面有波紋往外擴
function drawWater(c, now) {
  const cell = 4, rx = c.rx, ry = c.ry;
  if (!c.edge) c.edge = Array.from({ length: 24 }, () => rnd(-0.06, 0.06));
  const r = (x, y) => { const a = Math.atan2(y / ry, x / rx), j = c.edge[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 24]; return (x * x) / (rx * rx) + (y * y) / (ry * ry) - (1 + j) ** 2; };
  for (let y = -ry - cell * 2; y <= ry + cell * 2; y += cell) for (let x = -rx - cell * 2; x <= rx + cell * 2; x += cell) {
    const v = r(x + cell / 2, y + cell / 2);
    if (v > 0.18) continue;
    const X = Math.round(c.cx + x), Y = Math.round(c.cy + y);
    if (v > 0) g.fillStyle = '#16141f';
    else if (v > -0.16) g.fillStyle = y < 0 ? '#6ab0e8' : '#2e6a9e';
    else g.fillStyle = y < -ry * 0.45 ? '#2a5c8c' : (x + y) % (cell * 6) === 0 && y > 0 ? '#1d4a74' : '#204f7c';
    g.fillRect(X, Y, cell, cell);
  }
  // 反光
  g.fillStyle = '#a8dcff'; g.fillRect(c.cx - rx * 0.45, c.cy - ry * 0.45, 12, 4); g.fillRect(c.cx - rx * 0.45 + 16, c.cy - ry * 0.45, 4, 4);
  // 波紋
  for (let k = 0; k < 2; k++) {
    const t = (now / 1800 + k / 2) % 1, R = 0.35 + t * 0.55, m = Math.round(16 + 30 * R);
    g.fillStyle = `rgba(150,210,255,${0.45 * (1 - t)})`;
    for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2; g.fillRect(Math.round((c.cx + Math.cos(a) * rx * R) / cell) * cell, Math.round((c.cy + Math.sin(a) * ry * R) / cell) * cell, cell, cell); }
  }
}

function heroFrame(h, now) {
  if ((!h.anim || !h.anim.a) && h.moving) { const w = artAnim(h.art, 'walk'); if (w) { const tot = w.ms.reduce((a, b) => a + b, 0); let t = now % tot, i = 0; while (i < w.ms.length - 1 && t >= w.ms[i]) t -= w.ms[i++]; return [w.sheet, i]; } }
  if (!h.anim || !h.anim.a) return ['pose', 0];
  const ms = h.anim.a.ms; let t = now - h.anim.t0, i = 0;
  if (t >= ms.reduce((a, b) => a + b, 0)) { h.anim = null; return ['pose', 0]; }
  while (i < ms.length - 1 && t >= ms[i]) t -= ms[i++];
  return [h.anim.a.sheet, i];
}

function drawUnit(u, now) {
  if (u.dead && u.side === 'enemy') { const k = (now - u.deadAt) / 600; if (k >= 1) return; g.globalAlpha = 1 - k; }
  if (u.dead && u.side === 'ally') return drawSoul(u, now);
  const white = u.flash > now && Math.floor((u.flash - now) / 60) % 2 === 0;
  let ox = 0, oy = 0;
  if (u.side === 'ally' && u.lunge) { const k = (now - u.lunge.t0) / u.lunge.ms; if (k < 1) { const s = k < 0.25 ? k / 0.25 : k < 0.75 ? 1 : (1 - k) / 0.25; ox = u.lunge.dx * s; oy = u.lunge.dy * s; } else u.lunge = null; }
  const x = u.x + ox, y = u.y + oy;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x, y, u.elite ? 44 : 28, 6, 0, 0, Math.PI * 2); g.fill();
  // 現在上場的神魔：腳下金色光圈
  if (u.side === 'ally' && u === hero() && !u.dead) { const p = 0.6 + 0.4 * Math.sin(now / 200); g.strokeStyle = `rgba(255,224,112,${p})`; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, 40, 10, 0, 0, Math.PI * 2); g.stroke(); }
  if (hits.includes(u) && !u.dead) { g.strokeStyle = u.side === 'ally' ? '#7fe07f' : '#ff3048'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, u.elite ? 50 : 34, 9, 0, 0, Math.PI * 2); g.stroke(); }
  if (u.side === 'ally') { const [sheet, i] = heroFrame(u, now); drawArt(g, u.art, sheet, i, x, y - (u.hop || 0), 1, { white, flip: u.face === -1 }); }
  else {
    const lunging = u.lunge && now - u.lunge < 360;
    const lx = lunging ? -30 * Math.sin((now - u.lunge) / 360 * Math.PI) : 0;
    const pose = u.flash > now ? 2 : lunging ? 1 : 0;
    if (u.frozen) g.filter = 'saturate(0.3) brightness(1.3) hue-rotate(160deg)';
    else if (u.tint) g.filter = 'sepia(1) saturate(6) hue-rotate(-50deg) brightness(0.7) contrast(1.3)';
    const bob = u.moving ? Math.abs(Math.sin(now / 90)) * 5 : 0;
    drawArt(g, 'u:' + u.sprite, 'pose', pose, x + lx * (u.face === 1 ? -1 : 1), y - bob, 1, { flip: u.faceL ? u.face === 1 : u.face !== 1, white });
    g.filter = 'none';
  }
  g.globalAlpha = 1;
  if (u.dead) return;
  const top = u.y - (u.side === 'ally' ? ART[u.art].sheets.pose[2] : UNIT_ART[u.sprite][1]) - 12;
  g.fillStyle = '#000'; g.fillRect(u.x - 30, top - 2, 60, 9);
  g.fillStyle = u.side === 'ally' ? '#5fd35f' : '#e05050'; g.fillRect(u.x - 29, top - 1, 58 * u.hp / u.maxHp, 7);
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
  if (u.side === 'ally') {
    g.fillStyle = u === hero() ? '#ffe070' : '#fff'; g.fillText(`${u.tag === '前世之影' ? '影・' : ''}${u.name} ${u.hp}`, u.x, top - 8);
    gearIcons(u, top);
    if (u.shield) { g.fillStyle = '#ffe070'; g.fillText('盾 ' + u.shield, u.x + 52, top + 6); }
    if (u.res) { g.fillStyle = u.color; g.fillText(HEROES[u.id].res[0][0] + u.res, u.x - 52, top + 22); }
    if (u.wine) { g.fillStyle = '#ffb040'; g.fillText('酒', u.x + 52, top + 22); }
    const aimed = foes.some((e) => !e.dead && !e.frozen && !e.confused && e.intent && (e.intent.all || e.intent.target === u));
    if (aimed) { g.fillStyle = Math.floor(now / 250) % 2 ? '#ff4050' : '#ffb0b0'; g.fillRect(u.x - 52, top - 26, 6, 16); g.fillRect(u.x - 52, top - 7, 6, 5); }
  } else {
    // 敵人頭上只放本名，要打誰看「說明」
    g.fillStyle = u.boss ? '#ffb040' : u.elite ? '#ffd080' : '#ff8a8a'; g.fillText(u.name, u.x, top - 8);
  }
  if (u.side === 'enemy') {
    // 身上的狀態排成一列小字
    const held = heroes.filter((h) => h.sealed && h.sealedBy === u).length;
    const tags = [[held, '魂' + held, '#d0b0ff'], [held && u.fleeIn, `${u.fleeIn}輪後逃走`, '#d0b0ff'], [u.frost, '霜' + u.frost, '#a0e0ff'], [u.red, '緣', '#ff5c8d'], [u.burn, '燒' + u.burn, '#ff8a30'], [u.fear, '懼', '#d0b0ff'], [u.mark, '標', '#e8e8ff'], [u.stone, '石' + u.stone, '#c0c0c0'], [u.lost, '迷' + u.lost, '#ff4050'], [u.exposed, '形', '#ffc040'], [u.book, '名', '#8a70ff']].filter((t) => t[0]);
    g.font = 'bold 13px sans-serif'; g.textAlign = 'left';
    let tx = u.x - tags.reduce((a, t) => a + t[1].length * 14 + 4, 0) / 2;
    for (const [, t, c] of tags) { g.fillStyle = '#000'; g.fillRect(tx - 1, top + 9, t.length * 14 + 2, 16); g.fillStyle = c; g.fillText(t, tx, top + 22); tx += t.length * 14 + 4; }
    g.textAlign = 'center';
  }
}

// 倒下的神魔：還有靈魂就畫成飄著的藍色半透明身影，頭上寫還剩幾輪；被封印的不畫，魂散的只剩淡淡的影子
function drawSoul(u, now) {
  if (u.sealed) return;
  if (u.faded || !u.soul) { g.globalAlpha = 0.15; drawArt(g, u.art, 'pose', 0, u.x, u.y, 1, { flip: u.face === -1 }); g.globalAlpha = 1; return; }
  const bob = Math.sin(now / 300) * 6, x = u.x, y = u.y - 14 + bob, saved = soulHits().includes(u);
  g.fillStyle = saved ? 'rgba(127,224,127,0.35)' : 'rgba(120,200,255,0.25)';
  g.beginPath(); g.ellipse(x, y - 46, 46, 60, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = saved ? '#7fe07f' : 'rgba(159,216,255,0.9)'; g.lineWidth = 3; g.setLineDash([8, 6]);
  g.beginPath(); g.ellipse(x, y - 46, 46, 60, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.globalAlpha = 0.55; g.filter = 'saturate(0.2) brightness(1.5) hue-rotate(180deg)';
  drawArt(g, u.art, 'pose', 0, x, y, 1, { flip: u.face === -1 });
  g.filter = 'none'; g.globalAlpha = 1;
  const grab = foes.some((e) => !e.dead && e.intent && e.intent.seize === u);
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
  const label = `${u.name}的靈魂・剩 ${u.soul} 輪`;
  g.fillStyle = '#000'; g.fillRect(x - label.length * 8 - 4, y - 132, label.length * 16 + 8, 20);
  g.fillStyle = saved ? '#7fe07f' : '#9fd8ff'; g.fillText(label, x, y - 116);
  if (grab) { g.fillStyle = Math.floor(now / 250) % 2 ? '#d0b0ff' : '#fff'; g.fillText('有怪要來搶！', x, y + 22); }
  else if (saved) { g.fillStyle = '#7fe07f'; g.fillText('出招就救回', x, y + 22); }
}

function render(now) {
  // 戰場不在畫面上（主遊戲的其他畫面）就不畫，省電
  if (!cv.offsetParent) { requestAnimationFrame(render); return; }
  g.setTransform(1, 0, 0, 1, 0, -VIEW_Y);
  drawBg(now);
  if (heroes && who >= 0) {
    gearDrawZones(now);
    // 移動範圍
    if (moving && hero()) { const h = hero(); g.strokeStyle = 'rgba(255,224,112,0.8)'; g.fillStyle = 'rgba(255,224,112,0.08)'; g.lineWidth = 3; g.setLineDash([12, 8]); g.beginPath(); g.ellipse(h.x, h.y, MOVE_R, MOVE_R, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]); }
    for (const c0 of chains) {
      if (c0.owner.dead) continue;
      // 剛甩出來：從敵人手上飛到定點
      const k = Math.min(1, (now - c0.born) / CHAIN_FLY), q = 1 - (1 - k) ** 3, f = c0.from, lerp = (a, b) => a + (b - a) * q;
      const c = k >= 1 ? c0 : { ...c0, x1: lerp(f.x, c0.x1), y1: lerp(f.y, c0.y1), x2: lerp(f.x, c0.x2), y2: lerp(f.y, c0.y2), cx: lerp(f.x, c0.cx), cy: lerp(f.y, c0.cy), rx: c0.rx * q + 1, ry: c0.ry * q + 1, edge: c0.edge };
      if (k >= 1 && !c0.landed) { c0.landed = true; fxPush({ type: 'burst', x: (c0.x1 + c0.x2) / 2, y: (c0.y1 + c0.y2) / 2, color: CUT[c0.kind][2], dur: 400, seed: 4 }); }
      const [name, c1, c2] = CUT[c.kind || 'chain'];
      const L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1), ux = (c.x2 - c.x1) / L, uy = (c.y2 - c.y1) / L, mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
      if (c.kind === 'water') {
        drawWater(c, now);
      } else if (c.kind === 'tree') {
        // 樹根：彎彎曲曲的粗根，上面長葉子
        const pt = (t, w) => ({ x: c.x1 + ux * L * t - uy * w, y: c.y1 + uy * L * t + ux * w });
        g.lineCap = 'round';
        for (const [col, wd] of [[c1, 14], ['#6a4a24', 8]]) { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); for (let t = 0; t <= 1.001; t += 0.05) { const q = pt(t, Math.sin(t * 12) * 7); t ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); } g.stroke(); }
        g.fillStyle = c2;
        for (let t = 0.1; t < 1; t += 0.2) { const q = pt(t, Math.sin(t * 12) * 7 + 10); g.beginPath(); g.ellipse(q.x, q.y, 8, 4, Math.atan2(uy, ux) + 0.6, 0, Math.PI * 2); g.fill(); }
        g.lineCap = 'butt';
      } else {
        drawChain(c);
      }
      // 標上名字，免得跟隊友的線搞混
      g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; const ly = c.kind === 'water' ? c.cy + c.ry + 2 : my + 22; g.fillStyle = '#000'; g.fillRect(mx - 18, ly, 36, 18); g.fillStyle = c2; g.fillText(name, mx, ly + 14);
    }
    // 杜拉漢的頭顱
    for (const e of foes) if (e.head && e.headAt && !e.dead) {
      const hp = e.headAt, b = Math.sin(now / 300) * 4;
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(hp.x, hp.y + b, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8e4d8'; g.beginPath(); g.arc(hp.x, hp.y + b - 3, 15, 0, Math.PI * 2); g.fill(); g.fillRect(hp.x - 9, hp.y + b + 6, 18, 9);
      g.fillStyle = '#201010'; g.beginPath(); g.arc(hp.x - 6, hp.y + b - 3, 4, 0, Math.PI * 2); g.arc(hp.x + 6, hp.y + b - 3, 4, 0, Math.PI * 2); g.fill();
      g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e8e4d8'; g.fillText('頭顱', hp.x, hp.y + b + 32);
    }
    // 眼之碎片：金色小眼睛
    for (const c of shards) {
      const b = Math.sin(now / 250 + c.x) * 3;
      g.fillStyle = '#e0b850'; g.beginPath(); g.ellipse(c.x, c.y + b, 13, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#201000'; g.beginPath(); g.arc(c.x, c.y + b, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e0b850'; g.lineWidth = 2; g.beginPath(); g.moveTo(c.x - 4, c.y + b + 7); g.lineTo(c.x - 7, c.y + b + 15); g.stroke();
      g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e0b850'; g.fillText('眼碎片', c.x, c.y + b + 30);
    }
    // 這回合隊友留下的線，畫線跟它交叉就是紅線交會
    for (const t of trails) {
      g.strokeStyle = t.owner.color; g.lineWidth = 3; g.globalAlpha = busy ? 0.08 : 0.3; g.setLineDash([14, 10]); g.lineCap = 'round';
      g.beginPath(); t.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); if (t.loop) g.closePath(); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }
    for (const u of [...heroes, ...foes].sort((a, b) => a.y - b.y)) drawUnit(u, now);
    for (const b of bolts) drawBolt(b, now);
    if (path.length > 1) {
      const sk = skill(), col = hero().color, glow = run.glow;
      g.lineCap = 'round'; g.lineJoin = 'round';
      const ls = gearLine(hero());
      g.strokeStyle = glow ? col : ls.color; g.lineWidth = (glow ? 10 : 6) * ls.w;
      // 按下出招後，線閃一下就淡掉，才看得清楚攻擊
      g.globalAlpha = glow ? Math.max(0, 1 - (now - glow.t0) / glow.ms) : 0.9;
      if (glow) { g.shadowColor = col; g.shadowBlur = 18; }
      g.beginPath(); path.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      if (sk.shape === 'circle' && closed) { g.closePath(); const a0 = g.globalAlpha; g.fillStyle = col; g.globalAlpha = a0 * 0.15; g.fill(); g.globalAlpha = a0; }
      g.stroke(); g.shadowBlur = 0; g.globalAlpha = 1;
    }
    // 預覽：每個目標會受到什麼
    if (!busy && hits.length && !drawing) {
      // 同一個目標被打好幾下時合在一起顯示，編號是第幾擊
      const res = results(), byU = new Map(), enemyHits = res.filter((x) => x.u.side === 'enemy' && !x.cross);
      res.forEach((s) => {
        const t = [s.dmg ? (s.cross ? '交' : '') + '-' + s.dmg : '', s.thaw ? '碎冰' : '', s.frost ? '霜' + s.frost : '', s.freeze ? '凍' : '', s.confuse ? '亂' : '', s.red && !s.u.red ? '緣' : '', s.heal ? '+' + s.heal : '', s.shield ? '盾' + s.shield : ''].filter(Boolean).join(' ');
        if (!t) return;
        if (!byU.has(s.u)) byU.set(s.u, { t: [], n: [], dmg: false });
        const b = byU.get(s.u); b.t.push(t); b.dmg = b.dmg || !!s.dmg;
        if (s.u.side === 'enemy' && !s.cross) b.n.push(enemyHits.indexOf(s) + 1);
      });
      for (const c of crossings()) {
        const p = 0.6 + 0.4 * Math.sin(now / 150);
        g.strokeStyle = `rgba(255,224,112,${p})`; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, 16, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#ffe070'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('交', c.x, c.y + 5);
        // 交會點旁邊寫出會發動誰的天賦，旁邊沒敵人時也看得出有算到
        if (!c.owner.dead) { const lab = c.owner.talent.n; g.font = 'bold 13px sans-serif'; g.fillStyle = '#000'; g.fillText(lab, c.x + 1, c.y + 33); g.fillStyle = c.owner.color; g.fillText(lab, c.x, c.y + 32); }
      }
      for (const [u, b] of byU) {
        const c = center(u), t = b.t.join('  ');
        g.font = 'bold 18px sans-serif'; g.textAlign = 'center';
        g.fillStyle = '#000'; g.fillText(t, c.x + 1, c.y + 23);
        g.fillStyle = b.dmg ? '#ffe070' : '#7fe07f'; g.fillText(t, c.x, c.y + 22);
        if ((freeShape(skill()) || skill().shape === 'tap') && b.n.length) { const lab = b.n.join(','), w = Math.max(26, lab.length * 9 + 10); g.fillStyle = '#000'; g.fillRect(c.x - 36 - w / 2, c.y - 43, w, 26); g.fillStyle = '#ffe070'; g.font = 'bold 15px sans-serif'; g.fillText(lab, c.x - 36, c.y - 25); }
      }
    }
  }
  drawDemo(now);
  effects = (effects || []).filter((e) => now < e.t0 + e.dur);
  for (const e of effects) {
    const k = (now - e.t0) / e.dur;
    if (e.type === 'text') { g.globalAlpha = 1 - k * k; g.font = `bold ${e.size}px sans-serif`; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(e.text, e.x + 2, e.y - k * 30 + 2); g.fillStyle = e.color; g.fillText(e.text, e.x, e.y - k * 30); g.globalAlpha = 1; }
    if (e.type === 'burst') for (let s = 0; s < 12; s++) { const a = s * 0.52 + e.seed, d = 8 + k * 46; g.globalAlpha = 1 - k; g.fillStyle = s % 3 ? e.color : '#fff'; g.fillRect(e.x + Math.cos(a) * d - 4, e.y + Math.sin(a) * d - 4, 8, 8); g.globalAlpha = 1; }
    if (e.type === 'ring') { g.globalAlpha = 1 - k; g.strokeStyle = e.color; g.lineWidth = 4; g.beginPath(); g.arc(e.x, e.y, 20 + k * 40, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    if (e.type === 'ice') { g.globalAlpha = 0.7 * (1 - k); for (let s = 0; s < 6; s++) { g.fillStyle = s % 2 ? '#c0ecff' : '#fff'; g.fillRect(e.x - 30 + s * 11, e.y - 20 - (s % 3) * 14, 7, 20 + (s % 3) * 14); } g.globalAlpha = 1; }
    if (e.type === 'gaze') { g.globalAlpha = 0.5 * (1 - k); g.fillStyle = '#ff3048'; g.fillRect(0, FLOOR, W, H - FLOOR); g.globalAlpha = 1; }
    if (e.type === 'charge' && !e.u.dead) { g.globalAlpha = 1 - k; g.strokeStyle = e.color; g.lineWidth = 6; g.shadowColor = e.color; g.shadowBlur = 20; g.beginPath(); g.arc(e.u.x, e.u.y - 46, 60 - k * 40, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; g.globalAlpha = 1; }
    if (e.type === 'area') { g.globalAlpha = 0.5 * (1 - k); g.fillStyle = e.color; g.beginPath(); e.poly.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath(); g.fill(); g.globalAlpha = 1; }
    if (e.type === 'skill' && e.img.complete && e.img.naturalWidth) { const f = Math.min(4, Math.floor(k * 5)); g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = false; g.drawImage(e.img, f * 96, e.row * 96, 96, 96, e.x - 72, e.y - 72, 144, 144); g.restore(); }
    if (e.type === 'snap') { g.globalAlpha = 1 - k; g.fillStyle = '#fff'; for (let s = 0; s < 6; s++) g.fillRect(e.x + Math.cos(s) * k * 30 - 3, e.y + Math.sin(s) * k * 30 - 3, 6, 6); g.globalAlpha = 1; }
  }
  requestAnimationFrame(render);
}

function drawBolt(b, now) {
  const p = { x: b.x, y: b.y - 46 }, tr = b.trail;
  if (!tr.length || dist(tr[tr.length - 1], p) > 3) { tr.push(p); if (tr.length > 18) tr.shift(); }
  const prev = tr.length > 2 ? tr[tr.length - 3] : { x: p.x - 1, y: p.y }, ang = Math.atan2(p.y - prev.y, p.x - prev.x);
  // 尾巴
  g.lineCap = 'round';
  for (let i = 1; i < tr.length; i++) {
    const k = i / tr.length;
    g.globalAlpha = k * 0.8; g.strokeStyle = b.kind === 'yukionna' ? '#e0f6ff' : b.color; g.lineWidth = (b.kind === 'yuelao' ? 5 : 14) * k;
    g.beginPath(); g.moveTo(tr[i - 1].x, tr[i - 1].y); g.lineTo(tr[i].x, tr[i].y); g.stroke();
  }
  g.globalAlpha = 1;
  if (b.kind === 'yukionna') { g.fillStyle = '#fff'; tr.forEach((q, i) => { if (i % 3 === 0) g.fillRect(q.x - 2 + Math.sin(i + now / 80) * 6, q.y - 2 + Math.cos(i) * 6, 4, 4); }); }
  g.save(); g.translate(p.x, p.y); g.rotate(ang); g.shadowColor = b.color; g.shadowBlur = 24;
  if (b.kind === 'guangong') {
    // 月牙形刀氣
    g.fillStyle = '#80ffb0'; g.beginPath(); g.arc(0, 0, 28, -1.3, 1.3); g.arc(-12, 0, 24, 1.1, -1.1, true); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(2, 0, 22, -0.9, 0.9); g.arc(-8, 0, 20, 0.8, -0.8, true); g.closePath(); g.fill();
  } else if (b.kind === 'yuelao') {
    // 愛心
    g.rotate(-ang); g.fillStyle = b.color; g.beginPath(); g.moveTo(0, 12);
    g.bezierCurveTo(-26, -6, -12, -26, 0, -12); g.bezierCurveTo(12, -26, 26, -6, 0, 12); g.fill();
    g.fillStyle = '#ffd0e0'; g.fillRect(-9, -14, 5, 5);
  } else if (b.kind === 'yukionna') {
    // 冰刺
    g.fillStyle = '#c0ecff'; g.beginPath(); g.moveTo(28, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(24, 0); g.lineTo(-2, -5); g.lineTo(-2, 5); g.closePath(); g.fill();
  } else { g.fillStyle = b.color; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill(); }
  g.restore(); g.shadowBlur = 0;
}

// ───── 介面 ─────
function renderSkills() {
  const h = hero();
  const w = $('.who'); w.innerHTML = '';
  w.appendChild(artImg(h.id, 30));
  w.insertAdjacentHTML('beforeend', `<div class="who-name">輪到 <b style="color:${h.color}">${h.name}</b>${h.tag ? `<span class="muted">・${h.tag}</span>` : ''}</div>`);
  const box = $('.skills'); box.innerHTML = '';
  h.skills.forEach((sk, i) => {
    const b = document.createElement('button'), cd = h.cds[i], need = SKILL_LV[i];
    b.className = 'btn sk' + (i === skillIdx ? ' on' : '') + (h.lv < need ? ' locked' : '');
    // 還沒解鎖的招：灰掉，點了看說明
    if (h.lv < need) {
      b.innerHTML = `<b>${sk.name}${i === 2 ? '★' : ''}</b><span class="shape">Lv${need} 解鎖</span>`;
      b.onclick = () => {
        if (busy) return;
        showBox(`<h2>${sk.name}</h2><p class="muted">${h.name} Lv${need} 解鎖（現在 Lv${h.lv}）・${SHAPES[sk.shape]}${sk.melee ? '・近身' : ''}${sk.cd ? `・冷卻 ${sk.cd}` : ''}</p><p>${sk.desc}</p><button class="btn primary wide info-ok">知道了</button>`);
        $('.box .info-ok').onclick = hideBox;
      };
      box.appendChild(b);
      return;
    }
    b.disabled = cd > 0 || busy;
    b.innerHTML = `<b>${sk.name}${i === 2 ? '★' : ''}</b><span class="shape">${SHAPES[sk.shape]}${sk.melee ? '・近身' : ''}</span>${cd > 0 ? `・還要 ${cd} 輪` : sk.cd ? `・冷卻 ${sk.cd}` : ''}`;
    b.onclick = () => { if (busy) return; skillIdx = i; clearPath(); renderSkills(); };
    box.appendChild(b);
  });
  gearWho(h);
  // 被動、天賦、完整招式說明收在「說明」裡，戰鬥畫面不用捲動
  const info = Object.assign(document.createElement('button'), { className: 'btn gear-chip who-info', textContent: '說明' });
  info.onclick = () => { if (!busy) showInfo(h); };
  w.appendChild(info);
  autoDemo();
  updateUi();
}

async function walkTo(p) {
  const h = hero(), d = dist(p, h);
  if (d > MOVE_R) p = { x: h.x + (p.x - h.x) * MOVE_R / d, y: h.y + (p.y - h.y) * MOVE_R / d };
  moving = false; busy = true; h.moved = true; updateUi();
  await moveTo(h, clampPos(p), 1.2);
  await settle();
  busy = false; updateUi();
}

function updateUi() {
  if (!run || !heroes || who < 0) return;
  $('.floor').textContent = `第 ${run.floor} 層`;
  $('.turn').textContent = `第 ${turn} 手`;
  const sk = skill(), used = sk.shape === 'tap' ? inkMax() * hits.length / sk.max : Math.min(inkMax(), pathLen());
  $('.ink div').style.width = Math.max(0, 100 - used / inkMax() * 100) + '%';
  $('.ink div').style.background = hero().color;
  const saves = soulHits();
  $('.go').disabled = !flying && (busy || (!hits.length && !saves.length) || drawing);
  $('.redo').disabled = busy || !path.length;
  const mv = $('.move');
  if (mv) { mv.disabled = !!flying || busy || hero().moved; mv.textContent = moving ? '取消' : hero().moved ? '已移動' : '移動'; }
  if (flying) return;
  if (moving) return tip(`點戰場上要讓<b>${hero().name}</b>走去的地方（金色圈內，最遠 ${MOVE_R}）。走完還是可以出招，每次輪到只能移動一次。`);
  if (busy) tip(`${hero().name}出招中……`);
  else if (drawing) tip(HOW[sk.shape]);
  else if (!path.length) demo || tip(`<b>${sk.name}</b>（${SHAPES[sk.shape]}）${sk.desc}`);
  else if (hits.length) {
    const tal = talentsHit(), cx = crossings();
    tip(`「${sk.name}」會打 ${results().filter((x) => x.u.side === 'enemy' && x.dmg && !x.cross).length} 下（${new Set(hits.filter((u) => u.side === 'enemy')).size} 個敵人）${tal.length ? `，觸發天賦 <b>${tal.map((t) => t.name + '・' + t.talent.n).join('、')}</b>` : ''}${cx.length ? `，<b>紅線交會 ${cx.length} 處</b>${sk.xc ? `（交會加成 ×${cx.length}：${sk.xc.d}）` : ''}` : ''}。${sk.shape === 'tap' && hits.length < sk.max ? '可以繼續點，' : ''}${saves.length ? `，<b>救回 ${saves.map((u) => u.name).join('、')}</b>` : ''}。滿意就按出招，不滿意按重畫。`);
  }
  else if (saves.length) tip(`這一筆會<b>救回 ${saves.map((u) => u.name).join('、')}</b>（回一半生命）。按出招就救。`);
  else tip(`這條線沒有碰到目標，按重畫再來。`);
}

$('.redo').onclick = () => { if (!busy) clearPath(); };
if ($('.move')) $('.move').onclick = () => { if (busy || !heroes || flying || hero().moved) return; clearPath(); moving = !moving; updateUi(); };
$('.how').onclick = () => { if (busy || !heroes) return; clearPath(); startDemo(skill().shape); };
$('.go').onclick = () => (flying ? flying(null) : go());
// 玩法說明：按上面的「玩法」打開
let helpHtml = '';
const helpBtn = $('.helpbtn');
if (helpBtn) helpBtn.onclick = () => { if (busy) return; showBox(`<h2>玩法說明</h2>${helpHtml}<button class="btn primary wide info-ok">知道了</button>`); $('.box .info-ok').onclick = hideBox; };
function renderHelp() {
  helpHtml = `
  <p><b>不會畫？</b>按左下的「怎麼畫」，戰場上會用白色虛線示範這一招的畫法。</p>
  <p><b>看說明</b>：點一下戰場上的角色或敵人，會跳出生命、狀態（勢、冰霜、紅線、凍住…）、招式和裝備的說明。用連點招式時，點一下是選目標，要<b>長按</b>才看說明。</p>
  <p>三位神魔輪流上場，<b>每次只動一位</b>，輪到的神魔腳下有金色光圈。選他的一招，照那招的畫法在戰場上畫，畫完會預覽每個目標受到的效果，按出招才算數。</p>
  ${Object.keys(SHAPES).map((k) => `<p><b>${SHAPES[k]}</b>：${HOW[k]}</p>`).join('')}
  <p><b>移動</b>：射程不夠打不到？出招前先按「移動」，再點戰場上要去的地方，神魔會走過去（每次輪到只能移動一次），走完再畫招。</p>
  <p>墨水條用完就不能再畫。標「近身」的招式神魔會自己跑過去打，其他招式站在原地放出去。</p>
  <p><b>天賦</b>：線穿過隊友，會發動那位隊友的天賦。<b>紅線交會</b>：同一回合隊友畫過的線會留在地上（淡淡的虛線，換回合就清掉），你的線跟它交叉，交叉點會炸開，附近敵人各受 6 傷害，也會發動那條線主人的天賦。有些招式還有<b>交會加成</b>（寫在招式說明裡），每交會一處效果再加一份，一招最多算 3 處。</p>
  <p>神魔出招時會沿著你畫的線跑過去，最後停在線的終點，所以畫線也是在決定下一輪站哪裡。三位神魔各出一招之後，敵人才一起行動，會走到目標面前打。點一下敵人可以看他這一輪要打誰、打多少，可以先凍住、先打死，或用護盾擋。</p>
  ${heroes.map((u) => { const H = HEROES[u.id]; return H.skills.map((s) => `<p><b>${H.name}・${s.name}</b>（${SHAPES[s.shape]}${s.melee ? '・近身' : ''}${s.cd ? `，冷卻 ${s.cd} 輪` : ''}）：${s.desc}</p>`).join('') + `<p><b>${H.name}・被動・${H.passive.n}</b>：${H.passive.d}</p><p><b>${H.name}・天賦・${H.talent.n}</b>：${H.talent.d}</p>`; }).join('')}
  <p><b>靈魂</b>：神魔倒下會變成發藍光的靈魂，頭上寫還剩幾輪。其他隊友的線穿過靈魂（畫圈圈住也算），出招就救回來、回一半生命；倒數完沒人救就魂散，這一層不能再上場。會搶魂的敵人會去把靈魂抓走封印（靈魂下面會寫「有怪要來搶！」），2 輪內打倒他就放出來，沒打倒他會帶著靈魂逃走，那位神魔這一世都不能再上場。</p>
  <p><b>因果債</b>：斬殺、吞掉這類直接把敵人帶走的招，每帶走一個欠 1 點債。債太多，追債人會找上門。</p>
  <p><b>精英、魔王</b>的特性寫在每層開場，也可以點他們看。典獄長每次行動都先甩出的鎖鏈會剪斷直線和自由線，畫圈不受影響。</p>
  <p><b>裝備</b>：每位神魔有兵器、法寶兩格。神族只能用神器，魔族只能用邪物，專屬兵器只有本人能用。精英層打完可以從三件裡選一件，魔王層有機會掉專屬兵器（試玩版第 1 層也會掉一件）。裝備會改變線的畫法，名字上面的小方塊就是身上的裝備。</p>
  ${Object.values(GEAR).sort((a, b) => b.tier - a.tier).map((it) => `<p><b style="color:${it.color}">${it.n}</b>（${it.rank}・${it.kind}・${SLOT[it.slot]}${it.own ? `・${HEROES[it.own].name}專屬` : ''}）：${it.d}</p>`).join('')}`;
}
window.__s = () => ({ run, heroes, foes, hits, path, chains, who, skillIdx, busy });
// 測試用：直接觸發倒下、敵人行動、出招
window.__rl = { fall, setIntent, enemyTurn, newRound, go, apply, freeSouls, soulHits, winFloor, setPath: (pts) => { path = pts; } };
requestAnimationFrame(render);
return { HEROES, GROWTH, SKILL_LV, TALENT_LV, PICK_LV, FOES, GEAR, SLOT, SIDE, ALL_IDS, start, stop, canUse, gearBox, gearOffer, showBox, hideBox, artImg: (id, h) => artImg(id, h) };
})();
