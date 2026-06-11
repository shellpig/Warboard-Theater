// ui:部隊名牌、地名標籤(DOM overlay,worldToPx 投影)、旁白字卡、
//    控制列(播放/速度/全域時間軸)、章節列表、鍵盤操作
import * as THREE from "three";
import { t, pick, getLang } from "./i18n.js";

const SPEEDS = [0.5, 1, 2, 4];
const SKIP_SEC = 5; // ←→ 跳時間(全域播放秒)

export function createUI({ labels, hud, card, battle, units, terrain, camera, renderer, timeline, clock, director }) {
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
  playBtn.addEventListener("click", () => clock.toggle());

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

  bar.append(playBtn, track, timeLabel, speedGroup);
  hud.append(chapterRow, bar);

  // --- 鍵盤 ---
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if (tag === "BUTTON") e.target.blur(); // 防止 Space 重複觸發剛點過的按鈕
    if (e.code === "Space") {
      e.preventDefault();
      clock.toggle();
    } else if (e.code === "ArrowRight") {
      clock.seek(clock.time + SKIP_SEC);
    } else if (e.code === "ArrowLeft") {
      clock.seek(clock.time - SKIP_SEC);
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
