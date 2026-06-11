// ui:部隊名牌、地名標籤(DOM overlay,worldToPx 投影)、旁白字卡、
//    控制列(播放/速度/全域時間軸)、章節列表、鍵盤操作
import * as THREE from "three";
import { t, pick, getLang } from "./i18n.js";

const SPEEDS = [0.5, 1, 2, 4];
const SKIP_SEC = 5; // ←→ 跳時間(全域播放秒)

export function createUI({ labels, hud, card, battle, units, terrain, camera, renderer, timeline, clock, director, audio }) {
  const tracked = [];

  // --- 部隊名牌 ---
  const plates = [];
  for (const u of units) {
    const el = document.createElement("div");
    el.className = "unit-plate";
    el.style.borderLeftColor = u.color;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = u.label;
    const troops = document.createElement("div");
    troops.className = "troops";
    const badge = document.createElement("span");
    badge.className = "badge";
    name.appendChild(badge);
    el.append(name, troops);
    el.style.display = "none";
    el.addEventListener("click", () => director.flyToUnit(u.id)); // 點名牌飛鏡頭
    labels.appendChild(el);
    tracked.push({ el, pos: u.anchor });
    plates.push({ unit: u, el, troopsEl: troops, badgeEl: badge, lastTroops: -1, lastState: "" });
  }

  // --- 地名標籤 ---
  for (const lm of battle.terrain.landmarks || []) {
    const el = document.createElement("div");
    el.className = `landmark ${lm.type || ""}`;
    el.textContent = pick(lm.name);
    el.style.display = "none";
    labels.appendChild(el);
    const [x, z] = lm.pos;
    const y = lm.type === "river" ? terrain.waterLevel + 2 : terrain.heightAt(x, z) + 3;
    tracked.push({ el, pos: new THREE.Vector3(x, y, z) });
  }

  // --- 旁白字卡(lower-third:speaker 頭像 + 名字 + title/desc + quote 原文)---
  // speaker → battle.factions[].commanders;肖像缺圖時退化為純名字
  const commanders = {};
  for (const f of battle.factions || []) {
    for (const c of f.commanders || []) {
      commanders[c.id] = {
        name: c.name,
        portrait: c.portrait ? `battles/${battle.id}/${c.portrait}` : null,
        color: f.color,
      };
    }
  }

  const portraitImg = document.createElement("img");
  portraitImg.className = "card-portrait";
  portraitImg.alt = "";
  portraitImg.addEventListener("error", () => (portraitImg.style.display = "none"));
  const cardMain = document.createElement("div");
  cardMain.className = "card-main";
  const speakerEl = document.createElement("div");
  speakerEl.className = "card-speaker";
  const cardTitle = document.createElement("div");
  cardTitle.className = "card-title";
  const cardDesc = document.createElement("div");
  cardDesc.className = "card-desc";
  const quoteEl = document.createElement("div");
  quoteEl.className = "card-quote";
  const quoteText = document.createElement("span");
  quoteText.className = "quote-text";
  const quoteSource = document.createElement("span");
  quoteSource.className = "quote-source";
  const quoteTrans = document.createElement("div");
  quoteTrans.className = "quote-trans";
  quoteEl.append(quoteText, quoteSource, quoteTrans);
  cardMain.append(speakerEl, cardTitle, cardDesc, quoteEl);
  card.append(portraitImg, cardMain);
  card.style.display = "none";
  let lastCard = null;

  function renderCard(ev) {
    const sp = ev.speaker ? commanders[ev.speaker] : null;
    if (sp) {
      speakerEl.textContent = pick(sp.name);
      speakerEl.style.borderLeftColor = sp.color;
      speakerEl.style.display = "";
    } else {
      speakerEl.style.display = "none";
    }
    if (sp?.portrait) {
      portraitImg.style.display = ""; // 先恢復顯示;載入失敗由 error 事件再隱藏
      if (portraitImg.dataset.src !== sp.portrait) {
        portraitImg.dataset.src = sp.portrait;
        portraitImg.src = sp.portrait;
      }
    } else {
      portraitImg.style.display = "none";
    }
    cardTitle.textContent = pick(ev.title);
    cardDesc.textContent = pick(ev.desc);
    const q = ev.quote;
    if (q?.text) {
      // 演義原文:任何語系都顯示漢文原句;en/ja 可選譯文小字
      quoteText.textContent = `「${q.text}」`;
      quoteSource.textContent = q.source ? `── ${pick(q.source)}` : "";
      quoteTrans.textContent = q.translation?.[getLang()] ?? "";
      quoteEl.style.display = "";
    } else {
      quoteEl.style.display = "none";
    }
  }

  // --- 控制列 DOM ---
  const chapterRow = document.createElement("div");
  chapterRow.id = "chapter-row";
  const chapterBtns = timeline.chapters.map((ch, i) => {
    const b = document.createElement("button");
    b.className = "chapter-btn";
    b.textContent = pick(ch.title);
    b.addEventListener("click", () => clock.seek(ch.start));
    chapterRow.appendChild(b);
    return b;
  });

  const bar = document.createElement("div");
  bar.id = "control-bar";

  const playBtn = document.createElement("button");
  playBtn.id = "play-btn";
  playBtn.addEventListener("click", () => {
    clock.toggle();
    audio.unlock?.();
  });

  const track = document.createElement("div");
  track.id = "tl-track";
  for (const ch of timeline.chapters) {
    const seg = document.createElement("div");
    seg.className = "tl-seg";
    seg.style.width = `${(ch.len / timeline.total) * 100}%`;
    seg.title = pick(ch.title);
    track.appendChild(seg);
  }
  const fill = document.createElement("div");
  fill.id = "tl-fill";
  track.appendChild(fill);

  function seekByPointer(e) {
    const rect = track.getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    clock.seek(f * timeline.total);
  }
  track.addEventListener("pointerdown", (e) => {
    seekByPointer(e);
    try {
      track.setPointerCapture(e.pointerId);
    } catch {} // 合成事件無 active pointer 時略過捕捉
  });
  track.addEventListener("pointermove", (e) => {
    if (track.hasPointerCapture(e.pointerId)) seekByPointer(e);
  });

  const timeLabel = document.createElement("div");
  timeLabel.id = "time-label";

  const speedGroup = document.createElement("div");
  speedGroup.id = "speed-group";
  const speedBtns = SPEEDS.map((s) => {
    const b = document.createElement("button");
    b.className = "speed-btn";
    b.textContent = `${s}×`;
    b.addEventListener("click", () => clock.setSpeed(s));
    speedGroup.appendChild(b);
    return b;
  });

  // --- 控制列附加鍵:音效 / 電影模式(letterbox)/ 錄影模式 ---
  const toast = document.getElementById("toast");
  let toastTimer = 0;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
  }

  const extraGroup = document.createElement("div");
  extraGroup.id = "extra-group";

  const muteBtn = document.createElement("button");
  muteBtn.className = "x-btn";
  muteBtn.textContent = "🔊";
  muteBtn.title = t("sound");
  muteBtn.addEventListener("click", () => {
    audio.setMuted(!audio.muted);
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
  });

  const cinemaBtn = document.createElement("button");
  cinemaBtn.className = "x-btn";
  cinemaBtn.textContent = "▭";
  cinemaBtn.title = t("cinema_mode");
  cinemaBtn.addEventListener("click", () => {
    const on = document.body.classList.toggle("cinema");
    cinemaBtn.classList.toggle("active", on);
  });

  const recordBtn = document.createElement("button");
  recordBtn.className = "x-btn";
  recordBtn.textContent = "🎬";
  recordBtn.title = t("record_mode");
  recordBtn.addEventListener("click", () => setRecord(true));

  function setRecord(on) {
    document.body.classList.toggle("record", on);
    window.dispatchEvent(new Event("resize")); // 鎖 16:9 改變 stage 尺寸,通知 renderer
    if (on) showToast(t("record_hint"));
  }

  extraGroup.append(muteBtn, cinemaBtn, recordBtn);

  bar.append(playBtn, track, timeLabel, speedGroup, extraGroup);
  hud.append(chapterRow, bar);

  // --- 電影感顆粒:程序化噪點貼圖(一次生成,CSS steps 動畫抖動) ---
  {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx2d = cv.getContext("2d");
    const img = ctx2d.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx2d.putImageData(img, 0, 0);
    document.getElementById("grain").style.backgroundImage = `url(${cv.toDataURL()})`;
  }

  // --- war-meter:雙方(side)總兵力 + 各陣營色比例條 ---
  const factionSide = {};
  for (const f of battle.factions || []) factionSide[f.id] = f.side;
  const sideOrder = [...new Set((battle.factions || []).map((f) => f.side))];
  const wmSides = sideOrder.map((side) => {
    const factions = battle.factions.filter((f) => f.side === side);
    return {
      side,
      factions: factions.map((f) => ({
        color: f.color,
        unitIds: (battle.units || []).filter((u) => u.faction === f.id).map((u) => u.id),
      })),
      names: factions.map((f) => pick(f.name)).join("・"),
    };
  });

  const wm = document.getElementById("war-meter");
  let wmSegs = [];
  let wmNums = [];
  if (wmSides.length === 2) {
    const mk = (cls, names) => {
      const el = document.createElement("div");
      el.className = `wm-side ${cls}`;
      const num = document.createElement("span");
      num.className = "wm-num";
      el.append(names, num);
      return { el, num };
    };
    const left = mk("left", wmSides[0].names);
    const right = mk("right", wmSides[1].names);
    const barEl = document.createElement("div");
    barEl.className = "wm-bar";
    for (const s of wmSides) {
      for (const f of s.factions) {
        const seg = document.createElement("div");
        seg.className = "wm-seg";
        seg.style.background = f.color;
        barEl.appendChild(seg);
        wmSegs.push({ seg, f });
      }
    }
    wm.append(left.el, barEl, right.el);
    wmNums = [left.num, right.num];
  } else {
    wm.style.display = "none";
  }

  let wmLastTotals = [-1, -1];
  function updateWarMeter(p) {
    if (wmSides.length !== 2) return;
    let grand = 0;
    const sideTotals = [0, 0];
    for (const { f } of wmSegs) {
      f._cur = 0;
      for (const id of f.unitIds) f._cur += timeline.troopsAt(id, p);
      grand += f._cur;
    }
    wmSides.forEach((s, i) => {
      for (const f of s.factions) sideTotals[i] += f._cur;
    });
    if (sideTotals[0] === wmLastTotals[0] && sideTotals[1] === wmLastTotals[1]) return;
    wmLastTotals = sideTotals;
    wmNums.forEach((n, i) => (n.textContent = sideTotals[i].toLocaleString()));
    for (const { seg, f } of wmSegs) {
      seg.style.width = grand > 0 ? `${(f._cur / grand) * 100}%` : "0%";
    }
  }

  // --- 模擬時刻面板(右上):時辰 + HH:MM 持續走動;
  //     無 clock_start 的章節(跨多日)退回 time_display 粗刻度 ---
  const timePanel = document.getElementById("time-panel");
  const tpDate = document.createElement("div");
  tpDate.className = "tp-date";
  const tpClock = document.createElement("div");
  tpClock.className = "tp-clock";
  timePanel.append(tpDate, tpClock);
  let lastTpText = "";

  function updateTimePanel(p, ci) {
    const cm = timeline.clockAt(p);
    let clockText;
    if (cm != null) {
      const hh = Math.floor(cm / 60);
      const mm = Math.floor(cm % 60);
      const shichen = t("shichen")[Math.floor(((hh + 1) % 24) / 2)];
      clockText = `${shichen} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    } else {
      clockText = pick(timeline.timeDisplayAt(p));
    }
    const dateText = pick(timeline.chapters[ci].date_display);
    const key = `${dateText}|${clockText}`;
    if (key === lastTpText) return;
    lastTpText = key;
    tpDate.textContent = dateText === clockText ? "" : dateText;
    tpClock.textContent = clockText;
  }

  // --- 片頭 title screen:首次播放(或 seek)前顯示 ---
  const titleScreen = document.getElementById("title-screen");
  {
    const h1 = document.createElement("h1");
    h1.textContent = pick(battle.title);
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = pick(battle.subtitle);
    const metaLine = document.createElement("div");
    metaLine.className = "meta-line";
    metaLine.textContent = [pick(battle.date_display), pick(battle.duration_label)]
      .filter(Boolean)
      .join("・");
    const startBtn = document.createElement("button");
    startBtn.className = "start-btn";
    startBtn.textContent = `▶ ${t("start_show")}`;
    startBtn.addEventListener("click", () => {
      clock.play();
      audio.unlock?.();
    });
    titleScreen.append(h1, sub, metaLine, startBtn);
  }
  let titleShown = true;

  // --- 結算 end card:勝負、交戰時間、雙方損失、關鍵轉折、重新觀看 ---
  const endScreen = document.getElementById("end-screen");
  const initialTotals = wmSides.map((s) =>
    s.factions.reduce((sum, f) => sum + f.unitIds.reduce((a, id) => a + timeline.troopsAt(id, 0), 0), 0)
  );
  const endPanel = document.createElement("div");
  endPanel.className = "end-panel";
  endScreen.appendChild(endPanel);
  let endShown = false;

  function renderEndCard(p) {
    endPanel.textContent = "";
    const result = document.createElement("h2");
    result.className = "end-result";
    result.textContent = pick(battle.result);
    endPanel.appendChild(result);

    const row = (label, contentEl) => {
      const r = document.createElement("div");
      r.className = "end-row";
      const lbl = document.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = label;
      r.append(lbl, contentEl);
      endPanel.appendChild(r);
    };

    row(t("end_duration"), document.createTextNode(pick(battle.duration_label)));

    const lossWrap = document.createElement("div");
    lossWrap.className = "end-loss";
    wmSides.forEach((s, i) => {
      const cur = s.factions.reduce(
        (sum, f) => sum + f.unitIds.reduce((a, id) => a + timeline.troopsAt(id, p), 0),
        0
      );
      const side = document.createElement("div");
      side.className = "side";
      side.style.borderLeftColor = s.factions[0]?.color || "#888";
      const name = document.createElement("div");
      name.textContent = s.names;
      const num = document.createElement("div");
      num.className = "num";
      num.textContent = `−${(initialTotals[i] - cur).toLocaleString()}`;
      side.append(name, num);
      lossWrap.appendChild(side);
    });
    row(t("end_losses"), lossWrap);

    if (battle.turning_point) {
      row(t("end_turning"), document.createTextNode(pick(battle.turning_point)));
    }

    const replayBtn = document.createElement("button");
    replayBtn.className = "replay-btn";
    replayBtn.textContent = `↺ ${t("replay")}`;
    replayBtn.addEventListener("click", () => {
      clock.seek(0);
      clock.play();
    });
    endPanel.appendChild(replayBtn);
  }

  // --- 鍵盤 ---
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if (tag === "BUTTON") e.target.blur(); // 防止 Space 重複觸發剛點過的按鈕
    if (e.code === "Space") {
      e.preventDefault();
      clock.toggle();
      audio.unlock?.();
    } else if (e.code === "ArrowRight") {
      clock.seek(clock.time + SKIP_SEC);
    } else if (e.code === "ArrowLeft") {
      clock.seek(clock.time - SKIP_SEC);
    } else if (e.code === "KeyH") {
      setRecord(!document.body.classList.contains("record"));
    }
  });

  const BADGE_KEY = {
    advance: "badge_advance",
    engage: "badge_engage",
    rout: "badge_rout",
    defect: "badge_defect",
    withdraw: "badge_withdraw",
    camp: "badge_camp",
    fire: "badge_fire",
  };

  const v = new THREE.Vector3();
  let lastTimeText = "";
  let lastChapter = -1;
  let lastPlaying = null;
  let lastSpeed = 0;

  function update() {
    const p = clock.time;

    // 名牌投影
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    for (const item of tracked) {
      v.copy(item.pos).project(camera);
      if (v.z < -1 || v.z > 1) {
        item.el.style.display = "none";
        continue;
      }
      item.el.style.display = "";
      const px = (v.x * 0.5 + 0.5) * w;
      const py = (-v.y * 0.5 + 0.5) * h;
      item.el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }

    // 名牌內容:兵力插值 + 狀態徽章(隱形單位連名牌一併隱藏;
    // 投影迴圈每幀已重設 display,此處覆寫即可)
    for (const pl of plates) {
      if (timeline.opacityAt(pl.unit.id, p) < 0.05) {
        pl.el.style.display = "none";
        continue;
      }
      const n = timeline.troopsAt(pl.unit.id, p);
      if (n !== pl.lastTroops) {
        pl.lastTroops = n;
        pl.troopsEl.textContent = `${t("troops")} ${n.toLocaleString()}`;
      }
      const state = timeline.stateAt(pl.unit.id, p);
      if (state !== pl.lastState) {
        pl.lastState = state;
        const key = BADGE_KEY[state];
        pl.badgeEl.textContent = key ? t(key) : "";
        pl.badgeEl.className = `badge ${state}`;
        pl.el.classList.toggle("rout", state === "rout");
      }
    }

    // 字卡:目前章節最後一張
    const c = timeline.cardAt(p);
    if (c !== lastCard) {
      lastCard = c;
      if (c) {
        renderCard(c.ev);
        card.style.display = "";
      } else {
        card.style.display = "none";
      }
    }

    // 時間軸與時間標籤
    fill.style.width = `${(p / timeline.total) * 100}%`;
    const ci = timeline.chapterIndexAt(p);
    const timeText = `${pick(timeline.chapters[ci].title)}・${pick(timeline.timeDisplayAt(p))}`;
    if (timeText !== lastTimeText) {
      lastTimeText = timeText;
      timeLabel.textContent = timeText;
    }
    if (ci !== lastChapter) {
      lastChapter = ci;
      chapterBtns.forEach((b, i) => b.classList.toggle("active", i === ci));
    }

    // 模擬時刻面板與 war-meter
    updateTimePanel(p, ci);
    updateWarMeter(p);

    // 片頭:首次播放或 seek 後淡出(不再重現,重看由結算畫面觸發)
    if (titleShown && (clock.playing || p > 0.001)) {
      titleShown = false;
      titleScreen.classList.add("hidden");
    }

    // 結算:抵達終點顯示;seek 離開即收起
    const atEnd = p >= timeline.total - 1e-3;
    if (atEnd && !endShown) {
      endShown = true;
      renderEndCard(p);
      endScreen.classList.add("show");
    } else if (!atEnd && endShown) {
      endShown = false;
      endScreen.classList.remove("show");
    }

    // 播放鍵與速度鍵狀態
    if (clock.playing !== lastPlaying) {
      lastPlaying = clock.playing;
      playBtn.textContent = clock.playing ? "❚❚" : "▶";
      playBtn.title = clock.playing ? t("pause") : t("play");
    }
    if (clock.speed !== lastSpeed) {
      lastSpeed = clock.speed;
      speedBtns.forEach((b, i) => b.classList.toggle("active", SPEEDS[i] === clock.speed));
    }
  }

  return { update };
}
