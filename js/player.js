/* =========================================================
   PRISM player logic
   Local-first HTMLAudioElement playback + Web Audio analyser.
   ========================================================= */
(function () {
  "use strict";

  const DATA = window.PRISM_DATA || { backgrounds: [], tracks: [] };
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, "0");

  /* Curated from Color Hunt's "Most Popular" feed (colorhunt.co/palettes/popular).
     `colors` keeps the original four swatches; `accent` is the UI/particle order. */
  const COLOR_HUNT_PALETTES = [
    {
      id: "ch-tide",
      name: "潮汐青",
      likes: 47987,
      colors: ["#E3FDFD", "#CBF1F5", "#A6E3E9", "#71C9CE"],
      accent: ["#71C9CE", "#A6E3E9", "#E3FDFD"],
    },
    {
      id: "ch-deep",
      name: "深海蓝",
      likes: 47026,
      colors: ["#F9F7F7", "#DBE2EF", "#3F72AF", "#112D4E"],
      accent: ["#3F72AF", "#DBE2EF", "#F9F7F7"],
    },
    {
      id: "ch-peach",
      name: "蜜桃",
      likes: 42520,
      colors: ["#FFF5E4", "#FFE3E1", "#FFD1D1", "#FF9494"],
      accent: ["#FF9494", "#FFD1D1", "#FFF5E4"],
    },
    {
      id: "ch-dusk",
      name: "暮金",
      likes: 39103,
      colors: ["#AD8B73", "#CEAB93", "#E3CAA5", "#FFFBE9"],
      accent: ["#CEAB93", "#E3CAA5", "#FFFBE9"],
    },
    {
      id: "ch-sakura",
      name: "樱粉",
      likes: 38824,
      colors: ["#FFC7C7", "#FFE2E2", "#F6F6F6", "#8785A2"],
      accent: ["#FFC7C7", "#FFE2E2", "#8785A2"],
    },
    {
      id: "ch-lavender",
      name: "薰衣草",
      likes: 38418,
      colors: ["#F4EEFF", "#DCD6F7", "#A6B1E1", "#424874"],
      accent: ["#A6B1E1", "#DCD6F7", "#F4EEFF"],
    },
    {
      id: "ch-night",
      name: "夜航蓝",
      likes: 36525,
      colors: ["#1B262C", "#0F4C75", "#3282B8", "#BBE1FA"],
      accent: ["#3282B8", "#BBE1FA", "#0F4C75"],
    },
    {
      id: "ch-neon",
      name: "霓虹夜",
      likes: 35521,
      colors: ["#08D9D6", "#252A34", "#FF2E63", "#EAEAEA"],
      accent: ["#08D9D6", "#FF2E63", "#EAEAEA"],
    },
    {
      id: "ch-coral",
      name: "珊瑚青",
      likes: 27986,
      colors: ["#364F6B", "#3FC1C9", "#F5F5F5", "#FC5185"],
      accent: ["#3FC1C9", "#FC5185", "#F5F5F5"],
    },
    {
      id: "ch-forest",
      name: "森棕",
      likes: 27896,
      colors: ["#2C3639", "#3F4E4F", "#A27B5C", "#DCD7C9"],
      accent: ["#A27B5C", "#DCD7C9", "#3F4E4F"],
    },
    {
      id: "ch-mint",
      name: "薄荷紫",
      likes: 27438,
      colors: ["#DEFCF9", "#CADEFC", "#C3BEF0", "#CCA8E9"],
      accent: ["#C3BEF0", "#CCA8E9", "#DEFCF9"],
    },
    {
      id: "ch-moss",
      name: "苔原绿",
      likes: 26498,
      colors: ["#EDF1D6", "#9DC08B", "#609966", "#40513B"],
      accent: ["#609966", "#9DC08B", "#EDF1D6"],
    },
    {
      id: "ch-rose",
      name: "落日玫瑰",
      likes: 25389,
      colors: ["#F67280", "#C06C84", "#6C5B7B", "#355C7D"],
      accent: ["#F67280", "#C06C84", "#355C7D"],
    },
    {
      id: "ch-aurora",
      name: "极光",
      likes: 24772,
      colors: ["#212121", "#323232", "#0D7377", "#14FFEC"],
      accent: ["#14FFEC", "#0D7377", "#323232"],
    },
    {
      id: "ch-lemon",
      name: "柠檬森",
      likes: 23850,
      colors: ["#F5F7F8", "#F4CE14", "#495E57", "#45474B"],
      accent: ["#F4CE14", "#495E57", "#F5F7F8"],
    },
  ];

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? h + ":" + pad2(m) + ":" + pad2(s) : pad2(m) + ":" + pad2(s);
  }

  function randomInt(max) {
    if (max <= 0) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const x = new Uint32Array(1);
      window.crypto.getRandomValues(x);
      return x[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffled(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function storeGet(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function normalizeHex(value) {
    let s = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(s)) {
      s = s.split("").map((c) => c + c).join("");
    }
    return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toUpperCase() : null;
  }

  function hexToHsl(hex) {
    const hx = normalizeHex(hex) || "#8EF4FF";
    const r = parseInt(hx.slice(1, 3), 16) / 255;
    const g = parseInt(hx.slice(3, 5), 16) / 255;
    const b = parseInt(hx.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s, l };
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return ("#" + to(r) + to(g) + to(b)).toUpperCase();
  }

  function gradientFromColor(hex) {
    const base = normalizeHex(hex) || "#8EF4FF";
    const { h, s, l } = hexToHsl(base);
    const inner = hslToHex(h + 8, clamp(s * 0.9 + 0.1, 0, 1), clamp(l * 0.55 + 0.38, 0.66, 0.88));
    const outer = hslToHex(h + 34, clamp(s * 0.9 + 0.04, 0, 1), clamp(l * 0.94 + 0.05, 0.38, 0.68));
    return { base, colors: [inner, base, outer] };
  }

  class Backgrounds {
    constructor(manager) {
      this.manager = manager;
      this.pool = DATA.backgrounds || [];
      this.custom = manager.customBackgrounds || [];
      this.layers = [$("bgA"), $("bgB")];
      this.active = 0;
      this.index = 0;
      this.rotator = null;
      this.set = this.pickTen();
      this.preload();
    }

    pickTen() {
      const chosen = shuffled(this.custom).slice(0, 10);
      const remaining = 10 - chosen.length;
      if (remaining > 0) {
        chosen.push(...shuffled(this.pool).slice(0, remaining));
        while (chosen.length < 10 && this.pool.length) {
          chosen.push(this.pool[chosen.length % this.pool.length]);
        }
      }
      return chosen;
    }

    preload() {
      for (const item of this.set) {
        const img = new Image();
        img.src = item.file;
      }
    }

    startRotation() {
      if (this.rotator) return;
      this.rotator = window.setInterval(() => {
        if (!document.hidden) this.next({ silent: true });
      }, 52000);
    }

    current() {
      return this.set[this.index] || this.pool[0] || null;
    }

    show(index, opts = {}) {
      if (!this.set.length) return;
      this.index = ((index % this.set.length) + this.set.length) % this.set.length;
      const item = this.set[this.index];
      const next = this.layers[this.active];
      const prev = this.layers[1 - this.active];
      const url = 'url("' + item.file.replace(/"/g, "%22") + '")';
      const shade = "linear-gradient(180deg, rgba(2,4,9,.22), rgba(2,4,9,.32))";

      next.style.backgroundImage = shade + ", " + url;
      next.classList.toggle("zoom-out", this.index % 2 === 1);
      if (!opts.immediate) {
        // force a style read so the new image always fades in
        void next.offsetWidth;
      }
      next.classList.add("is-active");
      prev.classList.remove("is-active");
      this.active = 1 - this.active;

      const bgNum = $("bgNum");
      if (bgNum) bgNum.textContent = pad2(this.index + 1);
      if (this.manager && typeof this.manager.renderCustomBackgrounds === "function") {
        this.manager.renderCustomBackgrounds();
      }
      if (opts.toast) {
        this.manager.toast(
          "背景 " + pad2(this.index + 1) + " / 10 · " + item.title,
          2200
        );
      }
    }

    next(opts = {}) {
      this.show(this.index + 1, opts);
    }

    refreshCustom(focusUrl) {
      this.custom = (this.manager.customBackgrounds || []).slice();
      this.set = this.pickTen();
      this.preload();
      let index = 0;
      if (focusUrl) {
        const found = this.set.findIndex((item) => item.custom && item.url === focusUrl);
        if (found >= 0) index = found;
      }
      this.show(index, { immediate: true });
      if (this.manager && typeof this.manager.renderCustomBackgrounds === "function") {
        this.manager.renderCustomBackgrounds();
      }
    }

    showCustom(entry) {
      if (!entry) return;
      const index = this.set.findIndex((item) => item.custom && item.url === entry.url);
      if (index >= 0) {
        this.show(index, { toast: true });
      } else {
        this.refreshCustom(entry.url);
      }
    }
  }

  class Player {
    constructor() {
      this.audio = $("audio");
      const storedVolume = Number(storeGet("prism.volume", "0.76"));
      this.audio.volume = Number.isFinite(storedVolume) ? clamp(storedVolume, 0, 1) : 0.76;
      this.audio.muted = false;
      this.tracks = (DATA.tracks || []).map((track, index) => ({
        ...track,
        id: "demo-" + index,
        kind: "demo",
        mood: "AMBIENT ELECTRONICA",
      }));
      this.currentIndex = 0;
      this.repeat = storeGet("prism.repeat", "all");
      if (!["off", "all", "one"].includes(this.repeat)) this.repeat = "all";
      this.shuffle = storeGet("prism.shuffle", "0") === "1";
      this.entered = false;
      this.welcomeOpen = true;
      this.queueOpen = false;
      this.queueSearchQuery = "";
      this.settingsOpen = false;
      this.backgroundSettingsOpen = false;
      this.seeking = false;
      this.folderBusy = false;
      this.saveBusy = false;
      this.restoringPlaylist = false;
      this.todoVisible = false;
      this.todoEditorOpen = false;
      this.todoDirty = false;
      this.todoSaveBusy = false;
      const savedTransparency = Number(storeGet("prism.todoTransparency", "45"));
      this.todoTransparency = Number.isFinite(savedTransparency)
        ? clamp(Math.round(savedTransparency), 0, 100)
        : 45;
      const savedUiScale = Number(storeGet("prism.uiScale", "100"));
      this.uiScale = Number.isFinite(savedUiScale)
        ? clamp(Math.round(savedUiScale), 80, 120)
        : 100;
      this.fontColor = normalizeHex(storeGet("prism.fontColor", ""));
      this.visualOnly = false;
      this.uiScalePopOpen = false;
      this.fontColorPopOpen = false;
      this.lyricsPopOpen = false;
      this.lyricsSearchBusy = false;
      this.albumWallOpen = false;
      this.lyricsSettings = this.loadLyricsSettings();
      this.lyricsMap = this.loadLyricsMap();
      this.lyricsTranslations = this.loadLyricsTranslations();
      this.currentLyrics = [];
      this.currentTranslations = [];
      this.translationBusy = false;
      this.lyricsActive = -1;
      this.lyricsDrag = null;
      this.albumDragIndex = -1;
      this.albumJustDragged = false;
      this.albumPreviewOrder = null;
      this.albumHomeOffsets = null;
      this.albumHoverCell = -1;
      this.albumCellSize = null;
      this.albumGridOrigin = null;
      this.todos = this.loadTodos();
      this.dragDepth = 0;
      this.knobDrag = null;
      this.densityTimer = 0;
      this.todoPreviewDrag = null;
      const savedMotion = Number(storeGet("prism.motion", "100"));
      const savedDensity = Number(storeGet("prism.particleDensity", "100"));
      const savedShape = storeGet("prism.particleShape", "circle");
      this.settings = {
        motion: Number.isFinite(savedMotion) ? clamp(savedMotion, 0, 200) : 100,
        density: Number.isFinite(savedDensity) ? clamp(savedDensity, 40, 200) : 100,
        shape: ["circle", "drop", "star", "line", "snow", "triangle"].includes(savedShape)
          ? savedShape
          : "circle",
        color: normalizeHex(storeGet("prism.color", "")),
      };
      this.toastTimer = 0;
      const savedPalette = storeGet("prism.palettePreset", "");
      this.palettePreset = COLOR_HUNT_PALETTES.some((palette) => palette.id === savedPalette)
        ? savedPalette
        : "";
      this.ctx = null;
      this.analyser = null;
      this.source = null;
      this.gain = null;
      this.objectUrls = new Set();
      this.lastVolume = this.audio.volume || 0.76;
      this.backgroundBusy = false;
      this.unsplashBusy = false;
      this.unsplashKey = storeGet("prism.unsplashKey", "");
      this.unsplashQuery = storeGet("prism.unsplashQuery", "");
      const savedCoverMode = storeGet("prism.coverMode", "");
      this.coverMode = ["original", "fallback", "unsplash"].includes(savedCoverMode)
        ? savedCoverMode
        : storeGet("prism.coverFallbackUnsplash", "0") === "1"
          ? "fallback"
          : "original";
      this.coverRefreshTimer = 0;
      this.albumBackdropOverride = false;
      this.albumBackdropLayer = 0;
      this.albumBackdropToken = 0;
      this.durationCache = this.loadDurationCache();
      this.durationCacheTimer = 0;
      this.durationHydrationToken = 0;
      this.customBackgrounds = this.loadCustomBackgrounds();
      this.field = new window.PRISM.ParticleField($("particleCanvas"));
      this.field.setMotion(this.settings.motion / 100);
      this.field.setDensity(this.settings.density);
      this.field.setShape(this.settings.shape);
      this.sphereSettings = this.loadSphereSettings();
      this.sphere = null;
      if (window.PRISM && window.PRISM.ParticleSphere3D) {
        try {
          this.sphere = new window.PRISM.ParticleSphere3D($("particleCanvas3D"));
          this.sphere.onCameraChange = (id) => this.syncSphereCameraUI(id);
        } catch (_) {
          this.sphere = null;
        }
      }
      this.backgrounds = new Backgrounds(this);
      this.params = new URLSearchParams(window.location.search);

      this.cacheDom();
      this.el.app.classList.add("is-intro");
      this.bind();
      this.backgrounds.show(0, { immediate: true });
      this.renderWelcome();
      this.applyShuffleUI();
      this.applyRepeatUI();
      this.applyVolumeUI();
      this.setMotionValue(this.settings.motion, { persist: false });
      this.setDensityValue(this.settings.density, { persist: false });
      this.setParticleShape(this.settings.shape, { persist: false });
      this.renderTodos();
      this.setTodoSaveState(this.todos.length ? "已保存" : "未保存");
      this.setTodoVisible(this.todos.length > 0, { focus: false });
      this.applyTodoPreviewPosition();
      this.setTodoTransparency(this.todoTransparency, { persist: false });
      this.setUiScale(this.uiScale, { persist: false });
      this.setFontColor(this.fontColor, { persist: false });
      this.albumBackdropLayers = [this.el.albumBgA, this.el.albumBgB];
      this.el.unsplashKey.value = this.unsplashKey;
      this.el.unsplashQuery.value = this.unsplashQuery;
      this.el.coverModeSelect.value = this.coverMode;
      this.setUnsplashStatus(
        this.unsplashKey ? "Key 已自动加载并保存在本机" : "需要联网 · Key 只保存在本机"
      );
      this.applyLyricsSettings();
      this.applySphereSettings();
      if (this.sphere) this.sphere.setCamera(this.sphereSettings.camera, { immediate: true });
      this.selectTrack(0, { autoplay: false, first: true });
      this.renderQueue();
      this.setStatus("standby");
      this.handleUrlModes();
      this.setSaveState("未保存");
      this.setTodoSaveState(this.todos.length ? "已保存" : "未保存");
      this.restoreSavedPlaylist();
    }

    /* ---------- dom ---------- */
    cacheDom() {
      this.el = {
        app: $("app"),
        uiLayer: $("uiLayer"),
        visualToolbar: $("visualToolbar"),
        uiScaleBtn: $("uiScaleBtn"),
        visualModeBtn: $("visualModeBtn"),
        fontColorBtn: $("fontColorBtn"),
        uiScalePop: $("uiScalePop"),
        fontColorPop: $("fontColorPop"),
        uiScale: $("uiScale"),
        uiScaleValue: $("uiScaleValue"),
        uiScaleReset: $("uiScaleReset"),
        fontSwatches: $("fontSwatches"),
        fontColorValue: $("fontColorValue"),
        fontColorInput: $("fontColorInput"),
        fontColorReset: $("fontColorReset"),
        fontColorDot: $("fontColorDot"),
        visualExit: $("visualExit"),
        lyricsBtn: $("lyricsBtn"),
        lyricsPop: $("lyricsPop"),
        lyricsToggle: $("lyricsToggle"),
        importLyrics: $("importLyrics"),
        lyricsStatus: $("lyricsStatus"),
        lyricsArtist: $("lyricsArtist"),
        lyricsTitle: $("lyricsTitle"),
        lyricsOnlineSearch: $("lyricsOnlineSearch"),
        lyricsOnlineStatus: $("lyricsOnlineStatus"),
        lyricsTranslationToggle: $("lyricsTranslationToggle"),
        lyricsTranslationStatus: $("lyricsTranslationStatus"),
        lyricsFont: $("lyricsFont"),
        lyricsColor: $("lyricsColor"),
        lyricsSize: $("lyricsSize"),
        lyricsSizeValue: $("lyricsSizeValue"),
        lyricsLineCount: $("lyricsLineCount"),
        lyricsLineCountValue: $("lyricsLineCountValue"),
        lyricsOpacity: $("lyricsOpacity"),
        lyricsOpacityValue: $("lyricsOpacityValue"),
        lyricsReset: $("lyricsReset"),
        lyricsClear: $("lyricsClear"),
        lyricsInput: $("lyricsInput"),
        lyricsOverlay: $("lyricsOverlay"),
        lyricsViewport: $("lyricsViewport"),
        lyricsLines: $("lyricsLines"),
        albumViewBtn: $("albumViewBtn"),
        albumWall: $("albumWall"),
        albumWallClose: $("albumWallClose"),
        albumWallCount: $("albumWallCount"),
        albumDeleteLayer: $("albumDeleteLayer"),
        albumDeleteEdges: Array.from(document.querySelectorAll(".album-delete-edge")),
        albumGrid: $("albumGrid"),
        welcome: $("welcome"),
        welcomeArt: $("welcomeArt"),
        welcomeThumbs: $("welcomeThumbs"),
        enterBtn: $("enterBtn"),
        trackTitle: $("trackTitle"),
        trackArtist: $("trackArtist"),
        trackIndex: $("trackIndex"),
        trackTotal: $("trackTotal"),
        trackBpm: $("trackBpm"),
        trackMood: $("trackMood"),
        miniTitle: $("miniTitle"),
        miniArtist: $("miniArtist"),
        miniCover: $("miniCover"),
        miniCoverWrap: $("miniCoverWrap"),
        playBtn: $("playBtn"),
        prevBtn: $("prevBtn"),
        nextBtn: $("nextBtn"),
        shuffleBtn: $("shuffleBtn"),
        repeatBtn: $("repeatBtn"),
        muteBtn: $("muteBtn"),
        volume: $("volume"),
        volumeFill: $("volumeFill"),
        seek: $("seek"),
        seekFill: $("seekFill"),
        seekThumb: $("seekThumb"),
        currentTime: $("currentTime"),
        duration: $("duration"),
        queue: $("queue"),
        queueList: $("queueList"),
        queueCount: $("queueCount"),
        queueSearch: $("queueSearch"),
        queueSearchClear: $("queueSearchClear"),
        queueBtn: $("queueBtn"),
        queueClose: $("queueClose"),
        scrim: $("scrim"),
        addMusic: $("addMusic"),
        addFolder: $("addFolder"),
        folderBtn: $("folderBtn"),
        savePlaylist: $("savePlaylist"),
        saveState: $("saveState"),
        todoToggle: $("todoToggle"),
        todoBadge: $("todoBadge"),
        todoPanel: $("todoPanel"),
        todoPreview: $("todoPreview"),
        todoPreviewHead: $("todoPreviewHead"),
        todoPreviewList: $("todoPreviewList"),
        todoPreviewCount: $("todoPreviewCount"),
        todoPreviewEmpty: $("todoPreviewEmpty"),
        todoPreviewHide: $("todoPreviewHide"),
        todoEdit: $("todoEdit"),
        todoPreviewAdd: $("todoPreviewAdd"),
        todoClose: $("todoClose"),
        todoInput: $("todoInput"),
        todoAdd: $("todoAdd"),
        todoList: $("todoList"),
        todoEmpty: $("todoEmpty"),
        todoCount: $("todoCount"),
        saveTodos: $("saveTodos"),
        todoSaveState: $("todoSaveState"),
        clearDone: $("clearDone"),
        todoOpacity: $("todoOpacity"),
        todoOpacityFill: $("todoOpacityFill"),
        todoOpacityValue: $("todoOpacityValue"),
        todoOpacityReset: $("todoOpacityReset"),
        miniAdd: $("miniAdd"),
        fileInput: $("fileInput"),
        folderInput: $("folderInput"),
        dropOverlay: $("dropOverlay"),
        toast: $("toast"),
        statusText: $("statusText"),
        livePip: $("livePip"),
        bgBtn: $("bgBtn"),
        bgNum: $("bgNum"),
        albumBgA: $("albumBgA"),
        albumBgB: $("albumBgB"),
        bgSettingsBtn: $("bgSettingsBtn"),
        backgroundPanel: $("backgroundPanel"),
        bgSettingsClose: $("bgSettingsClose"),
        importBg: $("importBg"),
        customBgGrid: $("customBgGrid"),
        customBgHint: $("customBgHint"),
        unsplashKey: $("unsplashKey"),
        unsplashQuery: $("unsplashQuery"),
        unsplashSearch: $("unsplashSearch"),
        unsplashStatus: $("unsplashStatus"),
        unsplashCredit: $("unsplashCredit"),
        coverModeSelect: $("coverModeSelect"),
        fullscreenBtn: $("fullscreenBtn"),
        brandLink: $("brandLink"),
        ambientGlow: $("ambientGlow"),
        sessionReadout: $("sessionReadout"),
        settingsBtn: $("settingsBtn"),
        settingsPanel: $("settingsPanel"),
        uiLayer: $("uiLayer"),
        settingsClose: $("settingsClose"),
        motionKnob: $("motionKnob"),
        motionValue: $("motionValue"),
        knobValue: $("knobValue"),
        densitySlider: $("densitySlider"),
        densityValue: $("densityValue"),
        shapeValue: $("shapeValue"),
        shapeButtons: Array.from(document.querySelectorAll("[data-particle-shape]")),
        particleColor: $("particleColor"),
        colorChip: $("colorChip"),
        colorHex: $("colorHex"),
        colorGradient: $("colorGradient"),
        colorAuto: $("colorAuto"),
        colorPresets: $("colorPresets"),
        paletteGrid: $("paletteGrid"),
        paletteValue: $("paletteValue"),
        sphereBlock: $("sphereBlock"),
        sphereToggle: $("sphereToggle"),
        sphereStatus: $("sphereStatus"),
        sphereCameras: $("sphereCameras"),
        sphereAuto: $("sphereAuto"),
        sphereSensitivity: $("sphereSensitivity"),
        sphereSensitivityValue: $("sphereSensitivityValue"),
        sphereEasePreset: $("sphereEasePreset"),
        sphereSpeed: $("sphereSpeed"),
        sphereSpeedValue: $("sphereSpeedValue"),
        bezierPreview: $("bezierPreview"),
        bezierX1: $("bezierX1"),
        bezierY1: $("bezierY1"),
        bezierX2: $("bezierX2"),
        bezierY2: $("bezierY2"),
      };
    }

    bind() {
      this.el.enterBtn.addEventListener("click", () => this.enter());
      this.el.playBtn.addEventListener("click", () => this.togglePlay());
      this.el.prevBtn.addEventListener("click", () => this.previous());
      this.el.nextBtn.addEventListener("click", () => this.next());
      this.el.shuffleBtn.addEventListener("click", () => this.toggleShuffle());
      this.el.repeatBtn.addEventListener("click", () => this.cycleRepeat());
      this.el.muteBtn.addEventListener("click", () => this.toggleMute());
      this.el.queueBtn.addEventListener("click", () => this.toggleQueue());
      this.el.queueClose.addEventListener("click", () => this.toggleQueue(false));
      this.el.queueSearch.addEventListener("input", () => {
        this.queueSearchQuery = this.el.queueSearch.value;
        this.renderQueue();
      });
      this.el.queueSearch.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this.clearQueueSearch();
        }
      });
      this.el.queueSearchClear.addEventListener("click", () => this.clearQueueSearch());
      this.el.scrim.addEventListener("click", () => this.toggleQueue(false));
      this.el.settingsBtn.addEventListener("click", () => this.toggleSettings());
      this.el.settingsClose.addEventListener("click", () => this.toggleSettings(false));
      this.el.bgSettingsBtn.addEventListener("click", () => this.toggleBackgroundSettings());
      this.el.bgSettingsClose.addEventListener("click", () => this.toggleBackgroundSettings(false));
      this.el.uiScaleBtn.addEventListener("click", () => this.toggleUiScalePop());
      this.el.visualModeBtn.addEventListener("click", () => this.setVisualOnly(true));
      this.el.fontColorBtn.addEventListener("click", () => this.toggleFontColorPop());
      this.el.visualExit.addEventListener("click", () => this.setVisualOnly(false));
      this.el.uiScale.addEventListener("input", () => this.setUiScale(this.el.uiScale.value));
      this.el.uiScaleReset.addEventListener("click", () => this.setUiScale(100));
      this.el.fontSwatches.addEventListener("click", (e) => {
        const button = e.target.closest("button[data-font-color]");
        if (button) this.setFontColor(button.dataset.fontColor);
      });
      this.el.fontColorInput.addEventListener("input", () => this.setFontColor(this.el.fontColorInput.value));
      this.el.fontColorReset.addEventListener("click", () => this.setFontColor(""));
      this.el.lyricsBtn.addEventListener("click", () => this.toggleLyricsPop());
      this.el.lyricsToggle.addEventListener("click", () => this.setLyricsVisible(!this.lyricsSettings.visible));
      this.el.importLyrics.addEventListener("click", () => this.el.lyricsInput.click());
      this.el.lyricsOnlineSearch.addEventListener("click", () => this.searchOnlineLyrics());
      this.el.lyricsTranslationToggle.addEventListener("click", () =>
        this.setLyricsTranslation(!this.lyricsSettings.translation)
      );
      [this.el.lyricsArtist, this.el.lyricsTitle].forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.searchOnlineLyrics();
          }
        });
      });
      this.el.lyricsInput.addEventListener("change", () => {
        const file = this.el.lyricsInput.files && this.el.lyricsInput.files[0];
        this.el.lyricsInput.value = "";
        if (file) this.importLyricsFile(file);
      });
      this.el.lyricsFont.addEventListener("change", () => this.setLyricsFont(this.el.lyricsFont.value));
      this.el.lyricsColor.addEventListener("input", () => this.setLyricsColor(this.el.lyricsColor.value));
      this.el.lyricsSize.addEventListener("input", () => this.setLyricsSize(this.el.lyricsSize.value));
      this.el.lyricsLineCount.addEventListener("input", () => this.setLyricsLineCount(this.el.lyricsLineCount.value));
      this.el.lyricsOpacity.addEventListener("input", () => this.setLyricsOpacity(this.el.lyricsOpacity.value));
      this.el.lyricsReset.addEventListener("click", () => this.resetLyricsPosition());
      this.el.lyricsClear.addEventListener("click", () => this.clearCurrentLyrics());
      this.el.lyricsOverlay.addEventListener("pointerdown", (e) => this.startLyricsDrag(e));
      window.addEventListener("pointermove", (e) => this.moveLyricsDrag(e));
      window.addEventListener("pointerup", (e) => this.endLyricsDrag(e));
      this.el.albumViewBtn.addEventListener("click", () => this.openAlbumWall());
      this.el.albumWallClose.addEventListener("click", () => this.closeAlbumWall());
      this.el.albumGrid.addEventListener("dragstart", (e) => this.onAlbumDragStart(e));
      this.el.albumGrid.addEventListener("dragover", (e) => this.onAlbumDragOver(e));
      this.el.albumGrid.addEventListener("dragleave", (e) => this.onAlbumDragLeave(e));
      this.el.albumGrid.addEventListener("drop", (e) => this.onAlbumDrop(e));
      this.el.albumGrid.addEventListener("dragend", () => this.clearAlbumDrag());
      document.addEventListener("dragover", (e) => this.onAlbumPageDragOver(e));
      document.addEventListener("drop", (e) => this.onAlbumPageDrop(e));
      document.addEventListener("dragend", () => this.clearAlbumDeleteEdge());
      this.el.albumGrid.addEventListener("click", (e) => this.onAlbumCardClick(e));
      document.addEventListener("pointerdown", (e) => {
        if (!this.uiScalePopOpen && !this.fontColorPopOpen && !this.lyricsPopOpen) return;
        if (this.el.visualToolbar.contains(e.target)) return;
        this.closeVisualPopovers();
      });
      this.el.particleColor.addEventListener("input", () => this.setParticleColor(this.el.particleColor.value));
      this.el.colorAuto.addEventListener("click", () => this.resetParticleColor());
      this.el.colorPresets.querySelectorAll("button[data-color]").forEach((button) => {
        button.addEventListener("click", () => this.setParticleColor(button.dataset.color));
      });
      this.renderPaletteGrid();
      this.bindMotionKnob();
      this.bindDensitySlider();
      this.el.shapeButtons.forEach((button) => {
        button.addEventListener("click", () => this.setParticleShape(button.dataset.particleShape));
      });
      this.bindSphereControls();
      document.addEventListener("pointerdown", (e) => {
        if (!this.settingsOpen) return;
        if (this.el.settingsPanel.contains(e.target) || this.el.settingsBtn.contains(e.target)) return;
        this.toggleSettings(false);
      });
      document.addEventListener("pointerdown", (e) => {
        if (!this.backgroundSettingsOpen) return;
        if (
          this.el.backgroundPanel.contains(e.target) ||
          this.el.bgSettingsBtn.contains(e.target) ||
          this.el.bgBtn.contains(e.target)
        ) {
          return;
        }
        this.toggleBackgroundSettings(false);
      });
      document.addEventListener("pointerdown", (e) => {
        if (!this.todoEditorOpen) return;
        if (this.el.todoPanel.contains(e.target) || this.el.todoToggle.contains(e.target)) return;
        this.closeTodoEditor();
      });
      this.el.bgBtn.addEventListener("click", () => this.nextBackground());
      this.el.importBg.addEventListener("click", () => this.importCustomBackgrounds());
      this.el.unsplashKey.addEventListener("input", () => {
        this.unsplashKey = this.el.unsplashKey.value.trim();
        storeSet("prism.unsplashKey", this.unsplashKey);
        this.setUnsplashStatus(
          this.unsplashKey ? "Key 已自动保存在本机" : "需要联网 · Key 只保存在本机"
        );
      });
      this.el.unsplashKey.addEventListener("change", () => {
        this.unsplashKey = this.el.unsplashKey.value.trim();
        storeSet("prism.unsplashKey", this.unsplashKey);
      });
      this.el.unsplashQuery.addEventListener("change", () => {
        this.unsplashQuery = this.el.unsplashQuery.value.trim();
        storeSet("prism.unsplashQuery", this.unsplashQuery);
      });
      this.el.unsplashQuery.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.searchUnsplash();
        }
      });
      this.el.unsplashSearch.addEventListener("click", () => this.searchUnsplash());
      this.el.coverModeSelect.addEventListener("change", () => {
        const value = this.el.coverModeSelect.value;
        this.coverMode = ["original", "fallback", "unsplash"].includes(value) ? value : "original";
        storeSet("prism.coverMode", this.coverMode);
        this.renderQueue();
        this.refreshDeckCover();
        if (this.albumWallOpen) this.renderAlbumWall();
      });
      this.el.fullscreenBtn.addEventListener("click", () => this.toggleFullscreen());
      this.el.brandLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.field.pulse(1.1);
        if (this.sphere) this.sphere.pulse(0.9);
      });
      this.el.addMusic.addEventListener("click", () => this.el.fileInput.click());
      this.el.miniAdd.addEventListener("click", () => this.el.fileInput.click());
      this.el.addFolder.addEventListener("click", () => this.importMusicFolder());
      this.el.folderBtn.addEventListener("click", () => this.importMusicFolder());
      this.el.savePlaylist.addEventListener("click", () => this.saveCurrentPlaylist());
      this.el.todoToggle.addEventListener("click", () => this.setTodoVisible(!this.todoVisible, { focus: true }));
      this.el.todoClose.addEventListener("click", () => this.closeTodoEditor());
      this.el.todoEdit.addEventListener("click", () => this.openTodoEditor({ focus: true }));
      this.el.todoPreviewAdd.addEventListener("click", () => this.openTodoEditor({ focus: true }));
      this.el.todoPreviewHide.addEventListener("click", () => this.setTodoVisible(false, { focus: false }));
      this.el.todoPreviewHead.addEventListener("pointerdown", (e) => this.startTodoPreviewDrag(e));
      this.el.todoPreviewHead.addEventListener("dblclick", () => this.resetTodoPreviewPosition());
      window.addEventListener("resize", () => this.applyTodoPreviewPosition());
      this.el.todoAdd.addEventListener("click", () => this.addTodo());
      this.el.todoInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          this.addTodo();
        }
      });
      this.el.todoList.addEventListener("change", (e) => {
        if (!e.target.matches('input[type="checkbox"]')) return;
        const item = e.target.closest(".todo-item");
        if (item) this.toggleTodoDone(item.dataset.id, e.target.checked);
      });
      this.el.todoList.addEventListener("click", (e) => {
        const remove = e.target.closest(".todo-delete");
        if (remove) {
          const item = remove.closest(".todo-item");
          if (item) this.deleteTodo(item.dataset.id);
        }
      });
      this.el.saveTodos.addEventListener("click", () => this.saveTodos());
      this.el.clearDone.addEventListener("click", () => this.clearCompletedTodos());
      this.el.todoOpacity.addEventListener("input", () => this.setTodoTransparency(this.el.todoOpacity.value));
      this.el.todoOpacityReset.addEventListener("click", () => this.setTodoTransparency(45));
      this.el.fileInput.addEventListener("change", (e) => {
        this.importFiles(e.target.files);
        e.target.value = "";
      });
      this.el.folderInput.addEventListener("change", (e) => {
        this.importFiles(e.target.files);
        e.target.value = "";
      });

      this.el.volume.addEventListener("input", () => {
        const v = Number(this.el.volume.value) / 100;
        this.audio.muted = false;
        this.audio.volume = v;
        this.lastVolume = v || this.lastVolume;
        this.applyVolumeUI();
        storeSet("prism.volume", String(v));
      });

      this.el.seek.addEventListener("input", () => {
        this.seeking = true;
        this.el.seek.parentElement.classList.add("is-dragging");
        const duration = this.getDuration();
        if (duration > 0) {
          const preview = (Number(this.el.seek.value) / 1000) * duration;
          this.el.currentTime.textContent = formatTime(preview);
          this.setSeekVisual(Number(this.el.seek.value) / 10);
        }
      });
      this.el.seek.addEventListener("change", () => {
        const duration = this.getDuration();
        if (duration > 0) {
          this.audio.currentTime = (Number(this.el.seek.value) / 1000) * duration;
        }
        this.seeking = false;
        this.el.seek.parentElement.classList.remove("is-dragging");
        this.syncProgress();
      });
      this.el.seek.addEventListener("pointerdown", () => this.el.seek.parentElement.classList.add("is-dragging"));
      this.el.seek.addEventListener("pointerup", () => this.el.seek.parentElement.classList.remove("is-dragging"));

      this.audio.addEventListener("play", () => this.onPlay());
      this.audio.addEventListener("playing", () => this.onPlay());
      this.audio.addEventListener("pause", () => this.onPause());
      this.audio.addEventListener("ended", () => this.onEnded());
      this.audio.addEventListener("loadedmetadata", () => this.onMetadata());
      this.audio.addEventListener("timeupdate", () => {
        this.syncProgress();
        this.updateLyrics();
      });
      this.audio.addEventListener("volumechange", () => this.applyVolumeUI());
      this.audio.addEventListener("waiting", () => {
        if (!this.audio.paused) this.setStatus("buffering");
      });
      this.audio.addEventListener("canplay", () => {
        if (!this.audio.paused) this.setStatus("playing");
      });
      this.audio.addEventListener("error", () => {
        if (!this.audio.currentSrc) return;
        this.toast("无法播放这首音乐，请尝试其他格式", 3200);
      });

      document.addEventListener("keydown", (e) => this.onKeydown(e));
      document.addEventListener("fullscreenchange", () => this.syncFullscreenIcon());
      document.addEventListener("dragenter", (e) => this.onDragEnter(e));
      document.addEventListener("dragover", (e) => {
        if (this.hasFiles(e)) e.preventDefault();
      });
      document.addEventListener("dragleave", (e) => this.onDragLeave(e));
      document.addEventListener("drop", (e) => this.onDrop(e));
      window.addEventListener("dragend", () => {
        this.dragDepth = 0;
        this.el.dropOverlay.classList.remove("is-active");
        this.el.dropOverlay.setAttribute("aria-hidden", "true");
      });

      if ("mediaSession" in navigator) {
        const handlers = {
          play: () => this.play(),
          pause: () => this.pause(),
          previoustrack: () => this.previous(),
          nexttrack: () => this.next(),
          seekbackward: (d) => this.seekBy(-(d.seekOffset || 10)),
          seekforward: (d) => this.seekBy(d.seekOffset || 10),
          seekto: (d) => {
            if (Number.isFinite(d.seekTime)) this.audio.currentTime = d.seekTime;
          },
        };
        for (const [name, fn] of Object.entries(handlers)) {
          try {
            navigator.mediaSession.setActionHandler(name, fn);
          } catch (_) {}
        }
      }
    }

    /* ---------- mode / welcome ---------- */
    handleUrlModes() {
      if (this.params.get("skipintro") === "1") {
        this.welcomeOpen = false;
        this.el.app.classList.remove("is-intro");
        this.el.welcome.classList.add("is-leaving");
        this.el.welcome.style.display = "none";
      }
      if (this.params.get("autoplay") === "1") {
        window.setTimeout(() => this.enter({ silent: true }), 60);
      }
    }

    renderWelcome() {
      if (!this.backgrounds.set.length) return;
      // Use the brightest of the ten frames for the cover card: it reads better
      // than a very dark starfield while still being part of this session's set.
      const bg = this.backgrounds.set.reduce(
        (best, item) => (item.luma > best.luma ? item : best),
        this.backgrounds.set[0]
      );
      if (bg) this.el.welcomeArt.src = bg.file;
      this.el.welcomeThumbs.innerHTML = "";
      for (const item of this.backgrounds.set) {
        const img = document.createElement("img");
        img.src = item.file;
        img.alt = "";
        img.draggable = false;
        this.el.welcomeThumbs.appendChild(img);
      }
    }

    async enter(opts = {}) {
      this.dismissWelcome();
      this.entered = true;
      this.initAudio();
      try {
        await this.play();
        if (!opts.silent) this.toast("正在播放 · 粒子会跟随频谱呼吸", 2400);
      } catch (_) {
        // play() reports its own error to the listener
      }
    }

    dismissWelcome() {
      if (!this.welcomeOpen) return;
      this.welcomeOpen = false;
      this.el.app.classList.remove("is-intro");
      this.el.welcome.classList.add("is-leaving");
      window.setTimeout(() => {
        if (this.el.welcome) this.el.welcome.style.display = "none";
      }, 850);
      this.backgrounds.startRotation();
    }

    /* ---------- audio graph ---------- */
    initAudio() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0.76;
        this.analyser.minDecibels = -118;
        this.analyser.maxDecibels = -45;
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 1;
        this.source = this.ctx.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.field.attachAnalyser(this.analyser);
        if (this.sphere) this.sphere.attachAnalyser(this.analyser);
      } catch (err) {
        // The audio element can still play without analysis in rare browsers.
        this.ctx = null;
        this.analyser = null;
      }
    }

    /* ---------- transport ---------- */
    async play() {
      this.initAudio();
      if (this.ctx && this.ctx.state === "suspended") {
        try { await this.ctx.resume(); } catch (_) {}
      }
      if (this.audio.ended) this.audio.currentTime = 0;
      try {
        await this.audio.play();
      } catch (err) {
        this.toast("浏览器阻止了播放，请再点一次播放按钮", 2800);
        this.updatePlayUI(false);
        throw err;
      }
    }

    pause() {
      this.audio.pause();
    }

    togglePlay() {
      if (this.audio.paused) {
        this.play();
      } else {
        this.pause();
      }
    }

    previous() {
      if (this.audio.currentTime > 3) {
        this.audio.currentTime = 0;
        return;
      }
      const autoplay = !this.audio.paused;
      const prev = this.getAdjacent(-1);
      this.selectTrack(prev, { autoplay });
    }

    next() {
      const autoplay = !this.audio.paused;
      const next = this.getAdjacent(1);
      this.selectTrack(next, { autoplay });
    }

    getAdjacent(direction) {
      if (!this.tracks.length) return 0;
      if (this.shuffle && this.tracks.length > 1) {
        let n = this.currentIndex;
        for (let i = 0; i < 12 && n === this.currentIndex; i++) n = randomInt(this.tracks.length);
        return n;
      }
      return (this.currentIndex + direction + this.tracks.length) % this.tracks.length;
    }

    seekBy(seconds) {
      const d = this.getDuration();
      if (!d) return;
      this.audio.currentTime = clamp(this.audio.currentTime + seconds, 0, d);
      this.syncProgress();
    }

    toggleShuffle() {
      this.shuffle = !this.shuffle;
      storeSet("prism.shuffle", this.shuffle ? "1" : "0");
      this.applyShuffleUI();
      this.toast(this.shuffle ? "随机播放已开启" : "随机播放已关闭", 1800);
    }

    applyShuffleUI() {
      this.el.shuffleBtn.classList.toggle("is-on", this.shuffle);
      this.el.shuffleBtn.setAttribute("aria-label", "随机播放：" + (this.shuffle ? "开" : "关"));
      this.el.shuffleBtn.setAttribute("data-tip", this.shuffle ? "随机播放 · 开" : "随机播放");
    }

    cycleRepeat() {
      this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
      storeSet("prism.repeat", this.repeat);
      this.applyRepeatUI();
      const labels = { off: "循环已关闭", all: "列表循环", one: "单曲循环" };
      this.toast(labels[this.repeat], 1600);
    }

    applyRepeatUI() {
      const use = this.repeat === "one" ? "#i-repeat-one" : "#i-repeat";
      this.el.repeatBtn.querySelector("use").setAttribute("href", use);
      this.el.repeatBtn.classList.toggle("is-on", this.repeat !== "off");
      const labels = { off: "循环已关闭", all: "列表循环", one: "单曲循环" };
      this.el.repeatBtn.setAttribute("aria-label", "循环模式：" + labels[this.repeat]);
      this.el.repeatBtn.setAttribute("data-tip", labels[this.repeat]);
    }

    toggleMute() {
      if (this.audio.muted || this.audio.volume === 0) {
        this.audio.muted = false;
        this.audio.volume = this.lastVolume || 0.76;
        storeSet("prism.volume", String(this.audio.volume));
      } else {
        this.lastVolume = this.audio.volume;
        this.audio.muted = true;
      }
      this.applyVolumeUI();
    }

    applyVolumeUI() {
      const muted = this.audio.muted || this.audio.volume === 0;
      const shown = muted ? 0 : Math.round(this.audio.volume * 100);
      this.el.volume.value = String(shown);
      this.el.volumeFill.style.width = shown + "%";
      this.el.muteBtn.classList.toggle("is-muted", muted);
      this.el.muteBtn.classList.toggle("is-low", !muted && shown > 0 && shown < 42);
      this.el.muteBtn.setAttribute("aria-label", muted ? "取消静音" : "静音");
    }

    /* ---------- particle settings ---------- */
    bindMotionKnob() {
      const knob = this.el.motionKnob;
      if (!knob) return;

      knob.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        knob.focus();
        knob.setPointerCapture(e.pointerId);
        this.knobDrag = { id: e.pointerId, startY: e.clientY, startValue: this.settings.motion };
        knob.classList.add("is-dragging");
      });

      knob.addEventListener("pointermove", (e) => {
        if (!this.knobDrag || this.knobDrag.id !== e.pointerId) return;
        const next = this.knobDrag.startValue + (this.knobDrag.startY - e.clientY) * 0.8;
        this.setMotionValue(next);
      });

      const endDrag = (e) => {
        if (!this.knobDrag || this.knobDrag.id !== e.pointerId) return;
        this.knobDrag = null;
        knob.classList.remove("is-dragging");
        try { knob.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      knob.addEventListener("pointerup", endDrag);
      knob.addEventListener("pointercancel", endDrag);

      knob.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.setMotionValue(this.settings.motion + (e.deltaY < 0 ? 5 : -5));
      }, { passive: false });

      knob.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 10 : 5;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(this.settings.motion + step);
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(this.settings.motion - step);
        } else if (e.key === "PageUp") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(this.settings.motion + 20);
        } else if (e.key === "PageDown") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(this.settings.motion - 20);
        } else if (e.key === "Home") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(0);
        } else if (e.key === "End") {
          e.preventDefault();
          e.stopPropagation();
          this.setMotionValue(200);
        }
      });

      knob.addEventListener("dblclick", () => this.setMotionValue(100));
    }

    setMotionValue(value, opts = {}) {
      const numeric = Number(value);
      const v = Math.round(clamp(Number.isFinite(numeric) ? numeric : 100, 0, 200));
      this.settings.motion = v;
      this.field.setMotion(v / 100);
      if (this.sphere) this.sphere.setMotion(v / 100);
      const knob = this.el.motionKnob;
      if (knob) {
        knob.style.setProperty("--knob-pct", (v / 200) * 75 + "%");
        knob.style.setProperty("--knob-angle", -135 + (v / 200) * 270 + "deg");
        knob.setAttribute("aria-valuenow", String(v));
        knob.setAttribute("aria-valuetext", v + "% 强度");
      }
      if (this.el.motionValue) this.el.motionValue.textContent = v + "%";
      if (this.el.knobValue) this.el.knobValue.textContent = String(v);
      if (opts.persist !== false) storeSet("prism.motion", String(v));
    }

    bindDensitySlider() {
      const slider = this.el.densitySlider;
      if (!slider) return;
      const applyLater = () => {
        window.clearTimeout(this.densityTimer);
        this.densityTimer = window.setTimeout(() => {
          this.setDensityValue(slider.value);
        }, 120);
      };
      slider.addEventListener("input", () => {
        this.setDensityValue(slider.value, { persist: false, apply: false });
        applyLater();
      });
      slider.addEventListener("change", () => {
        window.clearTimeout(this.densityTimer);
        this.setDensityValue(slider.value);
      });
    }

    setDensityValue(value, opts = {}) {
      const numeric = Number(value);
      const v = Math.round(clamp(Number.isFinite(numeric) ? numeric : 100, 40, 200));
      this.settings.density = v;
      const slider = this.el.densitySlider;
      if (slider) {
        slider.value = String(v);
        slider.style.setProperty("--density-pct", ((v - 40) / 160) * 100 + "%");
        slider.setAttribute("aria-valuenow", String(v));
        slider.setAttribute("aria-valuetext", v + "% 密度");
      }
      if (this.el.densityValue) this.el.densityValue.textContent = v + "%";
      if (opts.persist !== false) storeSet("prism.particleDensity", String(v));
      if (opts.apply !== false && this.field) this.field.setDensity(v);
      if (opts.apply !== false && this.sphere) this.sphere.setDensity(v);
    }

    setParticleShape(value, opts = {}) {
      const allowed = ["circle", "drop", "star", "line", "snow", "triangle"];
      const next = allowed.includes(value) ? value : "circle";
      const labels = {
        circle: "圆形",
        drop: "水滴",
        star: "五角形",
        line: "线状",
        snow: "雪花",
        triangle: "三角形",
      };
      this.settings.shape = next;
      if (this.el.shapeButtons) {
        this.el.shapeButtons.forEach((button) => {
          const active = button.dataset.particleShape === next;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }
      if (this.el.shapeValue) this.el.shapeValue.textContent = labels[next];
      if (this.field) this.field.setShape(next);
      if (this.sphere) this.sphere.setShape(next);
      if (opts.persist !== false) storeSet("prism.particleShape", next);
    }

    setParticleColor(value, opts = {}) {
      const hex = normalizeHex(value);
      if (!hex) return;
      this.settings.color = hex;
      this.palettePreset = "";
      storeSet("prism.palettePreset", "");
      if (opts.persist !== false) storeSet("prism.color", hex);
      this.applyTheme(this.currentTrack && this.currentTrack.palette);
      this.field.pulse(0.35);
      if (this.sphere) this.sphere.pulse(0.3);
    }

    resetParticleColor() {
      this.settings.color = null;
      this.palettePreset = "";
      storeSet("prism.color", "");
      storeSet("prism.palettePreset", "");
      this.applyTheme(this.currentTrack && this.currentTrack.palette);
      this.toast("粒子颜色已恢复为跟随曲目", 1800);
    }

    /* ---------- Color Hunt palettes ---------- */
    renderPaletteGrid() {
      const grid = this.el.paletteGrid;
      if (!grid) return;
      grid.innerHTML = "";
      COLOR_HUNT_PALETTES.forEach((palette) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "palette-chip";
        button.dataset.palette = palette.id;
        button.setAttribute("aria-pressed", "false");
        button.title = palette.name + " · Color Hunt ♥ " + palette.likes.toLocaleString("en-US");
        const strip = document.createElement("span");
        strip.className = "palette-strip";
        palette.colors.forEach((color) => {
          const swatch = document.createElement("i");
          swatch.style.background = color;
          strip.appendChild(swatch);
        });
        const name = document.createElement("span");
        name.className = "palette-name";
        name.textContent = palette.name;
        button.appendChild(strip);
        button.appendChild(name);
        button.addEventListener("click", () => this.togglePalettePreset(palette.id));
        grid.appendChild(button);
      });
    }

    togglePalettePreset(id) {
      const palette = COLOR_HUNT_PALETTES.find((item) => item.id === id);
      if (!palette) return;
      const next = this.palettePreset === id ? "" : id;
      this.palettePreset = next;
      storeSet("prism.palettePreset", next);
      if (next) {
        // A palette replaces any single custom colour.
        this.settings.color = null;
        storeSet("prism.color", "");
      }
      this.applyTheme(this.currentTrack && this.currentTrack.palette);
      this.field.pulse(0.35);
      if (this.sphere) this.sphere.pulse(0.3);
      this.toast(next ? "已应用配色：" + palette.name : "已恢复跟随曲目", 1600);
    }

    /* ---------- 3D sphere (experimental) ---------- */
    loadSphereSettings() {
      const defaults = {
        enabled: true,
        camera: "front",
        auto: true,
        sensitivity: 100,
        speed: 100,
        easePreset: "smooth",
        ease: [0.42, 0, 0.58, 1],
      };
      try {
        const raw = JSON.parse(storeGet("prism.sphere3d", "{}"));
        if (!raw || typeof raw !== "object") return defaults;
        const presets = (window.PRISM && window.PRISM.SPHERE_EASE_PRESETS) || {};
        const ids = ((window.PRISM && window.PRISM.SPHERE_CAMERAS) || []).map((shot) => shot.id);
        const easePreset = typeof raw.easePreset === "string" && (presets[raw.easePreset] || raw.easePreset === "custom")
          ? raw.easePreset
          : defaults.easePreset;
        const source = Array.isArray(raw.ease) && raw.ease.length === 4
          ? raw.ease
          : presets[easePreset] || defaults.ease;
        const sensitivity = Number(raw.sensitivity);
        const speed = Number(raw.speed);
        return {
          enabled: raw.enabled !== false,
          camera: ids.includes(raw.camera) ? raw.camera : defaults.camera,
          auto: raw.auto !== false,
          sensitivity: Number.isFinite(sensitivity) ? clamp(Math.round(sensitivity), 0, 200) : defaults.sensitivity,
          speed: Number.isFinite(speed) ? clamp(Math.round(speed), 40, 250) : defaults.speed,
          easePreset,
          ease: source.map((value, index) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return defaults.ease[index];
            return index % 2 === 0 ? clamp(n, 0, 1) : clamp(n, 0, 1.5);
          }),
        };
      } catch (_) {
        return defaults;
      }
    }

    persistSphereSettings() {
      storeSet("prism.sphere3d", JSON.stringify(this.sphereSettings));
    }

    applySphereSettings() {
      const available = Boolean(this.sphere && this.sphere.supported);
      const on = Boolean(available && this.sphereSettings.enabled);
      if (this.el && this.el.app) this.el.app.classList.toggle("is-3d", on);
      if (this.field) this.field.setActive(!on);
      if (this.sphere) {
        this.sphere.setActive(on);
        this.sphere.setAutoCamera(this.sphereSettings.auto);
        this.sphere.setSensitivity(this.sphereSettings.sensitivity);
        this.sphere.setSpeed(this.sphereSettings.speed);
        this.sphere.setEase(this.sphereSettings.ease, this.sphereSettings.easePreset);
        this.sphere.setMotion(this.settings.motion / 100);
        this.sphere.setDensity(this.settings.density);
        this.sphere.setShape(this.settings.shape);
        this.sphere.setPalette(this.theme ? this.theme.colors : null);
        if (this.analyser) this.sphere.attachAnalyser(this.analyser);
        this.sphere.setPlaying(!this.audio.paused);
      }
      this.syncSphereUI();
    }

    syncSphereUI() {
      if (!this.el || !this.el.sphereToggle) return;
      const available = Boolean(this.sphere && this.sphere.supported);
      const on = Boolean(available && this.sphereSettings.enabled);
      if (this.el.sphereBlock) this.el.sphereBlock.classList.toggle("is-unavailable", !available);
      this.el.sphereToggle.disabled = !available;
      this.el.sphereToggle.setAttribute("aria-checked", on ? "true" : "false");
      this.el.sphereToggle.setAttribute("aria-label", on ? "关闭 3D 球形粒子" : "开启 3D 球形粒子");
      if (this.el.sphereStatus) {
        this.el.sphereStatus.textContent = available
          ? on
            ? "three.js 球形已启用：明度随音乐变化，可在下方切换机位。"
            : "three.js 立体球：粒子明度随音乐起伏，机位可随意切换。"
          : "当前环境不支持 WebGL，3D 球形不可用。";
      }
      const disabled = !available || !on;
      this.el.sphereCameras.querySelectorAll("button[data-camera]").forEach((button) => {
        button.disabled = disabled;
        const active = button.dataset.camera === this.sphereSettings.camera;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      this.el.sphereAuto.checked = this.sphereSettings.auto;
      this.el.sphereAuto.disabled = !available;
      this.el.sphereSensitivity.value = String(this.sphereSettings.sensitivity);
      this.el.sphereSensitivity.disabled = !available;
      this.el.sphereSensitivity.style.setProperty(
        "--density-pct",
        (this.sphereSettings.sensitivity / 200) * 100 + "%"
      );
      this.el.sphereSensitivityValue.textContent = this.sphereSettings.sensitivity + "%";
      this.el.sphereSpeed.value = String(this.sphereSettings.speed);
      this.el.sphereSpeed.disabled = !available;
      this.el.sphereSpeed.style.setProperty(
        "--density-pct",
        ((this.sphereSettings.speed - 40) / 210) * 100 + "%"
      );
      this.el.sphereSpeedValue.textContent = this.sphereSettings.speed + "%";
      this.el.sphereEasePreset.value = this.sphereSettings.easePreset;
      this.el.sphereEasePreset.disabled = !available;
      this.updateBezierSliders();
    }

    syncSphereCameraUI(id) {
      if (!id) return;
      this.sphereSettings.camera = id;
      if (!this.el || !this.el.sphereCameras) return;
      this.el.sphereCameras.querySelectorAll("button[data-camera]").forEach((button) => {
        const active = button.dataset.camera === id;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    setSphereEnabled(value) {
      const next = Boolean(value);
      if (next && (!this.sphere || !this.sphere.supported)) {
        this.toast("当前环境不支持 WebGL，3D 球形不可用", 2400);
        this.sphereSettings.enabled = false;
        this.persistSphereSettings();
        this.syncSphereUI();
        return;
      }
      this.sphereSettings.enabled = next;
      this.persistSphereSettings();
      this.applySphereSettings();
      this.toast(next ? "3D 球形已开启" : "已切回平面粒子", 1600);
    }

    setSphereCamera(id, opts = {}) {
      if (!this.sphere || !this.sphere.supported) return;
      if (!this.sphereSettings.enabled) {
        this.sphereSettings.enabled = true;
        this.applySphereSettings();
      }
      this.sphereSettings.camera = id;
      this.persistSphereSettings();
      this.sphere.setCamera(id, opts);
      this.syncSphereCameraUI(id);
    }

    setSphereAuto(value) {
      this.sphereSettings.auto = Boolean(value);
      this.persistSphereSettings();
      if (this.sphere) this.sphere.setAutoCamera(this.sphereSettings.auto);
      this.toast(this.sphereSettings.auto ? "已开启段落自动切机位" : "已关闭自动切机位", 1500);
    }

    setSphereSensitivity(value) {
      const numeric = Number(value);
      const v = Math.round(clamp(Number.isFinite(numeric) ? numeric : 100, 0, 200));
      this.sphereSettings.sensitivity = v;
      this.persistSphereSettings();
      if (this.sphere) this.sphere.setSensitivity(v);
      this.el.sphereSensitivity.value = String(v);
      this.el.sphereSensitivityValue.textContent = v + "%";
      this.el.sphereSensitivity.style.setProperty("--density-pct", (v / 200) * 100 + "%");
    }

    setSphereSpeed(value) {
      const numeric = Number(value);
      const v = Math.round(clamp(Number.isFinite(numeric) ? numeric : 100, 40, 250));
      this.sphereSettings.speed = v;
      this.persistSphereSettings();
      if (this.sphere) this.sphere.setSpeed(v);
      this.el.sphereSpeed.value = String(v);
      this.el.sphereSpeedValue.textContent = v + "%";
      this.el.sphereSpeed.style.setProperty("--density-pct", ((v - 40) / 210) * 100 + "%");
    }

    setSphereEasePreset(name) {
      const presets = (window.PRISM && window.PRISM.SPHERE_EASE_PRESETS) || {};
      if (name === "custom") {
        this.sphereSettings.easePreset = "custom";
      } else if (presets[name]) {
        this.sphereSettings.easePreset = name;
        this.sphereSettings.ease = presets[name].slice();
      }
      this.persistSphereSettings();
      if (this.sphere) this.sphere.setEase(this.sphereSettings.ease, this.sphereSettings.easePreset);
      this.syncSphereUI();
    }

    setSphereEasePoint(index, value) {
      const numeric = Number(value) / 100;
      const v = index % 2 === 0 ? clamp(numeric, 0, 1) : clamp(numeric, 0, 1.5);
      this.sphereSettings.ease[index] = v;
      this.sphereSettings.easePreset = "custom";
      if (this.el.sphereEasePreset) this.el.sphereEasePreset.value = "custom";
      this.persistSphereSettings();
      if (this.sphere) this.sphere.setEase(this.sphereSettings.ease, "custom");
      this.drawBezierPreview();
    }

    updateBezierSliders() {
      if (!this.el) return;
      const ease = this.sphereSettings.ease;
      const pairs = [
        [this.el.bezierX1, Math.round(ease[0] * 100)],
        [this.el.bezierY1, Math.round(ease[1] * 100)],
        [this.el.bezierX2, Math.round(ease[2] * 100)],
        [this.el.bezierY2, Math.round(ease[3] * 100)],
      ];
      pairs.forEach((pair) => {
        if (pair[0]) pair[0].value = String(pair[1]);
      });
      this.drawBezierPreview();
    }

    drawBezierPreview() {
      const canvas = this.el && this.el.bezierPreview;
      if (!canvas) return;
      const width = canvas.clientWidth || 264;
      const height = canvas.clientHeight || 92;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const padX = 14;
      const padY = 12;
      const plotW = Math.max(10, width - padX * 2);
      const plotH = Math.max(10, height - padY * 2);
      const x0 = padX;
      const y0 = height - padY;

      ctx.strokeStyle = "rgba(255,255,255,.07)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i += 1) {
        const gx = x0 + (plotW / 4) * i;
        const gy = y0 - (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(gx, y0);
        ctx.lineTo(gx, padY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0, gy);
        ctx.lineTo(x0 + plotW, gy);
        ctx.stroke();
      }

      const points = this.sphereSettings.ease;
      const makeEase = window.PRISM && window.PRISM.cubicBezier;
      const easeFn = makeEase ? makeEase(points[0], points[1], points[2], points[3]) : (t) => t;

      ctx.strokeStyle = "rgba(142,244,255,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 64; i += 1) {
        const t = i / 64;
        const px = x0 + t * plotW;
        const py = y0 - easeFn(t) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      const p1x = x0 + points[0] * plotW;
      const p1y = y0 - points[1] * plotH;
      const p2x = x0 + points[2] * plotW;
      const p2y = y0 - points[3] * plotH;
      ctx.strokeStyle = "rgba(255,155,226,.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(p1x, p1y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 + plotW, padY);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      ctx.fillStyle = "#ff9be2";
      [[p1x, p1y], [p2x, p2y]].forEach((point) => {
        ctx.beginPath();
        ctx.arc(point[0], point[1], 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    bindSphereControls() {
      if (!this.el.sphereToggle) return;
      this.el.sphereToggle.addEventListener("click", () => {
        this.setSphereEnabled(!this.sphereSettings.enabled);
      });
      this.el.sphereCameras.querySelectorAll("button[data-camera]").forEach((button) => {
        button.addEventListener("click", () => this.setSphereCamera(button.dataset.camera));
      });
      this.el.sphereAuto.addEventListener("change", () => this.setSphereAuto(this.el.sphereAuto.checked));
      this.el.sphereSensitivity.addEventListener("input", () => {
        this.setSphereSensitivity(this.el.sphereSensitivity.value);
      });
      this.el.sphereSpeed.addEventListener("input", () => {
        this.setSphereSpeed(this.el.sphereSpeed.value);
      });
      this.el.sphereEasePreset.addEventListener("change", () => {
        this.setSphereEasePreset(this.el.sphereEasePreset.value);
      });
      const points = [this.el.bezierX1, this.el.bezierY1, this.el.bezierX2, this.el.bezierY2];
      points.forEach((input, index) => {
        if (!input) return;
        input.addEventListener("input", () => this.setSphereEasePoint(index, input.value));
      });
      window.addEventListener("resize", () => this.drawBezierPreview(), { passive: true });
    }

    applyTheme(trackPalette) {
      const autoColors = Array.isArray(trackPalette) && trackPalette.length >= 2
        ? trackPalette
        : ["#8ef4ff", "#ff9be2", "#ffd39a"];
      let colors = autoColors;
      let base = autoColors[0];
      let custom = false;
      let preset = "";

      const presetDef = this.palettePreset
        ? COLOR_HUNT_PALETTES.find((palette) => palette.id === this.palettePreset)
        : null;
      if (presetDef) {
        colors = presetDef.accent.slice();
        base = colors[0];
        preset = presetDef.id;
      } else if (this.settings.color) {
        const gradient = gradientFromColor(this.settings.color);
        colors = gradient.colors;
        base = gradient.base;
        custom = true;
      }

      this.theme = { colors: colors.slice(), base, custom, preset };
      const root = document.documentElement;
      root.style.setProperty("--accent-a", colors[0]);
      root.style.setProperty("--accent-b", colors[1] || colors[0]);
      root.style.setProperty("--accent-c", colors[2] || colors[0]);
      this.el.ambientGlow.style.background =
        "radial-gradient(circle, color-mix(in srgb, " + colors[0] + " 26%, transparent) 0%, transparent 56%)," +
        "radial-gradient(circle at 66% 38%, color-mix(in srgb, " + (colors[2] || colors[1]) + " 18%, transparent) 0%, transparent 42%)";

      this.field.setPalette(colors);
      if (this.sphere) this.sphere.setPalette(colors);
      this.syncColorUI(base, colors, custom, preset);
    }

    syncColorUI(base, colors, custom, preset) {
      if (!this.el.particleColor) return;
      const hex = normalizeHex(base) || "#8EF4FF";
      this.el.particleColor.value = hex.toLowerCase();
      this.el.colorHex.textContent = hex;
      this.el.colorChip.style.setProperty("--pick-color", hex);
      this.el.colorChip.style.setProperty("--pick-a", colors[0]);
      this.el.colorChip.style.setProperty("--pick-b", colors[1] || colors[0]);
      this.el.colorChip.style.setProperty("--pick-c", colors[2] || colors[1] || colors[0]);
      this.el.colorGradient.style.background =
        "linear-gradient(90deg, " + colors[0] + ", " + (colors[1] || colors[0]) + ", " + (colors[2] || colors[0]) + ")";
      this.el.colorAuto.classList.toggle("is-on", !custom && !preset);
      this.el.colorAuto.setAttribute("aria-pressed", custom || preset ? "false" : "true");
      this.el.colorPresets.querySelectorAll("button[data-color]").forEach((button) => {
        button.classList.toggle("is-on", !preset && normalizeHex(button.dataset.color) === hex);
      });
      const presetDef = preset ? COLOR_HUNT_PALETTES.find((palette) => palette.id === preset) : null;
      if (this.el.paletteGrid) {
        this.el.paletteGrid.querySelectorAll("button[data-palette]").forEach((button) => {
          const active = button.dataset.palette === preset;
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }
      if (this.el.paletteValue) {
        this.el.paletteValue.textContent = presetDef ? presetDef.name : custom ? "自定义" : "跟随曲目";
      }
    }

    toggleSettings(force) {
      const open = typeof force === "boolean" ? force : !this.settingsOpen;
      if (open && this.queueOpen) this.toggleQueue(false);
      if (open && this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
      if (open && this.todoEditorOpen) this.closeTodoEditor();
      this.settingsOpen = open;
      this.el.settingsPanel.classList.toggle("is-open", open);
      this.el.settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.settingsBtn.classList.toggle("is-on", open);
      this.el.settingsBtn.setAttribute(
        "aria-label",
        open ? "关闭粒子设置（S）" : "粒子设置（S）"
      );
      this.updateTodoVisibility();
    }

    toggleBackgroundSettings(force) {
      const open = typeof force === "boolean" ? force : !this.backgroundSettingsOpen;
      if (open && this.queueOpen) this.toggleQueue(false);
      if (open && this.settingsOpen) this.toggleSettings(false);
      if (open && this.todoEditorOpen) this.closeTodoEditor();
      if (open) this.closeVisualPopovers();
      this.backgroundSettingsOpen = open;
      this.el.backgroundPanel.classList.toggle("is-open", open);
      this.el.backgroundPanel.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.bgSettingsBtn.classList.toggle("is-on", open);
      this.el.bgSettingsBtn.setAttribute(
        "aria-label",
        open ? "关闭背景设置" : "背景设置"
      );
      this.updateTodoVisibility();
    }

    /* ---------- visual controls ---------- */
    setUiScale(value, opts = {}) {
      const numeric = Number(value);
      const v = clamp(Math.round(Number.isFinite(numeric) ? numeric : 100), 80, 120);
      this.uiScale = v;
      const scale = v / 100;
      this.el.uiLayer.style.setProperty("--ui-scale", String(scale));
      this.el.uiLayer.style.setProperty("--ui-inv-scale", String(1 / scale));
      this.el.uiScale.value = String(v);
      this.el.uiScaleValue.textContent = v + "%";
      this.resetAppScroll();
      if (opts.persist !== false) storeSet("prism.uiScale", String(v));
    }

    toggleUiScalePop(force) {
      const open = typeof force === "boolean" ? force : !this.uiScalePopOpen;
      this.uiScalePopOpen = open;
      this.el.uiScalePop.classList.toggle("is-open", open);
      this.el.uiScalePop.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.uiScaleBtn.classList.toggle("is-on", open);
      if (open) {
        this.toggleFontColorPop(false);
        this.toggleLyricsPop(false);
      }
    }

    toggleFontColorPop(force) {
      const open = typeof force === "boolean" ? force : !this.fontColorPopOpen;
      this.fontColorPopOpen = open;
      this.el.fontColorPop.classList.toggle("is-open", open);
      this.el.fontColorPop.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.fontColorBtn.classList.toggle("is-on", open);
      if (open) {
        this.toggleUiScalePop(false);
        this.toggleLyricsPop(false);
      }
    }

    toggleLyricsPop(force) {
      const open = typeof force === "boolean" ? force : !this.lyricsPopOpen;
      this.lyricsPopOpen = open;
      this.el.lyricsPop.classList.toggle("is-open", open);
      this.el.lyricsPop.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.lyricsBtn.classList.toggle("is-on", open);
      if (open) {
        this.toggleUiScalePop(false);
        this.toggleFontColorPop(false);
        this.prepareLyricsSearchFields();
        this.updateLyricsStatus();
      }
    }

    closeVisualPopovers() {
      this.toggleUiScalePop(false);
      this.toggleFontColorPop(false);
      this.toggleLyricsPop(false);
    }

    setFontColor(hex, opts = {}) {
      const normalized = hex ? normalizeHex(hex) : "";
      this.fontColor = normalized || "";
      if (normalized) {
        this.el.uiLayer.classList.add("has-font-color");
        this.el.uiLayer.style.setProperty("--font-color", normalized);
        this.el.fontColorInput.value = normalized;
      } else {
        this.el.uiLayer.classList.remove("has-font-color");
        this.el.uiLayer.style.removeProperty("--font-color");
      }
      this.el.fontColorDot.style.setProperty("--font-color", normalized || "#f4f8ff");
      this.el.fontColorValue.textContent = normalized ? normalized.toUpperCase() : "默认";
      this.el.fontSwatches.querySelectorAll("button[data-font-color]").forEach((button) => {
        button.classList.toggle(
          "is-active",
          Boolean(normalized) && normalizeHex(button.dataset.fontColor) === normalized
        );
      });
      if (opts.persist !== false) storeSet("prism.fontColor", normalized || "");
    }

    setVisualOnly(active) {
      const on = active === true;
      this.visualOnly = on;
      this.el.app.classList.toggle("is-visual-only", on);
      this.el.visualModeBtn.setAttribute("aria-pressed", on ? "true" : "false");
      this.closeVisualPopovers();
      if (on) {
        if (this.settingsOpen) this.toggleSettings(false);
        if (this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
        if (this.queueOpen) this.toggleQueue(false);
        if (this.todoEditorOpen) this.closeTodoEditor();
        if (this.albumWallOpen) this.closeAlbumWall();
        if (this.el.uiLayer.contains(document.activeElement)) document.activeElement.blur();
        window.setTimeout(() => this.el.visualExit.focus(), 80);
      } else if (document.activeElement === this.el.visualExit) {
        this.el.visualModeBtn.focus();
      }
    }

    /* ---------- lyrics ---------- */
    loadLyricsSettings() {
      const defaults = {
        visible: true,
        x: 50,
        y: 53,
        font: "sans",
        color: "#F4F8FF",
        size: 30,
        opacity: 85,
        lines: 5,
        translation: false,
      };
      try {
        const raw = JSON.parse(storeGet("prism.lyricsSettings", "{}"));
        if (!raw || typeof raw !== "object") return defaults;
        const font = ["sans", "mono", "serif", "rounded"].includes(raw.font) ? raw.font : defaults.font;
        return {
          visible: raw.visible !== false,
          x: clamp(Number(raw.x) || defaults.x, 4, 96),
          y: clamp(Number(raw.y) || defaults.y, 4, 96),
          font,
          color: normalizeHex(raw.color) || defaults.color,
          size: clamp(Math.round(Number(raw.size) || defaults.size), 16, 64),
          opacity: clamp(Math.round(Number(raw.opacity) || defaults.opacity), 20, 100),
          lines: clamp(Math.round(Number(raw.lines) || defaults.lines), 1, 6),
          translation: raw.translation === true,
        };
      } catch (_) {
        return defaults;
      }
    }

    loadLyricsMap() {
      try {
        const raw = JSON.parse(storeGet("prism.lyricsMap", "{}"));
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        return raw;
      } catch (_) {
        return {};
      }
    }

    saveLyricsMap() {
      try {
        window.localStorage.setItem("prism.lyricsMap", JSON.stringify(this.lyricsMap));
      } catch (_) {}
    }

    loadLyricsTranslations() {
      try {
        const raw = JSON.parse(storeGet("prism.lyricsTranslations", "{}"));
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const cache = {};
        let count = 0;
        for (const [key, value] of Object.entries(raw)) {
          if (!key || !value || typeof value !== "object") continue;
          if (typeof value.hash !== "string" || !Array.isArray(value.lines)) continue;
          cache[key] = {
            hash: value.hash,
            lines: value.lines.slice(0, 220).map((line) => String(line || "")),
          };
          count += 1;
        }
        return count > 60 ? Object.fromEntries(Object.entries(cache).slice(-60)) : cache;
      } catch (_) {
        return {};
      }
    }

    saveLyricsTranslations() {
      try {
        window.localStorage.setItem(
          "prism.lyricsTranslations",
          JSON.stringify(this.lyricsTranslations)
        );
      } catch (_) {}
    }

    translationHash() {
      const text = this.currentLyrics.map((line) => line.text).join("\n");
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    }

    cachedTranslationsFor(key) {
      if (!key) return [];
      const entry = this.lyricsTranslations[key];
      if (!entry || entry.hash !== this.translationHash()) return [];
      if (entry.lines.length !== this.currentLyrics.length) return [];
      return entry.lines.slice();
    }

    clearTranslationFor(key) {
      if (!key || !(key in this.lyricsTranslations)) return;
      delete this.lyricsTranslations[key];
      this.saveLyricsTranslations();
    }

    persistLyricsSettings() {
      storeSet("prism.lyricsSettings", JSON.stringify(this.lyricsSettings));
    }

    lyricsFontStack(font) {
      if (font === "mono") {
        return '"Cascadia Mono", "Consolas", "Sarasa Mono SC", "Noto Sans Mono CJK SC", "Microsoft YaHei UI", monospace';
      }
      if (font === "serif") {
        return '"Songti SC", "SimSun", "STSong", "Noto Serif SC", Georgia, serif';
      }
      if (font === "rounded") {
        return '"Microsoft YaHei UI", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
      }
      return '"Bahnschrift", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif';
    }

    applyLyricsSettings() {
      const s = this.lyricsSettings;
      this.el.lyricsOverlay.style.setProperty("--lyrics-x", s.x + "%");
      this.el.lyricsOverlay.style.setProperty("--lyrics-y", s.y + "%");
      this.el.lyricsOverlay.style.setProperty("--lyrics-font", this.lyricsFontStack(s.font));
      this.el.lyricsOverlay.style.setProperty("--lyrics-color", s.color);
      this.el.lyricsOverlay.style.setProperty("--lyrics-size", s.size + "px");
      this.el.lyricsOverlay.style.setProperty("--lyrics-opacity", String(s.opacity / 100));
      this.el.lyricsToggle.setAttribute("aria-checked", s.visible ? "true" : "false");
      if (this.el.lyricsTranslationToggle) {
        this.el.lyricsTranslationToggle.setAttribute("aria-checked", s.translation ? "true" : "false");
      }
      this.updateLyricsTranslationStatus();
      this.el.lyricsFont.value = s.font;
      this.el.lyricsColor.value = s.color;
      this.el.lyricsSize.value = String(s.size);
      this.el.lyricsSizeValue.textContent = String(s.size);
      if (this.el.lyricsLineCount) {
        this.el.lyricsLineCount.value = String(s.lines);
        this.el.lyricsLineCountValue.textContent = String(s.lines);
      }
      this.el.lyricsOpacity.value = String(s.opacity);
      this.el.lyricsOpacityValue.textContent = s.opacity + "%";
      this.updateLyrics(true);
      this.updateLyricsStatus();
    }

    updateLyricsStatus() {
      if (!this.el.lyricsStatus) return;
      if (!this.currentTrack) {
        this.el.lyricsStatus.textContent = "当前歌曲暂无歌词";
        return;
      }
      this.el.lyricsStatus.textContent = this.currentLyrics.length
        ? this.currentLyrics.length + " 行 · " + this.currentTrack.title
        : "当前歌曲暂无歌词";
    }

    setLyricsVisible(value) {
      this.lyricsSettings.visible = value !== false;
      this.persistLyricsSettings();
      this.applyLyricsSettings();
      if (this.lyricsSettings.visible && !this.currentLyrics.length) {
        this.toast("当前歌曲暂无歌词，请先导入 LRC", 2400);
      }
    }

    updateLyricsTranslationStatus(text = "", tone = "") {
      const element = this.el.lyricsTranslationStatus;
      if (!element) return;
      if (text) element.textContent = text;
      else if (!this.lyricsSettings.translation) element.textContent = "关闭 · 中文机器翻译";
      else if (!this.currentLyrics.length) element.textContent = "当前歌曲暂无歌词";
      else if (this.translationBusy) element.textContent = "正在翻译歌词…";
      else if (this.currentTranslations.length === this.currentLyrics.length) {
        element.textContent = this.currentTranslations.some((line) => line)
          ? "已翻译 · MyMemory"
          : "原文无需翻译";
      } else element.textContent = "开启 · 中文机器翻译";
      element.classList.toggle("is-error", tone === "error");
      element.classList.toggle("is-ok", tone === "ok");
    }

    setLyricsTranslation(value) {
      this.lyricsSettings.translation = value === true;
      this.persistLyricsSettings();
      if (this.el.lyricsTranslationToggle) {
        this.el.lyricsTranslationToggle.setAttribute(
          "aria-checked",
          this.lyricsSettings.translation ? "true" : "false"
        );
      }
      this.updateLyrics(true);
      this.updateLyricsTranslationStatus();
      if (this.lyricsSettings.translation) this.ensureLyricsTranslation();
    }

    async ensureLyricsTranslation() {
      if (!this.lyricsSettings.translation || this.translationBusy) return;
      if (!this.currentLyrics.length) {
        this.updateLyricsTranslationStatus("当前歌曲暂无歌词");
        return;
      }
      const key = this.lyricsKeyFor(this.currentTrack);
      if (!key) return;
      if (this.currentTranslations.length === this.currentLyrics.length) {
        this.updateLyricsTranslationStatus("已翻译 · MyMemory", "ok");
        this.updateLyrics(true);
        return;
      }
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.translateLyrics !== "function") {
        this.updateLyricsTranslationStatus("仅桌面版支持机器翻译", "error");
        return;
      }

      const hash = this.translationHash();
      const lines = this.currentLyrics.map((line) => line.text);
      this.translationBusy = true;
      this.updateLyricsTranslationStatus("正在翻译歌词…");
      try {
        const response = await desktop.translateLyrics({ lines });
        if (this.lyricsKeyFor(this.currentTrack) !== key || this.translationHash() !== hash) return;
        if (!this.lyricsSettings.translation) return;
        if (!response || !response.ok) {
          this.updateLyricsTranslationStatus((response && response.error) || "歌词翻译失败", "error");
          return;
        }
        if (response.skipped) {
          this.currentTranslations = lines.map(() => "");
          this.lyricsTranslations[key] = { hash, lines: this.currentTranslations.slice() };
          this.saveLyricsTranslations();
          this.updateLyricsTranslationStatus("歌词已是中文，无需翻译");
          this.updateLyrics(true);
          return;
        }
        const translated = Array.isArray(response.translations) ? response.translations : [];
        if (translated.length !== this.currentLyrics.length) {
          this.updateLyricsTranslationStatus("翻译结果行数不匹配", "error");
          return;
        }
        this.currentTranslations = translated.map((line) => String(line || ""));
        this.lyricsTranslations[key] = { hash, lines: this.currentTranslations.slice() };
        this.saveLyricsTranslations();
        this.updateLyricsTranslationStatus("已翻译 · MyMemory", "ok");
        this.updateLyrics(true);
      } catch (_) {
        this.updateLyricsTranslationStatus("无法连接翻译服务，请检查网络", "error");
      } finally {
        this.translationBusy = false;
      }
    }

    setLyricsFont(font) {
      if (!["sans", "mono", "serif", "rounded"].includes(font)) return;
      this.lyricsSettings.font = font;
      this.persistLyricsSettings();
      this.applyLyricsSettings();
    }

    setLyricsColor(color) {
      const normalized = normalizeHex(color);
      if (!normalized) return;
      this.lyricsSettings.color = normalized;
      this.persistLyricsSettings();
      this.applyLyricsSettings();
    }

    setLyricsSize(value) {
      this.lyricsSettings.size = clamp(Math.round(Number(value) || 30), 16, 64);
      this.persistLyricsSettings();
      this.applyLyricsSettings();
    }

    setLyricsLineCount(value) {
      this.lyricsSettings.lines = clamp(Math.round(Number(value) || 5), 1, 6);
      this.persistLyricsSettings();
      this.applyLyricsSettings();
      this.updateLyrics(true);
    }

    setLyricsOpacity(value) {
      this.lyricsSettings.opacity = clamp(Math.round(Number(value) || 85), 20, 100);
      this.persistLyricsSettings();
      this.applyLyricsSettings();
    }

    setLyricsPosition(x, y, opts = {}) {
      this.lyricsSettings.x = clamp(Number(x) || 50, 4, 96);
      this.lyricsSettings.y = clamp(Number(y) || 53, 4, 96);
      this.el.lyricsOverlay.style.setProperty("--lyrics-x", this.lyricsSettings.x + "%");
      this.el.lyricsOverlay.style.setProperty("--lyrics-y", this.lyricsSettings.y + "%");
      if (opts.persist !== false) this.persistLyricsSettings();
    }

    resetLyricsPosition() {
      this.setLyricsPosition(50, 53);
      this.toast("歌词位置已重置", 1600);
    }

    lyricsKeyFor(track) {
      if (!track) return "";
      if (track.filePath) return "file:" + track.filePath;
      if (track.kind === "demo") return "demo:" + track.id;
      return "local:" + (track.title || "") + "|" + (track.artist || "");
    }

    parseLrc(text) {
      const lines = [];
      for (const raw of String(text || "").split(/\r?\n/)) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length) continue;
        const content = raw.replace(/\[[^\]]*\]/g, "").trim();
        if (!content) continue;
        for (const match of stamps) {
          const minutes = Number(match[1]);
          const seconds = Number(match[2]);
          const fraction = String(match[3] || "0").padEnd(3, "0").slice(0, 3);
          lines.push({
            time: minutes * 60 + seconds + Number(fraction) / 1000,
            text: content,
          });
        }
      }
      return lines.sort((a, b) => a.time - b.time);
    }

    loadTrackLyrics() {
      const key = this.lyricsKeyFor(this.currentTrack);
      const raw = key ? this.lyricsMap[key] : "";
      this.currentLyrics = raw ? this.parseLrc(raw) : [];
      this.currentTranslations = this.cachedTranslationsFor(key);
      this.lyricsActive = -1;
      this.updateLyrics(true);
      this.updateLyricsStatus();
      this.updateLyricsTranslationStatus();
      if (this.lyricsPopOpen) this.prepareLyricsSearchFields();
      if (this.lyricsSettings.translation) this.ensureLyricsTranslation();
    }

    prepareLyricsSearchFields() {
      if (!this.el.lyricsArtist || !this.el.lyricsTitle) return;
      const track = this.currentTrack;
      if (!track) return;
      this.el.lyricsArtist.value = String(track.artist || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
      this.el.lyricsTitle.value = String(track.title || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    }

    setLyricsOnlineStatus(text, tone = "") {
      if (!this.el.lyricsOnlineStatus) return;
      this.el.lyricsOnlineStatus.textContent = text;
      this.el.lyricsOnlineStatus.classList.toggle("is-error", tone === "error");
      this.el.lyricsOnlineStatus.classList.toggle("is-ok", tone === "ok");
    }

    setLyricsSearchBusy(busy) {
      this.lyricsSearchBusy = busy;
      if (!this.el.lyricsOnlineSearch) return;
      this.el.lyricsOnlineSearch.disabled = busy;
      this.el.lyricsOnlineSearch.textContent = busy ? "搜索中…" : "搜索";
    }

    async searchOnlineLyrics() {
      if (this.lyricsSearchBusy) return;
      const track = this.currentTrack;
      if (!track) {
        this.setLyricsOnlineStatus("请先选择一首歌曲", "error");
        return;
      }
      const artist = this.el.lyricsArtist.value.trim();
      const title = this.el.lyricsTitle.value.trim();
      if (!title) {
        this.setLyricsOnlineStatus("请输入歌名", "error");
        this.el.lyricsTitle.focus();
        return;
      }
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.searchLyrics !== "function") {
        this.setLyricsOnlineStatus("在线歌词搜索仅在桌面版可用", "error");
        return;
      }

      this.setLyricsSearchBusy(true);
      this.setLyricsOnlineStatus("正在搜索同步歌词…");
      try {
        const response = await desktop.searchLyrics({
          title,
          artist,
          duration: Number(track.duration) || 0,
        });
        if (!response || !response.ok) {
          this.setLyricsOnlineStatus((response && response.error) || "歌词搜索失败", "error");
          return;
        }
        const result = response.result;
        if (!result) {
          this.setLyricsOnlineStatus("没有找到匹配歌词，可以换个歌手或歌名试试", "error");
          return;
        }
        if (this.currentTrack !== track) {
          this.setLyricsOnlineStatus("歌曲已切换，本次搜索结果未导入", "error");
          return;
        }
        if (result.instrumental) {
          this.setLyricsOnlineStatus("这首歌被标记为纯音乐，没有歌词", "error");
          return;
        }
        if (!result.syncedLyrics) {
          this.setLyricsOnlineStatus(
            result.plainLyrics
              ? "只找到纯文本歌词，没有时间轴，无法同步显示"
              : "没有找到可用的同步歌词",
            "error"
          );
          return;
        }
        const parsed = this.parseLrc(result.syncedLyrics);
        if (!parsed.length) {
          this.setLyricsOnlineStatus("找到歌词，但没有可识别的时间标签", "error");
          return;
        }
        this.el.lyricsArtist.value = result.artistName || artist;
        this.el.lyricsTitle.value = result.trackName || title;
        this.importLyricsText(
          result.syncedLyrics,
          (result.artistName || artist || "LRCLIB") + " · " + (result.trackName || title)
        );
        this.setLyricsOnlineStatus(
          "已匹配 LRCLIB · " + (result.artistName || artist || "未知歌手") + " · " + parsed.length + " 行",
          "ok"
        );
      } catch (_) {
        this.setLyricsOnlineStatus("无法连接歌词服务，请检查网络", "error");
      } finally {
        this.setLyricsSearchBusy(false);
      }
    }

    async importLyricsFile(file) {
      if (!file) return;
      if (file.size > 1024 * 1024) {
        this.toast("歌词文件不能超过 1 MB", 2200);
        return;
      }
      try {
        const text = await file.text();
        this.importLyricsText(text, file.name);
      } catch (_) {
        this.toast("无法读取歌词文件", 2200);
      }
    }

    importLyricsText(text, filename = "") {
      if (!this.currentTrack) {
        this.toast("请先选择一首歌曲", 2000);
        return;
      }
      const parsed = this.parseLrc(text);
      if (!parsed.length) {
        this.toast("未找到 [mm:ss] 时间标签，请检查 LRC 文件", 3000);
        return;
      }
      const key = this.lyricsKeyFor(this.currentTrack);
      this.lyricsMap[key] = String(text).slice(0, 1024 * 1024);
      this.saveLyricsMap();
      this.clearTranslationFor(key);
      this.currentLyrics = parsed;
      this.currentTranslations = [];
      this.lyricsSettings.visible = true;
      this.persistLyricsSettings();
      this.lyricsActive = -1;
      this.applyLyricsSettings();
      this.updateLyrics(true);
      if (this.lyricsSettings.translation) this.ensureLyricsTranslation();
      this.toast(
        "已导入歌词" + (filename ? " · " + filename : "") + " · " + parsed.length + " 行",
        2600
      );
    }

    clearCurrentLyrics() {
      const key = this.lyricsKeyFor(this.currentTrack);
      if (!key || !(key in this.lyricsMap)) return;
      delete this.lyricsMap[key];
      this.saveLyricsMap();
      this.clearTranslationFor(key);
      this.currentLyrics = [];
      this.currentTranslations = [];
      this.lyricsActive = -1;
      this.updateLyrics(true);
      this.updateLyricsStatus();
      this.updateLyricsTranslationStatus();
      this.toast("已清除当前歌曲歌词", 1800);
    }

    updateLyrics(force = false) {
      if (!this.el.lyricsOverlay) return;
      if (!this.lyricsSettings.visible || !this.currentLyrics.length) {
        this.el.lyricsOverlay.setAttribute("aria-hidden", "true");
        return;
      }
      this.el.lyricsOverlay.setAttribute("aria-hidden", "false");
      const time = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
      let active = 0;
      for (let i = 0; i < this.currentLyrics.length; i += 1) {
        if (this.currentLyrics[i].time <= time + 0.12) active = i;
        else break;
      }
      if (force || active !== this.lyricsActive) {
        const previous = this.lyricsActive;
        this.lyricsActive = active;
        this.renderLyricLines(active, {
          animate: !force && previous >= 0 && active !== previous,
          direction: active >= previous ? 1 : -1,
        });
      }
    }

    renderLyricLines(active, opts = {}) {
      const linesElement = this.el.lyricsLines;
      const viewport = this.el.lyricsViewport;
      if (!linesElement || !viewport) return;
      if (!this.currentLyrics.length) {
        linesElement.innerHTML = "";
        linesElement.style.transform = "";
        viewport.style.height = "0px";
        this.lyricsRenderKey = "";
        return;
      }

      const totalRows = this.lyricsSettings.lines || 5;
      const hasTranslations = this.currentTranslations.some((line) => Boolean(line));
      const translationOn = this.lyricsSettings.translation && hasTranslations;
      const renderKey =
        this.currentLyrics.map((line) => line.text).join("\u0001") +
        "\u0002" +
        this.currentTranslations.map((line) => line || "").join("\u0001");
      let rebuilt = false;
      if (renderKey !== this.lyricsRenderKey) {
        rebuilt = true;
        this.lyricsRenderKey = renderKey;
        linesElement.innerHTML = "";
        this.currentLyrics.forEach((lyric, index) => {
          const line = document.createElement("span");
          line.className = "lyric-line";
          line.dataset.index = String(index);
          line.textContent = lyric.text;
          const translation = this.currentTranslations[index];
          if (translation) {
            const small = document.createElement("small");
            small.className = "lyric-translation";
            small.textContent = translation;
            line.appendChild(small);
          }
          linesElement.appendChild(line);
        });
      }

      const sourceCount = Math.min(
        this.currentLyrics.length,
        translationOn ? Math.ceil(totalRows / 2) : totalRows
      );
      let start = Math.max(0, active - Math.floor(sourceCount / 2));
      start = Math.min(start, Math.max(0, this.currentLyrics.length - sourceCount));
      const indexes = Array.from({ length: sourceCount }, (_, offset) => start + offset);

      const translationIndexes = new Set();
      let translationBudget = translationOn ? Math.max(0, totalRows - sourceCount) : 0;
      if (translationBudget > 0) {
        const ordered = indexes
          .slice()
          .sort((a, b) => Math.abs(a - active) - Math.abs(b - active) || a - b);
        for (const index of ordered) {
          if (!translationBudget) break;
          if (!this.currentTranslations[index]) continue;
          translationIndexes.add(index);
          translationBudget -= 1;
        }
      }

      const lineElements = linesElement.children;
      for (let i = 0; i < lineElements.length; i += 1) {
        const line = lineElements[i];
        line.classList.toggle("is-active", i === active);
        line.classList.toggle("is-near", i !== active && Math.abs(i - active) <= 1);
        const translation = line.querySelector(".lyric-translation");
        if (translation) translation.hidden = !(translationOn && translationIndexes.has(i));
      }

      const first = lineElements[start];
      const last = lineElements[start + sourceCount - 1];
      if (!first || !last) return;
      const height = last.offsetTop + last.offsetHeight - first.offsetTop;
      const animate = Boolean(opts.animate) && !rebuilt;
      linesElement.style.transition = animate ? "" : "none";
      viewport.style.transition = animate ? "" : "none";
      viewport.style.height = Math.max(0, height) + "px";
      linesElement.style.transform = "translateY(" + -first.offsetTop + "px)";
      if (!animate) void linesElement.offsetHeight;
    }

    startLyricsDrag(event) {
      if (event.button !== 0 || !this.lyricsSettings.visible || !this.currentLyrics.length) return;
      const rect = this.el.lyricsOverlay.getBoundingClientRect();
      this.lyricsDrag = {
        pointerId: event.pointerId,
        offsetX: rect.left + rect.width / 2 - event.clientX,
        offsetY: rect.top + rect.height / 2 - event.clientY,
      };
      this.el.lyricsOverlay.classList.add("is-dragging");
      try {
        this.el.lyricsOverlay.setPointerCapture(event.pointerId);
      } catch (_) {}
      event.preventDefault();
    }

    moveLyricsDrag(event) {
      if (!this.lyricsDrag) return;
      const layer = this.el.uiLayer.getBoundingClientRect();
      if (!layer.width || !layer.height) return;
      const x = ((event.clientX + this.lyricsDrag.offsetX - layer.left) / layer.width) * 100;
      const y = ((event.clientY + this.lyricsDrag.offsetY - layer.top) / layer.height) * 100;
      this.setLyricsPosition(x, y, { persist: false });
    }

    endLyricsDrag(event) {
      if (!this.lyricsDrag) return;
      try {
        this.el.lyricsOverlay.releasePointerCapture(this.lyricsDrag.pointerId);
      } catch (_) {}
      this.lyricsDrag = null;
      this.el.lyricsOverlay.classList.remove("is-dragging");
      this.persistLyricsSettings();
    }

    /* ---------- album wall ---------- */
    openAlbumWall() {
      this.closeVisualPopovers();
      if (this.settingsOpen) this.toggleSettings(false);
      if (this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
      if (this.todoEditorOpen) this.closeTodoEditor();
      this.albumWallOpen = true;
      this.renderAlbumWall();
      this.el.albumWall.classList.add("is-open");
      this.el.albumWall.setAttribute("aria-hidden", "false");
    }

    closeAlbumWall() {
      this.albumWallOpen = false;
      this.clearAlbumDeleteEdge();
      this.el.albumWall.classList.remove("is-open");
      this.el.albumWall.setAttribute("aria-hidden", "true");
      if (this.el.albumWall.contains(document.activeElement)) {
        this.el.albumViewBtn.focus();
      }
    }

    renderAlbumWall() {
      if (!this.el.albumGrid) return;
      this.el.albumGrid.innerHTML = "";
      this.el.albumWallCount.textContent = String(this.tracks.length);
      if (!this.tracks.length) {
        const empty = document.createElement("div");
        empty.className = "album-grid-empty";
        empty.textContent = "播放列表还是空的，先导入一些音乐吧。";
        this.el.albumGrid.appendChild(empty);
        return;
      }

      this.tracks.forEach((track, index) => {
        const card = document.createElement("article");
        card.className = "album-card" + (index === this.currentIndex ? " is-current" : "");
        card.draggable = true;
        card.dataset.index = String(index);
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", "播放 " + (track.title || "Untitled") + "，可拖拽排序");

        const cover = this.coverFor(track);
        const img = document.createElement("img");
        img.className = "album-cover";
        img.src = cover;
        img.alt = track.title || "";
        img.loading = "lazy";
        img.draggable = false;
        if (!cover) card.classList.add("is-broken");
        img.addEventListener("error", () => card.classList.add("is-broken"));

        const wash = document.createElement("div");
        wash.className = "album-card-wash";

        const meta = document.createElement("div");
        meta.className = "album-card-meta";
        const number = document.createElement("span");
        number.className = "album-card-index";
        number.textContent = pad2(index + 1);
        const title = document.createElement("span");
        title.className = "album-card-title";
        title.textContent = track.title || "Untitled";
        const artist = document.createElement("span");
        artist.className = "album-card-artist";
        artist.textContent = track.artist || "Unknown artist";
        meta.append(number, title, artist);

        card.append(img, wash, meta);
        if (index === this.currentIndex) {
          const live = document.createElement("span");
          live.className = "album-card-live";
          live.textContent = "PLAYING";
          card.appendChild(live);
        }
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.selectTrack(index, { autoplay: true });
            this.renderAlbumWall();
          }
        });
        this.el.albumGrid.appendChild(card);
      });
    }

    onAlbumDragStart(event) {
      const card = event.target.closest(".album-card");
      if (!card) return;
      this.clearAlbumDeleteEdge();
      this.el.albumGrid.querySelectorAll(".album-card").forEach((item) => {
        item.style.transform = "";
        item.classList.remove("is-preview-moving", "is-drop-target");
      });
      this.albumDragIndex = Number(card.dataset.index);
      this.albumPreviewOrder = this.tracks.map((_, index) => index);
      this.albumHomeOffsets = this.captureAlbumOffsets();
      this.albumCellSize = { w: card.offsetWidth, h: card.offsetHeight };
      const gridRect = this.el.albumGrid.getBoundingClientRect();
      this.albumGridOrigin = {
        x: gridRect.left - this.el.albumGrid.scrollLeft,
        y: gridRect.top - this.el.albumGrid.scrollTop,
      };
      this.albumHoverCell = -1;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", String(this.albumDragIndex));
      } catch (_) {}
    }

    captureAlbumOffsets() {
      const offsets = new Map();
      this.el.albumGrid.querySelectorAll(".album-card").forEach((card) => {
        offsets.set(Number(card.dataset.index), { x: card.offsetLeft, y: card.offsetTop });
      });
      return offsets;
    }

    onAlbumDragOver(event) {
      if (this.albumDragIndex < 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const card = event.target.closest(".album-card");
      this.el.albumGrid.querySelectorAll(".is-drop-target").forEach((item) => {
        item.classList.remove("is-drop-target");
      });
      if (card && Number(card.dataset.index) !== this.albumDragIndex) {
        card.classList.add("is-drop-target");
      }
      const cell = this.albumCellAt(event.clientX, event.clientY);
      if (cell >= 0) this.previewAlbumSwap(cell);
    }

    albumCellAt(clientX, clientY) {
      const offsets = this.albumHomeOffsets;
      const size = this.albumCellSize;
      if (!offsets || !size) return -1;
      const gridRect = this.el.albumGrid.getBoundingClientRect();
      const origin = {
        x: gridRect.left - this.el.albumGrid.scrollLeft,
        y: gridRect.top - this.el.albumGrid.scrollTop,
      };
      this.albumGridOrigin = origin;
      const x = clientX - origin.x;
      const y = clientY - origin.y;
      for (const [cell, home] of offsets) {
        if (x >= home.x && x <= home.x + size.w && y >= home.y && y <= home.y + size.h) {
          return cell;
        }
      }
      return -1;
    }

    previewAlbumSwap(cell) {
      const order = this.albumPreviewOrder;
      if (!order || !this.albumHomeOffsets) return;
      if (!Number.isInteger(cell) || cell < 0 || cell >= order.length) return;
      if (this.albumHoverCell === cell) return;
      this.albumHoverCell = cell;
      const from = order.indexOf(this.albumDragIndex);
      if (from < 0 || from === cell) return;
      const occupant = order[cell];
      order[cell] = order[from];
      order[from] = occupant;
      this.animateAlbumPreview();
    }

    animateAlbumPreview() {
      const order = this.albumPreviewOrder;
      const offsets = this.albumHomeOffsets;
      if (!order || !offsets) return;
      this.el.albumGrid.querySelectorAll(".album-card").forEach((card) => {
        const original = Number(card.dataset.index);
        const position = order.indexOf(original);
        const home = offsets.get(original);
        const target = offsets.get(position);
        if (position < 0 || !home || !target) return;
        const dx = target.x - home.x;
        const dy = target.y - home.y;
        card.classList.add("is-preview-moving");
        card.style.transform = dx || dy ? "translate3d(" + dx + "px," + dy + "px,0)" : "";
      });
    }

    onAlbumDragLeave(event) {
      const card = event.target.closest(".album-card");
      if (card) card.classList.remove("is-drop-target");
    }

    onAlbumDrop(event) {
      if (this.albumDragIndex < 0) return;
      event.preventDefault();
      event.stopPropagation();
      const from = this.albumDragIndex;
      const preview = this.albumPreviewOrder ? this.albumPreviewOrder.slice() : null;
      if (this.albumDeleteEdgeAt(event.clientX, event.clientY)) {
        this.clearAlbumDeleteEdge();
        this.clearAlbumDrag();
        this.deleteAlbumTrack(from);
        return;
      }
      if (!preview || !preview.some((value, index) => value !== index)) {
        this.clearAlbumDrag();
        return;
      }
      this.albumJustDragged = true;
      window.setTimeout(() => {
        this.albumJustDragged = false;
      }, 250);
      this.commitAlbumOrder(preview);
    }

    albumDeleteEdgeAt(clientX, clientY) {
      const margin = Math.min(78, Math.max(48, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.075)));
      if (clientX <= margin) return "left";
      if (clientX >= window.innerWidth - margin) return "right";
      if (clientY <= margin) return "top";
      if (clientY >= window.innerHeight - margin) return "bottom";
      return "";
    }

    setAlbumDeleteEdge(edge) {
      if (!this.el.albumWall) return;
      const active = Boolean(edge);
      this.el.albumWall.classList.toggle("is-delete-armed", active);
      this.el.albumDeleteEdges.forEach((element) => {
        element.classList.toggle("is-hot", active && element.dataset.edge === edge);
      });
      if (active) {
        this.el.albumGrid.querySelectorAll(".is-drop-target").forEach((card) => {
          card.classList.remove("is-drop-target");
        });
      }
    }

    clearAlbumDeleteEdge() {
      this.setAlbumDeleteEdge("");
    }

    onAlbumPageDragOver(event) {
      if (!this.albumWallOpen || this.albumDragIndex < 0) return;
      const edge = this.albumDeleteEdgeAt(event.clientX, event.clientY);
      if (!edge) {
        this.clearAlbumDeleteEdge();
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.setAlbumDeleteEdge(edge);
    }

    onAlbumPageDrop(event) {
      if (!this.albumWallOpen || this.albumDragIndex < 0) return;
      const edge = this.albumDeleteEdgeAt(event.clientX, event.clientY);
      if (!edge) {
        this.clearAlbumDeleteEdge();
        return;
      }
      event.preventDefault();
      const from = this.albumDragIndex;
      this.clearAlbumDeleteEdge();
      this.clearAlbumDrag();
      this.deleteAlbumTrack(from);
    }

    deleteAlbumTrack(index) {
      this.removeTrack(index, { allowBuiltIn: true, albumDelete: true });
    }

    clearAlbumDrag() {
      this.setAlbumDeleteEdge("");
      this.albumDragIndex = -1;
      this.albumHoverCell = -1;
      this.albumPreviewOrder = null;
      this.albumHomeOffsets = null;
      this.albumCellSize = null;
      this.albumGridOrigin = null;
      this.el.albumGrid.querySelectorAll(".album-card").forEach((card) => {
        card.classList.remove("is-dragging", "is-drop-target");
        if (card.style.transform) {
          card.classList.add("is-preview-moving");
          card.style.transform = "";
          window.setTimeout(() => card.classList.remove("is-preview-moving"), 380);
        }
      });
    }

    onAlbumCardClick(event) {
      if (this.albumJustDragged) return;
      const card = event.target.closest(".album-card");
      if (!card) return;
      const index = Number(card.dataset.index);
      if (!Number.isInteger(index)) return;
      this.selectTrack(index, { autoplay: true });
      this.renderAlbumWall();
    }

    commitAlbumOrder(preview) {
      if (!Array.isArray(preview)) return;
      const ordered = preview.map((index) => this.tracks[index]).filter(Boolean);
      if (ordered.length !== this.tracks.length) return;
      const before = new Map();
      this.el.albumGrid.querySelectorAll(".album-card").forEach((card) => {
        before.set(Number(card.dataset.index), card.getBoundingClientRect());
      });
      this.clearAlbumDrag();
      const current = this.currentTrack;
      this.tracks.length = 0;
      this.tracks.push(...ordered);
      this.currentIndex = Math.max(0, this.tracks.indexOf(current));
      this.el.trackIndex.textContent = pad2(this.currentIndex + 1);
      this.renderQueue();
      this.renderAlbumWall();
      // FLIP: keep cards visually where the preview left them, then settle.
      const cards = this.el.albumGrid.querySelectorAll(".album-card");
      cards.forEach((card, position) => {
        const original = preview[position];
        const fromRect = before.get(original);
        if (!fromRect) return;
        const toRect = card.getBoundingClientRect();
        const dx = fromRect.left - toRect.left;
        const dy = fromRect.top - toRect.top;
        if (!dx && !dy) return;
        card.classList.add("is-preview-moving");
        card.style.transition = "none";
        card.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
        void card.offsetWidth;
        card.style.transition = "";
        card.style.transform = "";
        window.setTimeout(() => {
          card.classList.remove("is-preview-moving");
          card.style.transition = "";
        }, 380);
      });
      this.toast("播放顺序已更新", 1400);
    }

    /* ---------- todo ---------- */
    loadTodos() {
      try {
        const raw = JSON.parse(window.localStorage.getItem("prism.todos") || "[]");
        if (!Array.isArray(raw)) return [];
        const seen = new Set();
        return raw
          .filter((item) => item && typeof item.text === "string" && item.text.trim())
          .slice(0, 200)
          .map((item, index) => {
            let id = typeof item.id === "string" && item.id ? item.id : "todo-loaded-" + index;
            if (seen.has(id)) id = "todo-loaded-" + index;
            seen.add(id);
            return { id, text: item.text.trim().slice(0, 120), done: item.done === true };
          });
      } catch (_) {
        return [];
      }
    }

    setTodoSaveState(text, tone = "") {
      if (!this.el.todoSaveState) return;
      this.el.todoSaveState.textContent = text;
      this.el.todoSaveState.classList.remove("is-dirty", "is-saved");
      if (tone) this.el.todoSaveState.classList.add("is-" + tone);
    }

    setTodoTransparency(value, opts = {}) {
      const numeric = Number(value);
      const v = clamp(Math.round(Number.isFinite(numeric) ? numeric : 45), 0, 100);
      this.todoTransparency = v;
      const alpha = String((100 - v) / 100);
      this.el.todoPanel.style.setProperty("--todo-alpha", alpha);
      this.el.todoPreview.style.setProperty("--todo-alpha", alpha);
      this.el.todoOpacity.value = String(v);
      this.el.todoOpacityFill.style.width = v + "%";
      this.el.todoOpacityValue.textContent = v + "%";
      if (opts.persist !== false) storeSet("prism.todoTransparency", String(v));
    }

    setTodoVisible(visible, opts = {}) {
      const open = visible === true;
      if (open && this.settingsOpen) this.toggleSettings(false);
      if (open && this.queueOpen) this.toggleQueue(false);
      this.todoVisible = open;
      if (!open) this.todoEditorOpen = false;
      this.updateTodoVisibility();
      if (!open && (this.el.todoPanel.contains(document.activeElement) || this.el.todoPreview.contains(document.activeElement))) {
        document.activeElement.blur();
      }
      if (open && opts.focus && this.todoEditorOpen) {
        window.setTimeout(() => this.el.todoInput.focus(), 90);
      }
    }

    openTodoEditor(opts = {}) {
      this.todoVisible = true;
      this.todoEditorOpen = true;
      if (this.settingsOpen) this.toggleSettings(false);
      if (this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
      if (this.queueOpen) this.toggleQueue(false);
      this.updateTodoVisibility();
      if (opts.focus) {
        window.setTimeout(() => this.el.todoInput.focus(), 90);
      }
    }

    closeTodoEditor() {
      this.todoEditorOpen = false;
      this.updateTodoVisibility();
      if (this.el.todoPanel.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }

    updateTodoVisibility() {
      const editorOpen = this.todoVisible && this.todoEditorOpen;
      const previewOpen =
        this.todoVisible &&
        !this.todoEditorOpen &&
        !this.settingsOpen &&
        !this.backgroundSettingsOpen &&
        !this.queueOpen &&
        !this.albumWallOpen;

      this.el.todoPanel.classList.toggle("is-open", editorOpen);
      this.el.todoPanel.setAttribute("aria-hidden", editorOpen ? "false" : "true");
      this.el.todoPreview.classList.toggle("is-open", previewOpen);
      this.el.todoPreview.setAttribute("aria-hidden", previewOpen ? "false" : "true");
      if (previewOpen) this.applyTodoPreviewPosition();
      this.el.todoToggle.setAttribute("aria-checked", this.todoVisible ? "true" : "false");
      this.el.todoToggle.setAttribute(
        "aria-label",
        this.todoVisible ? "隐藏待办清单" : "显示待办清单"
      );
    }

    applyTodoPreviewPosition() {
      const preview = this.el.todoPreview;
      const layer = this.el.uiLayer;
      if (!preview || !layer) return;
      let saved = null;
      try {
        saved = JSON.parse(storeGet("prism.todoPreviewPos", "null"));
      } catch (_) {}
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
      const maxLeft = Math.max(0, layer.offsetWidth - preview.offsetWidth);
      const maxTop = Math.max(0, layer.offsetHeight - preview.offsetHeight);
      preview.style.left = Math.round(clamp(saved.x, 0, 1) * maxLeft) + "px";
      preview.style.top = Math.round(clamp(saved.y, 0, 1) * maxTop) + "px";
      preview.style.right = "auto";
    }

    startTodoPreviewDrag(event) {
      if (event.button !== 0) return;
      if (event.target.closest("button, input, a, select, textarea")) return;
      const preview = this.el.todoPreview;
      const layer = this.el.uiLayer;
      if (!preview || !layer) return;

      event.preventDefault();
      const rect = preview.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const scale = layerRect.width / Math.max(1, layer.offsetWidth) || 1;
      const left = (rect.left - layerRect.left) / scale;
      const top = (rect.top - layerRect.top) / scale;
      const maxLeft = Math.max(0, layer.offsetWidth - preview.offsetWidth);
      const maxTop = Math.max(0, layer.offsetHeight - preview.offsetHeight);

      preview.style.left = left + "px";
      preview.style.top = top + "px";
      preview.style.right = "auto";
      preview.classList.add("is-dragging");

      const drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left,
        top,
        scale,
        maxLeft,
        maxTop,
        move: null,
        end: null,
      };
      drag.move = (e) => this.moveTodoPreviewDrag(e);
      drag.end = (e) => this.endTodoPreviewDrag(e);
      this.todoPreviewDrag = drag;
      try {
        preview.setPointerCapture(event.pointerId);
      } catch (_) {}
      window.addEventListener("pointermove", drag.move, { passive: false });
      window.addEventListener("pointerup", drag.end);
      window.addEventListener("pointercancel", drag.end);
    }

    moveTodoPreviewDrag(event) {
      const drag = this.todoPreviewDrag;
      const preview = this.el.todoPreview;
      if (!drag || !preview || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const left = clamp(
        drag.left + (event.clientX - drag.startX) / drag.scale,
        8,
        Math.max(8, drag.maxLeft - 8)
      );
      const top = clamp(
        drag.top + (event.clientY - drag.startY) / drag.scale,
        8,
        Math.max(8, drag.maxTop - 8)
      );
      preview.style.left = Math.round(left) + "px";
      preview.style.top = Math.round(top) + "px";
    }

    endTodoPreviewDrag(event) {
      const drag = this.todoPreviewDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const preview = this.el.todoPreview;
      const layer = this.el.uiLayer;
      window.removeEventListener("pointermove", drag.move);
      window.removeEventListener("pointerup", drag.end);
      window.removeEventListener("pointercancel", drag.end);
      if (preview) {
        preview.classList.remove("is-dragging");
        try {
          preview.releasePointerCapture(drag.pointerId);
        } catch (_) {}
      }
      if (preview && layer) {
        const maxLeft = Math.max(1, layer.offsetWidth - preview.offsetWidth);
        const maxTop = Math.max(1, layer.offsetHeight - preview.offsetHeight);
        const left = parseFloat(preview.style.left) || 0;
        const top = parseFloat(preview.style.top) || 0;
        storeSet(
          "prism.todoPreviewPos",
          JSON.stringify({
            x: clamp(left / maxLeft, 0, 1),
            y: clamp(top / maxTop, 0, 1),
          })
        );
      }
      this.todoPreviewDrag = null;
    }

    resetTodoPreviewPosition() {
      const preview = this.el.todoPreview;
      if (!preview) return;
      preview.style.left = "";
      preview.style.top = "";
      preview.style.right = "";
      storeSet("prism.todoPreviewPos", "null");
      this.toast("待办框位置已重置", 1800);
    }

    renderTodos() {
      if (!this.el.todoList) return;
      this.el.todoList.innerHTML = "";
      const openCount = this.todos.filter((todo) => !todo.done).length;
      const doneCount = this.todos.length - openCount;

      for (const todo of this.todos) {
        const item = document.createElement("li");
        item.className = "todo-item" + (todo.done ? " is-done" : "");
        item.dataset.id = todo.id;

        const check = document.createElement("label");
        check.className = "todo-check";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = todo.done;
        box.setAttribute("aria-label", (todo.done ? "标记未完成：" : "标记完成：") + todo.text);
        const mark = document.createElement("span");
        check.appendChild(box);
        check.appendChild(mark);

        const text = document.createElement("span");
        text.className = "todo-text";
        text.textContent = todo.text;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "todo-delete";
        remove.setAttribute("aria-label", "删除待办：" + todo.text);
        remove.innerHTML = '<svg><use href="#i-trash"></use></svg>';

        item.appendChild(check);
        item.appendChild(text);
        item.appendChild(remove);
        this.el.todoList.appendChild(item);
      }

      this.el.todoCount.textContent = String(this.todos.length);
      this.el.todoEmpty.hidden = this.todos.length > 0;
      this.el.todoBadge.hidden = openCount === 0;
      this.el.todoBadge.textContent = String(openCount);
      this.el.clearDone.hidden = doneCount === 0;
      this.renderTodoPreview();
    }

    renderTodoPreview() {
      if (!this.el.todoPreviewList) return;
      this.el.todoPreviewList.innerHTML = "";
      this.el.todoPreviewCount.textContent = String(this.todos.length);

      for (const todo of this.todos) {
        const item = document.createElement("li");
        item.className = "todo-preview-item" + (todo.done ? " is-done" : "");

        const mark = document.createElement("span");
        mark.className = "todo-preview-mark";
        const text = document.createElement("span");
        text.className = "todo-preview-text";
        text.textContent = todo.text;

        item.appendChild(mark);
        item.appendChild(text);
        this.el.todoPreviewList.appendChild(item);
      }

      this.el.todoPreviewEmpty.hidden = this.todos.length > 0;
    }

    markTodosDirty() {
      this.todoDirty = true;
      this.setTodoSaveState("有未保存更改", "dirty");
    }

    addTodo() {
      const text = this.el.todoInput.value.trim();
      if (!text) {
        this.el.todoInput.focus();
        return;
      }
      if (this.todos.length >= 200) {
        this.toast("待办最多保存 200 条", 2200);
        return;
      }
      this.todos.push({
        id: "todo-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        text: text.slice(0, 120),
        done: false,
      });
      this.el.todoInput.value = "";
      this.markTodosDirty();
      this.renderTodos();
      this.el.todoInput.focus();
    }

    toggleTodoDone(id, done) {
      const todo = this.todos.find((item) => item.id === id);
      if (!todo) return;
      todo.done = done === true;
      this.markTodosDirty();
      this.renderTodos();
    }

    deleteTodo(id) {
      const index = this.todos.findIndex((item) => item.id === id);
      if (index < 0) return;
      this.todos.splice(index, 1);
      this.markTodosDirty();
      this.renderTodos();
    }

    clearCompletedTodos() {
      const next = this.todos.filter((todo) => !todo.done);
      if (next.length === this.todos.length) return;
      this.todos = next;
      this.markTodosDirty();
      this.renderTodos();
    }

    saveTodos() {
      if (this.todoSaveBusy) return;
      this.todoSaveBusy = true;
      this.el.saveTodos.disabled = true;
      try {
        window.localStorage.setItem("prism.todos", JSON.stringify(this.todos));
        this.todoDirty = false;
        this.setTodoSaveState("已保存", "saved");
        this.toast(
          this.todos.length
            ? "已保存 " + this.todos.length + " 条待办 · 下次打开自动显示"
            : "待办已清空并保存",
          2800
        );
      } catch (_) {
        this.setTodoSaveState("保存失败", "dirty");
        this.toast("待办事项保存失败", 2600);
      } finally {
        this.todoSaveBusy = false;
        this.el.saveTodos.disabled = false;
      }
    }

    getDuration() {
      const d = this.audio.duration;
      if (Number.isFinite(d) && d > 0) return d;
      return this.currentTrack && Number.isFinite(this.currentTrack.duration) ? this.currentTrack.duration : 0;
    }

    /* ---------- track selection ---------- */
    get currentTrack() {
      return this.tracks[this.currentIndex] || null;
    }

    selectTrack(index, opts = {}) {
      if (!this.tracks.length) return;
      this.currentIndex = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
      const track = this.currentTrack;
      if (!track) return;
      this.albumBackdropOverride = false;

      this.audio.src = track.src;
      try { this.audio.load(); } catch (_) {}
      this.applyTrackUI(track);
      this.applyAlbumBackdrop(track);
      this.field.setTempo(track.bpm || 100);
      if (this.sphere) this.sphere.setTempo(track.bpm || 100);
      this.loadTrackLyrics();
      this.updateMediaSession(track);
      this.el.currentTime.textContent = "00:00";
      this.setSeekVisual(0);
      this.el.seek.value = "0";
      this.el.duration.textContent = formatTime(track.duration);
      this.renderQueue();
      this.updatePlayUI(false);
      this.field.pulse(0.5);
      if (this.sphere) this.sphere.pulse(0.4);

      if (!opts.first && this.entered && !this.albumCoverForBackground(track)) {
        this.backgrounds.next({ silent: true });
      }

      if (opts.autoplay) {
        this.play().catch(() => {});
      }
    }

    applyTrackUI(track) {
      this.el.trackTitle.textContent = track.title || "Untitled";
      this.el.trackArtist.textContent = track.artist || "Unknown artist";
      this.el.miniTitle.textContent = track.title || "Untitled";
      this.el.miniArtist.textContent = track.artist || "Unknown artist";
      this.el.trackIndex.textContent = pad2(this.currentIndex + 1);
      this.el.trackTotal.textContent = pad2(this.tracks.length);
      this.el.trackBpm.textContent = track.bpm ? track.bpm + " BPM" : "LOCAL FILE";
      this.el.trackMood.textContent = track.kind === "local" ? "LOCAL SESSION" : track.mood || "AMBIENT ELECTRONICA";
      document.title = "PRISM · " + (track.title || "Particle Radio");

      const cover = this.coverFor(track);
      this.el.miniCover.classList.add("is-swapping");
      window.setTimeout(() => {
        if (cover) this.el.miniCover.src = cover;
        this.el.miniCover.alt = track.title || "";
        this.el.miniCover.onload = () => this.el.miniCover.classList.remove("is-swapping");
        window.setTimeout(() => this.el.miniCover.classList.remove("is-swapping"), 500);
      }, 80);

      const colors = Array.isArray(track.palette) && track.palette.length >= 2
        ? track.palette
        : ["#8ef4ff", "#ff9be2", "#ffd39a"];
      this.applyTheme(colors);
      this.animateTitle();
    }

    animateTitle() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!this.el.trackTitle.animate) return;
      this.el.trackTitle.animate(
        [
          { opacity: 0, transform: "translateY(14px)", filter: "blur(5px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      this.el.trackArtist.animate(
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 520, delay: 60, easing: "ease-out" }
      );
    }

    /* ---------- audio events ---------- */
    onPlay() {
      this.field.setPlaying(true);
      if (this.sphere) this.sphere.setPlaying(true);
      this.updatePlayUI(true);
      this.setStatus("playing");
      this.updateMediaSessionState("playing");
    }

    onPause() {
      this.field.setPlaying(false);
      if (this.sphere) this.sphere.setPlaying(false);
      this.updatePlayUI(false);
      if (!this.audio.ended) this.setStatus(this.entered ? "paused" : "standby");
      this.updateMediaSessionState("paused");
    }

    onEnded() {
      this.field.setPlaying(false);
      if (this.sphere) this.sphere.setPlaying(false);
      this.updatePlayUI(false);
      if (this.repeat === "one") {
        this.audio.currentTime = 0;
        this.play().catch(() => {});
        return;
      }
      const last = this.currentIndex === this.tracks.length - 1;
      if (!this.shuffle && last && this.repeat === "off") {
        this.audio.currentTime = this.getDuration();
        this.setStatus("ended");
        return;
      }
      const nextIndex = this.getAdjacent(1);
      this.selectTrack(nextIndex, { autoplay: true });
    }

    onMetadata() {
      const d = this.audio.duration;
      if (Number.isFinite(d) && d > 0) {
        this.currentTrack.duration = d;
        this.rememberDuration(this.currentTrack, d);
        this.el.duration.textContent = formatTime(d);
        this.renderQueue();
      }
    }

    loadDurationCache() {
      try {
        const raw = JSON.parse(storeGet("prism.durationCache", "{}"));
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const cache = {};
        let count = 0;
        for (const [key, value] of Object.entries(raw)) {
          const duration = Number(value);
          if (key && Number.isFinite(duration) && duration > 0) {
            cache[key] = duration;
            count += 1;
          }
        }
        return count > 2000 ? Object.fromEntries(Object.entries(cache).slice(-2000)) : cache;
      } catch (_) {
        return {};
      }
    }

    durationKey(track) {
      return track && track.kind === "local" && track.filePath ? track.filePath : "";
    }

    applyCachedDurations(tracks) {
      for (const track of tracks || []) {
        const key = this.durationKey(track);
        if (!key || track.duration > 0) continue;
        const duration = this.durationCache[key];
        if (Number.isFinite(duration) && duration > 0) track.duration = duration;
      }
    }

    rememberDuration(track, duration) {
      const key = this.durationKey(track);
      if (!key || !Number.isFinite(duration) || duration <= 0) return;
      this.durationCache[key] = Math.round(duration * 100) / 100;
      window.clearTimeout(this.durationCacheTimer);
      this.durationCacheTimer = window.setTimeout(() => {
        try {
          storeSet("prism.durationCache", JSON.stringify(this.durationCache));
        } catch (_) {}
      }, 250);
    }

    readAudioDuration(src) {
      return new Promise((resolve) => {
        let done = false;
        const audio = new Audio();
        audio.preload = "metadata";
        const finish = (value) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          audio.removeEventListener("loadedmetadata", onLoaded);
          audio.removeEventListener("error", onError);
          audio.removeAttribute("src");
          try { audio.load(); } catch (_) {}
          resolve(Number.isFinite(value) && value > 0 ? value : 0);
        };
        const onLoaded = () => finish(audio.duration);
        const onError = () => finish(0);
        const timer = window.setTimeout(() => finish(0), 8000);
        audio.addEventListener("loadedmetadata", onLoaded);
        audio.addEventListener("error", onError);
        try {
          audio.src = src;
          audio.load();
        } catch (_) {
          finish(0);
        }
      });
    }

    async hydrateDurations(tracks) {
      const pending = (tracks || []).filter(
        (track) => track && track.kind === "local" && !(track.duration > 0) && track.src
      );
      if (!pending.length) return;
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const track = pending[cursor];
          cursor += 1;
          const duration = await this.readAudioDuration(track.src);
          if (!duration || !this.tracks.includes(track)) continue;
          track.duration = duration;
          this.rememberDuration(track, duration);
          this.updateQueueDuration(track);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
    }

    updateQueueDuration(track) {
      if (!track || !(track.duration > 0)) return;
      if (this.currentTrack === track) {
        this.el.duration.textContent = formatTime(track.duration);
      }
      if (!this.el.queueList) return;
      const item = Array.from(this.el.queueList.children).find(
        (element) => element.dataset.trackId === track.id
      );
      const time = item && item.querySelector(".queue-time");
      if (time) time.textContent = formatTime(track.duration);
    }

    syncProgress() {
      if (this.seeking) return;
      const d = this.getDuration();
      const current = this.audio.currentTime || 0;
      this.el.currentTime.textContent = formatTime(current);
      if (d > 0) {
        const pct = clamp(current / d, 0, 1);
        this.el.seek.value = String(Math.round(pct * 1000));
        this.setSeekVisual(pct * 100);
        this.el.duration.textContent = formatTime(d);
        this.updatePositionState(d, current);
      }
    }

    setSeekVisual(pct) {
      const p = clamp(pct, 0, 100);
      this.el.seekFill.style.width = p + "%";
      this.el.seekThumb.style.left = p + "%";
    }

    updatePlayUI(playing) {
      this.el.playBtn.classList.toggle("is-playing", playing);
      this.el.playBtn.setAttribute("aria-label", playing ? "暂停" : "播放");
    }

    setStatus(mode) {
      const labels = {
        standby: "SESSION STANDBY",
        playing: "NOW PLAYING",
        paused: "PAUSED",
        ended: "QUEUE COMPLETE",
        buffering: "BUFFERING",
      };
      this.el.statusText.textContent = labels[mode] || labels.standby;
      this.el.livePip.classList.toggle("is-playing", mode === "playing");
      this.el.sessionReadout.classList.toggle("is-live", mode === "playing");
    }

    updateMediaSession(track) {
      if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || "Untitled",
          artist: track.artist || "Unknown artist",
          album: track.album || "PRISM",
          artwork: track.cover
            ? [{ src: new URL(track.cover, location.href).href, sizes: "1200x1200", type: "image/jpeg" }]
            : [],
        });
      } catch (_) {}
    }

    updateMediaSessionState(state) {
      if (!("mediaSession" in navigator)) return;
      try { navigator.mediaSession.playbackState = state; } catch (_) {}
    }

    updatePositionState(duration, position) {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: this.audio.playbackRate || 1,
          position: clamp(position, 0, duration),
        });
      } catch (_) {}
    }

    /* ---------- covers ---------- */
    escapeXml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    isBackgroundCover(url) {
      if (!url) return false;
      if (/assets[\\/]backgrounds[\\/]|^https:\/\/images\.unsplash\.com\//i.test(url)) return true;
      const pool = this.backgrounds && Array.isArray(this.backgrounds.pool) ? this.backgrounds.pool : [];
      return pool.some((item) => item.file === url);
    }

    fallbackCover(track) {
      if (track._fallbackCover) return track._fallbackCover;
      const palette = Array.isArray(track.palette) ? track.palette : [];
      const colorA = /^#[0-9a-f]{6}$/i.test(palette[0] || "") ? palette[0] : "#8ef4ff";
      const colorB = /^#[0-9a-f]{6}$/i.test(palette[1] || "") ? palette[1] : "#8a7dff";
      const title = this.escapeXml(String(track.title || "Untitled").slice(0, 32));
      const artist = this.escapeXml(String(track.artist || "Unknown artist").slice(0, 36));
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + colorA + '" stop-opacity=".34"/>' +
        '<stop offset="1" stop-color="' + colorB + '" stop-opacity=".12"/>' +
        "</linearGradient></defs>" +
        '<rect width="600" height="600" fill="#070d16"/>' +
        '<rect width="600" height="600" fill="url(#g)"/>' +
        '<circle cx="300" cy="264" r="158" fill="none" stroke="' + colorA + '" stroke-opacity=".22"/>' +
        '<circle cx="300" cy="264" r="112" fill="none" stroke="' + colorB + '" stroke-opacity=".2"/>' +
        '<circle cx="300" cy="264" r="3" fill="' + colorA + '" fill-opacity=".8"/>' +
        '<text x="42" y="62" fill="#e8f7ff" fill-opacity=".48" font-family="Arial, sans-serif" font-size="12" letter-spacing="5">PRISM</text>' +
        '<text x="42" y="512" fill="#f4f8ff" font-family="Arial, sans-serif" font-size="34" font-weight="600">' + title + "</text>" +
        '<text x="42" y="548" fill="#dbe8fa" fill-opacity=".52" font-family="Arial, sans-serif" font-size="16">' + artist + "</text>" +
        '<text x="42" y="574" fill="#dbe8fa" fill-opacity=".25" font-family="Arial, sans-serif" font-size="10" letter-spacing="2">NO EMBEDDED ARTWORK</text>' +
        "</svg>";
      track._fallbackCover = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      return track._fallbackCover;
    }

    unsplashCoverFallback(track) {
      const pool = (this.backgrounds && Array.isArray(this.backgrounds.pool) ? this.backgrounds.pool : []).filter(
        (item) => item && item.file && /assets[\\/]backgrounds[\\/]|^https:\/\/images\.unsplash\.com\//i.test(item.file)
      );
      if (!pool.length) return "";
      const key = String((track.artist || "") + "|" + (track.title || ""));
      let hash = 0;
      for (let index = 0; index < key.length; index += 1) {
        hash = (hash * 31 + key.charCodeAt(index)) | 0;
      }
      return pool[Math.abs(hash) % pool.length].file;
    }

    albumCoverForBackground(track) {
      const cover = track && track.cover;
      if (!cover || this.isBackgroundCover(cover)) return "";
      return cover;
    }

    setAlbumBackdrop(url) {
      const layers = this.albumBackdropLayers;
      if (!Array.isArray(layers) || layers.length < 2) return;
      const token = ++this.albumBackdropToken;
      if (!url) {
        layers.forEach((layer) => layer.classList.remove("is-active"));
        return;
      }
      const nextIndex = 1 - this.albumBackdropLayer;
      const next = layers[nextIndex];
      const current = layers[this.albumBackdropLayer];
      if (current && current.classList.contains("is-active") && current.dataset.cover === url) return;
      const apply = () => {
        if (token !== this.albumBackdropToken) return;
        next.style.backgroundImage = 'url("' + url.replace(/"/g, "%22") + '")';
        next.dataset.cover = url;
        void next.offsetWidth;
        next.classList.add("is-active");
        if (current) current.classList.remove("is-active");
        this.albumBackdropLayer = nextIndex;
      };
      if (next.dataset.cover === url) {
        apply();
        return;
      }
      const image = new Image();
      image.onload = apply;
      image.src = url;
    }

    applyAlbumBackdrop(track) {
      const url = this.albumBackdropOverride ? "" : this.albumCoverForBackground(track);
      this.setAlbumBackdrop(url);
    }

    nextBackground() {
      this.albumBackdropOverride = true;
      this.setAlbumBackdrop("");
      this.backgrounds.next({ toast: true });
    }

    coverFor(track) {
      if (!track) return "";
      if (this.coverMode === "unsplash") {
        const unsplash = this.unsplashCoverFallback(track);
        if (unsplash) return unsplash;
      }
      if (track.cover && !this.isBackgroundCover(track.cover)) return track.cover;
      if (this.coverMode === "fallback") {
        const unsplash = this.unsplashCoverFallback(track);
        if (unsplash) return unsplash;
      }
      return this.fallbackCover(track);
    }

    async hydrateCovers(tracks) {
      const desktop = window.prismDesktop;
      if (!desktop) return;
      const pending = (tracks || []).filter((track) => {
        if (!track || track.coverHydrated) return false;
        if (track.cover && !this.isBackgroundCover(track.cover)) {
          track.coverHydrated = true;
          return false;
        }
        if (track.cover && this.isBackgroundCover(track.cover)) track.cover = "";
        return Boolean(track.filePath || track.file);
      });
      if (!pending.length) return;
      pending.forEach((track) => {
        track.coverHydrated = true;
      });

      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const track = pending[cursor];
          cursor += 1;
          try {
            let result = null;
            if (track.filePath && typeof desktop.extractCover === "function") {
              result = await desktop.extractCover(track.filePath);
            } else if (track.file && typeof desktop.extractCoverBuffer === "function") {
              const data = await track.file.arrayBuffer();
              result = await desktop.extractCoverBuffer({ name: track.file.name, data });
            }
            if (result && result.ok && result.url) {
              track.cover = result.url;
              this.scheduleCoverRefresh();
            }
          } catch (_) {}
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    }

    scheduleCoverRefresh() {
      if (this.coverRefreshTimer) return;
      this.coverRefreshTimer = window.setTimeout(() => {
        this.coverRefreshTimer = 0;
        this.refreshQueueCovers();
        this.refreshDeckCover();
        this.refreshAlbumWallCovers();
        this.applyAlbumBackdrop(this.currentTrack);
      }, 140);
    }

    refreshQueueCovers() {
      if (!this.el.queueList) return;
      const items = this.el.queueList.children;
      this.tracks.forEach((track, index) => {
        const img = items[index] && items[index].querySelector(".queue-thumb");
        if (!img) return;
        const cover = this.coverFor(track);
        if (cover && img.getAttribute("src") !== cover) img.src = cover;
      });
    }

    refreshDeckCover() {
      if (!this.el.miniCover || !this.currentTrack) return;
      const cover = this.coverFor(this.currentTrack);
      if (cover && this.el.miniCover.getAttribute("src") !== cover) this.el.miniCover.src = cover;
    }

    refreshAlbumWallCovers() {
      if (!this.el.albumGrid || !this.albumWallOpen) return;
      const cards = this.el.albumGrid.querySelectorAll(".album-card");
      this.tracks.forEach((track, index) => {
        const img = cards[index] && cards[index].querySelector(".album-cover");
        if (!img) return;
        const cover = this.coverFor(track);
        if (cover && img.getAttribute("src") !== cover) img.src = cover;
      });
    }

    /* ---------- queue ---------- */
    renderQueue() {
      if (!this.el.queueList) return;
      this.el.queueList.innerHTML = "";
      const query = this.queueSearchQuery.trim().toLowerCase();
      let matched = 0;
      this.tracks.forEach((track, index) => {
        if (query) {
          const haystack = [
            track.title,
            track.artist,
            track.album,
            track.folder,
            track.filePath,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(query)) return;
        }
        matched += 1;
        const li = document.createElement("li");
        li.className = "queue-item" + (index === this.currentIndex ? " is-current" : "");
        li.dataset.index = String(index);
        li.tabIndex = 0;
        li.setAttribute("role", "button");
        li.setAttribute("aria-label", "播放 " + (track.title || "Untitled"));

        const num = document.createElement("span");
        num.className = "queue-num";
        num.textContent = index === this.currentIndex ? "▶" : pad2(index + 1);

        const img = document.createElement("img");
        img.className = "queue-thumb";
        img.src = this.coverFor(track);
        img.alt = "";
        img.loading = "lazy";
        img.draggable = false;

        const copy = document.createElement("div");
        copy.className = "queue-copy";
        const name = document.createElement("p");
        name.className = "queue-name";
        name.textContent = track.title || "Untitled";
        const artist = document.createElement("p");
        artist.className = "queue-artist";
        artist.textContent = track.artist || "Unknown artist";
        copy.appendChild(name);
        copy.appendChild(artist);

        if (index === this.currentIndex) {
          const eq = document.createElement("div");
          eq.className = "eq is-live";
          eq.innerHTML = "<i></i><i></i><i></i><i></i>";
          copy.appendChild(eq);
        }

        const time = document.createElement("span");
        time.className = "queue-time";
        time.textContent = track.duration ? formatTime(track.duration) : "--:--";
        li.dataset.trackId = track.id;

        li.appendChild(num);
        li.appendChild(img);
        li.appendChild(copy);
        li.appendChild(time);

        if (track.kind === "local") {
          const remove = document.createElement("button");
          remove.className = "remove-track";
          remove.type = "button";
          remove.setAttribute("aria-label", "从播放列表移除 " + (track.title || ""));
          remove.innerHTML = '<svg><use href="#i-close"></use></svg>';
          remove.addEventListener("click", (e) => {
            e.stopPropagation();
            this.removeTrack(index);
          });
          li.appendChild(remove);
        }

        li.addEventListener("click", () => {
          if (index === this.currentIndex) {
            if (this.audio.paused) this.play();
            else this.pause();
          } else {
            this.selectTrack(index, { autoplay: true });
          }
          if (window.innerWidth < 720) this.toggleQueue(false);
        });
        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            li.click();
          }
        });

        this.el.queueList.appendChild(li);
      });
      if (!matched) {
        const empty = document.createElement("li");
        empty.className = "queue-empty";
        empty.textContent = "没有找到匹配的歌曲\n换个歌名、歌手或专辑试试";
        empty.style.whiteSpace = "pre-line";
        this.el.queueList.appendChild(empty);
      }
      this.el.queueCount.textContent = query
        ? matched + " / " + this.tracks.length + " 首"
        : this.tracks.length + " 首";
      if (this.el.queueSearchClear) this.el.queueSearchClear.hidden = !query;
      this.el.trackTotal.textContent = pad2(this.tracks.length);
      this.el.trackIndex.textContent = pad2(this.currentIndex + 1);
      if (this.albumWallOpen) this.renderAlbumWall();
    }

    clearQueueSearch() {
      this.queueSearchQuery = "";
      if (this.el.queueSearch) {
        this.el.queueSearch.value = "";
        this.el.queueSearch.focus();
      }
      this.renderQueue();
    }

    toggleQueue(force) {
      const open = typeof force === "boolean" ? force : !this.queueOpen;
      if (open) {
        if (this.settingsOpen) this.toggleSettings(false);
        if (this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
        if (this.todoEditorOpen) this.closeTodoEditor();
      }
      this.queueOpen = open;
      this.el.queue.classList.toggle("is-open", open);
      this.el.scrim.classList.toggle("is-open", open);
      this.el.queue.setAttribute("aria-hidden", open ? "false" : "true");
      this.el.queueBtn.setAttribute("aria-label", open ? "关闭播放列表（Q）" : "打开播放列表（Q）");
      if (open) {
        this.el.queueBtn.classList.add("is-on");
        this.resetAppScroll();
        const current = this.el.queueList.querySelector(".is-current");
        if (current) this.scrollQueueItemIntoView(current, false);
      } else {
        this.el.queueBtn.classList.remove("is-on");
      }
      this.updateTodoVisibility();
    }

    resetAppScroll() {
      if (this.el.app) {
        this.el.app.scrollLeft = 0;
        this.el.app.scrollTop = 0;
      }
      const root = document.scrollingElement;
      if (root) {
        root.scrollLeft = 0;
        root.scrollTop = 0;
      }
    }

    scrollQueueItemIntoView(item, center) {
      if (!item) return;
      const list = this.el.queueList;
      if (!list) return;
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      let next = list.scrollTop;
      if (center) {
        next = top - (list.clientHeight - item.offsetHeight) / 2;
      } else if (top < list.scrollTop) {
        next = top;
      } else if (bottom > list.scrollTop + list.clientHeight) {
        next = bottom - list.clientHeight;
      }
      list.scrollTop = Math.max(0, Math.min(max, next));
    }

    removeTrack(index, opts = {}) {
      const track = this.tracks[index];
      if (!track || (track.kind !== "local" && !opts.allowBuiltIn)) return;
      const wasCurrent = index === this.currentIndex;
      const wasPlaying = !this.audio.paused;
      this.tracks.splice(index, 1);

      if (wasCurrent) {
        if (!this.tracks.length) {
          this.audio.pause();
          this.audio.removeAttribute("src");
          this.audio.load();
          this.currentIndex = 0;
          this.el.trackTitle.textContent = "No tracks";
          this.el.trackArtist.textContent = "Add some music";
          this.renderQueue();
          this.markPlaylistDirty();
          this.toast(opts.albumDelete ? "已从播放列表删除" : "已从播放列表移除", 1600);
          return;
        }
        this.currentIndex = Math.min(index, this.tracks.length - 1);
        this.selectTrack(this.currentIndex, { autoplay: wasPlaying });
      } else if (index < this.currentIndex) {
        this.currentIndex -= 1;
      }
      this.renderQueue();
      this.el.trackTotal.textContent = pad2(this.tracks.length);
      if (track.src.startsWith("blob:")) {
        window.setTimeout(() => {
          URL.revokeObjectURL(track.src);
          this.objectUrls.delete(track.src);
        }, 300);
      }
      this.markPlaylistDirty();
      this.toast(opts.albumDelete ? "已从播放列表删除" : "已从播放列表移除", 1600);
    }

    /* ---------- imports ---------- */
    isAudioFile(file) {
      if (!file) return false;
      if (file.type && file.type.startsWith("audio/")) return true;
      return /\.(mp3|wav|flac|m4a|aac|ogg|opus|oga|weba|webm|aiff|aif)$/i.test(file.name || "");
    }

    parseLocalName(filename, fallbackArtist = "LOCAL FILE") {
      const cleaned = String(filename || "Untitled")
        .replace(/\.[^.]+$/, "")
        .replace(/^\s*\d{1,3}[\s._-]+/, "");
      let artist = fallbackArtist || "LOCAL FILE";
      let title = cleaned;
      const parts = cleaned.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 3 && /^\d{1,3}$/.test(parts[0])) {
        artist = parts[1];
        title = parts.slice(2).join(" - ");
      } else if (parts.length >= 2) {
        artist = parts[0];
        title = parts.slice(1).join(" - ");
      }
      return { artist, title: title || cleaned };
    }

    importFiles(fileList) {
      const files = Array.from(fileList || []).filter((f) => this.isAudioFile(f));
      if (!files.length) {
        this.toast("没有找到可播放的音频文件", 2200);
        return;
      }
      this.dismissWelcome();
      this.entered = true;
      this.initAudio();
      const added = [];
      for (const file of files) {
        const { artist, title } = this.parseLocalName(file.name, "LOCAL FILE");
        const url = URL.createObjectURL(file);
        this.objectUrls.add(url);
        const track = {
          id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          kind: "local",
          title,
          artist,
          album: "LOCAL SESSION",
          src: url,
          cover: "",
          duration: 0,
          bpm: null,
          mood: "LOCAL SESSION",
          palette: ["#8ef4ff", "#ff9be2", "#ffd39a"],
          file,
        };
        this.tracks.push(track);
        added.push(track);
      }
      this.applyCachedDurations(added);
      this.renderQueue();
      this.toggleQueue(true);
      this.hydrateCovers(added);
      this.hydrateDurations(added);
      this.toast("已加入 " + added.length + " 首本地音乐", 2300);
      if (this.audio.paused) {
        const index = this.tracks.indexOf(added[0]);
        this.selectTrack(index, { autoplay: true });
      }
    }

    async importMusicFolder() {
      if (this.folderBusy) return;
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.pickMusicFolder !== "function") {
        // Browser fallback (development preview): webkitdirectory input.
        this.el.folderInput.click();
        return;
      }

      this.setFolderBusy(true);
      try {
        const result = await desktop.pickMusicFolder();
        if (!result || result.canceled) return;
        if (result.error) {
          this.toast(result.error, 3000);
          return;
        }
        this.importFolderResult(result);
      } catch (_) {
        this.toast("无法打开文件夹选择器", 3000);
      } finally {
        this.setFolderBusy(false);
      }
    }

    setFolderBusy(busy) {
      this.folderBusy = busy;
      this.el.folderBtn.disabled = busy;
      this.el.addFolder.disabled = busy;
      this.el.folderBtn.classList.toggle("is-busy", busy);
      const label = this.el.addFolder.querySelector("span");
      if (label) label.textContent = busy ? "扫描中…" : "导入文件夹";
      this.el.folderBtn.setAttribute("aria-busy", busy ? "true" : "false");
    }

    /* ---------- custom backgrounds ---------- */
    loadCustomBackgrounds() {
      try {
        const raw = JSON.parse(storeGet("prism.customBackgrounds", "[]"));
        if (!Array.isArray(raw)) return [];
        const seen = new Set();
        const items = [];
        for (const [index, item] of raw.slice(0, 10).entries()) {
          if (!item) continue;
          const url = String(item.url || item.file || "");
          const isLocal = /^file:/i.test(url);
          const isUnsplash = /^https:\/\/images\.unsplash\.com\//i.test(url);
          if ((!isLocal && !isUnsplash) || seen.has(url)) continue;
          seen.add(url);
          const name = String(item.name || "自定义背景 " + (index + 1)).slice(0, 80);
          const source = item.source === "unsplash" || isUnsplash ? "unsplash" : "local";
          items.push({
            id: url,
            name,
            path: String(item.path || ""),
            url,
            file: url,
            thumb: String(item.thumb || url),
            title: name,
            custom: true,
            source,
            credit: String(item.credit || "").slice(0, 80),
            creditUrl: String(item.creditUrl || ""),
            photoUrl: String(item.photoUrl || ""),
          });
        }
        return items;
      } catch (_) {
        return [];
      }
    }

    saveCustomBackgrounds() {
      storeSet(
        "prism.customBackgrounds",
        JSON.stringify(
          this.customBackgrounds.map((item) => ({
            name: item.name,
            path: item.path,
            url: item.url,
            thumb: item.thumb,
            source: item.source,
            credit: item.credit,
            creditUrl: item.creditUrl,
            photoUrl: item.photoUrl,
          }))
        )
      );
    }

    setBackgroundBusy(busy) {
      this.backgroundBusy = busy;
      const full = this.customBackgrounds.length >= 10;
      this.el.importBg.disabled = busy || full;
      const label = this.el.importBg.querySelector("span");
      if (label) {
        label.textContent = busy ? "导入中…" : full ? "已满 10 张" : "导入图片";
      }
      this.el.importBg.setAttribute("aria-busy", busy ? "true" : "false");
    }

    async importCustomBackgrounds(debugPaths) {
      if (this.backgroundBusy) return;
      if (this.customBackgrounds.length >= 10) {
        this.toast("最多可导入 10 张自定义背景", 2400);
        return;
      }
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.pickBackgroundImages !== "function") {
        this.toast("导入自定义背景仅在桌面版可用", 2600);
        return;
      }

      this.setBackgroundBusy(true);
      try {
        const result = await desktop.pickBackgroundImages(debugPaths);
        if (!result || result.canceled) return;
        if (result.error) {
          this.toast(result.error, 3000);
          return;
        }

        const images = Array.isArray(result.images) ? result.images : [];
        const added = [];
        let duplicates = 0;
        let overflow = 0;

        for (const image of images) {
          if (this.customBackgrounds.length >= 10) {
            overflow += 1;
            continue;
          }
          const url = String((image && image.url) || "");
          if (!/^file:/i.test(url)) continue;
          if (this.customBackgrounds.some((item) => item.url === url)) {
            duplicates += 1;
            continue;
          }
          const name = String((image && image.name) || "自定义背景").slice(0, 80);
          const entry = {
            id: url,
            name,
            path: String((image && image.path) || ""),
            url,
            file: url,
            title: name,
            custom: true,
            source: "local",
            thumb: url,
            credit: "",
            creditUrl: "",
            photoUrl: "",
          };
          this.customBackgrounds.push(entry);
          added.push(entry);
        }

        if (added.length) {
          this.saveCustomBackgrounds();
          this.albumBackdropOverride = true;
          this.setAlbumBackdrop("");
          this.backgrounds.refreshCustom(added[0].url);
          this.renderCustomBackgrounds();
          let message = "已导入 " + added.length + " 张自定义背景 · 已加入背景轮换";
          if (duplicates) message += " · 跳过 " + duplicates + " 张重复";
          if (overflow) message += " · 已达 10 张上限";
          this.toast(message, 3400);
        } else if (overflow) {
          this.toast("最多可导入 10 张自定义背景", 2400);
        } else if (duplicates) {
          this.toast("这些图片已经在自定义背景中", 2400);
        } else {
          this.toast("没有找到可用的图片", 2400);
        }
      } catch (_) {
        this.toast("导入自定义背景失败", 2600);
      } finally {
        this.setBackgroundBusy(false);
        this.renderCustomBackgrounds();
      }
    }

    setUnsplashBusy(busy) {
      this.unsplashBusy = busy;
      this.el.unsplashSearch.disabled = busy;
      this.el.unsplashSearch.textContent = busy ? "检索中…" : "随机添加";
    }

    setUnsplashStatus(text, isError = false) {
      if (!this.el.unsplashStatus) return;
      this.el.unsplashStatus.textContent = text;
      this.el.unsplashStatus.classList.toggle("is-error", isError === true);
    }

    showUnsplashCredit(entry) {
      if (!this.el.unsplashCredit) return;
      const show = entry && entry.source === "unsplash" && entry.credit;
      this.el.unsplashCredit.hidden = !show;
      this.el.unsplashCredit.textContent = "";
      if (!show) return;
      const link = document.createElement("a");
      link.href = entry.creditUrl || entry.photoUrl || "https://unsplash.com";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Photo by " + entry.credit + " on Unsplash";
      this.el.unsplashCredit.appendChild(link);
    }

    async searchUnsplash() {
      if (this.unsplashBusy) return;
      const accessKey = this.el.unsplashKey.value.trim();
      const query = this.el.unsplashQuery.value.trim();
      this.unsplashKey = accessKey;
      this.unsplashQuery = query;
      storeSet("prism.unsplashKey", accessKey);
      storeSet("prism.unsplashQuery", query);

      if (!accessKey) {
        this.setUnsplashStatus("请先填写 Unsplash Access Key", true);
        this.el.unsplashKey.focus();
        this.toast("请先填写 Unsplash Access Key", 2400);
        return;
      }
      if (!query) {
        this.setUnsplashStatus("请输入要检索的背景关键词", true);
        this.el.unsplashQuery.focus();
        return;
      }
      if (this.customBackgrounds.length >= 10) {
        this.setUnsplashStatus("自定义背景已达到 10 张上限", true);
        this.toast("先移除一张自定义背景，再添加新的", 2600);
        return;
      }
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.searchUnsplash !== "function") {
        this.setUnsplashStatus("在线检索仅在桌面版可用", true);
        return;
      }

      this.setUnsplashBusy(true);
      this.setUnsplashStatus("正在检索 Unsplash…");
      try {
        const result = await desktop.searchUnsplash({ accessKey, query });
        if (!result || !result.ok) {
          const message = (result && result.error) || "Unsplash 检索失败";
          this.setUnsplashStatus(message, true);
          this.toast(message, 3200);
          return;
        }
        this.addUnsplashBackground(result.photo);
      } catch (_) {
        this.setUnsplashStatus("无法连接 Unsplash，请检查网络", true);
        this.toast("无法连接 Unsplash，请检查网络", 3000);
      } finally {
        this.setUnsplashBusy(false);
      }
    }

    addUnsplashBackground(photo) {
      if (!photo || !/^https:\/\/images\.unsplash\.com\//i.test(photo.url || "")) {
        this.setUnsplashStatus("Unsplash 图片地址无效", true);
        return;
      }
      if (this.customBackgrounds.length >= 10) {
        this.setUnsplashStatus("自定义背景已达到 10 张上限", true);
        return;
      }
      if (this.customBackgrounds.some((item) => item.url === photo.url)) {
        this.setUnsplashStatus("这张背景已经在列表里了", true);
        this.toast("这张背景已经在列表里了", 2200);
        return;
      }
      const entry = {
        id: photo.url,
        name: photo.name || "Unsplash 背景",
        path: "",
        url: photo.url,
        file: photo.url,
        thumb: photo.thumb || photo.url,
        title: photo.name || "Unsplash 背景",
        custom: true,
        source: "unsplash",
        credit: photo.credit || "Unsplash 摄影师",
        creditUrl: photo.creditUrl || "https://unsplash.com",
        photoUrl: photo.photoUrl || "https://unsplash.com",
      };
      this.customBackgrounds.push(entry);
      this.saveCustomBackgrounds();
      this.albumBackdropOverride = true;
      this.setAlbumBackdrop("");
      this.backgrounds.refreshCustom(entry.url);
      this.renderCustomBackgrounds();
      this.showUnsplashCredit(entry);
      this.setUnsplashStatus("已添加 · " + entry.credit + " · 联网加载");
      this.toast("已添加 Unsplash 背景 · " + entry.credit, 3000);
    }

    removeCustomBackground(url) {
      const index = this.customBackgrounds.findIndex((item) => item.url === url);
      if (index < 0) return;
      this.customBackgrounds.splice(index, 1);
      this.saveCustomBackgrounds();
      this.backgrounds.refreshCustom();
      this.renderCustomBackgrounds();
      this.toast("已移除自定义背景", 1800);
    }

    useCustomBackground(url) {
      const entry = this.customBackgrounds.find((item) => item.url === url);
      if (entry) {
        this.albumBackdropOverride = true;
        this.setAlbumBackdrop("");
        this.backgrounds.showCustom(entry);
        this.showUnsplashCredit(entry);
      }
    }

    renderCustomBackgrounds() {
      if (!this.el.customBgGrid) return;
      const grid = this.el.customBgGrid;
      grid.innerHTML = "";
      const full = this.customBackgrounds.length >= 10;
      const label = this.el.importBg.querySelector("span");
      this.el.importBg.disabled = this.backgroundBusy || full;
      if (label) {
        label.textContent = this.backgroundBusy
          ? "导入中…"
          : full
            ? "已满 10 张"
            : "导入图片";
      }

      if (!this.customBackgrounds.length) {
        const empty = document.createElement("div");
        empty.className = "custom-bg-empty";
        empty.textContent = "还没有自定义背景";
        const hint = document.createElement("small");
        hint.textContent = "点击「导入图片」选择本地照片，或使用上方 Unsplash 检索";
        empty.appendChild(hint);
        grid.appendChild(empty);
        this.el.customBgHint.textContent =
          "支持 JPG / PNG / WebP / AVIF / GIF，最多 10 张；导入后会加入背景轮换。";
        this.showUnsplashCredit(null);
        return;
      }

      const current = this.backgrounds.current();
      for (const item of this.customBackgrounds) {
        const card = document.createElement("div");
        card.className = "custom-bg-thumb";
        if (current && current.custom && current.url === item.url) {
          card.classList.add("is-active");
        }

        const use = document.createElement("button");
        use.type = "button";
        use.className = "custom-bg-use";
        use.setAttribute("aria-label", "使用背景 " + item.name);
        use.title = "使用 " + item.name;

        const img = document.createElement("img");
        img.src = item.thumb || item.url;
        img.alt = item.name;
        img.loading = "lazy";
        img.addEventListener("error", () => card.classList.add("is-broken"));
        use.appendChild(img);
        use.addEventListener("click", () => this.useCustomBackground(item.url));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "custom-bg-remove";
        remove.setAttribute("aria-label", "移除背景 " + item.name);
        remove.title = "移除这张背景";
        remove.innerHTML = '<svg><use href="#i-close"></use></svg>';
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          this.removeCustomBackground(item.url);
        });

        card.appendChild(use);
        card.appendChild(remove);
        grid.appendChild(card);
      }

      this.el.customBgHint.textContent =
        "已添加 " + this.customBackgrounds.length + " / 10 张 · 点击缩略图立即使用";
      this.showUnsplashCredit(current && current.custom ? current : null);
    }


    importFolderResult(result, opts = {}) {
      const restore = opts.restore === true;
      const files = Array.isArray(result.files) ? result.files : [];
      const folderName = result.folderName || "音乐文件夹";
      if (!files.length) {
        if (!restore) this.toast("「" + folderName + "」中没有找到音乐文件", 3000);
        return { added: 0, skipped: 0 };
      }

      if (!restore) {
        this.dismissWelcome();
        this.entered = true;
        this.initAudio();
      }

      const known = new Set(this.tracks.map((track) => track.src));
      const added = [];
      let skipped = 0;

      for (const file of files) {
        if (!file || !file.url || known.has(file.url)) {
          skipped += 1;
          continue;
        }
        const relativeParts = String(file.folder || "")
          .split(/[\\/]+/)
          .filter(Boolean);
        const parent = relativeParts.length ? relativeParts[relativeParts.length - 1] : folderName;
        const { artist, title } = this.parseLocalName(file.name, parent);
        const track = {
          id: "folder-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
          kind: "local",
          title,
          artist,
          album: parent,
          src: file.url,
          cover: "",
          duration: 0,
          bpm: null,
          mood: "LOCAL FOLDER",
          palette: ["#8ef4ff", "#ff9be2", "#ffd39a"],
          filePath: file.path,
          folderPath: result.folder || null,
          folder: folderName,
          relativeFolder: file.folder || "",
        };
        known.add(file.url);
        this.tracks.push(track);
        added.push(track);
      }

      this.applyCachedDurations(added);
      this.renderQueue();
      this.hydrateCovers(added);
      this.hydrateDurations(added);
      if (restore) return { added: added.length, skipped };

      this.toggleQueue(true);

      if (!added.length) {
        this.toast(skipped ? "这些音乐已经在播放列表中" : "没有找到可播放的音乐文件", 2600);
        return { added: 0, skipped };
      }

      this.markPlaylistDirty();

      let message = "已从「" + folderName + "」导入 " + added.length + " 首音乐";
      if (skipped) message += " · 跳过 " + skipped + " 首重复";
      if (result.truncated) message += " · 仅扫描前 1000 首";
      this.toast(message, 4200);

      if (opts.autoplay !== false && this.audio.paused) {
        const index = this.tracks.indexOf(added[0]);
        this.selectTrack(index, { autoplay: true });
      }

      const firstNew = this.el.queueList.children[this.tracks.indexOf(added[0])];
      if (firstNew) {
        window.setTimeout(() => this.scrollQueueItemIntoView(firstNew, true), 220);
      }
      return { added: added.length, skipped };
    }

    setSaveState(text, tone = "") {
      if (!this.el.saveState) return;
      this.el.saveState.textContent = text;
      this.el.saveState.classList.remove("is-dirty", "is-saved", "is-busy");
      if (tone) this.el.saveState.classList.add("is-" + tone);
    }

    markPlaylistDirty() {
      if (this.restoringPlaylist) return;
      this.setSaveState("有未保存更改", "dirty");
    }

    async saveCurrentPlaylist() {
      if (this.saveBusy) return;
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.savePlaylist !== "function") {
        this.toast("保存播放列表功能仅在桌面版可用", 2600);
        return;
      }

      const folders = [...new Set(
        this.tracks
          .filter((track) => track.kind === "local" && track.folderPath)
          .map((track) => track.folderPath)
      )];

      this.saveBusy = true;
      this.el.savePlaylist.disabled = true;
      this.el.savePlaylist.setAttribute("aria-busy", "true");
      this.setSaveState("保存中…", "busy");

      try {
        const result = await desktop.savePlaylist({ folders });
        if (!result || !result.ok) {
          this.setSaveState("保存失败", "dirty");
          this.toast("保存失败，请重试", 2600);
          return;
        }
        if (folders.length) {
          this.setSaveState("已保存 " + folders.length + " 个文件夹", "saved");
          this.toast("已保存 " + folders.length + " 个音乐文件夹 · 下次打开自动恢复", 3400);
        } else {
          this.setSaveState("已保存 · 无文件夹", "saved");
          this.toast("当前播放列表里没有可保存的音乐文件夹", 3000);
        }
      } catch (_) {
        this.setSaveState("保存失败", "dirty");
        this.toast("保存失败，请重试", 2600);
      } finally {
        this.saveBusy = false;
        this.el.savePlaylist.disabled = false;
        this.el.savePlaylist.setAttribute("aria-busy", "false");
      }
    }

    async restoreSavedPlaylist() {
      const desktop = window.prismDesktop;
      if (!desktop || typeof desktop.restorePlaylist !== "function") {
        this.setSaveState("桌面版可保存");
        return;
      }

      this.restoringPlaylist = true;
      this.setSaveState("正在恢复…", "busy");
      try {
        const result = await desktop.restorePlaylist();
        if (!result || !result.ok) {
          this.setSaveState("恢复失败", "dirty");
          return;
        }
        if (!result.saved) {
          this.setSaveState("未保存");
          return;
        }

        let added = 0;
        let skipped = 0;
        for (const folder of result.folders || []) {
          const item = this.importFolderResult(folder, { restore: true });
          added += item.added;
          skipped += item.skipped;
        }

        const missing = Array.isArray(result.missingFolders) ? result.missingFolders.length : 0;
        if (added) {
          this.setSaveState(
            missing ? "已恢复 " + added + " 首 · 缺 " + missing + " 个" : "已恢复 " + added + " 首",
            "saved"
          );
          this.toast(
            "已恢复上次播放列表 · " + added + " 首音乐" +
              (missing ? " · " + missing + " 个文件夹不可用" : ""),
            3400
          );
        } else if (missing) {
          this.setSaveState("保存的文件夹不可用", "dirty");
          this.toast("有 " + missing + " 个保存的音乐文件夹不可用", 3400);
        } else if (skipped) {
          this.setSaveState("已恢复上次列表", "saved");
        } else {
          this.setSaveState("已保存 · 无歌曲", "saved");
        }
      } catch (_) {
        this.setSaveState("恢复失败", "dirty");
      } finally {
        this.restoringPlaylist = false;
      }
    }

    onDragEnter(e) {
      if (!this.hasFiles(e)) return;
      e.preventDefault();
      this.dragDepth += 1;
      this.el.dropOverlay.classList.add("is-active");
      this.el.dropOverlay.setAttribute("aria-hidden", "false");
    }

    onDragLeave(e) {
      if (!this.el.dropOverlay.classList.contains("is-active")) return;
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) {
        this.el.dropOverlay.classList.remove("is-active");
        this.el.dropOverlay.setAttribute("aria-hidden", "true");
      }
    }

    onDrop(e) {
      if (!this.hasFiles(e)) return;
      e.preventDefault();
      this.dragDepth = 0;
      this.el.dropOverlay.classList.remove("is-active");
      this.el.dropOverlay.setAttribute("aria-hidden", "true");
      this.importFiles(e.dataTransfer.files);
    }

    hasFiles(e) {
      return !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files"));
    }

    /* ---------- misc ui ---------- */
    toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          this.toast("当前浏览器不允许进入全屏", 2200);
        });
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    syncFullscreenIcon() {
      const icon = this.el.fullscreenBtn.querySelector("use");
      const full = !!document.fullscreenElement;
      icon.setAttribute("href", full ? "#i-collapse" : "#i-expand");
      this.el.fullscreenBtn.setAttribute("aria-label", full ? "退出全屏（F）" : "全屏（F）");
      this.el.fullscreenBtn.setAttribute("data-tip", full ? "退出全屏 · F" : "全屏 · F");
    }

    toast(message, duration = 2200) {
      clearTimeout(this.toastTimer);
      this.el.toast.textContent = message;
      this.el.toast.classList.add("is-visible");
      this.toastTimer = window.setTimeout(() => {
        this.el.toast.classList.remove("is-visible");
      }, duration);
    }

    onKeydown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      const isField = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      const isButton = tag === "BUTTON";
      if (e.code === "Space" && !isField) {
        if (isButton || (e.target && e.target.tagName === "A")) return; // let the focused control handle Space
        e.preventDefault();
        if (this.welcomeOpen) this.enter();
        else this.togglePlay();
        return;
      }
      if (e.key === "Escape") {
        if (this.albumWallOpen) this.closeAlbumWall();
        else if (this.visualOnly) this.setVisualOnly(false);
        else if (this.uiScalePopOpen || this.fontColorPopOpen || this.lyricsPopOpen) this.closeVisualPopovers();
        else if (this.backgroundSettingsOpen) this.toggleBackgroundSettings(false);
        else if (this.settingsOpen) this.toggleSettings(false);
        else if (this.todoEditorOpen) this.closeTodoEditor();
        else if (this.todoVisible) this.setTodoVisible(false, { focus: false });
        else if (this.queueOpen) this.toggleQueue(false);
        return;
      }
      if (isField) return;
      if (e.key === "ArrowRight") { e.preventDefault(); this.seekBy(5); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); this.seekBy(-5); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this.setVolumeBy(0.05); }
      else if (e.key === "ArrowDown") { e.preventDefault(); this.setVolumeBy(-0.05); }
      else if (e.key === "m" || e.key === "M") this.toggleMute();
      else if (e.key === "b" || e.key === "B") this.nextBackground();
      else if (e.key === "s" || e.key === "S") this.toggleSettings();
      else if (e.key === "t" || e.key === "T") this.setTodoVisible(!this.todoVisible, { focus: true });
      else if (e.key === "l" || e.key === "L") this.setLyricsVisible(!this.lyricsSettings.visible);
      else if (e.key === "h" || e.key === "H") this.setVisualOnly(!this.visualOnly);
      else if (e.key === "q" || e.key === "Q") this.toggleQueue();
      else if (e.key === "3") this.setSphereEnabled(!this.sphereSettings.enabled);
      else if (e.key === "f" || e.key === "F") this.toggleFullscreen();
      else if (e.key === "n" || e.key === "N") this.next();
      else if (e.key === "p" || e.key === "P") this.previous();
    }

    setVolumeBy(delta) {
      const next = clamp(this.audio.volume + delta, 0, 1);
      this.audio.muted = false;
      this.audio.volume = next;
      this.lastVolume = next || this.lastVolume;
      storeSet("prism.volume", String(next));
      this.applyVolumeUI();
      this.toast("音量 " + Math.round(next * 100) + "%", 1200);
    }
  }

  window.PRISM = window.PRISM || {};
  window.PRISM.COLOR_HUNT_PALETTES = COLOR_HUNT_PALETTES;

  function boot() {
    if (!DATA.backgrounds || !DATA.backgrounds.length) {
      document.body.innerHTML = '<div class="noscript">背景素材缺失，请确认 assets/backgrounds 目录完整。</div>';
      return;
    }
    window.PRISM = window.PRISM || {};
    window.PRISM.player = new Player();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
