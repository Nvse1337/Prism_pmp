"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

const IMAGE_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

const SIDECAR_NAMES = [
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "cover.webp",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "front.jpg",
  "front.jpeg",
  "front.png",
  "album.jpg",
  "album.jpeg",
  "album.png",
  "AlbumArt.jpg",
  "AlbumArtSmall.jpg",
];

function sniffMime(data) {
  if (!data || data.length < 4) return "";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (data.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return "";
}

function normalizeMime(mime, data) {
  const normalized = String(mime || "").toLowerCase().split(";")[0].trim();
  if (IMAGE_MIME_TO_EXT[normalized]) return normalized;
  if (normalized === "image/jpg") return "image/jpeg";
  return sniffMime(data);
}

function extForMime(mime) {
  return IMAGE_MIME_TO_EXT[mime] || "jpg";
}

function flacPicture(data) {
  if (!data || data.length < 32) return null;
  let offset = 4;
  if (offset + 4 > data.length) return null;
  const mimeLength = data.readUInt32BE(offset);
  offset += 4;
  if (mimeLength > 200 || offset + mimeLength > data.length) return null;
  const mime = data.toString("utf8", offset, offset + mimeLength);
  offset += mimeLength;
  if (offset + 4 > data.length) return null;
  const descriptionLength = data.readUInt32BE(offset);
  offset += 4;
  if (offset + descriptionLength > data.length) return null;
  offset += descriptionLength;
  if (offset + 20 > data.length) return null;
  offset += 16;
  const pictureLength = data.readUInt32BE(offset);
  offset += 4;
  if (!pictureLength || offset + pictureLength > data.length) return null;
  const image = data.subarray(offset, offset + pictureLength);
  return { mime: normalizeMime(mime, image), data: image };
}

function vorbisComments(data, offset) {
  if (offset + 8 > data.length) return null;
  let cursor = offset;
  const vendorLength = data.readUInt32LE(cursor);
  cursor += 4;
  if (vendorLength > data.length || cursor + vendorLength > data.length) return null;
  cursor += vendorLength;
  if (cursor + 4 > data.length) return null;
  const count = data.readUInt32LE(cursor);
  cursor += 4;
  if (count > 1000) return null;

  let cover = null;
  let coverMime = "";
  for (let index = 0; index < count; index += 1) {
    if (cursor + 4 > data.length) break;
    const length = data.readUInt32LE(cursor);
    cursor += 4;
    if (length > 8 * 1024 * 1024 || cursor + length > data.length) break;
    const entry = data.toString("utf8", cursor, cursor + length);
    cursor += length;
    const eq = entry.indexOf("=");
    if (eq < 1) continue;
    const key = entry.slice(0, eq).toUpperCase();
    const value = entry.slice(eq + 1);
    if (key === "METADATA_BLOCK_PICTURE" && !cover) {
      try {
        const parsed = flacPicture(Buffer.from(value, "base64"));
        if (parsed) cover = parsed;
      } catch (_) {}
    } else if (key === "COVERART" && !cover) {
      try {
        const image = Buffer.from(value, "base64");
        if (image.length) cover = { mime: normalizeMime("", image), data: image };
      } catch (_) {}
    } else if (key === "COVERARTMIME") {
      coverMime = value;
    }
  }
  if (cover && !cover.mime && coverMime) cover.mime = normalizeMime(coverMime, cover.data);
  return cover;
}

function parseFlac(buffer) {
  if (buffer.length < 8 || buffer.toString("ascii", 0, 4) !== "fLaC") return null;
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer[offset];
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const length = buffer.readUIntBE(offset + 1, 3);
    const dataStart = offset + 4;
    if (dataStart + length > buffer.length) break;
    if (blockType === 6) {
      const picture = flacPicture(buffer.subarray(dataStart, dataStart + length));
      if (picture) return picture;
    } else if (blockType === 4) {
      const picture = vorbisComments(buffer, dataStart);
      if (picture) return picture;
    }
    offset = dataStart + length;
    if (isLast) break;
  }
  return null;
}

