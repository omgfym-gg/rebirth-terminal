// 60 位神魔的職業／信仰：每位一個被動、兩個主動技能、一個大招
// 技能格式：n 名稱、t 目標（enemy 敵人／ally 我方／tile 格子／self 自己）、r 距離、cd 冷卻、
//          a 範圍（single 單體／cross 十字／r1~r3 周圍幾格／all 全場）、who 範圍內影響誰、fx 效果
'use strict';

// 大招能量的名字：神使叫神力、惡魔叫魔力、人類靠的是信仰
const GAUGE = { angel: '神力', demon: '魔力', human: '信仰' };
const gaugeName = (form) => GAUGE[form] || '能量';

const E = (n, r, cd, fx, more) => ({ n, t: 'enemy', r, cd, fx, ...more });
const A = (n, r, cd, fx) => ({ n, t: 'ally', r, cd, fx });
const S = (n, cd, fx, a, who) => ({ n, t: 'self', r: [0, 0], cd, fx, a, who });
const T = (n, r, cd, fx, a) => ({ n, t: 'tile', r, cd, fx, a });

const J = (name, side, title, rival, quote, passive, p, skills, ult) =>
  ({ name, side, title, rival, quote, passive: { n: passive, p }, skills, ult });

const JOBS = {
  // ───────── 神族 ─────────
  yuelao: J('月老', '神', '姻緣事業部業務經理', 'maeve', '紅線伺服器永不斷線，單身率就是你的業績。',
    '紅線加給', { healBoost: 1.5, rescueRange: 2 },
    [E('情感牽線', [1, 4], 3, { pull: 1, curse: 2 }), A('社群經營', [0, 3], 2, { heal: 6, shield: 1 })],
    S('人口普查', 0, { stun: 1, fixed: 3 }, 'all')),
  caishen: J('財神', '神', '金流事業部總監', 'asmo', '帳本已替你對好，剩下的就是讓全世界心甘情願掏錢。',
    '資本利得', { fragPerKill: 2, chargeMult: 1.3 },
    [E('金流操縱', [1, 3], 1, { dmg: 1.0, charge: 20 }), S('資產重分配', 3, { heal: 8, buffAtk: 1 })],
    S('財富暴衝', 0, { fixed: 5, curse: 2 }, 'all')),
  tudigong: J('土地公', '神', '社區管理員', 'cerberus', '社群裡有三百則未讀，請從最荒謬的開始處理。',
    '地頭蛇護體', { def: 2, regen: 1 },
    [S('基層維安', 3, { shield: 2, cleanse: 1 }), E('地方情資', [1, 4], 1, { dmg: 0.8, blind: 1 })],
    S('房地產區劃', 0, { fixed: 7, stun: 1 }, 'r2')),
  mazu: J('媽祖', '神', '海上客服專員', 'cthulhu', '海上收訊不穩，平安全靠你一個人撐住。',
    '災難預防', { swim: 1, allySoul: 2 },
    [T('海洋物流', [1, 3], 3, { water: 1 }, 'cross'), A('心靈庇護', [0, 3], 2, { heal: 7, cleanse: 1 })],
    T('平安護航', [1, 3], 0, { water: 1, allHeal: 8 }, 'cross')),
  guangong: J('關公', '神', '風險控管總監', 'loki', '您的風控報表已寫好一半，剩下的靠信徒補。',
    '義氣仲裁', { bossDmg: 0.3, lowHpAtk: 3 },
    [E('信用審查', [1, 1], 2, { dmg: 1.6, lowHpBonus: 1 }), S('安保合約', 3, { shield: 2, buffAtk: 1 })],
    S('忠義審判', 0, { dmg: 2.0 }, 'r1')),
  zeus: J('宙斯', '神', '氣象管制局值班長', 'lucifer', '雷電已排好班表，請從最吵的那位開始劈。',
    '氣象管制', { randomHurt: { every: 2, dmg: 4 } },
    [E('雷霆懲戒', [2, 4], 2, { dmg: 1.2, lightning: 1 }), E('多角戀管理', [1, 3], 4, { charm: 1 })],
    S('天罰裁決', 0, { fixed: 8, lightning: 1 }, 'all')),
  athena: J('雅典娜', '神', '策略規劃顧問', 'yama', '您的簡報三年前就寫好了，現在只是在等世界跟上。',
    '戰略智庫', { cdr: 1, def: 1 },
    [E('策略規劃', [1, 3], 2, { dmg: 0.8, confuse: 1 }), A('產線優化', [0, 3], 3, { shield: 2, buffAtk: 1 })],
    S('職場智謀', 0, { shield: 2, heal: 5, cleanse: 1 }, 'all', 'ally')),
  apollo: J('阿波羅', '神', '公關暨藝文部經理', 'daji', '您的濾鏡已預先套用，請保持微笑。',
    '光明普照', { dayNight: 1 },
    [E('光學娛樂', [2, 3], 1, { dmg: 1.0 }), A('藝術審美', [0, 2], 2, { heal: 8 })],
    S('輿論風向', 0, { fixed: 7, blind: 2 }, 'r3')),
  poseidon: J('波塞頓', '神', '水利物流處長', 'mammon', '您的貨櫃已在外海漂了三週，請先處理客訴。',
    '物流運輸', { swim: 1, waterStart: 2 },
    [T('水利工程', [1, 3], 3, { water: 1, fixed: 3 }, 'cross'), E('深海探勘', [1, 1], 2, { dmg: 0.8, push: 2 })],
    T('海流暴利', [1, 4], 0, { fixed: 7 }, 'r2')),
  hermes: J('赫爾墨斯', '神', '極速快遞業務專員', 'horusshadow', '您的外送員永遠在路上，客訴也是。',
    '極速物流', { mov: 2 },
    [T('訊息傳遞', [1, 4], 2, { teleport: 1, charge: 20 }), E('商業欺詐', [1, 1], 2, { dmg: 1.2, blind: 1 })],
    S('極速外送', 0, { heal: 4, extraTurn: 1 })),
  odin: J('奧丁', '神', '情報分析長', 'anubis', '您的一隻眼睛已典當，請用剩下那隻好好看清楚。',
    '資訊收集', { cdr: 1 },
    [E('戰術博弈', [1, 3], 2, { dmg: 1.0, curse: 2 }), S('高層決策', 4, { charge: 40 })],
    E('睿智之眼', [1, 5], 0, { fixed: 12 })),
  thor: J('索爾', '神', '設備維護課長', 'beelzebub', '您的槌子已保養完畢，任何卡住的東西都可以砸。',
    '重工維護', { thorMarks: 1 },
    [E('物理超渡', [1, 1], 2, { dmg: 1.6 }), E('暴力破局', [1, 1], 3, { dmg: 1.0, stun: 1 })],
    T('雷霆破工', [1, 3], 0, { fixed: 10, lightning: 1 }, 'cross')),
  wukong: J('孫悟空', '神', '體制外特約顧問', 'yama', '緊箍咒已被你拆成三段，請注意別被人資發現。',
    '金睛護身', { surviveOnce: 1, dodge: 0.1 },
    [E('大鬧天宮', [1, 1], 2, { dmg: 1.3, push: 1 }), T('應變危機', [1, 5], 3, { teleport: 1 })],
    S('體制破壞', 0, { dmg: 1.5, stun: 1 }, 'r2')),
  guanyin: J('觀音', '神', '心靈輔導主任', 'lilith', '請準備足夠的耐心，今天的祈禱都很長。',
    '大慈大悲', { surviveOnce: 1, healBoost: 1.3 },
    [A('慈悲救贖', [0, 3], 2, { heal: 9, cleanse: 1 }), E('心靈洗腦', [1, 3], 3, { confuse: 2 })],
    S('輿論安撫', 0, { heal: 12, shield: 1 }, 'all', 'ally')),
  nezha: J('哪吒', '神', '突擊專案組長', 'medusa', '風火輪已熱機，專案死線就是你的起跑線。',
    '叛逆改造', { spd: 2, onKillCharge: 20 },
    [T('極速突進', [1, 4], 2, { teleport: 1, buffAtk: 1 }), E('火系動力', [2, 3], 2, { dmg: 1.1, stun: 1 })],
    E('三頭六臂', [1, 1], 0, { dmg: 1.0, hits: 3 })),
  ra: J('拉', '神', '日輪集團董事長特助', 'dracula', '全公司的燈已替你點亮，請不要讓任何人躲進陰影。',
    '永晝帝國', { bossDmg: 0.2, blindOnHit: 0.25 },
    [S('日輪曝光', 3, { blind: 2 }, 'r2'), E('正午審判', [1, 2], 2, { dmg: 1.2 })],
    S('烈日曝曬', 0, { fixed: 6, blind: 2 }, 'all')),
  isis: J('伊西斯', '神', '急救與魔法部門主任', 'babayaga', '您的碎片已分類完畢，缺的那一塊正在宇宙中尋找。',
    '奇蹟縫合', { reviveOnce: 1 },
    [A('拼合碎片', [0, 3], 2, { heal: 8 }), E('萬能咒語', [1, 3], 3, { curse: 2, blind: 1 })],
    S('起死回生', 0, { reviveDog: 1, allHeal: 8 })),
  janus: J('雅努斯', '神', '迎新與離職交接處長', 'kuchisake', '您的門已標好「進」與「出」，但沒人記得哪邊是哪邊。',
    '新年儀式', { dodge: 0.15, mov: 1 },
    [E('轉換之門', [1, 4], 2, { swap: 1 }), E('雙面迎新', [1, 2], 2, { dmg: 1.0, confuse: 1 })],
    S('雙面之門', 0, { cleanse: 1, heal: 6, extraTurn: 1 })),
  fortuna: J('福爾圖娜', '神', '命運輪盤營運主管', 'mosinaa', '輪盤已經轉動，請告訴大家這叫「機率」。',
    '賭徒之福', { fragPerKill: 1, critChance: 0.2 },
    [E('命運輪盤', [1, 3], 2, { dmgRand: [0.5, 2.2] }), S('機率偏袒', 3, { healRand: [3, 12] })],
    S('輪盤轉動', 0, { dmgRand: [0.5, 2.5] }, 'all')),
  marduk: J('馬爾杜克', '神', '契約法務暨秩序部長', 'blackeye', '您的合約條款已預先生成，請讓對方簽到手軟。',
    '契約之主', { def: 1, thorns: 0.3 },
    [E('契約鐵律', [1, 1], 2, { dmg: 1.3, curse: 2 }), E('混沌鎮壓', [1, 3], 3, { stun: 1, fixed: 3 })],
    S('天命書寫', 0, { shield: 2, buffAtk: 2 }, 'all', 'ally')),
  ishtar: J('伊絲塔', '神', '愛欲與戰事行銷總監', 'llorona', '愛情與戰爭的預算已合併，請燒出最大效益。',
    '天界雙刃', { lowHpAtk: 3, lifesteal: 0.15 },
    [E('愛欲撩動', [1, 3], 4, { charm: 1 }), E('戰火點燃', [1, 1], 2, { dmg: 1.4 })],
    S('愛欲戰火', 0, { dmg: 2.2 }, 'r1')),
  enki: J('恩基', '神', '水利與創新研發處長', 'kappa', '智慧之水已灌進所有人的腦袋，請等待成果。',
    '智慧之水', { swim: 1, healBoost: 1.2 },
    [T('洪水預警', [1, 3], 3, { water: 1, charge: 15 }, 'cross'), A('工藝創造', [0, 3], 3, { buffAtk: 1, shield: 1 })],
    T('阿普蘇之潮', [1, 4], 0, { water: 1, fixed: 6 }, 'r1')),
  dagda: J('達格達', '神', '全員福利與餐飲部長', 'tigergranny', '大鍋已經煮沸，請問今天要餵飽哪些人？',
    '無底大鍋', { hp: 10, regen: 1 },
    [S('豐收之歌', 3, { heal: 5 }, 'all', 'ally'), E('巨棒決斷', [1, 1], 2, { dmg: 1.5, push: 1 })],
    S('生死巨棒', 0, { dmg: 1.8, stun: 1 }, 'r1')),
  brigid: J('布麗姬', '神', '詩歌與鍛造文創部經理', 'pontianak', '您的聖火已點亮，請不要讓任何人在黑暗裡加班。',
    '聖火庇護', { regen: 2 },
    [A('聖火守護', [0, 3], 2, { heal: 6, shield: 1 }), E('鐵砧重生', [1, 3], 2, { fixed: 6 })],
    S('詩歌療癒', 0, { heal: 10, cleanse: 1 }, 'all', 'ally')),
  svarog: J('斯瓦羅格', '神', '重工熔爐廠廠長', 'yukionna', '熔爐已升溫到 1500 度，請把所有不滿都丟進去。',
    '永恆熔爐', { atk: 2, thorns: 0.2 },
    [E('天火鍛造', [1, 1], 2, { dmg: 1.3 }), E('秩序錘擊', [1, 1], 3, { dmg: 1.0, stun: 1 })],
    T('天火降臨', [1, 3], 0, { fixed: 9 }, 'cross')),
  quetzal: J('羽蛇神', '神', '跨界知識傳承總監', 'hanako', '您的知識庫已上傳至雲端，請小心被竊取。',
    '黎明祭典', { mov: 1, chargeMult: 1.3 },
    [E('智慧之風', [1, 3], 2, { dmg: 0.9, push: 1 }), T('羽蛇降世', [1, 4], 3, { teleport: 1, heal: 4 })],
    S('羽蛇之風', 0, { heal: 6, buffAtk: 1 }, 'all', 'ally')),
  change: J('嫦娥', '神', '夜班值守與月相專員', 'hachi', '月亮已替你排好班，請在無人的深夜好好值守。',
    '月下獨守', { dodge: 0.2, debtHeal: 1 },
    [T('奔月逃脫', [1, 4], 3, { teleport: 1, heal: 4 }), S('桂樹迷霧', 3, { blind: 2 }, 'r2')],
    S('廣寒月光', 0, { fixed: 6, confuse: 1 }, 'all')),
  houyi: J('后羿', '神', '精準目標管理部長', 'chupacabra', '十個太陽已經排隊，請一個一個解決。',
    '十日之後', { bossDmg: 0.3 },
    [E('精準狙擊', [2, 5], 1, { dmg: 1.1 }), E('箭無虛發', [2, 5], 3, { dmg: 1.8 })],
    S('射日神箭', 0, { dmg: 1.2 }, 'all')),
  maui: J('瑪烏伊', '神', '專案時程壓縮專員', 'redgirl', '釣竿已經甩出去，請不要問釣到什麼。',
    '變形詭計', { dodge: 0.15, onKillCharge: 15 },
    [E('神鉤釣島', [2, 4], 2, { pull: 1, dmg: 0.8 }), E('擒日延時', [1, 4], 3, { stun: 1 })],
    S('神鉤擒日', 0, { stun: 1 }, 'all')),
  sedna: J('塞德娜', '神', '深海冷凍倉儲主任', 'bloodymary', '深海倉庫恆溫零下兩度，請問您要存放什麼？',
    '深海冷藏', { waterHurt: 2 },
    [E('冰冷審判', [1, 3], 2, { dmg: 1.0, blind: 1 }), T('海獸統領', [1, 3], 3, { water: 1 }, 'cross')],
    T('深海守護', [1, 4], 0, { water: 1, fixed: 5, stun: 1 }, 'cross')),

  // ───────── 魔族 ─────────
  lucifer: J('路西法', '魔', '深淵集團執行長特助', 'zeus', '您的招牌笑容已通過深淵品牌審查，準備迎接第一批靈魂。',
    '晨星加冕', { atk: 1, chargeMult: 1.2, lowHpAtk: 2 },
    [E('墮落美學', [1, 3], 4, { charm: 1 }), E('靈魂收割', [1, 1], 2, { dmg: 1.4, drain: 0.5 })],
    S('頂層架構', 0, { fixed: 9 }, 'all')),
  asmo: J('阿斯蒙蒂斯', '魔', '社群成癮營運長', 'caishen', '您的通知紅點已佈滿全人類，請維持他們的焦慮。',
    '慾望黑洞', { lifesteal: 0.2 },
    [E('慾望行銷', [1, 3], 3, { curse: 2, fixed: 2 }), E('流量變現', [1, 1], 2, { dmg: 1.3, drain: 0.3 })],
    E('社群成癮', [1, 3], 0, { charm: 2 })),
  beelzebub: J('別西卜', '魔', '輿情混淆部經理', 'apollo', '謠言已預先排程，轉傳率預估 300%。',
    '混亂造謠', { curseOnHit: 0.3 },
    [T('病毒傳播', [1, 3], 3, { curse: 2, fixed: 2 }, 'cross'), E('輿論腐化', [1, 3], 3, { confuse: 1 })],
    S('蠅災蔓延', 0, { curse: 3, blind: 2 }, 'all')),
  cerberus: J('刻耳柏洛斯', '魔', '門禁保全隊長', 'tudigong', '三顆頭同時值班，請注意誰在偷懶。',
    '地獄看守', { dog: 1, soulExtra: 1 },
    [S('門禁管制', 3, { shield: 2 }), E('鎮壓抗議', [1, 1], 2, { dmg: 1.2, stun: 1 })],
    S('極限安保', 0, { roar: 6 })),
  lilith: J('莉莉絲', '魔', '暗夜工會會長', 'guanyin', '工會旗幟已經掛好，今晚全員罷工。',
    '魅影潛行', { dodge: 0.2, mov: 1 },
    [E('情感操弄', [1, 3], 4, { charm: 1 }), E('暗夜反叛', [1, 1], 2, { dmg: 1.2, blind: 1 })],
    S('女權覺醒', 0, { stun: 1, fixed: 3 }, 'all')),
  cthulhu: J('克蘇魯', '魔', '精神健康破壞專員', 'mazu', '請勿直視報表，它也在看你。',
    '舊日支配', { abyss: 1 },
    [E('不可名狀', [1, 3], 3, { confuse: 2 }), E('精神崩潰', [1, 2], 2, { dmg: 1.0, curse: 2 })],
    S('克系恐懼', 0, { abyssDmg: 4 }, 'all')),
  anubis: J('阿努比斯', '魔', '靈魂登記處處長', 'odin', '亡者名冊已更新，今天的排隊人數創歷史新高。',
    '生死登記', { onKillHeal: 4, soulExtra: 1 },
    [E('靈魂審判', [1, 1], 2, { dmg: 1.0, lowHpBonus: 1 }), E('資產查封', [1, 3], 3, { stun: 1, curse: 1 })],
    S('冥界天秤', 0, { fixed: 5, execute: 0.35 }, 'all')),
  loki: J('洛基', '魔', '危機公關製造部主管', 'guangong', '您的謊言已通過三輪交叉驗證，請安心使用。',
    '惡作劇之神', { dodge: 0.25 },
    [E('謊言包裝', [1, 4], 2, { swap: 1 }), E('挑撥離間', [1, 3], 2, { confuse: 1, fixed: 2 })],
    E('危機製造', [1, 4], 0, { confuse: 2, fixed: 4 })),
  medusa: J('美杜莎', '魔', '資產凍結課長', 'nezha', '請維持冷血，這是最基本的專業。',
    '視覺定格', { stunOnHit: 0.2 },
    [E('石化資本', [1, 3], 4, { stun: 2 }), E('冷血管理', [1, 1], 2, { dmg: 1.3 })],
    S('石化資產', 0, { stun: 1, fixed: 4 }, 'r3')),
  pandora: J('潘朵拉', '魔', '風險投資部經理', 'athena', '請小心，每個箱子都附帶一個你沒預料的後果。',
    '潘朵拉之盒', { critChance: 0.25 },
    [T('災難放手', [1, 3], 3, { dmgRand: [0.3, 1.8] }, 'cross'), S('好奇心收割', 3, { chargeRand: [10, 60] })],
    S('風險投資', 0, { dmgRand: [0.5, 2.0], curse: 2 }, 'all')),
  horusshadow: J('荷魯斯之影', '魔', '競品情報組組長', 'hermes', '您的黑色西裝已送洗，下次任務請穿深灰色。',
    '暗影滲透', { dodge: 0.15, onKillCharge: 20 },
    [E('暗影諜報', [1, 4], 2, { blind: 2, fixed: 2 }), E('數據竊取', [1, 1], 2, { dmg: 1.2, drain: 0.3 })],
    S('競品打擊', 0, { summon: { n: 2, rounds: 3 } })),
  maeve: J('梅芙', '魔', '流量榨取部主管', 'yuelao', '您的年終獎金已被抽成三次，請微笑面對。',
    '心靈榨汁', { onKillAtk: 1 },
    [E('流量榨乾', [1, 1], 2, { dmg: 1.2, drain: 0.4 }), E('情感剝削', [1, 3], 4, { charm: 1 })],
    E('奴役契約', [1, 1], 0, { dmg: 2.5, killRefund: 50 })),
  yama: J('閻羅王', '魔', '地獄人資部・責任制推動主任', 'wukong', '您的待辦清單已自動同步到所有人的假日。',
    '責任制推動', { onKillHeal: 3, def: 1 },
    [E('過勞死令', [1, 3], 3, { fixed: 3, curse: 2 }), S('績效壓榨', 3, { buffAtk: 2, selfHurt: 4 })],
    S('裁員宣告', 0, { fixed: 4, execute: 0.3 }, 'all')),
  mammon: J('瑪門', '魔', '採購暨物價部經理', 'poseidon', '您的冰箱永遠是空的，這是公司規定。',
    '無底深淵', { fragPerKill: 2, hp: 6 },
    [E('資源吞噬', [1, 1], 2, { dmg: 1.2, drain: 0.5 }), E('物價通膨', [1, 3], 3, { curse: 3 })],
    S('產線癱瘓', 0, { stun: 1, curse: 1 }, 'all')),
  daji: J('妲己', '魔', '泡沫經濟顧問', 'thor', '您的簡報光鮮亮麗，只要別有人去核對數字。',
    '幻術泡沫', { dodge: 0.2 },
    [E('魅惑人心', [1, 3], 4, { charm: 1 }), E('輿論反轉', [1, 3], 2, { confuse: 1, blind: 1 })],
    S('泡沫經濟', 0, { confuse: 2 }, 'all')),
  dracula: J('德古拉', '魔', '夜班吸血專案總監', 'ra', '您的血袋存量充足，請繼續招募新的訂閱者。',
    '血契訂閱', { lifesteal: 0.25 },
    [E('永夜訂閱', [1, 1], 2, { dmg: 1.3, drain: 0.5 }), T('蝙蝠情報網', [1, 4], 3, { teleport: 1 })],
    S('血契簽署', 0, { fixed: 5, drainAll: 1 }, 'all')),
  babayaga: J('巴巴雅嘎', '魔', '林間小屋託管業務經理', 'isis', '小屋已搬到您的辦公室後門，請隨時準備接受訪客。',
    '雞腿小屋', { thorns: 0.3 },
    [T('雞腿屋移動', [1, 4], 3, { teleport: 1 }), E('骨燈照路', [1, 3], 2, { fixed: 5, blind: 1 })],
    S('魔法試煉', 0, { dmg: 2.0, push: 1 }, 'r1')),
  kuchisake: J('口裂女', '魔', '顧客外貌滿意度調查員', 'janus', '您的外貌問卷已派發，請將所有答案轉為恐懼。',
    '口罩之下', { curseOnHit: 0.25 },
    [E('裂口微笑', [1, 1], 2, { dmg: 1.5 }), E('答案陷阱', [1, 2], 3, { stun: 1, curse: 2 })],
    S('我漂亮嗎', 0, { confuse: 1, fixed: 4 }, 'all')),
  mosinaa: J('魔神仔', '魔', '山區迷途引導部主管', 'fortuna', '您的導航已更新至「森林深處」，祝您旅途愉快。',
    '迷途幻象', { dodge: 0.15, mov: 1 },
    [E('迷路誘引', [1, 3], 3, { confuse: 1 }), E('山林幻象', [1, 2], 2, { push: 2, blind: 1 })],
    E('帶走你', [1, 3], 0, { banish: 1 })),
  blackeye: J('黑眼小孩', '魔', '深夜敲門業務專員', 'marduk', '您已在門口站了三小時，客戶仍未開門。',
    '沉默壓力', { enemyAtk: 1 },
    [E('請讓我們進去', [1, 1], 2, { dmg: 1.2, curse: 1 }), E('黑色眼眸', [1, 3], 3, { stun: 1 })],
    S('敲門', 0, { blind: 2, curse: 2 }, 'all')),
  llorona: J('拉洛羅納', '魔', '河邊失物招領處處長', 'ishtar', '您的失物清單已累積三百年，請持續追蹤。',
    '夜哭', { randomHurt: { every: 2, dmg: 3 } },
    [E('哭聲追蹤', [1, 4], 2, { fixed: 4 }), E('河岸呼喚', [2, 4], 3, { pull: 1, curse: 2 })],
    S('失子之痛', 0, { fixed: 6 }, 'all')),
  kappa: J('河童', '魔', '水域設施維護課長', 'enki', '您的水盤已補滿，請不要讓任何人對你鞠躬。',
    '頭頂水盤', { swim: 1, waterStart: 2 },
    [E('拖入水中', [1, 1], 2, { dmg: 1.2, water: 1 }), S('黃瓜補給', 3, { heal: 8 })],
    E('黃瓜契約', [1, 1], 0, { dmg: 2.0, push: 2, stun: 1 })),
  tigergranny: J('虎姑婆', '魔', '兒童關懷暨晚餐服務專員', 'dagda', '您的晚餐已訂妥，請今晚準時到府關懷。',
    '深夜啃食', { onKillHeal: 5 },
    [E('阿姨偽裝', [1, 3], 4, { charm: 1 }), E('拇指謎底', [1, 1], 2, { dmg: 1.4 })],
    E('晚餐預訂', [1, 1], 0, { dmg: 2.2, drain: 1.0 })),
  pontianak: J('彭蒂雅娜', '魔', '婦產關懷與香氣部門主管', 'brigid', '您的花香已佈滿整條走廊，請讓大家循著味道前來。',
    '夜香', { blindOnHit: 0.3 },
    [T('花香引路', [1, 3], 3, { blind: 2 }, 'cross'), T('夜半現身', [1, 4], 3, { teleport: 1 })],
    E('釘孔封印', [1, 1], 0, { dmg: 1.5, stun: 2 })),
  yukionna: J('雪女', '魔', '冷凍倉儲與危機降溫部經理', 'svarog', '空調已調至零下，請讓客戶保持冷靜。',
    '白衣之約', { stunOnHit: 0.2 },
    [E('冰吻凍結', [1, 1], 4, { stun: 2 }), S('暴雪迷蹤', 3, { blind: 2 }, 'r2')],
    S('萬里冰封', 0, { stun: 1, fixed: 4 }, 'all')),
  hanako: J('花子', '魔', '校舍廁所設備管理員', 'quetzal', '請敲三下確認有人，如果沒人回應就是有。',
    '三聲敲門', { cdr: 1 },
    [T('三樓隔間', [1, 4], 3, { teleport: 1 }), E('敲門三聲', [1, 1], 2, { dmg: 0.5, hits: 3 })],
    S('紅色披風', 0, { fixed: 6, confuse: 1 }, 'r2')),
  hachi: J('八尺大人', '魔', '高處監視與噪音管制主管', 'change', '您的監視攝影機位於八尺高，請定時巡視。',
    '高處凝視', { biggest: 2 },
    [E('波波波', [1, 4], 2, { fixed: 4, blind: 1 }), T('八尺身影', [1, 4], 3, { teleport: 1 })],
    E('凝視', [1, 4], 0, { stun: 2, fixed: 6 })),
  bloodymary: J('血腥瑪麗', '魔', '鏡面維護與召喚客服專員', 'sedna', '您的鏡子已預先擦亮，請準備好被叫出來。',
    '血色倒影', { thorns: 0.4 },
    [T('鏡中召喚', [1, 4], 3, { teleport: 1 }), E('三次呼喚', [1, 1], 2, { dmg: 0.6, hits: 3 })],
    S('碎鏡', 0, { fixed: 6, curse: 1 }, 'all')),
  chupacabra: J('卓柏卡布拉', '魔', '農場損耗稽查專員', 'houyi', '您的巡邏路線已排定，請記得避開攝影機。',
    '牲畜失蹤', { lifesteal: 0.2, spd: 1 },
    [E('吸血夜襲', [1, 1], 2, { dmg: 1.3, drain: 0.5 }), T('神祕剪影', [1, 4], 3, { teleport: 1 })],
    E('夜襲牲畜', [1, 1], 0, { dmg: 2.0, drain: 1.0 })),
  redgirl: J('紅衣小女孩', '魔', '山區安全宣導專員', 'maui', '您的紅色制服已洗好，請站在山路轉角等候。',
    '紅衣誘引', { curseOnHit: 0.25, dodge: 0.1 },
    [S('山徑迷霧', 3, { blind: 1, confuse: 1 }, 'r2'), E('詭異微笑', [1, 5], 3, { blink: 1, dmg: 1.0 })],
    S('跟著我走', 0, { confuse: 1, curse: 2 }, 'all')),
};

