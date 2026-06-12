// timeline:章節/事件排程、事件→關鍵幀軌道編譯、播放時鐘
//
// 載入時把 move / engage / fire / defect / rout / status 事件編譯為每單位的
// 關鍵幀軌道(位置 / 兵力 / 狀態 / 透明度);執行期一律以純函數取值,
// 因此時間軸可任意拖曳、倒帶、跳章,且每次播放完全確定。
// narration / camera 屬表演層,不進軌道;seek 時只取目前章節最後一張字卡。
//
// 全域播放軸:各章依 playback_sec 首尾銜接,軌道時間 p = 全域播放秒。
// 章內事件 t(模擬分鐘)→ p = chapter.start + (t / duration_min) * playback_sec。

const EPS = 1e-4;

export function compileTimeline(eventsDef, battle) {
  // --- 章節 → 全域播放軸 ---
  const chapters = [];
  let cursor = 0;
  for (const ch of eventsDef.chapters || []) {
    chapters.push({
      id: ch.id,
      title: ch.title,
      bgm: ch.bgm,
      date_display: ch.date_display,
      durationMin: ch.duration_min,
      clockStartMin: parseClock(ch.clock_start),
      start: cursor,
      len: ch.playback_sec,
    });
    cursor += ch.playback_sec;
  }
  const total = cursor;

  // --- 每單位軌道初始化(spawn / troops / 可見 / 名稱)---
  const tracks = {};
  for (const u of battle.units || []) {
    tracks[u.id] = {
      pos: [{ p: 0, v: [u.spawn[0], u.spawn[1]] }],
      troops: [{ p: 0, v: u.troops || 0 }],
      state: [{ p: 0, v: "idle" }],
      opacity: [{ p: 0, v: 1 }],
      name: [{ p: 0, v: u.label }],
    };
  }

  const cards = []; // { p, chapter, ev } narration 字卡
  const timeMarks = []; // { p, chapter, v } time_display 步進
  const cues = []; // { p, hint, unit } 導播鏡頭指令(Phase 3 director 消費)
  const stateRestores = []; // engage t_end 的狀態還原(編譯完成後統一裁決)
  const burns = []; // { start, end, unit?|pos?, intensity } 火源燃燒區間(effects 消費)
  const fxShots = []; // { p, kind, … } 事件附帶一次性特效(volley / explosion)
  const cuts = []; // { p, chapter, text, sub } 中央 cut-in 橋段標題(Phase 7)

  const CUT_HOLD = 2.6; // cut-in 停留秒數(全域播放秒)
  const CUT_IN = 0.4;   // 淡入秒數
  const CUT_OUT = 0.6;  // 淡出秒數

  // camera_hint 省略時導播自行判斷:有單位的戰況事件自動 follow
  const AUTO_FOLLOW = new Set(["move", "engage", "fire", "rout", "defect"]);
  function addCue(ev, p) {
    const unit = ev.unit ?? ev.units?.[0] ?? ev.fx?.to ?? ev.fx?.from ?? null;
    let hint = ev.camera_hint;
    if (hint == null && AUTO_FOLLOW.has(ev.type) && unit) hint = "follow";
    if (hint === "follow" && unit) cues.push({ p, hint, unit });
    else if (hint === "overview") cues.push({ p, hint, unit: null });
    else if (ev.type === "camera" && ev.pos) cues.push({ p, hint: "pos", unit: null, pos: ev.pos });
    else if (ev.type === "camera" && hint !== "none") {
      console.warn("timeline: camera 事件缺少可用的 camera_hint/pos,鏡頭不動", ev);
    }
    // 其餘 "none" / 無法判斷 → 不動鏡頭
  }

  // --- 事件編譯 ---
  (eventsDef.chapters || []).forEach((ch, ci) => {
    const meta = chapters[ci];
    const toP = (t) => meta.start + (t / meta.durationMin) * meta.len;

    const events = [...(ch.events || [])].sort((a, b) => a.t - b.t);
    for (const ev of events) {
      const p = toP(ev.t);
      const pEnd = ev.t_end != null ? toP(ev.t_end) : p;
      if (ev.time_display) timeMarks.push({ p, chapter: ci, v: ev.time_display });
      addCue(ev, p);
      if (ev.fx) fxShots.push({ p, ...ev.fx });
      if (ev.cut) {
        const text = ev.cut === true ? ev.title : (ev.cut.text ?? ev.title);
        const sub = ev.cut === true ? null : (ev.cut.sub ?? null);
        if (text) cuts.push({ p, chapter: ci, text, sub });
      }

      switch (ev.type) {
        case "move": {
          const tr = tracks[ev.unit];
          if (!tr) break;
          tr.pos.push({ p, v: lastVal(tr.pos) }, { p: Math.max(pEnd, p + EPS), v: ev.to });
          // 「進軍」不寫入狀態軌道,由 stateAt 依位置軌道衍生,
          // 避免蓋掉潰走 / 詐降 / 撤離等更高語意的徽章
          break;
        }
        case "engage": {
          for (const id of ev.units || [ev.unit]) {
            const tr = tracks[id];
            if (!tr) continue;
            const prev = lastVal(tr.state);
            tr.state.push({ p, v: "engage" });
            // 有 t_end 的交戰在結束點回復前一狀態;無 t_end 則持續(由後續事件改變)
            if (ev.t_end != null) {
              stateRestores.push({ keys: tr.state, start: p, end: pEnd, prev });
            }
            const target = ev.losses?.[id];
            if (target != null) {
              tr.troops.push({ p, v: lastVal(tr.troops) }, { p: Math.max(pEnd, p + EPS), v: target });
            }
          }
          break;
        }
        case "fire": {
          // 燃燒至 t_end(省略 = 燒到本章結束);pos 火源不綁單位(火海殘留原地)
          const until = ev.t_end != null ? pEnd : meta.start + meta.len;
          const intensity = ev.intensity ?? 1;
          if (ev.pos) burns.push({ start: p, end: until, pos: ev.pos, intensity });
          for (const id of ev.units || (ev.unit ? [ev.unit] : [])) {
            if (!tracks[id]) continue;
            tracks[id].state.push({ p, v: "fire" });
            burns.push({ start: p, end: until, unit: id, intensity });
          }
          break;
        }
        case "defect": {
          tracks[ev.unit]?.state.push({ p, v: "defect" });
          break;
        }
        case "rout": {
          const tr = tracks[ev.unit];
          if (!tr) break;
          tr.state.push({ p, v: "rout" });
          tr.opacity.push({ p, v: lastVal(tr.opacity) }, { p: p + 5, v: 0.4 });
          break;
        }
        case "status": {
          const tr = tracks[ev.unit];
          if (!tr) break;
          if (ev.troops != null) {
            tr.troops.push({ p: p - EPS, v: lastVal(tr.troops) }, { p, v: ev.troops });
          }
          if (ev.badge) tr.state.push({ p, v: ev.badge });
          if (ev.opacity != null) {
            tr.opacity.push({ p: p - EPS, v: lastVal(tr.opacity) }, { p, v: ev.opacity });
          }
          if (ev.label) tr.name.push({ p, v: ev.label });
          break;
        }
        case "narration":
          cards.push({ p, chapter: ci, ev });
          break;
        case "camera": // 純鏡頭指令:cue(含 pos 定點)已由 addCue 收集
          break;
        default:
          console.warn(`timeline: 未知事件 type "${ev.type}"`, ev);
      }
      applyAttrition(ev, p, pEnd);
    }
  });

  // engage 結束還原:區間內(含結束同點)若有其他明確狀態 key(rout/defect/status…)
  // 表示語意已被更新,還原取消,避免蓋掉較新的狀態
  for (const r of stateRestores) {
    const superseded = r.keys.some((k) => k.p > r.start + EPS && k.p <= r.end + EPS);
    if (!superseded) r.keys.push({ p: r.end, v: r.prev });
  }

  // 各事件可能交錯插入 key → 統一依 p 穩定排序
  for (const tr of Object.values(tracks)) {
    for (const keys of Object.values(tr)) keys.sort((a, b) => a.p - b.p);
  }
  cards.sort((a, b) => a.p - b.p);
  timeMarks.sort((a, b) => a.p - b.p);
  cues.sort((a, b) => a.p - b.p);
  burns.sort((a, b) => a.start - b.start);
  fxShots.sort((a, b) => a.p - b.p);
  cuts.sort((a, b) => a.p - b.p);

  function chapterIndexAt(p) {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (p >= chapters[i].start) return i;
    }
    return 0;
  }

  return {
    chapters,
    total,
    cues,
    burns,
    fxShots,
    chapterIndexAt,
    posAt: (id, p) => lerpAt(tracks[id]?.pos, p),
    troopsAt: (id, p) => Math.round(lerpAt(tracks[id]?.troops, p)),
    stateAt(id, p) {
      const s = stepAt(tracks[id]?.state, p);
      if (s === "idle" && movingAt(tracks[id]?.pos, p)) return "advance";
      return s;
    },
    opacityAt: (id, p) => lerpAt(tracks[id]?.opacity, p),
    // 目前章節內最後一張字卡(跨章 seek 不殘留上一章字卡)
    cardAt(p) {
      const ci = chapterIndexAt(p);
      let found = null;
      for (const c of cards) {
        if (c.p > p + EPS) break;
        if (c.chapter === ci) found = c;
      }
      return found;
    },
    // 中央 cut-in:在目前章節內找最近一個觸發點 p0 使 p ∈ [p0, p0+CUT_HOLD]
    // 回傳 { text, sub, alpha } 或 null;alpha 由淡入/淡出曲線純函數求得
    cutAt(p) {
      const ci = chapterIndexAt(p);
      for (let i = cuts.length - 1; i >= 0; i--) {
        const c = cuts[i];
        if (c.p > p) continue;          // 未來的 cut
        const d = p - c.p;
        if (d > CUT_HOLD) break;        // 超出窗口,之前的 cut 距離更遠
        if (c.chapter !== ci) continue; // 不同章節不殘留
        const alpha =
          Math.min(d / CUT_IN, 1) *
          Math.min((CUT_HOLD - d) / CUT_OUT, 1);
        return { text: c.text, sub: c.sub, alpha };
      }
      return null;
    },
    // 單位名稱 step 軌道(status.label 變更後即生效,確定性)
    // 回傳四語物件或字串,由 ui 端 pick() 取語系
    labelAt(id, p) {
      const keys = tracks[id]?.name;
      if (!keys) return "";
      return stepAt(keys, p);
    },
    // 模擬時刻(當日分鐘數,跨夜取模):章節 clock_start + 章內經過分鐘;
    // 未定義 clock_start 的章節(如跨多日的鋪陳章)回傳 null
    clockAt(p) {
      const ch = chapters[chapterIndexAt(p)];
      if (ch?.clockStartMin == null) return null;
      const f = Math.min(Math.max((p - ch.start) / ch.len, 0), 1);
      return (ch.clockStartMin + f * ch.durationMin) % 1440;
    },
    // 畫面時間字串:目前章節內最後一個 time_display,否則章節 date_display
    timeDisplayAt(p) {
      const ci = chapterIndexAt(p);
      let found = null;
      for (const m of timeMarks) {
        if (m.p > p + EPS) break;
        if (m.chapter === ci) found = m.v;
      }
      return found ?? chapters[ci]?.date_display ?? "";
    },
  };

  // attrition: 每章內模擬分鐘流失量。編譯成 troops 線性 key,維持 seek/倒帶確定性。
  // 寫法:
  //   { "attrition": 12, "unit": "cao_camp", "t": 0, "t_end": 240 }
  //   { "attrition": { "cao_camp": 12, "cao_fleet": 50 }, "t": 0, "t_end": 240 }
  function applyAttrition(ev, p, pEnd) {
    if (ev.attrition == null || ev.t_end == null || pEnd <= p) return;
    const ids =
      typeof ev.attrition === "number"
        ? (ev.units || (ev.unit ? [ev.unit] : []))
        : Object.keys(ev.attrition);
    for (const id of ids) {
      const tr = tracks[id];
      if (!tr) continue;
      const rate = typeof ev.attrition === "number" ? ev.attrition : ev.attrition[id];
      if (!(rate > 0)) continue;
      const start = lerpAt(tr.troops, p);
      const loss = rate * (ev.t_end - ev.t);
      tr.troops.push({ p, v: start }, { p: pEnd, v: Math.max(0, start - loss) });
    }
  }
}

