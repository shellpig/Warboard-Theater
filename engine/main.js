// main:解析參數、載入戰役 JSON、組裝各模組
import { initI18n, getLang, t, pick, createLangSwitcher } from "./i18n.js";
import { createScene } from "./scene.js";
import { buildTerrain } from "./terrain.js";
import { createUnits } from "./units.js";
import { compileTimeline, createClock } from "./timeline.js";
import { createDirector } from "./director.js";
import { createEffects } from "./effects.js";
import { createAtmosphere } from "./atmosphere.js";
import { createAudio } from "./audio.js";
import { createUI } from "./ui.js";

initI18n();

const params = new URLSearchParams(location.search);
const battleId = (params.get("battle") || "chibi").replace(/[^\w-]/g, "");

const stage = document.getElementById("stage");
const labels = document.getElementById("labels");
const statusMsg = document.getElementById("status-msg");

const backLink = document.getElementById("back-link");
backLink.textContent = "‹ " + t("back_to_menu");
backLink.href = "index.html?lang=" + getLang();
document.getElementById("lang-slot").appendChild(createLangSwitcher());

async function boot() {
  statusMsg.textContent = t("loading");
  const [battle, events] = await Promise.all(
    ["battle.json", "events.json"].map(async (f) => {
      const res = await fetch(`battles/${battleId}/${f}`);
      if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
      return res.json();
    })
  );

  document.title = `${pick(battle.title)} — ${t("brand")}`;
  document.querySelector("#battle-title h1").textContent = pick(battle.title);
  document.querySelector("#battle-title p").textContent = [
    pick(battle.subtitle),
    t("based_on", { src: pick(battle.narrative_basis) }),
  ]
    .filter(Boolean)
    .join("　");

  const { scene, camera, renderer, controls, lights } = createScene(stage);
  const terrain = buildTerrain(scene, battle.terrain);
  const units = createUnits(scene, battle, terrain);
  const timeline = compileTimeline(events, battle);
  const clock = createClock(timeline.total);
  const director = createDirector({ camera, controls, units, timeline, clock, terrain });
  const effects = createEffects(scene, { timeline, clock, terrain });
  const atmosphere = createAtmosphere({ scene, lights, water: terrain.water }, events.atmosphere, timeline.chapters);
  const audio = createAudio({ timeline, clock, battle });
  const ui = createUI({
    labels,
    hud: document.getElementById("hud"),
    card: document.getElementById("event-card"),
    battle,
    units,
    terrain,
    camera,
    renderer,
    timeline,
    clock,
    director,
    audio,
  });

  statusMsg.textContent = "";

  // 單位狀態 = 時間的純函數:每幀以 posAt / opacityAt 套用全場狀態
  const positions = {};
  function applyTime(p) {
    for (const u of units) {
      const [x, z] = timeline.posAt(u.id, p);
      const last = positions[u.id];
      if (!last || last[0] !== x || last[1] !== z) {
        positions[u.id] = [x, z];
        u.setPos(x, z);
      }
      u.setOpacity(timeline.opacityAt(u.id, p));
    }
  }

  let prevMs;
  renderer.setAnimationLoop((ms) => {
    const dt = prevMs == null ? 0 : (ms - prevMs) / 1000;
    prevMs = ms;
    const step = Math.min(dt, 0.25); // 分頁切回時避免大步跳躍
    clock.tick(step);
    applyTime(clock.time);
    atmosphere.update(clock.time);
    effects.update(step);
    audio.update(step);
    director.update(step);
    controls.update();
    ui.update();
    renderer.render(scene, camera);
  });
}

boot().catch((err) => {
  console.error(err);
  statusMsg.textContent = `${t("load_error")} (${battleId})`;
});
