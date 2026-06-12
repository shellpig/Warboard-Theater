# 戰局劇場 Warboard Theater — Phase 7 規格(赤壁事件擴充)

> 版本:v1.0 / 定案日期:2026-06-12
> 緣起:第一章鋪陳段常有「發呆」感(字卡之間只有無利害的小幅巡江調度);且《三國演義》赤壁前哨的關鍵軍事事件(三江口之戰、反間計除水軍都督、闞澤下書、龐統連環、曹操三笑)未演出或只用字卡帶過。
> 目標:依《三國演義》第四十三〜五十回補齊有戲劇張力的事件與軍事行動,讓畫面全程有事發生、因果鏈完整。
> 本文件為**實作依據**,逐單位移動座標與時間皆已設計,實作者照表施工,不得自行臆測座標或兵力。

---

## 〇、總則(硬性約束,沿用規格書第六節與 Phase 6)

1. **確定性不可破壞**:所有狀態(位置 / 兵力 / 徽章 / 名稱 / cut-in 透明度)一律為**全域播放進度 p 的純函數**,在 `engine/timeline.js` 載入時編譯成關鍵幀軌道。禁用 wall-clock、setTimeout 計時、執行期隨機。任意拖曳 / 倒帶 / 跳章後畫面必須與重播完全一致。
2. **UI 螢幕佔比不變**:名牌 / 字卡 / war-meter / 時刻面板 / 新增的中央 cut-in 皆為 DOM overlay,以螢幕像素定尺寸,不因地圖縮放而變。
3. **兵力守恆**:開場北軍 200,000 / 南軍 50,000 不變(`.verify_phase5.py` line 38 斷言)。新單位兵力一律從**同側既有單位扣出**,不疊加。
4. **戰役內容字串四語內聯**(zh-TW / zh-CN / en / ja),zh-TW 為準;en/ja 初稿可由實作者填,後續人工校對。演義 `quote` 原文任何語系皆顯示漢文原句。
5. **座標系**:世界平面 `[x, z]`,原點戰場中心,x = 東、z = 南。地圖 2400×1600。

### 地帶定義(設計移動座標的依據)

| 地帶 | z 範圍 | 說明 |
|---|---|---|
| 北岸陸地(曹軍) | z ≤ −440 | 烏林本陣 `[400,-520]`、陸軍、華容道入口 |
| 江面水戰區 | z ∈ [−350, +400] | 水軍交戰、渡江主戰場 |
| 南岸陸地(孫劉) | z ≥ +500 | 赤壁磯 `[-200,600]`、南屏山 `[-620,800]` |
| 華容道(陸,東北退走) | x ∈ [600,1200], z ∈ [−580,−820] | 曹操敗走路線 |

> 設計原則:水軍 move 的 z 必須留在 [−350,+400];渡江事件由南(+300 上下)往北(−180 上下);登陸(C3)由江面登上北岸(z<−440)。

---

## 一、引擎新能力(兩項,唯一需要動程式碼的部分)

其餘全為資料(`battles/chibi/events.json`、`battles/chibi/battle.json`)。

### 1-A 中央事件 Cut-in(橫排大字)

**行為**:左下角字卡(lower-third)維持不變、持續顯示本章最後一張。中央 cut-in 是**短暫的橫排大字標題**:事件觸發時淡入、停留約 2.6 秒、淡出,像紀錄片的橋段標題卡。

**Schema**(events.json 任一事件可選掛):

```jsonc
// 簡寫:沿用該事件 title 當大字(僅 narration 有意義)
{ "type": "narration", "title": { ... }, "cut": true }

// 完整:獨立大字 text + 選填副標 sub(皆四語內聯)
{ "type": "engage", "units": [ ... ],
  "cut": {
    "text": { "zh-TW": "一笑——趙雲殺出!", "zh-CN": "一笑——赵云杀出!", "en": "First Laugh — Zhao Yun Strikes!", "ja": "一笑——趙雲、突出!" },
    "sub":  { "zh-TW": "烏林道", "zh-CN": "乌林道", "en": "Wulin Road", "ja": "烏林道" }
  } }
```

**確定性做法(關鍵,禁用計時器)**:
- 編譯期(`timeline.js`)收集 `cuts.push({ p, chapter, text, sub })`(`cut: true` 時 text 取 `ev.title`)。
- 常數 `CUT_HOLD = 2.6`(全域播放秒)、`CUT_IN = 0.4`、`CUT_OUT = 0.6`。
- 新增 `cutAt(p)`:找出最近一個滿足 `p ∈ [p0, p0 + CUT_HOLD]` 的 cut(僅取**目前章節**,比照 `cardAt`),回傳 `{ text, sub, alpha }`,其中
  - `d = p − p0`
  - `alpha = clamp(d / CUT_IN, 0, 1) * clamp((CUT_HOLD − d) / CUT_OUT, 0, 1)`
  - 無命中回傳 `null`。
