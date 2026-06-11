// units:單位生成(infantry 方陣方塊群 / fleet 低面數船隊,instanced)+ 陣營色旗幟
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
    const [sx, sz] = def.spawn;

    if (def.type === "fleet") {
      buildFleet(group, def, sx, sz, colorHex, waterLevel);
    } else {
      buildInfantry(group, def, sx, sz, colorHex, heightAt);
    }

    const baseY = def.type === "fleet" ? waterLevel : heightAt(sx, sz);
    const poleH = def.type === "fleet" ? 26 : 20;
    addFlag(group, sx, baseY, sz, poleH, colorHex, pick(faction.name).charAt(0) || "?");

    scene.add(group);
    units.push({
      id: def.id,
      label: pick(def.label),
      troops: def.troops || 0,
      color: colorHex,
      group,
      anchor: new THREE.Vector3(sx, baseY + poleH + 4, sz),
    });
  }
  return units;
}

function buildInfantry(group, def, sx, sz, colorHex, heightAt) {
  const n = THREE.MathUtils.clamp(Math.round(Math.sqrt((def.troops || 5000) / 1600)), 3, 8);
  const gap = 7;
  const mesh = new THREE.InstancedMesh(
    BOX_GEO,
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 }),
    n * n
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = sx + (c - (n - 1) / 2) * gap;
      const z = sz + (r - (n - 1) / 2) * gap;
      m.makeTranslation(x, heightAt(x, z) + 1.6, z);
      mesh.setMatrixAt(i++, m);
    }
  }
  group.add(mesh);
}

function buildFleet(group, def, sx, sz, colorHex, waterLevel) {
  const count = THREE.MathUtils.clamp(Math.round((def.troops || 8000) / 4000), 3, 24);
  const cols = Math.min(6, count);
  const rows = Math.ceil(count / cols);
  const hulls = new THREE.InstancedMesh(
    HULL_GEO,
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }),
    count
  );
  const decks = new THREE.InstancedMesh(
    DECK_GEO,
    new THREE.MeshStandardMaterial({ color: 0x6e5a40, roughness: 0.95 }),
    count
  );
  const sails = new THREE.InstancedMesh(
    SAIL_GEO,
    new THREE.MeshStandardMaterial({
      map: sailTexture(colorHex),
      side: THREE.DoubleSide,
      roughness: 1,
    }),
    count
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = sx + (c - (cols - 1) / 2) * 24;
    const z = sz + (r - (rows - 1) / 2) * 30;
    m.makeTranslation(x, waterLevel + 0.8, z);
    hulls.setMatrixAt(i, m);
    m.makeTranslation(x, waterLevel + 3.2, z);
    decks.setMatrixAt(i, m);
    m.makeTranslation(x, waterLevel + 9, z);
    sails.setMatrixAt(i, m);
  }
  group.add(hulls, decks, sails);
}

function addFlag(group, x, baseY, z, poleH, colorHex, char) {
  const pole = new THREE.Mesh(
    POLE_GEO,
    new THREE.MeshStandardMaterial({ color: 0x3a3128 })
  );
  pole.scale.y = poleH;
  pole.position.set(x, baseY + poleH / 2, z);
  const flag = new THREE.Mesh(
    FLAG_GEO,
    new THREE.MeshBasicMaterial({ map: flagTexture(colorHex, char), side: THREE.DoubleSide })
  );
  flag.position.set(x + 5.6, baseY + poleH - 3.5, z);
  group.add(pole, flag);
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
