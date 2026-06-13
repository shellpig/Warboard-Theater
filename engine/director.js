// director:鏡頭 state machine(自動導播/手動接管)
//
// 狀態:idle(不動)/ fly(飛往目標構圖)/ follow(跟隨單位)/ manual(手動接管)
// - 播放跨越 cue 點 → 飛往現場(follow 抵達後持續跟隨;overview 回全景)
// - 使用者操作 OrbitControls 即手動接管,下一個 cue 導播重新接管
// - 點名牌 → flyToUnit;倒帶 seek 只重置 cue 游標,不瞬移鏡頭
import * as THREE from "three";

const FLY_SEC = 3.0;
const FLY_SEC_LONG = 4.0;
const FOLLOW_DIST = 600;
const FOLLOW_HEIGHT = 340;
const OVERVIEW_POS = new THREE.Vector3(900, 1040, 1500);
const OVERVIEW_TGT = new THREE.Vector3(0, 30, 0);

export function createDirector({ camera, controls, units, timeline, clock, terrain }) {
  const unitById = {};
  for (const u of units) unitById[u.id] = u;

  let state = "idle";
  let followUnit = null;
  let fly = null; // { fromPos, fromTgt, toPos, toTgt, t }
  let cueIdx = 0;
  let lastP = -1;

  controls.addEventListener("start", () => {
    state = "manual";
    fly = null;
    followUnit = null;
  });

  function focusOf(unit) {
    return new THREE.Vector3(unit.anchor.x, unit.anchor.y - 14, unit.anchor.z);
  }

  // 自目前方位角接近,避免鏡頭翻越戰場
  function frameTarget(tgt) {
    const dir = camera.position.clone().sub(controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    dir.normalize();
    const pos = tgt.clone().addScaledVector(dir, FOLLOW_DIST);
    pos.y = tgt.y + FOLLOW_HEIGHT;
    return pos;
  }

  function beginFly(toTgt, toPos, unit, duration) {
    fly = {
      fromPos: camera.position.clone(),
      fromTgt: controls.target.clone(),
      toPos,
      toTgt,
      t: 0,
      duration: duration || FLY_SEC,
    };
    followUnit = unit || null;
    state = "fly";
  }

  function flyToUnit(id, dur) {
    const u = unitById[id];
    if (!u) return;
    const tgt = focusOf(u);
    beginFly(tgt, frameTarget(tgt), u, dur);
  }

  // 定點運鏡(camera 事件的 pos):飛抵後不跟隨
  function flyToPos([x, z], dur) {
    const y = Math.max(terrain.heightAt(x, z), terrain.waterLevel) + 10;
    const tgt = new THREE.Vector3(x, y, z);
    beginFly(tgt, frameTarget(tgt), null, dur);
  }

  function applyCue(cue) {
    const useLong = cue.hint === "overview" || cue.hint === "pos" || state === "idle";
    const dur = useLong ? FLY_SEC_LONG : FLY_SEC;
    if (cue.hint === "overview") beginFly(OVERVIEW_TGT.clone(), OVERVIEW_POS.clone(), null, dur);
    else if (cue.hint === "pos") flyToPos(cue.pos, dur);
    else flyToUnit(cue.unit, dur);
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function update(dt) {
    const p = clock.time;
    const cues = timeline.cues;
    if (p < lastP) {
      // 倒帶:游標重對齊,並清掉舊目標(單位已瞬移,續追會產生漂移);
      // 鏡頭停在原地,由下一個 cue 重新接管
      cueIdx = 0;
      while (cueIdx < cues.length && cues[cueIdx].p <= p) cueIdx++;
      fly = null;
      followUnit = null;
      state = "idle";
    } else {
      let crossed = null;
      while (cueIdx < cues.length && cues[cueIdx].p <= p) crossed = cues[cueIdx++];
      if (crossed) applyCue(crossed); // cue 觸發 = 導播接管(含 manual 後)
    }
    lastP = p;

    if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.duration);
      const e = easeInOut(fly.t);
      camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
      controls.target.lerpVectors(fly.fromTgt, fly.toTgt, e);
      if (fly.t >= 1) {
        fly = null;
        state = followUnit ? "follow" : "idle";
      }
    } else if (state === "follow" && followUnit) {
      const offset = camera.position.clone().sub(controls.target);
      const k = 1 - Math.exp(-3 * dt);
      controls.target.lerp(focusOf(followUnit), k);
      camera.position.copy(controls.target).add(offset);
    }
  }

  return { update, flyToUnit };
}
