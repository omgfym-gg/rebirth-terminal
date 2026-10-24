// 遊戲主流程：存檔、靈界（結算終端）、轉生櫃台、一世十層的一筆紅線、結算
'use strict';

// 第一版（格子戰鬥）的存檔格式不同，整合後開新存檔，舊的不轉
const SAVE_KEY = 'rebirth-terminal-save-v2';
const OLD_SAVE_KEY = 'rebirth-terminal-save-v1';

const $ = (sel) => document.querySelector(sel);
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);
const { HEROES, GEAR } = Redline;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// 終端越來越不對勁：轉生次數越多，越多字會閃爍、錯位（字本身不換掉，還是讀得懂）
function corrupt(text, level) {
  if (level <= 0) return text;
  const p = Math.min(0.15, level * 0.02);
  const out = document.createElement('span');
  for (const ch of text) {
    if (ch.trim() && Math.random() < p) out.append(el('span', { class: 'glitch', style: `animation-delay:-${randInt(0, 2000)}ms` }, ch));
    else out.append(ch);
  }
  return out;
}

const SHOP = [
  { id: 'hp',  name: '生命強化', desc: '所有神魔生命上限 +3',   cost: 6,  max: 5 },
  { id: 'dmg', name: '朱砂',     desc: '所有招式每一下傷害 +1', cost: 10, max: 3 },
  { id: 'ink', name: '墨水強化', desc: '所有招式的墨水 +10%',   cost: 12, max: 2 },
];

// 每位神魔各自的等級，永久保留、死了也不掉。升一級生命 +4（之後再加解鎖新招、被動二選一）
const LV_MAX = 30;
const needExp = (lv) => 20 + 10 * (lv - 1);
const TAGS = { now: '今世', shadow: '前世之影', crew: '派遣同事' };

