# 技能像素圖 Gemini 提示詞（每角色一張圖）

共通前綴（每張都貼在最前面）：

```
Pixel art sprite sheet, 16-bit SNES style, crisp hard pixels, no anti-aliasing, limited palette, thick dark outline on icons.
PURE BLACK background (#000000) everywhere, no gradient, no ground, no text, no labels, no characters.
Layout: exactly 3 rows, evenly spaced, with clear black gaps between rows and between cells.
Each row = 5 square cells left to right:
  cell 1 = a skill ICON: a bold symbol inside a small rounded square frame tinted in the main color, readable at 32px;
  cells 2-5 = a 4-frame VISUAL EFFECT animation of that skill (start, grow, peak, fade), glowing bright colors on black, effect only, no caster.
Main color: {COLOR}.
Row 1: {S1}
Row 2: {S2}
Row 3: {ULT}
```

| id | COLOR | S1 | S2 | ULT |
|---|---|---|---|---|
| guangong | jade green #40d070 | 刺顏良: a single green halberd thrust, sharp spear tip stab with speed lines | 過五關斬六將: zigzag slash trail of a guandao blade, five quick cuts | 青龍斬: a huge green crescent blade wave with a dragon head shape |
| yuelao | pink red #ff5c8d | 赤繩繫足: a flying red thread looping with small hearts | 千里姻緣一線牽: red thread connecting dots, hearts at each knot | 亂點鴛鴦譜: an open red marriage book with tangled red threads and broken hearts bursting out |
| yukionna | ice blue #a0e0ff | 冰柱: a flying ice spike / icicle shard, shattering into crystals | 吹雪: swirling snow ring blizzard, snowflakes | 雪夜之約: a giant blizzard with a pale moon, freezing ice blocks forming |
| brigid | flame orange #ff8a30 | 基爾代爾聖火: a stream of holy fire flames | 鐵砧鍛造: a hammer striking an anvil with orange sparks and a shield shape | 詩歌療癒: a Celtic harp with golden music notes and healing sparkles |
| tudigong | gold #ffc830 | 巡境: a golden light trail from a wooden staff, gold coins | 護境安民: a golden dome shield with a tiny shrine roof | 張福德顯靈: a huge golden glowing old-man spirit silhouette with gold ingots (元寶) raining |
| hermes | light gold #f0d070 | 神使傳令: winged sandal dash, yellow speed streaks and feathers | 偷牛小賊: a quick sneaky slash with a small cow head symbol and a fear swirl | 斬百眼巨人: a caduceus staff swing with many closing eyes and music notes |
| dagda | brown tan #d8a060 | 巨棒決斷: a giant wooden club wide horizontal swing with dust | 豐收之歌: a harp with green leaves, wheat and healing light | 生死巨棒: a huge club smash shockwave, half dark red skull side, half green life side |
| hanako | purple #b060e0 | 敲門三聲: three knock impacts on a school toilet door, "knock" ripples | 花子在嗎？: a dark purple fear ring with a small ghost hand coming out | 紅色披風: a sweeping red cape swirl with purple shadows |
| anubis | gold black #f0c040 | 靈魂審判: a was-sceptre heavy strike with golden ankh flash | 法老的詛咒: a line of purple-gold hieroglyph curse beam | 吞噬者阿米特: a huge crocodile-lion jaw (Ammit) chomping, golden scales of judgment |
| hachi | white #e8e8ff | 波波波: three expanding pale sound waves "po po po" rings | 八尺身影: a very tall white silhouette shadow with a wide white hat, shield shimmer | 凝視: two giant staring eyes under a white hat brim, beam of dread |
| medusa | snake green #70d060 | 蛇髮: biting green snakes lunging | 石化凝視: a green eye beam turning things to grey stone cracks | 雅典娜的詛咒: an Athena owl & shield symbol with a grey stone shatter explosion |
| horusshadow | dark gold #e0b850 | 權杖金光: a golden light beam from a scepter | 暗影之眼: a dark shadow Eye of Horus shooting dark bolts | 天空之神的審判: a falcon wing spread with golden sun disk and falling eye shards |
| redgirl | crimson #ff4050 | 牽手: a small red hand grabbing, red mist puff | 紅霧: rolling red mountain fog ring | 深山迷途: a dark forest path with red fog, spiraling lost footprints |

上傳：GitHub 網頁 → 分支 claude/project-thread-x2dd05 → 資料夾 assets/skills/gemini/ → 檔名 <id>.png（例：guangong.png）。
