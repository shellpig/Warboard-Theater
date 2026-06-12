// atmosphere:天色 / 霧 / 光照 / 水色隨模擬時間聯動
//
// 6-B schema(一次性遷移,不留雙軌):
//   sky_top / sky_horizon(取代舊 sky)
//   fog_density(取代舊 fog: [near, far])
// 範例關鍵幀:
//   { "chapter": "prelude", "t": 90, "sky_top": "#8aa4b2", "sky_horizon": "#c0d2dc",
//     "fog_density": 0.0014, "sun": 1.2, "ambient": 0.55, "water": "#1e3444" }
import * as THREE from "three";

export function createAtmosphere({ scene, lights, water, skydome }, defs, chapters) {
  if (!defs?.length) return { update() {} };

  const skyMat = skydome.material;
  const byId = {};
  for (const ch of chapters) byId[ch.id] = ch;

  // 以場景現值為基底,carry-forward 補滿缺欄位
  let cur = {
    skyTop:     skyMat.uniforms.uTop.value.getHex(),
    skyHorizon: skyMat.uniforms.uHorizon.value.getHex(),
    fogDensity: scene.fog.density,
    sun:        lights.sun.intensity,
    sunColor:   lights.sun.color.getHex(),
    ambient:    lights.hemi.intensity,
    waterDeep:  water.material.uniforms.uDeep.value.getHex(),
  };

  const keys = [];
  for (const d of defs) {
    const ch = byId[d.chapter];
    if (!ch) {
      console.warn(`atmosphere: 未知章節 "${d.chapter}",忽略`, d);
      continue;
    }
    cur = {
      skyTop:     d.sky_top     != null ? new THREE.Color(d.sky_top).getHex()     : cur.skyTop,
      skyHorizon: d.sky_horizon != null ? new THREE.Color(d.sky_horizon).getHex() : cur.skyHorizon,
      fogDensity: d.fog_density ?? cur.fogDensity,
      sun:        d.sun ?? cur.sun,
      sunColor:   d.sun_color != null ? new THREE.Color(d.sun_color).getHex() : cur.sunColor,
      ambient:    d.ambient ?? cur.ambient,
      waterDeep:  d.water != null ? new THREE.Color(d.water).getHex() : cur.waterDeep,
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

    // skydome uniforms
    lerpCol(skyMat.uniforms.uTop.value,     a.v.skyTop,     b.v.skyTop);
    lerpCol(skyMat.uniforms.uHorizon.value, a.v.skyHorizon, b.v.skyHorizon);

    // 霧色跟隨地平線色,密度插值
    scene.fog.color.copy(skyMat.uniforms.uHorizon.value);
    scene.fog.density = lerp(a.v.fogDensity, b.v.fogDensity);

    // 光照
    lights.sun.intensity = lerp(a.v.sun, b.v.sun);
    lerpCol(lights.sun.color, a.v.sunColor, b.v.sunColor);
    lights.hemi.intensity = lerp(a.v.ambient, b.v.ambient);

    // 水面 shader — uDeep 插值，uLit 由 uDeep 衍生（波峰亮色）
    lerpCol(water.material.uniforms.uDeep.value, a.v.waterDeep, b.v.waterDeep);
    const lit = water.material.uniforms.uLit.value;
    lit.copy(water.material.uniforms.uDeep.value).multiplyScalar(1.6);
    lit.r = Math.min(1, lit.r);
    lit.g = Math.min(1, lit.g);
    lit.b = Math.min(1, lit.b);
  }

  return { update };
}
