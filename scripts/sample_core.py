"""Timing, harmony and note renderers shared by the sample generators.

Every sample is four bars (16 beats) at 112 BPM in A minor over Am, F, C, G. Notes and hits write
modulo the buffer length, so tails wrap into the start and the loop stays seamless.
"""
import math, random, zlib
from functools import lru_cache
from synth import SR, TAU, note, table, harmonics

BPM = 112
BEAT = 60 / BPM
BEATS = 16
N = round(BEATS * BEAT * SR)

ROOTS = (33, 29, 36, 31)  # A1 F1 C2 G1
CHORDS = ((57, 60, 64), (57, 60, 65), (55, 60, 64), (55, 59, 62))  # Am, F/A, C/G, G: close voicings

# Two four-bar phrases in A minor pentatonic as (beat, midi, length in beats).
MELODY_A = (
    (0, 69, 1), (1, 72, .5), (1.5, 76, .5), (2, 74, 1), (3, 72, 1),
    (4, 69, 1), (5, 72, 1), (6, 77, 1.5), (7.5, 76, .5),
    (8, 76, 1), (9, 72, .5), (9.5, 74, .5), (10, 76, 1.5), (11.5, 79, .5),
    (12, 74, 1), (13, 71, 1), (14, 67, 1.5), (15.5, 69, .5),
)
MELODY_B = (
    (0, 76, .5), (.5, 74, .5), (1, 72, .5), (1.5, 69, .5), (2, 72, .5), (2.5, 74, .5), (3, 76, 1),
    (4, 77, .5), (4.5, 76, .5), (5, 72, .5), (5.5, 69, .5), (6, 72, 1), (7, 77, 1),
    (8, 79, .5), (8.5, 76, .5), (9, 72, .5), (9.5, 76, .5), (10, 79, .5), (10.5, 84, .5), (11, 79, 1),
    (12, 74, .5), (12.5, 79, .5), (13, 83, .5), (13.5, 79, .5), (14, 74, 1), (15, 71, .5), (15.5, 69, .5),
)


def seed(name):
    """Seed the global generator from the sample's id, so each sample is reproducible on its own."""
    random.seed(zlib.crc32(name.encode()))


def blank():
    return [0.0] * N


def play(buf, beat, fn, length, gain=1.0):
    """Add fn(t) for `length` seconds starting at `beat`."""
    begin = round(beat * BEAT * SR)
    for i in range(round(length * SR)):
        buf[(begin + i) % N] += gain * fn(i / SR)


LEVELS = {'x': 1.0, 'o': .45}


def lay(buf, bars, factory, length, gain=1.0, jitter=.06, ramp=None):
    """Step-sequence one hit per marked step. `bars` holds one pattern string per bar (steps are an
    even division of the bar: 'x' loud, 'o' soft, '1'-'9' by level, '.' rest). `factory()` returns a
    fresh fn(t) for each hit. `ramp` scales the level from (start, end) across the loop."""
    for bar, pattern in enumerate(bars):
        for step, mark in enumerate(pattern):
            level = LEVELS.get(mark, int(mark) / 9 if mark.isdigit() else 0)
            if not level:
                continue
            beat = bar * 4 + step * 4 / len(pattern)
            if ramp:
                level *= ramp[0] + (ramp[1] - ramp[0]) * beat / BEATS
            play(buf, beat, factory(), length, gain * level * (1 + random.uniform(-jitter, jitter)))


@lru_cache(maxsize=None)
def wave(kind, freq, cutoff=0):
    """One period of a band-limited tone. `cutoff` rolls the upper harmonics off smoothly."""
    if kind == 'sine':
        weights = [(1, 1.0)]
    elif kind == 'saw':
        weights = harmonics(freq, 1.0, None, 18000)
    elif kind == 'square':
        weights = harmonics(freq, 1.0, None, 18000, True)
    elif kind == 'tri':
        weights = harmonics(freq, 2.0, None, 18000, True)
    elif kind == 'soft':
        weights = harmonics(freq, 1.6, None, 18000)
    elif kind == 'organ':
        weights = [(k, a) for k, a in ((1, .9), (2, 1.0), (3, .7), (4, .5), (6, .35), (8, .25)) if freq * k < 18000]
    else:
        raise ValueError(kind)
    if cutoff:
        weights = [(k, a / (1 + (freq * k / cutoff) ** 2)) for k, a in weights]
    return table(weights)


