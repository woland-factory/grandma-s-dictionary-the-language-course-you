#!/usr/bin/env python3
# Generates the bundled demo audio clips under public/demo/audio/ with pure
# Python (no ffmpeg / TTS needed). Each clip is a short, audible, vowel-like
# utterance made by formant synthesis. Elder clips use a low pitch and an adult
# vocal tract; child clips use a higher pitch and shorter tract, so the two
# voices are clearly distinct. Run from the repo root: python3 scripts/gen_demo_audio.py
import math
import os
import struct
import wave

SR = 16000
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "demo", "audio")
os.makedirs(OUT, exist_ok=True)

# Approximate vowel formants (F1, F2, F3) in Hz for an adult speaker.
VOWELS = {
    "a": (800, 1150, 2900),
    "e": (400, 2000, 2550),
    "i": (350, 2300, 3000),
    "o": (450, 800, 2830),
    "u": (325, 700, 2530),
}


def formant_gain(freq, formants, bw=110.0):
    # Each formant is a narrow resonance, so harmonics near a formant are
    # boosted, giving a vowel-like timbre.
    g = 0.0
    for f in formants:
        g += 1.0 / (1.0 + ((freq - f) / bw) ** 2)
    return g


def syllable(f0, vowel, dur, formant_scale):
    n = int(SR * dur)
    formants = tuple(f * formant_scale for f in VOWELS[vowel])
    harmonics = []
    k = 1
    while k * f0 < SR / 2:
        freq = k * f0
        harmonics.append((freq, formant_gain(freq, formants) / k))
        k += 1
    out = []
    for i in range(n):
        t = i / SR
        env = math.sin(math.pi * (i / n)) ** 0.6  # attack + gentle decay
        s = 0.0
        for freq, amp in harmonics:
            s += amp * math.sin(2 * math.pi * freq * t)
        out.append(s * env)
    return out


def render_word(f0, vowels, syl_dur, formant_scale):
    samples = []
    for v in vowels:
        samples.extend(syllable(f0, v, syl_dur, formant_scale))
        samples.extend([0.0] * int(SR * 0.03))  # short articulation gap
    peak = max((abs(x) for x in samples), default=1.0) or 1.0
    scale = 0.5 / peak
    return [x * scale for x in samples]


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767))
                for s in samples
            )
        )


# Each word maps to a rough vowel sequence of its syllables.
WORDS = {
    "yiayia": ["i", "a", "i", "a"],
    "pappou": ["a", "u"],
    "agapi-mou": ["a", "a", "i", "u"],
    "stin-ygeia-sou": ["i", "e", "a", "u"],
    "psomi": ["o", "i"],
    "kalinychta": ["a", "i", "i", "a"],
}
WITH_CHILD = {"yiayia", "pappou", "agapi-mou", "stin-ygeia-sou"}

ELDER = dict(f0=130, syl_dur=0.26, formant_scale=1.0)
CHILD = dict(f0=300, syl_dur=0.20, formant_scale=1.22)

for name, vowels in WORDS.items():
    write_wav(
        os.path.join(OUT, f"{name}-elder.wav"),
        render_word(ELDER["f0"], vowels, ELDER["syl_dur"], ELDER["formant_scale"]),
    )
    if name in WITH_CHILD:
        write_wav(
            os.path.join(OUT, f"{name}-child.wav"),
            render_word(CHILD["f0"], vowels, CHILD["syl_dur"], CHILD["formant_scale"]),
        )

for f in sorted(os.listdir(OUT)):
    if f.endswith(".wav"):
        print(f, os.path.getsize(os.path.join(OUT, f)), "bytes")
