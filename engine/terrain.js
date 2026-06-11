// terrain:高斯山丘高度場 + 頂點著色 + canvas 程序化貼圖 + 水面
import * as THREE from "three";

export function buildTerrain(scene, def) {
  const [sizeX, sizeZ] = def.size;
  const waterLevel = def.water_level ?? 0;
  const base = waterLevel - 10;
  const hills = (def.hills || []).map((h) => ({
    x: h.pos[0],
    z: h.pos[1],
    height: h.height,
    sigma2: 2 * Math.pow(h.radius / 2.5, 2),
  }));

  function heightAt(x, z) {
    let y = base;
    for (const h of hills) {
      const dx = x - h.x;
      const dz = z - h.z;
      y += h.height * Math.exp(-(dx * dx + dz * dz) / h.sigma2);
    }
    // 兩岸背景陸地底板:距河道 350 外平滑升起,確保延伸區為連續大陸而非孤島
    const bankDist = Math.abs(z) - 350;
    if (bankDist > 0) {
      const bankFloor = Math.min(15, bankDist / 25);
      y = Math.max(y, bankFloor);
    }
    return y;
  }

  // 依高度分層著色:河床 → 岸沙 → 平原 → 丘陵 → 岩頂
  const stops = [
    { h: waterLevel - 10, c: new THREE.Color(0x2e3a2f) },
    { h: waterLevel - 1.5, c: new THREE.Color(0x4d573e) },
    { h: waterLevel + 2, c: new THREE.Color(0xb3a275) },
    { h: waterLevel + 12, c: new THREE.Color(0x7d9454) },
    { h: waterLevel + 30, c: new THREE.Color(0x687b41) },
    { h: waterLevel + 48, c: new THREE.Color(0x796b4e) },
    { h: waterLevel + 72, c: new THREE.Color(0x8e8679) },
  ];

  function colorAt(h, out) {
    if (h <= stops[0].h) return out.copy(stops[0].c);
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i].h) {
        const f = (h - stops[i - 1].h) / (stops[i].h - stops[i - 1].h);
        return out.lerpColors(stops[i - 1].c, stops[i].c, f);
      }
    }
    return out.copy(stops[stops.length - 1].c);
  }

  const hash01 = (x, z) => {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // 地形向外延伸每邊(render mesh = 2×),避免使用者看到邊界空曠
  const renderX = sizeX * 2;
  const renderZ = sizeZ * 2;
  const geo = new THREE.PlaneGeometry(renderX, renderZ, 480, 300);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    colorAt(h, tmp);
    const b = 0.92 + 0.16 * hash01(x, z);
    colors[i * 3] = tmp.r * b;
    colors[i * 3 + 1] = tmp.g * b;
    colors[i * 3 + 2] = tmp.b * b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: groundTexture(renderX, renderZ, waterLevel, heightAt, def),
    roughness: 1,
    metalness: 0,
  });
  applyEdgeFade(groundMat, renderX / 2, renderZ / 2);
  const ground = new THREE.Mesh(geo, groundMat);
  scene.add(ground);

  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x35596d,
    transparent: true,
    opacity: 0.84,
    roughness: 0.28,
    metalness: 0.05,
  });
  applyEdgeFade(waterMat, renderX / 2, renderZ / 2);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(renderX, renderZ).rotateX(-Math.PI / 2),
    waterMat
  );
  water.position.y = waterLevel;
  scene.add(water);

  buildTrees(scene, sizeX, sizeZ, heightAt, waterLevel, def.forests);

  return { ground, water, heightAt, waterLevel };
}

// 低面數樹木：InstancedMesh 圓錐葉冠 + 圓柱幹，固定 seed 散佈
function buildTrees(scene, sizeX, sizeZ, heightAt, waterLevel, forests) {
  const COUNT = 700;
  const rangeX = sizeX * 0.75;
  const rangeZ = sizeZ * 0.75;

  function h01(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  const foliageGeo = new THREE.ConeGeometry(9, 22, 6);
  const trunkGeo = new THREE.CylinderGeometry(1.8, 2.4, 10, 4);
  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x3a6b28, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3d22 });

  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, COUNT);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  foliage.frustumCulled = false;
  trunks.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let n = 0;

  for (let i = 0; i < COUNT * 14 && n < COUNT; i++) {
    const x = (h01(i * 2.31, 0.17) - 0.5) * 2 * rangeX;
    const z = (h01(i * 3.79, 0.53) - 0.5) * 2 * rangeZ;
    const gh = heightAt(x, z);

    if (gh < waterLevel + 1.8) continue;

    // 密度依高度：高地最密、緩坡次之、近岸稀疏
    let density = gh > waterLevel + 22 ? 0.88
                : gh > waterLevel + 9  ? 0.58
                :                        0.22;

    // 資料定義的森林區加密
    if (forests) {
      for (const f of forests) {
        const dx = x - f.pos[0], dz = z - f.pos[1];
        if (dx * dx + dz * dz < f.radius * f.radius) {
          density = Math.min(1.0, density + 0.38);
          break;
        }
      }
    }

    if (h01(i * 7.13, i * 5.37) > density) continue;

    const scale = 0.8 + h01(i * 11.1, i * 3.3) * 0.65;
    const rot   = h01(i * 17.7, i * 9.1) * Math.PI * 2;
    const trunkH   = 10 * scale;
    const foliageH = 22 * scale;

    dummy.rotation.set(0, rot, 0);
    dummy.scale.setScalar(scale);

    dummy.position.set(x, gh + trunkH * 0.5, z);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);

    dummy.position.set(x, gh + trunkH + foliageH * 0.5, z);
    dummy.updateMatrix();
    foliage.setMatrixAt(n, dummy.matrix);

    n++;
  }

  foliage.count = n;
  trunks.count = n;
  foliage.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;

  scene.add(trunks);
  scene.add(foliage);
}

