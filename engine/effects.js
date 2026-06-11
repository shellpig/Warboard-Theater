// effects:火攻粒子(火焰 + 煙柱)、水面火光、火光點光源、箭雨曳光、爆炸
//
// 兩類驅動方式(維持「狀態 = 時間純函數」原則):
// - 持續火源(timeline.burns,fire 事件編譯):依播放時間判斷燃燒區間,
//   區間內以實際時間隨機發射粒子;seek 離開區間即停止發射,殘粒子自然消散
// - 一次性 fx(timeline.fxShots,事件附帶 fx):箭雨 / 爆炸為播放時間的純函數
//   (亂數以 hash 定種),拖曳、倒帶、跳章皆可重現
// 粒子總量上限約 1.4 萬(火 9000 + 煙 3500 + 箭雨/爆炸 1500),符合規格 1~2 萬
import * as THREE from "three";

const FIRE_MAX = 9000;
const SMOKE_MAX = 3500;
const SHOT_MAX = 1500;
const LIGHT_POOL = 3;
const WIND = [-7, -9]; // 東南風:煙向西北飄(x = 東、z = 南)
const VOLLEY_DUR = 2.4; // 箭雨總時長(播放秒,含齊射散佈)
const EXPLOSION_DUR = 1.0;
const RING_DUR = 4.5; // 衝擊環總時長(播放秒)

