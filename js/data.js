// 遊戲資料：生命形態、技能、神魔、敵人、地圖、常客、隱藏真相
'use strict';

const FORMS = {
  human: {
    name: '人類', sprite: 'human',
    hp: 30, atk: 7, def: 3, spd: 5, mov: 3,
    skills: ['slash', 'stone'],
    innate: '未定之人：繼承技能時，可以從所有前世的技能裡挑選',
    allowed: () => true,
  },
  angel: {
    name: '神使', sprite: 'angel',
    hp: 26, atk: 5, def: 3, spd: 5, mov: 3,
    skills: ['heal', 'lightbolt'],
    innate: '代禱：隊友變成靈魂時，可以多撐 2 回合',
    allowed: (nature) => nature <= 20,
    lockText: '靈魂太偏混沌',
  },
  demon: {
    name: '惡魔', sprite: 'demon',
    hp: 28, atk: 8, def: 2, spd: 6, mov: 3,
    skills: ['claw', 'curse'],
    innate: '吞噬：擊倒敵人時回復 4 點生命',
    allowed: (nature) => nature >= -20,
    lockText: '靈魂太偏秩序',
  },
};

// kind: dmg 傷害 / heal 治療 / curse 詛咒
// range: [最小, 最大]（曼哈頓距離），target: enemy / ally
const SKILLS = {
  slash:     { name: '斬擊', kind: 'dmg', mult: 1.5, range: [1, 1], cd: 2, target: 'enemy', desc: '近身重擊' },
  stone:     { name: '投石', kind: 'dmg', mult: 0.8, range: [2, 3], cd: 1, target: 'enemy', desc: '遠距離攻擊' },
  heal:      { name: '治癒', kind: 'heal', amount: 9, range: [0, 2], cd: 2, target: 'ally', desc: '回復自己或隊友 9 點生命' },
  lightbolt: { name: '光矢', kind: 'dmg', mult: 1.0, range: [2, 3], cd: 1, target: 'enemy', desc: '遠距離光屬性攻擊' },
  claw:      { name: '裂爪', kind: 'dmg', mult: 1.3, range: [1, 1], cd: 2, target: 'enemy', drain: 0.5, desc: '近身攻擊，吸取一半傷害' },
  curse:     { name: '詛咒', kind: 'curse', range: [1, 3], cd: 3, target: 'enemy', desc: '目標 2 回合內受到的傷害加五成' },
};

// 前世技能帶到新的形態時會變異
const MUTATION = {
  human: { prefix: '', note: '原樣繼承' },
  angel: { prefix: '聖', note: '使用後自己回復 3 點生命', selfHeal: 3 },
  demon: { prefix: '血', note: '額外吸取三成傷害', drain: 0.3 },
};

const FAITHS = {
  thor: {
    name: '索爾', side: '神', domain: '雷霆領域',
    passive: '每兩回合在敵人腳下標記雷擊區，下一回合落雷。水面會把雷導開。',
    ult: { name: '雷神之鎚', range: [1, 3], desc: '目標與周圍四格造成 10 點雷擊傷害，打到水面會擴散' },
  },
  loki: {
    name: '洛基', side: '魔', domain: '詭計領域',
    passive: '敵人攻擊我方時，有四分之一的機率只打到幻影。',
    ult: { name: '惡作劇', range: [1, 4], desc: '目標陷入混亂 2 回合，會去攻擊自己的同伴，並受到 4 點傷害' },
  },
};

const ENEMIES = {
  shade:  { name: '影子怪',   sprite: 'shade',  hp: 12, atk: 5, def: 1, spd: 4, mov: 3, range: [1, 1], exp: 10, grab: 0.4 },
  wisp:   { name: '鬼火',     sprite: 'wisp',   hp: 8,  atk: 4, def: 0, spd: 6, mov: 2, range: [2, 3], exp: 10, grab: 0.1 },
  husk:   { name: '空殼職員', sprite: 'husk',   hp: 18, atk: 6, def: 2, spd: 3, mov: 2, range: [1, 1], exp: 14, grab: 0.8 },
  hunter: { name: '追殺者',   sprite: 'hunter', hp: 20, atk: 7, def: 2, spd: 6, mov: 4, range: [1, 1], exp: 20, grab: 1.0 },
  boss:   { name: '無臉典獄長', sprite: 'boss', hp: 60, atk: 9, def: 3, spd: 4, mov: 2, range: [1, 1], exp: 60, grab: 1.0, boss: true,
            chain: { range: [2, 3], every: 3, mult: 1.0 } },
};

const COMPANION = { name: '引魂犬', sprite: 'dog', hp: 20, atk: 5, def: 2, spd: 7, mov: 4, range: [1, 1] };

// 地圖：# 牆、~ 水、. 地板、P 玩家、C 引魂犬、E 敵人、B 首領
const FLOORS = [
  {
    name: '地城一層：迴廊',
    map: [
      '.E.E.E.',
      '.......',
      '..#....',
      '..#.~~.',
      '....~~.',
      '.~~....',
      '.~~.#..',
      '.......',
      '..P.C..',
    ],
    enemies: ['shade', 'shade', 'shade'],
  },
  {
    name: '地城二層：積水的檔案室',
    map: [
      '.E.E.E.',
      '...E...',
      '#.....#',
      '..~~~..',
      '..~#~..',
      '..~~~..',
      '#.....#',
      '.......',
      '..P.C..',
    ],
    enemies: ['shade', 'wisp', 'shade', 'husk'],
  },
  {
    name: '地城三層：典獄長的房間',
    map: [
      '.E...E.',
      '...B...',
      '.#...#.',
      '.~...~.',
      '.~...~.',
      '.#...#.',
      '.......',
      '.......',
      '..P.C..',
    ],
    enemies: ['wisp', 'wisp'],
    boss: 'boss',
  },
];

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