// 邊緣迷霧：距邊界 15% 範圍以噪點不規則衰減 alpha
function applyEdgeFade(mat, halfX, halfZ) {
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHalfX = { value: halfX };
    shader.uniforms.uHalfZ = { value: halfZ };
    shader.vertexShader = 'varying vec3 vEdgePos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vEdgePos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );
    shader.fragmentShader =
      'varying vec3 vEdgePos;\nuniform float uHalfX;\nuniform float uHalfZ;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      {
        float nx = abs(vEdgePos.x) / uHalfX;
        float nz = abs(vEdgePos.z) / uHalfZ;
        float t = clamp((max(nx, nz) - 0.65) / 0.35, 0.0, 1.0);
        if (t > 0.0) {
          float noise = fract(sin(dot(vEdgePos.xz * 0.009, vec2(127.1, 311.7))) * 43758.5453);
          t = clamp(t + (noise - 0.5) * 0.85, 0.0, 1.0);
        }
        gl_FragColor.a *= 1.0 - t * t * t;
      }`
    );
  };
}

// 程序化貼圖:細顆粒噪點 + 低頻田野色塊 + 岸線漸變 + 營地/道路疊層
function groundTexture(renderX, renderZ, waterLevel, heightAt, terrainDef) {
  const W = 1024;
  const H = 682;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);

  // 低頻田野色塊噪點（大塊農田感）
  const fieldNoise = (x, z) => {
    const s1 = Math.sin(x * 0.0038 + z * 0.0025) * 43758.5453;
    const s2 = Math.sin(x * 0.0016 - z * 0.0051) * 31415.9265;
    return ((s1 - Math.floor(s1)) + (s2 - Math.floor(s2))) * 0.5;
  };

  let p = 0;
  for (let py = 0; py < H; py++) {
    const z = (py / (H - 1) - 0.5) * renderZ;
    for (let px = 0; px < W; px++) {
      const x = (px / (W - 1) - 0.5) * renderX;
      const h = heightAt(x, z);

      // 高頻細顆粒
      const grain = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
      const grainV = (grain - Math.floor(grain)) * 22;

      // 低頻田野 ±20
      const field = (fieldNoise(x, z) - 0.5) * 40;

      let r = 224 + grainV + field;
      let g = 224 + grainV + field;
      let b = 222 + grainV;

      const wdist = h - waterLevel;
      if (wdist < 0) {
        // 河床
        r *= 0.78; g *= 0.88; b *= 0.92;
      } else if (wdist < 2) {
        // 濕沙岸
        r = 212 + grainV * 0.5;
        g = 194 + grainV * 0.5;
        b = 152 + grainV * 0.3;
      } else if (wdist < 7) {
        // 岸線漸變帶
        const f = (wdist - 2) / 5;
        r = r * f + (212 + grainV * 0.5) * (1 - f);
        g = g * f + (194 + grainV * 0.5) * (1 - f);
        b = b * f + (152 + grainV * 0.3) * (1 - f);
      }

      img.data[p++] = Math.min(255, Math.max(0, r));
      img.data[p++] = Math.min(255, Math.max(0, g));
      img.data[p++] = Math.min(255, Math.max(0, b));
      img.data[p++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Canvas 世界座標 → 像素轉換
  const toCanvas = (wx, wz) => [
    (wx / renderX + 0.5) * W,
    (wz / renderZ + 0.5) * H,
  ];

  const def = terrainDef || {};

  // 營地色斑（夯土黃褐）
  for (const camp of (def.camps || [])) {
    const [cx, cz] = toCanvas(camp.pos[0], camp.pos[1]);
    const r = camp.radius * (W / renderX);
    const grad = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
    grad.addColorStop(0,   "rgba(178,145,88,0.55)");
    grad.addColorStop(0.6, "rgba(172,142,90,0.28)");
    grad.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cz, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 道路（夯實小徑，稍亮黃土色）
  for (const road of (def.roads || [])) {
    const pts = road.points.map(([wx, wz]) => toCanvas(wx, wz));
    const lw = Math.max(2, (road.width ?? 40) * (W / renderX));
    ctx.strokeStyle = "rgba(198,168,110,0.42)";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