const Game = {
  save: null,

  // ───────── 存檔 ─────────

  newSave() {
    const truths = Object.keys(TRUTHS);
    return {
      version: 2,
      truth: truths[randInt(0, truths.length - 1)],
      truthRevealed: false,
      nature: 0, debt: 0, fragments: 0,
      perm: { hp: 0, dmg: 0, ink: 0 },
      boons: { soulExtra: 0, parcel: false },
      history: [],
      lv: {},          // 神魔等級 { id: { lv, exp } }
      vault: [],       // 這一世拿到的裝備（轉生時清空）
      eq: {},          // 誰身上穿什麼 { id: { weapon, charm } }
      regulars: { zhang: { act: 0, choices: [] }, kai: { act: 0, choices: [] } },
      life: null,
      ended: false,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.save = JSON.parse(raw);
    } catch (e) { this.save = null; }
  },

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* 無痕模式之類的情況，不存也能玩 */ }
  },

  get lifeNo() { return this.save.history.length + 1; },
  get glitch() { return this.save.history.length; },

  lvOf(id) { return this.save.lv[id] || { lv: 1, exp: 0 }; },
  maxHpFor(id, lv, mul = 1) {
    const s = this.save, L = s.life;
    return Math.round((HEROES[id].hp + 4 * (lv - 1) + s.perm.hp * 3 + ((L && L.bonusHp) || 0)) * mul);
  },
  // 加經驗，回傳升了幾級
  addExp(id, n) {
    const s = this.save, v = s.lv[id] = s.lv[id] || { lv: 1, exp: 0 };
    let ups = 0;
    v.exp += n;
    while (v.lv < LV_MAX && v.exp >= needExp(v.lv)) { v.exp -= needExp(v.lv); v.lv++; ups++; }
    if (v.lv >= LV_MAX) v.exp = 0;
    return ups;
  },
  eqOf(id) { return Object.values(this.save.eq[id] || {}).filter((g) => GEAR[g]); },

  // ───────── 畫面切換 ─────────

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    window.scrollTo(0, 0);
  },

  start() {
    this.load();
    // 離開：自動存檔，回來時這一層重打
    $('#battle .leave').onclick = () => { Redline.stop(); this.showTitle(); };
    this.showTitle();
  },

  showTitle() {
    const box = $('#title .menu');
    box.innerHTML = '';
    const hasSave = this.save && !this.save.ended;
    if (hasSave) {
      box.append(el('button', { class: 'btn primary', onclick: () => this.resume() }, `繼續（第 ${this.lifeNo} 世）`));
    }
    box.append(el('button', { class: 'btn' + (hasSave ? '' : ' primary'), onclick: () => this.confirmNew(hasSave) }, '新的靈魂'));
    box.append(el('button', { class: 'btn', onclick: () => {
      Tutorial.reset();
      try { localStorage.removeItem('rebirth-redline-tut-v1'); } catch (e) { /* 存不了就算了 */ }
      box.append(el('p', { class: 'muted small-note' }, '新手教學已重置，走到每個畫面時會再出現一次說明。'));
    } }, '重看新手教學'));
    let old = false;
    try { old = !hasSave && !!localStorage.getItem(OLD_SAVE_KEY); } catch (e) { /* 讀不到就當沒有 */ }
    if (old) box.append(el('p', { class: 'muted small-note' }, '戰鬥改成一筆紅線了，舊版的存檔沒辦法接著玩，請開一個新的靈魂。'));
    drawTerminalBanner($('#title canvas'), 0);
    this.show('title');
  },

  confirmNew(hasSave) {
    // 不用瀏覽器的 confirm（有些地方會直接當成取消）
    if (hasSave) return this.story(['開始新的靈魂會覆蓋目前的存檔，確定嗎？'], null, { speaker: '終端', choices: [
      { label: '確定，開新的靈魂', cls: 'danger', action: () => this.confirmNew(false) },
      { label: '取消', action: () => this.showTitle() },
    ] });
    this.save = this.newSave();
    this.persist();
    this.story([
      '你的生命體徵已歸零。',
      '歡迎來到「靈魂結算終端」。',
      '人間的祈禱與詛咒堆積如山，神界與魔界都缺人手。',
      '你被分配為「轉生外包職員」。',
      '每一世你會成為一位神魔，爬一座十層的塔。你死過的每一世，都會變成「前世之影」陪你上場。',
      '請選擇升仙、入魔，或者繼續為人。祝你這一世工作順利。',
    ], () => this.showRebirth(), { speaker: '終端廣播', sprite: null });
  },

  resume() {
    const s = this.save;
    if (s.life && s.life.alive) this.fight();
    else this.showTerminal();
  },

  // ───────── 對話／劇情畫面 ─────────

  // lines：一行一行顯示；choices：最後出現的選項
  story(lines, done, { speaker = '', sprite = null, choices = null, glitch = 0 } = {}) {
    const box = $('#story');
    const textBox = box.querySelector('.story-text');
    const btns = box.querySelector('.story-buttons');
    const portrait = box.querySelector('canvas');
    box.querySelector('.speaker').textContent = speaker;
    portrait.style.display = sprite ? 'block' : 'none';
    if (sprite) drawPortrait(portrait, sprite, 7);
    textBox.innerHTML = '';
    btns.innerHTML = '';
    this.show('story');
    let i = 0;
    const next = () => {
      if (i < lines.length) {
        textBox.append(el('p', { class: 'line' }, corrupt(lines[i], glitch)));
        textBox.scrollTop = textBox.scrollHeight;
        i++;
      }
      btns.innerHTML = '';
      if (i < lines.length) {
        btns.append(el('button', { class: 'btn', onclick: next }, '▼'));
      } else if (choices) {
        for (const c of choices) btns.append(el('button', { class: 'btn' + (c.cls ? ' ' + c.cls : ''), onclick: () => c.action() }, c.label));
      } else {
        btns.append(el('button', { class: 'btn primary', onclick: done }, '繼續'));
      }
    };
    next();
  },

  // ───────── 轉生櫃台 ─────────

  // 前世之影：死過的每一世都能帶上場，停在死前的等級、空手上場（同一位神魔只算最近那一世）
  shadowOptions(except) {
    const seen = new Set(), out = [];
    for (const h of [...this.save.history].reverse()) {
      if (!HEROES[h.hero] || h.hero === except || seen.has(h.hero)) continue;
      seen.add(h.hero);
      out.push({ id: h.hero, level: h.level, gear: [], life: h.life });
    }
    return out;
  },

  showRebirth() {
    const s = this.save;
    const pick = { form: null, hero: null, shadows: [] };
    // 每一世只抽一次：每條路隨機三位神魔、派遣同事的順序，存進存檔，重新整理不會重抽
    if (!s.offer || s.offer.life !== this.lifeNo) {
      const draw = (side) => shuffle(Redline.ALL_IDS.filter((id) => !side || HEROES[id].faith === side)).slice(0, 3);
      s.offer = { life: this.lifeNo, paths: {}, crew: shuffle(Redline.ALL_IDS) };
      for (const id of PATH_ORDER) s.offer.paths[id] = draw(FORMS[id].side);
      this.persist();
    }
    const root = $('#rebirth .content');

    // 這一世的隊伍：今世＋兩位前世之影；前世不夠就由終端派遣同事補上
    const party = () => {
      if (!pick.hero) return [];
      const opts = this.shadowOptions(pick.hero);
      const shadows = opts.length <= 2 ? opts : pick.shadows.map((i) => opts[i]).filter(Boolean);
      const out = [{ id: pick.hero, tag: TAGS.now }, ...shadows.map((o) => ({ id: o.id, tag: TAGS.shadow, level: o.level, gear: [], life: o.life }))];
      if (opts.length <= 2) for (const id of s.offer.crew) { if (out.length >= 3) break; if (!out.some((p) => p.id === id)) out.push({ id, tag: TAGS.crew }); }
      return out;
    };

    const render = () => {
      root.innerHTML = '';
      root.append(el('h2', {}, `第 ${this.lifeNo} 世・轉生櫃台`));
      root.append(el('p', { class: 'muted' }, `靈魂本質：${natureLabel(s.nature)}（${s.nature}）　因果債：${s.debt}`));
      root.append(el('p', { class: 'muted small-note' }, '靈魂本質越偏混沌越難升仙，越偏秩序越難入魔。擔任神族會往秩序走，魔族會往混沌走。'));

      root.append(el('h3', {}, '① 升仙・入魔・為人'));
      const forms = el('div', { class: 'cards' });
      for (const id of PATH_ORDER) {
        const f = FORMS[id];
        const ok = f.allowed(s.nature);
        forms.append(el('button', { class: 'card' + (pick.form === id ? ' selected' : '') + (ok ? '' : ' locked'), onclick: () => {
          if (!ok) return;
          // 換路的時候，原本選的神魔如果不在這條路上就清掉
          if (pick.hero && !s.offer.paths[id].includes(pick.hero)) { pick.hero = null; pick.shadows = []; }
          pick.form = id; render();
        } },
          spriteImg(f.sprite),
          el('b', {}, f.path),
          el('small', {}, f.pathDesc),
          el('small', { class: 'muted' }, ok ? f.innate : f.lockText)));
      }
      root.append(forms);

      root.append(el('h3', {}, '② 今世的你'));
      if (!pick.form) root.append(el('p', { class: 'muted' }, '先選升仙、入魔或為人。'));
      else {
        root.append(el('p', { class: 'muted' }, '這一世櫃台隨機給你三位，請選擇一位。等級跟著每位神魔永久保留。'));
        const box = el('div', { class: 'cards two' });
        for (const id of s.offer.paths[pick.form]) {
          box.append(el('button', { class: 'card job' + (pick.hero === id ? ' selected' : ''), onclick: () => { pick.hero = id; pick.shadows = []; render(); } },
            ...heroCard(id, this.lvOf(id).lv)));
        }
        root.append(box);
      }

      const p = party();
      if (pick.hero) {
        root.append(el('h3', {}, '③ 隊友'));
        const opts = this.shadowOptions(pick.hero);
        if (opts.length > 2) {
          root.append(el('p', { class: 'muted' }, `從前世裡挑兩位，當「前世之影」陪你上場（已選 ${pick.shadows.length}/2）。他們停在死前的等級、穿著死前的裝備。`));
          const box = el('div', { class: 'cards two' });
          opts.forEach((o, i) => {
            const on = pick.shadows.includes(i);
            box.append(el('button', { class: 'card job' + (on ? ' selected' : ''), onclick: () => {
              if (on) pick.shadows = pick.shadows.filter((x) => x !== i); else if (pick.shadows.length < 2) pick.shadows.push(i);
              render();
            } }, ...shadowCard(o)));
          });
          root.append(box);
        } else {
          root.append(el('p', { class: 'muted' }, opts.length ? '你的前世都會以「前世之影」上場；人數不夠的，由終端派遣同事補上。' : '你還沒有前世。終端派了兩位同事來幫你。'));
          for (const m of p.slice(1)) root.append(el('div', { class: 'card job' }, ...(m.tag === TAGS.shadow ? shadowCard(m) : shadowCard({ id: m.id, level: this.lvOf(m.id).lv, gear: this.eqOf(m.id) }, TAGS.crew))));
        }
        root.append(el('p', { class: 'muted small-note' }, `出手順序：${p.map((m) => `${HEROES[m.id].name}（${m.tag}）`).join(' → ')}`));
      }

      const ready = pick.form && pick.hero && p.length === 3;
      root.append(el('button', { class: 'btn primary wide', disabled: ready ? null : 'disabled', onclick: () => this.beginLife(pick.form, p) }, '轉生，出發爬塔'));
      Tutorial.tip('rebirth');
    };
    render();
    this.show('rebirth');
  },

  beginLife(form, party) {
    const s = this.save;
    s.vault = []; s.eq = {}; // 每一世的裝備從零開始
    const hero = party[0].id;
    const lines = [];
    // 阿凱的包裹：今世的神魔先升一級
    if (s.boons.parcel) {
      s.boons.parcel = false;
      const v = s.lv[hero] = s.lv[hero] || { lv: 1, exp: 0 };
      if (v.lv < LV_MAX) { v.lv++; lines.push(`阿凱送來的包裹裡裝著一份經驗。${HEROES[hero].name}升到 Lv.${v.lv}。`); }
    }
    s.life = {
      form, hero, party, floor: 0, kills: 0, hp: {}, maxHp: {},
      up: { dmg: s.perm.dmg, ink: 1 + 0.1 * s.perm.ink },
      bonusHp: s.boons.soulExtra ? 6 : 0, alive: true,
    };
    if (s.boons.soulExtra) lines.push('張醫師縫的那一針還在。這一世全隊生命上限 +6。');
    s.boons.soulExtra = 0;
    for (const m of party) {
      const lv = m.tag === TAGS.shadow ? m.level : this.lvOf(m.id).lv;
      s.life.maxHp[m.id] = s.life.hp[m.id] = this.maxHpFor(m.id, lv, m.tag === TAGS.now ? FORMS[form].hpMul : 1);
    }
    this.persist();
    const H = HEROES[hero];
    this.story([
      form === 'angel' ? `你升仙成為神使，擔任${H.name}。` : form === 'demon' ? `你入魔成為惡魔，擔任${H.name}。` : `你轉生為人，信仰${H.name}。`,
      ORIGINS[hero] ? `${H.name}：${ORIGINS[hero][1]}` : `${H.name}・${H.role}`,
      ...party.slice(1).map((m) => m.tag === TAGS.shadow ? `第 ${m.life} 世的你，${HEROES[m.id].name}的影子，站到了你身後。` : `終端派來的同事${HEROES[m.id].name}朝你點點頭。`),
      ...lines,
      `眼前是一座十層的塔。第 5、10 層有魔王，第 3、6、9 層有精英。`,
    ], () => this.fight(), { speaker: '轉生櫃台', sprite: FORMS[form].sprite });
  },

  // ───────── 爬塔：一層一場一筆紅線 ─────────

  // 出戰的三位：都穿這一世拿到的裝備（前世之影也是空手來的）
  battleParty() {
    const L = this.save.life;
    return L.party.map((m) => ({ id: m.id, tag: m.tag, hp: L.hp[m.id], maxHp: L.maxHp[m.id], gear: this.eqOf(m.id), res: (L.res || {})[m.id] || 0 }));
  },

  floorFoes(f) {
    const kind = floorKind(f);
    // 越深層，一般敵人的種類越多
    const pool = ['zombie', 'wisp', 'shade', 'jinmenken', ...(f >= 2 ? ['mizuki', 'gaki'] : []), ...(f >= 4 ? ['husk', 'printer', 'diaoxigui', 'amanojaku'] : []), ...(f >= 7 ? ['mirror', 'jerseydevil'] : [])];
    const one = (a) => a[randInt(0, a.length - 1)];
    const some = (n) => Array.from({ length: n }, () => one(pool));
    if (kind === 'boss') return f >= 10 ? [one(['wardenX', 'dullahan', 'wendigo']), ...some(2)] : [one(['judge', 'guhuoniao']), 'wisp'];
    if (kind === 'elite') return [one(f === 3 ? ['warden', 'lintoujie', 'tengu'] : ['warden', 'hunter', 'lintoujie', 'tengu', 'mothman']), ...some(f === 3 ? 1 : 2)];
    return f === 1 ? ['zombie', 'wisp'] : some(f >= 7 ? 4 : 3);
  },

  fight() {
    const s = this.save, L = s.life;
    const f = L.floor + 1, kind = floorKind(f);
    // 中途離開再回來：同一層重打，敵人重抽
    const foes = this.floorFoes(f);
    this.show('battle');
    Redline.start({
      floor: f,
      title: `第 ${f} 層${kind === 'boss' ? '・魔王' : kind === 'elite' ? '・精英' : ''}`,
      note: `<p class="muted">第 ${this.lifeNo} 世・一世共 ${LIFE_FLOORS} 層</p>`,
      foes, scale: 1 + 0.12 * (f - 1) + 0.1 * (this.lifeNo - 1), up: L.up,
      party: this.battleParty(),
      gearButton: () => Redline.gearBox(this.gearStore(), () => this.fight(), '開始'),
      onEnd: (r) => this.afterFloor(f, r),
    });
  },

  gearStore() {
    const s = this.save, L = s.life;
    return { note: '這一世拿到的裝備，轉生時會清空。', bag: s.vault, eq: s.eq, heroes: L.party.map((m) => m.id), anyKind: (hid) => L.form === 'human' && hid === L.hero, save: () => this.persist() };
  },

  afterFloor(f, r) {
    const s = this.save, L = s.life;
    L.kills += r.kills;
    if (!r.win) {
      for (const id in L.hp) L.hp[id] = 0;
      return this.die('faded', `第 ${f} 層`);
    }
    Object.assign(L.hp, r.hp);
    // 元寶、飽足這類資源一整世累積，到下一層還在
    L.res = Object.assign(L.res || {}, r.res);
    L.floor = f;
    const lines = [`第 ${f} 層　突破！（擊倒 ${r.kills}、經驗 ${r.exp}）`];
    // 經驗給今世和派遣同事；前世之影停在死前的等級
    for (const m of L.party) {
      if (m.tag === TAGS.shadow) continue;
      const ups = this.addExp(m.id, r.exp);
      if (!ups) continue;
      L.maxHp[m.id] += 4 * ups; L.hp[m.id] += 4 * ups;
      lines.push(`${HEROES[m.id].name}升到 Lv.${this.lvOf(m.id).lv}（生命上限 +${4 * ups}）。`);
    }
    this.persist();
    const kind = floorKind(f);
    const next = () => {
      Redline.hideBox();
      if (f >= LIFE_FLOORS) return this.story([...lines, '典獄長本尊的鎖鏈一條一條斷掉。塔頂的門開了。'], () => this.victory(), { speaker: '塔' });
      // 下一層之前的岔路：隨機兩條選一條
      const two = shuffle(Object.keys(EVENTS)).slice(0, 2);
      lines.push('往上的樓梯分成了兩條路。');
      this.story(lines, null, { speaker: '塔', choices: two.map((k) => ({ label: `${EVENTS[k].name}：${EVENTS[k].desc}`, action: () => this.runEvent(k) })) });
    };
    if (kind === 'normal') return next();
    this.drop(kind, next);
  },

  // 精英、魔王掉裝備：三選一。只掉今世穿得了的（神族掉神器、魔族掉邪物，為人兩種都掉）；魔王優先掉今世的專屬兵器
  drop(kind, next) {
    const s = this.save, L = s.life;
    const general = shuffle(Object.keys(GEAR).filter((id) => !GEAR[id].own && !s.vault.includes(id) && Redline.canUse(L.hero, id, L.form === 'human')));
    const own = ['ex_' + L.hero].filter((id) => GEAR[id] && !s.vault.includes(id));
    const ids = (kind === 'boss' ? [...own.slice(0, 2), ...general] : general).slice(0, 3);
    if (!ids.length) {
      s.fragments += 5; this.persist();
      Redline.showBox('<h2>戰利品</h2><p>能拿的都拿過了。殘骸換成 5 個靈魂碎片。</p><button class="btn primary wide ok">繼續</button>');
      $('.box .ok').onclick = next;
      return;
    }
    Redline.gearOffer(this.gearStore(), ids, kind === 'boss' ? '魔王掉落' : '精英掉落', next);
  },

  runEvent(kind) {
    const s = this.save, L = s.life;
    const ids = L.party.map((m) => m.id);
    const each = (fn) => { for (const id of ids) L.hp[id] = Math.max(0, Math.min(L.maxHp[id], Math.round(fn(L.hp[id], L.maxHp[id])))); };
    const go = (lines) => { this.persist(); this.story(lines, () => this.fight(), { speaker: EVENTS[kind].name }); };
    if (kind === 'rest') { each((hp, max) => hp + max * 0.4); return go(['火光很暖。全隊回復了四成生命。']); }
    if (kind === 'spring') {
      for (const id of ids) L.maxHp[id] += 5;
      each((hp, max) => hp + 5 + max * 0.2);
      return go(['泉水裡映出你好幾世的臉。', '全隊回復兩成生命，這一世生命上限 +5。']);
    }
    if (kind === 'altar') {
      each((hp) => Math.max(1, hp - Math.max(1, Math.floor(hp / 4))));
      L.up.dmg += 2;
      return go(['大家都割開了手掌，失去四分之一的生命。', '祭壇上的眼睛睜開了一下。這一世每一下傷害 +2。']);
    }
    if (kind === 'chest') {
      if (Math.random() < 0.6) {
        s.fragments += 3; each((hp, max) => hp + max * 0.3);
        return go(['箱子裡有一瓶藥和幾片發光的碎片。', '全隊回復三成生命，靈魂碎片 +3。']);
      }
      each((hp, max) => Math.max(1, hp - Math.ceil(max * 0.2)));
      return go(['箱子張開嘴，咬了每個人一口。', '全隊失去兩成生命。']);
    }
    if (kind === 'lost') {
      return this.story(['一個透明的上班族一直在找出口。', '「請問……打卡機在哪裡？我今天好像還沒下班。」'], null, {
        speaker: EVENTS.lost.name,
        choices: [
          { label: '幫忙：帶他到樓梯口', action: () => { s.nature = clampNature(s.nature - 5); s.fragments += 3; go(['他說謝謝，然後慢慢消失在樓梯上。', '（靈魂碎片 +3，靈魂偏向秩序）']); } },
          { label: '保留：繞過他', action: () => go(['你繞了過去。身後一直傳來找東西的聲音。']) },
          { label: '利用：把他吸收掉', cls: 'danger', action: () => { s.debt += 1; s.nature = clampNature(s.nature + 5); each((hp, max) => max); go(['他還來不及喊，就變成了你們的一部分。', '（全隊生命全滿，因果債 +1）']); } },
        ],
      });
    }
  },

  victory() {
    this.story([
      '你從塔頂走出來的時候，人間已經過了好多年。',
      '你在那裡老去，安靜地壽終正寢。',
      '然後，熟悉的日光燈又亮了起來。',
      '「歡迎回來。」',
    ], () => this.die('victory', null), { speaker: '人間' });
  },

  // ───────── 死亡與結算 ─────────

  die(outcome, cause) {
    const s = this.save, L = s.life;
    const H = HEROES[L.hero], lv = this.lvOf(L.hero).lv;
    const record = {
      life: this.lifeNo, form: L.form, hero: L.hero, level: lv, gear: this.eqOf(L.hero),
      party: L.party.map((m) => m.id), floor: L.floor, kills: L.kills, outcome, cause,
    };
    s.history.push(record);
    L.alive = false;
    // 裝備不帶到下一世，前世之影也是空手上場
    s.vault = []; s.eq = {};

    let frag = L.floor * 3 + L.kills;
    if (outcome === 'victory') frag += 15;
    s.fragments += frag;
    // 靈魂本質跟著這一世站在哪一邊走：神族往秩序、魔族往混沌
    s.nature = clampNature(s.nature + (H.faith === '神' ? -5 : 5));
    this.persist();

    const n = record.life;
    const lines = [
      `第 ${n} 世・因果紀錄`,
      `形態：${FORMS[L.form].name}　今世：${H.name} Lv.${lv}`,
      `爬到：第 ${L.floor} 層（共 ${LIFE_FLOORS} 層）　擊倒：${L.kills}`,
      cause ? `倒在：${cause}` : '死因：天年已盡',
      outcome === 'victory' ? '你壽終正寢。' : '全隊倒下，你的靈魂被吸回了終端。',
      `獲得靈魂碎片 ${frag}。`,
      `${H.name}會以「前世之影」的身分，在之後的轉生陪著你。`,
    ];
    this.story(lines, () => this.afterDeath(), { speaker: '靈魂結算終端', glitch: this.glitch - 1 });
  },

  afterDeath() {
    const s = this.save;
    const steps = [];
    const reg = this.nextRegular();
    if (reg) steps.push((next) => this.regularScene(reg, next));
    if (s.history.length >= 6 && !s.truthRevealed) steps.push((next) => this.revealTruth(next));
    const run = () => { const f = steps.shift(); if (f) f(run); else this.showTerminal(); };
    run();
  },

  nextRegular() {
    const s = this.save;
    // 輪流遇到張醫師、阿凱
    const order = REGULAR_ORDER;
    for (let i = 0; i < order.length; i++) {
      const id = order[(s.history.length - 1 + i) % order.length];
      if (s.regulars[id].act < REGULARS[id].acts.length) return id;
    }
    return null;
  },

  regularScene(id, next) {
    const s = this.save, R = REGULARS[id], st = s.regulars[id];
    const act = R.acts[st.act];
    const choose = (kind) => {
      const c = act.choices[kind];
      const e = c.effect;
      if (e.frag) s.fragments += e.frag;
      if (e.debt) s.debt += e.debt;
      if (e.nature) s.nature = clampNature(s.nature + e.nature);
      if (e.boon === 'soulExtra') s.boons.soulExtra = 1;
      if (e.boon === 'parcel') s.boons.parcel = true;
      st.choices.push(kind);
      st.act++;
      this.persist();
      const tail = [];
      if (e.boon === 'soulExtra') tail.push('（下一世全隊生命上限 +6。）');
      if (e.boon === 'parcel') tail.push('（下一世今世的神魔先升 1 級。）');
      if (e.frag) tail.push(`（靈魂碎片 +${e.frag}）`);
      if (e.debt) tail.push(`（因果債 +${e.debt}）`);
      this.story([c.result, ...tail], next, { speaker: R.name, sprite: R.sprite, glitch: this.glitch });
    };
    this.story([`── ${R.place} ──`, ...act.lines], null, {
      speaker: `${R.name}・第 ${st.act + 1} 幕`, sprite: R.sprite, glitch: this.glitch - 1,
      choices: [
        { label: '幫忙：' + act.choices.help.label, action: () => choose('help') },
        { label: '保留：' + act.choices.hold.label, action: () => choose('hold') },
        { label: '利用：' + act.choices.use.label, cls: 'danger', action: () => choose('use') },
      ],
    });
  },

  revealTruth(next) {
    const s = this.save, T = TRUTHS[s.truth];
    s.truthRevealed = true;
    this.persist();
    const lines = ['終端的燈全部熄滅了。', '黑暗裡，一行字慢慢浮現：', `【隱藏真相 ${s.truth}・${T.title}】`, ...T.text];
    const choices = [{ label: '繼續轉生', action: next }];
    if (s.truth === 'E') choices.unshift({ label: '醒來', cls: 'danger', action: () => this.ending('你睜開眼睛。病房的燈很亮，有人在哭，也有人在笑。終端再也沒有亮起來過。') });
    if (s.truth === 'A') choices.unshift({ label: '解約，放棄所有記憶', cls: 'danger', action: () => this.ending('你簽了名。所有的前世像被橡皮擦擦掉一樣消失。你終於可以下班了。') });
    if (s.truth === 'F') choices.unshift({ label: '和死對頭一起逃走', cls: 'danger', action: () => this.ending('你們一起推開終端最深處那扇寫著「員工通道」的門。門後是一片很普通的早晨。') });
    this.story(lines, null, { speaker: '???', glitch: 0, choices });
  },

  ending(text) {
    this.save.ended = true;
    this.persist();
    this.story([text, `你一共活了 ${this.save.history.length} 世。`, '── 第一版到這裡結束，謝謝你玩到最後 ──'], () => this.showTitle(), { speaker: '結局' });
  },

  // ───────── 靈界大廳 ─────────

  showTerminal() {
    const s = this.save;
    drawTerminalBanner($('#terminal canvas'), this.glitch);
    const root = $('#terminal .content');
    root.innerHTML = '';
    root.append(el('h2', {}, corrupt('靈魂結算終端・大廳', this.glitch - 2)));
    root.append(el('div', { class: 'stats' },
      el('div', {}, `已經歷：${s.history.length} 世`),
      el('div', {}, `靈魂碎片：${s.fragments}`),
      el('div', {}, `靈魂本質：${natureLabel(s.nature)}（${s.nature}）`),
      el('div', {}, `因果債：${s.debt}`)));

    root.append(el('h3', {}, '靈魂商店'));
    for (const item of SHOP) {
      const owned = s.perm[item.id];
      const can = owned < item.max && s.fragments >= item.cost;
      root.append(el('div', { class: 'shop-row' },
        el('div', {}, el('b', {}, `${item.name}（${owned}/${item.max}）`), el('div', { class: 'muted' }, item.desc)),
        el('button', { class: 'btn small', disabled: can ? null : 'disabled', onclick: () => { s.fragments -= item.cost; s.perm[item.id]++; this.persist(); this.showTerminal(); } },
          owned >= item.max ? '已滿' : `${item.cost} 碎片`)));
    }

    const met = Object.keys(s.lv).filter((id) => HEROES[id]);
    if (met.length) {
      root.append(el('h3', {}, '神魔等級'));
      root.append(el('div', { class: 'history' }, ...met.map((id) => { const v = this.lvOf(id); return el('div', {}, `${HEROES[id].name}　Lv.${v.lv}${v.lv < LV_MAX ? `（經驗 ${v.exp}/${needExp(v.lv)}）` : ''}`); })));
    }

    root.append(el('h3', {}, '前世'));
    const list = el('div', { class: 'history' });
    if (!s.history.length) list.append(el('div', { class: 'muted' }, '還沒有。'));
    for (const h of [...s.history].reverse()) {
      list.append(el('div', {}, corrupt(`第 ${h.life} 世：${FORMS[h.form].name}・${HEROES[h.hero] ? HEROES[h.hero].name : '？'} Lv.${h.level}・第 ${h.floor} 層・${outcomeLabel(h.outcome)}`, this.glitch - 3)));
    }
    root.append(list);
    root.append(el('button', { class: 'btn primary wide', onclick: () => this.showRebirth() }, '前往轉生櫃台'));
    if (s.history.length) Tutorial.tip('terminal');
    root.append(el('button', { class: 'btn wide', onclick: () => this.showTitle() }, '回標題（自動存檔）'));
    this.show('terminal');
  },
};

