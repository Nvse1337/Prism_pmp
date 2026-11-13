/* =========================================================
   PRISM 3D particle sphere (experimental)
   three.js renderer that turns the particle field into a
   volumetric ball:
   - per-particle brightness follows the music envelope
   - six fixed camera shots with bezier-eased flights
   - section detection flips the camera at musical boundaries
   ========================================================= */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const CAMERA_SHOTS = [
    { id: "front", label: "正面", az: 0, polar: Math.PI / 2, radius: 4.15 },
    { id: "quarter", label: "斜角", az: 0.66, polar: 1.02, radius: 4.0 },
    { id: "side", label: "侧面", az: Math.PI / 2, polar: Math.PI / 2, radius: 4.45 },
    { id: "top", label: "俯视", az: 0.22, polar: 0.24, radius: 3.85 },
    { id: "low", label: "仰视", az: -0.62, polar: 1.94, radius: 4.55 },
    { id: "close", label: "近景", az: 0.18, polar: 1.4, radius: 2.5 },
  ];
  const SHOT_BY_ID = new Map(CAMERA_SHOTS.map((shot) => [shot.id, shot]));

  const EASE_PRESETS = {
    smooth: [0.42, 0, 0.58, 1],
    out: [0.16, 1, 0.3, 1],
    in: [0.55, 0, 1, 0.45],
    elastic: [0.34, 1.56, 0.64, 1],
  };

  const SHAPE_NAMES = ["circle", "drop", "star", "line", "snow", "triangle"];
  // Each shape is normalised into the same 80px box so all six read at one size.
  const SHAPE_TILE_SCALE = {
    circle: 40,
    triangle: 40 / 1.15,
    star: 40 / 1.08,
    drop: 40 / 1.55,
    line: 40 / 1.7,
    snow: 40,
  };
  const SHAPE_POINT_SCALE = 2.6;

  /* Traces one of the 2D engine's shapes into the current path. */
  function traceShapePath(ctx, shape, scale, paths) {
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, scale, 0, TAU);
      return "fill";
    }
    const points = paths[shape];
    if (!points) {
      ctx.beginPath();
      ctx.arc(0, 0, scale, 0, TAU);
      return "fill";
    }
    ctx.beginPath();
    if (shape === "line" || shape === "snow") {
      for (let s = 0; s < points.length; s += 1) {
        for (let i = 0; i < 2; i += 1) {
          const x = points[s][i][0] * scale;
          const y = points[s][i][1] * scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      return "stroke";
    }
    for (let i = 0; i < points.length; i += 1) {
      const x = points[i][0] * scale;
      const y = points[i][1] * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return "fill";
  }

  /* Renders a white sprite for one shape; the shader tints it per particle. */
  function createShapeTexture(shape, paths) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = SHAPE_TILE_SCALE[shape] || 40;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (shape === "circle") {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.45, "rgba(255,255,255,.72)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.fill();
    } else {
      // Soft halo first, then a crisp core on top.
      ctx.shadowColor = "rgba(255,255,255,.9)";
      ctx.shadowBlur = 13;
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 8;
      let kind = traceShapePath(ctx, shape, scale, paths);
      if (kind === "stroke") ctx.stroke();
      else ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 5;
      kind = traceShapePath(ctx, shape, scale, paths);
      if (kind === "stroke") ctx.stroke();
      else ctx.fill();
    }
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  /* CSS-style cubic-bezier(x1, y1, x2, y2): returns f(x) in [0, 1]. */
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * clamp(x1, 0, 1);
    const bx = 3 * (clamp(x2, 0, 1) - clamp(x1, 0, 1)) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return function ease(x) {
      const px = clamp(x, 0, 1);
      let t = px;
      for (let i = 0; i < 8; i += 1) {
        const delta = sampleX(t) - px;
        if (Math.abs(delta) < 1e-5) return sampleY(t);
        const slope = slopeX(t);
        if (Math.abs(slope) < 1e-6) break;
        t -= delta / slope;
        if (t < 0 || t > 1) break;
      }
      let lo = 0;
      let hi = 1;
      t = px;
      for (let i = 0; i < 30; i += 1) {
        const value = sampleX(t);
        if (Math.abs(value - px) < 1e-5) break;
        if (value < px) lo = t;
        else hi = t;
        t = (lo + hi) * 0.5;
      }
      return sampleY(t);
    };
  }

  const VERTEX_SHADER = [
    "uniform float uTime;",
    "uniform float uLevel;",
    "uniform float uBeat;",
    "uniform float uMotion;",
    "uniform float uPointScale;",
    "uniform float uPixelRatio;",
    "uniform float uShapeScale;",
    "uniform vec3 uColorA;",
    "uniform vec3 uColorB;",
    "uniform vec3 uColorC;",
    "attribute float aPhase;",
    "attribute float aSize;",
    "attribute float aTint;",
    "varying vec3 vColor;",
    "varying float vBright;",
    "void main() {",
    "  vec3 dir = normalize(position);",
    "  float wave = sin(aPhase * 6.2831 + uTime * 1.6 + dir.y * 3.4);",
    "  float breathe = (uLevel * 0.16 + uBeat * 0.05) * uMotion;",
    "  vec3 local = position + dir * breathe * (0.55 + 0.45 * wave);",
    "  vec4 world = modelMatrix * vec4(local, 1.0);",
    "  vec4 mvPosition = viewMatrix * world;",
    "  gl_Position = projectionMatrix * mvPosition;",
    "  vec3 worldNormal = normalize(mat3(modelMatrix) * dir);",
    "  vec3 viewDir = normalize(cameraPosition - world.xyz);",
    "  float facing = dot(worldNormal, viewDir);",
    "  float front = smoothstep(-0.55, 0.85, facing);",
    "  float rim = pow(1.0 - clamp(abs(facing), 0.0, 1.0), 2.0);",
    "  float twinkle = 0.62 + 0.38 * sin(uTime * 2.1 + aPhase * 7.0);",
    "  float base = (0.30 + 0.70 * uLevel) * (0.70 + 0.30 * twinkle) + uBeat * 0.30;",
    "  vBright = clamp(base * (0.18 + 0.72 * front + rim * 0.85), 0.0, 1.5);",
    "  vec3 tint = aTint < 1.0",
    "    ? mix(uColorA, uColorB, aTint)",
    "    : mix(uColorB, uColorC, aTint - 1.0);",
    "  vColor = tint;",
    "  float size = aSize * (1.0 + uLevel * 0.45 + uBeat * 0.35) * (0.55 + 0.55 * front);",
    "  float pointSize = size * uShapeScale * uPointScale * uPixelRatio / max(0.35, -mvPosition.z);",
    "  gl_PointSize = min(pointSize, 56.0);",
    "}",
  ].join("\n");

  const FRAGMENT_SHADER = [
    "uniform sampler2D uShapeMap;",
    "varying vec3 vColor;",
    "varying float vBright;",
    "void main() {",
    "  vec2 shapeUv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);",
    "  vec4 texel = texture2D(uShapeMap, shapeUv);",
    "  float mask = texel.a;",
    "  if (mask < 0.02) discard;",
    "  float alpha = mask * vBright * 0.95;",
    "  if (alpha < 0.004) discard;",
    "  vec3 color = vColor * (0.80 + vBright * 0.30) + vec3(mask * 0.05);",
    "  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));",
    "}",
  ].join("\n");

  class ParticleSphere3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.supported = false;
      this.active = false;
      this.playing = false;
      this.motion = 1;
      this.density = 1;
      this.tempo = 100;
      this.time = 0;
      this.lastTime = performance.now();
      this.level = 0;
      this.low = 0;
      this.prevLow = 0;
      this.beat = 0;
      this.analyser = null;
      this.freq = null;
      this.prevFreq = null;
      this.binHz = 10.77;
      this.palette = ["#8ef4ff", "#ff9be2", "#ffd39a"];
      this.shape = "circle";
      this.shapeTextures = null;
      this.cameraId = "front";
      this.autoCamera = true;
      this.sensitivity = 100;
      this.easePreset = "smooth";
      this.easePoints = EASE_PRESETS.smooth.slice();
      this.speed = 100;
      this.transitionDuration = 1.35;
      this.transition = null;
      this.shot = { az: CAMERA_SHOTS[0].az, polar: CAMERA_SHOTS[0].polar, radius: CAMERA_SHOTS[0].radius };
      this.fluxHistory = [];
      this.playStartedAt = 0;
      this.lastSwitchAt = 0;
      this.pointScale = 6;
      this.width = 1;
      this.height = 1;
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.onCameraChange = null;
      this._tick = this._tick.bind(this);
      this._init();
      window.addEventListener("resize", () => this.resize(), { passive: true });
      document.addEventListener("visibilitychange", () => {
        this.lastTime = performance.now();
      });
      this.resize();
      this._raf = requestAnimationFrame(this._tick);
    }

    /* ---------- setup ---------- */
    _init() {
      if (!window.THREE) return;
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
        this.group = new THREE.Group();
        this.scene.add(this.group);
        this.uniforms = {
          uTime: { value: 0 },
          uLevel: { value: 0 },
          uBeat: { value: 0 },
          uMotion: { value: 1 },
          uPointScale: { value: 6 },
          uPixelRatio: { value: this.renderer.getPixelRatio() },
          uColorA: { value: new THREE.Color(this.palette[0]) },
          uColorB: { value: new THREE.Color(this.palette[1]) },
          uColorC: { value: new THREE.Color(this.palette[2]) },
          uShapeMap: { value: null },
          uShapeScale: { value: 1 },
        };
        this.shapeTextures = this._buildShapeTextures();
        if (this.shapeTextures[this.shape]) {
          this.uniforms.uShapeMap.value = this.shapeTextures[this.shape];
        }
        this.material = new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: VERTEX_SHADER,
          fragmentShader: FRAGMENT_SHADER,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        this.supported = true;
        this._buildGeometry();
        this._applyShot(this.shot, false);
      } catch (err) {
        this.supported = false;
        this.renderer = null;
        this.points = null;
      }
    }

    _targetCount() {
      const base = this.reduced ? 4200 : this.width < 720 ? 6000 : 12000;
      return Math.max(1400, Math.round(base * this.density));
    }

    _buildShapeTextures() {
      const paths = (window.PRISM && window.PRISM.SHAPE_PATHS) || {};
      const textures = {};
      SHAPE_NAMES.forEach((shape) => {
        const texture = createShapeTexture(shape, paths);
        if (texture) textures[shape] = texture;
      });
      return textures;
    }

    setShape(value) {
      const next = SHAPE_NAMES.includes(value) ? value : "circle";
      this.shape = next;
      if (!this.uniforms || !this.shapeTextures) return;
      const texture = this.shapeTextures[next] || this.shapeTextures.circle;
      if (texture) this.uniforms.uShapeMap.value = texture;
      this.uniforms.uShapeScale.value = next === "circle" ? 1 : SHAPE_POINT_SCALE;
    }

    _buildGeometry() {
      if (!this.supported) return;
      const count = this._targetCount();
      const positions = new Float32Array(count * 3);
      const phases = new Float32Array(count);
      const sizes = new Float32Array(count);
      const tints = new Float32Array(count);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i += 1) {
        const y = 1 - (i / Math.max(1, count - 1)) * 2;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        // Roughly half the shell follows five spiral arms so the ball has a
        // readable orientation from every camera shot; the rest stays uniform.
        const arm = i % 5;
        const armPoint = i % 20 < 9;
        const theta = armPoint
          ? arm * (TAU / 5) + y * 2.6 + (Math.random() - 0.5) * 0.22
          : golden * i;
        const dx = Math.cos(theta) * ring;
        const dz = Math.sin(theta) * ring;
        // Most points sit on the shell; a thin inner layer gives volume.
        const inner = i % 11 === 0;
        const radius = inner ? 0.52 + Math.random() * 0.4 : 1 + (Math.random() - 0.5) * 0.045;
        positions[i * 3] = dx * radius;
        positions[i * 3 + 1] = y * radius;
        positions[i * 3 + 2] = dz * radius;
        phases[i] = Math.random() * 100;
        sizes[i] = inner
          ? 0.55 + Math.random() * 0.7
          : (armPoint ? 1.15 + Math.random() * 1.1 : 0.85 + Math.random() * 1.0);
        // Direction-driven tint (cyan -> pink -> amber), with a little jitter.
        tints[i] = clamp(1.0 + dx * 0.7 + y * 0.45 + (Math.random() - 0.5) * 0.25, 0, 2);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
      geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("aTint", new THREE.BufferAttribute(tints, 1));
      if (this.points) {
        this.group.remove(this.points);
        this.points.geometry.dispose();
      }
      this.points = new THREE.Points(geometry, this.material);
      this.points.frustumCulled = false;
      this.group.add(this.points);
      this.count = count;
    }

    resize() {
      this.width = Math.max(1, window.innerWidth);
      this.height = Math.max(1, window.innerHeight);
      if (!this.supported) return;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.pointScale = clamp(Math.min(this.width, this.height) / 88, 8, 14);
      this.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
      this.uniforms.uPointScale.value = this.pointScale;
      if (this.active) this.renderer.render(this.scene, this.camera);
    }

    /* ---------- public ---------- */
    setActive(active) {
      this.active = !!active;
      this.lastTime = performance.now();
      if (this.active) this.resize();
    }

    setPlaying(playing) {
      const next = !!playing;
      if (next && !this.playing) {
        // Warm up before trusting novelty: the first frames always look like
        // a huge energy jump and would otherwise fire an instant camera cut.
        this.playStartedAt = performance.now();
        this.lastSwitchAt = this.playStartedAt;
        this.fluxHistory.length = 0;
      }
      this.playing = next;
    }

    attachAnalyser(analyser) {
      this.analyser = analyser || null;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        this.freq = new Uint8Array(bins);
        this.prevFreq = new Uint8Array(bins);
        const rate = (analyser.context && analyser.context.sampleRate) || 44100;
        this.binHz = rate / analyser.fftSize;
      } else {
        this.freq = null;
        this.prevFreq = null;
      }
    }

    setMotion(value) {
      this.motion = clamp(Number(value) || 0, 0, 2);
    }

    setDensity(value) {
      const next = clamp(Number(value) || 100, 40, 200) / 100;
      if (Math.abs(next - this.density) < 0.001) return;
      this.density = next;
      this._buildGeometry();
    }

    setTempo(bpm) {
      this.tempo = clamp(Number(bpm) || 100, 50, 200);
    }

    setPalette(colors) {
      if (!Array.isArray(colors) || colors.length < 2) return;
      this.palette = [colors[0], colors[1], colors[2] || colors[0]];
      if (!this.uniforms) return;
      this.uniforms.uColorA.value.set(this.palette[0]);
      this.uniforms.uColorB.value.set(this.palette[1]);
      this.uniforms.uColorC.value.set(this.palette[2]);
    }

    pulse(strength) {
      const amount = Number(strength) || 0.8;
      this.beat = Math.min(1.6, this.beat + amount * 0.7);
    }

    setCamera(id, opts) {
      const options = opts || {};
      const shot = SHOT_BY_ID.get(id) || CAMERA_SHOTS[0];
      const from = { az: this.shot.az, polar: this.shot.polar, radius: this.shot.radius };
      this.cameraId = shot.id;
      if (!this.supported || options.immediate) {
        this.transition = null;
        this.shot = { az: shot.az, polar: shot.polar, radius: shot.radius };
        if (this.supported) this._applyShot(this.shot, false);
      } else {
        this.transition = {
          from,
          to: { az: shot.az, polar: shot.polar, radius: shot.radius },
          elapsed: 0,
          duration: options.duration || this.transitionDuration,
          ease: cubicBezier(this.easePoints[0], this.easePoints[1], this.easePoints[2], this.easePoints[3]),
        };
      }
      this._emitCamera();
    }

    nextCamera() {
      const pool = CAMERA_SHOTS.filter((shot) => shot.id !== this.cameraId);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) this.setCamera(pick.id);
      return pick ? pick.id : this.cameraId;
    }

    setAutoCamera(value) {
      this.autoCamera = value !== false;
    }

    setSensitivity(value) {
      this.sensitivity = clamp(Number(value) || 0, 0, 200);
    }

    setSpeed(value) {
      const next = clamp(Number(value) || 100, 40, 250);
      if (Math.abs(next - this.speed) < 0.001) return;
      this.speed = next;
      const duration = 1.35 * (100 / next);
      if (this.transition) {
        // Keep the flight's current progress but retime the rest of it.
        const progress = clamp(this.transition.elapsed / this.transition.duration, 0, 1);
        this.transition.duration = Math.max(0.12, duration);
        this.transition.elapsed = progress * this.transition.duration;
      }
      this.transitionDuration = duration;
    }

    setEase(points, presetId) {
      if (Array.isArray(points) && points.length === 4) {
        this.easePoints = points.map((value, index) => {
          const n = Number(value);
          if (!Number.isFinite(n)) return EASE_PRESETS.smooth[index];
          return index % 2 === 0 ? clamp(n, 0, 1) : clamp(n, 0, 1.5);
        });
      }
      if (presetId) this.easePreset = presetId;
    }

    getCameraId() {
      return this.cameraId;
    }

    /* ---------- frame ---------- */
    _tick(now) {
      this._raf = requestAnimationFrame(this._tick);
      if (!this.active || !this.supported) {
        this.lastTime = now;
        return;
      }
      const dt = clamp((now - this.lastTime) / 1000, 0.001, 0.05);
      this.lastTime = now;
      this.time += dt;
      this._updateAudio(dt);
      this._updateCamera(dt);
      this.group.rotation.y += dt * (this.reduced ? 0.03 : 0.07);
      this.group.rotation.x = Math.sin(this.time * 0.12) * 0.05;
      this._updateUniforms();
      this.renderer.render(this.scene, this.camera);
    }

    _updateAudio(dt) {
      let target = null;
      if (this.analyser && this.freq && this.playing) {
        this.analyser.getByteFrequencyData(this.freq);
        const bins = this.freq.length;
        const band = (fromHz, toHz) => {
          const start = clamp(Math.round(fromHz / this.binHz), 0, bins - 1);
          const end = clamp(Math.round(toHz / this.binHz), start + 1, bins);
          let sum = 0;
          for (let i = start; i < end; i += 1) sum += this.freq[i];
          return sum / ((end - start) * 255);
        };
        const low = band(28, 160);
        const mid = band(160, 2200);
        const high = band(2200, 9200);
        target = low * 0.56 + mid * 0.31 + high * 0.13;

        let flux = 0;
        if (this.prevFreq) {
          for (let i = 1; i < bins; i += 1) {
            const delta = this.freq[i] - this.prevFreq[i];
            if (delta > 0) flux += delta;
          }
          flux /= bins * 255;
        }
        if (this.prevFreq) this.prevFreq.set(this.freq);

        if (low > this.prevLow * 1.22 + 0.015) this.beat = Math.min(1.5, this.beat + 0.85);
        this.prevLow = low;
        this.low += (low - this.low) * Math.min(1, dt * 14);
        this._trackSection(flux, performance.now());
      } else {
        // Paused / no analyser: the ball still breathes, just gently.
        target = 0.1 + 0.045 * Math.sin(this.time * 1.15) + this.beat * 0.05;
      }

      if (target !== null) {
        const rise = target > this.level;
        this.level += (target - this.level) * Math.min(1, dt * (rise ? 18 : 7));
      }
      this.beat *= Math.exp(-dt * 4.2);
    }

    _trackSection(flux, now) {
      this.fluxHistory.push(flux);
      if (this.fluxHistory.length > 220) this.fluxHistory.shift();
      if (!this.autoCamera || this.fluxHistory.length < 60) return;
      if (now - this.playStartedAt < 2500) return;
      const history = this.fluxHistory;
      let mean = 0;
      for (let i = 0; i < history.length; i += 1) mean += history[i];
      mean /= history.length;
      let variance = 0;
      for (let i = 0; i < history.length; i += 1) {
        const delta = history[i] - mean;
        variance += delta * delta;
      }
      const std = Math.sqrt(variance / history.length);
      const sense = clamp(this.sensitivity, 0, 200) / 100;
      const k = 2.6 - sense * 1.15;
      const gap = Math.max(2200, 6500 - sense * 2200);
      const novelty = flux - mean;
      const threshold = Math.max(0.006, mean * 0.75) + std * k;
      if (novelty > threshold && this.level > 0.12 && now - this.lastSwitchAt > gap) {
        this.lastSwitchAt = now;
        if (Math.random() < 0.82) this.nextCamera();
      }
    }

    _updateCamera(dt) {
      if (this.transition) {
        const tr = this.transition;
        tr.elapsed += dt;
        const progress = clamp(tr.elapsed / tr.duration, 0, 1);
        const eased = tr.ease(progress);
        let deltaAz = tr.to.az - tr.from.az;
        while (deltaAz > Math.PI) deltaAz -= TAU;
        while (deltaAz < -Math.PI) deltaAz += TAU;
        this.shot.az = tr.from.az + deltaAz * eased;
        this.shot.polar = lerp(tr.from.polar, tr.to.polar, eased);
        this.shot.radius = lerp(tr.from.radius, tr.to.radius, eased);
        if (progress >= 1) {
          this.shot = { az: tr.to.az, polar: tr.to.polar, radius: tr.to.radius };
          this.transition = null;
        }
        this._applyShot(this.shot, false);
      } else if (!this.reduced) {
        this._applyShot(this.shot, true, Math.sin(this.time * 0.11) * 0.035, Math.cos(this.time * 0.09) * 0.022);
      }
    }

    _applyShot(shot, sway, swayAz, swayPolar) {
      const az = shot.az + (sway ? swayAz || 0 : 0);
      const polar = clamp(shot.polar + (sway ? swayPolar || 0 : 0), 0.08, Math.PI - 0.08);
      const sinP = Math.sin(polar);
      this.camera.position.set(
        shot.radius * sinP * Math.sin(az),
        shot.radius * Math.cos(polar),
        shot.radius * sinP * Math.cos(az)
      );
      this.camera.lookAt(0, 0, 0);
      this.camera.updateMatrixWorld();
    }

    _updateUniforms() {
      const u = this.uniforms;
      u.uTime.value = this.time;
      u.uLevel.value = this.level;
      u.uBeat.value = this.beat;
      u.uMotion.value = this.motion;
      u.uPointScale.value = this.pointScale * (1 + this.level * 0.16);
    }

    _emitCamera() {
      if (typeof this.onCameraChange === "function") this.onCameraChange(this.cameraId);
    }

    destroy() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this.points) {
        this.points.geometry.dispose();
        this.group.remove(this.points);
      }
      if (this.material) this.material.dispose();
      if (this.renderer) this.renderer.dispose();
    }
  }

  window.PRISM = window.PRISM || {};
  window.PRISM.ParticleSphere3D = ParticleSphere3D;
  window.PRISM.SPHERE_CAMERAS = CAMERA_SHOTS.map((shot) => ({ id: shot.id, label: shot.label }));
  window.PRISM.SPHERE_EASE_PRESETS = EASE_PRESETS;
  window.PRISM.cubicBezier = cubicBezier;
})();