- 因 alpha 純由 p 求得,seek/scrub 到淡入淡出途中皆顯示正確透明度。

**UI(`ui.js`)**:
- 新增 `#cut-in` DOM(內含 `.cut-text` 與 `.cut-sub` 兩個 span)。
- `update()` 內每幀取 `timeline.cutAt(p)`:內容變了才換字(避免每幀寫 DOM);`#cut-in.style.opacity = alpha`;`alpha < 0.01` 時 `display:none`。

**樣式(`style.css`)**:
- 置中,垂直位置落在 war-meter(頂)與字卡(底)之間的安全帶(約 `top: 38%`),**不得遮擋兩者**。
- 橫排、襯線字體、字距加大;白字 + 描邊/陰影(`text-shadow`)確保任何背景可讀;副標小一級、字距更寬置於大字下方。
- 淡入可加輕微 `letter-spacing` 收束或 `translateY` 位移(純 CSS transition 由 opacity 帶動即可,**不可**用 CSS animation 自走時間軸,以免與 seek 脫鉤)。建議僅靠 opacity,位移用 transform 綁 alpha 亦可。

**HTML(`theater.html`)**:在 overlay 層(與 `#card`、`#war-meter` 同層)加 `<div id="cut-in"><span class="cut-text"></span><span class="cut-sub"></span></div>`。

**錄影模式**:cut-in 屬演出內容,錄影模式(`body.record`)**保留顯示**(與字卡同)。

### 1-B 單位指揮官改名(status.label)

**用途**:事件發生後改變某單位名牌顯示名稱(本案:蔡瑁張允水軍 → 反間計後改名毛玠于禁水軍)。

**Schema**:`status` 事件加選填 `label`(四語):

```jsonc
{ "t": 1320, "type": "status", "unit": "caizhang_fleet",
  "label": { "zh-TW": "毛玠・于禁水軍", "zh-CN": "毛玠・于禁水军", "en": "Mao Jie & Yu Jin's Navy", "ja": "毛玠・于禁水軍" } }
```

**引擎(`timeline.js`)**:
- 每單位軌道新增 `name` step 軌道,初值為 `battle.units[].label`。
- `status` 編譯時若有 `ev.label`,push `{ p, v: ev.label }`。
- 新增 `labelAt(id, p)`:step 取值(最後一個 p ≤ 目標的 key),回傳該語系 `pick()` 前的四語物件(由 ui 端 `pick`)。

**UI(`ui.js`)小重構**:
- 目前名牌 `name` div 內含文字 + badge span,直接 `textContent` 會清掉 badge。**改為**:`name` div 內放兩個子元素 `<span class="plate-name"></span>` 與既有 `badge` span。
- `update()` 內比照 troops/badge:`const nm = pick(timeline.labelAt(id, p)); if (nm !== pl.lastName) { pl.lastName = nm; pl.nameEl.textContent = nm; }`。
- 確定性:名稱是 p 的 step 函數,seek/倒帶一致。

---

## 二、新單位與兵力守恆

新增 **4 隊**(北 1、南 3)。陸軍 `cao_camp 68000`、`zhangliao 16000`、`xuhuang 16000`(共 100,000)**完全不動**——華容道與陸戰 losses 不必改。

### 2-A 北側水軍重新分配(四支水軍合計維持 100,000)

| 單位 | 原 troops | 開場 troops(t=0) | 換帥後(p > t1320) | 備註 |
|---|---|---|---|---|
| `cao_fleet` 連環船隊 | 63,000 | **50,000** | 50,000 | 第二章連環船 losses 須重算(見第五節) |
| `caizhang_fleet` 蔡瑁・張允水軍 | —(新) | **24,000** | **38,000**(吸收毛玠于禁 14,000,並改名) | 反間計後改名「毛玠・于禁水軍」 |
| `maozhi_fleet` 毛玠・于禁水軍 | 20,000 | **14,000** | **0**(併入 caizhang、opacity 0 退場) | 第二章既有引用改指向 caizhang(見 4-C) |
| `wenpin_fleet` 文聘前軍 | 17,000 | **12,000** | 12,000 | |
| 小計 | 100,000 | 100,000 | 100,000 | |