function clampNature(n) { return Math.max(-100, Math.min(100, n)); }
function natureLabel(n) { return n <= -30 ? '秩序' : n >= 30 ? '混沌' : n < 0 ? '偏秩序' : n > 0 ? '偏混沌' : '中立'; }
function outcomeLabel(o) { return { faded: '全隊倒下', victory: '壽終正寢' }[o] || o; }

const SHAPE_NAMES = { line: '直線', dash: '衝刺', free: '自由線', zigzag: '折線', circle: '畫圈', tap: '連點' };
// 轉生櫃台的神魔卡片：出處、被動、天賦、三招的畫法
function heroCard(id, lv, tag) {
  const H = HEROES[id];
  return [
    Redline.artImg(id, 64),
    el('b', { style: `color:${H.color}` }, `${H.name}　Lv.${lv}${tag ? `（${tag}）` : ''}`),
    el('small', { class: 'muted' }, `${H.faith}族・${H.role}・生命 ${H.hp}`),
    ORIGINS[id] ? el('small', { class: 'origin' }, el('span', { class: 'tag origin' }, ORIGINS[id][0]), ORIGINS[id][1]) : null,
    el('small', {}, el('span', { class: 'tag' }, '被動'), `「${H.passive.n}」${H.passive.d}`),
    el('small', {}, el('span', { class: 'tag' }, '天賦'), `「${H.talent.n}」${H.talent.d}`),
    ...H.skills.map((sk, i) => el('small', {}, el('span', { class: 'tag' + (i === 2 ? ' ult' : '') }, SHAPE_NAMES[sk.shape]), `「${sk.name}」`, el('span', { html: sk.desc }))),
  ];
}
// 隊友的小卡片（前世之影、派遣同事）
function shadowCard(o, crew) {
  const H = HEROES[o.id];
  const gear = (o.gear || []).filter((g) => GEAR[g]).map((g) => GEAR[g].n);
  return [
    Redline.artImg(o.id, 56),
    el('b', { style: `color:${H.color}` }, `${H.name}　Lv.${o.level}${crew ? '' : `（第 ${o.life} 世的你）`}`),
    el('small', { class: 'muted' }, `${crew || '前世之影'}・${H.faith}族・${H.role}`),
    el('small', {}, `招式：${H.skills.map((k) => `${k.name}（${SHAPE_NAMES[k.shape]}）`).join('、')}`),
    el('small', {}, `天賦「${H.talent.n}」：${H.talent.d}`),
    el('small', { class: 'muted' }, gear.length ? `裝備：${gear.join('、')}` : '沒有裝備'),
  ];
}

