// 回合制格子戰鬥：移動、技能、神魔領域、死亡後的靈魂狀態
'use strict';

const TILE = 16;
const SCALE = 4;
const COLS = 7;
const ROWS = 9;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const key = (x, y) => x + ',' + y;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function tween(ms, fn) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      fn(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

class Battle {
  // spec：generateFloor() 產生的樓層；hero：本世角色的戰鬥數值；opts：{ faith, form, soulExtra, startCharge, gauge }
  constructor(canvas, ui, spec, hero, opts) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.ui = ui;
    this.floor = spec;
    this.theme = THEMES.find((t) => t.id === spec.theme) || THEMES[0];
    this.heroBase = hero;
    this.opts = opts;
    this.job = JOBS[opts.faith];
    this.pp = this.job.passive.p; // 職業被動
    this.gauge = opts.gauge || '能量';
    this.abyss = 0;       // 克蘇魯的深淵能量
    this.round = 0;
    this.units = [];
    this.marks = [];      // 索爾的雷擊標記
    this.rifts = [];      // 靈魂可以逃走的裂縫
    this.effects = [];    // 落雷、文字等特效
    this.highlights = null;
    this.current = null;
    this.ended = false;
    this.shake = 0;
    this.flashScreen = 0;
    this.kills = 0;
    this.expGained = 0;
    this.result = null;

    canvas.width = COLS * TILE * SCALE;
    canvas.height = ROWS * TILE * SCALE;
    this.g.imageSmoothingEnabled = false;

    this.parseMap(hero);
    this.applyStartPassives();
    this.onTap = this.onTap.bind(this);
    canvas.addEventListener('pointerdown', this.onTap);
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    this.canvas.removeEventListener('pointerdown', this.onTap);
  }

  parseMap(hero) {
    this.tiles = [];
    const enemyQueue = [...this.floor.enemies];
    const spawns = [];
    for (let y = 0; y < ROWS; y++) {
      this.tiles.push([]);
      for (let x = 0; x < COLS; x++) {
        const ch = this.floor.map[y][x];
        this.tiles[y].push(ch === '#' ? 'wall' : ch === '~' ? 'water' : 'floor');
        if (ch === 'P') this.addUnit(this.makeHero(hero, x, y));
        if (ch === 'C' && hero.companionAlive !== false) this.addUnit(this.makeCompanion(x, y));
        if (ch === 'E') spawns.push({ x, y });
        if (ch === 'B') this.addUnit(this.makeEnemy(this.floor.boss, x, y));
      }
    }
    // 敵人比出生點多的時候（例如追殺者），找最上面的空位
    for (const type of enemyQueue) {
      let spot = spawns.shift();
      if (!spot) spot = this.findFreeTile(3, 0);
      if (spot) this.addUnit(this.makeEnemy(type, spot.x, spot.y));
    }
  }

  findFreeTile(cx, cy) {
    let best = null;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!this.isFree(x, y)) continue;
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (!best || d < best.d) best = { x, y, d };
    }
    return best;
  }

  makeHero(h, x, y) {
    const skills = h.skills.map((id) => ({ ...h.skillDefs[id], id, cdLeft: 0 }));
    return {
      id: 'hero', side: 'ally', isPlayer: true, name: '你', sprite: h.sprite, art: h.art,
      x, y, hp: h.hp, maxHp: h.maxHp, atk: h.atk, def: h.def, spd: h.spd, mov: h.mov,
      range: [1, 1], skills, ult: { ...this.job.ult, id: 'ult' },
      charge: Math.min(100, (this.opts.startCharge || 0) + (this.pp.charge || 0)), facing: 1,
      ox: 0, oy: 0, flash: 0,
    };
  }

  // 戰鬥開始時生效的被動：水窪、壓低敵人攻擊
  applyStartPassives() {
    const p = this.pp;
    if (p.waterStart) {
      const cand = [];
      for (let y = 2; y <= 6; y++) for (let x = 0; x < COLS - 1; x++) {
        if (this.tile(x, y) === 'floor' && this.tile(x + 1, y) === 'floor' && !this.unitAt(x, y) && !this.unitAt(x + 1, y)) cand.push({ x, y });
      }
      cand.sort(() => Math.random() - 0.5);
      for (const c of cand.slice(0, p.waterStart)) { this.tiles[c.y][c.x] = 'water'; this.tiles[c.y][c.x + 1] = 'water'; }
    }
    if (p.enemyAtk) for (const e of this.living('enemy')) e.atk = Math.max(1, e.atk - p.enemyAtk);
  }

  makeCompanion(x, y) {
    const c = COMPANION;
    const cerb = !!this.pp.dog;
    const hp = c.hp + (cerb ? 10 : 0);
    return {
      id: 'dog', side: 'ally', isCompanion: true, name: c.name, sprite: c.sprite,
      x, y, hp, maxHp: hp, atk: c.atk + (cerb ? 3 : 0), def: c.def, spd: c.spd, mov: c.mov,
      range: c.range, skills: [], facing: 1, ox: 0, oy: 0, flash: 0,
    };
  }

  makeEnemy(type, x, y) {
    const e = ENEMIES[type];
    return {
      id: type + '_' + this.units.length, type, side: 'enemy', name: e.name, sprite: e.sprite,
      x, y, hp: e.hp, maxHp: e.hp, atk: e.atk, def: e.def, spd: e.spd, mov: e.mov,
      range: e.range, grab: e.grab, boss: !!e.boss, chain: e.chain, summon: e.summon, blink: e.blink, exp: e.exp,
      skills: [], facing: -1, ox: 0, oy: 0, flash: 0,
    };
  }

  addUnit(u) {
    if (u.side === 'enemy' && ENEMIES[u.type] && ENEMIES[u.type].copy) {
      // 鏡中人：照著你的樣子長出來
      u.atk = this.heroBase.atk; u.def = this.heroBase.def; u.sprite = this.heroBase.sprite; u.art = this.heroBase.art; u.mirror = true;
    }
    u.stunned = 0; u.blind = 0; u.charmed = 0; u.shield = 0;
    u.cursed = 0; u.confused = 0; u.defending = false; u.soul = false; u.gone = false;
    this.units.push(u);
  }

  get hero() { return this.units.find((u) => u.isPlayer); }
  get companion() { return this.units.find((u) => u.isCompanion && !u.gone); }
  living(side) { return this.units.filter((u) => !u.gone && !u.soul && (!side || u.side === side)); }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  tile(x, y) { return this.inBounds(x, y) ? this.tiles[y][x] : 'wall'; }
  unitAt(x, y) { return this.units.find((u) => !u.gone && u.x === x && u.y === y); }
  isFree(x, y) { return this.inBounds(x, y) && this.tile(x, y) !== 'wall' && !this.unitAt(x, y); }

  // 可以走到的格子：水面要花兩步；靈魂可以穿過單位但不能穿牆
  reachable(unit, mov, ghost = false) {
    const out = new Map();
    out.set(key(unit.x, unit.y), { x: unit.x, y: unit.y, cost: 0, path: [] });
    const queue = [{ x: unit.x, y: unit.y, cost: 0, path: [] }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const cur = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!this.inBounds(nx, ny) || this.tile(nx, ny) === 'wall') continue;
        const occ = this.unitAt(nx, ny);
        if (occ && !ghost) continue;
        const swim = this.pp.swim && unit.side === 'ally';
        const step = !ghost && !swim && this.tile(nx, ny) === 'water' ? 2 : 1;
        const cost = cur.cost + step;
        if (cost > mov) continue;
        const k = key(nx, ny);
        if (out.has(k) && out.get(k).cost <= cost) continue;
        const node = { x: nx, y: ny, cost, path: [...cur.path, { x: nx, y: ny }] };
        out.set(k, node);
        queue.push(node);
      }
    }
    // 不能停在別人身上
    for (const [k, n] of out) {
      const occ = this.unitAt(n.x, n.y);
      if (occ && occ !== unit) out.delete(k);
    }
    return out;
  }

  // ───────── 主流程 ─────────

  async run() {
    this.ui.battleLog(this.floor.name);
    await sleep(400);
    while (!this.ended) {
      this.round++;
      this.ui.battleRound(this.round, this.pp.dayNight ? (this.isDay() ? '白天' : '黑夜') : '');
      await this.startOfRound();
      if (this.ended) break;
      const order = this.units
        .filter((u) => !u.gone)
        .sort((a, b) => (b.spd - a.spd) || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
      for (const u of order) {
        if (this.ended) break;
        if (u.gone) continue;
        if (u.soul && !u.isPlayer) continue;
        await this.takeTurn(u);
        await this.checkEnd();
      }
      if (this.ended) break;
      await this.endOfRound();
      await this.checkEnd();
    }
    this.current = null;
    this.highlights = null;
    return this.result;
  }

  isDay() { return this.round % 2 === 1; }

  async startOfRound() {
    const p = this.pp;
    if (p.thorMarks && this.marks.length) {
      await this.thunderStrike(this.marks, 5, true);
      this.marks = [];
    }
    if (p.biggest) {
      const big = this.living('enemy').sort((a, b) => b.maxHp - a.maxHp)[0];
      if (big) {
        this.ui.battleLog(`高處的視線落在${big.name}身上。`);
        await this.damage(big, p.biggest, null, '#ffb0d0');
      }
    }
    if (p.abyss && this.abyss >= 4) {
      const pool = this.living('enemy');
      if (pool.length) {
        this.abyss -= 4;
        const t = pool[randInt(0, pool.length - 1)];
        t.confused = 1;
        this.floatText(t, '發瘋', '#70e0c0');
        this.ui.battleLog(`深淵在${t.name}耳邊說了什麼，牠發瘋了。`);
        await sleep(300);
      }
    }
    if (p.waterHurt) {
      for (const e of this.living('enemy').filter((e) => this.tile(e.x, e.y) === 'water')) await this.damage(e, p.waterHurt, null, '#4a90d0');
    }
    if (p.randomHurt && this.round % p.randomHurt.every === 0) {
      const pool = this.living('enemy');
      if (pool.length) {
        const t = pool[randInt(0, pool.length - 1)];
        this.effects.push({ type: 'bolt', x: t.x, y: t.y, ttl: 300, max: 300 });
        this.ui.battleLog(`${this.job.passive.n}：${t.name}被擊中了。`);
        await this.damage(t, p.randomHurt.dmg, null, '#ffe040');
      }
    }
    if (p.regen) { const h = this.hero; if (!h.soul) this.heal(h, p.regen); }
    if (p.dayNight) this.ui.battleLog(this.isDay() ? '日輪升起：白天。' : '太陽落下：黑夜。');
  }

  async endOfRound() {
    // 靈魂倒數
    for (const u of this.units) {
      if (u.gone || !u.soul) continue;
      u.soulTimer--;
      if (u.soulTimer <= 0) {
        if (u.isPlayer) {
          this.ui.battleLog('你的靈魂撐不住了，被吸往終端……');
          this.finish({ result: 'death', outcome: 'faded' });
          return;
        }
        u.gone = true;
        this.ui.battleLog(u.name + '的靈魂消散了。');
      }
    }
    // 召喚出來的影子時間到了就散掉
    for (const u of this.units) {
      if (u.gone || !u.isSummon) continue;
      if (--u.summonTimer <= 0) { u.gone = true; this.ui.battleLog(`${u.name}散回影子裡。`); }
    }
    // 索爾：每兩回合，在敵人腳下標記雷擊區，下一回合開始時落雷
    if (this.pp.thorMarks && this.round % 2 === 1) {
      const targets = this.living('enemy').sort(() => Math.random() - 0.5).slice(0, 3);
      this.marks = targets.map((t) => ({ x: t.x, y: t.y }));
      if (this.marks.length) this.ui.battleLog('雷霆領域：天空出現了雷擊標記。');
    }
  }

  async checkEnd() {
    if (this.ended) return;
    if (this.living('enemy').length === 0) {
      const hero = this.hero;
      if (hero.soul) {
        hero.soul = false;
        hero.hp = Math.ceil(hero.maxHp * 0.3);
        this.ui.battleLog('敵人都倒下了，你的靈魂被拉回身體。');
      }
      this.finish({ result: 'win' });
    }
  }

  finish(res) {
    if (this.ended) return;
    this.ended = true;
    const hero = this.hero;
    this.result = {
      ...res,
      hp: hero.soul ? 0 : hero.hp,
      kills: this.kills,
      exp: this.expGained,
      cause: this.deathCause,
      companionAlive: !!this.companion,
    };
    this.highlights = null;
    this.ui.hideActions();
  }

  async takeTurn(u) {
    this.current = u;
    if (u.stunned > 0 && !u.soul) {
      u.stunned--;
      this.floatText(u, '定身', '#ffb0d0');
      await sleep(400);
      return;
    }
    u.defending = false;
    if (u.shield > 0) u.shield--;
    if (u.cursed > 0) u.cursed--;
    for (const s of u.skills) if (s.cdLeft > 0) s.cdLeft--;
    if (u.side === 'ally' && u.isPlayer) {
      await this.playerTurn(u);
      // 再行動一次的技能
      while (this.extraTurn && !this.ended && !u.soul) {
        this.extraTurn = false;
        this.ui.battleLog('你再行動一次。');
        await this.playerTurn(u);
      }
    } else if (u.side === 'ally') {
      await sleep(250);
      await this.companionTurn(u);
      if (u.confused > 0) u.confused--;
      if (u.blind > 0) u.blind--;
      if (u.charmed > 0) {
        u.charmed--;
        if (!u.charmed) { u.side = 'enemy'; this.ui.battleLog(`${u.name}清醒過來了。`); }
      }
    } else {
      await sleep(250);
      await this.enemyTurn(u);
      if (u.confused > 0) u.confused--;
      if (u.blind > 0) u.blind--;
    }
    this.highlights = null;
  }

  // ───────── 玩家回合 ─────────

  playerTurn(u) {
    return new Promise((resolve) => {
      this.turnState = { unit: u, moved: false, mode: null, action: null, resolve };
      if (u.soul) {
        this.ui.battleLog(`你是一顆靈魂（剩 ${u.soulTimer} 回合）。等待救援，或飄向紫色裂縫逃走。`);
        this.turnState.mode = 'soulmove';
        this.highlights = { type: 'move', tiles: this.reachable(u, 2, true) };
        this.ui.showSoulActions();
        return;
      }
      this.turnState.mode = 'move';
      this.highlights = { type: 'move', tiles: this.reachable(u, u.mov) };
      this.ui.showActions(u, this.availableActions(u));
    });
  }

  availableActions(u) {
    const acts = [{ id: 'attack', name: '攻擊', ready: true }];
    for (const s of u.skills) {
      acts.push({ id: 'skill:' + s.id, name: s.cdLeft > 0 ? `${s.n}(${s.cdLeft})` : s.n, ready: s.cdLeft === 0 });
    }
    acts.push({ id: 'ult', name: `${u.ult.n} ${u.charge}%`, ready: u.charge >= 100 });
    const soulNear = this.units.find((o) => o.side === 'ally' && o.soul && !o.gone && dist(o, u) <= this.rescueRange);
    if (soulNear) acts.push({ id: 'rescue', name: '救援', ready: true });
    acts.push({ id: 'defend', name: '防禦', ready: true });
    acts.push({ id: 'wait', name: '結束', ready: true });
    return acts;
  }

  get rescueRange() { return this.pp.rescueRange || 1; }

  skillFor(u, id) { return id === 'ult' ? u.ult : u.skills.find((k) => 'skill:' + k.id === id); }

  endPlayerTurn() {
    const ts = this.turnState;
    this.turnState = null;
    this.highlights = null;
    this.ui.hideActions();
    if (ts) ts.resolve();
  }

  // 按下行動按鈕
  chooseAction(id) {
    const ts = this.turnState;
    if (!ts || ts.busy) return;
    const u = ts.unit;
    if (id === 'wait') return this.endPlayerTurn();
    if (id === 'defend') {
      u.defending = true;
      this.floatText(u, '防禦', '#9cf');
      return this.endPlayerTurn();
    }
    const sk = this.skillFor(u, id);
    if (sk && sk.t === 'self') {
      ts.busy = true;
      this.highlights = null;
      this.ui.hideActions();
      (async () => {
        await this.performAction(u, id, u.x, u.y);
        ts.busy = false;
        await this.checkEnd();
        this.endPlayerTurn();
      })();
      return;
    }
    if (ts.mode === 'target' && ts.action === id) {
      // 再按一次同一個按鈕＝取消
      ts.mode = ts.moved ? null : 'move';
      ts.action = null;
      this.highlights = ts.moved ? null : { type: 'move', tiles: this.reachable(u, u.mov) };
      this.ui.setActiveAction(null);
      return;
    }
    const tiles = this.targetTiles(u, id);
    ts.mode = 'target';
    ts.action = id;
    this.highlights = { type: 'target', tiles };
    this.ui.setActiveAction(id);
    if (tiles.size === 0) this.ui.battleLog('範圍內沒有目標。再按一次按鈕可以取消。');
  }

  targetTiles(u, id) {
    const out = new Map();
    const add = (x, y) => out.set(key(x, y), { x, y });
    if (id === 'attack') {
      for (const e of this.living('enemy')) if (dist(u, e) === 1) add(e.x, e.y);
      return out;
    }
    if (id === 'rescue') {
      for (const a of this.units) if (a.side === 'ally' && a.soul && !a.gone && dist(a, u) <= this.rescueRange) add(a.x, a.y);
      return out;
    }
    const sk = this.skillFor(u, id);
    const r = sk.r;
    const inR = (x, y) => { const d = Math.abs(x - u.x) + Math.abs(y - u.y); return d >= r[0] && d <= r[1]; };
    if (sk.t === 'tile') {
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!inR(x, y) || this.tile(x, y) === 'wall') continue;
        if (sk.fx.teleport && !this.isFree(x, y)) continue;
        add(x, y);
      }
    } else if (sk.t === 'ally') {
      for (const a of this.living('ally')) if (inR(a.x, a.y)) add(a.x, a.y);
    } else {
      for (const e of this.living('enemy')) {
        if (sk.fx.charm && e.boss) continue;
        if (inR(e.x, e.y)) add(e.x, e.y);
      }
    }
    return out;
  }

  async onTap(ev) {
    const ts = this.turnState;
    if (!ts || ts.busy) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - rect.left) / rect.width) * COLS);
    const y = Math.floor(((ev.clientY - rect.top) / rect.height) * ROWS);
    if (!this.inBounds(x, y)) return;
    const u = ts.unit;
    const k = key(x, y);

    if ((ts.mode === 'move' || ts.mode === 'soulmove') && this.highlights && this.highlights.tiles.has(k)) {
      const node = this.highlights.tiles.get(k);
      ts.busy = true;
      this.highlights = null;
      await this.walk(u, node.path);
      ts.busy = false;
      if (ts.mode === 'soulmove') {
        if (this.rifts.some((r) => r.x === u.x && r.y === u.y)) {
          this.ui.battleLog('你的靈魂鑽進裂縫，逃離了戰場。');
          this.floatText(u, '逃魂', '#c8a0f0');
          this.finish({ result: 'death', outcome: 'escaped' });
        }
        return this.endPlayerTurn();
      }
      ts.moved = true;
      ts.mode = null;
      this.ui.showActions(u, this.availableActions(u));
      return;
    }

    if (ts.mode === 'target' && this.highlights && this.highlights.tiles.has(k)) {
      ts.busy = true;
      this.highlights = null;
      await this.performAction(u, ts.action, x, y);
      ts.busy = false;
      await this.checkEnd();
      return this.endPlayerTurn();
    }
  }

  async performAction(u, id, x, y) {
    const target = this.unitAt(x, y);
    this.acting = true;
    if (id === 'attack') {
      await this.attack(u, target, 1.0);
    } else if (id === 'rescue') {
      await this.rescue(u, target);
    } else if (id === 'ult') {
      u.charge = 0;
      this.inUlt = true;
      await this.execSkill(u, u.ult, x, y);
      this.inUlt = false;
    } else if (id.startsWith('skill:')) {
      const s = this.skillFor(u, id);
      s.cdLeft = s.cd + (this.pp.cdr ? 0 : 1);
      await this.execSkill(u, s, x, y);
    }
    this.acting = false;
    this.charged = false;
  }

  // ───────── 行動 ─────────

  // 有專屬圖的單位播一段動作；loop 的要自己用 stopAnim 停
  playAnim(u, name) {
    if (u.art) u.anim = { name, t0: performance.now() };
  }

  async walk(u, path) {
    if (path.length) this.playAnim(u, 'walk');
    for (const step of path) {
      if (step.x !== u.x) u.facing = step.x > u.x ? 1 : -1;
      const fx = u.x, fy = u.y;
      await tween(90, (t) => { u.ox = (step.x - fx) * TILE * t; u.oy = (step.y - fy) * TILE * t; });
      u.x = step.x; u.y = step.y; u.ox = 0; u.oy = 0;
    }
    if (u.anim && u.anim.name === 'walk') u.anim = null;
  }

  async lunge(u, target) {
    if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;
    if (!u.anim) this.playAnim(u, 'punch');
    const dx = Math.sign(target.x - u.x) * 5, dy = Math.sign(target.y - u.y) * 5;
    await tween(80, (t) => { u.ox = dx * t; u.oy = dy * t; });
    await tween(100, (t) => { u.ox = dx * (1 - t); u.oy = dy * (1 - t); });
  }

  calcDamage(att, def, mult) {
    const p = this.pp;
    let dmg = Math.round(att.atk * mult) - def.def + randInt(-1, 1);
    if (p.dayNight && att.side === 'ally' && this.isDay()) dmg += 2;
    if (att.isPlayer) {
      if (p.lowHpAtk && att.hp < att.maxHp / 2) dmg += p.lowHpAtk;
      if (p.bossDmg && def.boss) dmg = Math.round(dmg * (1 + p.bossDmg));
      if (p.critChance && Math.random() < p.critChance) { dmg = Math.round(dmg * 1.5); this.floatText(att, '暴擊', '#ff9a30'); }
    }
    dmg = Math.max(1, dmg);
    return this.adjustTaken(def, dmg);
  }

  // 詛咒加五成；防禦、護盾減半
  adjustTaken(def, dmg) {
    if (def.cursed > 0) dmg = Math.round(dmg * 1.5);
    if (def.defending || def.shield > 0) dmg = Math.ceil(dmg / 2);
    return dmg;
  }

  async attack(att, def, mult, extra = {}) {
    await this.lunge(att, def);
    if (att.blind > 0 && Math.random() < 0.5) {
      this.floatText(def, '落空', '#ffe070');
      await sleep(250);
      return 0;
    }
    if (att.side === 'enemy' && def.isPlayer && this.pp.dodge && Math.random() < this.pp.dodge) {
      this.floatText(def, '閃避', '#c8a0f0');
      this.ui.battleLog(`${att.name}的攻擊被你閃開了。`);
      await sleep(250);
      return 0;
    }
    const dmg = this.calcDamage(att, def, mult);
    await this.damage(def, dmg, att);
    if (att.isPlayer) this.onHitStatus(def);
    if (extra.drain) this.heal(att, Math.max(1, Math.round(dmg * extra.drain)));
    return dmg;
  }

  // 被動：攻擊附帶詛咒、定身、目盲
  onHitStatus(t) {
    const p = this.pp;
    if (t.gone || t.soul || t.side !== 'enemy') return;
    if (p.curseOnHit && Math.random() < p.curseOnHit) { t.cursed = Math.max(t.cursed, 3); this.floatText(t, '詛咒', '#d070ff'); }
    if (p.stunOnHit && Math.random() < p.stunOnHit) { t.stunned = Math.max(t.stunned, 1); this.floatText(t, '定身', '#ffb0d0'); }
    if (p.blindOnHit && Math.random() < p.blindOnHit) { t.blind = Math.max(t.blind, 1); this.floatText(t, '目盲', '#ffe070'); }
  }

  gainCharge(u, n) {
    if (!u || !u.isPlayer) return;
    u.charge = Math.min(100, u.charge + Math.round(n * (this.pp.chargeMult || 1)));
  }

  async damage(u, dmg, source, color = '#fff') {
    if (u.gone || u.soul) return;
    const p = this.pp;
    if (u.isPlayer && p.surviveOnce && !this.survived && u.hp - dmg <= 0) {
      this.survived = true;
      dmg = u.hp - 1;
      this.floatText(u, this.job.passive.n, '#ffe070');
      this.ui.battleLog(`「${this.job.passive.n}」讓你撐住了最後一口氣。`);
    }
    u.hp -= dmg;
    u.flash = 160;
    this.playAnim(u, 'hurt');
    this.shake = Math.min(8, 2 + dmg / 3);
    this.floatText(u, '-' + dmg, color);
    // 每個行動只充一次能量，大招打出去的傷害不回充
    if (source && source.isPlayer && this.acting && !this.inUlt && !this.charged) { this.charged = true; this.gainCharge(source, 25); }
    if (source && source.isPlayer && p.lifesteal && u.side === 'enemy') this.heal(source, Math.max(1, Math.round(dmg * p.lifesteal)));
    if (u.isPlayer) this.gainCharge(u, 15);
    if (u.isPlayer && p.thorns && source && source.side === 'enemy' && !source.gone && dmg > 0) {
      const back = Math.max(1, Math.round(dmg * p.thorns));
      await sleep(120);
      await this.damage(source, back, null, '#c0a0ff');
    }
    await sleep(200);
    if (u.hp <= 0) await this.down(u, source);
  }

  // 用固定點數打人：不看防禦，但詛咒和護盾照算
  async fixedDamage(u, n, source, color) {
    const d = this.adjustTaken(u, n);
    await this.damage(u, d, source, color);
    return d;
  }

  heal(u, amount, byHero = false) {
    if (u.gone || u.soul) return 0;
    if (this.pp.dayNight && this.isDay()) amount = Math.round(amount * 1.5);
    if (byHero && this.pp.healBoost) amount = Math.round(amount * this.pp.healBoost);
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (u.hp > before) this.floatText(u, '+' + (u.hp - before), '#7f7');
    return u.hp - before;
  }

  async down(u, source) {
    const p = this.pp;
    if (p.abyss) this.abyss++;
    if (u.isSummon) {
      u.gone = true;
      this.ui.battleLog(`${u.name}被打散了。`);
      return;
    }
    if (u.charmed) { u.charmed = 0; u.side = 'enemy'; }
    if (u.side === 'enemy') {
      u.gone = true;
      this.kills++;
      this.expGained += u.exp;
      this.ui.battleLog(`${u.name}倒下了。`);
      if (source && source.isPlayer) {
        if (p.onKillAtk) { source.atk += p.onKillAtk; this.floatText(source, `攻擊+${p.onKillAtk}`, '#ff9a30'); }
        if (p.onKillHeal) this.heal(source, p.onKillHeal);
        if (p.onKillCharge) this.gainCharge(source, p.onKillCharge);
        if (this.opts.form === 'demon') this.heal(source, 4);
      }
      return;
    }
    if (u.isPlayer && p.reviveOnce && !this.revived) {
      this.revived = true;
      u.hp = Math.ceil(u.maxHp / 2);
      u.flash = 400;
      this.floatText(u, this.job.passive.n, '#ffe070');
      this.ui.battleLog(`「${this.job.passive.n}」把你拼了回來。`);
      await sleep(300);
      return;
    }
    u.hp = 0;
    u.soul = true;
    u.cursed = 0;
    u.shield = 0;
    let timer = 3;
    if (u.isPlayer) timer += (this.opts.soulExtra || 0) + (p.soulExtra || 0);
    if (!u.isPlayer && this.opts.form === 'angel') timer += 2;
    if (!u.isPlayer && p.allySoul) timer += p.allySoul;
    u.soulTimer = timer;
    if (u.isPlayer) {
      this.deathCause = source ? source.name : '雷擊';
      this.ui.battleLog(`你倒下了，變成一顆靈魂。還能撐 ${timer} 回合。`);
      this.spawnRifts(u);
    } else {
      this.ui.battleLog(`${u.name}倒下了，變成一顆靈魂。`);
    }
  }

  spawnRifts(hero) {
    const cand = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      if (!edge || this.tile(x, y) === 'wall' || this.unitAt(x, y)) continue;
      const d = Math.abs(x - hero.x) + Math.abs(y - hero.y);
      if (d >= 3 && d <= 6) cand.push({ x, y, d });
    }
    cand.sort(() => Math.random() - 0.5);
    this.rifts = cand.slice(0, 2);
    if (!this.rifts.length) this.rifts = [{ x: 0, y: ROWS - 1 }];
  }

  async rescue(u, soul) {
    await this.lunge(u, soul);
    soul.soul = false;
    soul.hp = Math.ceil(soul.maxHp * 0.3);
    soul.flash = 300;
    this.floatText(soul, '救援', '#ffe070');
    this.ui.battleLog(`${u.name === '你' ? '你' : u.name}把${soul.isPlayer ? '你' : soul.name}的靈魂拉回身體。`);
    if (soul.isPlayer) { this.rifts = []; this.rescued = (this.rescued || 0) + 1; }
    await sleep(300);
  }

  async grab(enemy, soul) {
    await this.lunge(enemy, soul);
    this.floatText(soul, '搶魂', '#ff6060');
    this.shake = 6;
    if (soul.isPlayer) {
      this.ui.battleLog(`${enemy.name}抓住了你的靈魂，把它封進封印石。`);
      this.deathCause = enemy.name;
      await sleep(500);
      this.finish({ result: 'death', outcome: 'sealed' });
    } else {
      soul.gone = true;
      enemy.atk += 2;
      this.ui.battleLog(`${enemy.name}吞下了${soul.name}的靈魂，力量變強了。`);
      await sleep(300);
    }
  }

  // 範圍內的格子
  areaTiles(center, a) {
    if (a === 'all') {
      const out = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) out.push({ x, y });
      return out;
    }
    if (!a || a === 'single') return [center];
    const r = a === 'cross' ? 1 : +a.slice(1);
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (Math.abs(x - center.x) + Math.abs(y - center.y) <= r && this.tile(x, y) !== 'wall') out.push({ x, y });
    }
    return out;
  }

  // 通用技能：主動技能和大招都走這裡
  async execSkill(u, sk, x, y) {
    const fx = sk.fx, mut = sk.mutation || {}, a = sk.a || 'single';
    const who = sk.who || (sk.t === 'ally' ? 'ally' : 'enemy');
    const center = sk.t === 'self' ? { x: u.x, y: u.y } : { x, y };
    const isUlt = sk === u.ult;
    this.ui.battleLog(isUlt ? `${sk.n}！` : `你使出「${sk.n}」。`);
    if (isUlt) { this.flashScreen = 250; this.shake = 6; }
    if (u.art) { this.playAnim(u, 'cast'); await sleep(280); }
    let tiles = this.areaTiles(center, a);
    const killsBefore = this.kills;

    if (fx.teleport) {
      await tween(120, (t) => { u.ox = (x - u.x) * TILE * t; u.oy = (y - u.y) * TILE * t; });
      u.x = x; u.y = y; u.ox = 0; u.oy = 0; u.flash = 200;
      this.rifts = this.rifts.filter((r) => !(r.x === x && r.y === y));
    }
    if (fx.water) {
      for (const c of tiles) {
        if (this.tile(c.x, c.y) === 'wall') continue;
        this.tiles[c.y][c.x] = 'water';
        this.effects.push({ type: 'wave', x: c.x, y: c.y, ttl: 500, max: 500 });
      }
      await sleep(250);
    }

    const match = (t) => t && !t.gone && !t.soul && (who === 'ally' ? t.side === 'ally' : t.side === 'enemy');
    let targets;
    if (fx.teleport || (sk.t === 'self' && a === 'single')) targets = [u];
    else targets = tiles.map((c) => this.unitAt(c.x, c.y)).filter(match);
    if (sk.t === 'self' && who === 'enemy') targets = targets.filter((t) => t !== u);

    if (fx.blink && targets[0]) {
      const prey = targets[0];
      const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: prey.x + dx, y: prey.y + dy })).filter((p) => this.isFree(p.x, p.y));
      if (spots.length && dist(u, prey) > 1) {
        const p = spots.sort((m, n) => dist(m, u) - dist(n, u))[0];
        u.flash = 200; u.x = p.x; u.y = p.y;
        await sleep(200);
      }
    }
    if (a === 'single' && targets[0] && targets[0] !== u) await this.lunge(u, targets[0]);
    if (a !== 'single' && who === 'enemy') for (const c of tiles) if (a !== 'all' || this.unitAt(c.x, c.y)) this.effects.push({ type: 'spark', x: c.x, y: c.y, ttl: 350, max: 350 });

    let total = 0;
    let rest = fx;
    if (fx.lightning && who === 'enemy') {
      // 落雷：順著水面導電，傷害一樣
      const strike = a === 'all' ? targets.map((t) => ({ x: t.x, y: t.y })) : a === 'single' ? (targets[0] ? [{ x: targets[0].x, y: targets[0].y }] : []) : tiles;
      const value = fx.fixed || (targets[0] ? Math.max(1, Math.round(u.atk * (fx.dmg || 1)) - targets[0].def) : 0);
      if (strike.length && value) total += await this.thunderStrike(strike, value, false, u);
      rest = { ...fx, dmg: 0, fixed: 0 };
    }
    for (const t of targets) total += await this.applyFx(u, t, rest, mut);
    const killed = this.kills > killsBefore;

    // 施法者自己的效果
    if (fx.abyssDmg) this.abyss = 0;
    if (fx.drainAll && total) this.heal(u, Math.ceil(total / 2));
    if (fx.charge) this.gainCharge(u, fx.charge);
    if (fx.chargeRand) { const n = randInt(fx.chargeRand[0], fx.chargeRand[1]); this.gainCharge(u, n); this.floatText(u, `${this.gauge}+${n}`, '#c8a0f0'); }
    if (fx.allHeal) for (const al of this.living('ally')) this.heal(al, fx.allHeal, true);
    if (fx.reviveDog || fx.roar) await this.reviveDog(u, fx.roar || 0);
    if (fx.summon) this.summonShades(u, fx.summon);
    if (fx.selfHurt) { u.hp = Math.max(1, u.hp - fx.selfHurt); this.floatText(u, '-' + fx.selfHurt, '#ff8080'); }
    if (fx.killRefund && killed) { u.charge = Math.max(u.charge, fx.killRefund); this.ui.battleLog(`${this.gauge}回充了 ${fx.killRefund}%。`); }
    if (fx.extraTurn) { this.extraTurn = true; this.floatText(u, '再動', '#a0d8ff'); }
    if (mut.selfHeal) this.heal(u, mut.selfHeal);
    await sleep(250);
  }

  // 對一個單位套用技能效果，回傳造成的傷害
  async applyFx(u, t, fx, mut) {
    let dealt = 0;
    if (fx.dmg || fx.dmgRand) {
      for (let i = 0; i < (fx.hits || 1); i++) {
        if (t.gone || t.soul) break;
        let m = fx.dmgRand ? fx.dmgRand[0] + Math.random() * (fx.dmgRand[1] - fx.dmgRand[0]) : fx.dmg;
        if (fx.lowHpBonus && t.hp < t.maxHp / 2) m *= 1.5;
        if (u.blind > 0 && Math.random() < 0.5) { this.floatText(t, '落空', '#ffe070'); await sleep(200); continue; }
        const d = this.calcDamage(u, t, m);
        await this.damage(t, d, u);
        dealt += d;
        if (u.isPlayer) this.onHitStatus(t);
      }
    }
    if (fx.fixed && !t.gone && !t.soul) dealt += await this.fixedDamage(t, fx.fixed, u, '#e0c0ff');
    if (fx.abyssDmg && !t.gone && !t.soul) dealt += await this.fixedDamage(t, fx.abyssDmg + this.abyss * 2, u, '#70e0c0');
    if (fx.banish && !t.gone && !t.soul) {
      if (t.boss) dealt += await this.fixedDamage(t, 8, u, '#7fbf7f');
      else {
        t.gone = true; this.kills++; this.expGained += t.exp;
        this.ui.battleLog(`${t.name}走進了樹林，再也沒有回來。`);
        await sleep(300);
      }
    }
    if (fx.execute && !t.gone && !t.soul && !t.boss && t.hp <= t.maxHp * fx.execute) {
      this.ui.battleLog(`${t.name}的名字被劃掉了。`);
      await this.damage(t, t.hp, u, '#ff6060');
    }
    const drain = (fx.drain || 0) + (dealt && (fx.dmg || fx.dmgRand) ? (mut.drain || 0) : 0);
    if (drain && dealt) this.heal(u, Math.max(1, Math.round(dealt * drain)));
    if (t.gone || t.soul) return dealt;

    if (fx.heal) this.heal(t, fx.heal, true);
    if (fx.healRand) this.heal(t, randInt(fx.healRand[0], fx.healRand[1]), true);
    if (fx.shield) { t.shield = Math.max(t.shield, fx.shield); this.floatText(t, '護盾', '#9cf'); }
    if (fx.buffAtk) { t.atk += fx.buffAtk; this.floatText(t, `攻擊+${fx.buffAtk}`, '#ff9a30'); }
    if (fx.cleanse) { t.stunned = 0; t.blind = 0; t.confused = 0; t.cursed = 0; }
    if (fx.stun) { t.stunned = Math.max(t.stunned, t.boss ? 1 : fx.stun); this.floatText(t, '定身', '#ffb0d0'); }
    if (fx.blind) { t.blind = Math.max(t.blind, fx.blind); this.floatText(t, '目盲', '#ffe070'); }
    if (fx.confuse) { t.confused = Math.max(t.confused, fx.confuse); this.floatText(t, '混亂', '#c8a0f0'); }
    if (fx.curse) { t.cursed = Math.max(t.cursed, fx.curse + 1); this.floatText(t, '詛咒', '#d070ff'); }
    if (fx.charm && !t.boss && t.side === 'enemy') {
      t.side = 'ally'; t.charmed = fx.charm; t.confused = 0;
      this.floatText(t, '魅惑', '#ff80c0');
      this.ui.battleLog(`${t.name}倒戈了，轉身替你作戰。`);
    }
    if (fx.push) await this.shove(t, Math.sign(t.x - u.x), Math.sign(t.y - u.y), fx.push);
    if (fx.pull) {
      const dx = Math.sign(u.x - t.x), dy = Math.sign(u.y - t.y);
      await this.shove(t, Math.abs(u.x - t.x) >= Math.abs(u.y - t.y) ? dx : 0, Math.abs(u.x - t.x) >= Math.abs(u.y - t.y) ? 0 : dy, dist(u, t) - 1);
    }
    if (fx.swap && t !== u) {
      const ux = u.x, uy = u.y;
      u.x = t.x; u.y = t.y; t.x = ux; t.y = uy;
      u.flash = 200; t.flash = 200;
      this.floatText(t, '交換', '#c8a0f0');
    }
    await sleep(120);
    return dealt;
  }

  // 推一個單位：撞到牆或別人就停
  async shove(t, dx, dy, n) {
    if (!dx && !dy) { if (Math.abs(dx) + Math.abs(dy) === 0) dy = -1; }
    if (dx && dy) dy = 0; // 只沿一個方向推
    const path = [];
    let x = t.x, y = t.y;
    for (let i = 0; i < n; i++) {
      if (!this.isFree(x + dx, y + dy)) break;
      x += dx; y += dy; path.push({ x, y });
    }
    if (path.length) await this.walk(t, path);
  }

  async reviveDog(u, roar) {
    let dog = this.units.find((o) => o.isCompanion);
    if (!dog) { const spot = this.findFreeTile(u.x, u.y); dog = this.makeCompanion(spot.x, spot.y); this.addUnit(dog); }
    if (dog.gone) { const spot = this.findFreeTile(u.x, u.y); dog.x = spot.x; dog.y = spot.y; dog.gone = false; }
    dog.soul = false; dog.hp = dog.maxHp; dog.flash = 300;
    this.floatText(dog, roar ? '咆哮' : '復活', roar ? '#ff6060' : '#ffe070');
    this.ui.battleLog(roar ? '引魂犬露出了冥犬的樣子。' : '引魂犬重新站了起來。');
    await sleep(250);
    if (roar) for (const e of this.living('enemy').filter((e) => dist(dog, e) <= 2)) await this.fixedDamage(e, roar, u, '#ff6060');
  }

  summonShades(u, { n, rounds }) {
    let made = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (made >= n) break;
      if (!this.isFree(u.x + dx, u.y + dy)) continue;
      const hp = 12;
      this.addUnit({
        id: 'summon_' + this.units.length, side: 'ally', isSummon: true, name: '影子', sprite: 'shade',
        x: u.x + dx, y: u.y + dy, hp, maxHp: hp, atk: Math.max(4, Math.round(u.atk * 0.7)), def: 1, spd: 5, mov: 3,
        range: [1, 1], skills: [], facing: 1, ox: 0, oy: 0, flash: 300, summonTimer: rounds,
      });
      made++;
    }
    this.ui.battleLog(made ? `${made} 個影子從你腳下站了起來。` : '身邊沒有空位，影子出不來。');
  }

  // 落雷：打到水面時，整片相連的水都會導電
  async thunderStrike(tiles, dmg, hitsAllies, source) {
    let total = 0;
    const hit = new Map();
    for (const t of tiles) {
      hit.set(key(t.x, t.y), t);
      if (this.tile(t.x, t.y) === 'water') for (const w of this.waterBody(t.x, t.y)) hit.set(key(w.x, w.y), w);
    }
    for (const t of tiles) this.effects.push({ type: 'bolt', x: t.x, y: t.y, ttl: 350, max: 350 });
    for (const t of hit.values()) this.effects.push({ type: 'spark', x: t.x, y: t.y, ttl: 400, max: 400 });
    this.flashScreen = 200;
    this.shake = 8;
    await sleep(220);
    for (const t of hit.values()) {
      const u = this.unitAt(t.x, t.y);
      if (!u || u.soul) continue;
      if (u.side === 'ally' && !hitsAllies) continue;
      const d = this.adjustTaken(u, dmg);
      total += d;
      await this.damage(u, d, source && u.side === 'enemy' ? source : null, '#ffe040');
    }
    if (!source) this.ui.battleLog('落雷！');
    await sleep(200);
    return total;
  }

  waterBody(sx, sy) {
    const out = [], seen = new Set([key(sx, sy)]), q = [{ x: sx, y: sy }];
    while (q.length) {
      const c = q.shift();
      out.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy, k = key(nx, ny);
        if (!seen.has(k) && this.tile(nx, ny) === 'water') { seen.add(k); q.push({ x: nx, y: ny }); }
      }
    }
    return out;
  }

  // ───────── 電腦控制 ─────────

  // 找一個能打到目標的位置；打不到就盡量靠近
  bestApproach(u, target, range) {
    const reach = this.reachable(u, u.mov);
    let best = null;
    for (const n of reach.values()) {
      const d = Math.abs(n.x - target.x) + Math.abs(n.y - target.y);
      const inRange = d >= range[0] && d <= range[1];
      const score = inRange ? 1000 - n.cost - (range[1] > 1 ? -d : 0) : -d * 10 - n.cost;
      if (!best || score > best.score) best = { ...n, score, inRange };
    }
    return best;
  }

  async enemyTurn(u) {
    const hero = this.hero;
    // 荷魯斯之影：每三回合召喚影子
    if (u.summon && this.round % u.summon.every === 0 && !u.confused) {
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) {
        if (n >= u.summon.count) break;
        if (!this.isFree(u.x + dx, u.y + dy)) continue;
        const m = this.makeEnemy(u.summon.type, u.x + dx, u.y + dy);
        m.exp = 4;
        this.addUnit(m);
        this.floatText(m, '召喚', '#d0a040');
        n++;
      }
      if (n) { this.ui.battleLog(`${u.name}從影子裡拉出了同伴。`); await sleep(400); return; }
    }
    // 紅衣小女孩：一眨眼就站到最虛弱的人旁邊
    if (u.blink && !u.confused) {
      const prey = this.living('ally').sort((a, b) => a.hp - b.hp)[0];
      if (prey) {
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: prey.x + dx, y: prey.y + dy }))
          .filter((p) => this.isFree(p.x, p.y));
        if (spots.length && dist(u, prey) > 1) {
          const p = spots[randInt(0, spots.length - 1)];
          u.flash = 200;
          u.x = p.x; u.y = p.y;
          this.ui.battleLog(`${u.name}不見了……她站在${prey.isPlayer ? '你' : prey.name}旁邊。`);
          await sleep(350);
        }
        if (dist(u, prey) === 1) {
          const d = await this.attack(u, prey, 1.0);
          if (d > 0 && !prey.soul) { prey.cursed = 2; this.floatText(prey, '詛咒', '#d070ff'); }
        }
        return;
      }
    }
    // 搶魂：玩家的靈魂在附近時，有機率去抓
    if (hero.soul && !u.confused && Math.random() < u.grab) {
      const node = this.bestApproach(u, hero, [1, 1]);
      if (node && node.inRange) {
        await this.walk(u, node.path);
        await this.grab(u, hero);
        return;
      }
    }
    // 吞掉引魂犬的靈魂
    const dogSoul = this.units.find((o) => o.isCompanion && o.soul && !o.gone);
    if (dogSoul && !u.confused && dist(u, dogSoul) === 1 && Math.random() < u.grab) {
      await this.grab(u, dogSoul);
      return;
    }
    // 首領的鎖鏈：每三回合把遠處的人拉過來
    if (u.chain && this.round % u.chain.every === 0 && !u.confused) {
      const t = this.living('ally').find((a) => { const d = dist(u, a); return d >= u.chain.range[0] && d <= u.chain.range[1]; });
      if (t) {
        this.ui.battleLog(`${u.name}甩出鎖鏈！`);
        await this.attack(u, t, u.chain.mult);
        if (!t.soul && !t.gone) {
          const nx = t.x + Math.sign(u.x - t.x), ny = t.y + Math.sign(u.y - t.y);
          const tx = Math.abs(u.x - t.x) >= Math.abs(u.y - t.y) ? nx : t.x;
          const ty = Math.abs(u.x - t.x) >= Math.abs(u.y - t.y) ? t.y : ny;
          if (this.isFree(tx, ty)) await this.walk(t, [{ x: tx, y: ty }]);
        }
        return;
      }
    }
    const pool = u.confused ? this.living('enemy').filter((e) => e !== u) : this.living('ally');
    if (!pool.length) return;
    const target = pool.sort((a, b) => dist(u, a) - dist(u, b))[0];
    const node = this.bestApproach(u, target, u.range);
    if (node) await this.walk(u, node.path);
    if (dist(u, target) >= u.range[0] && dist(u, target) <= u.range[1]) {
      await this.attack(u, target, 1.0);
    }
  }

  async companionTurn(u) {
    const hero = this.hero;
    if (hero.soul) {
      const node = this.bestApproach(u, hero, [1, 1]);
      if (node) await this.walk(u, node.path);
      if (dist(u, hero) === 1) { await this.rescue(u, hero); return; }
      return;
    }
    const enemies = this.living('enemy');
    if (!enemies.length) return;
    const target = enemies.sort((a, b) => (dist(u, a) - dist(u, b)) || (a.hp - b.hp))[0];
    const node = this.bestApproach(u, target, u.range);
    if (node) await this.walk(u, node.path);
    if (dist(u, target) === 1) await this.attack(u, target, 1.0);
  }

  // ───────── 畫面 ─────────

  floatText(u, text, color) {
    this.effects.push({ type: 'text', x: u.x, y: u.y, text, color, ttl: 900, max: 900 });
  }

  // 專屬圖：腳底踩在格子下緣，比格子高一點；沒在播動作就站著（防禦時坐著）
  drawArtUnit(g, u, px, py, now, flip, white) {
    let sheet = 'pose', i = u.defending ? 2 : 0;
    const a = u.anim && ART_ANIMS[u.anim.name];
    if (a) {
      let t = now - u.anim.t0;
      const total = a.ms.reduce((m, n) => m + n, 0);
      if (a.loop) t %= total;
      if (t < total) {
        sheet = a.sheet; i = 0;
        while (t >= a.ms[i]) t -= a.ms[i++];
      } else u.anim = null;
    }
    const S = SCALE, cx = px + TILE * S / 2, bottom = py + (TILE + 1) * S;
    const ok = drawArt(g, u.art, sheet, i, cx, bottom, 1, { flip, white });
    // 記號：兩顆小東西從肩膀往頭上飄
    const mark = ok && ART[u.art].mark;
    if (mark) {
      for (let k = 0; k < 2; k++) {
        const p = (now / 1800 + k / 2 + u.x * 0.13) % 1;
        const x = cx + (k ? 20 : -30) + Math.sin(p * 6.3) * 4;
        const y = bottom - 48 - p * 44;
        drawMark(g, mark, x, y, 2, p < 0.2 ? p * 5 : 1 - (p - 0.2) / 0.8);
      }
    }
    return ok;
  }

  draw() {
    const g = this.g;
    const S = SCALE, T = TILE;
    const now = performance.now();
    const dt = this.lastDraw ? now - this.lastDraw : 16;
    this.lastDraw = now;

    g.save();
    g.fillStyle = '#0b0a12';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.shake > 0) {
      g.translate(randInt(-1, 1) * this.shake, randInt(-1, 1) * this.shake);
      this.shake = Math.max(0, this.shake - dt * 0.03);
    }

    // 地形
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const px = x * T * S, py = y * T * S, sz = T * S;
      const t = this.tiles[y][x];
      if (t === 'wall') {
        g.fillStyle = '#2b2735'; g.fillRect(px, py, sz, sz);
        g.fillStyle = '#3a3548';
        for (let r = 0; r < 4; r++) {
          const off = r % 2 ? sz / 2 : 0;
          for (let c = -1; c < 2; c++) g.fillRect(px + off + c * sz / 2 + S, py + r * sz / 4 + S, sz / 2 - 2 * S, sz / 4 - 2 * S);
        }
      } else if (t === 'water') {
        g.fillStyle = '#1c3a5c'; g.fillRect(px, py, sz, sz);
        g.fillStyle = '#2f5f8f';
        const w = Math.floor(now / 400 + x + y) % 4;
        g.fillRect(px + (w * 3 + 1) * S, py + 4 * S, 4 * S, S);
        g.fillRect(px + ((w + 2) % 4 * 3 + 2) * S, py + 11 * S, 4 * S, S);
      } else {
        g.fillStyle = this.theme.floor[(x + y) % 2]; g.fillRect(px, py, sz, sz);
        g.fillStyle = this.theme.speck;
        g.fillRect(px + ((x * 7 + y * 3) % 12) * S, py + ((x * 5 + y * 11) % 12) * S, S * 2, S);
      }
    }

    // 裂縫
    for (const r of this.rifts) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 200);
      g.fillStyle = `rgba(160,90,220,${0.35 + 0.3 * pulse})`;
      g.fillRect(r.x * T * S + 2 * S, r.y * T * S + 2 * S, 12 * S, 12 * S);
      g.fillStyle = '#e0c0ff';
      g.fillRect(r.x * T * S + 7 * S, r.y * T * S + 3 * S, 2 * S, 10 * S);
    }

    // 範圍提示
    if (this.highlights) {
      const c = this.highlights.type === 'move' ? 'rgba(90,160,255,0.28)' : 'rgba(255,80,80,0.35)';
      const b = this.highlights.type === 'move' ? 'rgba(140,200,255,0.8)' : 'rgba(255,140,140,0.9)';
      for (const n of this.highlights.tiles.values()) {
        g.fillStyle = c; g.fillRect(n.x * T * S, n.y * T * S, T * S, T * S);
        g.strokeStyle = b; g.lineWidth = S / 2;
        g.strokeRect(n.x * T * S + S, n.y * T * S + S, T * S - 2 * S, T * S - 2 * S);
      }
    }

    // 雷擊標記
    if (this.marks.length && Math.floor(now / 300) % 2 === 0) {
      for (const m of this.marks) {
        g.fillStyle = 'rgba(255,220,60,0.35)';
        g.fillRect(m.x * T * S, m.y * T * S, T * S, T * S);
        g.fillStyle = '#ffe040';
        const px = m.x * T * S, py = m.y * T * S;
        g.fillRect(px + 8 * S, py + 1 * S, 2 * S, 3 * S);
        g.fillRect(px + 6 * S, py + 4 * S, 4 * S, 2 * S);
        g.fillRect(px + 6 * S, py + 6 * S, 2 * S, 3 * S);
      }
    }

    // 單位（由上往下畫，讓前面的蓋住後面的）
    const sorted = this.units.filter((u) => !u.gone).sort((a, b) => a.y - b.y);
    for (const u of sorted) {
      const bob = u.soul ? Math.sin(now / 250) * 2 : (Math.floor(now / 500 + u.x) % 2);
      const px = (u.x * T + u.ox) * S;
      const py = (u.y * T + u.oy - bob) * S;
      if (u.soul) {
        g.globalAlpha = 0.55 + 0.25 * Math.sin(now / 200);
        g.drawImage(getSprite('soul'), px, py, T * S, T * S);
        g.globalAlpha = 1;
        this.drawLabel(px + T * S / 2, py + 2 * S, String(u.soulTimer), '#a0d8ff');
        continue;
      }
      const white = u.flash > 0 && Math.floor(u.flash / 60) % 2 === 0;
      if (u.flash > 0) u.flash -= dt;
      const flip = u.facing < 0;
      if (u.art && this.drawArtUnit(g, u, px, py, now, flip, white)) {
        // 專屬圖畫好了
      } else if (u.boss) {
        g.drawImage(getSprite(u.sprite, { flip, white }), px - 4 * S, py - 8 * S, (T + 8) * S, (T + 8) * S);
      } else {
        g.drawImage(getSprite(u.sprite, { flip, white }), px, py, T * S, T * S);
      }
      if (u.cursed > 0) { g.fillStyle = 'rgba(200,80,255,0.25)'; g.fillRect(px, py, T * S, T * S); }
      if (u.confused > 0) this.drawLabel(px + T * S / 2, py, '?', '#c8a0f0');
      if (u.stunned > 0) this.drawLabel(px + T * S / 2, py, '…', '#ffb0d0');
      if (u.blind > 0) { g.fillStyle = 'rgba(255,230,120,0.25)'; g.fillRect(px, py, T * S, T * S); }
      if (u.charmed > 0) this.drawLabel(px + T * S / 2, py, '♥', '#ff80c0');
      if (u.mirror) { g.fillStyle = 'rgba(160,216,255,0.35)'; g.fillRect(px, py, T * S, T * S); }
      if (u.shield > 0) { g.strokeStyle = '#ffe070'; g.lineWidth = S / 2; g.strokeRect(px + 2 * S, py + 2 * S, T * S - 4 * S, T * S - 4 * S); }
      if (u.defending) { g.strokeStyle = '#9cf'; g.lineWidth = S; g.strokeRect(px + S, py + S, T * S - 2 * S, T * S - 2 * S); }
      // 血條
      const bw = 12 * S, bx = px + 2 * S, by = (u.y * T + u.oy + 14.5) * S;
      g.fillStyle = '#000'; g.fillRect(bx - S / 2, by - S / 2, bw + S, S * 2);
      g.fillStyle = u.side === 'ally' ? '#5fd35f' : '#e05050';
      g.fillRect(bx, by, Math.max(0, bw * u.hp / u.maxHp), S);
      // 現在輪到誰
      if (this.current === u) {
        // 四個角的黃色框
        g.fillStyle = Math.floor(now / 300) % 2 ? '#ffe070' : '#c8a040';
        const tx = (u.x * T + u.ox) * S, ty = (u.y * T + u.oy) * S, z = T * S, c = 3 * S, w = S;
        g.fillRect(tx, ty, c, w); g.fillRect(tx, ty, w, c);
        g.fillRect(tx + z - c, ty, c, w); g.fillRect(tx + z - w, ty, w, c);
        g.fillRect(tx, ty + z - w, c, w); g.fillRect(tx, ty + z - c, w, c);
        g.fillRect(tx + z - c, ty + z - w, c, w); g.fillRect(tx + z - w, ty + z - c, w, c);
      }
    }

    // 特效
    this.effects = this.effects.filter((e) => (e.ttl -= dt) > 0);
    for (const e of this.effects) {
      const k = e.ttl / e.max;
      const cx = (e.x * T + T / 2) * S, cy = (e.y * T + T / 2) * S;
      if (e.type === 'bolt') {
        g.strokeStyle = k > 0.5 ? '#ffffff' : '#ffe040';
        g.lineWidth = 2 * S;
        g.beginPath();
        let x = cx + randInt(-8, 8), y = 0;
        g.moveTo(x, y);
        while (y < cy) { y += 6 * S; x = cx + randInt(-6, 6) * S * (1 - y / cy); g.lineTo(x, Math.min(y, cy)); }
        g.stroke();
      } else if (e.type === 'wave') {
        g.fillStyle = `rgba(120,200,255,${k * 0.7})`;
        g.fillRect(e.x * T * S, e.y * T * S, T * S, T * S);
      } else if (e.type === 'spark') {
        g.fillStyle = `rgba(255,230,80,${k * 0.6})`;
        g.fillRect(e.x * T * S, e.y * T * S, T * S, T * S);
      } else if (e.type === 'text') {
        const rise = (1 - k) * 10 * S;
        g.globalAlpha = Math.min(1, k * 2);
        this.drawLabel(cx, e.y * T * S - rise + 2 * S, e.text, e.color, 7 * S);
        g.globalAlpha = 1;
      }
    }

    g.restore();
    if (this.flashScreen > 0) {
      g.fillStyle = `rgba(255,255,230,${this.flashScreen / 400})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.flashScreen -= dt;
    }
  }

  drawLabel(x, y, text, color, size = 5 * SCALE) {
    const g = this.g;
    g.font = `bold ${size}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = SCALE * 1.5;
    g.strokeStyle = '#000';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
}