- 開場(t=0)北軍總和:水軍 100,000 + 陸軍 100,000 = **200,000** ✓
- 換帥後北軍總和:50,000 + 38,000 + 0 + 12,000 + 100,000 = **200,000** ✓(僅在北軍內部搬家)

### 2-B 南側 wu 重新分配(合計維持 30,000;shu 20,000 不動)

| 單位 | 原 troops | 新 troops | Δ |
|---|---|---|---|
| `zhouyu_fleet` | 13,500 | 9,000 | −4,500 |
| `handan_fleet` | 7,700 | 6,000 | −1,700 |
| `ganling_fleet` | 6,800 | 6,000 | −800 |
| `huanggai_fleet` | 2,000 | 1,800 | −200 |
| `kanze_boat` 闞澤小舟(新) | — | 200 | +200 |
| `lvmeng_force` 呂蒙隊(新) | — | 4,000 | +4,000 |
| `lingtong_force` 淩統・太史慈隊(新) | — | 3,000 | +3,000 |
| 小計(wu) | 30,000 | 30,000 | 0 |

- 南軍開場總和:wu 30,000 + shu 20,000 = **50,000** ✓(lvmeng/lingtong 雖開場 opacity 0,`troopsAt` 仍計入 war-meter,守恆成立)

### 2-C 新單位 battle.json 條目(照填,座標已定)

```jsonc
{
  "id": "caizhang_fleet", "faction": "wei", "type": "fleet", "count": 16,
  "label": { "zh-TW": "蔡瑁・張允水軍", "zh-CN": "蔡瑁・张允水军", "en": "Cai Mao & Zhang Yun's Navy", "ja": "蔡瑁・張允水軍" },
  "spawn": [80, -210], "troops": 24000
},
{
  "id": "kanze_boat", "faction": "wu", "type": "fleet", "count": 2,
  "label": { "zh-TW": "闞澤小舟", "zh-CN": "阚泽小舟", "en": "Kan Ze's Skiff", "ja": "闞澤の小舟" },
  "spawn": [-300, 360], "troops": 200
},
{
  "id": "lvmeng_force", "faction": "wu", "type": "infantry",
  "label": { "zh-TW": "呂蒙隊", "zh-CN": "吕蒙队", "en": "Lü Meng's Force", "ja": "呂蒙隊" },
  "spawn": [-120, 320], "troops": 4000
},
{
  "id": "lingtong_force", "faction": "wu", "type": "infantry",
  "label": { "zh-TW": "淩統・太史慈隊", "zh-CN": "凌统・太史慈队", "en": "Ling Tong & Taishi Ci's Force", "ja": "凌統・太史慈隊" },
  "spawn": [120, 340], "troops": 3000
}
```

> 同時把既有 `cao_fleet`/`maozhi_fleet`/`wenpin_fleet`/`zhouyu_fleet`/`handan_fleet`/`ganling_fleet`/`huanggai_fleet` 的 `troops` 改成上表「新 troops」欄值。

---

## 三、第一章 風起江上 — 完整事件與移動設計

> 章參數:`duration_min 7200`、`playback_sec 90`。換算 **1 播放秒 = 80 章內分鐘**。
> 下表「既有」= 保留現狀(僅視需要補 `cut`);「NEW」= 本次新增。座標 `from→to` 為世界 `[x,z]`。

### 3-0 開場隱藏(t=0)

維持既有 `status opacity:0`:`strawboat_fleet`、`guanyu_force`、`zhaoyun_force`、`zhangfei_force`。
**NEW** 追加 `status opacity:0`:`kanze_boat`、`lvmeng_force`、`lingtong_force`。
`caizhang_fleet` 開場可見(opacity 1,預設)。

### 3-1 三江口之戰(NEW B1,t=350–900)

劇情:蔣幹尚未盜書前,周瑜遣甘寧、韓當前出三江口試探;蔡瑁張允統水軍迎戰,雙方互射、曹軍一船起火,南軍小勝後撤回。對應第四十五回「三江口曹操折兵」。