// 舊存檔裡的技能（第一版的形態技能），繼承時還認得
const LEGACY_SKILLS = {
  slash:     E('斬擊', [1, 1], 2, { dmg: 1.5 }),
  stone:     E('投石', [2, 3], 1, { dmg: 0.8 }),
  heal:      A('治癒', [0, 2], 2, { heal: 9 }),
  lightbolt: E('光矢', [2, 3], 1, { dmg: 1.0 }),
  claw:      E('裂爪', [1, 1], 2, { dmg: 1.3, drain: 0.5 }),
  curse:     E('詛咒', [1, 3], 3, { curse: 2 }),
};

// 技能 id：「職業.0」「職業.1」，或舊版的技能名
function getSkill(id) {
  const [job, i] = id.split('.');
  if (i != null && JOBS[job]) return { ...JOBS[job].skills[+i] };
  return LEGACY_SKILLS[id] ? { ...LEGACY_SKILLS[id] } : E('遺忘的技能', [1, 1], 2, { dmg: 1.0 });
}

// 前世技能帶到新的形態時會變異
const MUTATION = {
  human: { prefix: '', note: '原樣繼承' },
  angel: { prefix: '聖', note: '使用後自己回復 3 點生命', selfHeal: 3 },
  demon: { prefix: '血', note: '額外吸取三成傷害', drain: 0.3 },
};

