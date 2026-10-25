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
  soul: { title: '靈魂', lines: [
    '神魔生命歸零不會馬上消失，會變成一顆發藍光的靈魂留在原地。',
    '輪到其他隊友時，讓這一招的線穿過靈魂（畫圈的話圈住也算），出招就把他救回來，生命回一半。',
    '靈魂頭上寫著還剩幾輪，倒數完沒人救就會「魂散」。',
  ] },
  faded: { title: '魂散', lines: [
    '靈魂撐不住散掉了，他這一層不能再上場。',
    '別擔心，打完這一層他會回來，帶著三成生命繼續爬塔。',
  ] },
  seize: { title: '搶魂', lines: [
    '有些敵人會搶魂（影子怪、空殼職員、姑獲鳥、追債人）。頭上寫「搶魂」的，這一輪會走去把靈魂抓走。',
    '趁他動手之前，先畫線把靈魂救回來，或先把他打倒。',
  ] },
  sealed: { title: '封印', lines: [
    '靈魂被敵人抓走封印了，敵人身上會多一個「魂」字。',
    '2 輪內把那隻敵人打倒，靈魂就會放出來，回三成生命（敵人身上會寫還剩幾輪）。',
    '來不及的話，他會帶著靈魂逃走，那位神魔這一世都不能再上場。',
  ] },
  debt: { title: '因果債', lines: [
    '直接把敵人帶走（引魂、吞掉這類斬殺）、穿著邪物過一層、在岔路或常客劇情選「利用」，都會欠下因果債。',
    '債到 5 點，追債人會在第 4 層等你；到 10 點，第 7 層也會來。',
    '還債：在靈界花碎片還（每點 5 碎片）、打倒追債人（-5）、壽終正寢（-3）。',
  ] },
  debtor: { title: '追債人', lines: [
    '因果債欠太多，追債人找上門了。他專挑生命最少的打，打到不到三成就直接把魂抽走。',
    '倒下隊友的靈魂他也會搶。打倒他，被抓走的靈魂就會放出來，債 -5，還會掉一件裝備。',
  ] },
  nature: { title: '靈魂本質', lines: [
    '靈魂本質從秩序（-100）到混沌（100），只看你做過的事：幫忙往秩序走，利用、直接帶走敵人往混沌走，用碎片還債也會往秩序走。',
    '偏混沌超過 20 不能升仙，偏秩序超過 20 不能入魔，為人永遠可以選。',
    '偏得深有加成：秩序 -30 以下升仙多一位可選、生命 +10%；混沌 30 以上入魔多一位可選、傷害 +10%；保持中立（-9 到 9）為人生命只少半成。',
  ] },
  locked: { title: '路被鎖住了', lines: [
    '你的靈魂本質偏得太多，有一條路走不了。',
    '想再走那條路，就多做相反的事把本質拉回來，例如還債、在劇情裡選「幫忙」。',
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
