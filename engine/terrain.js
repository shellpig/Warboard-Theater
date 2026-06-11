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

  // 地形向外延伸 25% 每邊(render mesh = 1.5×),避免使用者看到邊界空曠
  const renderX = sizeX * 1.5;
  const renderZ = sizeZ * 1.5;
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

  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: groundTexture(renderX, renderZ, waterLevel, heightAt),
      roughness: 1,
      metalness: 0,
    })
  );
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(renderX, renderZ).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x35596d,
      transparent: true,
      opacity: 0.84,
      roughness: 0.28,
      metalness: 0.05,
    })
  );
  water.position.y = waterLevel;
  scene.add(water);

  return { ground, water, heightAt, waterLevel };
}

// 程序化貼圖:細顆粒噪點 + 濕岸線壓暗(與頂點色相乘)
function groundTexture(sizeX, sizeZ, waterLevel, heightAt) {
  const W = 1024;
  const H = 682;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  let p = 0;
  for (let py = 0; py < H; py++) {
    const z = (py / (H - 1) - 0.5) * sizeZ;
    for (let px = 0; px < W; px++) {
      const x = (px / (W - 1) - 0.5) * sizeX;
      const h = heightAt(x, z);
      const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const noise = (s - Math.floor(s)) * 26;
      let r = 226 + noise;
      let g = 226 + noise;
      let b = 224 + noise;
      if (h < waterLevel) {
        r *= 0.8;
        g *= 0.9;
      } else if (h < waterLevel + 2.5) {
        r *= 0.84;
        g *= 0.84;
        b *= 0.8;
      }
      img.data[p++] = r;
      img.data[p++] = g;
      img.data[p++] = b;
      img.data[p++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
