// ============================================================================
// SKYWARD COMMAND — procedural audio (Web Audio API, no sound files)
//
// Buses: ui (clicks) · alert (warnings/chimes) · radio (static + garbled voice)
//        combat (positional explosions, launches, guns) · amb (battle ambience)
// Combat sounds are positional: you only hear what's on screen, louder the
// closer you zoom, panned left/right by where it happens on the map.
// ============================================================================
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, distCurve = null;
  const bus = {};
  let voices = 0, lastRadio = 0, lastWarn = 0, lastGun = 0, lastBoom = 0;
  let bed = null, ambT = 1, ambLevel = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    for (const b of ['ui', 'alert', 'radio', 'combat', 'amb']) { bus[b] = ctx.createGain(); bus[b].connect(master); }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 3.5); }
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const S = Settings.get();
    master.gain.value = S.volume;
    bus.ui.gain.value = S.uiSfx ? 0.5 : 0;
    bus.alert.gain.value = S.alerts ? 0.8 : 0;
    bus.radio.gain.value = S.radio ? 0.9 : 0;
    bus.combat.gain.value = S.combat ? 1 : 0;
    bus.amb.gain.value = S.ambient ? 1 : 0;
  }

  const t0 = () => ctx.currentTime;
  const ok = () => ctx && ctx.state === 'running' && Settings.get().volume > 0;

  function out(node, b, pan) {
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p); p.connect(bus[b]);
    } else node.connect(bus[b]);
  }

  // Filtered noise burst with an exponential envelope
  function noise({ dur = 0.2, type = 'bandpass', f = 1500, f2 = 0, q = 1, gain = 0.3, attack = 0.004, b = 'combat', pan = 0, when = 0 }) {
    if (voices > 48) return;
    const t = t0() + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); out(g, b, pan);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    voices++; src.onended = () => voices--;
  }

  function tone({ f = 440, f2 = 0, dur = 0.15, type = 'sine', gain = 0.2, attack = 0.004, b = 'alert', pan = 0, when = 0 }) {
    if (voices > 48) return;
    const t = t0() + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); out(g, b, pan);
    o.start(t); o.stop(t + dur + 0.05);
    voices++; o.onended = () => voices--;
  }

  const j = (a = 0.8, b = 1.25) => rand(a, b);

  // ---------------- radio ----------------
  // Garbled "voice" over the net: a buzzy pitch-wandering source chopped into
  // syllables, band-limited and clipped like a cheap handheld radio.
  function voiceBurst(when = 0) {
    const s = t0() + when, dur = rand(0.45, 1.0);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = rand(105, 175);
    for (let t = s; t < s + dur; t += rand(0.05, 0.11)) o.frequency.setValueAtTime(base * rand(0.82, 1.35), t);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(900, 1500); bp.Q.value = 1.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, s);
    for (let t = s; t < s + dur;) {
      const len = rand(0.06, 0.17);
      g.gain.setTargetAtTime(rand(0.045, 0.1), t, 0.012);
      g.gain.setTargetAtTime(0.004, t + len, 0.015);
      t += len + rand(0.02, 0.08);
    }
    g.gain.setTargetAtTime(0, s + dur, 0.02);
    o.connect(bp); bp.connect(hp); hp.connect(ws); ws.connect(g); g.connect(bus.radio);
    o.start(s); o.stop(s + dur + 0.15);
    noise({ dur: 0.07, f: 2100, q: 0.8, gain: 0.13, b: 'radio', when });
    noise({ dur, f: 1800, q: 0.5, gain: 0.022, b: 'radio', when });
    noise({ dur: 0.13, f: 2600, q: 0.7, gain: 0.13, b: 'radio', when: when + dur });
  }

  // Several distinct static "generations" so the net never sounds repetitive
  function radioStatic(v = Math.floor(Math.random() * 6)) {
    switch (v) {
      case 0: // short squelch break
        tone({ f: 1150 * j(), dur: 0.02, type: 'square', gain: 0.04, b: 'radio' });
        noise({ dur: 0.09 * j(), f: 1800 * j(), q: 0.8, gain: 0.17, b: 'radio', when: 0.01 });
        break;
      case 1: // key-up + crackle
        tone({ f: 900, dur: 0.015, type: 'square', gain: 0.04, b: 'radio' });
        for (let i = 0; i < 9; i++) noise({ dur: rand(0.012, 0.04), f: rand(1200, 4200), q: 2, gain: rand(0.05, 0.18), b: 'radio', when: 0.02 + i * rand(0.02, 0.05) });
        noise({ dur: 0.12, f: 3000, q: 0.6, gain: 0.09, b: 'radio', when: 0.34 });
        break;
      case 2: // roger beep
        noise({ dur: 0.26, f: 1600, q: 0.7, gain: 0.07, b: 'radio' });
        tone({ f: 1000, dur: 0.06, gain: 0.07, b: 'radio', when: 0.05 });
        tone({ f: 1350, dur: 0.08, gain: 0.07, b: 'radio', when: 0.13 });
        break;
      case 3: // sweeping static
        noise({ dur: 0.45 * j(), f: 650, f2: 2700, q: 1.2, gain: 0.13, b: 'radio' });
        break;
      case 4: case 5: voiceBurst(); break;
    }
  }

  function radio(force) {
    if (!ok()) return;
    const n = performance.now();
    if (!force && n - lastRadio < 350) return;
    lastRadio = n;
    radioStatic();
  }

  // ---------------- alerts / UI ----------------
  function click() { if (!ok()) return; tone({ f: 2100, dur: 0.018, type: 'square', gain: 0.03, b: 'ui' }); noise({ dur: 0.02, f: 4000, q: 1, gain: 0.03, b: 'ui' }); }
  function missileWarn() {
    if (!ok()) return;
    const n = performance.now();
    if (n - lastWarn < 2500) return;
    lastWarn = n;
    for (let i = 0; i < 4; i++) tone({ f: 1650, dur: 0.06, type: 'square', gain: 0.045, when: i * 0.1 });
  }
  function klaxon() { if (!ok()) return; for (let i = 0; i < 4; i++) { tone({ f: 720, dur: 0.22, type: 'sawtooth', gain: 0.05, when: i * 0.5 }); tone({ f: 540, dur: 0.22, type: 'sawtooth', gain: 0.05, when: i * 0.5 + 0.25 }); } }
  function crisis() { if (!ok()) return; [880, 660, 494].forEach((f, i) => tone({ f, dur: 0.22, type: 'triangle', gain: 0.08, when: i * 0.16 })); radioStatic(3); }
  function unrest() { if (!ok()) return; [700, 560].forEach((f, i) => tone({ f, dur: 0.18, type: 'triangle', gain: 0.05, when: i * 0.14 })); }
  function secured() { if (!ok()) return; [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.3, type: 'triangle', gain: 0.07, when: i * 0.1 })); }
  function lost() { if (!ok()) return; tone({ f: 330, f2: 180, dur: 0.6, type: 'sawtooth', gain: 0.06 }); tone({ f: 335, f2: 182, dur: 0.6, type: 'square', gain: 0.03 }); radioStatic(1); }
  function warnBeep() { if (!ok()) return; tone({ f: 1200, dur: 0.07, type: 'square', gain: 0.035 }); tone({ f: 1200, dur: 0.07, type: 'square', gain: 0.035, when: 0.12 }); }
  function kaching() { if (!ok()) return; tone({ f: 1320, dur: 0.08, type: 'triangle', gain: 0.06 }); tone({ f: 1760, dur: 0.2, type: 'triangle', gain: 0.06, when: 0.07 }); }
  function launch() {
    if (!ok()) return;
    radioStatic(2);
    noise({ dur: 1.1, f: 300, f2: 2400, q: 0.9, gain: 0.07, b: 'alert', when: 0.25 });
    tone({ f: 120, f2: 260, dur: 1.0, type: 'sawtooth', gain: 0.025, b: 'alert', when: 0.25 });
  }

  // ---------------- positional combat ----------------
  // Returns {vol, pan} for a map position, or null if it shouldn't be heard
  function place(pos, reach = 1) {
    if (!R.map) return null;
    const p = P(pos), z = R.map.getZoom();
    const m = 80 * reach;
    if (p.x < -m || p.y < -m || p.x > R.w + m || p.y > R.h + m) return null;
    const zf = clamp((z - 3) / 5, 0.12, 1);
    const cx = (p.x / R.w) * 2 - 1, cy = (p.y / R.h) * 2 - 1;
    const centre = 1 - Math.min(1, Math.hypot(cx, cy)) * 0.45;
    return { vol: zf * centre, pan: cx * 0.8, far: 1 - zf };
  }

  function boom(size, at) {
    const n = performance.now();
    if (n - lastBoom < 40) return;
    lastBoom = n;
    const g = 0.42 * at.vol * Math.min(1.6, 0.6 + size * 0.5);
    noise({ dur: 0.45 + size * 0.55, type: 'lowpass', f: 1600 * (1 - at.far * 0.75) + 180, f2: 110, q: 0.6, gain: g, attack: 0.003, pan: at.pan });
    tone({ f: 85 * j(0.9, 1.1), f2: 32, dur: 0.3 + size * 0.3, type: 'sine', gain: g * 0.9, b: 'combat', pan: at.pan });
    if (at.far < 0.5) noise({ dur: 0.05, type: 'highpass', f: 2600, gain: g * 0.35, pan: at.pan });
  }

  function onFx(f) {
    if (!ok() || f.kind === 'text' || f.kind === 'falling') return;
    if (f.kind === 'nuke') {
      noise({ dur: 4.5, type: 'lowpass', f: 900, f2: 40, q: 0.4, gain: 0.7, attack: 0.02 });
      tone({ f: 60, f2: 18, dur: 4, gain: 0.6, b: 'combat' });
      return;
    }
    const at = place(f.pos, f.kind === 'explosion' ? 2 : 1);
    if (!at) return;
    if (f.kind === 'explosion') boom(f.size || 1, at);
    else if (f.kind === 'hit') { noise({ dur: 0.06, type: 'highpass', f: 3000, gain: 0.12 * at.vol, pan: at.pan }); tone({ f: 320, f2: 110, dur: 0.1, type: 'square', gain: 0.04 * at.vol, b: 'combat', pan: at.pan }); }
    else if (f.kind === 'flares') for (let i = 0; i < 4; i++) noise({ dur: 0.05, f: 2400, q: 3, gain: 0.07 * at.vol, pan: at.pan, when: i * 0.07 });
    else if (f.kind === 'puff' && at.far < 0.6) noise({ dur: 0.12, type: 'lowpass', f: 700, gain: 0.05 * at.vol, pan: at.pan });
  }

  function onProj(p) {
    if (!ok()) return;
    if (p.side === 'fx') {
      if (p.kind === 'shell' && Math.random() < 0.35) { const at = place(p.pos); if (at && at.far < 0.5) tone({ f: 70, f2: 40, dur: 0.25, gain: 0.08 * at.vol, b: 'combat', pan: at.pan }); }
      return;
    }
    const at = place(p.pos);
    if (!at) return;
    if (p.kind === 'missile' || p.kind === 'cruise' || p.kind === 'rocket') {
      noise({ dur: 0.7, f: 500, f2: 2600, q: 1.1, gain: 0.09 * at.vol, pan: at.pan });
    } else if (p.kind === 'bullet') {
      const n = performance.now();
      if (n - lastGun < 90) return;
      lastGun = n;
      for (let i = 0; i < 4; i++) noise({ dur: 0.022, type: 'highpass', f: 1600, gain: 0.07 * at.vol, pan: at.pan, when: i * 0.055 });
    } else if (p.kind === 'bomb' || p.kind === 'nuke') {
      tone({ f: 1400, f2: 500, dur: 0.6, type: 'sine', gain: 0.025 * at.vol, b: 'combat', pan: at.pan });
    }
  }

  // ---------------- battle ambience ----------------
  // When you zoom into a hot zone you hear its war: a low rumble bed, distant
  // artillery thumps, the odd burst of gunfire and faint radio traffic.
  function ambientTick(dt) {
    if (!ctx) return;
    let target = 0;
    if (G && !G.over && !G.paused && !document.hidden && Settings.get().ambient && R.map) {
      const z = R.map.getZoom();
      if (z >= 5) {
        const b = R.map.getBounds().pad(0.2);
        const hot = G.zones.some(zn => zn.active && !zn.neutralized && b.contains([zn.center.lat, zn.center.lng]));
        if (hot) target = clamp((z - 4.5) / 3.5, 0, 1);
      }
    }
    ambLevel += (target - ambLevel) * Math.min(1, dt * 1.5);
    if (!bed && target > 0) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(bus.amb); src.start();
      bed = { g };
    }
    if (bed) bed.g.gain.setTargetAtTime(ambLevel * 0.16, ctx.currentTime, 0.3);
    if (ambLevel < 0.05 || !ok()) return;
    ambT -= dt;
    if (ambT <= 0) {
      ambT = rand(0.5, 2.2) / (0.4 + ambLevel);
      const pan = rand(-0.9, 0.9), r = Math.random();
      if (r < 0.6) {
        const g = ambLevel * rand(0.08, 0.2);
        noise({ dur: rand(0.8, 1.6), type: 'lowpass', f: rand(250, 500), f2: 60, q: 0.5, gain: g, attack: 0.01, b: 'amb', pan });
        tone({ f: rand(45, 70), f2: 28, dur: 0.6, gain: g * 0.8, b: 'amb', pan });
      } else if (r < 0.85) {
        const n = randInt(4, 10), gap = rand(0.05, 0.09), g = ambLevel * rand(0.02, 0.05);
        for (let i = 0; i < n; i++) noise({ dur: 0.03, type: 'bandpass', f: rand(700, 1200), q: 1.5, gain: g, b: 'amb', pan, when: i * gap });
      } else if (Settings.get().radio) {
        noise({ dur: rand(0.2, 0.5), f: rand(1200, 2400), q: 0.8, gain: ambLevel * 0.03, b: 'amb', pan });
      }
    }
  }

  // Map comms-log entries to sounds
  function onLog(e) {
    if (!ctx) return;
    const t = e.text;
    if (e.cls === 'radio') {
      if (/launch|Spike|defending|Notching/i.test(t)) missileWarn();
      radio();
    } else if (e.cls === 'alert') {
      if (/VAMPIRE|HOMEFRONT/.test(t)) klaxon();
      else if (/SHOT DOWN|OVERRUN|captured|destroyed on the ground/.test(t)) lost();
      else if (/FLASH TRAFFIC/.test(t)) crisis();
      else if (/ESCALATION/.test(t)) { klaxon(); }
      else warnBeep();
    } else if (e.cls === 'warn') {
      if (/unrest/i.test(t)) unrest(); else warnBeep();
    } else if (e.cls === 'good') {
      if (/ZONE SECURED/.test(t)) secured();
      else if (/R&D complete|Procurement|appropriations/.test(t)) kaching();
      else if (/airborne/.test(t)) launch();
      else if (/Splash|intercepted|SPLASH/.test(t)) radio(true);
    }
  }

  return { ensure, applyVolumes, testBoom: () => { if (ok()) boom(1.5, { vol: 1, pan: 0, far: 0 }); }, click, radio, radioStatic, voiceBurst, onLog, onFx, onProj, ambientTick, unlocked: () => !!ctx };
})();

// ---------------------------------------------------------------------------
// Haptics: Capacitor plugin on Android, navigator.vibrate as a fallback
// ---------------------------------------------------------------------------
const Haptic = {
  fire(kind = 'light') {
    if (!Settings.get().haptics) return;
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    try {
      if (H && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        const p = kind === 'success' || kind === 'warning' || kind === 'error'
          ? H.notification({ type: kind.toUpperCase() })
          : H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
        if (p && p.catch) p.catch(() => {});
      } else if (navigator.vibrate) navigator.vibrate(kind === 'light' ? 8 : kind === 'heavy' || kind === 'error' ? 60 : 25);
    } catch (e) {}
  },
};
