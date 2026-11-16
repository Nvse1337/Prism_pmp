"use strict";

/* Lyrics lookup used by the main process.
   LRCLIB is the primary source (official API, no key). When it has no
   synced lyrics we also query NetEase Cloud Music, which has much better
   coverage for Chinese songs. Both results are scored by title, artist and
   duration before a match is accepted. */

const LRCLIB_SEARCH = "https://lrclib.net/api/search";
const NETEASE_SEARCH = "https://music.163.com/api/search/get/web";
const NETEASE_LYRIC = "https://music.163.com/api/song/lyric";
const LRCLIB_UA = "PRISM/1.3 (https://github.com/Nvse1337/Prism_pmp)";
const NETEASE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function neteaseHeaders() {
  const octet = () => 1 + Math.floor(Math.random() * 254);
  const ip = "118." + octet() + "." + octet() + "." + octet();
  return {
    "User-Agent": NETEASE_UA,
    Referer: "https://music.163.com/",
    Accept: "application/json, text/plain, */*",
    // NetEase's public web API intermittently answers code 406 without a
    // forwarded address; rotating these headers keeps anonymous search usable.
    "X-Real-IP": ip,
    "X-Forwarded-For": ip,
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDecorations(value) {
  return String(value || "")
    .replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|wma)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-._、)]\s*/, "")
    .replace(/_+/g, " ")
    .replace(
      /\((?:explicit|official(?:\s+video)?|lyric(?:s)?|audio|mv|live|remaster(?:ed)?|hq|hi[- ]?res)[^)]*\)/gi,
      " "
    )
    .replace(
      /\[(?:explicit|official|lyric(?:s)?|audio|mv|live|remaster(?:ed)?|hq|hi[- ]?res)[^\]]*\]/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function stripBrackets(value) {
  return String(value || "")
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseArtist(value) {
  return String(value || "")
    .replace(/_+/g, " ")
    .split(/\s*(?:feat\.?|ft\.?|,|、|&|\/|\+|;)\s*/i)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeArtist(value) {
  const artist = String(value || "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!artist) return "";
  return /^(unknown artist|unknown|various artists|va|群星|未知艺术家|未知歌手|未知)$/i.test(artist)
    ? ""
    : artist;
}

function uniqueBy(list, keyOf) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildQueries(title, artist) {
  const rawTitle = String(title || "").trim();
  const rawArtist = sanitizeArtist(artist);
  const cleanTitle = stripDecorations(rawTitle) || rawTitle;
  const shortTitle = stripBrackets(cleanTitle) || cleanTitle;
  const cleanArtist = stripDecorations(rawArtist);
  const shortArtist = baseArtist(cleanArtist) || cleanArtist;

  const queries = [];
  const add = (track, artistName) => {
    const t = String(track || "").trim();
    const a = String(artistName || "").trim();
    if (t) queries.push({ title: t, artist: a });
  };

  if (rawArtist) add(rawTitle, rawArtist);
  add(cleanTitle, shortArtist);
  if (rawArtist) add(cleanTitle, "");
  add(shortTitle, shortArtist);
  if (rawArtist) add(shortTitle, "");
  return uniqueBy(queries, (q) => normalize(q.title) + "|" + normalize(q.artist)).slice(0, 4);
}

async function fetchJson(url, options, timeoutMs) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs || 12000),
  });
  if (!response.ok) {
    const error = new Error("HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function scoreItem(item, titleKey, artistKey, duration) {
  const itemTitle = normalize(item.trackName);
  const itemArtist = normalize(item.artistName);
  if (!itemTitle) return -100;
  let score = 0;
  if (itemTitle === titleKey) score += 14;
  else if (titleKey && (itemTitle.includes(titleKey) || titleKey.includes(itemTitle))) score += 7;
  else return -100;

  if (artistKey) {
    if (itemArtist === artistKey) score += 9;
    else if (itemArtist && (itemArtist.includes(artistKey) || artistKey.includes(itemArtist))) score += 4;
    else if (itemArtist) score -= 3;
  }

  if (duration > 0 && Number(item.duration) > 0) {
    score += Math.max(0, 6 - Math.abs(Number(item.duration) - duration) / 4);
  }
  if (item.syncedLyrics) score += 5;
  return score;
}

function pickCandidate(items, titleKey, artistKey, duration) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const score = scoreItem(item, titleKey, artistKey, duration);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best ? { item: best, score: bestScore } : null;
}

