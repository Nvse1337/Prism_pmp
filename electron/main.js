"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  shell,
  screen,
  ipcMain,
  dialog,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const covers = require("./covers");

app.setName("PRISM");
app.setAppUserModelId("com.prism.particleplayer");
const debugUserData = process.env.PRISM_DEBUG === "1" && process.env.PRISM_USER_DATA;
app.setPath(
  "userData",
  debugUserData ? path.resolve(debugUserData) : path.join(app.getPath("appData"), "PRISM")
);
nativeTheme.themeSource = "dark";
const PLAYLIST_FILE = path.join(app.getPath("userData"), "saved-playlist.json");
const COVER_CACHE_DIR = path.join(app.getPath("userData"), "covers");

if (process.env.PRISM_DEBUG === "1") {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.PRISM_DEBUG_PORT || "9333");
  app.commandLine.appendSwitch("remote-allow-origins", "*");
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".opus",
  ".weba",
  ".webm",
  ".aiff",
  ".aif",
]);
const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
]);
const SKIP_DIRS = new Set([
  "node_modules",
  "$RECYCLE.BIN",
  "System Volume Information",
  ".git",
  ".svn",
]);
const MAX_SCAN_FILES = 1000;
const MAX_SCAN_DEPTH = 10;

let mainWindow = null;

async function scanMusicFolder(root) {
  const files = [];
  let truncated = false;

  async function walk(dir, depth) {
    if (truncated || depth > MAX_SCAN_DEPTH) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    entries.sort((a, b) =>
      a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" })
    );

    for (const entry of entries) {
      if (truncated) return;
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (files.length >= MAX_SCAN_FILES) {
        truncated = true;
        return;
      }
      files.push({
        name: entry.name,
        path: full,
        url: pathToFileURL(full).href,
        folder: path.relative(root, dir),
      });
    }
  }

  await walk(root, 0);
  return { files, truncated };
}

ipcMain.handle("prism:pick-music-folder", async (event, debugPath) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { canceled: true, error: "unauthorized" };
  }

  let root;
  if (process.env.PRISM_DEBUG === "1" && typeof debugPath === "string" && debugPath.trim()) {
    root = path.resolve(debugPath);
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择包含音乐的文件夹",
      buttonLabel: "导入这个文件夹",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    root = result.filePaths[0];
  }

  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch (_) {
    return { canceled: false, error: "无法读取这个文件夹" };
  }

  const result = await scanMusicFolder(root);
  return {
    canceled: false,
    folder: root,
    folderName: path.basename(root) || root,
    files: result.files,
    truncated: result.truncated,
  };
});

ipcMain.handle("prism:pick-background-images", async (event, debugPaths) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { canceled: true, error: "unauthorized" };
  }

  let paths = [];
  if (
    process.env.PRISM_DEBUG === "1" &&
    Array.isArray(debugPaths) &&
    debugPaths.length
  ) {
    paths = debugPaths.filter((value) => typeof value === "string" && value.trim());
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入自定义背景",
      buttonLabel: "导入图片",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "图片",
          extensions: ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"],
        },
      ],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    paths = result.filePaths;
  }

  const images = [];
  const rejected = [];
  const seen = new Set();

  for (const value of paths) {
    const full = path.resolve(value);
    if (seen.has(full)) continue;
    seen.add(full);
    try {
      const stat = await fs.stat(full);
      const ext = path.extname(full).toLowerCase();
      if (!stat.isFile() || !IMAGE_EXTENSIONS.has(ext)) throw new Error("unsupported");
      images.push({
        name: path.basename(full),
        path: full,
        url: pathToFileURL(full).href,
      });
    } catch (_) {
      rejected.push(path.basename(full));
    }
  }

  return { canceled: false, images, rejected };
});