| t | t_end | type | unit | from → to | camera | cut / fx | 說明 |
|---|---|---|---|---|---|---|---|
| 350 | — | narration(speaker zhouyu) | — | — | overview | cut「三江口」 | 標題拉開,先看兩岸相對位置 |
| 360 | 520 | move | ganling_fleet | [-440,280] → [-240,30] | — | — | 甘寧前出江心 |
| 370 | 540 | move | handan_fleet | [60,280] → [20,60] | — | — | 韓當並進 |
| 400 | 560 | move | caizhang_fleet | [80,-210] → [-40,-40] | — | — | 蔡瑁張允水軍迎戰 |
| 410 | 560 | move | wenpin_fleet | [-180,-200] → [-200,-30] | follow | — | 文聘前軍接戰 |
| 560 | — | camera | — | — | none | fx volley ganling_fleet→caizhang_fleet count 90 | 首輪箭雨 |
| 600 | 760 | fire | (pos [-120,-20]) | — | — | intensity 0.5 | 曹軍一船起火(t_end 760) |
| 520 | 760 | engage | [ganling_fleet, handan_fleet, caizhang_fleet, wenpin_fleet] | — | follow | losses(見第五節) | 江心混戰 |
| 640 | — | camera | — | — | none | fx volley caizhang_fleet→handan_fleet count 70 | 曹軍回擊 |
| 780 | 900 | move | ganling_fleet | [-240,30] → [-440,260] | — | — | 南軍小勝撤回南岸 |
| 790 | 900 | move | handan_fleet | [20,60] → [60,270] | — | — | |
| 800 | 900 | move | caizhang_fleet | [-40,-40] → [80,-210] | — | — | 曹軍退回水寨 |
| 800 | 900 | move | wenpin_fleet | [-200,-30] → [-180,-200] | — | — | |
| 880 | — | narration(speaker zhouyu) | — | — | overview | cut「周瑜首勝」 | 點出曹軍折兵、士氣 |

### 3-2 蔣幹盜書 + 反間計換帥(既有 + NEW,t=1300–1390)

| t | t_end | type | unit | 內容 | camera | cut | 說明 |
|---|---|---|---|---|---|---|---|
| 1300 | — | narration(speaker zhouyu) | — | 既有「蔣幹盜書」 | — | cut「蔣幹盜書」 | 偽書借蔣幹之手 |
| 1320 | — | narration(speaker caocao) | — | **NEW**「蔡瑁張允伏誅」:曹操誤中反間,自斬水軍都督 | follow | cut「蔡瑁張允伏誅」 | quote 可選第四十五回 |
| 1320 | — | status | caizhang_fleet | **NEW** `badge:"defect"`(短暫示警,或新增「都督」徽章鍵,見註) | — | — | 主帥伏誅瞬間 |
| 1320 | 1380 | move | maozhi_fleet | [240,-260] → [60,-215] | — | — | **NEW** 毛玠于禁向水軍本隊靠攏(整編) |
| 1340 | — | status | caizhang_fleet | **NEW** `troops: 38000`(吸收 14,000)+ `label`→「毛玠・于禁水軍」 | — | — | 改名 + 兵力併入 |
| 1340 | — | status | maozhi_fleet | **NEW** `troops: 0` | — | — | 兵力移出 |
| 1390 | — | status | maozhi_fleet | **NEW** `opacity: 0` | — | — | 退場 |

> 註:`badge` 若不想新增「都督」鍵,t=1320 可省略 caizhang 的 badge,僅靠 cut-in + 改名表現;`maozhi_fleet` troops 0 + opacity 0 後其名牌自動隱藏(`ui.js` opacity<0.05 隱藏)。
> 自此 `maozhi_fleet` 視同退場,**第二章所有既有 `maozhi_fleet` 引用改指向 `caizhang_fleet`**(見 4-C)。

### 3-3 草船借箭(既有,t=2250–2760)

維持現狀;t=2450 narration 補 `cut「草船借箭」`。既有 strawboat opacity/move、volley fx、quote 不動。

### 3-4 闞澤密獻詐降書(NEW B3,t=3560–4160)

劇情:黃蓋苦肉計後,闞澤趁夜駕小舟潛渡曹營下詐降書。對應第四十七回。

| t | t_end | type | unit | from → to | camera | cut | 說明 |
|---|---|---|---|---|---|---|---|
| 3560 | — | status | kanze_boat | opacity 1 | — | — | 小舟現身南岸 |
| 3580 | — | narration | — | — | follow | cut「闞澤下書」 | 夜色 |
| 3580 | 3860 | move | kanze_boat | [-300,360] → [60,-160] | follow | — | 潛渡至曹軍水寨前 |
| 3900 | 4120 | move | kanze_boat | [60,-160] → [-300,360] | — | — | 下書畢返航 |
| 4160 | — | status | kanze_boat | opacity 0 | — | — | 隱去 |

### 3-5 苦肉計與連環計字卡(既有,t=4300)

