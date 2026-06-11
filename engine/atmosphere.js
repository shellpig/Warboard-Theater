// atmosphere:天色 / 霧 / 光照 / 水色隨模擬時間聯動(赤壁:晝 → 夜 → 黎明)
//
// 資料來源:events.json 頂層 "atmosphere" 關鍵幀陣列
//   { "chapter": "fire_attack", "t": 0, "sky": "#121826", "fog": [800, 2400],
//     "sun": 0.22, "sun_color": "#8fa6c8", "ambient": 0.32, "water": "#141f2b" }
// t = 章內分鐘(與事件同制);缺欄位沿用前一關鍵幀(carry-forward),
// 首關鍵幀之前 / 末關鍵幀之後取端點值;無資料時引擎維持 scene.js 預設。
import * as THREE from "three";

export function createAtmosphere({ scene, lights, water }, defs, chapters) {
  if (!defs?.length) return { update() {} };

  const byId = {};
  for (const ch of chapters) byId[ch.id] = ch;

  // 以場景現值為基底,carry-forward 補滿缺欄位 → 完整關鍵幀
  let cur = {
    sky: scene.background.getHex(),
    fogNear: scene.fog.near,
    fogFar: scene.fog.far,
    sun: lights.sun.intensity,
    sunColor: lights.sun.color.getHex(),
    ambient: lights.hemi.intensity,
    water: water.material.color.getHex(),
  };
  const keys = [];
  for (const d of defs) {
    const ch = byId[d.chapter];
    if (!ch) {
      console.warn(`atmosphere: 未知章節 "${d.chapter}",忽略`, d);
      continue;
    }
    cur = {
      sky: d.sky != null ? new THREE.Color(d.sky).getHex() : cur.sky,
      fogNear: d.fog != null ? d.fog[0] : cur.fogNear,
      fogFar: d.fog != null ? d.fog[1] : cur.fogFar,
      sun: d.sun ?? cur.sun,
      sunColor: d.sun_color != null ? new THREE.Color(d.sun_color).getHex() : cur.sunColor,
      ambient: d.ambient ?? cur.ambient,
      water: d.water != null ? new THREE.Color(d.water).getHex() : cur.water,
    };
    keys.push({ p: ch.start + (d.t / ch.durationMin) * ch.len, v: cur });
  }
  keys.sort((a, b) => a.p - b.p);
  if (!keys.length) return { update() {} };

  const colA = new THREE.Color();
  const colB = new THREE.Color();

  function update(p) {
    let a = keys[0];
    let b = keys[0];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].p <= p) {
        a = keys[i];
        b = keys[i + 1] ?? keys[i];
      } else break;
    }
    const f = b.p > a.p ? Math.min((p - a.p) / (b.p - a.p), 1) : 0;
    const lerp = (x, y) => x + (y - x) * f;
    const lerpCol = (target, x, y) =>
      target.copy(colA.setHex(x)).lerp(colB.setHex(y), f);

    lerpCol(scene.background, a.v.sky, b.v.sky);
    scene.fog.color.copy(scene.background);
    scene.fog.near = lerp(a.v.fogNear, b.v.fogNear);
    scene.fog.far = lerp(a.v.fogFar, b.v.fogFar);
    lights.sun.intensity = lerp(a.v.sun, b.v.sun);
    lerpCol(lights.sun.color, a.v.sunColor, b.v.sunColor);
    lights.hemi.intensity = lerp(a.v.ambient, b.v.ambient);
    lerpCol(water.material.color, a.v.water, b.v.water);
  }

  return { update };
}