function dedupeLrclib(items) {
  return uniqueBy(items, (item) => {
    const id = item && item.id;
    if (id != null) return "id:" + id;
    return [
      normalize(item.trackName),
      normalize(item.artistName),
      Math.round(Number(item.duration) || 0),
    ].join("|");
  });
}

async function searchLrclib(queries) {
  const requests = queries.map(async (query) => {
    const params = new URLSearchParams({ track_name: query.title });
    if (query.artist) params.set("artist_name", query.artist);
    const data = await fetchJson(
      LRCLIB_SEARCH + "?" + params.toString(),
      {
        headers: {
          Accept: "application/json",
          "User-Agent": LRCLIB_UA,
        },
      },
      12000
    );
    return Array.isArray(data) ? data : [];
  });

  const settled = await Promise.allSettled(requests);
  const items = [];
  let anyOk = false;
  let lastError = null;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      anyOk = true;
      items.push(...result.value);
    } else {
      const error = result.reason || {};
      if (error.status === 429) lastError = "歌词搜索请求过多，请稍后再试";
      else lastError = "无法连接歌词服务，请检查网络";
    }
  }
  return { items: dedupeLrclib(items), anyOk, error: lastError };
}

function neteaseSongToItem(song) {
  const artists = Array.isArray(song.artists)
    ? song.artists.map((artist) => artist && artist.name).filter(Boolean)
    : [];
  return {
    id: song.id,
    trackName: String(song.name || ""),
    artistName: artists.join(" / "),
    albumName: song.album && song.album.name ? String(song.album.name) : "",
    duration: Number(song.duration) > 0 ? Number(song.duration) / 1000 : 0,
    syncedLyrics: "",
    plainLyrics: "",
    source: "网易云音乐",
  };
}

async function searchNeteaseSongs(title, artist) {
  const queries = [];
  const add = (query) => {
    const value = String(query || "").replace(/\s+/g, " ").trim();
    if (value) queries.push(value);
  };
  if (artist) add(title + " " + artist);
  add(title);
  add(stripBrackets(stripDecorations(title)) + " " + baseArtist(stripDecorations(artist)));
  const uniqueQueries = uniqueBy(queries, (query) => normalize(query)).slice(0, 3);

  const requests = uniqueQueries.map(async (query) => {
    const params = new URLSearchParams({
      csrf_token: "",
      s: query,
      type: "1",
      offset: "0",
      total: "true",
      limit: "20",
    });
    const data = await fetchJson(
      NETEASE_SEARCH + "?" + params.toString(),
      { headers: neteaseHeaders() },
      12000
    );
    const songs = data && data.result && data.result.songs;
    return Array.isArray(songs) ? songs.map(neteaseSongToItem) : [];
  });

  const settled = await Promise.allSettled(requests);
  const items = [];
  let anyOk = false;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      anyOk = true;
      items.push(...result.value);
    }
  }
  return {
    items: uniqueBy(items, (item) => "id:" + item.id),
    anyOk,
  };
}

const LRC_LINE_RE = /^\s*\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
const CREDIT_RE =
  /^\s*(?:作词|作曲|编曲|制作人?|出品人?|监制|混音|录音|和声|合声|吉他|贝斯|鼓|键盘|弦乐|母带|统筹|企划|发行|策划|封面|文案|词|曲|演唱|原唱|翻唱|OP|SP)[^:：]{0,10}\s*[:：]/i;

/* NetEase synced lyrics usually start with tagged credits ("作词 : …",
   "作曲 : …", the title line, etc.). Those lines are valid LRC but make the
   actual lyrics start many seconds late, so drop them before importing. */
function cleanSyncedLyrics(text, titleKey, artistKey) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const match = LRC_LINE_RE.exec(raw);
    if (!match) continue;
    const content = String(match[4] || "").trim();
    if (!content) continue;
    if (CREDIT_RE.test(content)) continue;
    const contentKey = normalize(content);
    if (out.length < 3 && titleKey && artistKey && contentKey.includes(titleKey) && contentKey.includes(artistKey)) {
      continue;
    }
    out.push(raw.trim());
  }
  return out.join("\n");
}

async function fetchNeteaseLyric(id, titleKey, artistKey) {
  const params = new URLSearchParams({ id: String(id), lv: "-1", kv: "-1", tv: "-1" });
  const data = await fetchJson(
    NETEASE_LYRIC + "?" + params.toString(),
    { headers: neteaseHeaders() },
    12000
  );
  if (!data || data.nolyric === true || data.uncollected === true) return "";
  const lyric = String((data.lrc && data.lrc.lyric) || "");
  if (!/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(lyric)) return "";
  const cleaned = cleanSyncedLyrics(lyric, titleKey, artistKey);
  if (!cleaned) return "";
  const words = cleaned.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  if (!words || /^纯音乐|instrumental/i.test(words)) return "";
  return cleaned;
}

