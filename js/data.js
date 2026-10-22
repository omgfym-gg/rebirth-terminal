// 遊戲資料：生命形態、技能、神魔、敵人、地圖、常客、隱藏真相
'use strict';

// 轉生櫃台的三條路：升仙、入魔、為人
const PATH_ORDER = ['angel', 'demon', 'human'];

// 人類的叫「信仰」，升仙、入魔的叫「職業」
const faithLabel = (form) => (form === 'human' ? '信仰' : '職業');

const FORMS = {
  human: {
    name: '人類', path: '為人', pathDesc: '留在人間。神族、魔族都能信仰', side: null, sprite: 'human',
    hp: 30, atk: 7, def: 3, spd: 5, mov: 3,
    innate: '未定之人：繼承技能時，可以從所有前世的技能裡挑選',
    allowed: () => true,
  },
  angel: {
    name: '神使', path: '升仙', pathDesc: '成為神使，擔任神族職業', side: '神', sprite: 'angel',
    hp: 26, atk: 5, def: 3, spd: 5, mov: 3,
    innate: '代禱：隊友變成靈魂時，可以多撐 2 回合',
    allowed: (nature) => nature <= 20,
    lockText: '靈魂太偏混沌',
  },
  demon: {
    name: '惡魔', path: '入魔', pathDesc: '墮為惡魔，擔任魔族職業', side: '魔', sprite: 'demon',
    hp: 28, atk: 8, def: 2, spd: 6, mov: 3,
    innate: '吞噬：擊倒敵人時回復 4 點生命',
    allowed: (nature) => nature >= -20,
    lockText: '靈魂太偏秩序',
  },
};

const ENEMIES = {
  shade:   { name: '影子怪',     sprite: 'shade',   hp: 12, atk: 5, def: 1, spd: 4, mov: 3, range: [1, 1], exp: 10, grab: 0.4 },
  wisp:    { name: '鬼火',       sprite: 'wisp',    hp: 8,  atk: 4, def: 0, spd: 6, mov: 2, range: [2, 3], exp: 10, grab: 0.1 },
  husk:    { name: '空殼職員',   sprite: 'husk',    hp: 18, atk: 6, def: 2, spd: 3, mov: 2, range: [1, 1], exp: 14, grab: 0.8 },
  redgirl: { name: '紅衣小女孩', sprite: 'redgirl', hp: 10, atk: 5, def: 1, spd: 7, mov: 0, range: [1, 1], exp: 16, grab: 0.5, blink: true },
  mirror:  { name: '鏡中人',     sprite: 'mirror',  hp: 16, atk: 0, def: 0, spd: 5, mov: 3, range: [1, 1], exp: 18, grab: 0.6, copy: true },
  hunter:  { name: '追殺者',     sprite: 'hunter',  hp: 20, atk: 7, def: 2, spd: 6, mov: 4, range: [1, 1], exp: 20, grab: 1.0 },
  boss:    { name: '無臉典獄長', sprite: 'boss',    hp: 60, atk: 9, def: 3, spd: 4, mov: 2, range: [1, 1], exp: 60, grab: 1.0, boss: true,
             chain: { range: [2, 3], every: 3, mult: 1.0 } },
  horus:   { name: '荷魯斯之影', sprite: 'horus',   hp: 64, atk: 8, def: 2, spd: 5, mov: 2, range: [1, 2], exp: 60, grab: 1.0, boss: true,
             summon: { every: 3, type: 'shade', count: 2 } },
};

// 敵人在第幾層以後才會出現
const ENEMY_DEPTH = { shade: 0, wisp: 0, husk: 1, redgirl: 2, mirror: 3 };

const COMPANION = { name: '引魂犬', sprite: 'dog', hp: 20, atk: 5, def: 2, spd: 7, mov: 4, range: [1, 1] };

const DUNGEON_DEPTH = 5; // 最後一層是首領