function spriteImg(name) {
  const c = document.createElement('canvas');
  c.className = 'sprite';
  drawPortrait(c, name, 3);
  return c;
}

// ───────── 標題與靈界的小插圖 ─────────

function drawTerminalBanner(canvas, glitch) {
  const W = 120, H = 60, S = 4;
  canvas.width = W * S; canvas.height = H * S;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * S, y * S, w * S, h * S); };
  px(0, 0, W, H, '#07060c');
  for (let i = 0; i < 40; i++) px(randInt(0, W), randInt(0, 30), 1, 1, '#3a3550');
  // 大樓
  px(38, 6, 44, 54, '#15131f');
  px(37, 5, 46, 1, '#2a2638');
  for (let y = 9; y < 56; y += 5) for (let x = 41; x < 80; x += 6) {
    const lit = Math.random() < 0.75;
    px(x, y, 4, 3, lit ? (Math.random() < 0.08 * (glitch + 1) ? '#c04040' : '#d8e4a0') : '#221f2e');
  }
  px(56, 50, 8, 10, '#2a2638');
  px(57, 51, 6, 9, '#a0d8ff');
  // 亂碼掃描線
  for (let i = 0; i < glitch * 2; i++) px(0, randInt(0, H), W, 1, 'rgba(255,60,60,0.25)');
}

window.addEventListener('DOMContentLoaded', () => Game.start());