function mutateSkill(id, form) {
  const base = getSkill(id), m = MUTATION[form];
  return { ...base, n: m.prefix ? m.prefix + base.n : base.n, mutation: m };
}

// ───────── 自動產生說明文字 ─────────

const pct = (x) => Math.round(x * 100) + '%';
const rng = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}～${r[1]}`);

function describeSkill(sk, g = '能量') {
  const fx = sk.fx, a = sk.a || 'single';
  const who = sk.who || (sk.t === 'ally' ? 'ally' : 'enemy');
  const whoText = who === 'ally' ? '我方' : '敵人';
  let area;
  if (fx.teleport) area = `瞬間移動到距離 ${rng(sk.r)} 的空格`;
  else if (sk.t === 'self') area = a === 'all' ? `全場${whoText}` : a === 'single' ? '自己' : `自己身邊 ${a.slice(1)} 格內的${whoText}`;
  else if (sk.t === 'ally') area = sk.r[0] === 0 ? `距離 ${rng(sk.r)} 的自己或隊友` : `距離 ${rng(sk.r)} 的隊友`;
  else if (sk.t === 'tile') area = `距離 ${rng(sk.r)} 的一格` + (a === 'cross' || a === 'r1' ? '與周圍四格' : a === 'single' ? '' : `周圍 ${a.slice(1)} 格內`);
  else area = `距離 ${rng(sk.r)} 的一個敵人`;
  const out = [];
  if (fx.blink) out.push('閃現到目標身邊');
  if (fx.water) out.push('化為水面');
  if (fx.dmg) out.push(fx.hits ? `連打 ${fx.hits} 次，每次 ${fx.dmg} 倍攻擊` : `造成 ${fx.dmg} 倍攻擊的傷害`);
  if (fx.dmgRand) out.push(`造成 ${fx.dmgRand[0]}～${fx.dmgRand[1]} 倍攻擊的隨機傷害`);
  if (fx.fixed) out.push(`造成 ${fx.fixed} 點傷害（無視防禦）`);
  if (fx.abyssDmg) out.push(`造成 ${fx.abyssDmg} 點傷害，每 1 點深淵能量再多 2 點`);
  if (fx.lightning) out.push('打到水面時，整片相連的水都會導電');
  if (fx.lowHpBonus) out.push('目標生命低於一半時傷害加五成');
  if (fx.execute) out.push(`生命低於 ${pct(fx.execute)} 的非首領敵人直接倒下`);
  if (fx.banish) out.push('把一個非首領敵人帶進樹林，再也不回來（首領受到 8 點傷害）');
  if (fx.heal) out.push(`回復 ${fx.heal} 點生命`);
  if (fx.healRand) out.push(`回復 ${fx.healRand[0]}～${fx.healRand[1]} 點生命`);
  if (fx.shield) out.push(`護盾 ${fx.shield} 回合（受到的傷害減半）`);
  if (fx.buffAtk) out.push(`攻擊 +${fx.buffAtk}（這場戰鬥）`);
  if (fx.cleanse) out.push('解除負面狀態');
  if (fx.stun) out.push(`定身 ${fx.stun} 回合`);
  if (fx.blind) out.push(`目盲 ${fx.blind} 回合（攻擊一半落空）`);
  if (fx.confuse) out.push(`混亂 ${fx.confuse} 回合（會攻擊自己的同伴）`);
  if (fx.curse) out.push(`詛咒 ${fx.curse} 回合（受到的傷害加五成）`);
  if (fx.charm) out.push(`非首領敵人倒戈 ${fx.charm} 回合，替你作戰`);
  if (fx.push) out.push(`擊退 ${fx.push} 格`);
  if (fx.pull) out.push('把目標拉到你面前');
  if (fx.swap) out.push('和目標交換位置');
  if (fx.drain) out.push(fx.drain >= 1 ? '吸取全部傷害' : `吸取 ${Math.round(fx.drain * 10)} 成傷害`);
  if (fx.drainAll) out.push('吸取一半的總傷害');
  if (fx.killRefund) out.push(`擊倒目標時${g}回充 ${fx.killRefund}%`);
  if (fx.charge) out.push(`${g} +${fx.charge}%`);
  if (fx.chargeRand) out.push(`${g}隨機 +${fx.chargeRand[0]}～${fx.chargeRand[1]}%`);
  if (fx.allHeal) out.push(`我方全體回復 ${fx.allHeal} 點生命`);
  if (fx.reviveDog) out.push('引魂犬全滿復活');
  if (fx.roar) out.push(`引魂犬全滿復活，牠身邊兩格內的敵人受到 ${fx.roar} 點傷害`);
  if (fx.summon) out.push(`召喚 ${fx.summon.n} 個影子替你作戰 ${fx.summon.rounds} 回合`);
  if (fx.selfHurt) out.push(`自己失去 ${fx.selfHurt} 點生命`);
  if (fx.extraTurn) out.push('立刻再行動一次');
  const text = fx.teleport ? [area, ...out].join('，') : `${area}：${out.join('，')}`;
  return text + (sk.cd ? `。冷卻 ${sk.cd}` : '');
}

function describePassive(p, g = '能量') {
  const out = [];
  if (p.hp) out.push(`最大生命 +${p.hp}`);
  if (p.atk) out.push(`攻擊 +${p.atk}`);
  if (p.def) out.push(`防禦 +${p.def}`);
  if (p.spd) out.push(`速度 +${p.spd}`);
  if (p.mov) out.push(`移動 +${p.mov}`);
  if (p.chargeMult) out.push(`${g}累積速度 +${pct(p.chargeMult - 1)}`);
  if (p.cdr) out.push('技能冷卻少 1 回合');
  if (p.lifesteal) out.push(`造成傷害的 ${pct(p.lifesteal)} 變成自己的生命`);
  if (p.lowHpAtk) out.push(`生命低於一半時，傷害 +${p.lowHpAtk}`);
  if (p.bossDmg) out.push(`對首領的傷害 +${pct(p.bossDmg)}`);
  if (p.critChance) out.push(`${pct(p.critChance)} 機率暴擊（傷害加五成）`);
  if (p.thorns) out.push(`被攻擊時反彈 ${pct(p.thorns)} 傷害`);
  if (p.dodge) out.push(`${pct(p.dodge)} 機率閃開敵人的攻擊`);
  if (p.onKillAtk) out.push(`擊倒敵人時攻擊 +${p.onKillAtk}（這場戰鬥）`);
  if (p.onKillHeal) out.push(`擊倒敵人時回復 ${p.onKillHeal} 點生命`);
  if (p.onKillCharge) out.push(`擊倒敵人時${g} +${p.onKillCharge}%`);
  if (p.curseOnHit) out.push(`攻擊有 ${pct(p.curseOnHit)} 機率詛咒目標`);
  if (p.stunOnHit) out.push(`攻擊有 ${pct(p.stunOnHit)} 機率定身目標`);
  if (p.blindOnHit) out.push(`攻擊有 ${pct(p.blindOnHit)} 機率讓目標目盲`);
  if (p.regen) out.push(`每回合開始回復 ${p.regen} 點生命`);
  if (p.biggest) out.push(`每回合開始，場上最高大的敵人失去 ${p.biggest} 點生命`);
  if (p.waterHurt) out.push(`每回合開始，站在水面上的敵人失去 ${p.waterHurt} 點生命`);
  if (p.randomHurt) out.push(`每 ${p.randomHurt.every} 回合，一個隨機敵人受到 ${p.randomHurt.dmg} 點傷害`);
  if (p.thorMarks) out.push('每兩回合在三個敵人腳下標記雷擊區，下一回合落雷 5 點（會順著水導電，也會打到自己人）');
  if (p.dayNight) out.push('單數回合是白天：治療加五成、我方攻擊 +2；雙數回合是黑夜');
  if (p.abyss) out.push('任何人倒下都會累積深淵能量，累積 4 點時一個敵人發瘋 1 回合');
  if (p.surviveOnce) out.push('每場戰鬥一次：受到致命傷時留下 1 點生命');
  if (p.reviveOnce) out.push('每場戰鬥一次：倒下時立刻以一半生命站起來');
  if (p.soulExtra) out.push(`變成靈魂時多撐 ${p.soulExtra} 回合`);
  if (p.allySoul) out.push(`隊友變成靈魂時多撐 ${p.allySoul} 回合`);
  if (p.rescueRange) out.push(`可以救援 ${p.rescueRange} 格內的靈魂`);
  if (p.swim) out.push('我方在水面上移動不減速');
  if (p.waterStart) out.push(`戰鬥開始時地上多出 ${p.waterStart} 片水窪`);
  if (p.dog) out.push('引魂犬生命 +10、攻擊 +3');
  if (p.enemyAtk) out.push(`所有敵人攻擊 -${p.enemyAtk}`);
  if (p.healBoost) out.push(`治療效果 +${pct(p.healBoost - 1)}`);
  if (p.fragPerKill) out.push(`每擊倒一個敵人，多得 ${p.fragPerKill} 個記憶碎片`);
  if (p.debtHeal) out.push('每突破一層，因果債 -1');
  return out.join('；');
}

// 舊程式碼用的名字
const FAITHS = JOBS;

// ───────── 角色出處：讓玩家知道這是哪裡的神魔 ─────────
// [出處, 一句話介紹真實傳說裡的祂]
const ORIGINS = {
  yuelao: ['中國・民間信仰', '月下老人，手持記載天下姻緣的「姻緣簿」，用紅線把命中注定的兩人綁在一起。'],
  caishen: ['中國・民間信仰', '掌管財富的神明，常見形象是騎黑虎、手捧金元寶的趙公明，過年時家家戶戶都要迎財神。'],
  tudigong: ['臺灣・中國民間信仰', '福德正神，守護一方土地的地方神，白鬍子老爺爺，拄拐杖、捧元寶，街頭巷尾都有祂的小廟。'],
  mazu: ['臺灣・閩南・海洋信仰', '本名林默娘的海上女神，專門保佑漁民與航海平安，身邊有千里眼、順風耳兩位將軍。'],
  guangong: ['中國・三國歷史與民間信仰', '三國名將關羽，紅臉長鬚、手持青龍偃月刀，以忠義聞名，被奉為武聖與商人的守護神。'],
  zeus: ['希臘神話', '奧林帕斯眾神之王，掌管天空與雷電，武器是雷霆。'],
  athena: ['希臘神話', '智慧與戰略女神，從宙斯頭中全副武裝誕生，象徵物是貓頭鷹與橄欖樹，雅典城以她為名。'],
  apollo: ['希臘神話', '太陽、音樂、詩歌與預言之神，手持七弦琴與銀弓，德爾斐神諭由他主持。'],
  poseidon: ['希臘神話', '海洋與地震之神，手持三叉戟，一怒就掀起風暴與海嘯。'],
  hermes: ['希臘神話', '眾神的信使，戴有翼帽、穿有翼涼鞋、拿雙蛇杖，也是商人、旅人和小偷的守護神。'],
  odin: ['北歐神話', '諸神之父，為了智慧獻出一隻眼睛，兩隻烏鴉每天替他打聽九界的消息。'],
  thor: ['北歐神話', '雷神，奧丁之子，揮舞雷神之鎚妙爾尼爾，是守護人類對抗巨人的戰神。'],
  wukong: ['中國・《西遊記》', '從石頭蹦出的美猴王，會七十二變、一個筋斗十萬八千里，大鬧天宮後保護唐僧取經。'],
  guanyin: ['佛教・東亞信仰', '觀世音菩薩，大慈大悲、聞聲救苦，手持淨瓶與楊柳枝。'],
  nezha: ['中國・《封神演義》', '腳踩風火輪、手持火尖槍與乾坤圈的少年神將，削肉還母後以蓮花化身重生。'],
  ra: ['埃及神話', '太陽神，鷹頭人身、頭頂日輪，每天搭太陽船橫越天空，夜裡穿過冥界。'],
  isis: ['埃及神話', '魔法與母性女神，把被分屍的丈夫歐西里斯拼回來復活，是荷魯斯的母親。'],
  janus: ['羅馬神話', '雙面神，一張臉看過去、一張看未來，掌管門、開始與結束，一月（January）以祂為名。'],
  fortuna: ['羅馬神話', '幸運女神，轉動命運之輪，常被畫成蒙著眼睛，好運壞運全看輪子停在哪。'],
  marduk: ['美索不達米亞・巴比倫神話', '巴比倫的守護主神，打敗混沌海怪提亞瑪特，用她的身體創造天地並建立秩序。'],
  ishtar: ['美索不達米亞神話', '愛情、豐饒與戰爭女神（蘇美稱伊南娜），曾經下到冥界又回來。'],
  enki: ['美索不達米亞・蘇美神話', '淡水、智慧與工藝之神，用黏土造出人類，大洪水時偷偷提醒人類造船。'],
  dagda: ['愛爾蘭・凱爾特神話', '「好神」達格達，有一口永遠吃不完的大鍋、一根一端殺人一端救人的巨棒，還有能控制四季的豎琴。'],
  brigid: ['愛爾蘭・凱爾特神話', '掌管詩歌、鍛造與療癒的女神，象徵物是聖火，愛爾蘭至今還有「布麗姬十字」的習俗。'],
  svarog: ['斯拉夫神話', '天空與火焰之神，也是神界的鐵匠，傳說是祂教會人類冶鐵。'],
  quetzal: ['阿茲特克・中美洲神話', '羽蛇神魁札爾科亞特爾，長著羽毛的蛇，帶給人類玉米、曆法和知識。'],
  change: ['中國神話', '偷吃不死藥後飛上月宮的仙女，和玉兔一起住在廣寒宮，中秋節就是在看她。'],
  houyi: ['中國神話', '神射手，天上同時出現十個太陽時射下九個，救了大地，也是嫦娥的丈夫。'],
  maui: ['玻里尼西亞神話（夏威夷・紐西蘭毛利等）', '半神英雄，用魔法魚鉤把島嶼從海底釣起來，還用繩子套住太陽讓白天變長。'],
  sedna: ['因紐特神話（北極）', '海洋女神，手指被砍斷後化成海豹、鯨魚等海洋生物，住在冰冷的海底掌管獵物。'],
  lucifer: ['基督教傳說', '「光之使者」，原本是最耀眼的天使，因驕傲反叛上帝而墮落，成為地獄之主。'],
  asmo: ['猶太・基督教傳說', '色慾的惡魔，代表七宗罪的「色慾」，在《多俾亞傳》裡專門破壞婚姻。'],
  beelzebub: ['猶太・基督教傳說', '「蒼蠅王」，地獄的高階惡魔，代表七宗罪的「暴食」。'],
  cerberus: ['希臘神話', '看守冥界大門的三頭犬，只讓亡魂進、不讓任何人出去。'],
  lilith: ['猶太傳說', '傳說中亞當的第一任妻子，因不願服從而離開伊甸園，成為夜之魔女。'],
  cthulhu: ['克蘇魯神話（洛夫克拉夫特小說）', '沉睡在海底拉萊耶城的古神，章魚頭、蝙蝠翅膀，光是看見祂就會讓人發瘋。'],
  anubis: ['埃及神話', '胡狼頭的死神與防腐之神，在冥界用天秤秤亡者的心臟，和真理之羽比輕重。'],
  loki: ['北歐神話', '詭計之神，會變身、愛惡作劇，最後在諸神黃昏和眾神為敵。'],
  medusa: ['希臘神話', '蛇髮女妖，任何人看到她的眼睛都會變成石頭，最後被英雄柏修斯用盾牌倒影砍下頭。'],
  pandora: ['希臘神話', '第一個女人，好奇打開眾神給的盒子，把災難放到人間，盒底只剩下「希望」。'],
  horusshadow: ['埃及神話（改編）', '以鷹頭天空神荷魯斯為原型的暗影分身；荷魯斯之眼是古埃及最有名的護身符。'],
  maeve: ['愛爾蘭・凱爾特神話', '康諾特的女王梅芙，為了搶一頭神牛發動「奪牛長征」，是讓人沉醉的女王。'],
  yama: ['佛教・中國民間信仰', '地府的閻羅王，審判亡魂生前善惡，決定下哪一層地獄或去投胎。'],
  mammon: ['基督教傳說', '代表貪婪與財富的惡魔，七宗罪的「貪婪」。'],
  daji: ['中國・《封神演義》', '九尾狐化身的美女，迷惑商紂王，讓商朝走向滅亡。'],
  dracula: ['羅馬尼亞傳說・愛爾蘭小說《德古拉》', '最有名的吸血鬼伯爵，住在外西凡尼亞的城堡，原型是「穿刺公」弗拉德三世。'],
  babayaga: ['斯拉夫民間故事', '住在雞腳小屋裡的森林女巫，坐在臼裡飛，會吃小孩，有時也會幫助勇敢的人。'],
  kuchisake: ['日本都市傳說', '戴著口罩的女人，問路人「我漂亮嗎？」，拿下口罩後嘴巴裂到耳朵。'],
  mosinaa: ['臺灣民間傳說', '山裡的精怪，會把人帶進山中迷路，被找到的人常說吃了「好吃的雞腿」（其實是蟲和泥土）。'],
  blackeye: ['美國都市傳說', '深夜敲門的孩子，眼睛整片漆黑，一直要求「讓我們進去」，千萬不能讓他們進門。'],
  llorona: ['墨西哥・拉丁美洲傳說', '「哭泣的女人」，親手淹死自己的孩子後，永遠在河邊哭著找他們。'],
  kappa: ['日本妖怪', '住在河裡的水妖，頭頂有個盛水的盤子，水乾了就沒力氣，最愛吃小黃瓜。'],
  tigergranny: ['臺灣民間故事', '老虎精假扮成外婆，半夜來敲門騙小孩，還會吃手指；被聰明的姊姊用熱油打敗。'],
  pontianak: ['馬來西亞・印尼傳說', '難產而死的女鬼，穿白衣長髮，出現前會先聞到花香，接著是腐臭。'],
  yukionna: ['日本妖怪', '雪夜出現的白衣美女，一口冰冷的氣息就能把人凍死。'],
  hanako: ['日本都市傳說', '住在學校三樓廁所第三間的女孩，敲三下門叫她的名字，她就會回答「我在」。'],
  hachi: ['日本網路怪談', '身高八尺（約 240 公分）的白衣女人，戴寬帽子，會發出「波、波、波」的聲音，被她看上的孩子會被帶走。'],
  bloodymary: ['英美都市傳說', '對著鏡子念三次她的名字，她就會從鏡子裡出現。'],
  chupacabra: ['波多黎各・拉丁美洲傳說', '「吸羊怪」，專門吸乾家畜血液的神祕怪物。'],
  redgirl: ['臺灣都市傳說', '1998 年一段登山錄影裡出現的紅衣小女孩，被認為與魔神仔有關，傳說跟著她走就會在山裡迷路。'],
};