function oggComments(buffer) {
  if (buffer.length < 28 || buffer.toString("ascii", 0, 4) !== "OggS") return null;
  let offset = 0;
  const parts = [];
  let packetCount = 0;

  while (offset + 27 <= buffer.length && buffer.toString("ascii", offset, offset + 4) === "OggS") {
    const segmentCount = buffer[offset + 26];
    if (offset + 27 + segmentCount > buffer.length) break;
    let cursor = offset + 27 + segmentCount;
    for (let index = 0; index < segmentCount; index += 1) {
      const length = buffer[offset + 27 + index];
      if (cursor + length > buffer.length) return null;
      if (length > 0) parts.push(buffer.subarray(cursor, cursor + length));
      cursor += length;
      if (length < 255) {
        const packet = Buffer.concat(parts);
        parts.length = 0;
        packetCount += 1;
        if (packet.length > 7 && packet.toString("ascii", 0, 7) === "\x03vorbis") {
          const picture = vorbisComments(packet, 7);
          if (picture) return picture;
        } else if (packet.length > 8 && packet.toString("ascii", 0, 8) === "OpusTags") {
          const picture = vorbisComments(packet, 8);
          if (picture) return picture;
        }
        if (packetCount > 8) return null;
      }
    }
    offset = cursor;
  }
  return null;
}

function syncSafe(buffer, offset) {
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function id3Apic(buffer) {
  if (buffer.length < 10 || buffer.toString("ascii", 0, 3) !== "ID3") return null;
  const version = buffer[3];
  const flags = buffer[5];
  const tagSize = syncSafe(buffer, 6);
  const end = Math.min(buffer.length, 10 + tagSize);
  let offset = 10;
  if (flags & 0x40) {
    if (offset + 4 > end) return null;
    offset += 4 + (version === 4 ? syncSafe(buffer, offset) : buffer.readUInt32BE(offset));
  }

  const frameIdLength = version === 2 ? 3 : 4;
  const frameHeaderLength = version === 2 ? 6 : 10;

  while (offset + frameHeaderLength <= end) {
    const id = buffer.toString("ascii", offset, offset + frameIdLength);
    if (!id || id[0] === "\0") break;
    let frameSize;
    if (version === 2) {
      frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
    } else if (version === 4) {
      frameSize = syncSafe(buffer, offset + 4);
    } else {
      frameSize = buffer.readUInt32BE(offset + 4);
    }
    if (!frameSize || offset + frameHeaderLength + frameSize > end) break;
    const body = buffer.subarray(offset + frameHeaderLength, offset + frameHeaderLength + frameSize);
    if (id === "APIC" || id === "PIC") {
      const picture = id === "APIC" ? parseApic(body) : parsePic(body);
      if (picture) return picture;
    }
    offset += frameHeaderLength + frameSize;
  }
  return null;
}

function skipUntilNull(buffer, offset, encoding) {
  if (encoding === 1 || encoding === 2) {
    for (let index = offset; index + 1 < buffer.length; index += 2) {
      if (buffer[index] === 0 && buffer[index + 1] === 0) return index + 2;
    }
    return buffer.length;
  }
  const zero = buffer.indexOf(0, offset);
  return zero < 0 ? buffer.length : zero + 1;
}

function parseApic(body) {
  if (body.length < 4) return null;
  const encoding = body[0];
  const mimeEnd = body.indexOf(0, 1);
  if (mimeEnd < 0) return null;
  const mime = body.toString("latin1", 1, mimeEnd);
  let offset = mimeEnd + 1;
  if (offset >= body.length) return null;
  offset += 1;
  offset = skipUntilNull(body, offset, encoding);
  if (offset >= body.length) return null;
  const image = body.subarray(offset);
  return { mime: normalizeMime(mime, image), data: image };
}

function parsePic(body) {
  if (body.length < 6) return null;
  const encoding = body[0];
  const format = body.toString("ascii", 1, 4);
  let offset = 5;
  offset += 1;
  offset = skipUntilNull(body, offset, encoding);
  if (offset >= body.length) return null;
  const image = body.subarray(offset);
  return { mime: normalizeMime(format === "PNG" ? "image/png" : "image/jpeg", image), data: image };
}

function parseMp4(buffer) {
  const find = (start, end, depth) => {
    if (depth > 8) return null;
    let offset = start;
    while (offset + 8 <= end) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return null;
        size = Number(buffer.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return null;
      if (type === "covr") {
        let child = offset + header;
        while (child + 8 <= offset + size) {
          const childSize = buffer.readUInt32BE(child);
          const childType = buffer.toString("ascii", child + 4, child + 8);
          if (childType === "data" && childSize >= 16) {
            const image = buffer.subarray(child + 16, child + childSize);
            if (image.length) return { mime: normalizeMime("", image), data: image };
          }
          if (childSize < 8) break;
          child += childSize;
        }
      }
      if (["moov", "udta", "meta", "ilst"].includes(type)) {
        const nested = find(offset + header, offset + size, depth + 1);
        if (nested) return nested;
      }
      offset += size;
    }
    return null;
  };
  return find(0, buffer.length, 0);
}

function parseBuffer(buffer) {
  const direct = parseFlac(buffer) || oggComments(buffer) || id3Apic(buffer) || parseMp4(buffer);
  if (direct) return direct;
  const id3At = buffer.indexOf(Buffer.from("ID3"));
  if (id3At > 0 && id3At < 1024 * 1024) return id3Apic(buffer.subarray(id3At));
  return null;
}

async function readPrefix(filePath, maxBytes) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return { buffer, size: stat.size };
  } finally {
    await handle.close();
  }
}