// 每層的場景主題：地板顏色、牆和水的多寡
const THEMES = [
  { id: 'corridor', name: '迴廊',             floor: ['#1d1a26', '#211e2b'], speck: '#28243a', walls: [3, 5], water: [0, 1] },
  { id: 'archive',  name: '積水的檔案室',     floor: ['#18202a', '#1b2430'], speck: '#26334a', walls: [2, 4], water: [2, 3] },
  { id: 'office',   name: '沒有人的辦公室',   floor: ['#2a1a1e', '#2e1d22'], speck: '#3e262c', walls: [4, 6], water: [0, 0] },
  { id: 'morgue',   name: '停屍間',           floor: ['#1c2422', '#202826'], speck: '#2c3834', walls: [3, 6], water: [0, 1] },
  { id: 'shaft',    name: '電梯井',           floor: ['#1a1a1a', '#1f1f1f'], speck: '#2c2c2c', walls: [6, 8], water: [0, 1] },
  { id: 'garden',   name: '淹水的空中花園',   floor: ['#18241c', '#1c2a20'], speck: '#28402e', walls: [1, 3], water: [2, 4] },
];

const BOSSES = [
  { type: 'boss',  room: '典獄長的房間' },
  { type: 'horus', room: '荷魯斯之影的祭壇' },
];

// 每層之間的隨機事件
const EVENTS = {
  rest:   { name: '營火',       desc: '坐下來休息。回復四成生命。' },
  altar:  { name: '血祭壇',     desc: '獻上目前生命的四分之一，這一世攻擊 +1。' },
  lost:   { name: '迷途的靈魂', desc: '一個找不到出口的靈魂拉住你的衣角。' },
  chest:  { name: '上鎖的箱子', desc: '可能是寶物，也可能是陷阱。' },
  spring: { name: '靈泉',       desc: '引魂犬回到你身邊，你回復兩成生命。' },
};

// 常客：每一世死後在終端遇到一幕
// effect 的鍵：frag 靈魂碎片、debt 因果債、nature 靈魂本質、boon 祝福
const REGULARS = {
  zhang: {
    name: '張醫師', sprite: 'doctor', place: '終端地下一樓・急診室',
    acts: [
      {
        lines: [
          '「新來的？先躺下，我看看。」',
          '他把聽診器貼在你胸口，聽了很久。',
          '「生命體徵……歸零。別緊張，這棟樓裡每個人都是。」',
          '「我值夜班。病人一個接一個進來，我只想讓他們都撐過去。」',
          '他抬頭看你：「你可以幫我壓住三號床的病人嗎？他一直想下床。」',
        ],
        choices: {
          help: { label: '幫忙壓住病人', result: '三號床的病人一直盯著張醫師的臉看。張醫師說謝謝，順手幫你的靈魂「縫」了一針。', effect: { nature: -10, boon: 'soulExtra' } },
          hold: { label: '保留，不插手', result: '你站在一旁。三號床的病人沒有下床，只是一直在笑。', effect: {} },
          use:  { label: '趁亂拿走藥櫃裡的東西', result: '藥櫃裡沒有藥，只有一疊寫著你名字的病歷。你把它們換成了靈魂碎片。', effect: { frag: 8, debt: 2, nature: 10 } },
        },
      },
      {
        lines: [
          '張醫師坐在走廊的長椅上，白袍上多了一塊褪不掉的污漬。',
          '「三號床那個病人，今天對我說了一句話。」',
          '「他說：『你終於來交班了。』」',
          '「……那張臉我認得。我每天早上在鏡子裡看到。」',
          '「你說，我是不是在等一個永遠不會來的人？」',
        ],
        choices: {
          help: { label: '陪他等到交班時間', result: '你們一起等。牆上的鐘停在四點零七分，沒有人來。張醫師說：「謝謝你沒走。」', effect: { nature: -10, frag: 3 } },
          hold: { label: '什麼都不說', result: '他點點頭，好像本來就沒期待你回答。', effect: {} },
          use:  { label: '告訴他「我就是來交班的」', result: '他愣住，然後把聽診器交給你。那一瞬間，你聽見好多人在呼吸。', effect: { frag: 10, debt: 2, nature: 10 } },
        },
      },
    ],
  },
  kai: {
    name: '阿凱', sprite: 'courier', place: '終端一樓・電梯口',
    acts: [
      {
        lines: [
          '一個穿黃色外送外套的年輕人在電梯口來回踱步。',
          '「不好意思！請問這裡是……結算終端嗎？」',
          '「我這單快超時了。收件地址寫的是這棟樓，可是電梯一直不來。」',
          '他把手機給你看。訂單已經超時一千多天。',
          '「拜託，可以幫我看一下電梯嗎？我不能再遲到了。」',
        ],
        choices: {
          help: { label: '陪他找樓梯', result: '你們爬了很久的樓梯。阿凱說：「下次換我幫你送東西過去，什麼都可以。」', effect: { nature: -10, boon: 'parcel' } },
          hold: { label: '保留，不插手', result: '電梯門開了又關，裡面沒有人。阿凱繼續等。', effect: {} },
          use:  { label: '幫他簽收，順便拿走小費', result: '他鬆了一口氣，把整包小費給你。保溫箱裡的東西，你沒有打開看。', effect: { frag: 8, debt: 2, nature: 10 } },
        },
      },
      {
        lines: [
          '阿凱坐在電梯裡，門一直開著。',
          '「我想起來了。我三年前……就是在這部電梯裡倒下的。」',
          '「可是單還沒送完啊。最後一單的地址，是 13 樓。」',
          '他按著按鈕面板。最上面那顆是 12。',
          '「這棟樓沒有 13 樓，對吧？」',
        ],
        choices: {
          help: { label: '「我陪你找 13 樓」', result: '他笑了，很像活著的時候那樣笑。按鈕面板上，12 的上面多了一道很淡的刮痕。', effect: { nature: -10, frag: 3 } },
          hold: { label: '不回答', result: '電梯門終於關上。你聽見它往上，一直往上。', effect: {} },
          use:  { label: '「你送錯地方了，把東西給我吧」', result: '他把保溫箱交給你。收件人欄位寫的是你的名字。', effect: { frag: 10, debt: 2, nature: 10 } },
        },
      },
    ],
  },
};