維持既有 narration「苦肉計與連環計」;補 `cut「苦肉計」`。

### 3-6 龐統獻連環計(NEW B4,t=4560–5260)

劇情:龐統借闞澤之舟過江,獻連環計於曹操;水軍(因新帥不諳水戰、求穩)將戰船鐵索相連。視覺上水軍三隊收攏成一線。對應第四十七〜四十八回。

| t | t_end | type | unit | from → to | camera | cut | 說明 |
|---|---|---|---|---|---|---|---|
| 4560 | — | status | kanze_boat | opacity 1 | — | — | 載龐統再渡 |
| 4580 | — | narration | — | — | follow | cut「連環計」 | |
| 4580 | 4860 | move | kanze_boat | [-300,360] → [40,-180] | follow | — | 渡江入曹營 |
| 4880 | 4980 | move | caizhang_fleet | [80,-210] → [120,-235] | — | — | 收攏列陣(連環) |
| 4880 | 4980 | move | wenpin_fleet | [-180,-200] → [-120,-235] | — | — | |
| 4880 | 4980 | move | cao_fleet | [0,-240] → [0,-238] | overview | — | 微調對齊,象徵三隊連鎖成一片 |
| 5000 | 5220 | move | kanze_boat | [40,-180] → [-300,360] | — | — | 龐統返航 |
| 5260 | — | status | kanze_boat | opacity 0 | — | — | 隱去 |

> 既有 t=4500–5900 的 zhouyu/ganling/huanggai/handan 整備 move 保留(不同單位,不衝突)。

### 3-7 借東風、箭在弦上(既有,t=6400/7050)

維持現狀;t=6400 補 `cut「借東風」`(既有 ring fx、camera pos 不動);t=7050「箭在弦上」可選補 cut。

---

## 四、第二章 火燒赤壁 — 完整事件與移動設計

> 章參數:`duration_min 600`、`playback_sec 150`、`clock_start 20:00`。換算 **1 播放秒 = 4 章內分鐘**。
> 既有事件全部保留;以下為 NEW 加料與必要改寫。

### 4-A 既有保留要點

黃蓋出發(t=0)、詐降接近/defect(t=60)、火燒連環船(t=130)、周瑜總攻(t=180)、各路 volley(t=230/270/320)、曹軍潰走 rout/move(t=360)、棄營北走(t=480)等**全部保留**;各 narration 補對應 `cut`(黃蓋出發 / 火燒連環船 / 周瑜總攻 / 曹軍潰走 / 棄營北走)。

### 4-B 反間計連動:caizhang 進入第二章的位置與引用改寫(必做)

- `caizhang_fleet`(此時已是「毛玠・于禁水軍」,38,000)第一章結束停在 `[120,-235]`(連環陣);第二章續用此軌道,**無需重設 spawn**(spawn 僅 t=0 初值,p 已越過)。
- **第二章既有所有 `maozhi_fleet` 引用一律改成 `caizhang_fleet`**,計:
  - t=0 `move maozhi_fleet → [120,-250]` ⇒ 改 `caizhang_fleet [120,-235]→[120,-250]`
  - t=150–360 engage `units` 內 `maozhi_fleet` ⇒ `caizhang_fleet`;`losses.maozhi_fleet` ⇒ `losses.caizhang_fleet`(數值見第五節)
  - t=320 volley `to: maozhi_fleet` ⇒ `to: caizhang_fleet`
- `maozhi_fleet` 不再出現於第二章。

### 4-C 甘寧斬蔡中(NEW C2,t≈80–150)

劇情:詐降船隊接近時,甘寧識破曹營詐降內應蔡中、先發突擊。對應第四十九回。

| t | t_end | type | unit | from → to | camera | cut / fx | 說明 |
|---|---|---|---|---|---|---|---|
| 80 | 150 | move | ganling_fleet | [-440,260] → [-260,40] | — | — | 甘寧前出(銜接既有 t=170 move) |
| 110 | — | narration(speaker zhouyu) | — | — | follow | cut「甘寧斬蔡中」 | |
| 110 | — | camera | — | — | none | fx volley ganling_fleet→caizhang_fleet count 80 | 突擊 |

> 既有 ganling 第二章 move(t=170→[-200,-130])接在 t=150 之後,起點改為 `[-260,40]`。

### 4-D 黃蓋中箭落水(NEW C1,t≈205–260)

劇情:火起後,曹將張遼引弓射黃蓋,黃蓋中箭落水,韓當駕船救起。對應第四十九回。

