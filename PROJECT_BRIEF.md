# 戰局劇場 Warboard Theater ─ 專案簡報

> 本文件為前期討論總結,供 Claude Code 開發 session 使用。
> 日期:2026-06-11

---

## 一、專案概念

一個網頁版「歷史戰役 3D 推演劇場」。參考對象:

- **https://sekigahara.tenz.net/** (關原之戰 3D 推演,可 fetch 觀察實際結構)

核心體驗:
- 3D 戰場 + 時間軸驅動的戰況推演,像看一場「有導播的歷史紀錄片」
- 首頁為串流平台式「節目單」,海報卡片選擇戰役
- 一套引擎,多場戰役:戰役資料(JSON + 素材)與引擎完全分離,新增戰役只需新增資料夾
- 後續用途:除網頁外,也作為 YouTube 頻道影片素材來源(運鏡需考慮 16:9 錄製、UI 可隱藏)

第一場戰役:**赤壁之戰(演義版)**。

---

## 二、技術定調

- 純前端,無 build step,Three.js 由 CDN 引入
- 程序化地形(高斯山丘近似 + 頂點著色),不使用 DEM
- 引擎 v1 即支援:**陸地高度場 + 水面平面**(赤壁為水戰,水面是一等公民)
- 單位類型至少兩種:`infantry`(陸軍方陣)/ `fleet`(船隊)
- 火攻特效(粒子火焰 + 延燒)為赤壁高潮戲,列入引擎能力
- 繁體中文介面

## 三、檔案結構

```
warboard-theater/
├── index.html              # 節目單(選單頁)
├── theater.html            # 推演引擎頁(?battle=chibi)
├── engine/                 # 共用引擎:場景、地形、單位、導播、時間軸、UI、音效
├── battles/
│   ├── manifest.json       # 戰役總表(輕量索引,選單頁讀這個)
│   └── chibi/
│       ├── battle.json     # 戰役主檔(卡片資訊、陣營、地形參數)
│       ├── events.json     # 時間軸事件
│       └── assets/
│           ├── commander_*.png   # 主帥肖像(AI 生成統一畫風)
│           └── poster_bg.jpg     # 海報背景(可選)
```

## 四、資料 Schema(草案,實作時可調)

### manifest.json(選單索引)
```json
{
  "battles": [
    {
      "id": "chibi",
      "title": "赤壁之戰",
      "year": "208",
      "poster": "battles/chibi/assets/poster_bg.jpg",
      "status": "ready"
    }
  ]
}
```
- `status`: `ready` / `coming_soon`(即將上演卡片做半透明)

### battle.json(戰役主檔)
```json
{
  "id": "chibi",
  "title": "赤壁之戰",
  "subtitle": "火燒連環 ─ 三分天下的一夜",
  "year": "208",
  "date_display": "建安十三年冬",
  "duration_label": "約一夜",
  "narrative_basis": "三國演義",
  "factions": [
    {
      "id": "wei",
      "name": "曹軍",
      "commanders": [
        { "name": "曹操", "portrait": "assets/commander_caocao.png" }
      ],
      "strength": "號稱 800,000(實約 200,000)",
      "color": "#3a5fa0"
    },
    {
      "id": "allied",
      "name": "孫劉聯軍",
      "commanders": [
        { "name": "周瑜", "portrait": "assets/commander_zhouyu.png" },
        { "name": "諸葛亮", "portrait": "assets/commander_zhugeliang.png" }
      ],
      "strength": "約 50,000",
      "color": "#c0392b"
    }
  ],
  "result": "孫劉聯軍勝利",
  "terrain": { "...": "地形生成參數:水面範圍(長江)、兩岸丘陵、烏林、赤壁磯等" },
  "units": [
    { "id": "cao_fleet", "faction": "wei", "type": "fleet", "label": "曹軍連環船隊", "spawn": [0, 0] }
  ]
}
```
- `factions` 為**陣列**(非 east/west 固定兩欄),`commanders` 為陣列(聯軍雙主帥)
- `color` 貫穿卡片、部隊名牌、結算畫面

