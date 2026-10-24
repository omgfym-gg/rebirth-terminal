'use strict';
// 新手教學：第一次走到某個畫面或狀況時跳出一張說明卡，看過就不再出現。
// 看過的記錄跟存檔分開放，開新的靈魂也不會重看；標題畫面可以重看。

const TIPS_KEY = 'rebirth-terminal-tips-v1';

const TIPS = {
  rebirth: { title: '轉生櫃台', lines: [
    '① 先選一條路：升仙只能當神族、入魔只能當魔族；為人兩族都能選，神器邪物都能穿，但生命少一點。',
    '② 再從三位神魔裡挑「今世的你」。每位神魔的等級永久保留，死了也不掉。',
    '③ 隊友是「前世之影」：你死過的每一世都會變成影子陪你上場。第一世還沒有前世，終端會派兩位同事來幫忙。',
    '④ 按「轉生，出發爬塔」。一世是十層的塔，全隊倒下或爬到頂，這一世就結束。',
  ] },
  terminal: { title: '死亡不是結束', lines: [
    '每一世結束都會回到這裡。爬了幾層、打倒幾隻，會換成靈魂碎片。',
    '碎片可以在靈魂商店買永久強化，之後每一世都有效。',
    '打倒精英、魔王拿到的裝備只屬於那一世，轉生就清空。剛結束的這一世，會變成下一世可以帶上場的前世之影（一樣空手上場）。',
  ] },
};

const Tutorial = {
  seen: null,
  queue: [],
  load() {
    if (this.seen) return;
    try { this.seen = JSON.parse(localStorage.getItem(TIPS_KEY)) || {}; } catch (e) { this.seen = {}; }
  },
  save() { try { localStorage.setItem(TIPS_KEY, JSON.stringify(this.seen)); } catch (e) { /* 存不了就算了 */ } },
  reset() { this.seen = {}; this.save(); },
  // 第一次遇到才顯示；同時有好幾張就排隊
  tip(id) {
    this.load();
    if (this.seen[id] || !TIPS[id] || this.queue.includes(id)) return;
    this.queue.push(id);
    if (this.queue.length === 1) this.render();
  },
  render() {
    const id = this.queue[0];
    if (!id) return;
    const t = TIPS[id];
    const box = el('div', { class: 'tip-overlay' },
      el('div', { class: 'tip-card' },
        el('div', { class: 'tip-title' }, '新手教學・' + t.title),
        ...t.lines.map((l) => el('p', {}, l)),
        el('button', { class: 'btn primary wide', onclick: () => {
          this.seen[id] = true; this.save();
          box.remove(); this.queue.shift(); this.render();
        } }, '知道了')));
    document.body.append(box);
  },
};