// ───────── 隨機樓層 ─────────

// depth：0 開始；最後一層是首領
function generateFloor(depth, themeId, bossType, withHunter) {
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const isBoss = !!bossType;
  for (let attempt = 0; attempt < 80; attempt++) {
    const g = [];
    for (let y = 0; y < ROWS; y++) g.push(new Array(COLS).fill('.'));
    g[8][2] = 'P'; g[8][4] = 'C';
    const enemies = [];
    const spots = [];
    if (isBoss) {
      g[1][3] = 'B';
      spots.push({ x: 1, y: 0 }, { x: 5, y: 0 });
      enemies.push('wisp', depth >= 4 ? 'husk' : 'shade');
    } else {
      const count = 3 + Math.floor(depth / 2);
      const pool = Object.keys(ENEMY_DEPTH).filter((t) => ENEMY_DEPTH[t] <= depth);
      const free = [];
      for (let y = 0; y <= 1; y++) for (let x = 0; x < COLS; x++) free.push({ x, y });
      free.sort(() => Math.random() - 0.5);
      for (let i = 0; i < count; i++) {
        spots.push(free[i]);
        // 越深越容易抽到新的敵人
        const fresh = pool.filter((t) => ENEMY_DEPTH[t] === depth);
        enemies.push(fresh.length && Math.random() < 0.4 ? fresh[randInt(0, fresh.length - 1)] : pool[randInt(0, pool.length - 1)]);
      }
      if (withHunter) { spots.push(free[count]); enemies.push('hunter'); }
    }
    for (const p of spots) g[p.y][p.x] = 'E';
    const empty = (x, y) => y >= 2 && y <= 7 && g[y][x] === '.';
    // 水池：2×2 或 3×1
    const pools = randInt(theme.water[0], theme.water[1]);
    for (let i = 0; i < pools; i++) {
      const w = Math.random() < 0.5 ? 2 : 3, h = w === 2 ? 2 : 1;
      const ox = randInt(0, COLS - w), oy = randInt(2, 7 - h + 1);
      for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) if (empty(x, y)) g[y][x] = '~';
    }
    // 牆：一格或兩格的柱子
    const walls = randInt(theme.walls[0], theme.walls[1]);
    for (let i = 0; i < walls; i++) {
      const x = randInt(0, COLS - 1), y = randInt(2, 6);
      if (empty(x, y)) g[y][x] = '#';
      if (Math.random() < 0.5 && empty(x, y + 1)) g[y + 1][x] = '#';
    }
    // 確認從玩家出發可以走到每個敵人
    const seen = new Set(['2,8']), q = [{ x: 2, y: 8 }];
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || g[ny][nx] === '#' || seen.has(nx + ',' + ny)) continue;
        seen.add(nx + ',' + ny); q.push({ x: nx, y: ny });
      }
    }
    const ok = [...spots, ...(isBoss ? [{ x: 3, y: 1 }] : [])].every((p) => seen.has(p.x + ',' + p.y));
    if (!ok) continue;
    const boss = isBoss ? BOSSES.find((b) => b.type === bossType) : null;
    return {
      name: isBoss ? `地下 ${depth + 1} 層・${boss.room}` : `地下 ${depth + 1} 層・${theme.name}`,
      theme: theme.id,
      map: g.map((r) => r.join('')),
      enemies,
      boss: bossType || null,
    };
  }
  throw new Error('樓層產生失敗');
}