async function findSidecar(filePath) {
  const directory = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const names = [base + ".jpg", base + ".jpeg", base + ".png", ...SIDECAR_NAMES];
  for (const name of names) {
    const candidate = path.join(directory, name);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && stat.size > 0) {
        const data = await fs.readFile(candidate);
        return { mime: normalizeMime("", data), data };
      }
    } catch (_) {}
  }
  return null;
}

async function writeCover(cacheDir, key, picture) {
  const mime = normalizeMime(picture.mime, picture.data);
  const extension = extForMime(mime);
  await fs.mkdir(cacheDir, { recursive: true });
  const target = path.join(cacheDir, key + "." + extension);
  try {
    await fs.access(target);
  } catch (_) {
    await fs.writeFile(target, picture.data);
  }
  return pathToFileURL(target).href;
}

async function cachedCover(cacheDir, key) {
  try {
    const entries = await fs.readdir(cacheDir);
    const name = entries.find((entry) => entry.startsWith(key + "."));
    if (name) return pathToFileURL(path.join(cacheDir, name)).href;
  } catch (_) {}
  return null;
}

async function extractCoverFromPath(filePath, cacheDir) {
  const stat = await fs.stat(filePath);
  const key = crypto
    .createHash("sha1")
    .update(filePath + "|" + stat.size + "|" + stat.mtimeMs)
    .digest("hex");
  const cached = await cachedCover(cacheDir, key);
  if (cached) return cached;

  let picture = parseBuffer((await readPrefix(filePath, 24 * 1024 * 1024)).buffer);
  if (!picture && stat.size > 24 * 1024 * 1024) {
    picture = parseBuffer(await fs.readFile(filePath));
  }
  if (!picture) picture = await findSidecar(filePath);
  if (!picture || !picture.data || !picture.data.length) return null;
  return writeCover(cacheDir, key, picture);
}

async function extractCoverFromBuffer(data, cacheDir) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (!buffer.length) return null;
  const key = "buffer-" + crypto.createHash("sha1").update(buffer).digest("hex");
  const cached = await cachedCover(cacheDir, key);
  if (cached) return cached;
  const picture = parseBuffer(buffer);
  if (!picture || !picture.data || !picture.data.length) return null;
  return writeCover(cacheDir, key, picture);
}

module.exports = {
  extractCoverFromPath,
  extractCoverFromBuffer,
  parseBuffer,
};
