"""Generate three original ambient/electronica demo tracks and matching covers.

Everything is synthesized from scratch with numpy, so the bundled audio is
original and royalty-free. The result is intentionally wide-band: deep kicks
for the outer particle ring, airy hats and arps for the high-frequency core.
"""
from __future__ import annotations

import json
import math
import pathlib
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "audio"
COVERS = ROOT / "assets" / "covers"
SR = 44_100
rng = np.random.default_rng(42)

CHORDS = {
    "Am9": [55.00, 65.41, 82.41, 98.00, 123.47],
    "Dm9": [73.42, 87.31, 110.00, 130.81, 164.81],
    "Fmaj9": [43.65, 55.00, 65.41, 82.41, 98.00],
    "Cmaj9": [65.41, 82.41, 98.00, 123.47, 146.83],
    "G6/9": [98.00, 123.47, 146.83, 164.81, 220.00],
    "Em9": [82.41, 98.00, 123.47, 146.83, 164.81],
    "Bbmaj9": [58.27, 73.42, 87.31, 110.00, 130.81],
    "Abmaj9": [51.91, 65.41, 77.78, 98.00, 116.54],
}

TRACKS = [
    {
        "slug": "neon-bloom",
        "title": "Neon Bloom",
        "artist": "PRISM Sessions",
        "album": "Particle Studies",
        "bpm": 88,
        "bars": 24,
        "chords": ["Am9", "Fmaj9", "Cmaj9", "G6/9"],
        "brightness": 0.60,
        "seed": 7,
        "palette": ("#54e7ff", "#ff7ad9", "#ffd59a"),
        "tail": 5.0,
    },
    {
        "slug": "low-orbit",
        "title": "Low Orbit",
        "artist": "PRISM Sessions",
        "album": "Particle Studies",
        "bpm": 74,
        "bars": 20,
        "chords": ["Dm9", "Bbmaj9", "Fmaj9", "Am9"],
        "brightness": 0.42,
        "seed": 19,
        "palette": ("#79a7ff", "#c07bff", "#67ffe0"),
        "tail": 6.0,
    },
    {
        "slug": "glass-horizon",
        "title": "Glass Horizon",
        "artist": "PRISM Sessions",
        "album": "Particle Studies",
        "bpm": 98,
        "bars": 26,
        "chords": ["Fmaj9", "Cmaj9", "G6/9", "Am9"],
        "brightness": 0.72,
        "seed": 31,
        "palette": ("#ffd27a", "#ff8f6b", "#7ee8ff"),
        "tail": 4.0,
    },
]


def adsr(n: int, attack: float, release: float, curve: float = 2.0) -> np.ndarray:
    env = np.ones(n, dtype=np.float64)
    a = min(n, max(1, int(attack * SR)))
    r = min(n, max(1, int(release * SR)))
    env[:a] = np.linspace(0, 1, a) ** 0.65
    env[-r:] *= np.linspace(1, 0, r) ** curve
    return env


def band_saw(freq: float, n: int, harmonics: int, phase: float = 0.0) -> np.ndarray:
    """Additive, band-limited saw. Harmonics roll off for a softer top end."""
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for h in range(1, harmonics + 1):
        if freq * h > 15_000:
            break
        sig += np.sin(2 * np.pi * freq * h * t + phase * h) / (h ** 1.12)
    return sig


def place(dst: np.ndarray, sig: np.ndarray, start: float, gain: float = 1.0,
          pan: float = 0.0):
    i = int(start * SR)
    n_dst = dst.shape[-1]
    if i >= n_dst or i + len(sig) <= 0:
        return
    s = max(0, -i)
    e = min(len(sig), n_dst - i)
    if e <= s:
        return
    l_gain = gain * math.sqrt((1 - pan) * 0.5 + 0.5)
    r_gain = gain * math.sqrt((1 + pan) * 0.5 + 0.5)
    dst[0, i + s:i + e] += sig[s:e] * l_gain
    dst[1, i + s:i + e] += sig[s:e] * r_gain



def make_reverb_ir(seconds: float, decay: float, seed: int) -> np.ndarray:
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = r.standard_normal((2, n))
    # Gently low-pass the noise in the frequency domain. (A short moving
    # average would put a deep comb notch every SR/kernel Hz through the tail.)
    spec = np.fft.rfft(noise, axis=1)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    lowpass = 1.0 / (1.0 + (freqs / 5600.0) ** 2)
    noise = np.fft.irfft(spec * lowpass, n, axis=1)
    ir = noise * np.exp(-t * decay)
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir


