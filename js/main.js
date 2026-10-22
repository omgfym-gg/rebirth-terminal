// 遊戲主流程：存檔、靈界（結算終端）、轉生、城鎮、地城
'use strict';

const SAVE_KEY = 'rebirth-terminal-save-v1';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// 終端越來越不對勁：轉生次數越多，文字越容易出現亂碼
function corrupt(text, level) {
  if (level <= 0) return text;
  const glyphs = '█▓▒░#?¿■□';
  const p = Math.min(0.18, level * 0.025);
  return [...text].map((ch) => (ch.trim() && Math.random() < p ? glyphs[randInt(0, glyphs.length - 1)] : ch)).join('');
}

const SHOP = [
  { id: 'hp',   name: '生命強化', desc: '之後每一世最大生命 +3', cost: 6,  max: 5 },
  { id: 'atk',  name: '力量強化', desc: '之後每一世攻擊 +1',     cost: 10, max: 3 },
  { id: 'soul', name: '靈魂韌性', desc: '變成靈魂時多撐 1 回合', cost: 12, max: 1 },
];

const Game = {
  save: null,
  battle: null,

  // ───────── 存檔 ─────────

  newSave() {
    const truths = Object.keys(TRUTHS);
    return {
      version: 1,
      truth: truths[randInt(0, truths.length - 1)],
      truthRevealed: false,
      nature: 0, debt: 0, fragments: 0,
      perm: { hp: 0, atk: 0, soul: 0 },
      boons: { soulExtra: 0, parcel: false },
      history: [],
      echoes: [],
      vault: [],
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

  // ───────── 畫面切換 ─────────

  show(id) {
    if (this.battle && id !== 'battle') { this.battle.destroy(); this.battle = null; }
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    window.scrollTo(0, 0);
  },

  start() {
    this.load();
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
    drawTerminalBanner($('#title canvas'), 0);
    this.show('title');
  },

  confirmNew(hasSave) {
    if (hasSave && !confirm('開始新的靈魂會覆蓋目前的存檔，確定嗎？')) return;
    this.save = this.newSave();
    this.persist();
    this.story([
      '你的生命體徵已歸零。',
      '歡迎來到「靈魂結算終端」。',
      '人間的祈禱與詛咒堆積如山，神界與魔界都缺人手。',
      '你被分配為「轉生外包職員」。',
      '請選擇你的第一個生命形態與信仰。祝你這一世工作順利。',
    ], () => this.showRebirth(), { speaker: '終端廣播', sprite: null });
  },

  resume() {
    const s = this.save;
    if (s.life && s.life.alive) this.showTown();
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

  // ───────── 轉生 ─────────

  showRebirth() {
    const s = this.save;
    const prev = s.history[s.history.length - 1];
    const pick = { form: null, faith: null, inherit: null, relic: null };
    const root = $('#rebirth .content');

    const render = () => {
      root.innerHTML = '';
      root.append(el('h2', {}, `第 ${this.lifeNo} 世・轉生櫃台`));
      root.append(el('p', { class: 'muted' }, `靈魂本質：${natureLabel(s.nature)}（${s.nature}）　因果債：${s.debt}`));

      root.append(el('h3', {}, '生命形態'));
      const forms = el('div', { class: 'cards' });
      for (const [id, f] of Object.entries(FORMS)) {
        const ok = f.allowed(s.nature);
        const c = el('button', { class: 'card' + (pick.form === id ? ' selected' : '') + (ok ? '' : ' locked'), onclick: () => { if (ok) { pick.form = id; pick.inherit = null; render(); } } },
          spriteImg(f.sprite),
          el('b', {}, f.name),
          el('small', {}, ok ? `生命 ${f.hp}　攻擊 ${f.atk}` : f.lockText),
          ok ? el('small', {}, `防禦 ${f.def}　速度 ${f.spd}`) : null,
          el('small', { class: 'muted' }, f.innate));
        forms.append(c);
      }
      root.append(forms);

      root.append(el('h3', {}, '信仰'));
      const faiths = el('div', { class: 'cards two' });
      for (const [id, f] of Object.entries(FAITHS)) {
        faiths.append(el('button', { class: 'card' + (pick.faith === id ? ' selected' : ''), onclick: () => { pick.faith = id; render(); } },
          el('b', {}, `${f.name}（${f.side}）`),
          el('small', {}, f.domain + '：' + f.passive),
          el('small', { class: 'muted' }, '大招「' + f.ult.name + '」：' + f.ult.desc)));
      }
      root.append(faiths);

      const options = pick.form ? this.inheritOptions(pick.form) : [];
      if (prev) {
        root.append(el('h3', {}, '繼承一個前世技能'));
        if (!pick.form) root.append(el('p', { class: 'muted' }, '先選生命形態，才知道技能會怎麼變異。'));
        else if (!options.length) root.append(el('p', { class: 'muted' }, '沒有可以繼承的技能。'));
        else {
          const box = el('div', { class: 'cards two' });
          for (const id of options) {
            const sk = mutateSkill(id, pick.form);
            box.append(el('button', { class: 'card' + (pick.inherit === id ? ' selected' : ''), onclick: () => { pick.inherit = id; render(); } },
              el('b', {}, sk.name), el('small', {}, sk.desc), el('small', { class: 'muted' }, MUTATION[pick.form].note)));
          }
          root.append(box);
        }
      }

      const vault = s.vault || [];
      if (vault.length) {
        root.append(el('h3', {}, '喚醒一件神器（靈魂倉庫）'));
        const box = el('div', { class: 'cards two' });
        box.append(el('button', { class: 'card' + (!pick.relic ? ' selected' : ''), onclick: () => { pick.relic = null; render(); } }, el('b', {}, '不帶'), el('small', { class: 'muted' }, '讓神器繼續沉睡')));
        for (const id of vault) {
          box.append(el('button', { class: 'card' + (pick.relic === id ? ' selected' : ''), onclick: () => { pick.relic = id; render(); } },
            el('b', {}, RELICS[id].name), el('small', {}, RELICS[id].desc)));
        }
        root.append(box);
      }

      const ready = pick.form && pick.faith && (!prev || !options.length || pick.inherit);
      root.append(el('button', { class: 'btn primary wide', disabled: ready ? null : 'disabled', onclick: () => this.beginLife(pick) }, '轉生'));
    };
    render();
    this.show('rebirth');
  },

  inheritOptions(form) {
    const s = this.save;
    const own = new Set(FORMS[form].skills);
    const lives = form === 'human' ? s.history : s.history.slice(-1);
    const ids = new Set();
    for (const h of lives) for (const id of h.skills || []) if (!own.has(id)) ids.add(id);
    return [...ids];
  },

  beginLife(pick) {
    const s = this.save;
    s.life = {
      form: pick.form, faith: pick.faith, inherit: pick.inherit, relic: pick.relic || null,
      level: s.boons.parcel ? 2 : 1, exp: 0, hp: null,
      floor: 0, kills: 0, rescued: 0, alive: true, companionAlive: true,
    };
    if (s.boons.parcel) s.boons.parcel = false;
    s.life.hp = this.heroStats().maxHp;
    this.persist();
    const f = FORMS[pick.form];
    this.story([
      `你轉生成了${f.name}，信仰${FAITHS[pick.faith].name}。`,
      pick.inherit ? `前世的「${SKILLS[pick.inherit].name}」在你身上變成了「${mutateSkill(pick.inherit, pick.form).name}」。` : '這是你的第一世。什麼都還沒有。',
      '一隻黑色的小狗從終端的門縫鑽出來，跟在你腳邊。牠是引魂犬。',
    ], () => this.showTown(), { speaker: '轉生櫃台', sprite: f.sprite });
  },

  heroStats() {
    const s = this.save, L = s.life, f = FORMS[L.form];
    const lv = L.level - 1;
    const r = RELICS[L.relic] || {};
    const statue = s.echoes.some((e) => e.type === 'statue') ? 1 : 0;
    const skills = [...f.skills];
    const skillDefs = {};
    for (const id of skills) skillDefs[id] = { ...SKILLS[id] };
    if (L.inherit) { skills.push(L.inherit); skillDefs[L.inherit] = mutateSkill(L.inherit, L.form); }
    return {
      sprite: f.sprite,
      maxHp: f.hp + s.perm.hp * 3 + lv * 4 + (r.hp || 0),
      hp: L.hp,
      atk: f.atk + s.perm.atk + lv + statue + (L.bonusAtk || 0) + (r.atk || 0),
      def: f.def + Math.floor(lv / 2) + (r.def || 0),
      spd: f.spd + (r.spd || 0), mov: f.mov + (r.mov || 0),
      skills, skillDefs,
      companionAlive: L.companionAlive,
    };
  },

  // ───────── 城鎮 ─────────

  showTown() {
    const s = this.save, L = s.life, st = this.heroStats();
    drawTownBanner($('#town canvas'));
    const root = $('#town .content');
    root.innerHTML = '';
    root.append(el('h2', {}, `第 ${this.lifeNo} 世・邊境城鎮`));
    root.append(el('div', { class: 'hero-card' },
      spriteImg(st.sprite),
      el('div', {},
        el('b', {}, `${FORMS[L.form].name}　Lv.${L.level}`),
        el('div', {}, `生命 ${L.hp}/${st.maxHp}　攻擊 ${st.atk}　防禦 ${st.def}`),
        el('div', { class: 'muted' }, `信仰：${FAITHS[L.faith].name}　技能：${st.skills.map((id) => st.skillDefs[id].name).join('、')}`),
        L.relic ? el('div', { class: 'muted' }, `神器：${RELICS[L.relic].name}（${RELICS[L.relic].desc}）`) : null)));

    root.append(el('h3', {}, '前世回響'));
    if (!s.echoes.length) root.append(el('p', { class: 'muted' }, '這座城鎮還不認識你的靈魂。'));
    for (const e of s.echoes) root.append(el('div', { class: 'echo ' + e.type }, el('b', {}, e.title), el('div', {}, e.text)));

    root.append(el('button', { class: 'btn primary wide', onclick: () => this.enterDungeon() }, '進入地城'));
    root.append(el('button', { class: 'btn wide', onclick: () => this.showTitle() }, '回標題（自動存檔）'));
    this.show('town');
  },

  // ───────── 地城 ─────────

  enterDungeon() {
    const L = this.save.life;
    // 每次進地城都重新抽場景和首領
    const themes = THEMES.map((t) => t.id).sort(() => Math.random() - 0.5).slice(0, DUNGEON_DEPTH - 1);
    L.run = { themes, boss: BOSSES[randInt(0, BOSSES.length - 1)].type };
    L.floor = 0;
    L.bonusAtk = 0;
    L.hp = this.heroStats().maxHp;
    L.companionAlive = true;
    this.persist();
    this.fight();
  },

  floorName(i, life = this.save.life) {
    if (!life || !life.run) return `地下 ${i + 1} 層`;
    if (i >= DUNGEON_DEPTH - 1) return `地下 ${i + 1} 層・${BOSSES.find((b) => b.type === life.run.boss).room}`;
    return `地下 ${i + 1} 層・${THEMES.find((t) => t.id === life.run.themes[i]).name}`;
  },

  async fight() {
    const s = this.save, L = s.life;
    if (!L.run) return this.enterDungeon();
    const isBoss = L.floor >= DUNGEON_DEPTH - 1;
    const spec = generateFloor(L.floor, L.run.themes[L.floor], isBoss ? L.run.boss : null, s.debt >= 4 && L.floor === 2);
    this.show('battle');
    $('#battle .floor-name').textContent = spec.name;
    $('#battle .log').innerHTML = '';
    const opts = {
      faith: L.faith, form: L.form,
      soulExtra: s.boons.soulExtra + s.perm.soul + ((RELICS[L.relic] || {}).soul || 0),
      startCharge: (RELICS[L.relic] || {}).charge || 0,
    };
    this.battle = new Battle($('#battle canvas'), BattleUI, spec, this.heroStats(), opts);
    const res = await this.battle.run();
    await sleep(700);
    if (!this.battle) return; // 戰鬥中離開了畫面
    L.kills += res.kills;
    L.rescued += this.battle.rescued || 0;
    L.companionAlive = res.companionAlive;
    if (res.result === 'win') {
      if (this.battle.units.some((u) => u.type === 'hunter' && u.gone)) {
        s.debt = Math.max(0, s.debt - 2);
        s.echoes = s.echoes.filter((e) => e.type !== 'bounty' || s.debt >= 4);
      }
      this.afterWin(res);
    } else {
      L.hp = 0;
      this.die(res.outcome, res.cause);
    }
  },

  afterWin(res) {
    const s = this.save, L = s.life;
    const lines = [`${this.floorName(L.floor)}　突破！`];
    L.exp += res.exp;
    let ups = 0;
    while (L.exp >= L.level * 20) { L.exp -= L.level * 20; L.level++; ups++; }
    if (ups) lines.push(`等級提升到 Lv.${L.level}。`);
    // 取回前世殘魂
    const remnant = s.echoes.find((e) => e.type === 'remnant' && e.floor === L.floor);
    if (remnant) {
      s.fragments += remnant.frag;
      s.echoes = s.echoes.filter((e) => e !== remnant);
      lines.push(`你在角落找到前世的殘魂。它把 ${remnant.frag} 個靈魂碎片交還給你，然後安心地散了。`);
    }
    L.hp = Math.max(res.hp, 1);
    if (L.floor >= DUNGEON_DEPTH - 1) {
      this.persist();
      lines.push(L.run.boss === 'horus'
        ? '荷魯斯之影散成一地黑沙。沙子裡有一張工牌，上面的照片是你。'
        : '典獄長的鎖鏈斷了。地城深處傳來一聲很長的嘆息。');
      return this.story(lines, () => this.bossLoot(), { speaker: '地城' });
    }
    L.floor++;
    this.persist();
    // 下樓之前的岔路：營火一定在，另外隨機兩個事件
    const others = Object.keys(EVENTS).filter((k) => k !== 'rest').sort(() => Math.random() - 0.5).slice(0, 2);
    lines.push('往下的樓梯分成了三條路。');
    this.story(lines, null, {
      speaker: '地城',
      choices: ['rest', ...others].map((k) => ({ label: `${EVENTS[k].name}：${EVENTS[k].desc}`, action: () => this.runEvent(k) })),
    });
  },

  runEvent(kind) {
    const L = this.save.life, maxHp = this.heroStats().maxHp;
    const heal = (ratio) => { const before = L.hp; L.hp = Math.min(maxHp, L.hp + Math.ceil(maxHp * ratio)); return L.hp - before; };
    const go = (lines) => { this.persist(); this.story(lines, () => this.fight(), { speaker: EVENTS[kind].name }); };
    if (kind === 'rest') return go([`火光很暖。你回復了 ${heal(0.4)} 點生命。`]);
    if (kind === 'spring') {
      L.companionAlive = true;
      return go(['泉水裡映出一隻黑色的小狗，牠甩甩水跳了出來。', `引魂犬回來了。你回復了 ${heal(0.2)} 點生命。`]);
    }
    if (kind === 'altar') {
      const cost = Math.max(1, Math.floor(L.hp / 4));
      L.hp = Math.max(1, L.hp - cost);
      L.bonusAtk = (L.bonusAtk || 0) + 1;
      return go([`你割開手掌，失去 ${cost} 點生命。`, '祭壇上的眼睛睜開了一下。這一世攻擊 +1。']);
    }
    if (kind === 'chest') {
      if (Math.random() < 0.6) {
        this.save.fragments += 3;
        return go(['箱子裡有一瓶藥和幾片發光的碎片。', `你回復了 ${heal(0.3)} 點生命，靈魂碎片 +3。`]);
      }
      const hurt = Math.max(1, Math.ceil(maxHp * 0.2));
      L.hp = Math.max(1, L.hp - hurt);
      return go(['箱子張開嘴，咬了你一口。', `你失去 ${hurt} 點生命。`]);
    }
    if (kind === 'lost') {
      const s = this.save;
      return this.story(['一個透明的上班族一直在找出口。', '「請問……打卡機在哪裡？我今天好像還沒下班。」'], null, {
        speaker: EVENTS.lost.name,
        choices: [
          { label: '幫忙：帶他到樓梯口', action: () => { s.nature = clampNature(s.nature - 5); s.fragments += 3; go(['他說謝謝，然後慢慢消失在樓梯上。', '（靈魂碎片 +3，靈魂偏向秩序）']); } },
          { label: '保留：繞過他', action: () => go(['你繞了過去。身後一直傳來找東西的聲音。']) },
          { label: '利用：把他吸收掉', action: () => { s.debt += 1; s.nature = clampNature(s.nature + 5); L.hp = maxHp; go(['他還來不及喊，就變成了你的一部分。', '（生命全滿，因果債 +1）']); } },
        ],
      });
    }
  },

  bossLoot() {
    const s = this.save, L = s.life;
    s.vault = s.vault || [];
    const pool = Object.keys(RELICS).filter((id) => RELICS[id].from === L.run.boss && !s.vault.includes(id));
    if (!pool.length) {
      s.fragments += 10;
      this.persist();
      return this.story(['首領身上什麼都沒有了。你把它的殘骸換成了 10 個靈魂碎片。'], () => this.victory(), { speaker: '戰利品' });
    }
    const offer = pool.sort(() => Math.random() - 0.5).slice(0, 2);
    const take = (id) => {
      s.vault.push(id);
      this.persist();
      this.story([`你拿起了「${RELICS[id].name}」。`, '它在你手裡慢慢變冷。這一世用不到了，但它會跟著你的靈魂，存進靈魂倉庫。', '（下一世轉生時可以喚醒它）'], () => this.victory(), { speaker: '戰利品' });
    };
    this.story(['首領倒下的地方，留下了發光的東西。', '你只拿得動一件。'], null, {
      speaker: '戰利品',
      choices: offer.map((id) => ({ label: `${RELICS[id].name}：${RELICS[id].desc}`, action: () => take(id) })),
    });
  },

  victory() {
    this.story([
      '你從地城走出來的時候，城鎮已經過了好多年。',
      '你在這裡老去，安靜地壽終正寢。',
      '然後，熟悉的日光燈又亮了起來。',
      '「歡迎回來。」',
    ], () => this.die('victory', null), { speaker: '人間' });
  },

  // ───────── 死亡與結算 ─────────

  die(outcome, cause) {
    const s = this.save, L = s.life;
    const st = this.heroStats();
    const record = {
      life: this.lifeNo, form: L.form, faith: L.faith, skills: st.skills,
      floor: L.floor, floorName: this.floorName(L.floor), kills: L.kills, outcome, cause,
    };
    s.history.push(record);
    L.alive = false;

    let frag = (L.floor + 1) * 3 + L.kills;
    if (outcome === 'escaped') frag += 5;
    if (outcome === 'victory') frag += 10;
    s.fragments += frag;
    s.nature = clampNature(s.nature + (L.form === 'angel' ? -5 : L.form === 'demon' ? 5 : 0) + (outcome === 'sealed' ? 5 : 0));
    s.boons.soulExtra = 0;

    // 留下前世回響
    const n = record.life;
    if (L.kills >= 6 || outcome === 'victory') {
      s.echoes = s.echoes.filter((e) => e.type !== 'statue');
      s.echoes.push({ type: 'statue', title: '英雄雕像', text: `廣場上立著第 ${n} 世的你。村民對你的靈魂很友善（攻擊 +1）。` });
    }
    if (outcome !== 'victory') {
      s.echoes = s.echoes.filter((e) => !(e.type === 'remnant' && e.floor === L.floor));
      s.echoes.push({ type: 'remnant', floor: L.floor, frag: 5, title: '殘魂', text: `地下 ${L.floor + 1} 層留著第 ${n} 世的殘魂。突破那一層就能取回 5 個碎片。` });
    }
    if (s.debt >= 4 && !s.echoes.some((e) => e.type === 'bounty')) {
      s.echoes.push({ type: 'bounty', title: '懸賞令', text: '你欠下的因果太多了。地下 3 層有追殺者在等你。打倒他可以減少因果債。' });
    }
    this.persist();

    const how = {
      faded: '你的靈魂撐不住，被吸回了終端。',
      sealed: `你的靈魂被${cause || '敵人'}封進了封印石。`,
      escaped: '你的靈魂從裂縫逃回了終端，帶著多一點的碎片。',
      victory: '你壽終正寢。',
    }[outcome];
    const lines = [
      `第 ${n} 世・因果紀錄`,
      `形態：${FORMS[L.form].name}　信仰：${FAITHS[L.faith].name}`,
      `到達：${record.floorName}　擊倒：${L.kills}`,
      cause ? `死因：${cause}` : '死因：天年已盡',
      how,
      `獲得靈魂碎片 ${frag}。`,
    ];
    this.story(lines, () => this.afterDeath(outcome), { speaker: '靈魂結算終端', glitch: this.glitch - 1 });
  },

  afterDeath(outcome) {
    const s = this.save;
    const steps = [];
    if (outcome === 'sealed') steps.push((next) => this.redeem(next));
    const reg = this.nextRegular();
    if (reg) steps.push((next) => this.regularScene(reg, next));
    if (s.history.length >= 6 && !s.truthRevealed) steps.push((next) => this.revealTruth(next));
    const run = () => { const f = steps.shift(); if (f) f(run); else this.showTerminal(); };
    run();
  },

  redeem(next) {
    const s = this.save;
    const cost = Math.ceil(s.fragments / 2);
    this.story([
      '封印石裡很暗，很擠，好像還有別人。',
      '一個戴著工牌的人敲了敲石頭：「贖魂手續要收費喔。」',
    ], null, {
      speaker: '贖魂窗口', glitch: this.glitch,
      choices: [
        { label: `付 ${cost} 個碎片贖回`, action: () => { s.fragments -= cost; this.persist(); next(); } },
        { label: '賒帳（因果債 +2）', action: () => { s.debt += 2; this.persist(); next(); } },
      ],
    });
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
      if (e.boon === 'soulExtra') tail.push('（下一世變成靈魂時，可以多撐 1 回合。）');
      if (e.boon === 'parcel') tail.push('（下一世從 Lv.2 開始。）');
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

    root.append(el('h3', {}, '前世'));
    const list = el('div', { class: 'history' });
    for (const h of [...s.history].reverse()) {
      list.append(el('div', {}, corrupt(`第 ${h.life} 世：${FORMS[h.form].name}・${FAITHS[h.faith].name}・${(h.floorName || `地下 ${h.floor + 1} 層`).split('・')[0]}・${outcomeLabel(h.outcome)}`, this.glitch - 3)));
    }
    root.append(list);
    root.append(el('button', { class: 'btn primary wide', onclick: () => this.showRebirth() }, '前往轉生櫃台'));
    root.append(el('button', { class: 'btn wide', onclick: () => this.showTitle() }, '回標題（自動存檔）'));
    this.show('terminal');
  },
};

function clampNature(n) { return Math.max(-100, Math.min(100, n)); }
function natureLabel(n) { return n <= -30 ? '秩序' : n >= 30 ? '混沌' : n < 0 ? '偏秩序' : n > 0 ? '偏混沌' : '中立'; }
function outcomeLabel(o) { return { faded: '靈魂消散', sealed: '被搶魂', escaped: '逃魂', victory: '壽終正寢' }[o] || o; }

function mutateSkill(id, form) {
  const base = SKILLS[id], m = MUTATION[form];
  const def = { ...base, mutation: m };
  def.name = m.prefix ? m.prefix + base.name : base.name;
  return def;
}

function spriteImg(name) {
  const c = document.createElement('canvas');
  c.className = 'sprite';
  drawPortrait(c, name, 3);
  return c;
}

// 戰鬥畫面的按鈕與訊息
const BattleUI = {
  battleLog(text) {
    const log = $('#battle .log');
    log.prepend(el('div', {}, text));
    while (log.children.length > 4) log.lastChild.remove();
  },
  battleRound(n, extra) { $('#battle .round').textContent = `第 ${n} 回合` + (extra ? `・${extra}` : ''); },
  showActions(u, actions) {
    const box = $('#battle .actions');
    box.innerHTML = '';
    for (const a of actions) {
      box.append(el('button', {
        class: 'btn act' + (a.id === 'ult' && a.ready ? ' glow' : ''),
        'data-id': a.id,
        disabled: a.ready ? null : 'disabled',
        onclick: () => Game.battle && Game.battle.chooseAction(a.id),
      }, a.name));
    }
    $('#battle .hint').textContent = '點藍色格子移動，或直接選擇行動。';
    this.showHero(u);
  },
  showSoulActions() {
    const box = $('#battle .actions');
    box.innerHTML = '';
    box.append(el('button', { class: 'btn act', onclick: () => Game.battle && Game.battle.chooseAction('wait') }, '等待救援'));
    $('#battle .hint').textContent = '點藍色格子讓靈魂飄過去。紫色裂縫可以逃走。';
    if (Game.battle) $('#battle .hero-hp').textContent = `靈魂 剩 ${Game.battle.hero.soulTimer} 回合`;
  },
  setActiveAction(id) {
    for (const b of document.querySelectorAll('#battle .actions .btn')) b.classList.toggle('active', b.dataset.id === id);
    $('#battle .hint').textContent = id ? '點紅色格子選擇目標。再按一次按鈕取消。' : '點藍色格子移動，或直接選擇行動。';
  },
  hideActions() {
    $('#battle .actions').innerHTML = '';
    $('#battle .hint').textContent = '';
  },
  showHero(u) {
    $('#battle .hero-hp').textContent = `生命 ${u.hp}/${u.maxHp}`;
  },
};

// ───────── 標題與場景的小插圖 ─────────

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

function drawTownBanner(canvas) {
  const W = 120, H = 60, S = 4;
  canvas.width = W * S; canvas.height = H * S;
  const g = canvas.getContext('2d');
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x * S, y * S, w * S, h * S); };
  px(0, 0, W, H, '#1a1830');
  px(0, 30, W, 30, '#221f3a');
  px(92, 8, 8, 8, '#f0e6b0');
  px(94, 8, 6, 6, '#1a1830');
  const houses = [[8, 34, 18], [30, 30, 22], [58, 36, 16], [80, 32, 20]];
  for (const [x, y, w] of houses) {
    px(x, y, w, H - y, '#2e2a48');
    for (let i = 0; i < w / 2; i++) px(x + i, y - i * 0.6 - 1, w - i * 2, 1, '#3d2a2a');
    px(x + 3, y + 6, 3, 3, '#f0c060');
    px(x + w - 7, y + 6, 3, 3, Math.random() < 0.5 ? '#f0c060' : '#222');
  }
  px(0, 52, W, 8, '#141226');
  px(54, 44, 12, 16, '#0d0c18');
  px(56, 46, 8, 14, '#3a1f4a');
}

window.addEventListener('DOMContentLoaded', () => Game.start());