ipcMain.handle("prism:unsplash-search", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const accessKey = String((payload && payload.accessKey) || "").trim().slice(0, 200);
  const query = String((payload && payload.query) || "").trim().slice(0, 80);
  if (!accessKey) return { ok: false, error: "请先填写 Unsplash Access Key" };
  if (!query) return { ok: false, error: "请输入搜索关键词" };

  const params = new URLSearchParams({
    query,
    per_page: "30",
    page: "1",
    orientation: "landscape",
    content_filter: "high",
    client_id: accessKey,
  });

  let response;
  try {
    response = await fetch("https://api.unsplash.com/search/photos?" + params.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Version": "v1",
        "User-Agent": "PRISM/1.2 (Windows)",
      },
    });
  } catch (_) {
    return { ok: false, error: "无法连接 Unsplash，请检查网络" };
  }

  if (!response.ok) {
    if (response.status === 401) return { ok: false, error: "Unsplash Access Key 无效" };
    if (response.status === 403) return { ok: false, error: "Unsplash 请求额度不足或权限不足" };
    return { ok: false, error: "Unsplash 返回 HTTP " + response.status };
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    return { ok: false, error: "Unsplash 返回数据无法读取" };
  }
  const results = Array.isArray(data.results) ? data.results : [];
  if (!results.length) return { ok: false, error: "没有找到匹配的背景，换个关键词试试" };

  const photo = results[Math.floor(Math.random() * results.length)];
  if (!photo || !photo.urls || !/^https:\/\/images\.unsplash\.com\//i.test(photo.urls.regular || "")) {
    return { ok: false, error: "Unsplash 图片地址无效" };
  }

  try {
    const downloadUrl = new URL(photo.links.download_location);
    downloadUrl.searchParams.set("client_id", accessKey);
    fetch(downloadUrl, {
      headers: { "Accept-Version": "v1", "User-Agent": "PRISM/1.2 (Windows)" },
    }).catch(() => {});
  } catch (_) {}

  const creditName = (photo.user && photo.user.name) || "Unsplash 摄影师";
  const creditUrl =
    ((photo.user && photo.user.links && photo.user.links.html) || "https://unsplash.com") +
    "?utm_source=prism&utm_medium=referral";
  const photoUrl =
    (photo.links && photo.links.html ? photo.links.html : "https://unsplash.com") +
    "?utm_source=prism&utm_medium=referral";

  return {
    ok: true,
    photo: {
      id: String(photo.id || ""),
      name: String(photo.description || photo.alt_description || "Unsplash 背景").slice(0, 100),
      url: photo.urls.regular,
      thumb: photo.urls.small || photo.urls.regular,
      credit: String(creditName).slice(0, 80),
      creditUrl,
      photoUrl,
    },
  };
});

ipcMain.handle("prism:extract-cover", async (event, filePath) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const target = String(filePath || "");
  if (!target || !AUDIO_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    return { ok: false, error: "unsupported" };
  }
  try {
    const url = await covers.extractCoverFromPath(target, COVER_CACHE_DIR);
    return url ? { ok: true, url } : { ok: false, error: "no-cover" };
  } catch (_) {
    return { ok: false, error: "cover-failed" };
  }
});

ipcMain.handle("prism:extract-cover-buffer", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const name = String((payload && payload.name) || "");
  if (name && !AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    return { ok: false, error: "unsupported" };
  }
  const raw = payload && payload.data;
  if (!raw || (typeof raw.byteLength !== "number" && !ArrayBuffer.isView(raw))) {
    return { ok: false, error: "empty" };
  }
  if (raw.byteLength > 100 * 1024 * 1024) return { ok: false, error: "too-large" };
  try {
    const buffer = Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw);
    const url = await covers.extractCoverFromBuffer(buffer, COVER_CACHE_DIR);
    return url ? { ok: true, url } : { ok: false, error: "no-cover" };
  } catch (_) {
    return { ok: false, error: "cover-failed" };
  }
});

