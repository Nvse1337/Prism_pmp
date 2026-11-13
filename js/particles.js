/* =========================================================
   PRISM particle field
   A radial spectrum: the centre listens to the bass, the
   horizon listens to the treble. Particles are batched by colour
   and alpha so 1,600+ points can run at 60fps.
   ========================================================= */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const BAND_COUNT = 56;
  const TAU_SAFE = TAU - 0.0001;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const TRIANGLE_POINTS = [
    [0, -1.15],
    [1, 0.85],
    [-1, 0.85],
  ];
  const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? 1.08 : 0.46;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const DROP_POINTS = [
    [0, -1.55],
    [0.42, -0.62],
    [0.78, 0.08],
    [0.72, 0.54],
    [0.38, 0.88],
    [0, 1],
    [-0.38, 0.88],
    [-0.72, 0.54],
    [-0.78, 0.08],
    [-0.42, -0.62],
  ];
  const LINE_SEGMENTS = [[[-1.7, 0], [1.7, 0]]];
  const SNOW_SEGMENTS = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const angle = (axis * Math.PI) / 3;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    SNOW_SEGMENTS.push([[-dx, -dy], [dx, dy]]);
    for (const sign of [-1, 1]) {
      const bx = dx * sign * 0.56;
      const by = dy * sign * 0.56;
      for (const branch of [angle + Math.PI / 3, angle - Math.PI / 3]) {
        SNOW_SEGMENTS.push([
          [bx, by],
          [bx + Math.cos(branch) * 0.32, by + Math.sin(branch) * 0.32],
        ]);
      }
    }
  }
  const PARTICLE_SHAPES = new Set(["circle", "drop", "star", "line", "snow", "triangle"]);

  function tracePolygon(ctx, x, y, cosR, sinR, points, scale) {
    for (let i = 0; i < points.length; i += 1) {
      const lx = points[i][0] * scale;
      const ly = points[i][1] * scale;
      const px = x + lx * cosR - ly * sinR;
      const py = y + lx * sinR + ly * cosR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function traceSegments(ctx, x, y, cosR, sinR, segments, scale) {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      for (let j = 0; j < 2; j += 1) {
        const lx = segment[j][0] * scale;
        const ly = segment[j][1] * scale;
        const px = x + lx * cosR - ly * sinR;
        const py = y + lx * sinR + ly * cosR;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
  }

  function hexToRgb(hex) {
    let h = String(hex || "#8ef4ff").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    if (!Number.isFinite(n)) return [142, 244, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
  }

  class ParticleField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.dpr = 1;
      this.w = 1;
      this.h = 1;
      this.cx = 0;
      this.cy = 0;
      this.maxR = 300;
      this.time = 0;
      this.lastTime = performance.now();
      this.playing = false;
      this.active = true;
      this.started = false;
      this.analyser = null;
      this.freqData = null;
      this.waveData = null;
      this.waveRms = 0;
      this.prevWaveRms = 0;
      this.waveRise = 0;
      this.bands = new Float32Array(BAND_COUNT);
      this.targets = new Float32Array(BAND_COUNT);
      this.prevBands = new Float32Array(BAND_COUNT);
      this.flux = 0;
      this.low = 0;
      this.mid = 0;
      this.high = 0;
      this.prevLow = 0;
      this.lastBeat = 0;
      this.beatPulse = 0;
      this.kick = 0;
      this.autoPulse = 0;
      this.tempo = 100;
      this.pulseClock = 0;
      this.motion = 1;
      this.motionTarget = 1;
      this.ringBurst = 0;
      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      this.rings = [];
      this.lastRing = 0;
      this.ringSpawns = 0;
      this.sparks = [];
      this.particles = [];
      this.coreParticles = [];
      this.motes = [];
      this.density = 1;
      this.shape = "circle";
      this.palette = {
        a: [142, 244, 255],
        b: [255, 155, 226],
        c: [255, 211, 154],
      };
      this.colors = [];
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.count = 0;

      this._buildColorTable();
      this._onResize = this._debouncedResize.bind(this);
      this._onPointer = this._handlePointer.bind(this);
      this._tick = this._tick.bind(this);

      window.addEventListener("resize", this._onResize, { passive: true });
      window.addEventListener("pointermove", this._onPointer, { passive: true });
      document.addEventListener("visibilitychange", () => {
        this.lastTime = performance.now();
      });

      this.resize();
      requestAnimationFrame(this._tick);
    }

    /* ---------- public ---------- */
    attachAnalyser(analyser) {
      this.analyser = analyser;
      if (analyser) {
        this.freqData = new Uint8Array(analyser.frequencyBinCount);
        this.waveData = new Uint8Array(analyser.fftSize);
        this.binHz = (analyser.context.sampleRate || 44100) / analyser.fftSize;
      }
      this.started = true;
    }

    setPlaying(playing) {
      this.playing = !!playing;
    }

    setActive(active) {
      this.active = active !== false;
      this.lastTime = performance.now();
    }

    setMotion(value) {
      this.motionTarget = Math.min(2, Math.max(0, Number(value) || 0));
    }

    setDensity(value) {
      const next = clamp(Number(value) || 100, 40, 200) / 100;
      if (Math.abs(next - this.density) < 0.001) return;
      this.density = next;
      const base = this.reduced ? 790 : this.w < 720 ? 1375 : 3080;
      this._buildParticles(Math.max(280, Math.round(base * next)));
    }

    setShape(value) {
      const next = String(value || "circle");
      this.shape = PARTICLE_SHAPES.has(next) ? next : "circle";
    }

    setTempo(bpm) {
      this.tempo = clamp(Number(bpm) || 100, 50, 200);
      this.pulseClock = 0;
    }

    setPalette(colors) {
      if (!Array.isArray(colors) || colors.length < 2) return;
      this.palette.a = hexToRgb(colors[0]);
      this.palette.b = hexToRgb(colors[1]);
      this.palette.c = hexToRgb(colors[2] || colors[0]);
      this._buildColorTable();
    }

    pulse(strength = 1) {
      this.beatPulse = Math.min(1.8, this.beatPulse + strength);
      this._spawnRing(strength);
      this._burstSparks(6 + Math.floor(10 * strength), strength);
    }

    /* ---------- setup ---------- */
    _buildColorTable() {
      const white = [242, 253, 255];
      const cyan = this.palette.a;
      const pink = this.palette.b;
      const amber = this.palette.c;
      const groups = [
        [white, cyan],
        [cyan, pink],
        [pink, amber],
      ];
      this.colors = [];
      for (let g = 0; g < groups.length; g++) {
        const base = groups[g][0];
        const tint = groups[g][1];
        const row = [];
        for (let a = 0; a < 5; a++) {
          const t = a / 5;
          const c = [
            Math.round(lerp(base[0], tint[0], t)),
            Math.round(lerp(base[1], tint[1], t)),
            Math.round(lerp(base[2], tint[2], t)),
          ];
          row.push(rgba(c, 0.09 + a * 0.175));
        }
        this.colors.push(row);
      }
    }

    _debouncedResize() {
      clearTimeout(this._rsTimer);
      this._rsTimer = setTimeout(() => this.resize(), 120);
    }

    resize() {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = w;
      this.h = h;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.cx = w * 0.5;
      this.cy = h * (w < 720 ? 0.405 : h < 760 ? 0.415 : 0.438);
      this.maxR = Math.min(w * 0.415, h * 0.372, 440);
      if (this.maxR < 120) this.maxR = Math.min(w * 0.42, h * 0.40);

      const targetCount = this.reduced ? 790 : w < 720 ? 1375 : 3080;
      const scaledCount = Math.max(280, Math.round(targetCount * this.density));
      if (scaledCount !== this.count) this._buildParticles(scaledCount);
    }

    _buildParticles(count) {
      this.count = count;
      const particles = new Array(count);
      const ringCount = 26;
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        let r;
        if (i % 7 < 4) {
          // Most points sit on loosely spaced rings. Each ring samples one
          // log-spaced band, which makes the high-centre/low-edge mapping legible.
          const ring = Math.floor(Math.random() * ringCount);
          r = (ring + 0.12 + Math.random() * 0.76) / ringCount;
          r = 0.03 + r * 0.95;
        } else {
          r = 0.025 + 0.975 * Math.pow(u, 0.68);
        }
        if (i % 13 === 0) r = 0.032 + Math.random() * 0.13;
        const arm = i % 5 === 0 ? (r * 3.4 + (i % 3) * 1.8) : 0;
        const angle = Math.random() * TAU + arm;
        const group = r < 0.38 ? 0 : r < 0.76 ? 1 : 2;
        const band = Math.min(BAND_COUNT - 1, Math.floor(r * (BAND_COUNT - 1) * 0.97));
        particles[i] = {
          r,
          band,
          offset: 0,
          velocity: 0,
          variance: 0.62 + Math.random() * 0.78,
          rate: 0.42 + Math.random() * 0.95,
          stiffness: 46 + Math.random() * 38,
          damping: 6.4 + Math.random() * 3.4,
          orbit: (Math.random() - 0.5) * 0.9,
          angle,
          size: 0.55 + Math.random() * (r < 0.3 ? 1.35 : 1.85),
          phase: Math.random() * TAU,
          twinkle: 0.55 + Math.random() * 0.8,
          spin: 0.38 + Math.random() * 0.8,
          group,
          jitter: 0.4 + Math.random() * 1.4,
        };
      }
      this.particles = particles;
      this._buildExtras();
    }

    _buildExtras() {
      const coreCount = Math.round((this.reduced ? 99 : this.w < 720 ? 165 : 396) * this.density);
      this.coreParticles = new Array(coreCount);
      for (let i = 0; i < coreCount; i++) {
        this.coreParticles[i] = {
          r: 0.018 + Math.pow(Math.random(), 1.75) * 0.15,
          angle: Math.random() * TAU,
          size: 0.5 + Math.random() * 1.5,
          phase: Math.random() * TAU,
          spin: 0.3 + Math.random() * 1.7,
          band: 1 + Math.floor(Math.random() * 15),
        };
      }

      const moteCount = Math.round((this.reduced ? 66 : this.w < 720 ? 110 : 198) * this.density);
      this.motes = new Array(moteCount);
      for (let i = 0; i < moteCount; i++) {
        this.motes[i] = {
          nr: 0.04 + Math.random() * 0.9,
          angle: Math.random() * TAU,
          speed: 0.012 + Math.random() * 0.035,
          spin: (Math.random() - 0.5) * 0.12,
          size: 0.5 + Math.random() * 1.2,
          hot: Math.random() < 0.2,
        };
      }
    }

    /* ---------- spectrum ---------- */
    _updateSpectrum(dt) {
      const ease = 1 - Math.exp(-dt * 8);
      if (this.analyser && this.freqData) {
        this.analyser.getByteFrequencyData(this.freqData);
        this.analyser.getByteTimeDomainData(this.waveData);
        let waveSum = 0;
        let waveCount = 0;
        for (let i = 0; i < this.waveData.length; i += 4) {
          const sample = (this.waveData[i] - 128) / 128;
          waveSum += sample * sample;
          waveCount += 1;
        }
        this.waveRms = Math.sqrt(waveSum / Math.max(1, waveCount));
        this.waveRise = Math.max(0, this.waveRms - this.prevWaveRms);
        this.prevWaveRms = lerp(this.prevWaveRms, this.waveRms, 0.3);
        const nyquist = this.analyser.context.sampleRate / 2;
        const top = Math.min(nyquist * 0.92, 10000);
        const bottom = 36;
        const ratio = top / bottom;
        let lowSum = 0;
        let midSum = 0;
        let highSum = 0;

        for (let i = 0; i < BAND_COUNT; i++) {
          const f0 = bottom * Math.pow(ratio, i / BAND_COUNT);
          const f1 = bottom * Math.pow(ratio, (i + 1) / BAND_COUNT);
          const b0 = clamp(Math.floor(f0 / this.binHz), 1, this.freqData.length - 2);
          const b1 = clamp(Math.ceil(f1 / this.binHz), b0 + 1, this.freqData.length - 1);
          let sum = 0;
          for (let b = b0; b < b1; b++) sum += this.freqData[b];
          let v = sum / (b1 - b0) / 255;
          // The top octaves carry less energy; tilt them up a little so the
          // central (treble) particles are as alive as the outer (bass) ones.
          const tilt = 0.92 + (i / BAND_COUNT) * 0.44;
          v = Math.pow(v, 0.86) * tilt;
          this.targets[i] = clamp(Math.max(v, 0.028), 0, 1);
          if (i < 9) lowSum += this.targets[i];
          else if (i < 38) midSum += this.targets[i];
          else highSum += this.targets[i];
        }

        this.low = lerp(this.low, Math.max(0.04, lowSum / 9), ease);
        this.mid = lerp(this.mid, Math.max(0.03, midSum / 29), ease);
        this.high = lerp(this.high, Math.max(0.025, highSum / (BAND_COUNT - 38)), ease);
      } else {
        // a quiet, living standby field before the first click
        const t = this.time;
        for (let i = 0; i < BAND_COUNT; i++) {
          const n = i / BAND_COUNT;
          const v =
            0.085 +
            0.035 * Math.sin(t * 0.6 + n * 9.0) +
            0.022 * Math.sin(t * 1.13 - n * 17.0 + 1.4);
          this.targets[i] = Math.max(0.025, v);
        }
        this.low = 0.09;
        this.mid = 0.075;
        this.high = 0.065;
      }

      for (let i = 0; i < BAND_COUNT; i++) {
        const cur = this.bands[i];
        const target = this.targets[i];
        const k = target > cur ? 0.55 : 0.1;
        this.bands[i] = cur + (target - cur) * k;
      }

      // Spectral flux catches drum hits even when the bass bands are already
      // saturated and their average level barely changes.
      let flux = 0;
      for (let i = 0; i < BAND_COUNT; i++) {
        const diff = this.bands[i] - this.prevBands[i];
        if (diff > 0) flux += diff;
        this.prevBands[i] = this.bands[i];
      }
      this.flux = lerp(this.flux, flux / BAND_COUNT, 0.62);

      // Kick detection: react to a low-end onset, a fast rise, or broadband flux.
      const now = performance.now();
      const lowRise = Math.max(0, this.low - this.prevLow);
      if (
        this.playing &&
        (this.low > 0.1 || this.flux > 0.0015) &&
        (this.waveRise > 0.01 || lowRise > 0.006 || this.flux > 0.0022) &&
        now - this.lastBeat > 165
      ) {
        this.lastBeat = now;
        const strength = Math.min(
          1.7,
          0.62 + this.low * 1.15 + lowRise * 2.4 + this.flux * 7 + this.waveRise * 4
        );
        this._spawnRing(strength);
        this._burstSparks(
          7 + Math.floor(this.low * 18 + lowRise * 20 + this.flux * 40 + this.waveRise * 30),
          strength
        );
        this.beatPulse = Math.min(
          2.4,
          this.beatPulse +
            0.8 +
            this.low * 0.75 +
            lowRise * 2.2 +
            this.flux * 4 +
            this.waveRise * 5
        );
        this.kick = Math.max(
          this.kick,
          0.8 + this.low + lowRise * 3 + this.flux * 8 + this.waveRise * 8
        );
      }
      this.prevLow = lerp(this.prevLow, this.low, 0.32);
      this.kick *= Math.exp(-dt * 5.5);
      this.beatPulse *= Math.exp(-dt * 2.9);

      // A steady visual pulse fills the gap when the track has no sharp
      // transients (pads, ambient, already-compressed bass). It is driven by
      // the detected/known tempo and only adds a soft spring impulse.
      if (this.playing) {
        this.pulseClock += dt * (this.tempo / 60);
        if (this.pulseClock >= 1) {
          this.pulseClock %= 1;
          this.autoPulse = Math.max(this.autoPulse, 0.75 + this.low * 0.35);
        }
      }
      this.autoPulse *= Math.exp(-dt * 4.6);
      this.motion = lerp(this.motion, this.motionTarget, 1 - Math.exp(-dt * 6));

      // pointer easing
      this.pointer.x = lerp(this.pointer.x, this.pointer.tx, 1 - Math.exp(-dt * 3));
      this.pointer.y = lerp(this.pointer.y, this.pointer.ty, 1 - Math.exp(-dt * 3));
    }

    _handlePointer(e) {
      if (e.pointerType === "touch") return;
      this.pointer.tx = (e.clientX / this.w - 0.5) * 2;
      this.pointer.ty = (e.clientY / this.h - 0.5) * 2;
    }

    /* ---------- particles / rings / sparks ---------- */
    _spawnRing(strength) {
      const now = performance.now();
      if (now - this.lastRing < 3200) return;
      this.lastRing = now;
      this.ringSpawns += 1;
      if (this.rings.length >= 2) this.rings.shift();
      const pick = this.palette.a;
      this.rings.push({
        r: this.maxR * 0.045,
        alpha: 0.045 + 0.075 * strength,
        width: 4 + strength * 6,
        speed: this.maxR * (0.08 + strength * 0.1),
        color: Math.random() < 0.28 ? this.palette.c : pick,
      });
    }

    _burstSparks(n, strength) {
      for (let i = 0; i < n; i++) {
        if (this.sparks.length > 150) this.sparks.shift();
        const a = Math.random() * TAU;
        this.sparks.push({
          a,
          r: this.maxR * (0.035 + Math.random() * 0.04),
          speed: this.maxR * (0.03 + Math.random() * 0.06) * (0.6 + strength),
          life: 0.5 + Math.random() * 0.8,
          maxLife: 1.3,
          size: 0.7 + Math.random() * 1.5,
          hue: Math.random() < 0.2 ? this.palette.c : Math.random() < 0.55 ? this.palette.a : this.palette.b,
          wobble: (Math.random() - 0.5) * 0.7,
        });
      }
    }

    _updateSparks(dt) {
      if (this.playing) {
        const spawn = this.high > 0.16 ? 2 : this.high > 0.08 ? 1 : 0;
        if (spawn && this.sparks.length < 140) this._burstSparks(spawn, 0.25 + this.high);
      }
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          this.sparks.splice(i, 1);
          continue;
        }
        s.r += s.speed * dt * (0.8 + this.low * 1.8);
        s.a += s.wobble * dt;
      }
    }

    _updateRings(dt) {
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        ring.r += ring.speed * dt * (0.82 + this.low * 0.9);
        ring.alpha *= Math.exp(-dt * 0.58);
        if (ring.r > this.maxR * 1.12 || ring.alpha < 0.006) this.rings.splice(i, 1);
      }
    }

    _updateMotes(dt) {
      const bassMotion = (this.low * 1.8 + this.beatPulse * 0.35) * this.motion;
      const boost = 0.55 + bassMotion;
      for (const m of this.motes) {
        m.nr += m.speed * dt * boost;
        m.angle += m.spin * dt;
        if (m.nr > 1.08) {
          m.nr = 0.02 + Math.random() * 0.08;
          m.angle = Math.random() * TAU;
          m.speed = 0.012 + Math.random() * 0.035;
        }
      }
    }

    _updateParticles(dt) {
      const motion = this.reduced ? this.motion * 0.35 : this.motion;
      const maxR = this.maxR;
      const beat = this.beatPulse;
      const time = this.time;
      for (const p of this.particles) {
        const level = this.bands[p.band];
        // Each particle gets its own phase, spring stiffness and response
        // weight, so the field moves as a collection of voices rather than
        // one uniformly pulsing object.
        const localBeat =
          beat * (0.24 + 0.76 * (0.5 + 0.5 * Math.sin(time * (0.7 + p.rate) + p.phase)));
        const localAuto =
          this.autoPulse *
          (0.14 + 0.86 * (0.5 + 0.5 * Math.sin(time * (0.8 + p.rate * 1.35) + p.phase + p.r * 5.4)));
        const target =
          (level * maxR * (0.04 + p.r * 0.095) +
            localBeat * maxR * (0.018 + p.r * 0.038) +
            localAuto * maxR * (0.026 + p.r * 0.04)) *
          motion *
          p.variance;
        p.velocity += (target - p.offset) * p.stiffness * dt;
        p.velocity *= Math.exp(-dt * p.damping);
        p.offset += p.velocity * dt;
        p.offset = clamp(p.offset, -maxR * 0.04, maxR * 0.3);
      }
    }

    /* ---------- drawing ---------- */
    _tick(now) {
      if (!this.active) {
        this.lastTime = now;
        requestAnimationFrame(this._tick);
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
      this.lastTime = now;
      this.time += dt;
      this._updateSpectrum(dt);
      this._updateRings(dt);
      this._updateSparks(dt);
      this._updateMotes(dt);
      this._updateParticles(dt);
      this._draw();
      requestAnimationFrame(this._tick);
    }

    _draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      const cx = this.cx + this.pointer.x * 8;
      const cy = this.cy + this.pointer.y * 6;
      const maxR = this.maxR;
      const bass = this.low;
      const high = this.high;
      const time = this.time;

      ctx.globalCompositeOperation = "source-over";
      this._drawHaze(ctx, cx, cy, maxR);
      ctx.globalCompositeOperation = "lighter";

      this._drawHorizon(ctx, cx, cy, maxR, high, time);
      this._drawHorizonTicks(ctx, cx, cy, maxR, high, time);
      this._drawGuides(ctx, cx, cy, maxR, bass, time);
      this._drawCore(ctx, cx, cy, maxR, bass, high, time);
      this._drawCoreRays(ctx, cx, cy, maxR, bass, time);
      this._drawRings(ctx, cx, cy);
      this._drawMotes(ctx, cx, cy, maxR, time);
      this._drawParticles(ctx, cx, cy, maxR, bass, high, time);
      this._drawCoreParticles(ctx, cx, cy, maxR, bass, time);
      this._drawSparks(ctx, cx, cy);

      ctx.globalCompositeOperation = "source-over";
    }

    _drawHaze(ctx, cx, cy, maxR) {
      const outer = maxR * 1.08;
      const g = ctx.createRadialGradient(cx, cy, maxR * 0.04, cx, cy, outer);
      g.addColorStop(0, "rgba(2,5,12,.13)");
      g.addColorStop(0.58, "rgba(2,5,12,.065)");
      g.addColorStop(0.84, "rgba(2,5,12,.018)");
      g.addColorStop(1, "rgba(2,5,12,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, TAU);
      ctx.fill();
    }

    _drawHorizon(ctx, cx, cy, maxR, treble, time) {
      const outer = maxR * (1 + treble * 0.22 + this.beatPulse * 0.02);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.015);
      ctx.beginPath();
      ctx.arc(0, 0, outer, 0, TAU);
      ctx.strokeStyle = rgba(this.palette.b, 0.06 + treble * 0.3);
      ctx.lineWidth = 1.15;
      ctx.setLineDash([1, 10]);
      ctx.lineDashOffset = -time * 5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, outer * 0.972, 0, TAU);
      ctx.strokeStyle = rgba(this.palette.a, 0.035 + treble * 0.18);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }

    _drawHorizonTicks(ctx, cx, cy, maxR, treble, time) {
      const base = maxR * (0.995 + treble * 0.12 + this.beatPulse * 0.015);
      const ticks = 144;
      ctx.beginPath();
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * TAU + time * 0.012;
        const band = this.bands[BAND_COUNT - 1 - ((i * 5) % 11)];
        const len = 1.5 + band * 9 + treble * 4;
        const c = Math.cos(a);
        const s = Math.sin(a);
        ctx.moveTo(cx + c * base, cy + s * base);
        ctx.lineTo(cx + c * (base + len), cy + s * (base + len));
      }
      ctx.strokeStyle = rgba(this.palette.c, 0.055 + treble * 0.22);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    _drawGuides(ctx, cx, cy, maxR, bass, time) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.006);
      for (let i = 0; i < 3; i++) {
        const radius = maxR * (0.34 + i * 0.29);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.setLineDash([1, 13 + i * 5]);
        ctx.lineDashOffset = -time * (2 + i);
        ctx.strokeStyle = rgba(this.palette.a, 0.04 + bass * 0.025);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // tiny frequency ticks riding the middle guide
      const middle = maxR * 0.63;
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * TAU;
        const length = 1.5 + this.bands[(i * 7) % BAND_COUNT] * 4.5;
        ctx.moveTo(Math.cos(a) * middle, Math.sin(a) * middle);
        ctx.lineTo(Math.cos(a) * (middle + length), Math.sin(a) * (middle + length));
      }
      ctx.strokeStyle = rgba(this.palette.a, 0.055 + this.mid * 0.12);
      ctx.lineWidth = 0.55;
      ctx.stroke();
      ctx.restore();
    }

    _drawCore(ctx, cx, cy, maxR, bass, high, time) {
      const pulse = 1 + bass * 0.3 + this.beatPulse * 0.12;
      const coreR = Math.max(4, maxR * 0.022 * pulse);
      const breathe = 1 + Math.sin(time * 1.7) * 0.03;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 5.2);
      g.addColorStop(0, "rgba(255,255,255,.82)");
      g.addColorStop(0.09, rgba(this.palette.a, 0.62));
      g.addColorStop(0.28, rgba(this.palette.a, 0.12));
      g.addColorStop(0.62, rgba(this.palette.b, 0.03));
      g.addColorStop(1, rgba(this.palette.b, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 5.2 * breathe, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      if (this.shape === "circle") {
        ctx.arc(cx, cy, coreR * 0.55 * breathe, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,.78)";
        ctx.fill();
      } else {
        this._traceShape(ctx, this.shape, cx, cy, coreR * 1.45, 0);
        if (this._isStrokeShape(this.shape)) {
          ctx.strokeStyle = "rgba(255,255,255,.72)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(255,255,255,.74)";
          ctx.fill();
        }
      }

      // low-frequency needles radiating from the core
      const needles = 96;
      const inner = coreR * (1.15 + this.beatPulse * 0.08);
      ctx.beginPath();
      for (let i = 0; i < needles; i++) {
        const a = (i / needles) * TAU + time * 0.035;
        const band = this.bands[Math.min(15, Math.floor((i / needles) * 16))];
        const len = coreR * (0.35 + band * 3.6);
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
      }
      ctx.strokeStyle = rgba(this.palette.a, 0.1 + bass * 0.26);
      ctx.lineWidth = 0.58;
      ctx.stroke();

      // fine inner halo
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * (2.1 + bass * 0.4), 0, TAU);
      ctx.strokeStyle = rgba(this.palette.a, 0.055 + bass * 0.08);
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }

    _drawCoreRays(ctx, cx, cy, maxR, bass, time) {
      const rays = 64;
      const start = maxR * 0.043;
      ctx.beginPath();
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU - time * 0.026;
        const band = this.bands[(i * 3) % 14];
        const len = maxR * (0.01 + band * 0.11);
        ctx.moveTo(cx + Math.cos(a) * start, cy + Math.sin(a) * start);
        ctx.lineTo(cx + Math.cos(a) * (start + len), cy + Math.sin(a) * (start + len));
      }
      ctx.strokeStyle = rgba(this.palette.a, 0.05 + bass * 0.16);
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }

    _drawCoreParticles(ctx, cx, cy, maxR, low, time) {
      const groups = [[[], [], [], []], [[], [], [], []]];
      const shape = this.shape;
      for (const p of this.coreParticles) {
        const level = this.bands[p.band];
        const angle = p.angle + time * (0.012 + p.spin * 0.026);
        const rr = maxR * (p.r * (1 + level * 0.55 * this.motion) + this.beatPulse * 0.014 * this.motion);
        const x = cx + Math.cos(angle) * rr;
        const y = cy + Math.sin(angle) * rr;
        const alpha = 0.1 + level * 0.58 + this.beatPulse * 0.04;
        const bucket = Math.min(3, Math.floor(alpha / 0.25));
        const size = p.size * (0.74 + level * 1.5 + this.beatPulse * 0.2);
        let rotation = 0;
        if (shape === "drop") {
          rotation = angle - Math.PI / 2;
        } else if (shape === "line") {
          rotation = angle + Math.PI / 2;
        } else if (shape !== "circle") {
          rotation = p.phase + time * (0.05 + p.spin * 0.08);
        }
        groups[p.band % 9 === 0 ? 1 : 0][bucket].push(x, y, size, rotation);
      }
      const strokeShape = this._isStrokeShape(shape);
      for (let g = 0; g < 2; g++) {
        for (let a = 0; a < 4; a++) {
          const arr = groups[g][a];
          if (!arr.length) continue;
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 4) {
            this._traceShape(ctx, shape, arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
          }
          if (strokeShape) {
            ctx.strokeStyle = rgba(g === 0 ? [238, 253, 255] : this.palette.c, 0.18 + a * 0.18);
            ctx.lineWidth = shape === "line" ? 0.9 : 0.5;
            ctx.stroke();
          } else {
            ctx.fillStyle = rgba(g === 0 ? [238, 253, 255] : this.palette.c, 0.16 + a * 0.18);
            ctx.fill();
          }
        }
      }
      if (shape === "circle") {
        // a soft nucleus made of larger glows
        ctx.beginPath();
        for (let i = 0; i < this.coreParticles.length; i += 5) {
          const p = this.coreParticles[i];
          const angle = p.angle + time * (0.012 + p.spin * 0.026);
          const rr = maxR * (p.r * (1 + this.bands[p.band] * 0.55 * this.motion));
          const x = cx + Math.cos(angle) * rr;
          const y = cy + Math.sin(angle) * rr;
          ctx.moveTo(x, y);
          ctx.arc(x, y, p.size * 1.8, 0, TAU_SAFE);
        }
        ctx.fillStyle = rgba(this.palette.a, 0.065);
        ctx.fill();
      }
    }

    _drawMotes(ctx, cx, cy, maxR, time) {
      for (let hot = 0; hot < 2; hot++) {
        ctx.beginPath();
        for (const m of this.motes) {
          if ((m.hot ? 1 : 0) !== hot) continue;
          const r = m.nr * maxR;
          const trail = 1.5 + m.speed * maxR * 0.22;
          const a = m.angle;
          const c = Math.cos(a);
          const s = Math.sin(a);
          ctx.moveTo(cx + c * Math.max(0, r - trail), cy + s * Math.max(0, r - trail));
          ctx.lineTo(cx + c * r, cy + s * r);
        }
        ctx.strokeStyle = rgba(hot ? this.palette.c : this.palette.a, hot ? 0.12 : 0.16);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    }

    _drawRings(ctx, cx, cy) {
      for (const ring of this.rings) {
        const spread = ring.width * 7;
        const inner = Math.max(0, ring.r - spread);
        const outer = ring.r + spread;
        const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(0.35, rgba(ring.color, ring.alpha * 0.32));
        gradient.addColorStop(0.52, rgba(ring.color, ring.alpha));
        gradient.addColorStop(0.72, rgba(ring.color, ring.alpha * 0.3));
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, outer, 0, TAU);
        ctx.fill();
      }
    }

    _isStrokeShape(shape) {
      return shape === "line" || shape === "snow";
    }

    _traceShape(ctx, shape, x, y, size, rotation) {
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      if (shape === "circle") {
        ctx.moveTo(x + size * 0.5, y);
        ctx.arc(x, y, size * 0.5, 0, TAU_SAFE);
      } else if (shape === "triangle") {
        tracePolygon(ctx, x, y, cosR, sinR, TRIANGLE_POINTS, size * 0.55);
      } else if (shape === "star") {
        tracePolygon(ctx, x, y, cosR, sinR, STAR_POINTS, size * 0.55);
      } else if (shape === "drop") {
        tracePolygon(ctx, x, y, cosR, sinR, DROP_POINTS, size * 0.55);
      } else if (shape === "line") {
        traceSegments(ctx, x, y, cosR, sinR, LINE_SEGMENTS, size * 0.55);
      } else {
        traceSegments(ctx, x, y, cosR, sinR, SNOW_SEGMENTS, size * 0.55);
      }
    }

    _drawParticles(ctx, cx, cy, maxR, bass, high, time) {
      const groups = [];
      for (let g = 0; g < 3; g++) groups.push([[], [], [], [], []]);
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const level = this.bands[p.band];
        const ambient = Math.sin(time * 0.9 + p.phase) * p.jitter * 0.35;
        const spin = this.reduced ? 0 : time * 0.0038 * p.spin * (0.4 + p.r);
        const angle =
          p.angle +
          spin +
          p.orbit * (0.3 + level * 0.7) * Math.sin(time * (0.3 + p.rate * 0.4) + p.phase) +
          (high * 0.012 + this.beatPulse * 0.006) * Math.sin(time + p.phase) * this.motion;
        const rr =
          p.r * maxR +
          p.offset +
          ambient +
          Math.sin(time * 1.2 + p.phase) * 0.5;
        const parallax = 1 + p.r * 0.34;
        const x = cx + Math.cos(angle) * rr + this.pointer.x * 5 * parallax;
        const y = cy + Math.sin(angle) * rr + this.pointer.y * 4 * parallax;

        const twinkle = 0.7 + 0.3 * Math.sin(time * (1.1 + p.twinkle) + p.phase);
        let alpha = (0.18 + level * 1.18 + this.beatPulse * 0.14) * twinkle;
        if (p.r > 0.82) alpha *= 1.08;
        alpha = clamp(alpha, 0.06, 0.98);
        const bucket = Math.min(4, Math.max(0, Math.floor(alpha / 0.2)));
        const size =
          p.size *
          (0.86 + level * 1.65 + this.beatPulse * 0.52 + this.kick * 0.24 + this.autoPulse * 0.22) *
          (0.84 + p.variance * 0.2);
        let rotation = 0;
        if (this.shape === "drop") {
          // The local tip points up; rotate it inward toward the centre.
          rotation = angle - Math.PI / 2;
        } else if (this.shape === "line") {
          rotation = angle + Math.PI / 2;
        } else if (this.shape !== "circle") {
          rotation = p.phase + time * (0.05 + p.rate * 0.08);
        }
        groups[p.group][bucket].push(x, y, size, rotation);
      }

      const shape = this.shape;
      const strokeShape = this._isStrokeShape(shape);
      for (let g = 0; g < 3; g++) {
        for (let a = 0; a < 5; a++) {
          const arr = groups[g][a];
          if (!arr.length) continue;
          ctx.beginPath();
          for (let i = 0; i < arr.length; i += 4) {
            const size = arr[i + 2];
            const x = arr[i];
            const y = arr[i + 1];
            const rotation = arr[i + 3];
            this._traceShape(ctx, shape, x, y, size, rotation);
          }
          if (strokeShape) {
            ctx.strokeStyle = this.colors[g][a];
            ctx.lineWidth = shape === "line" ? 1.0 : 0.55;
            ctx.stroke();
          } else {
            ctx.fillStyle = this.colors[g][a];
            ctx.fill();
          }
        }
      }

      if (this.shape === "circle") {
        // a few soft, larger motes for depth (kept separate to stay cheap)
        ctx.beginPath();
        for (let i = 0; i < this.particles.length; i += 9) {
          const p = this.particles[i];
          if (p.r < 0.30) continue;
          const angle = p.angle + time * 0.0026 * p.spin;
          const rr = p.r * maxR + p.offset + Math.sin(time + p.phase) * 1.2;
          const x = cx + Math.cos(angle) * rr;
          const y = cy + Math.sin(angle) * rr;
          ctx.moveTo(x, y);
          ctx.arc(x, y, p.size * 2.2, 0, TAU_SAFE);
        }
        ctx.fillStyle = rgba(this.palette.a, 0.04 + this.beatPulse * 0.018);
        ctx.fill();

        // bright pin-pricks, so the field reads even between beats
        ctx.beginPath();
        for (let i = 3; i < this.particles.length; i += 8) {
          const p = this.particles[i];
          const angle = p.angle + time * 0.004 * p.spin;
          const rr = p.r * maxR + p.offset + Math.sin(time * 1.2 + p.phase) * 0.8;
          const x = cx + Math.cos(angle) * rr;
          const y = cy + Math.sin(angle) * rr;
          ctx.moveTo(x, y);
          ctx.arc(x, y, p.size * 0.65, 0, TAU_SAFE);
        }
        ctx.fillStyle = "rgba(236,252,255,.20)";
        ctx.fill();
      }
    }

    _drawSparks(ctx, cx, cy) {
      ctx.beginPath();
      for (const s of this.sparks) {
        const a = s.life / s.maxLife;
        const x = cx + Math.cos(s.a) * s.r;
        const y = cy + Math.sin(s.a) * s.r;
        const x2 = cx + Math.cos(s.a - s.wobble * 0.012) * (s.r + s.speed * 0.035);
        const y2 = cy + Math.sin(s.a - s.wobble * 0.012) * (s.r + s.speed * 0.035);
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = rgba(s.hue, 0.34 * a);
      }
      ctx.strokeStyle = rgba(this.palette.a, 0.30);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  window.PRISM = window.PRISM || {};
  window.PRISM.ParticleField = ParticleField;
  window.PRISM.SHAPE_PATHS = {
    triangle: TRIANGLE_POINTS,
    star: STAR_POINTS,
    drop: DROP_POINTS,
    line: LINE_SEGMENTS,
    snow: SNOW_SEGMENTS,
  };
})();
