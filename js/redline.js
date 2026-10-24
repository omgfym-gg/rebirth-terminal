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
const addRes = (h, n) => { const R = HEROES[h.id] && HEROES[h.id].res; if (!R || !n) return; const v = Math.max(0, Math.min(R[1], h.res + n)); if (v !== h.res) { h.res = v; float(h, `${R[0]} ${v}`, h.color, 18); } };
const HEROES = {
  guangong: {
    name: '關公', faith: '神', hp: 52, color: '#40d070', role: '近戰重擊', res: ['氣勢', 5],
    passive: { n: '氣勢', d: '關公每打中敵人一下，氣勢 +1（最多 5，頭上顯示「氣」），每過一輪少 1。放青龍斬時用掉全部氣勢，每 1 點氣勢讓每一下多 4 傷害。' },
    talent: { n: '溫酒斬華雄', d: '隊友的線穿過關公（或穿過關公這回合留下的線），關公下一招每一下傷害 +5、氣勢 +1。' },
    onHit: (h) => addRes(h, 1),
    round: (h) => { h.res = Math.max(0, h.res - 1); },
    talentFx: (t) => { t.wine = 5; addRes(t, 1); },
    skills: [
      { name: '刺顏良', shape: 'dash', len: 300, melee: true, anim: 's1', desc: '衝到第一個敵人面前刺 9 傷害，目標生命不到一半改成 14。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: u.hp < u.maxHp / 2 ? 14 : 9 })) },
      { name: '過五關斬六將', xc: { d: '多過一關（接著算傷害），打在最後一個敵人身上', fx: (res, n, h, en) => { const t = en.slice(0, 5); const u = t[t.length - 1]; if (!u) return res; return [...res, ...Array.from({ length: n }, (_, i) => ({ u, dmg: 5 + (t.length + i) * 3 + run.up.dmg + (h.wine || 0) }))]; } }, shape: 'zigzag', len: 900, cd: 1, melee: true, anim: 's2', desc: '每穿過敵人一次過一關，在敵人身上轉彎再多一關，最多 5 關，傷害 5、8、11、14、17。',
        run: (en) => en.slice(0, 5).map((u, i) => ({ u, dmg: 5 + i * 3 })) },
      { name: '青龍斬', shape: 'line', len: 560, cd: 3, anim: 'ult', spendRes: true, desc: '揮出一道刀氣，直線上的敵人各受 12 傷害，每點氣勢多 4，用掉全部氣勢。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 12 + 4 * h.res })) },
    ],
  },
  yuelao: {
    name: '月老', faith: '神', hp: 40, color: '#ff5c8d', role: '牽線支援',
    passive: { n: '紅線', d: '月老打到的敵人綁上紅線（到下一輪）。綁紅線的敵人受傷，其他綁紅線的敵人也受一半。' },
    talent: { n: '向月檢書', d: '隊友的線穿過月老（或穿過月老這回合留下的線），月老回 6 生命，那條線打到的敵人全部綁紅線。' },
    talentFx: (t, c) => { apply({ u: t, heal: 6 }); for (const e of c.en) e.red = true; },
    skills: [
      { name: '赤繩繫足', xc: { d: '全隊各回 3 生命', fx: (res, n) => [...res, ...heroes.filter((u) => !u.dead).map((u) => ({ u, heal: 3 * n }))] }, shape: 'free', len: 820, anim: 'cast', desc: '紅繩飛過去：經過的敵人各受 5 傷害並綁紅線，經過的隊友各回 6 生命。',
        run: (en, al) => [...en.map((u) => ({ u, dmg: 5, red: true })), ...al.map((u) => ({ u, heal: 6 }))] },
      { name: '千里姻緣一線牽', shape: 'tap', max: 4, any: true, len: 1, cd: 1, anim: 'cast', desc: '依序點最多 4 個目標串起來：敵人各受 4 傷害並綁紅線，隊友各得 6 護盾。',
        run: (en, al) => [...en.map((u) => ({ u, dmg: 4, red: true })), ...al.map((u) => ({ u, shield: 6 }))] },
      { name: '亂點鴛鴦譜', shape: 'free', len: 900, cd: 3, anim: 'ult', desc: '經過的敵人被配錯姻緣：下次行動改打自己的同伴，各受 6 傷害並綁紅線。',
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
      { name: '吹雪', shape: 'circle', len: 640, cd: 1, anim: 's2', desc: '圈住的敵人各受 4 傷害、冰霜 2 層。',
        run: (en) => en.map((u) => ({ u, dmg: 4, frost: 2 })) },
      { name: '雪夜之約', shape: 'free', len: 1000, cd: 3, anim: 'ult', desc: '暴風雪沿著線吹過去：經過的敵人全部凍住，各受 10 傷害。',
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
      { name: '基爾代爾聖火', xc: { d: '燃燒多 1 輪', fx: (res, n) => res.map((s) => (s.burn ? { ...s, burn: s.burn + n } : s)) }, shape: 'free', len: 800, anim: 's2', desc: '聖火沿著線燒過去：經過的敵人各受 5 傷害、燃燒 2 輪。',
        run: (en) => en.map((u) => ({ u, dmg: 5, burn: 2 })) },
      { name: '鐵砧鍛造', shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '圈住的隊友各得 8 護盾，圈住的敵人各受 4 傷害。',
        run: (en, al) => [...al.map((u) => ({ u, shield: 8 })), ...en.map((u) => ({ u, dmg: 4 }))] },
      { name: '詩歌療癒', shape: 'tap', max: 3, any: true, len: 1, cd: 3, anim: 'ult', desc: '點最多 3 個目標唱詩：隊友回 12 生命，敵人受 8 傷害、燃燒 3 輪。',
        run: (en, al) => [...al.map((u) => ({ u, heal: 12 })), ...en.map((u) => ({ u, dmg: 8, burn: 3 }))] },
    ],
  },
  tudigong: {
    name: '土地公', faith: '神', hp: 54, color: '#ffc830', role: '守護與元寶', res: ['元寶', 5],
    passive: { n: '元寶', d: '土地公每打中敵人一下，元寶 +1（最多 5，頭上顯示「元」）。張福德顯靈會用掉全部元寶，每個多 3 傷害。' },
    talent: { n: '虎爺', d: '隊友的線穿過土地公（或穿過他這回合留下的線），虎爺跳出來咬那條線打到的第一個敵人 8 傷害。' },
    onHit: (h) => addRes(h, 1),
    talentFx: (t, c) => { const e = c.en[0]; if (e) setTimeout(() => { float(e, '虎爺！', '#ffc830', 18); apply({ u: e, dmg: 8, shared: true }); }, 200); },
    skills: [
      { name: '巡境', xc: { d: '元寶 +1', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'free', len: 760, anim: 's2', desc: '拐杖指路，金光沿線巡過去：經過的敵人各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '護境安民', shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '圈住的隊友各得 9 護盾；圈到幾位隊友，元寶就加幾個。',
        run: (en, al, h) => [...al.map((u) => ({ u, shield: 9 })), ...(al.length ? [{ u: h, res: al.filter((u) => u !== h).length || 1 }] : [])] },
      { name: '張福德顯靈', shape: 'line', len: 600, cd: 3, anim: 'ult', spendRes: true, desc: '土地公生前的真身現身：直線上的敵人各受 12 傷害，每個元寶多 3，用掉全部元寶。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 12 + 3 * h.res })) },
    ],
  },
  hermes: {
    name: '赫爾墨斯', faith: '神', hp: 40, color: '#f0d070', role: '神速遊走', ink: 1.4, noCut: true,
    passive: { n: '有翼涼鞋', d: '赫爾墨斯的墨水多 40%，畫的線不會被典獄長的鎖鏈剪斷。' },
    talent: { n: '引魂者', d: '隊友的線穿過赫爾墨斯（或穿過他這回合留下的線），那條線打到、生命不到兩成的敵人直接被帶走（精英除外）。' },
    talentFx: (t, c) => { for (const e of c.en) if (!e.elite && e.hp <= e.maxHp * 0.2) apply({ u: e, execute: '引魂' }); },
    skills: [
      { name: '神使傳令', xc: { d: '每一下 +2 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 2 * n } : s)) }, shape: 'free', len: 900, melee: true, anim: 's2', desc: '飛奔穿過去：經過的敵人各受 4 傷害，同一個敵人每多穿一次再 +2。',
        run: (en) => { const n = new Map(); return en.map((u) => { const k = n.get(u) || 0; n.set(u, k + 1); return { u, dmg: 4 + 2 * k }; }); } },
      { name: '偷牛小賊', shape: 'dash', len: 340, cd: 1, melee: true, anim: 's1', desc: '衝到第一個敵人面前偷襲 7 傷害，順手偷走他的力氣：他下次攻擊減半（恐懼）。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 7, fear: true })) },
      { name: '斬百眼巨人', shape: 'zigzag', len: 1000, cd: 3, melee: true, anim: 'ult', desc: '吹笛讓阿耳戈斯睡著再斬：每過一關 9 傷害，最多 5 關。',
        run: (en) => en.slice(0, 5).map((u) => ({ u, dmg: 9 })) },
    ],
  },
  dagda: {
    name: '達格達', faith: '神', hp: 60, color: '#d8a060', role: '巨棒與大鍋', res: ['飽足', 20],
    passive: { n: '飽足', d: '達格達回血超過生命上限的部分存成飽足（最多 20，頭上顯示「飽」）。巨棒決斷會用掉全部飽足，每點多 1 傷害。' },
    talent: { n: '豐饒之鍋', d: '隊友的線穿過達格達（或穿過他這回合留下的線），畫線的那位隊友回 8 生命。' },
    talentFx: (t, c) => apply({ u: c.h, heal: 8 }),
    skills: [
      { name: '巨棒決斷', shape: 'line', len: 380, melee: true, wide: true, anim: 's2', spendRes: true, desc: '扛著巨棒衝過去橫掃（判定特別寬）：直線上的敵人各受 9 傷害，用掉全部飽足，每點多 1。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: 9 + h.res })) },
      { name: '豐收之歌', xc: { d: '每位隊友多回 4 生命', fx: (res, n) => res.map((s) => (s.heal ? { ...s, heal: s.heal + 4 * n } : s)) }, shape: 'circle', len: 700, cd: 1, anim: 's1', desc: '彈奏豐收之歌：圈住的隊友各回 10 生命（達格達自己回滿的部分變飽足）。',
        run: (en, al) => al.map((u) => ({ u, heal: 10 })) },
      { name: '生死巨棒', shape: 'dash', len: 320, cd: 3, melee: true, anim: 'ult', desc: '巨棒一端殺人一端救人：衝去砸第一個敵人 26 傷害；打倒的話全隊回 8 生命。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 26, killHeal: 8 })) },
    ],
  },
  hanako: {
    name: '花子', faith: '魔', hp: 42, color: '#b060e0', role: '恐懼與敲門', res: ['敲門', 3],
    passive: { n: '敲門', d: '花子每打中敵人一下就敲一次門（頭上顯示「敲」）。敲滿 3 次，那一下把敵人拉進隔間，多 12 傷害，然後重新數。' },
    talent: { n: '沖水', d: '隊友的線穿過花子（或穿過她這回合留下的線），那條線打到的敵人全部恐懼（下次攻擊減半）。' },
    // 照順序數敲門，數到 3 的那一下多 12（預覽和出招用同一套算法）
    post: (h, res) => { let r = h.res; return res.map((s) => { if (!s.dmg || s.u.side !== 'enemy' || s.cross) return s; r++; if (r < 3) return s; r = 0; return { ...s, dmg: s.dmg + 12, pull: true }; }); },
    onHit: (h, s) => { if (s.pull) { h.res = 0; float(s.u, '拉進隔間！', '#b060e0'); } else addRes(h, 1); },
    talentFx: (t, c) => { for (const e of c.en) e.fear = true; },
    skills: [
      { name: '敲門三聲', shape: 'tap', max: 3, len: 1, anim: 's1', desc: '點最多 3 個敵人，各敲一下門：各受 4 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 4 })) },
      { name: '花子在嗎？', xc: { d: '多敲一次門', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'circle', len: 700, cd: 1, anim: 's2', desc: '圈住的敵人各受 3 傷害並恐懼（下次攻擊減半）。',
        run: (en) => en.map((u) => ({ u, dmg: 3, fear: true })) },
      { name: '紅色披風', shape: 'free', len: 900, cd: 3, anim: 'ult', desc: '紅色披風捲過去：經過的敵人各受 8 傷害，恐懼中的改受 16。',
        run: (en) => en.map((u) => ({ u, dmg: u.fear ? 16 : 8 })) },
    ],
  },
  anubis: {
    name: '阿努比斯', faith: '魔', hp: 48, color: '#f0c040', role: '冥界審判',
    passive: { n: '天秤', d: '阿努比斯打生命比例比自己低的敵人，傷害加五成。' },
    talent: { n: '木乃伊包紮', d: '隊友的線穿過阿努比斯（或穿過他這回合留下的線），畫線的那位隊友得 8 護盾。' },
    mod: (h, s) => (s.dmg && s.u.side === 'enemy' && !s.cross && s.u.hp / s.u.maxHp < h.hp / h.maxHp ? { ...s, dmg: Math.round(s.dmg * 1.5) } : s),
    talentFx: (t, c) => apply({ u: c.h, shield: 8 }),
    skills: [
      { name: '靈魂審判', shape: 'dash', len: 320, melee: true, anim: 's1', desc: '衝去用權杖重擊第一個敵人 9 傷害。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 9 })) },
      { name: '法老的詛咒', xc: { d: '每一下 +3 傷害', fx: (res, n) => res.map((s) => (s.dmg ? { ...s, dmg: s.dmg + 3 * n } : s)) }, shape: 'line', len: 560, cd: 1, anim: 's2', desc: '直線上的敵人各受 5 傷害並恐懼（下次攻擊減半）。',
        run: (en) => en.map((u) => ({ u, dmg: 5, fear: true })) },
      { name: '吞噬者阿米特', shape: 'dash', len: 360, cd: 3, melee: true, anim: 'ult', desc: '衝向第一個敵人：生命不到三成的一般敵人直接被吞掉、阿努比斯回 10；其他的受 20 傷害。',
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
      { name: '波波波', xc: { d: '每個敵人再多「波」一下（3 傷害）', fx: (res, n, h, en) => [...res, ...[...new Set(en)].flatMap((u) => Array.from({ length: n }, () => ({ u, dmg: 3 })))] }, shape: 'line', len: 560, anim: 's1', desc: '低沉的「波、波、波」：直線上的敵人各受 6 傷害並恐懼。',
        run: (en) => en.map((u) => ({ u, dmg: 6, fear: true })) },
      { name: '八尺身影', shape: 'circle', len: 700, cd: 1, anim: 's2', desc: '圈住的隊友各得 7 護盾，圈住的敵人各受 2 傷害並恐懼。',
        run: (en, al) => [...al.map((u) => ({ u, shield: 7 })), ...en.map((u) => ({ u, dmg: 2, fear: true }))] },
      { name: '凝視', shape: 'tap', max: 2, len: 1, cd: 3, anim: 'ult', desc: '盯上最多 2 個敵人：各受 18 傷害，恐懼中的改成 28。',
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
      { name: '蛇髮', shape: 'free', len: 760, melee: true, anim: 's2', desc: '蛇髮一路咬過去：經過的敵人各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '石化凝視', xc: { d: '每個敵人多疊 1 層石化', fx: (res, n) => res.map((s) => (s.stone ? { ...s, stone: s.stone + n } : s)) }, shape: 'line', len: 600, cd: 1, anim: 's1', desc: '直線上的敵人各受 4 傷害、多疊 1 層石化。',
        run: (en) => en.map((u) => ({ u, dmg: 4, stone: 1 })) },
      { name: '雅典娜的詛咒', shape: 'circle', len: 700, cd: 3, anim: 'ult', desc: '圈住的敵人各受 6 傷害、多疊 2 層石化；已經是石像的直接碎掉，改受 20。',
        run: (en) => en.map((u) => (u.stun ? { u, dmg: 20, unstun: true } : { u, dmg: 6, stone: 2 })) },
    ],
  },
  horusshadow: {
    name: '荷魯斯之影', faith: '魔', hp: 46, color: '#e0b850', role: '暗影與碎片', res: ['眼之碎片', 6],
    passive: { n: '眼之碎片', d: '戰場上會掉出眼之碎片（金色小眼睛），任何人畫的線經過就撿起來給荷魯斯之影（最多 6，頭上顯示「眼」）。天空之神的審判會用掉全部碎片，集滿 6 片傷害加倍。' },
    talent: { n: '真知之眼', d: '隊友的線穿過荷魯斯之影（或穿過他這回合留下的線），眼之碎片 +2。' },
    talentFx: (t) => addRes(t, 2),
    skills: [
      { name: '權杖金光', xc: { d: '眼之碎片 +1', fx: (res, n, h) => [...res, { u: h, res: n }] }, shape: 'line', len: 600, anim: 'punch', desc: '權杖射出金光：直線上的敵人各受 7 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 7 })) },
      { name: '暗影之眼', shape: 'tap', max: 3, len: 1, cd: 1, anim: 'cast', desc: '點最多 3 個敵人，面具上的眼睛放出暗影：各受 5 傷害。',
        run: (en) => en.map((u) => ({ u, dmg: 5 })) },
      { name: '天空之神的審判', shape: 'circle', len: 700, cd: 3, anim: 'cast', spendRes: true, desc: '圈住的敵人各受 10 傷害，每片碎片多 2；集滿 6 片再加倍。用掉全部碎片。',
        run: (en, al, h) => en.map((u) => ({ u, dmg: (10 + 2 * h.res) * (h.res >= 6 ? 2 : 1) })) },
    ],
  },
  redgirl: {
    name: '紅衣小女孩', faith: '魔', hp: 44, color: '#ff4050', role: '迷途',
    passive: { n: '迷途', d: '紅衣小女孩每打中敵人一下疊 1 層迷途（頭上顯示「迷」），疊到 5 層敵人就迷路：下次行動改打自己的同伴。' },
    talent: { n: '跟我走', d: '隊友的線穿過紅衣小女孩（或穿過她這回合留下的線），那條線打到的敵人各疊 1 層迷途。' },
    onHit: (h, s) => addLost(s.u, 1),
    talentFx: (t, c) => { for (const e of c.en) addLost(e, 1); },
    skills: [
      { name: '牽手', shape: 'dash', len: 320, melee: true, anim: 'punch', desc: '撲到第一個敵人面前抓住他：6 傷害、多疊 2 層迷途。',
        run: (en) => firstEnemy(en).map((u) => ({ u, dmg: 6, lost: 2 })) },
      { name: '紅霧', xc: { d: '每個敵人多疊 1 層迷途', fx: (res, n) => res.map((s) => (s.lost ? { ...s, lost: s.lost + n } : s)) }, shape: 'circle', len: 700, cd: 1, anim: 'cast', desc: '召出紅色山霧：圈住的敵人各受 3 傷害、多疊 1 層迷途。',
        run: (en) => en.map((u) => ({ u, dmg: 3, lost: 1 })) },
      { name: '深山迷途', shape: 'free', len: 1000, cd: 3, anim: 'cast', desc: '把敵人帶進深山：經過的敵人各受 5 傷害、多疊 2 層迷途；已經迷路的再多受 10。',
        run: (en) => en.map((u) => ({ u, dmg: u.confused ? 15 : 5, lost: 2 })) },
    ],
  },
};
// 交會加成：這招的線每交會一處，額外的效果（寫進招式說明）
for (const H of Object.values(HEROES)) for (const sk of H.skills) if (sk.xc) sk.desc += `<b>交會加成</b>：每交會一處，${sk.xc.d}。`;
const ALL_IDS = Object.keys(HEROES);
// 敵人：都是都市傳說或怪物（60 位可玩神魔不會拿來當敵人）。elite 精英、boss 魔王（精英和魔王不會被嘲諷、不會被直接帶走）
// chains 拉幾條鎖鏈、gaze 改用凝視打全隊的機率、twice 一次打兩下、armor 每一下少受的傷害、judge 每 3 次行動審判全隊
const FOES = {
  zombie:  { name: '夜行殭屍', sprite: 'zombie', hp: 30, atk: 11, exp: 8, d: '半夜還抱著公文在走廊遊蕩的殭屍。會走到目標面前咬一口。' },
  wisp:    { name: '鬼火', sprite: 'wisp', hp: 16, atk: 8, exp: 5, d: '飄忽不定的藍色火焰，生命不多，會飄到目標身邊燒一下。' },
  shade:   { name: '影子怪', sprite: 'shade', hp: 22, atk: 9, exp: 6, d: '從燈照不到的角落爬出來的影子，會貼到目標身上咬一口。' },
  husk:    { name: '空殼職員', sprite: 'husk', hp: 38, atk: 10, exp: 9, d: '靈魂早就被抽走、只剩身體還在上班的職員。很耐打。' },
  printer: { name: '卡紙印表機', sprite: 'printer', hp: 24, atk: 9, exp: 6, d: '一直吐出寫著你名字的紙，會衝過來用紙割人。' },
  mirror:  { name: '鏡中人', sprite: 'mirror', hp: 28, atk: 12, exp: 8, d: '鏡子裡的你，比你本人更想活下去。攻擊比較痛。' },
  hunter:  { name: '追殺者', sprite: 'hunter', hp: 80, atk: 10, exp: 25, elite: true, twice: true, d: '精英。專挑生命最少的神魔，一次連砍兩下。不會被嘲諷。' },
  warden:  { name: '無臉典獄長', sprite: 'boss', hp: 110, atk: 17, exp: 25, elite: true, chains: 2, gaze: 0.4, d: '精英。會拉出鎖鏈（灰色粗線），直線和自由線碰到就被剪斷，畫圈不受影響。有四成機率改用凝視打全隊（傷害六成）。不會被嘲諷。' },
  judge:   { name: '考績審判官', sprite: 'judge', hp: 170, atk: 16, exp: 50, elite: true, boss: true, armor: 3, judge: true, d: '魔王。穿著硬殼，每一下傷害少 3。每行動 3 次就審判一次全隊（傷害八成）。不會被嘲諷。' },
  wardenX: { name: '典獄長本尊', sprite: 'boss', hp: 230, atk: 18, exp: 60, elite: true, boss: true, chains: 3, gaze: 0.4, d: '魔王。拉出三條鎖鏈，直線和自由線碰到就被剪斷，畫圈不受影響。有四成機率改用凝視打全隊（傷害六成）。不會被嘲諷。' },
  // 下面這批的圖臉朝左（faceL）。sp：一般敵人的特性，開場框會寫出來
  jinmenken:   { name: '人面犬', sprite: 'jinmenken', faceL: true, hp: 18, atk: 8, exp: 5, dodge: true, sp: '第一下一定會閃開。', d: '長著大叔臉的狗，半夜在路邊跟你說「別管我」。第一下一定會閃開。' },
  mizuki:      { name: '水鬼', sprite: 'mizuki', faceL: true, hp: 30, atk: 10, exp: 7, chains: 1, chainKind: 'water', d: '在水邊等人替死的鬼。會留下水窪（藍色），近身招式的線碰到就被剪斷。' },
  gaki:        { name: '餓鬼', sprite: 'gaki', faceL: true, hp: 34, atk: 9, exp: 7, noStatus: true, sp: '綁不上紅線、凍不住，也吸不到他的血。', d: '肚子永遠填不飽的鬼。綁不上紅線、不會疊冰霜也凍不住，吸血也吸不到他。' },
  diaoxigui:   { name: '吊死鬼', sprite: 'diaoxigui', faceL: true, hp: 24, atk: 11, exp: 7, high: true, sp: '吊在半空，近身招式打不到，要用遠程。', d: '吊在半空晃來晃去的鬼。近身招式打不到他，要用遠程的招。' },
  jerseydevil: { name: '澤西惡魔', sprite: 'jerseydevil', faceL: true, hp: 26, atk: 11, exp: 8, blink: true, sp: '每輪瞬間移動，冰地、雪地、火路都踩不到他。', d: '新澤西松林裡的飛天怪物。每輪會瞬間移動，冰地、雪地、火路都困不住他。' },
  amanojaku:   { name: '天邪鬼', sprite: 'amanojaku', faceL: true, hp: 26, atk: 10, exp: 7, rtl: true, sp: '專唱反調：線要從右往左穿過他才是全傷害，不然只有一半。', d: '專門唱反調的小鬼。線要從右往左穿過他才打得全，其他方向只有一半傷害。' },
  lintoujie:   { name: '林投姐', sprite: 'lintoujie', faceL: true, hp: 95, atk: 14, exp: 25, elite: true, chains: 2, chainKind: 'tree', d: '精英。林投樹下的女鬼。長出兩條林投樹根（綠色），直線和自由線碰到就被剪斷，畫圈不受影響。不會被嘲諷。' },
  tengu:       { name: '天狗', sprite: 'tengu', faceL: true, hp: 90, atk: 13, exp: 25, elite: true, gust: true, d: '精英。山裡的天狗。每隔一次行動就搧起狂風打全隊（傷害六成），把大家吹得到處都是。不會被嘲諷。' },
  mothman:     { name: '莫斯曼', sprite: 'mothman', faceL: true, hp: 85, atk: 15, exp: 25, elite: true, curse: true, d: '精英。紅眼的蛾人。每隔一次行動就瞪紅眼打全隊（傷害五成），下一輪大家的墨水都只剩一半。不會被嘲諷。' },
  guhuoniao:   { name: '姑獲鳥', sprite: 'guhuoniao', faceL: true, hp: 160, atk: 15, exp: 50, elite: true, boss: true, circleOnly: true, carry: true, d: '魔王。披著羽毛的鳥女。只有畫圈打得全，其他招式傷害減半。每行動 3 次就抓走一位神魔，那位下一輪不能出招。不會被嘲諷。' },
  dullahan:    { name: '杜拉漢', sprite: 'dullahan', faceL: true, hp: 230, atk: 18, exp: 60, elite: true, boss: true, head: true, d: '魔王。無頭騎士，頭顱飄在別的地方（白色骷髏）。線要同時經過頭顱才是全傷害，不然只有一半。不會被嘲諷。' },
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
  run = { floor: c.floor, up: { dmg: 0, ink: 1, ...(c.up || {}) } };
  heroes = c.party.map((p) => ({ ...HEROES[p.id], id: p.id, tag: p.tag || '', side: 'ally', art: p.id, gear: p.gear || [], maxHp: p.maxHp, hp: Math.max(0, Math.min(p.maxHp, p.hp)), dead: p.hp <= 0, x: 0, y: 0, shield: 0, flash: 0, cds: [0, 0, 0], anim: null, taunt: false, res: p.res || 0, wine: 0 }));
  const k = c.scale || 1;
  foes = c.foes.map((key) => ({ key, ...FOES[key], side: 'enemy', maxHp: Math.round(FOES[key].hp * k), hp: Math.round(FOES[key].hp * k), atk: Math.round(FOES[key].atk * k), dead: false, frozen: false, confused: false, frost: 0, red: false, burn: 0, fear: false, mark: false, stone: 0, stun: false, lost: 0, flash: 0, x: 0, y: 0, acts: 0, dodged: false, headAt: null }));
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
    ${kinds.includes('chain') ? '<p class="muted">直線和自由線碰到<b>鎖鏈</b>就會被剪斷，畫圈不受影響。</p>' : ''}
    ${kinds.includes('tree') ? '<p class="muted">直線和自由線碰到<b>樹根</b>（咖啡色、長葉子）就會被剪斷，畫圈不受影響。</p>' : ''}
    ${kinds.includes('water') ? '<p class="muted">近身招式的線碰到<b>水窪</b>（藍色一灘水）就會被剪斷，遠程招不受影響。</p>' : ''}
    <button class="btn primary wide ok">開始</button>`);
  $('.box .ok').onclick = hideBox;
  tutIntro();
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
    if (n === 0 && !fresh) { await newRound(); fresh = true; }
    const x = heroes[n];
    if (x.dead) continue;
    if (x.carried) { x.carried = false; float(x, '被抓走了，跳過', '#d0b0ff', 18); await wait(500); continue; }
    break;
  }
  who = n; turn++;
  const h = heroes[who];
  h.cds = h.cds.map((c) => Math.max(0, c - 1));
  skillIdx = 0;
  if (fresh) { for (const e of foes) if (!e.dead) setIntent(e); makeChains(); }
  clearPath(); renderSkills();
}

async function newRound() {
  gearNewRound();
  trails = [];
  for (const h of heroes) { h.taunt = false; if (h.round) h.round(h); }
  for (const e of foes) { e.frost = Math.max(0, e.frost - 1); e.red = false; }
  // 燃燒：每輪開始燒 3
  for (const e of foes) if (!e.dead && e.burn) { e.burn--; tickDmg(e, 3, '#ff8a30'); fxPush({ type: 'burst', x: e.x, y: e.y - 46, color: '#ff8a30', dur: 450, seed: 2 }); }
  spawnShards();
  // 新的一輪：敵人退回右邊重整隊形，神魔留在上一手停下的位置
  await Promise.all(foes.filter((e) => !e.dead).map((e) => e.x < 330 || (e.high && e.y > 420) ? moveTo(e, { x: rnd(340, 545), y: e.high ? rnd(300, 400) : e.y }, 0.8).then(() => { e.face = -1; }) : null));
  // 澤西惡魔：瞬間移動到別的地方
  for (const e of foes) if (!e.dead && e.blink) { fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#c080ff', dur: 400 }); e.x = rnd(260, 545); e.y = rnd(320, 650); fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#c080ff', dur: 400 }); }
  await settle();
}

function setIntent(e) {
  const a = heroes.filter((h) => !h.dead);
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
  e.intent = { target: e.twice ? low : (!e.elite && tank) || pick(a), dmg: e.atk, twice: e.twice };
}

function makeChains() {
  chains = [];
  for (const w of foes) if (w.chains && !w.dead) for (let i = 0; i < w.chains; i++) { const x = rnd(220, 330), y = rnd(300, 640), a = rnd(-1.3, 1.3), L = w.chainKind === 'water' ? 130 : 160; chains.push({ x1: x - Math.cos(a) * L / 2, y1: y - Math.sin(a) * L / 2, x2: x + Math.cos(a) * L / 2, y2: y + Math.sin(a) * L / 2, kind: w.chainKind || 'chain' }); }
}
// 這一招的線會被哪些東西剪斷（水窪只剪近身招）
const cutters = () => (hero().noCut ? [] : chains.filter((c) => c.kind !== 'water' || skill().melee));

const hero = () => heroes && heroes[who];
const skill = () => hero().skills[skillIdx];
const inkMax = () => Math.round(skill().len * run.up.ink * (hero().ink || 1) * (hero().inkBuff || 1) * curse);
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
  const p = toCanvas(ev), sk = skill(), h = hero();
  pressStart(p, sk.shape === 'tap');
  if (sk.shape === 'tap') return;
  clearPath();
  if (sk.shape !== 'circle' && dist(center(h), p) > HIT_R + 16) { tip(`這招要從<b>${h.name}身上</b>開始畫（腳下有金色光圈的那位）。`); return; }
  drawing = true;
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
    for (const c of cutters()) if (segCross(last, p, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 })) { path.push(cutAt(last, p, c)); fxPush({ type: 'snap', x: p.x, y: p.y, dur: 600 }); drawing = false; updateUi(); tip(`紅線被<b>${CUT[c.kind][0]}</b>剪斷了。`); return; }
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
  // 七日之期：被標記的敵人每一下 +2
  res = res.map((s) => (s.dmg && s.u.mark ? { ...s, dmg: s.dmg + 2 } : s));
  if (h.post) res = h.post(h, res);
  const xn = crossings().length;
  if (xn && skill().xc) res = skill().xc.fx(res, xn, h, en, al);
  res = gearResults(h, res);
  res = res.map(foeMod);
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
  return [...s];
}
function fireTalents(list, h) {
  const later = [], en = [...new Set(hits.filter((u) => u.side === 'enemy' && !u.dead))];
  for (const t of list) {
    float(t, t.talent.n, t.color, 20);
    fxPush({ type: 'ring', x: t.x, y: t.y - 46, color: t.color, dur: 600 });
    if (t.talentFx) t.talentFx(t, { h, en, later: (f) => later.push(f) });
  }
  return later;
}

// ───── 出招 ─────
async function go() {
  if (busy || !hits.length) return;
  const h = hero(), sk = skill(), steps = results(), tal = talentsHit(), cx = crossings();
  busy = true; updateUi(); renderSkills();
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
    float({ x: c.x, y: c.y + 70 }, '紅線交會', '#ffe070', 20);
    for (const st of steps.filter((x) => x.cross === c)) apply(st);
    await wait(250);
  }
  for (const st of self) apply(st);
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
  fxPush({ type: 'charge', u: h, color: h.color, dur: 450 });
  await skillAnim(h, sk, 0.5);
}

// 播技能動作，等到出手那一格
async function skillAnim(h, sk, part = 0.6) {
  const a = artAnim(h.art, sk.anim) || artAnim(h.art, 'punch');
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
    float(u, String(s.dmg), s.dmg >= 15 ? '#ffe070' : '#fff');
    fxPush({ type: 'burst', x: u.x, y: u.y - 46, color: hero().color, dur: 450, seed: Math.random() * 6 });
    if (u.hp <= 0) { u.hp = 0; u.dead = true; u.deadAt = performance.now(); }
  }
  if (s.execute && !u.dead) { u.hp = 0; u.dead = true; u.deadAt = performance.now(); float(u, s.execute + '！', '#ffe070'); fxPush({ type: 'burst', x: u.x, y: u.y - 46, color: '#ffe070', dur: 600, seed: 3 }); return; }
  if (s.killHeal && u.dead) for (const a of heroes) if (!a.dead) apply({ u: a, heal: s.killHeal });
  if (s.burn && !u.dead) addBurn(u, s.burn);
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
  if (s.heal) { const v = Math.min(s.heal, u.maxHp - u.hp); if (v > 0) { u.hp += v; float(u, '+' + v, '#7fe07f'); fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#7fe07f', dur: 500 }); } }
  if (s.shield) { u.shield += s.shield; setTimeout(() => float(u, '盾 +' + s.shield, '#ffe070'), 150); fxPush({ type: 'ring', x: u.x, y: u.y - 46, color: '#ffe070', dur: 500 }); }
  if (s.taunt) { u.taunt = true; for (const e of foes) if (!e.dead && !e.elite) e.intent = { target: u, dmg: e.atk }; float(u, '嘲諷', '#40d070'); }
  gearOnApply(s);
}

// 不經過出招的傷害（燃燒）
function tickDmg(u, n, color) {
  if (u.dead) return;
  u.hp -= n; u.flash = performance.now() + 200; float(u, String(n), color);
  if (u.hp <= 0) { u.hp = 0; u.dead = true; u.deadAt = performance.now(); }
}
function addBurn(u, n) { if (u.dead) return; u.burn = Math.max(u.burn, n); setTimeout(() => float(u, '燃燒', '#ff8a30', 18), 220); }
// 石化疊到 3 層變石像（下次不能行動）
function addStone(u, n) {
  if (u.dead || u.stun) return;
  u.stone += n;
  if (u.stone < 3) return;
  u.stone = 0; u.stun = true; setTimeout(() => float(u, '變成石像', '#c0c0c0'), 240);
}
// 迷途疊到 5 層就迷路（下次打自己人）
function addLost(u, n) {
  if (u.dead) return;
  u.lost += n;
  if (u.lost < 5) return;
  u.lost = 0; u.confused = true; setTimeout(() => float(u, '迷路了', '#ff4050'), 240);
}
// 眼之碎片：隊伍裡有荷魯斯之影才會掉，場上最多 4 片
let shards = [];
function spawnShards() {
  const ho = heroes.find((h) => h.id === 'horusshadow' && !h.dead);
  if (!ho) return;
  for (let i = 0; i < 2 && shards.length < 4; i++) shards.push({ x: rnd(80, 540), y: rnd(290, 640) });
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
    if (e.stun) { e.stun = false; float(e, '石像，跳過', '#c0c0c0'); await wait(380); continue; }
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
        o.hp -= hit(e.atk); o.flash = performance.now() + 200; float(o, String(hit(e.atk)), '#ff5c8d');
        if (o.hp <= 0) { o.hp = 0; o.dead = true; o.deadAt = performance.now(); }
      } else float(e, '發呆', '#ff5c8d');
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
      }
    }
    await wait(380);
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
  h.hp -= d; h.flash = performance.now() + 200;
  const a = artAnim(h.art, 'hurt'); if (a) h.anim = { a, t0: performance.now() };
  setTimeout(() => float(h, String(d), '#ff7070'), blocked ? 250 : 0);
  if (h.hp <= 0) { h.hp = 0; h.dead = true; }
}

// ───── 打完一層 ─────
// 倒下的神魔過層後回三成生命，站著的回 6
function endResult(win) {
  const hp = {}, res = {};
  for (const h of heroes) { hp[h.id] = !win ? 0 : h.dead ? Math.round(h.maxHp * 0.3) : Math.min(h.maxHp, h.hp + 6); res[h.id] = h.res; }
  const dead = foes.filter((e) => e.dead);
  return { win, hp, res, kills: dead.length, exp: dead.reduce((a, e) => a + (e.exp || 0), 0), turns: turn };
}
function winFloor() {
  busy = true;
  const c = cfg; wait(600).then(() => c.onEnd(endResult(true)));
}
function lose() {
  busy = true;
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
  yata: { n: '八咫鏡', kind: '神器', slot: 'weapon', icon: '鏡', color: '#ffe070', from: '日本三神器',
    d: '照出天照大神的鏡子：直線碰到戰場邊緣會反射一次，剩下的墨水全部用來反彈。' },
  ruyi: { n: '如意金箍棒', kind: '神器', slot: 'weapon', icon: '棒', color: '#ffb040', from: '西遊記',
    d: '可大可小：線變粗 50%，比較容易掃到敵人。' },
  qiankun: { n: '乾坤圈', kind: '神器', slot: 'weapon', icon: '圈', color: '#ffd060', from: '封神演義',
    d: '哪吒的金圈：畫的圈會留在場上一輪，敵人走進圈裡攻擊時受 6 傷害。' },
  muramasa: { n: '妖刀村正', kind: '邪物', slot: 'weapon', icon: '妖', color: '#c060ff', from: '日本妖刀傳說',
    d: '出鞘必見血：自由線同一個敵人每多穿一次，那一下再 +3 傷害。代價：每多穿一次自己扣 1 生命。' },
  hagoromo: { n: '天女的羽衣', kind: '神器', slot: 'charm', icon: '羽', color: '#c0f0ff', from: '日本傳說',
    d: '穿上就能飛：出招後可以點戰場上任何地方飛過去，自己決定站哪。' },
  dracula: { n: '德古拉的斗篷', kind: '邪物', slot: 'charm', icon: '血', color: '#e04060', from: '吸血鬼傳說',
    d: '吸血鬼伯爵的披風：打出的傷害吸回 30% 生命。代價：每輪開始扣 1 生命（怕光）。', roundCost: 1 },
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
    d: '高處俯視：八尺大人的線打到的敵人被嚇得往後退一大段，要多走好遠才打得到人。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_medusa: { n: '石化之眼', kind: '邪物', slot: 'weapon', own: 'medusa', icon: '蛇', color: '#70d060', from: '希臘神話',
    d: '最後一眼：美杜莎的線畫到哪裡停，那附近的敵人各疊 1 層石化。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_horusshadow: { n: '碎裂的荷魯斯之眼', kind: '邪物', slot: 'weapon', own: 'horusshadow', icon: '瞳', color: '#e0b850', from: '埃及神話',
    d: '被挖出的那隻眼：荷魯斯之影的線每碰到一個敵人，就多撿 1 片眼之碎片。代價：每輪開始扣 1 生命。', roundCost: 1 },
  ex_redgirl: { n: '紅色雨衣', kind: '邪物', slot: 'weapon', own: 'redgirl', icon: '衣', color: '#ff4050', from: '臺灣都市傳說',
    d: '山裡的那件紅衣：每輪第一個要打紅衣小女孩的敵人會在山裡迷路，走到別的地方、這次打不到人。代價：每輪開始扣 1 生命。', roundCost: 1 },
};
// 裝備清單：背包和誰身上穿什麼由呼叫的人存（試玩存在手機、主遊戲存在這一世的存檔），戰鬥裡每位神魔帶著 gear 陣列上場
const gearOf = (h) => (h.gear || []).filter((id) => GEAR[id]);
const wears = (h, id) => !!h && gearOf(h).includes(id);
// anyKind：這一世為人，神器、邪物都能用（專屬兵器還是只有本人能用）
const canUse = (heroId, id, anyKind) => { const it = GEAR[id]; return it.own ? it.own === heroId : anyKind || it.kind === (SIDE[heroId] === '神' ? '神器' : '邪物'); };
const hitR = () => HIT_R * (wears(hero(), 'ruyi') ? 1.5 : 1) * (skill().wide ? 1.5 : 1);
const lineShape = (sk) => sk.shape === 'line' || sk.shape === 'dash';
const freeShape = (sk) => sk.shape === 'free' || sk.shape === 'zigzag';
let zones = [], flying = null;
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
    if (segCross(a, b, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 })) { pts[i] = cutAt(a, b, c); pts.length = i + 1; }
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
        u.hp = 0; u.dead = true; u.deadAt = performance.now(); float(u, '秤心：吞掉', '#f0c040', 20);
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
  if (wears(h, 'ex_hachi') && en.length) await Promise.all(en.map((e) => { float(e, '嚇退', '#e8e8ff', 18); return moveTo(e, { x: Math.min(555, e.x + 110), y: e.y }, 0.9).then(() => { e.face = -1; }); }));
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
  if (first) return;
  // 邪物的代價：每輪開始扣生命（不會扣到倒下）
  for (const h of heroes) {
    const cost = gearOf(h).reduce((a, id) => a + (GEAR[id].roundCost || 0), 0);
    if (!h.dead && cost && h.hp > 1) { const v = Math.min(cost, h.hp - 1); h.hp -= v; float(h, '邪物 -' + v, '#c060ff', 18); }
  }
}
// 土地廟：附近的隊友受傷 -3
function gearHurt(h, d) {
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
    e.hp -= 6; e.flash = performance.now() + 200; float(e, '乾坤圈 6', '#ffd060');
    fxPush({ type: 'ring', x: e.x, y: e.y - 46, color: '#ffd060', dur: 500 });
    if (e.hp <= 0) { e.hp = 0; e.dead = true; e.deadAt = performance.now(); return false; }
  }
  return true;
}

// ───── 裝備的畫面 ─────
function gearLine(h) {
  const w = gearOf(h).find((id) => GEAR[id].slot === 'weapon');
  const color = { muramasa: '#c060ff', ruyi: '#ffb040', yata: '#ffe070' }[w] || (w && GEAR[w].own ? GEAR[w].color : '#ff3048');
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
    b.onclick = () => tip(`<b>${it.n}</b>：${it.d}`);
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
  const list = store.bag.filter((id) => GEAR[id] && GEAR[id].slot === sl && canUse(hid, id, store.anyKind && store.anyKind(hid)));
  const holder = (id) => store.heroes.find((o) => (store.eq[o] || {})[sl] === id && o !== hid);
  showBox(`<h2>${HEROES[hid].name}・${SLOT[sl]}</h2>
    ${list.length ? list.map((id) => { const it = GEAR[id], o = holder(id);
      return `<button class="btn opt gpick" data-id="${id}"><b style="color:${it.color}">${it.n}</b>（${it.kind}${it.from ? '・' + it.from : ''}）${o ? `<span class="muted">・現在在${HEROES[o].name}身上</span>` : ''}<br>${it.d}</button>`; }).join('') : '<p class="muted">倉庫裡沒有這一格能用的裝備。</p>'}
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
    ${ids.map((id) => { const it = GEAR[id]; return `<button class="btn opt gget" data-id="${id}"><b style="color:${it.color}">${it.n}</b>（${it.kind}・${SLOT[it.slot]}・${forWho(id)}）<br>${it.d}</button>`; }).join('')}`);
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
    if (R) r.push([`${R[0]} ${u.res}/${R[1]}`, u.passive.d]);
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
    if (u.stun) r.push(['石像', '被美杜莎石化：下一次輪到他時不能行動。雅典娜的詛咒打石像會碎掉重擊。']);
    if (u.stone) r.push([`石化 ${u.stone}/3`, '疊到 3 層變成石像，下次不能行動。']);
    if (u.burn) r.push([`燃燒 ${u.burn} 輪`, '每輪開始受 3 傷害。布麗姬打燃燒中的敵人每一下多 4。']);
    if (u.fear) r.push(['恐懼', '下一次攻擊傷害減半。']);
    if (u.mark) r.push(['七日之期', '被八尺大人標記，整層都在：受到每一下攻擊都 +2。']);
    if (u.lost) r.push([`迷途 ${u.lost}/5`, '疊到 5 層就迷路，下次行動改打自己的同伴。']);
  }
  return r;
}
function showInfo(u) {
  const st = statusRows(u), row = (k, v, c) => `<p><b style="color:${c || 'var(--gold)'}">${k}</b>：${v}</p>`;
  let html;
  if (u.side === 'ally') {
    const H = HEROES[u.id];
    html = `<h2 style="color:${H.color}">${H.name}</h2><p class="muted">${H.role}・${SIDE[u.id]}族</p>
      <p>生命 ${u.hp}/${u.maxHp}</p>
      ${st.length ? '<h3>現在的狀態</h3>' + st.map(([k, v]) => row(k, v)).join('') : ''}
      <h3>被動與天賦</h3>${row('被動・' + H.passive.n, H.passive.d, H.color)}${row('天賦・' + H.talent.n, H.talent.d, H.color)}
      <h3>招式</h3>${H.skills.map((sk, i) => row(`${sk.name}${i === 2 ? '★' : ''}`, `（${SHAPES[sk.shape]}${sk.melee ? '・近身' : ''}${sk.cd ? `・冷卻 ${sk.cd}` : ''}${u.cds[i] > 0 ? `・還要 ${u.cds[i]} 輪` : ''}）${sk.desc}`)).join('')}
      ${gearOf(u).length ? '<h3>裝備</h3>' + gearOf(u).map((id) => row(GEAR[id].n, GEAR[id].d, GEAR[id].color)).join('') : ''}`;
  } else {
    const F = FOES[u.key], it = u.intent;
    const intent = u.frozen ? '凍住了，這一輪不會行動。' : u.confused ? '被亂點鴛鴦，下一次會打自己的同伴。' : !it ? '還沒決定。' : it.all ? `${it.judge ? '審判' : '凝視'}全隊，每人 ${it.dmg} 傷害。` : `走到${it.target.name}面前打 ${it.dmg}${it.twice ? '，連砍兩下' : ''}。`;
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
  ['出招、看敵人', '滿意就按<b>出招</b>，不滿意按<b>重畫</b>。三位都出手後敵人才行動，敵人頭上寫著要打誰、打多少。<b>點一下角色或敵人</b>可以看詳細說明。'],
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
function float(u, text, color, size = 22) { fxPush({ type: 'text', x: u.x, y: u.y - 112, text, color, size, dur: 1000 }); }

function drawBg(now) {
  g.fillStyle = '#1b1826'; g.fillRect(0, 0, W, FLOOR);
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 120;
    g.fillStyle = '#141120'; g.fillRect(x, 60, 84, FLOOR - 60);
    g.fillStyle = '#2c2740'; g.fillRect(x - 6, 54, 96, 6); g.fillRect(x - 6, 54, 6, FLOOR - 54); g.fillRect(x + 84, 54, 6, FLOOR - 54);
    const fl = 0.6 + 0.4 * Math.sin(now / 300 + i * 1.7);
    g.fillStyle = `rgba(120,200,255,${0.5 * fl})`; g.fillRect(x + 38, 80, 8, 12);
  }
  g.fillStyle = '#332d48'; g.fillRect(0, FLOOR - 6, W, 6);
  g.fillStyle = '#24202e'; g.fillRect(0, FLOOR, W, H - FLOOR);
  g.strokeStyle = '#1d1a26'; g.lineWidth = 2;
  for (let y = FLOOR + 30; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let x = -600; x < W + 600; x += 90) { g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.4, FLOOR); g.lineTo(x, H); g.stroke(); }
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
  if (u.dead && u.side === 'ally') g.globalAlpha = 0.3;
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
  } else if (u.intent) {
    const t = u.frozen ? '凍住，跳過' : u.stun ? '石像，跳過' : u.confused ? '會打同伴' : u.intent.all ? `${u.intent.label || '全隊'} ${u.intent.dmg}` : `${u.intent.target.name} ${u.intent.dmg}${u.intent.twice ? '×2' : ''}${u.intent.carry ? ' 抓走' : ''}`;
    g.fillStyle = u.frozen ? '#a0e0ff' : u.confused ? '#ff8ac0' : '#ff8a8a'; g.fillText('⚔ ' + t, u.x, top - 8);
  }
  if (u.side === 'enemy') {
    // 身上的狀態排成一列小字
    const tags = [[u.frost, '霜' + u.frost, '#a0e0ff'], [u.red, '緣', '#ff5c8d'], [u.burn, '燒' + u.burn, '#ff8a30'], [u.fear, '懼', '#d0b0ff'], [u.mark, '標', '#e8e8ff'], [u.stone, '石' + u.stone, '#c0c0c0'], [u.lost, '迷' + u.lost, '#ff4050']].filter((t) => t[0]);
    g.font = 'bold 13px sans-serif'; g.textAlign = 'left';
    let tx = u.x - tags.reduce((a, t) => a + t[1].length * 14 + 4, 0) / 2;
    for (const [, t, c] of tags) { g.fillStyle = '#000'; g.fillRect(tx - 1, top + 9, t.length * 14 + 2, 16); g.fillStyle = c; g.fillText(t, tx, top + 22); tx += t.length * 14 + 4; }
    g.textAlign = 'center';
  }
}

function render(now) {
  // 戰場不在畫面上（主遊戲的其他畫面）就不畫，省電
  if (!cv.offsetParent) { requestAnimationFrame(render); return; }
  g.setTransform(1, 0, 0, 1, 0, -VIEW_Y);
  drawBg(now);
  if (heroes && who >= 0) {
    gearDrawZones(now);
    for (const c of chains) {
      const [name, c1, c2] = CUT[c.kind || 'chain'];
      const L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1), ux = (c.x2 - c.x1) / L, uy = (c.y2 - c.y1) / L, mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
      if (c.kind === 'water') {
        // 水窪：一灘水，表面有波紋
        g.save(); g.translate(mx, my); g.rotate(Math.atan2(uy, ux));
        g.fillStyle = 'rgba(30,80,130,0.85)'; g.beginPath(); g.ellipse(0, 0, L / 2 + 8, 22, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = c2; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, L / 2 + 8, 22, 0, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 2; g.globalAlpha = 0.7;
        for (let k = 0; k < 3; k++) { const r = ((now / 900 + k / 3) % 1); g.beginPath(); g.ellipse(-L / 4 + k * L / 4, 0, 6 + r * 24, 2 + r * 8, 0, 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = 1; g.restore();
      } else if (c.kind === 'tree') {
        // 樹根：彎彎曲曲的粗根，上面長葉子
        const pt = (t, w) => ({ x: c.x1 + ux * L * t - uy * w, y: c.y1 + uy * L * t + ux * w });
        g.lineCap = 'round';
        for (const [col, wd] of [[c1, 14], ['#6a4a24', 8]]) { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); for (let t = 0; t <= 1.001; t += 0.05) { const q = pt(t, Math.sin(t * 12) * 7); t ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); } g.stroke(); }
        g.fillStyle = c2;
        for (let t = 0.1; t < 1; t += 0.2) { const q = pt(t, Math.sin(t * 12) * 7 + 10); g.beginPath(); g.ellipse(q.x, q.y, 8, 4, Math.atan2(uy, ux) + 0.6, 0, Math.PI * 2); g.fill(); }
        g.lineCap = 'butt';
      } else {
        g.strokeStyle = c1; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(c.x1, c.y1); g.lineTo(c.x2, c.y2); g.stroke(); g.lineCap = 'butt';
        g.strokeStyle = c2; g.lineWidth = 3; g.setLineDash([10, 6]); g.beginPath(); g.moveTo(c.x1, c.y1); g.lineTo(c.x2, c.y2); g.stroke(); g.setLineDash([]);
      }
      // 標上名字，免得跟隊友的線搞混
      g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillRect(mx - 18, my + 22, 36, 18); g.fillStyle = c2; g.fillText(name, mx, my + 36);
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
    const b = document.createElement('button'), cd = h.cds[i];
    b.className = 'btn sk' + (i === skillIdx ? ' on' : '');
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

function updateUi() {
  if (!run || !heroes || who < 0) return;
  $('.floor').textContent = `第 ${run.floor} 層`;
  $('.turn').textContent = `第 ${turn} 手`;
  const sk = skill(), used = sk.shape === 'tap' ? inkMax() * hits.length / sk.max : Math.min(inkMax(), pathLen());
  $('.ink div').style.width = Math.max(0, 100 - used / inkMax() * 100) + '%';
  $('.ink div').style.background = hero().color;
  $('.go').disabled = !flying && (busy || !hits.length || drawing);
  $('.redo').disabled = busy || !path.length;
  if (flying) return;
  if (busy) tip(`${hero().name}出招中……`);
  else if (drawing) tip(HOW[sk.shape]);
  else if (!path.length) demo || tip(`<b>${sk.name}</b>（${SHAPES[sk.shape]}）${sk.desc}`);
  else if (hits.length) {
    const tal = talentsHit(), cx = crossings();
    tip(`「${sk.name}」會打 ${results().filter((x) => x.u.side === 'enemy' && x.dmg && !x.cross).length} 下（${new Set(hits.filter((u) => u.side === 'enemy')).size} 個敵人）${tal.length ? `，觸發天賦 <b>${tal.map((t) => t.name + '・' + t.talent.n).join('、')}</b>` : ''}${cx.length ? `，<b>紅線交會 ${cx.length} 處</b>${sk.xc ? `（交會加成 ×${cx.length}：${sk.xc.d}）` : ''}` : ''}。${sk.shape === 'tap' && hits.length < sk.max ? '可以繼續點，' : ''}滿意就按出招，不滿意按重畫。`);
  }
  else tip(`這條線沒有碰到目標，按重畫再來。`);
}

$('.redo').onclick = () => { if (!busy) clearPath(); };
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
  <p>墨水條用完就不能再畫。標「近身」的招式神魔會自己跑過去打，其他招式站在原地放出去。</p>
  <p><b>天賦</b>：線穿過隊友，會發動那位隊友的天賦。<b>紅線交會</b>：同一回合隊友畫過的線會留在地上（淡淡的虛線，換回合就清掉），你的線跟它交叉，交叉點會炸開，附近敵人各受 6 傷害，也會發動那條線主人的天賦。有些招式還有<b>交會加成</b>（寫在招式說明裡），每交會一處效果再加一份，一招最多算 3 處。</p>
  <p>神魔出招時會沿著你畫的線跑過去，最後停在線的終點，所以畫線也是在決定下一輪站哪裡。三位神魔各出一招之後，敵人才一起行動，會走到目標面前打。敵人頭上寫著這一輪要打誰、打多少，可以先凍住、先打死，或用護盾擋。</p>
  ${heroes.map((u) => { const H = HEROES[u.id]; return H.skills.map((s) => `<p><b>${H.name}・${s.name}</b>（${SHAPES[s.shape]}${s.melee ? '・近身' : ''}${s.cd ? `，冷卻 ${s.cd} 輪` : ''}）：${s.desc}</p>`).join('') + `<p><b>${H.name}・被動・${H.passive.n}</b>：${H.passive.d}</p><p><b>${H.name}・天賦・${H.talent.n}</b>：${H.talent.d}</p>`; }).join('')}
  <p><b>精英、魔王</b>的特性寫在每層開場，也可以點他們看。典獄長的鎖鏈（灰色粗線）會剪斷直線和自由線，畫圈不受影響。</p>
  <p><b>裝備</b>：每位神魔有兵器、法寶兩格。神族只能用神器，魔族只能用邪物，專屬兵器只有本人能用。精英層打完可以從三件裡選一件，魔王層有機會掉專屬兵器（試玩版第 1 層也會掉一件）。裝備會改變線的畫法，名字上面的小方塊就是身上的裝備。</p>
  ${Object.values(GEAR).map((it) => `<p><b>${it.n}</b>（${it.kind}・${SLOT[it.slot]}${it.own ? `・${HEROES[it.own].name}專屬` : ''}）：${it.d}</p>`).join('')}`;
}
window.__s = () => ({ run, heroes, foes, hits, path, chains, who, skillIdx, busy });
requestAnimationFrame(render);
return { HEROES, FOES, GEAR, SLOT, SIDE, ALL_IDS, start, stop, canUse, gearBox, gearOffer, showBox, hideBox, artImg: (id, h) => artImg(id, h) };
})();
