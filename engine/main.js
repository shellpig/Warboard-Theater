// main:解析參數、載入戰役 JSON、組裝各模組
import { initI18n, getLang, t, pick, createLangSwitcher } from "./i18n.js";
import { createScene } from "./scene.js";
import { buildTerrain } from "./terrain.js";
import { createUnits } from "./units.js";
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
  const res = await fetch(`battles/${battleId}/battle.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const battle = await res.json();

  document.title = `${pick(battle.title)} — ${t("brand")}`;
  document.querySelector("#battle-title h1").textContent = pick(battle.title);
  document.querySelector("#battle-title p").textContent = [
    pick(battle.subtitle),
    t("based_on", { src: pick(battle.narrative_basis) }),
  ]
    .filter(Boolean)
    .join("　");

  const { scene, camera, renderer, controls } = createScene(stage);
  const terrain = buildTerrain(scene, battle.terrain);
  const units = createUnits(scene, battle, terrain);
  const ui = createUI({ labels, battle, units, terrain, camera, renderer });

  statusMsg.textContent = "";

  renderer.setAnimationLoop(() => {
    controls.update();
    ui.update();
    renderer.render(scene, camera);
  });
}

boot().catch((err) => {
  console.error(err);
  statusMsg.textContent = `${t("load_error")} (${battleId})`;
});