export function createEffects(scene, { timeline, clock, terrain }) {
  const fire = new ParticlePool(scene, FIRE_MAX, {
    blending: THREE.AdditiveBlending,
    rampIn: 0.1,
    rampOut: 0.55,
    fadeColor: true,
  });
  const smoke = new ParticlePool(scene, SMOKE_MAX, {
    blending: THREE.NormalBlending,
    rampIn: 0.25,
    rampOut: 0.45,
    fadeColor: false,
  });
  const shots = new ImmediateBatch(scene, SHOT_MAX);

  // 發射量小數累積(每火源 [火, 煙] 兩欄)
  const acc = new Float32Array(timeline.burns.length * 2);

  // 水面火光(每火源一面 additive 漸層片)與火光點光源池
  const glows = timeline.burns.map(() => null);
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const l = new THREE.PointLight(0xff7733, 0, 1800, 2);
    scene.add(l);
    lights.push(l);
  }

  const warned = new Set();
  function warnOnce(key, msg, data) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(msg, data ?? "");
  }

  // 火源錨點:綁單位 → posAt(隨單位移動);pos → 固定點
  function anchorOf(b, p) {
    let x, z;
    if (b.unit) {
      const v = timeline.posAt(b.unit, p);
      if (!Array.isArray(v)) {
        warnOnce(`burn:${b.unit}`, `effects: fire 事件引用未知單位 "${b.unit}",忽略`);
        return null;
      }
      [x, z] = v;
    } else {
      [x, z] = b.pos;
    }
    const ground = terrain.heightAt(x, z);
    return { x, z, y: Math.max(ground, terrain.waterLevel), onWater: ground < terrain.waterLevel + 0.5 };
  }

  function emitBurn(b, idx, a, dt) {
    const spread = b.unit ? 34 : 24;
    // 火焰
    acc[idx * 2] += dt * 520 * b.intensity;
    let n = Math.min(Math.floor(acc[idx * 2]), 90);
    acc[idx * 2] -= Math.floor(acc[idx * 2]);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spread;
      fire.spawn(
        a.x + Math.cos(ang) * rad, a.y + 1 + Math.random() * 3, a.z + Math.sin(ang) * rad,
        (Math.random() - 0.5) * 7 + WIND[0] * 0.25, 10 + Math.random() * 14, (Math.random() - 0.5) * 7 + WIND[1] * 0.25,
        0.7 + Math.random() * 0.8, 7 + Math.random() * 9, 4,
        1, 0.45 + Math.random() * 0.4, 0.08 + Math.random() * 0.12, 0.8
      );
    }
    // 煙柱
    acc[idx * 2 + 1] += dt * 55 * b.intensity;
    n = Math.min(Math.floor(acc[idx * 2 + 1]), 20);
    acc[idx * 2 + 1] -= Math.floor(acc[idx * 2 + 1]);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spread * 0.7;
      const g = 0.13 + Math.random() * 0.07;
      smoke.spawn(
        a.x + Math.cos(ang) * rad, a.y + 10 + Math.random() * 10, a.z + Math.sin(ang) * rad,
        WIND[0] + (Math.random() - 0.5) * 4, 7 + Math.random() * 6, WIND[1] + (Math.random() - 0.5) * 4,
        3.5 + Math.random() * 3, 13 + Math.random() * 9, 5,
        g, g, g, 0.3
      );
    }
  }

  function glowTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255, 150, 60, 1)");
    grad.addColorStop(0.4, "rgba(255, 100, 35, 0.45)");
    grad.addColorStop(1, "rgba(255, 80, 20, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }
  let glowTex = null;

  function updateGlow(idx, a, b, now) {
    if (!a.onWater) return;
    let g = glows[idx];
    if (!g) {
      glowTex ??= glowTexture();
      g = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      scene.add(g);
      glows[idx] = g;
    }
    const flick = 0.85 + 0.15 * Math.sin(now * 9 + idx * 2.1) * Math.sin(now * 4.7 + idx);
    g.visible = true;
    g.position.set(a.x, terrain.waterLevel + 0.6, a.z);
    const s = 156 * Math.sqrt(b.intensity) * flick;
    g.scale.set(s, 1, s);
    g.material.opacity = 0.4 * Math.min(b.intensity, 1.2) * flick;
  }

  // --- 一次性 fx:播放時間純函數,每幀重繪 ---
  const hash01 = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  function shotAnchor(shot, field) {
    if (Array.isArray(shot[field])) return shot[field];
    const id = shot[field] ?? shot.unit;
    const v = id != null ? timeline.posAt(id, shot.p) : null;
    if (!Array.isArray(v)) {
      warnOnce(`fx:${shot.kind}:${shot.p}`, `effects: fx "${shot.kind}" 缺少可解析的單位/座標,忽略`, shot);
      return null;
    }
    return v;
  }

  function drawVolley(shot, p) {
    const from = shotAnchor(shot, "from");
    const to = shotAnchor(shot, "to");
    if (!from || !to) return;
    const y0 = Math.max(terrain.heightAt(from[0], from[1]), terrain.waterLevel) + 10;
    const y1 = Math.max(terrain.heightAt(to[0], to[1]), terrain.waterLevel) + 6;
    const count = Math.min(shot.count ?? 120, 300);
    const seed = shot.p * 7.13;
    for (let i = 0; i < count; i++) {
      const r = (k) => hash01(seed + i * 8 + k);
      const t0 = shot.p + r(0) * (VOLLEY_DUR - 1.6);
      const dur = 1.1 + r(1) * 0.5;
      const s = (p - t0) / dur;
      if (s <= 0 || s >= 1) continue;
      const sx = from[0] + (r(2) - 0.5) * 180;
      const sz = from[1] + (r(3) - 0.5) * 120;
      const ex = to[0] + (r(4) - 0.5) * 140;
      const ez = to[1] + (r(5) - 0.5) * 100;
      const arc = 55 + r(6) * 60;
      const px = sx + (ex - sx) * s;
      const pz = sz + (ez - sz) * s;
      const py = y0 + (y1 - y0) * s + Math.sin(Math.PI * s) * arc;
      shots.add(px, py, pz, 3.2, 1, 0.88, 0.6, 0.9);
      // 曳光尾跡
      const s2 = s - 0.045;
      if (s2 > 0) {
        const tx = sx + (ex - sx) * s2;
        const tz = sz + (ez - sz) * s2;
        const ty = y0 + (y1 - y0) * s2 + Math.sin(Math.PI * s2) * arc;
        shots.add(tx, ty, tz, 2.2, 1, 0.8, 0.5, 0.35);
      }
    }
  }

  function drawExplosion(shot, p) {
    const at = shotAnchor(shot, "pos");
    if (!at) return;
    const s = (p - shot.p) / EXPLOSION_DUR;
    const y = Math.max(terrain.heightAt(at[0], at[1]), terrain.waterLevel) + 8;
    const ease = 1 - Math.pow(1 - s, 3);
    const seed = shot.p * 3.71;
    for (let i = 0; i < 42; i++) {
      const r = (k) => hash01(seed + i * 5 + k);
      const theta = r(0) * Math.PI * 2;
      const phi = Math.acos(2 * r(1) - 1);
      const rad = (20 + r(2) * 30) * ease;
      shots.add(
        at[0] + Math.sin(phi) * Math.cos(theta) * rad,
        y + Math.abs(Math.cos(phi)) * rad * 0.7,
        at[1] + Math.sin(phi) * Math.sin(theta) * rad,
        14 * (1 - s) + 3, 1, 0.6 + r(3) * 0.25, 0.25, (1 - s) * 0.9
      );
    }
  }

  function drawRing(shot, p) {
    const at = shotAnchor(shot, "pos");
    if (!at) return;
    const y = Math.max(terrain.heightAt(at[0], at[1]), terrain.waterLevel) + 12;
    const maxRadius = shot.radius ?? 320;
    // 兩波同心環:外環稍延遲,製造層次感
    for (let wave = 0; wave < 2; wave++) {
      const ws = Math.max(0, Math.min(1, (p - shot.p) / RING_DUR - wave * 0.15));
      if (ws <= 0 || ws >= 1) continue;
      const radius = maxRadius * ws;
      const alpha = (1 - ws) * (wave === 0 ? 0.72 : 0.38);
      const count = wave === 0 ? 72 : 48;
      const seed = shot.p * 5.31 + wave * 19;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const jitter = (hash01(seed + i * 3) - 0.5) * 18 * ws;
        const r = radius + jitter;
        const size = (11 + hash01(seed + i * 3 + 1) * 5) * (1 - ws * 0.55);
        shots.add(
          at[0] + Math.cos(angle) * r,
          y + hash01(seed + i * 3 + 2) * 9 * ws,
          at[1] + Math.sin(angle) * r,
          size, 0.72, 0.93, 1.0,
          alpha * (0.6 + hash01(seed + i * 3 + 2) * 0.4)
        );
      }
    }
  }

  let now = 0; // 實際時間累計(火焰閃爍用,暫停時仍持續)

  function update(dt) {
    now += dt;
    const p = clock.time;

    // 持續火源:發射 + 水面火光 + 光源需求
    const lightDemands = [];
    timeline.burns.forEach((b, idx) => {
      const active = p >= b.start && p <= b.end;
      if (!active) {
        if (glows[idx]) glows[idx].visible = false;
        return;
      }
      const a = anchorOf(b, p);
      if (!a) return;
      emitBurn(b, idx, a, dt);
      updateGlow(idx, a, b, now);
      const flick = 0.8 + 0.2 * Math.sin(now * 11 + idx * 3.7) * Math.sin(now * 5.3 + idx);
      lightDemands.push({ x: a.x, y: a.y + 30, z: a.z, w: b.intensity * flick });
    });

    // 一次性 fx:重繪本幀畫面 + 爆炸光
    shots.begin();
    for (const shot of timeline.fxShots) {
      if (shot.kind === "volley") {
        if (p >= shot.p && p <= shot.p + VOLLEY_DUR) drawVolley(shot, p);
      } else if (shot.kind === "explosion") {
        if (p >= shot.p && p <= shot.p + EXPLOSION_DUR) {
          drawExplosion(shot, p);
          const s = (p - shot.p) / EXPLOSION_DUR;
          const at = shotAnchor(shot, "pos");
          if (at) {
            lightDemands.push({
              x: at[0],
              y: Math.max(terrain.heightAt(at[0], at[1]), terrain.waterLevel) + 25,
              z: at[1],
              w: (1 - s) * 3,
            });
          }
        }
      } else if (shot.kind === "ring") {
        if (p >= shot.p && p <= shot.p + RING_DUR) drawRing(shot, p);
      } else {
        warnOnce(`kind:${shot.kind}`, `effects: 未支援的 fx kind "${shot.kind}",忽略`, shot);
      }
    }
    shots.end();

    // 點光源池:分配給最強的前 N 個火光
    lightDemands.sort((a, b) => b.w - a.w);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const d = lightDemands[i];
      const l = lights[i];
      if (!d) {
        l.intensity = 0;
        continue;
      }
      l.position.set(d.x, d.y, d.z);
      l.intensity = 16000 * d.w;
    }

    fire.update(dt);
    smoke.update(dt);
  }

  return { update };
}