| t | t_end | type | unit | from → to | camera | cut / fx | 說明 |
|---|---|---|---|---|---|---|---|
| 205 | — | camera | — | — | none | fx volley caizhang_fleet→huanggai_fleet count 60 | 曹軍射黃蓋 |
| 210 | — | status | huanggai_fleet | `badge:"rout"` | follow | — | 中箭示警(短暫) |
| 210 | — | narration(speaker huanggai) | — | — | follow | cut「黃蓋中箭」 | |
| 220 | 260 | move | handan_fleet | [70,-150] → [-70,-148] | follow | — | 韓當接應救起(既有 handan t=170–300 move 終點 [70,-150];此為其後續救援腿) |
| 260 | — | status | huanggai_fleet | `badge:"idle"` | — | — | 獲救,狀態回復 |

> `huanggai_fleet` 兵力不在此事件折損(僅徽章變化);其於 t=150–360 engage 的 losses 維持(見第五節重算)。

### 4-E 諸路登陸夾擊烏林(NEW C3,t≈360–600)

劇情:水寨潰後,周瑜遣呂蒙、淩統、太史慈諸路登北岸,夾擊烏林本陣,逼曹操棄營。對應第四十九〜五十回。

| t | t_end | type | unit | from → to | camera | cut | 說明 |
|---|---|---|---|---|---|---|---|
| 360 | — | status | lvmeng_force | opacity 1 | — | — | 現身南岸江面 |
| 360 | — | status | lingtong_force | opacity 1 | — | — | |
| 365 | — | narration | — | — | overview | cut「諸路登陸」 | 看橫渡夾擊全景 |
| 365 | 470 | move | lvmeng_force | [-120,320] → [300,-440] | overview | — | 橫渡登北岸烏林西 |
| 375 | 480 | move | lingtong_force | [120,340] → [500,-460] | overview | — | 登北岸烏林東 |
| 480 | 600 | engage | [lvmeng_force, lingtong_force, cao_camp] | — | follow | losses(見第五節) | 夾擊本陣 |

> `cao_camp` 此前(t<480)停在 `[400,-520]`;C3 夾擊與既有「棄營北走」(t=480 move [400,-520]→[640,-640])同步發生,呈現「被夾擊而棄營」。

### 4-F 張遼護主斷後(NEW C4,t=480)

既有 t=480「棄營北走」narration 補 `cut「張遼護主」`,speaker 設 caocao 或無;既有 `zhangliao_force` move(480–600 → [500,-580])保留,語意為斷後護曹操。可選把 zhangliao 終點調為 `[480,-560]`,使其位於 cao_camp 與追兵之間(斷後位)。

---

## 五、尾聲 華容道 — 曹操三笑(NEW D,改寫既有三道伏兵)

> 章參數:`duration_min 720`、`playback_sec 60`。換算 **1 播放秒 = 12 章內分鐘**。
> 把原本壓成一張字卡的「三道伏兵」改寫為《演義》第五十回名場面「曹操三笑」三個節拍:每笑一聲,一路伏兵殺出。既有 zhaoyun/zhangfei/guanyu 單位複用,**不新增單位**。

| t | t_end | type | unit | from → to | camera | cut | 說明 |
|---|---|---|---|---|---|---|---|
| 0 | — | narration | — | 既有「敗走華容道」 | — | — | 雨中泥濘 |
| 0 | 600 | move | cao_camp | 既有 [640,-640]→[900,-760] | — | — | 全程退走(既有) |
| 0 | 240 | status | cao_camp | 既有 attrition 14.375 | — | — | 掉隊(既有) |
| 20 | — | narration(speaker zhugeliang) | — | **NEW D1**「智算華容」:孔明早算定三路 | — | cut「智算華容」 | |
| 120 | — | narration(speaker caocao) | — | **NEW D2**「曹操一笑」:笑周瑜諸葛無謀,若於此設伏…… | follow | cut「一笑——趙雲殺出!」 | quote 可用第五十回 |
| 120 | — | status | zhaoyun_force | opacity 1 | — | — | 趙雲現身 |
| 120 | 200 | move | zhaoyun_force | [740,-640] → [820,-700] | follow | — | 截殺 |
| 160 | 280 | engage | [cao_camp, zhaoyun_force] | — | follow | losses(見第六節) | 一道伏兵 |
| 240 | — | narration(speaker caocao) | — | **NEW D3**「曹操二笑」 | follow | cut「二笑——張飛殺出!」 | |
| 240 | — | status | zhangfei_force | opacity 1 | — | — | 張飛現身 |
| 240 | 320 | move | zhangfei_force | [960,-710] → [1010,-745] | follow | — | 截殺 |
| 280 | 400 | engage | [cao_camp, zhangfei_force] | — | follow | losses(見第六節) | 二道伏兵 |
| 420 | 600 | status | cao_camp | 既有 attrition 31.35 | — | — | 續掉隊(既有) |
| 430 | — | narration(speaker caocao) | — | **NEW D4**「曹操三笑」 | follow | cut「三笑——關羽攔路!」 | |
| 450 | — | status | guanyu_force | opacity 1 | — | — | 既有(關羽現身) |
| 450 | 520 | move | guanyu_force | [1040,-720] → [1040,-640] | follow | — | 攔住去路 |
| 480 | — | narration(speaker guanyu) | — | 既有「雲長攔路」 | — | cut「雲長攔路」 | |
| 540 | — | narration | — | 既有「關羽義釋」 | — | cut「義釋曹操」 | quote 既有第五十回 |
| 550 | 580 | move | guanyu_force | 既有 [1040,-720]→[1040,-600] | — | — | 既有(讓路) |
| 700 | — | narration | — | 既有「三分天下」 | — | cut「三分天下」 | |

