// ui:部隊名牌 + 地名標籤(DOM overlay,worldToPx 投影)
import * as THREE from "three";
import { t, pick } from "./i18n.js";

export function createUI({ labels, battle, units, terrain, camera, renderer }) {
  const tracked = [];

  for (const u of units) {
    const el = document.createElement("div");
    el.className = "unit-plate";
    el.style.borderLeftColor = u.color;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = u.label;
    const troops = document.createElement("div");
    troops.className = "troops";
    troops.textContent = `${t("troops")} ${u.troops.toLocaleString()}`;
    el.append(name, troops);
    el.style.display = "none";
    labels.appendChild(el);
    tracked.push({ el, pos: u.anchor });
  }

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

  const v = new THREE.Vector3();
  function update() {
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
  }

  return { update };
}