// ---------------------------------------------------------------------------
// 粒子池:swap-remove 緊湊存活區,position 原地積分,渲染屬性每幀重算
class ParticlePool {
  constructor(scene, max, { blending, rampIn, rampOut, fadeColor }) {
    this.max = max;
    this.alive = 0;
    this.rampIn = rampIn;
    this.rampOut = rampOut;
    this.fadeColor = fadeColor;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.alphaBase = new Float32Array(max);
    this.aCol = new Float32Array(max * 3);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    this.points = makePoints(this.pos, this.aCol, this.aSize, this.aAlpha, blending);
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha) {
    if (this.alive >= this.max) return; // 滿池丟棄(上限保護)
    const i = this.alive++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.alphaBase[i] = alpha;
  }

  copyFrom(src, dst) {
    for (let k = 0; k < 3; k++) {
      this.pos[dst * 3 + k] = this.pos[src * 3 + k];
      this.vel[dst * 3 + k] = this.vel[src * 3 + k];
      this.col[dst * 3 + k] = this.col[src * 3 + k];
    }
    this.life[dst] = this.life[src];
    this.maxLife[dst] = this.maxLife[src];
    this.size0[dst] = this.size0[src];
    this.grow[dst] = this.grow[src];
    this.alphaBase[dst] = this.alphaBase[src];
  }