function lastVal(keys) {
  return keys[keys.length - 1].v;
}

// "HH:MM" → 當日分鐘數;格式不符回傳 null
function parseClock(s) {
  const m = typeof s === "string" ? /^(\d{1,2}):(\d{2})$/.exec(s) : null;
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

// 線性插值取值:keys 依 p 遞增;數值或 [x, z] 皆可
function lerpAt(keys, p) {
  if (!keys) return 0;
  if (p <= keys[0].p) return keys[0].v;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].p <= p) {
      if (i === keys.length - 1) return keys[i].v;
      const a = keys[i];
      const b = keys[i + 1];
      const f = (p - a.p) / (b.p - a.p);
      if (Array.isArray(a.v)) {
        return [a.v[0] + (b.v[0] - a.v[0]) * f, a.v[1] + (b.v[1] - a.v[1]) * f];
      }
      return a.v + (b.v - a.v) * f;
    }
  }
  return keys[0].v;
}

// 位置軌道在 p 是否處於移動區段(兩端點不同)
function movingAt(keys, p) {
  if (!keys) return false;
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].p <= p) {
      const next = keys[i + 1];
      return !!next && p < next.p && (next.v[0] !== keys[i].v[0] || next.v[1] !== keys[i].v[1]);
    }
  }
  return false;
}

// 步進取值:最後一個 p ≤ t 的 key
function stepAt(keys, p) {
  if (!keys) return "idle";
  let v = keys[0].v;
  for (const k of keys) {
    if (k.p > p) break;
    v = k.v;
  }
  return v;
}

// 播放時鐘:Space / 速度 / 拖曳 seek 都操作同一個全域播放秒數
export function createClock(total) {
  let cur = 0;
  let playing = false;
  let speed = 1;
  return {
    get time() {
      return cur;
    },
    get playing() {
      return playing;
    },
    get speed() {
      return speed;
    },
    play() {
      if (cur >= total) cur = 0; // 播畢後再按播放 = 重看
      playing = true;
    },
    pause() {
      playing = false;
    },
    toggle() {
      playing ? this.pause() : this.play();
    },
    setSpeed(v) {
      speed = v;
    },
    seek(p) {
      cur = Math.min(Math.max(p, 0), total);
    },
    tick(dt) {
      if (!playing) return;
      cur += dt * speed;
      if (cur >= total) {
        cur = total;
        playing = false;
      }
    },
  };
}