> 既有單一 engage `[cao_camp, zhaoyun_force, zhangfei_force]`(t=240–420,losses cao_camp 53170 / zhaoyun 2900 / zhangfei 3000)**刪除**,改為上表兩段(D2 趙雲、D3 張飛),losses 重算見第六節。

---

## 六、losses / attrition 重算指引(實作時必處理)

**原則**:`engage.losses[id]` 是**目標兵力值**(該單位兵力插值「降到」此值),非損失量。改了開場兵力,所有目標值須連動,且保證每單位兵力曲線**單調遞減**。

### 6-A 第一章三江口(NEW)建議 losses 目標(t=520–760 engage)

南軍小勝、損失輕,曹軍折兵略重:
| 單位 | engage 前 | 目標(降到) |
|---|---|---|
| ganling_fleet | 6,000 | 5,700 |
| handan_fleet | 6,000 | 5,650 |
| caizhang_fleet | 24,000 | 21,500 |
| wenpin_fleet | 12,000 | 10,800 |

> 注意:caizhang 在 t=1340 會 `status troops: 38000`(吸收毛玠于禁);該 status 之 troops key 會接續三江口後的兵力。實作時確認 status 設定的是絕對值 38000(吸收後總額),時序在三江口 losses 之後,曲線不回升即可(38000 > 21500,屬「整編補充」語意,允許上升一次,屬資料語意而非戰損)。若不希望出現兵力回升,可把 caizhang 開場改 38000、三江口前用 status 暫不變,改由 maozhi 表現折兵——**預設採前者(允許整編上升)**,因敘事為「兩隊合一」。

### 6-B 第二章 engage 目標(按開場縮放,維持戰後殘存比例近似)

| 單位 | 原開場 | 原目標 | 新開場 | 新目標(建議) |
|---|---|---|---|---|
| cao_fleet | 63,000 | 41,300 | 50,000 | 32,800 |
| huanggai_fleet | 2,000 | 1,637 | 1,800 | 1,470 |
| wenpin_fleet | 17,000 | 1,700 | 12,000(三江口後 10,800) | 1,200 |
| caizhang_fleet(原 maozhi) | 20,000 | 2,000 | 38,000 | 3,800 |
| zhouyu_fleet | 13,500 | 12,200 | 9,000 | 8,100 |
| ganling_fleet | 6,800 | 6,400 | 6,000(三江口後 5,700) | 5,400 |
| handan_fleet | 7,700 | 7,300 | 6,000(三江口後 5,650) | 5,350 |

- `cao_fleet` 第二章 t=520 `status troops: 20000` → 按比例改 **16,000**;其 t=360–520 rout move 的 `attrition: 133.125` 重算為使曲線自 32,800 單調降到 16,000(loss 16,800 / 160 分 ≈ **105/分**)。

### 6-C C3 夾擊與 cao_camp 兵力時間線(建議關鍵幀)

`cao_camp` 開場 68,000 不變;以下為跨第二、三章建議曲線(單調遞減):
| 階段 | 事件 | 兵力降到 |
|---|---|---|
| 第二章 t=480–600 | C3 夾擊 engage(NEW) | 58,000 |
| 第三章 t=0–240 | attrition 14.375/分(既有) | ≈ 54,550 |
| 第三章 t=160–280 | D2 趙雲 engage(NEW) | 47,000 |
| 第三章 t=280–400 | D3 張飛 engage(NEW) | 39,000 |
| 第三章 t=420–600 | attrition 31.35/分(既有) | ≈ 33,360 |