function artistMatches(itemArtist, artistKey) {
  if (!artistKey) return true;
  const value = normalize(itemArtist);
  if (!value) return false;
  return value === artistKey || value.includes(artistKey) || artistKey.includes(value);
}

async function pickNeteaseResult(items, duration, titleKey, artistKey) {
  if (!items.length) return null;
  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, titleKey, artistKey, duration) }))
    .filter((entry) => {
      if (!artistMatches(entry.item.artistName, artistKey)) return false;
      return entry.score > -50;
    })
    .sort((a, b) => b.score - a.score);

  for (const entry of ranked.slice(0, 4)) {
    try {
      const lyric = await fetchNeteaseLyric(entry.item.id, titleKey, artistKey);
      if (!lyric) continue;
      return {
        trackName: entry.item.trackName.slice(0, 120),
        artistName: entry.item.artistName.slice(0, 100),
        albumName: entry.item.albumName.slice(0, 120),
        duration: Math.round(entry.item.duration * 1000) / 1000,
        instrumental: false,
        syncedLyrics: lyric.slice(0, 1024 * 1024),
        plainLyrics: "",
        source: "网易云音乐",
      };
    } catch (_) {
      // Try the next candidate; a single blocked lyric should not abort.
    }
  }
  return null;
}

async function searchNetease(title, artist, duration, titleKey, artistKey) {
  const search = await searchNeteaseSongs(title, artist);
  const result = await pickNeteaseResult(search.items, duration, titleKey, artistKey);
  return { result, anyOk: search.anyOk };
}

function lrclibResult(item) {
  return {
    trackName: String(item.trackName || "").slice(0, 120),
    artistName: String(item.artistName || "").slice(0, 100),
    albumName: String(item.albumName || "").slice(0, 120),
    duration: Number(item.duration) || 0,
    instrumental: item.instrumental === true,
    syncedLyrics: String(item.syncedLyrics || "").slice(0, 1024 * 1024),
    plainLyrics: String(item.plainLyrics || "").slice(0, 1024 * 1024),
    source: "LRCLIB",
  };
}

async function searchLyrics(payload) {
  const title = String((payload && payload.title) || "").trim().slice(0, 100);
  const artist = sanitizeArtist(String((payload && payload.artist) || "").trim().slice(0, 80));
  const duration = Number((payload && payload.duration) || 0);
  if (!title) {
    const error = new Error("请输入歌名");
    error.friendly = true;
    throw error;
  }

  const titleKey = normalize(title);
  const artistKey = normalize(artist);
  const queries = buildQueries(title, artist);

  // Search both services in parallel: LRCLIB for album-accurate matches and
  // NetEase for the large Chinese catalogue LRCLIB often misses.
  const [lrclib, neteaseSearch] = await Promise.all([
    searchLrclib(queries),
    searchNeteaseSongs(title, artist).catch(() => ({ items: [], anyOk: false })),
  ]);

  const lrPick = pickCandidate(lrclib.items, titleKey, artistKey, duration);
  const lrBest = lrPick ? lrPick.item : null;

  const neteaseResult = await pickNeteaseResult(
    neteaseSearch.items,
    duration,
    titleKey,
    artistKey
  );

  // For Chinese/Japanese/Korean tracks NetEase timings tend to match the
  // commonly circulated audio files better; use its cleaned LRC first.
  const hasCJK = /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(title + " " + artist);
  if (neteaseResult && hasCJK) return neteaseResult;

  // LRCLIB with synced lyrics for international tracks.
  if (lrBest && lrBest.syncedLyrics) return lrclibResult(lrBest);

  // Otherwise use NetEase lyrics when available.
  if (neteaseResult) return neteaseResult;

  if (lrBest) return lrclibResult(lrBest);
  if (!lrclib.anyOk && !neteaseSearch.anyOk) {
    const error = new Error(lrclib.error || "无法连接歌词服务，请检查网络");
    error.friendly = true;
    throw error;
  }
  return null;
}

module.exports = {
  searchLyrics,
  // exported for focused tests / debugging
  normalize,
  stripDecorations,
  buildQueries,
  sanitizeArtist,
  cleanSyncedLyrics,
};
