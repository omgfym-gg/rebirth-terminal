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
  // hero：本世角色的戰鬥數值；opts：{ faith, form, inheritedSkill, soulExtra, hunter }
  constructor(canvas, ui, floorIndex, hero, opts) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.ui = ui;
    this.floor = FLOORS[floorIndex];
    this.floorIndex = floorIndex;
    this.opts = opts;
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
    if (this.opts.hunter && this.floorIndex === 1) enemyQueue.push('hunter');
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
      id: 'hero', side: 'ally', isPlayer: true, name: '你', sprite: h.sprite,
      x, y, hp: h.hp, maxHp: h.maxHp, atk: h.atk, def: h.def, spd: h.spd, mov: h.mov,
      range: [1, 1], skills, charge: 0, facing: 1,
      ox: 0, oy: 0, flash: 0,
    };
  }

  makeCompanion(x, y) {
    const c = COMPANION;
    return {
      id: 'dog', side: 'ally', isCompanion: true, name: c.name, sprite: c.sprite,
      x, y, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, spd: c.spd, mov: c.mov,
      range: c.range, skills: [], facing: 1, ox: 0, oy: 0, flash: 0,
    };
  }

  makeEnemy(type, x, y) {
    const e = ENEMIES[type];
    return {
      id: type + '_' + this.units.length, type, side: 'enemy', name: e.name, sprite: e.sprite,
      x, y, hp: e.hp, maxHp: e.hp, atk: e.atk, def: e.def, spd: e.spd, mov: e.mov,
      range: e.range, grab: e.grab, boss: !!e.boss, chain: e.chain, exp: e.exp,
      skills: [], facing: -1, ox: 0, oy: 0, flash: 0,
    };
  }

  addUnit(u) {
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
        const step = !ghost && this.tile(nx, ny) === 'water' ? 2 : 1;
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
      this.ui.battleRound(this.round);
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

  async startOfRound() {
    if (this.opts.faith === 'thor' && this.marks.length) {
      await this.thunderStrike(this.marks, 5, true);
      this.marks = [];
    }
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
    // 索爾：每兩回合，在敵人腳下標記雷擊區，下一回合開始時落雷
    if (this.opts.faith === 'thor' && this.round % 2 === 1) {
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
    u.defending = false;
    if (u.cursed > 0) u.cursed--;
    for (const s of u.skills) if (s.cdLeft > 0) s.cdLeft--;
    if (u.side === 'ally' && u.isPlayer) {
      await this.playerTurn(u);
    } else if (u.side === 'ally') {
      await sleep(250);
      await this.companionTurn(u);
    } else {
      await sleep(250);
      await this.enemyTurn(u);
      if (u.confused > 0) u.confused--;
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
      acts.push({ id: 'skill:' + s.id, name: s.cdLeft > 0 ? `${s.name}(${s.cdLeft})` : s.name, ready: s.cdLeft === 0 });
    }
    const ult = FAITHS[this.opts.faith].ult;
    acts.push({ id: 'ult', name: `${ult.name} ${u.charge}%`, ready: u.charge >= 100 });
    const soulNear = this.units.find((o) => o.side === 'ally' && o.soul && !o.gone && dist(o, u) === 1);
    if (soulNear) acts.push({ id: 'rescue', name: '救援', ready: true });
    acts.push({ id: 'defend', name: '防禦', ready: true });
    acts.push({ id: 'wait', name: '結束', ready: true });
    return acts;
  }

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
    } else if (id === 'rescue') {
      for (const a of this.units) if (a.side === 'ally' && a.soul && !a.gone && dist(a, u) === 1) add(a.x, a.y);
    } else if (id === 'ult') {
      const r = FAITHS[this.opts.faith].ult.range;
      if (this.opts.faith === 'thor') {
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
          const d = Math.abs(x - u.x) + Math.abs(y - u.y);
          if (d >= r[0] && d <= r[1] && this.tile(x, y) !== 'wall') add(x, y);
        }
      } else {
        for (const e of this.living('enemy')) { const d = dist(u, e); if (d >= r[0] && d <= r[1]) add(e.x, e.y); }
      }
    } else if (id.startsWith('skill:')) {
      const s = u.skills.find((k) => 'skill:' + k.id === id);
      if (s.target === 'ally') {
        for (const a of this.living('ally')) { const d = dist(u, a); if (d >= s.range[0] && d <= s.range[1]) add(a.x, a.y); }
      } else {
        for (const e of this.living('enemy')) { const d = dist(u, e); if (d >= s.range[0] && d <= s.range[1]) add(e.x, e.y); }
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
    if (id === 'attack') {
      await this.attack(u, target, 1.0);
    } else if (id === 'rescue') {
      await this.rescue(u, target);
    } else if (id === 'ult') {
      u.charge = 0;
      await this.ultimate(u, x, y);
    } else if (id.startsWith('skill:')) {
      const s = u.skills.find((k) => 'skill:' + k.id === id);
      s.cdLeft = s.cd + 1;
      await this.useSkill(u, s, target);
    }
  }

  // ───────── 行動 ─────────

  async walk(u, path) {
    for (const step of path) {
      if (step.x !== u.x) u.facing = step.x > u.x ? 1 : -1;
      const fx = u.x, fy = u.y;
      await tween(90, (t) => { u.ox = (step.x - fx) * TILE * t; u.oy = (step.y - fy) * TILE * t; });
      u.x = step.x; u.y = step.y; u.ox = 0; u.oy = 0;
    }
  }

  async lunge(u, target) {
    if (target.x !== u.x) u.facing = target.x > u.x ? 1 : -1;
    const dx = Math.sign(target.x - u.x) * 5, dy = Math.sign(target.y - u.y) * 5;
    await tween(80, (t) => { u.ox = dx * t; u.oy = dy * t; });
    await tween(100, (t) => { u.ox = dx * (1 - t); u.oy = dy * (1 - t); });
  }

  calcDamage(att, def, mult) {
    let dmg = Math.round(att.atk * mult) - def.def + randInt(-1, 1);
    dmg = Math.max(1, dmg);
    if (def.cursed > 0) dmg = Math.round(dmg * 1.5);
    if (def.defending) dmg = Math.ceil(dmg / 2);
    return dmg;
  }

  async attack(att, def, mult, extra = {}) {
    await this.lunge(att, def);
    if (att.side === 'enemy' && def.side === 'ally' && this.opts.faith === 'loki' && Math.random() < 0.25) {
      this.floatText(def, '幻影', '#c8a0f0');
      this.ui.battleLog(`${att.name}打中的只是${def.name === '你' ? '你' : def.name}的幻影。`);
      await sleep(250);
      return 0;
    }
    const dmg = this.calcDamage(att, def, mult);
    await this.damage(def, dmg, att);
    if (extra.drain) this.heal(att, Math.max(1, Math.round(dmg * extra.drain)));
    if (extra.selfHeal) this.heal(att, extra.selfHeal);
    return dmg;
  }

  async damage(u, dmg, source, color = '#fff') {
    if (u.gone || u.soul) return;
    u.hp -= dmg;
    u.flash = 160;
    this.shake = Math.min(8, 2 + dmg / 3);
    this.floatText(u, '-' + dmg, color);
    if (source && source.isPlayer) source.charge = Math.min(100, (source.charge || 0) + 25);
    if (u.isPlayer) u.charge = Math.min(100, u.charge + 15);
    await sleep(200);
    if (u.hp <= 0) await this.down(u, source);
  }

  heal(u, amount) {
    if (u.gone || u.soul) return;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    if (u.hp > before) this.floatText(u, '+' + (u.hp - before), '#7f7');
  }

  async down(u, source) {
    if (u.side === 'enemy') {
      u.gone = true;
      this.kills++;
      this.expGained += u.exp;
      this.ui.battleLog(`${u.name}倒下了。`);
      if (source && source.isPlayer && this.opts.form === 'demon') this.heal(source, 4);
      return;
    }
    u.hp = 0;
    u.soul = true;
    u.cursed = 0;
    let timer = 3;
    if (u.isPlayer) timer += this.opts.soulExtra || 0;
    if (!u.isPlayer && this.opts.form === 'angel') timer += 2;
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

  async useSkill(u, s, target) {
    const mut = s.mutation || {};
    if (s.kind === 'dmg') {
      await this.attack(u, target, s.mult, { drain: (s.drain || 0) + (mut.drain || 0), selfHeal: mut.selfHeal });
    } else if (s.kind === 'heal') {
      await this.lunge(u, target);
      this.heal(target, s.amount);
      if (mut.drain) this.heal(u, 2);
      await sleep(250);
    } else if (s.kind === 'curse') {
      await this.lunge(u, target);
      target.cursed = 3;
      this.floatText(target, '詛咒', '#d070ff');
      if (mut.selfHeal) this.heal(u, mut.selfHeal);
      await sleep(250);
    }
  }

  async ultimate(u, x, y) {
    if (this.opts.faith === 'thor') {
      this.ui.battleLog('雷神之鎚！');
      const tiles = [{ x, y }, { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
        .filter((t) => this.inBounds(t.x, t.y) && this.tile(t.x, t.y) !== 'wall');
      await this.thunderStrike(tiles, 10, false, u);
    } else {
      const t = this.unitAt(x, y);
      this.ui.battleLog(`惡作劇！${t.name}看不清楚誰是同伴了。`);
      await this.lunge(u, t);
      t.confused = 2;
      this.floatText(t, '混亂', '#c8a0f0');
      await this.damage(t, 4, u, '#c8a0f0');
    }
  }

  // 落雷：打到水面時，整片相連的水都會導電
  async thunderStrike(tiles, dmg, hitsAllies, source) {
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
      await this.damage(u, dmg, source && u.side === 'enemy' ? source : null, '#ffe040');
    }
    if (!source) this.ui.battleLog('落雷！');
    await sleep(200);
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
        g.fillStyle = (x + y) % 2 ? '#1d1a26' : '#211e2b'; g.fillRect(px, py, sz, sz);
        g.fillStyle = '#28243a';
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
      if (u.boss) {
        g.drawImage(getSprite(u.sprite, { flip, white }), px - 4 * S, py - 8 * S, (T + 8) * S, (T + 8) * S);
      } else {
        g.drawImage(getSprite(u.sprite, { flip, white }), px, py, T * S, T * S);
      }
      if (u.cursed > 0) { g.fillStyle = 'rgba(200,80,255,0.25)'; g.fillRect(px, py, T * S, T * S); }
      if (u.confused > 0) this.drawLabel(px + T * S / 2, py, '?', '#c8a0f0');
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
