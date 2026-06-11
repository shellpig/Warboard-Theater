// audio:Web Audio 全合成音效(無音檔)
// - 環境:帶通噪音(江風水聲)恆常低音量,慢速 LFO 起伏
// - 火焰:低通噪音迴圈,音量 = 當前燃燒強度總和(timeline.burns)+ 隨機劈啪爆點
// - 一次性:volley 箭雨嘯聲 / explosion 爆響(正常播放跨越事件時刻時觸發,seek 大跳不觸發)
// AudioContext 於首次使用者手勢(pointerdown / keydown)建立並 resume(瀏覽器 autoplay 政策)

export function createAudio({ timeline, clock }) {
  let ctx = null;
  let master = null;
  let fireGain = null;
  let noiseBuf = null;
  let muted = false;
  let prevP = clock.time;

  function makeNoise(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function loopNoise(filterType, freq, gain0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain0;
    src.connect(filt).connect(g).connect(master);
    src.start();
    return g;
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(2);

    // 江風:帶通噪音 + 慢 LFO 音量起伏
    const wind = loopNoise("bandpass", 380, 0.045);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(wind.gain);
    lfo.start();

    // 火焰底噪:音量由 update() 隨燃燒強度驅動
    fireGain = loopNoise("lowpass", 750, 0);
  }

  function unlock() {
    init();
    if (ctx.state === "suspended") ctx.resume();
  }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // 短促劈啪爆點(火焰燃燒中隨機觸發)
  function crackle(intensity) {
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 1500 + Math.random() * 2500;
    const g = ctx.createGain();
    const peak = (0.04 + Math.random() * 0.08) * Math.min(intensity, 2);
    g.gain.setValueAtTime(peak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05 + Math.random() * 0.06);
    src.connect(filt).connect(g).connect(master);
    src.start(now);
    src.stop(now + 0.15);
  }

  // 箭雨:噪音帶通頻率由高至低掃落(群矢破空聲)
  function playVolley() {
    const now = ctx.currentTime;
    const dur = 2.2;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.value = 1.4;
    filt.frequency.setValueAtTime(2600, now);
    filt.frequency.exponentialRampToValueAtTime(480, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.3, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(now);
    src.stop(now + dur);
  }

  // 爆響:低頻正弦下滑 + 低通噪音爆裂
  function playExplosion() {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 1.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.65, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(og).connect(master);
    osc.start(now);
    osc.stop(now + 1.2);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    src.connect(filt).connect(ng).connect(master);
    src.start(now);
    src.stop(now + 0.6);
  }

  function update(dt) {
    const p = clock.time;
    if (!ctx || ctx.state !== "running") {
      prevP = p;
      return;
    }

    // 火焰音量 = 當前燃燒強度總和(seek 後同樣正確,維持狀態 = 時間純函數)
    let burn = 0;
    for (const b of timeline.burns) {
      if (p >= b.start && p <= b.end) burn += b.intensity;
    }
    fireGain.gain.setTargetAtTime(Math.min(burn * 0.16, 0.55), ctx.currentTime, 0.4);
    if (burn > 0 && Math.random() < dt * burn * 6) crackle(burn);

    // 一次性音效:僅在正常播放步進中跨越事件時刻時觸發
    const step = p - prevP;
    if (clock.playing && step > 0 && step < 1) {
      for (const s of timeline.fxShots) {
        if (s.p > prevP && s.p <= p) {
          if (s.kind === "volley") playVolley();
          else if (s.kind === "explosion") playExplosion();
        }
      }
    }
    prevP = p;
  }

  return {
    update,
    get muted() {
      return muted;
    },
    setMuted(v) {
      muted = v;
      if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.05);
    },
  };
}