### events.json(時間軸事件)
```json
{
  "timeline": { "start": "20:00", "end": "08:00", "scale": "flexible" },
  "events": [
    {
      "t": "21:30",
      "type": "move | engage | fire | defect | rout | narration | camera",
      "unit": "huanggai_fleet",
      "to": [120, 80],
      "title": "黃蓋詐降船隊出發",
      "desc": "東南風起,黃蓋率二十艘火船順風直撲曹軍水寨。",
      "camera_hint": "follow"
    }
  ]
}
```

## 五、引擎功能清單

(操作模式比照 sekigahara.tenz.net)

- 拖曳旋轉 / 滾輪縮放 / 右鍵平移
- Space 播放暫停、0.5×/1×/2×/4× 速度、時間軸拖曳、←→ 跳時間
- 點擊部隊名牌 → 鏡頭飛往該隊
- **自動導播**:事件觸發鏡頭飛往現場;使用者手動操作即暫停自動運鏡,下一事件時導播接管
- 部隊名牌:陣營色、兵力、狀態圖示(進軍 ➤ / 交戰 ◎ / 潰走)
- 旁白字卡(事件 title/desc 顯示)
- 結算畫面:勝負、交戰時間、雙方損失、關鍵轉折,「↺ 重新觀看」
- Web Audio 音效(可後做)
- 錄影友善模式:一鍵隱藏 UI、鎖 16:9(供頻道錄製,優先度低)

## 六、開發階段

目前進度:Phase 4 已完成初步實作。赤壁三章 zh-TW 內容、火攻粒子、箭雨/爆炸 fx、quote 字卡與大氣系統已接入;主帥肖像圖檔由使用者後補,缺圖時字卡退化為文字顯示。

1. **骨架**:已完成。選單頁 + 引擎頁路由、地形生成(含水面)、單位放置與名牌。
2. **時間軸**:已完成。events.json 驅動單位移動/交戰狀態、播放控制。
3. **導播運鏡**:已完成。camera state machine、事件鏡頭、手動接管邏輯、點名牌飛鏡頭。
4. **赤壁內容**:已完成初稿。完整 events.json 分鏡、火攻粒子、箭雨/爆炸 fx、旁白 quote 字卡、大氣系統。
5. **打磨**:待做。選單卡片視覺、結算畫面、war-meter、電影感 overlay、四語補齊、音效、錄影模式。

每階段以 local server 在瀏覽器驗收後再進下一階段。

## 七、第一場戰役:赤壁之戰

### 已定事項
- **演義版**:依《三國演義》敘事(含草船借箭、借東風等),介面標註「本推演依《三國演義》敘事」
- 地理採主流**蒲圻說**(今湖北赤壁市),長江江面為主戰場,北岸烏林為曹軍水寨
- 陣營:曹軍 vs 孫劉聯軍(雙主帥:周瑜、諸葛亮)
- 主帥肖像由使用者以 AI 生成統一畫風提供;建議規格:**3:4 直式、胸像、去背 PNG、兩軍視線相對(一左一右)**

### 待決事項(進 Claude Code 後討論)
1. **時間跨度**:
   - 方案 A:只演決戰夜(黃蓋出發 → 火燒連環船 → 曹軍潰走 → 華容道),約 12 小時,節奏最緊
   - 方案 B:含鋪陳(蔣幹盜書、草船借箭、借東風)用彈性時間刻度,鋪陳期大步進、決戰夜細刻度
2. 火攻特效規格(粒子數量、延燒邏輯、效能取捨)
3. 華容道是否做成「尾聲章節」(鏡頭轉場到陸路)
4. 旁白字卡是否搭配演義原文引句

## 八、海報卡片設計

- 構圖:海報背景 + 底部漸層壓暗 + 兩側主帥肖像對峙(中間 VS)+ 標題/年份/一行摘要(如「約一夜 ─ 孫劉聯軍勝利」)
- hover:微放大 + 陣營色邊光
- `coming_soon` 戰役顯示「即將上演」半透明卡

## 九、後續展望(不在 v1 範圍)

- 戰役 JSON 產生器 skill:輸入戰役名 → 產出 events.json,形成內容流水線
- 候選戰役:桶狹間、川中島、官渡、夷陵、滑鐵盧、坎尼;台灣題材(乙未戰爭、牡丹社事件)需自備史料
