// units:單位生成(infantry 方陣方塊群 / fleet 低面數船隊,instanced)+ 陣營色旗幟
// 幾何一律以 local origin 建立,世界位置由 setPos(x, z)(即 posAt 取值)驅動;
// 步兵方陣移動時逐 instance 依 heightAt 貼地,名牌 anchor 隨 setPos 更新。
import * as THREE from "three";
import { pick } from "./i18n.js";

const BOX_GEO = new THREE.BoxGeometry(4, 3, 4);
const HULL_GEO = new THREE.BoxGeometry(6, 3, 18);
const DECK_GEO = new THREE.BoxGeometry(4, 2.5, 8);
const SAIL_GEO = new THREE.PlaneGeometry(7, 9);
const POLE_GEO = new THREE.CylinderGeometry(0.25, 0.25, 1, 6);
const FLAG_GEO = new THREE.PlaneGeometry(11, 6.5);

export function createUnits(scene, battle, terrain) {
  const { heightAt, waterLevel } = terrain;
  const factionById = {};
  for (const f of battle.factions) factionById[f.id] = f;

  const units = [];
  for (const def of battle.units || []) {
    const faction = factionById[def.faction] || {};
    const colorHex = faction.color || "#888888";
    const group = new THREE.Group();
    const materials = [];

    let snapToGround = null; // infantry 專用:依世界座標逐 instance 貼地
    if (def.type === "fleet") {
      buildFleet(group, def, colorHex, waterLevel, materials);
    } else {
      snapToGround = buildInfantry(group, def, colorHex, heightAt, materials);
    }

    const poleH = def.type === "fleet" ? 26 : 20;
    const flagGroup = buildFlag(poleH, colorHex, pick(faction.name).charAt(0) || "?", materials);
    group.add(flagGroup);

    for (const m of materials) m.transparent = true;

    scene.add(group);

    const anchor = new THREE.Vector3();
    let lastOpacity = 1;
    const unit = {
      id: def.id,
      label: pick(def.label),
      troops: def.troops || 0,
      color: colorHex,
      group,
      anchor,
      setPos(x, z) {
        group.position.set(x, 0, z);
        const baseY = def.type === "fleet" ? waterLevel : heightAt(x, z);
        if (snapToGround) snapToGround(x, z);
        flagGroup.position.y = baseY;
        anchor.set(x, baseY + poleH + 4, z);
      },
      setOpacity(v) {
        if (v === lastOpacity) return;
        lastOpacity = v;
        for (const m of materials) m.opacity = v;
        group.visible = v > 0.01;
      },
    };
    unit.setPos(def.spawn[0], def.spawn[1]);
    units.push(unit);
  }
  return units;
}

function buildInfantry(group, def, colorHex, heightAt, materials) {
  const n = THREE.MathUtils.clamp(Math.round(Math.sqrt((def.troops || 5000) / 1600)), 3, 8);
  const gap = 7;
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });
  materials.push(mat);
  const mesh = new THREE.InstancedMesh(BOX_GEO, mat, n * n);
  const offsets = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      offsets.push([(c - (n - 1) / 2) * gap, (r - (n - 1) / 2) * gap]);
    }
  }
  group.add(mesh);

  const m = new THREE.Matrix4();
  return function snapToGround(x, z) {
    for (let i = 0; i < offsets.length; i++) {
      const [dx, dz] = offsets[i];
      m.makeTranslation(dx, heightAt(x + dx, z + dz) + 1.6, dz);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function buildFleet(group, def, colorHex, waterLevel, materials) {
  // count 可由資料覆寫(如草船借箭:二十艘草船但兵員僅數百)
  const count = THREE.MathUtils.clamp(def.count ?? Math.round((def.troops || 8000) / 4000), 3, 24);
  const cols = Math.min(6, count);
  const rows = Math.ceil(count / cols);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6e5a40, roughness: 0.95 });
  const sailMat = new THREE.MeshStandardMaterial({
    map: sailTexture(colorHex),
    side: THREE.DoubleSide,
    roughness: 1,
  });
  materials.push(hullMat, deckMat, sailMat);
  const hulls = new THREE.InstancedMesh(HULL_GEO, hullMat, count);
  const decks = new THREE.InstancedMesh(DECK_GEO, deckMat, count);
  const sails = new THREE.InstancedMesh(SAIL_GEO, sailMat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const dx = ((i % cols) - (cols - 1) / 2) * 24;
    const dz = (Math.floor(i / cols) - (rows - 1) / 2) * 30;
    m.makeTranslation(dx, waterLevel + 0.8, dz);
    hulls.setMatrixAt(i, m);
    m.makeTranslation(dx, waterLevel + 3.2, dz);
    decks.setMatrixAt(i, m);
    m.makeTranslation(dx, waterLevel + 9, dz);
    sails.setMatrixAt(i, m);
  }
  group.add(hulls, decks, sails);
}

// 旗幟子群組:local origin 在地表,setPos 時只調 flagGroup.position.y
function buildFlag(poleH, colorHex, char, materials) {
  const flagGroup = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3128 });
  const flagMat = new THREE.MeshBasicMaterial({
    map: flagTexture(colorHex, char),
    side: THREE.DoubleSide,
  });
  materials.push(poleMat, flagMat);
  const pole = new THREE.Mesh(POLE_GEO, poleMat);
  pole.scale.y = poleH;
  pole.position.set(0, poleH / 2, 0);
  const flag = new THREE.Mesh(FLAG_GEO, flagMat);
  flag.position.set(5.6, poleH - 3.5, 0);
  flagGroup.add(pole, flag);
  return flagGroup;
}

const flagCache = new Map();
function flagTexture(colorHex, char) {
  const key = `${colorHex}|${char}`;
  if (flagCache.has(key)) return flagCache.get(key);
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 80;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 128, 80);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 128, 80);
  ctx.fillStyle = "#f3ead8";
  ctx.font = "bold 52px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, 64, 44);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  flagCache.set(key, tex);
  return tex;
}

const sailCache = new Map();
function sailTexture(colorHex) {
  if (sailCache.has(colorHex)) return sailCache.get(colorHex);
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 80;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#d8cdb2";
  ctx.fillRect(0, 0, 64, 80);
  ctx.strokeStyle = "rgba(0,0,0,0.13)";
  ctx.lineWidth = 2;
  for (let y = 12; y < 80; y += 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y);
    ctx.stroke();
  }
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 64, 12);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  sailCache.set(colorHex, tex);
  return tex;
}
