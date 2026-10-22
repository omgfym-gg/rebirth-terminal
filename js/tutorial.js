'use strict';
// 新手教學：第一次走到某個畫面或狀況時跳出一張說明卡，看過就不再出現。
// 看過的記錄跟存檔分開放，開新的靈魂也不會重看；標題畫面可以重看。

const TIPS_KEY = 'rebirth-terminal-tips-v1';

const TIPS = {
  rebirth: { title: '轉生櫃台', lines: [
    '① 先選一條路：升仙（神使）、入魔（惡魔）或為人（人類）。三條路的生命、攻擊、防禦、速度不一樣。',
    '② 再從下面三個職業挑一個。每個職業有 1 個被動、2 個技能和 1 個大招，卡片上都寫著效果。',
    '③ 選好之後按最下面的「轉生」就會投胎。',
  ] },
  town: { title: '邊境城鎮', lines: [
    '這裡顯示你這一世的數值和職業技能。',
    '準備好就按「進入地城」。地城一共 5 層，每層打一場仗，最底層有首領。',
    '打贏可以升級；在地城裡死掉，這一世就結束，回到靈魂結算終端。',
  ] },
  battle: { title: '戰鬥怎麼玩', lines: [
    '戰鬥是回合制，速度快的先動。輪到你時，你身上會有黃色的框。',
    '藍色格子是走得到的地方，點一下就移動。每回合可以先移動，再做一個行動。',
    '下面的按鈕是行動：攻擊打相鄰的敵人，技能的效果寫在按鈕下面，按「結束」就換下一個人。',
    '黑色的小狗是你的夥伴引魂犬，牠會自己行動。',
  ] },
  target: { title: '選目標', lines: [
    '紅色格子是這招打得到的位置，點紅色格子就會出招。',
    '想換別招，就再按一次同一個按鈕取消。',
  ] },
  cooldown: { title: '冷卻', lines: [
    '技能用過以後要等幾回合才能再用，按鈕上括號裡的數字就是還要等幾回合。',
  ] },
  ult: { title: '大招準備好了', lines: [
    '攻擊、被打都會累積能量（神族叫神力、魔族叫魔力、人類叫信仰）。滿 100% 時大招按鈕會發光。',
    '大招威力很大，看準時機用。',
  ] },
  soul: { title: '你變成靈魂了', lines: [
    '生命歸零不會馬上死，你會變成一顆靈魂，頭上的數字是還能撐幾回合。',
    '靈魂可以移動：等夥伴走到旁邊按「救援」就能復活；飄到紫色裂縫可以逃走，這一世會保住。',
    '小心，敵人也會來搶你的靈魂。時間到或被搶走，這一世就結束。',
  ] },
  terminal: { title: '死亡不是結束', lines: [
    '每一世結束都會回到這裡。這一世的戰績會換成靈魂碎片。',
    '碎片可以買永久強化，下一世也有效。',
    '然後前往轉生櫃台開始下一世，還可以從前世帶走一個技能，技能會依照新的生命形態變異。',
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