const REGULAR_ORDER = ['zhang', 'kai'];

const TRUTHS = {
  A: { title: '承包制', text: ['你在人間簽過一份《彈性責任同意書》。', '死亡是合約裡的一條條款，轉生是續約。', '想要解約離開輪迴，可以。', '代價是你所有的前世記憶。'] },
  B: { title: '替身', text: ['這個靈魂本來不是你的。', '你只是上一任的替身，被放進來補位。', '原主人一直躲在終端深處，看著你一世一世替他累積力量。', '今天，他回來拿回自己的位置了。'] },
  C: { title: '輪迴資遣', text: ['你以為這是你的第一世。', '其實每次任期結束，你都被資遣，記憶也被洗掉。', '地城裡那些不知道是誰的殘魂和雕像，', '全部都是你。'] },
  D: { title: '飼料', text: ['你每一世累積的因果，不管善惡，都被收割走了。', '神與魔不是在打仗，他們是牧羊犬。', '真正在吃東西的，是終端頂樓的董事會。', '你，是飼料。'] },
  E: { title: '查無此人', text: ['終端的名冊裡，查無此人。', '你根本沒有死。你躺在某間醫院裡，昏迷了很久。', '你在地城裡聽見的那些聲音，是你的家人在床邊說話。', '你可以留下，也可以醒來。'] },
  F: { title: '死對頭才是同事', text: ['一直追殺你的那個人，也是轉生者。', '你們的仇恨，是董事會寫好的劇本。', '他和你一樣，一世一世被安排來互相殺死。', '這一次，你們可以一起逃走。'] },
};

// 神器：打倒首領取得，存進靈魂倉庫；轉生時可以喚醒一件帶著走
const RELICS = {
  chain:   { name: '典獄長的鎖鏈', from: 'boss',  desc: '攻擊 +2',                           atk: 2 },
  lantern: { name: '藍火提燈',     from: 'boss',  desc: '最大生命 +8',                       hp: 8 },
  key:     { name: '無臉者的鑰匙', from: 'boss',  desc: '變成靈魂時多撐 1 回合，防禦 +1',     soul: 1, def: 1 },
  eye:     { name: '荷魯斯之眼',   from: 'horus', desc: '每場戰鬥開始時，大招已經充好一半',   charge: 50 },
  badge:   { name: '黑沙工牌',     from: 'horus', desc: '防禦 +2',                           def: 2 },
  feather: { name: '鷹羽',         from: 'horus', desc: '移動 +1，速度 +2',                  mov: 1, spd: 2 },
};