def convolve_stereo(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = len(x[0]) + len(ir[0]) - 1
    size = 1 << (n - 1).bit_length()
    out = np.zeros((2, n))
    for ch in range(2):
        X = np.fft.rfft(x[ch], size)
        H = np.fft.rfft(ir[ch], size)
        out[ch] = np.fft.irfft(X * H, size)[:n]
    return out


def synth(track: dict) -> tuple[np.ndarray, np.ndarray, list[dict]]:
    seed = track["seed"]
    r = np.random.default_rng(seed)
    bpm = track["bpm"]
    beat = 60.0 / bpm
    bar = beat * 4
    bars = track["bars"]
    duration = bars * bar + track["tail"]
    n = int(duration * SR)
    t = np.arange(n) / SR
    channels = np.zeros((2, n))
    pad_bus = np.zeros((2, n))
    arp_bus = np.zeros((2, n))
    bass_bus = np.zeros((2, n))
    drum_bus = np.zeros((2, n))
    kick_env = np.zeros(n)

    progression = track["chords"]
    scale = [0, 2, 3, 5, 7, 10, 12, 14, 15, 19]
    root_midi = 57 if "Dm" not in progression[0] else 50

    # ---- Pads: two-bar chords, five voices, three detuned layers ----------
    for ci, chord_start in enumerate(range(0, bars, 2)):
        name = progression[ci % len(progression)]
        notes = CHORDS[name]
        start = chord_start * bar
        dur = bar * 2 + 0.9
        seg_n = int(dur * SR)
        env = adsr(seg_n, attack=0.85, release=1.2, curve=2.0)
        # slow filter opening over the phrase
        opening = 0.55 + 0.45 * np.sin(np.linspace(0, math.pi, seg_n)) ** 0.8
        for ni, freq in enumerate(notes):
            for di, det in enumerate((-0.0032, 0.0, 0.0038)):
                f = freq * (1 + det)
                harmonics = max(3, int(5 + track["brightness"] * 9 - ni))
                sig = band_saw(f, seg_n, harmonics, phase=r.random() * 6.28)
                sig *= env * opening * (0.17 / (1 + ni * 0.22))
                place(pad_bus, sig, start, gain=0.75, pan=(ni - 2) * 0.12 + det * 18 + di * 0.04)

    # ---- Sub bass: root movement in eighths, locked to the kick ----------
    for bar_i in range(bars):
        name = progression[(bar_i // 2) % len(progression)]
        root = CHORDS[name][0] / 2
        if bar_i < 4:
            pattern = [(0, 2.0, 1.0)]
        else:
            pattern = [(0, 0.85, 1.0), (1.5, 0.45, 0.82), (2.5, 0.55, 0.9), (3.5, 0.35, 0.7)]
        for step, length, vel in pattern:
            start = bar_i * bar + step * beat
            seg_n = int(length * beat * SR)
            env = adsr(seg_n, 0.008, 0.13, curve=1.6)
            tt = np.arange(seg_n) / SR
            sig = (
                np.sin(2 * np.pi * root * tt)
                + 0.32 * np.sin(2 * np.pi * root * 2 * tt)
                + 0.12 * np.sin(2 * np.pi * root * 3 * tt)
            ) * env * vel
            place(bass_bus, sig, start, gain=0.55, pan=0)

    # ---- Kick: four on the floor after the intro ------------------------
    for bar_i in range(bars):
        active = bar_i >= 4
        if not active:
            continue
        for b in range(4):
            start = bar_i * bar + b * beat
            seg_n = int(0.55 * SR)
            tt = np.arange(seg_n) / SR
            freq = 48 + 95 * np.exp(-tt * 26)
            phase = 2 * np.pi * np.cumsum(freq) / SR
            sig = np.sin(phase) * np.exp(-tt * 9.0)
            click = r.standard_normal(seg_n) * np.exp(-tt * 95) * 0.10
            sig += click
            place(drum_bus, sig, start, gain=0.88, pan=0)
            # sidechain envelope (not the audible kick)
            k_env = np.exp(-tt * 6.5)
            i = int(start * SR)
            kick_env[i:i + seg_n] += k_env[: max(0, min(seg_n, n - i))]

    # ---- Clap / snare on 2 and 4 ---------------------------------------
    for bar_i in range(4, bars):
        for b in (1, 3):
            start = bar_i * bar + b * beat
            seg_n = int(0.36 * SR)
            tt = np.arange(seg_n) / SR
            noise = r.standard_normal(seg_n)
            # cheap band emphasis: subtract smoothed low end
            smooth = np.convolve(noise, np.ones(5) / 5, mode="same")
            sig = (noise - 0.7 * smooth) * np.exp(-tt * 16) * 0.30
            sig += np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30) * 0.20
            place(drum_bus, sig, start, gain=0.58, pan=0.06)

    # ---- Hats: off-beat eighths with air ---------------------------------
    for bar_i in range(2, bars):
        density = 2 if bar_i < 8 else 4
        for step in range(8 * density):
            start = bar_i * bar + step * (beat / density)
            seg_n = int(0.09 * SR)
            tt = np.arange(seg_n) / SR
            noise = r.standard_normal(seg_n)
            hp = np.diff(np.concatenate([[0.0], noise]))
            sig = hp * np.exp(-tt * 48) * (0.11 if step % 2 else 0.07)
            place(drum_bus, sig, start, gain=0.7, pan=0.30 if step % 2 else -0.22)

    # ---- Arpeggio: pentatonic sparkle, with ping-pong delay -------------
    arp_pattern = [0, 2, 4, 6, 7, 4, 2, 1]
    for bar_i in range(2, bars):
        for step in range(8):
            if bar_i < 4 and step % 2:
                continue
            name = progression[(bar_i // 2) % len(progression)]
            root = CHORDS[name][0]
            interval = scale[arp_pattern[(step + bar_i) % len(arp_pattern)]]
            freq = root * 4 * (2 ** (interval / 12))
            start = bar_i * bar + step * beat / 2
            seg_n = int(0.42 * SR)
            tt = np.arange(seg_n) / SR
            env = np.exp(-tt * (6.5 - track["brightness"] * 2)) * adsr(seg_n, 0.004, 0.05, 3)
            sig = (
                np.sin(2 * np.pi * freq * tt)
                + 0.30 * np.sin(2 * np.pi * freq * 2 * tt)
                + 0.12 * np.sin(2 * np.pi * freq * 3 * tt)
            ) * env
            place(arp_bus, sig, start, gain=0.115, pan=0.34 if step % 2 else -0.34)

    # ---- Airy shimmer: sparse bell tones in the second half --------------
    for k in range(10):
        bar_i = 8 + int(r.integers(0, max(1, bars - 8)))
        name = progression[(bar_i // 2) % len(progression)]
        root = CHORDS[name][0] * 4
        interval = scale[int(r.integers(0, len(scale)))]
        freq = root * (2 ** (interval / 12))
        start = bar_i * bar + r.random() * bar
        seg_n = int(1.8 * SR)
        tt = np.arange(seg_n) / SR
        env = np.exp(-tt * 2.6) * adsr(seg_n, 0.01, 0.2, 2)
        sig = (np.sin(2 * np.pi * freq * tt) + 0.22 * np.sin(2 * np.pi * freq * 2.01 * tt)) * env
        place(arp_bus, sig, start, gain=0.055, pan=float(r.uniform(-0.5, 0.5)))

    # ---- Pad sidechain, bus mixing --------------------------------------
    duck = 1.0 - 0.28 * np.clip(kick_env, 0, 1.5)
    pad_bus *= duck

    channels += pad_bus * 0.95
    channels += bass_bus * 0.78
    channels += arp_bus * 1.0
    channels += drum_bus * 0.9

    # ping-pong dotted delay for the arp
    delay = int(beat * 0.75 * SR)
    arp_delay = np.zeros_like(arp_bus)
    for ch, other in ((0, 1), (1, 0)):
        src = arp_bus[other]
        buf = np.zeros(n)
        for tap, gain in ((1, 0.32), (2, 0.18), (3, 0.09)):
            d = delay * tap
            if d < n:
                buf[d:] += src[:-d] * gain
        arp_delay[ch] = buf
    channels += arp_delay * 0.55

    # reverb send
    ir = make_reverb_ir(3.1, 2.2, seed + 100)
    wet = convolve_stereo(channels, ir)[:, :n]
    channels += wet * 0.20

    # gentle bus compression / tape saturation, normalised before saturation so
    # the mix keeps its transients instead of turning into a square wave
    peak = np.max(np.abs(channels)) + 1e-9
    channels = channels / peak
    channels = np.tanh(channels * 1.35) / math.tanh(1.35) * 0.90

    # fade in/out
    fade_in = int(1.2 * SR)
    fade_out = int((track["tail"] + 1.0) * SR)
    channels[:, :fade_in] *= np.linspace(0, 1, fade_in) ** 1.5
    channels[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 1.8

    # final headroom
    peak = np.max(np.abs(channels)) + 1e-9
    channels *= 0.89 / peak

    # short metadata of key moments for the UI / docs
    cues = []
    for bar_i in range(0, bars, 4):
        cues.append({"bar": bar_i, "time": round(bar_i * bar, 2), "label": "intro" if bar_i < 4 else ("build" if bar_i < 8 else "peak")})
    return channels, t, cues


def write_wav(path: pathlib.Path, channels: np.ndarray):
    pcm = np.clip(channels.T, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())


def make_cover(track: dict) -> pathlib.Path:
    size = 1200
    r = np.random.default_rng(track["seed"] + 500)
    yy, xx = np.mgrid[0:size, 0:size]
    cx, cy = size * 0.52, size * 0.46
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.7)
    glow = np.clip(1 - dist, 0, 1) ** 2.4

    base = np.zeros((size, size, 3), dtype=np.float64)
    base[:, :, 0] = 6 + 17 * glow
    base[:, :, 1] = 9 + 22 * glow
    base[:, :, 2] = 16 + 34 * glow

    # a directional inner aurora made from the track palette
    angle_map = np.arctan2(yy - cy, xx - cx)
    mix = 0.5 + 0.5 * np.sin(angle_map * 1.35 + track["seed"] * 0.37)
    col_a = np.array([int(track["palette"][0][i:i + 2], 16) for i in (1, 3, 5)])
    col_b = np.array([int(track["palette"][1][i:i + 2], 16) for i in (1, 3, 5)])
    color_field = col_a[None, None, :] * mix[:, :, None] + col_b[None, None, :] * (1 - mix[:, :, None])
    base += glow[:, :, None] * color_field * 0.30
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    # soft colour clouds
    cloud = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cloud)
    for i, col in enumerate(track["palette"]):
        angle = r.uniform(0, math.tau)
        rad = r.uniform(size * 0.10, size * 0.32)
        px = cx + math.cos(angle) * rad
        py = cy + math.sin(angle) * rad
        rr = int(r.uniform(size * 0.20, size * 0.42))
        c = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5))
        cd.ellipse((px - rr, py - rr, px + rr, py + rr), fill=c + (88,))
    cloud = cloud.filter(ImageFilter.GaussianBlur(size * 0.085))
    img.alpha_composite(cloud)

    # concentric particle rings / spectrum arcs
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for ring in range(16):
        rad = size * (0.075 + ring * 0.028)
        segs = 90 + ring * 9
        for s in range(segs):
            if r.random() < 0.28 + ring * 0.012:
                continue
            a0 = (s / segs) * math.tau + ring * 0.12
            a1 = a0 + (math.tau / segs) * (0.38 + r.random() * 0.52)
            w = 1.5 if ring < 6 else 1.0
            alpha = int((84 - ring * 3.5) * (0.55 + 0.45 * r.random()))
            col = tuple(int(track["palette"][ring % 3][i:i + 2], 16) for i in (1, 3, 5))
            d.arc((cx - rad, cy - rad, cx + rad, cy + rad), math.degrees(a0), math.degrees(a1), fill=col + (max(12, alpha),), width=int(w))
    layer = layer.filter(ImageFilter.GaussianBlur(0.7))
    img.alpha_composite(layer)

    # stars / dust
    dust = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dust)
    for _ in range(950):
        a = r.uniform(0, math.tau)
        rad = abs(r.normal(0, size * 0.26))
        px, py = cx + math.cos(a) * rad, cy + math.sin(a) * rad
        if not (0 <= px < size and 0 <= py < size):
            continue
        s = r.uniform(0.5, 2.0)
        alpha = int(r.uniform(20, 150) * max(0.25, 1 - rad / (size * 0.6)))
        dd.ellipse((px - s, py - s, px + s, py + s), fill=(230, 245, 255, alpha))
    img.alpha_composite(dust)

    # lift the shadows so the cover reads as a small 46px thumbnail as well
    arr = np.array(img, dtype=np.float64)
    arr[:, :, :3] = np.clip((arr[:, :, :3] / 255.0) ** 0.82 * 268.0, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGBA")

    # vignette
    vign = np.clip(1.14 - dist * 0.82, 0.5, 1.0)
    arr = np.array(img, dtype=np.float64)
    arr[:, :, :3] *= vign[:, :, None]
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")

    # typography
    d = ImageDraw.Draw(img)
    font_path = pathlib.Path(r"C:\Windows\Fonts\bahnschrift.ttf")
    font_big = ImageFont.truetype(str(font_path), 76) if font_path.exists() else ImageFont.load_default(size=76)
    font_small = ImageFont.truetype(str(font_path), 25) if font_path.exists() else ImageFont.load_default(size=25)
    font_micro = ImageFont.truetype(str(font_path), 19) if font_path.exists() else ImageFont.load_default(size=19)
    d.text((72, size - 210), "P R I S M", font=font_big, fill=(244, 247, 255, 235))
    d.text((76, size - 118), track["title"].upper(), font=font_small, fill=(206, 224, 245, 218))
    d.text((76, size - 76), "PARTICLE STUDIES  /  " + track["artist"].upper(), font=font_micro, fill=(145, 165, 195, 210))
    d.line((76, size - 238, 420, size - 238), fill=(220, 235, 255, 110), width=1)

    out = COVERS / f"{track['slug']}.jpg"
    img.convert("RGB").save(out, quality=92)
    return out


def encode_mp3(wav: pathlib.Path, mp3: pathlib.Path, cover: pathlib.Path, track: dict):
    ffmpeg = pathlib.Path(r"F:\ffmpeg-master-latest-win64-gpl\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe")
    if not ffmpeg.exists():
        ffmpeg = pathlib.Path("ffmpeg")
    cmd = [
        str(ffmpeg), "-y", "-loglevel", "error",
        "-i", str(wav), "-i", str(cover),
        "-map", "0:a", "-map", "1:v",
        "-c:a", "libmp3lame", "-b:a", "192k", "-ar", str(SR),
        "-c:v", "mjpeg", "-q:v", "3", "-disposition:v", "attached_pic",
        "-metadata", f"title={track['title']}",
        "-metadata", f"artist={track['artist']}",
        "-metadata", f"album={track['album']}",
        "-metadata", "genre=Ambient Electronica",
        "-metadata", "comment=Original demo generated for PRISM. Royalty-free.",
        "-id3v2_version", "3",
        str(mp3),
    ]
    subprocess.run(cmd, check=True)


def main():
    AUDIO.mkdir(parents=True, exist_ok=True)
    COVERS.mkdir(parents=True, exist_ok=True)
    manifest = []
    for spec in TRACKS:
        print(f"synth  {spec['title']} ...", flush=True)
        channels, t, cues = synth(spec)
        wav = AUDIO / f"{spec['slug']}.wav"
        write_wav(wav, channels)
        cover = make_cover(spec)
        mp3 = AUDIO / f"{spec['slug']}.mp3"
        encode_mp3(wav, mp3, cover, spec)
        wav.unlink(missing_ok=True)
        rms = float(np.sqrt(np.mean(channels ** 2)))
        manifest.append({
            "slug": spec["slug"],
            "title": spec["title"],
            "artist": spec["artist"],
            "album": spec["album"],
            "src": f"assets/audio/{spec['slug']}.mp3",
            "cover": f"assets/covers/{spec['slug']}.jpg",
            "duration": round(len(channels[0]) / SR, 2),
            "bpm": spec["bpm"],
            "palette": list(spec["palette"]),
            "cues": cues,
            "rms": round(rms, 4),
        })
        print(f"       {len(channels[0])/SR:.1f}s  {mp3.stat().st_size/1024/1024:.2f} MB  rms={rms:.3f}")
    (ROOT / "tools" / "tracks.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