- C3 engage 中 `lvmeng_force`/`lingtong_force` 損失輕:lvmeng 4,000→3,600;lingtong 3,000→2,700。
- D2 zhaoyun 2,900、D3 zhangfei 3,000(維持原值即可,屬南軍輕損)。

> 以上為**建議起點**;實作者可微調使數字觀感自然(非整數、持續滾動,沿用問題 3 的手法)。

---

## 七、驗收腳本連動(`.verify_phase5.py`)

- **line 38** 開場 war-meter 斷言 `["200,000","50,000"]`:守恆設計下應**自動通過**,不需改;若失敗代表兵力分配算錯,須回頭核對第二節。
- **line 64** 結算損失斷言含字串 `"−107,573"`:三江口(B1)、夾擊(C3)新增曹軍戰損,**此數字必然變動**。處理方式:全部資料改完後,以 `python -m http.server 8146` + 瀏覽器(或 Playwright)實跑到結算畫面,**讀取 end-card 實際曹軍損失數字,回填 line 64**。不得手算硬湊。
- 跑前確認 console 無錯誤(新事件 type/fx kind 皆為既有支援:move/engage/fire/volley/status/narration/camera/ring/explosion/smoke;cut 與 label 為純資料欄位,不觸發未知警告)。

---

## 八、子階段 7-A ~ 7-F(每階段獨立 commit、各自瀏覽器驗收後再進下一階段)

> 命名比照 Phase 6(6-A ~ 6-F)往例。**7-A 是地基,必須最先**;7-B 純資料、零新單位,正好驗證 7-A;其餘依「第一章 → 跨章兵力 → 第二章」相依順序;7-F 收尾(損失數字須實跑才知,不能先算)。

- **7-A 引擎地基**:1-A 中央 cut-in(timeline `cutAt` + ui `#cut-in` + css + html)＋ 1-B status 改名(timeline `labelAt` + ui 名牌重構)。先在既有事件補幾個 `cut` 與一個 `label` 測試,驗收淡入淡出、改名、任意 seek 確定性。
- **7-B 曹操三笑**(純資料、零新單位、風險最低):改寫尾聲三道伏兵為三笑三拍(第五節 D1–D4)。
- **7-C 三江口 + 反間計換帥**:加 `caizhang_fleet`、三江口事件(3-1)、t=1320 換帥(3-2,改名 + maozhi 併入)。
- **7-D 新單位 + 闞澤龐統**:加 `kanze_boat`、闞澤下書(3-4)、龐統連環(3-6);同步落實第二節 2-A/2-B 全部兵力改值。
- **7-E 火攻加料**:C1/C2/C3/C4(第四節)+ 第二章 maozhi→caizhang 引用改寫(4-B)+ 新增 `lvmeng_force`/`lingtong_force`。
- **7-F 重算 + 驗收**:依第六節重算所有 losses/attrition;實跑回填 `.verify_phase5.py` line 64;三章整跑 + 任意 seek。

---

## 九、總驗收清單

- [ ] 中央 cut-in 橫排大字於各標記事件淡入→停留→淡出;任意拖曳/倒帶 scrub 至淡入淡出途中透明度正確;錄影模式仍顯示;不遮擋 war-meter 與字卡。
- [ ] 反間計瞬間,水軍本隊名牌由「蔡瑁・張允水軍」當場改為「毛玠・于禁水軍」;maozhi_fleet 名牌消失;前後兵力曲線連續。
- [ ] 第一章 1× 連續觀看,無超過 10 秒全場靜止空窗;三江口有真實接戰(移動+箭雨+起火+兵力滾動)。
- [ ] 闞澤、龐統小舟渡江可見且事後隱去;連環段水軍三隊收攏成一線。
- [ ] 第二章黃蓋中箭→韓當救起、甘寧突擊、諸路登陸夾擊烏林依序演出;同屏名牌 10+。
- [ ] 尾聲曹操三笑三拍:每笑一聲對應趙雲/張飛/關羽殺出,cut-in 配合;接既有雲長攔路、義釋。
- [ ] 開場 war-meter 200,000 / 50,000;`.verify_phase5.py` 通過(line 64 已回填新損失數字)。
- [ ] 三章整跑 + 任意 seek:console 無錯誤、無名牌殘留、鏡頭不穿地、火攻特效對齊船陣。