def envelope(t, length, attack, release):
    return min(1.0, t / attack, (length - t) / release)


def pluck(buf, beat, length, midi, gain=1.0, kind='saw', bright=6000, dull=700, decay=3.0, shine=12.0, attack=.003, release=.04, cents=0):
    """A struck note: a wavetable whose brightness decays from `bright` to `dull` at rate `shine`."""
    freq = note(midi) * 2 ** (cents / 1200)
    hi, lo = wave(kind, freq, bright), wave(kind, freq, dull)
    size = len(hi) - 1
    step = size * freq / SR
    seconds = length * BEAT
    begin, phase = round(beat * BEAT * SR), random.random() * size
    for i in range(round(seconds * SR)):
        t = i / SR
        phase += step
        if phase >= size:
            phase -= size
        j = int(phase)
        frac = phase - j
        a = hi[j] + (hi[j + 1] - hi[j]) * frac
        b = lo[j] + (lo[j + 1] - lo[j]) * frac
        buf[(begin + i) % N] += gain * math.exp(-decay * t) * envelope(t, seconds, attack, release) * (b + (a - b) * math.exp(-shine * t))


def fm(buf, beat, length, midi, gain=1.0, ratio=1.0, index=2.0, index_decay=6.0, decay=2.0, attack=.003, release=.05):
    """Two-operator FM note whose modulation index decays, for electric pianos and bells."""
    freq = note(midi)
    seconds = length * BEAT
    begin = round(beat * BEAT * SR)
    for i in range(round(seconds * SR)):
        t = i / SR
        mod = index * math.exp(-index_decay * t) * math.sin(TAU * freq * ratio * t)
        buf[(begin + i) % N] += gain * math.exp(-decay * t) * envelope(t, seconds, attack, release) * math.sin(TAU * freq * t + mod)


def mallet(buf, beat, length, midi, partials, gain=1.0, tremolo=0.0):
    """Tuned percussion: (ratio, level, decay rate) partials, each ringing out on its own."""
    freq = note(midi)
    seconds = length * BEAT
    begin = round(beat * BEAT * SR)
    for i in range(round(seconds * SR)):
        t = i / SR
        value = sum(a * math.exp(-d * t) * math.sin(TAU * freq * r * t) for r, a, d in partials)
        if tremolo:
            value *= 1 + tremolo * math.sin(TAU * 5.2 * t)
        buf[(begin + i) % N] += gain * min(1.0, t / .002, (seconds - t) / .05) * value


def strum(buf, beat, midis, gain=1.0, spread=.018, up=False, ring=2.0, bright=.55, decay=.9975):
    """A Karplus-Strong chord; each string starts `spread` beats after the last."""
    from synth import karplus
    for index, midi in enumerate(reversed(midis) if up else midis):
        string = karplus(note(midi), ring, random, decay, bright)
        begin = round((beat + index * spread) * BEAT * SR)
        for i, v in enumerate(string):
            buf[(begin + i) % N] += gain * v


def loop_voice(buf, midi, kind='saw', cutoff=0, gain=1.0, cents=0, swell=0.0, swell_cycles=1, swell_phase=0.0):
    """A held tone tuned to a whole number of cycles per loop, so its seam is exact. `swell` adds a
    slow amplitude wobble of `swell_cycles` whole cycles per loop."""
    freq = note(midi) * 2 ** (cents / 1200)
    tab = wave(kind, freq, cutoff)
    cycles = max(1, round(freq * N / SR))
    size = len(tab) - 1
    step = size * cycles / N
    phase = 0.0
    for i in range(N):
        j = int(phase)
        v = tab[j] + (tab[j + 1] - tab[j]) * (phase - j)
        phase += step
        if phase >= size:
            phase -= size
        buf[i] += gain * v * ((1 + swell * math.sin(TAU * swell_cycles * i / N + swell_phase)) if swell else 1)