ipcMain.handle("prism:search-lyrics", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const title = String((payload && payload.title) || "").trim().slice(0, 100);
  const artist = String((payload && payload.artist) || "").trim().slice(0, 80);
  const duration = Number((payload && payload.duration) || 0);
  if (!title) return { ok: false, error: "请输入歌名" };

  const params = new URLSearchParams({ track_name: title });
  if (artist) params.set("artist_name", artist);

  let response;
  try {
    response = await fetch("https://lrclib.net/api/search?" + params.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PRISM/1.2 (https://github.com/Nvse1337/Prism_pmp)",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (_) {
    return { ok: false, error: "无法连接歌词服务，请检查网络" };
  }
  if (!response.ok) {
    if (response.status === 429) return { ok: false, error: "歌词搜索请求过多，请稍后再试" };
    return { ok: false, error: "歌词服务返回 HTTP " + response.status };
  }

  let results;
  try {
    results = await response.json();
  } catch (_) {
    return { ok: false, error: "歌词服务返回数据无法读取" };
  }
  if (!Array.isArray(results) || !results.length) return { ok: true, result: null };

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const scored = results
    .filter((item) => item && (item.syncedLyrics || item.plainLyrics || item.instrumental))
    .map((item) => {
      const itemTitle = normalize(item.trackName);
      const itemArtist = normalize(item.artistName);
      let score = 0;
      if (itemTitle === wantedTitle) score += 10;
      else if (itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle)) score += 5;
      if (wantedArtist) {
        if (itemArtist === wantedArtist) score += 8;
        else if (itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist)) score += 3;
      }
      if (item.syncedLyrics) score += 5;
      if (duration > 0 && Number.isFinite(Number(item.duration))) {
        score += Math.max(0, 4 - Math.abs(Number(item.duration) - duration) / 5);
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { ok: true, result: null };
  const best = scored[0].item;
  return {
    ok: true,
    result: {
      trackName: String(best.trackName || "").slice(0, 120),
      artistName: String(best.artistName || "").slice(0, 100),
      albumName: String(best.albumName || "").slice(0, 120),
      duration: Number(best.duration) || 0,
      instrumental: best.instrumental === true,
      syncedLyrics: String(best.syncedLyrics || "").slice(0, 1024 * 1024),
      plainLyrics: String(best.plainLyrics || "").slice(0, 1024 * 1024),
    },
  };
});

ipcMain.handle("prism:translate-lyrics", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const source = Array.isArray(payload && payload.lines)
    ? payload.lines.slice(0, 220).map((line) => String(line || "").slice(0, 500))
    : [];
  if (!source.length) return { ok: true, translations: [] };

  const translations = source.map(() => "");
  const indexes = [];
  for (let i = 0; i < source.length; i += 1) {
    const line = source[i].trim();
    if (!line) continue;
    if (/[\u3400-\u9fff]/.test(line)) continue;
    indexes.push(i);
  }
  if (!indexes.length) return { ok: true, translations, skipped: true };

  const chunks = [];
  let chunk = [];
  let chunkChars = 0;
  for (const index of indexes) {
    const line = source[index];
    if (chunk.length && chunkChars + line.length + 1 > 420) {
      chunks.push(chunk);
      chunk = [];
      chunkChars = 0;
    }
    chunk.push(index);
    chunkChars += line.length + 1;
  }
  if (chunk.length) chunks.push(chunk);

  const decodeEntities = (value) =>
    String(value || "")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

  for (const group of chunks) {
    const q = group.map((index) => source[index]).join("\n");
    const params = new URLSearchParams({ q, langpair: "en|zh-CN" });
    let response;
    try {
      response = await fetch("https://api.mymemory.translated.net/get?" + params.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "PRISM/1.2 (https://github.com/Nvse1337/Prism_pmp)",
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch (_) {
      return { ok: false, error: "无法连接翻译服务，请检查网络" };
    }
    if (!response.ok) return { ok: false, error: "翻译服务返回 HTTP " + response.status };
    let data;
    try {
      data = await response.json();
    } catch (_) {
      return { ok: false, error: "翻译服务返回数据无法读取" };
    }
    const status = Number(data && data.responseStatus);
    if (status !== 200 || data.quotaFinished) {
      const detail = data && data.responseDetails ? String(data.responseDetails) : "翻译额度不足或请求失败";
      return { ok: false, error: detail.slice(0, 160) };
    }
    const translated = decodeEntities(data.responseData && data.responseData.translatedText);
    const parts = translated.split(/\r?\n/);
    if (parts.length === group.length) {
      group.forEach((index, partIndex) => {
        translations[index] = parts[partIndex].trim();
      });
    } else {
      group.forEach((index, partIndex) => {
        translations[index] = partIndex === 0 ? translated.trim() : "";
      });
    }
  }
  return { ok: true, translations };
});

ipcMain.handle("prism:save-playlist", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, error: "unauthorized" };
  }
  const folders = Array.isArray(payload && payload.folders)
    ? payload.folders
        .filter((value) => typeof value === "string" && value.trim())
        .map((value) => path.resolve(value))
    : [];
  const unique = [...new Set(folders)];
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    folders: unique,
  };

  try {
    await fs.mkdir(path.dirname(PLAYLIST_FILE), { recursive: true });
    const temp = PLAYLIST_FILE + ".tmp";
    await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    try {
      await fs.rename(temp, PLAYLIST_FILE);
    } catch (_) {
      await fs.copyFile(temp, PLAYLIST_FILE);
      await fs.rm(temp, { force: true });
    }
    return { ok: true, count: unique.length, savedAt: data.savedAt };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
});

ipcMain.handle("prism:restore-playlist", async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { ok: false, saved: false, error: "unauthorized" };
  }

  let data;
  try {
    data = JSON.parse(await fs.readFile(PLAYLIST_FILE, "utf8"));
  } catch (_) {
    return { ok: true, saved: false, folders: [], missingFolders: [] };
  }

  const roots = Array.isArray(data.folders)
    ? [...new Set(data.folders.filter((value) => typeof value === "string" && value.trim()))]
    : [];
  const folders = [];
  const missingFolders = [];

  for (const root of roots) {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch (_) {
      missingFolders.push(root);
      continue;
    }
    const result = await scanMusicFolder(root);
    folders.push({
      folder: root,
      folderName: path.basename(root) || root,
      files: result.files,
      truncated: result.truncated,
    });
  }

  return {
    ok: true,
    saved: true,
    savedAt: data.savedAt || null,
    folders,
    missingFolders,
  };
});

function createWindow() {
  const iconPath = path.join(__dirname, "..", "assets", "prism.ico");
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(960, Math.min(1480, Math.round(area.width * 0.94)));
  const height = Math.max(640, Math.min(900, Math.round(area.height * 0.92)));
  mainWindow = new BrowserWindow({
    width,
    height,
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: "PRISM · 粒子音乐播放器",
    backgroundColor: "#05070d",
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  // Local file only. No localhost server, no browser tab, no address bar.
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current) event.preventDefault();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