  update(dt) {
    let n = this.alive;
    for (let i = 0; i < n; ) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this.copyFrom(n, i);
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      i++;
    }
    this.alive = n;

    for (let i = 0; i < n; i++) {
      const age = 1 - this.life[i] / this.maxLife[i];
      const up = Math.min(age / this.rampIn, 1);
      const down = Math.min((1 - age) / this.rampOut, 1);
      this.aAlpha[i] = this.alphaBase[i] * up * down;
      this.aSize[i] = this.size0[i] + this.grow[i] * age * this.maxLife[i];
      const dim = this.fadeColor ? 0.35 + 0.65 * down : 1;
      this.aCol[i * 3] = this.col[i * 3] * dim;
      this.aCol[i * 3 + 1] = this.col[i * 3 + 1] * dim;
      this.aCol[i * 3 + 2] = this.col[i * 3 + 2] * dim;
    }
    flushPoints(this.points, n);
  }
}

// 一次性 fx 批次:每幀 begin/add/end 重建(內容為播放時間的純函數)
class ImmediateBatch {
  constructor(scene, max) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.points = makePoints(this.pos, this.col, this.size, this.alpha, THREE.AdditiveBlending);
    scene.add(this.points);
  }

  begin() {
    this.n = 0;
  }

  add(x, y, z, size, r, g, b, alpha) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.alpha[i] = alpha;
  }

  end() {
    flushPoints(this.points, this.n);
  }
}

function makePoints(pos, col, size, alpha, blending) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: { uPx: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      uniform float uPx;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vAlpha = aAlpha;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx * (480.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float soft = smoothstep(0.5, 0.12, d);
        float a = vAlpha * soft;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

function flushPoints(points, count) {
  const attrs = points.geometry.attributes;
  attrs.position.needsUpdate = true;
  attrs.aColor.needsUpdate = true;
  attrs.aSize.needsUpdate = true;
  attrs.aAlpha.needsUpdate = true;
  points.geometry.setDrawRange(0, count);
}
