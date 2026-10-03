"""Bass, keys, pads, melodic instruments and voices. Each builder returns (samples, reverb room)."""
import math, random
from synth import SR, TAU, note, table, harmonics, voice, high_pass_noise, svf, sweep_phase
from sample_core import BEAT, N, ROOTS, CHORDS, MELODY_A, MELODY_B, blank, play, pluck, fm, mallet, strum, wave

AH = ((700, 110, 1.0), (1150, 120, .5), (2600, 160, .3), (3300, 180, .2), (4200, 250, .06))
OO = ((330, 80, 1.0), (750, 100, .25), (2400, 150, .05), (3000, 180, .04))
vowel = lambda formants: lambda f: harmonics(f, 1.2, formants, 5200)
soft_saw = lambda cutoff: lambda f: [(k, a / (1 + (f * k / cutoff) ** 2)) for k, a in harmonics(f, 1.0, None, 12000)]
BAR = 4 * BEAT


def ensemble(chords, tone, level=1.0, attack=.35, release=.6, vibrato=.006, breath=0.0, spread=(-7, 0, 8), seed=7):
    """Four-beat chords, a few slightly detuned singers or players per note."""
    rng, buf = random.Random(seed), blank()
    count = round(BAR * SR)
    for index, chord in enumerate(chords):
        for midi in chord:
            for cents in spread:
                f = note(midi) * 2 ** (cents / 1200)
                # Notes overlap slightly so chord changes are sung through, not gated.
                voice(buf, index * count, count + round(.25 * SR), f, table(tone(f)), level / len(chord) / len(spread) * 3, attack, release, vibrato, 4.8 + rng.random() * 1.2, .4, rng)
    if breath:
        hiss = high_pass_noise(rng)
        for i in range(N):
            buf[i] += breath * hiss()
    return buf


def chords_with_bass(shift=0, bass=0):
    """The progression as note tuples, optionally shifted and with the root added `bass` semitones up."""
    return [tuple(m + shift for m in chord) + ((root + bass,) if bass else ()) for chord, root in zip(CHORDS, ROOTS)]


# ---- Voices and strings ----

def choir_ah():
    return ensemble([(45, 57, 60, 64), (41, 57, 60, 65), (48, 55, 60, 64), (43, 55, 59, 62)], vowel(AH), breath=.004), .32


def choir_oo():
    return ensemble([(57, 64, 69, 72), (57, 65, 69, 72), (55, 64, 67, 72), (55, 62, 67, 71)], vowel(OO), breath=.003, seed=11), .34


def choir_low():
    return ensemble([(33, 45, 52, 57), (29, 41, 48, 53), (36, 43, 48, 52), (31, 43, 50, 55)], vowel(AH), breath=.004, seed=5), .3


def strings():
    return ensemble([(45, 57, 64, 69, 72), (41, 57, 65, 69, 72), (48, 55, 64, 67, 72), (43, 55, 62, 67, 71)], lambda f: [(k, a / (1 + (f * k / 4500) ** 2)) for k, a in harmonics(f, 1.0)], attack=.22, vibrato=.004, seed=2), .26


def bells():
    buf = blank()
    for index, midi in enumerate([69, 72, 76, 81, 81, 77, 72, 69, 72, 76, 79, 84, 83, 79, 74, 71]):
        for detune, level in ((1, .6), (1.004, .4)):
            base = note(midi) * detune
            play(buf, index, lambda t, base=base, level=level: level * min(1, t / .002) * sum(a * math.exp(-t * d) * math.sin(TAU * base * r * t) for r, a, d in ((1, 1, 1.8), (2.76, .45, 3), (5.4, .22, 5), (8.93, .1, 8))), 2.6)
    return buf, .3


# ---- Bass ----

def sub_bass():
    buf, tab = blank(), table([(1, 1.0), (2, .12)])
    for bar, root in enumerate(ROOTS):
        for start, length in ((0, 2.75), (3, .75)):
            octave = 12 if bar == 3 and start == 3 else 0
            voice(buf, round((bar * 4 + start) * BEAT * SR), round(length * BEAT * SR), note(root + octave), tab, .9, .02, .12)
    return buf, .08


def saw_bass():
    buf = blank()
    for bar, root in enumerate(ROOTS):
        for step, jump in enumerate((0, 0, 12, 0, 0, 12, 0, 7)):
            pluck(buf, bar * 4 + step / 2, .45, root + 12 + jump, .55, 'saw', 2600, 300, 6, 14)
    return buf, .08


def pluck_bass():
    buf = blank()
    for bar, root in enumerate(ROOTS):
        for beat, jump, length in ((0, 0, .7), (.75, 0, .5), (1.5, 12, .5), (2.5, 0, .7), (3, 7, .45), (3.5, 5 if bar % 2 else 3, .45)):
            pluck(buf, bar * 4 + beat, length, root + 12 + jump, .6, 'saw', 3200, 350, 5, 12)
    return buf, .08


def bass_808():
    buf = blank()
    for bar, root in enumerate(ROOTS):
        f = note(root + 12)
        for beat, length in ((0, 2.5), (2.75, 1.0)):
            play(buf, bar * 4 + beat, lambda t, f=f, length=length: math.tanh(1.8 * math.sin(TAU * sweep_phase(t, f * 2.2, f, 22))) * math.exp(-t * 1.5) * min(1, t / .003, (length * BEAT - t) / .04), length * BEAT, .9)
    return buf, .06


def acid():
    rng = random.Random(9)
    pattern = (0, 0, 12, 0, None, 0, 10, 0, 0, None, 12, 0, 7, None, 0, 12)
    accents = {0, 6, 10, 15}
    dry, cutoff = blank(), [300.0] * N
    step_len = BEAT / 4 * SR
    for bar, root in enumerate(ROOTS):
        for step, jump in enumerate(pattern):
            if jump is None:
                continue
            start = round((bar * 16 + step) * step_len)
            freq = note(root + 12 + jump)
            tab, accent = wave('saw', freq), step in accents
            size = len(tab) - 1
            phase = rng.random() * size
            for i in range(round(step_len * .85)):
                phase = (phase + size * freq / SR) % size
                j = int(phase)
                dry[(start + i) % N] += (1 if accent else .75) * (tab[j] + (tab[j + 1] - tab[j]) * (phase - j)) * min(1, i / 60, (step_len * .85 - i) / 80)
            for i in range(round(step_len)):
                t = i / SR
                cutoff[(start + i) % N] = 350 + 450 * (.5 - .5 * math.cos(TAU * (start + i) / N)) + (2400 if accent else 1400) * math.exp(-t * 9)
    out = svf(dry, cutoff, .22)
    return [math.tanh(1.4 * v) for v in out], .06


def square_bass():
    buf = blank()
    for bar, root in enumerate(ROOTS):
        for step in range(8):
            pluck(buf, bar * 4 + step / 2, .4, root + 12 + (12 if step % 2 else 0), .5, 'square', 4500, 1200, 5, 20)
    return buf, .05


def wobble():
    dry = blank()
    for bar, root in enumerate(ROOTS):
        voice(dry, round(bar * BAR * SR), round(BAR * SR), note(root + 12), table(harmonics(note(root + 12), 1.0, None, 9000)), .8, .03, .06)
    lfo = lambda i: 200 + 1500 * (.5 - .5 * math.cos(TAU * 32 * i / N))
    return [math.tanh(1.6 * v) for v in svf(dry, lfo, .3)], .06


# ---- Keys, organ and pads ----

def piano():
    buf = blank()
    for bar, (chord, root) in enumerate(zip(CHORDS, ROOTS)):
        for beat, gain, length in ((0, 1.0, 3.0), (2.5, .7, 1.4)):
            for i, midi in enumerate(chord + (root + 12,)):
                pluck(buf, bar * 4 + beat + i * .012, length, midi, .32 * gain, 'soft', 5500, 900, 1.3, 5, .002, .25)
    return buf, .22


def piano_arp():
    buf = blank()
    order = (0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1)
    for bar, chord in enumerate(CHORDS):
        tones = chord + (chord[0] + 12,)
        for step, index in enumerate(order):
            pluck(buf, bar * 4 + step / 4, 1.2, tones[index] + 12, .34, 'soft', 6500, 1000, 2.2, 6, .002, .12)
    return buf, .24


def electric_piano():
    buf = blank()
    for bar, (chord, root) in enumerate(zip(CHORDS, ROOTS)):
        for beat, length, gain in ((0, 1.6, 1.0), (1.5, 1.0, .75), (3, 1.0, .85)):
            for midi in chord:
                fm(buf, bar * 4 + beat, length, midi, .22 * gain, 1.0, 1.7, 3.0, 1.1)
            fm(buf, bar * 4 + beat, length, root + 12, .25 * gain, 1.0, 1.2, 3.0, 1.0)
    return buf, .2


def organ():
    tone = lambda f: [(k, a) for k, a in ((1, .9), (2, 1.0), (3, .7), (4, .5), (6, .35), (8, .25)) if f * k < 16000]
    buf = ensemble(chords_with_bass(0, 12), tone, 1.0, .02, .06, .002, spread=(0,))
    # A slow rotary-speaker shimmer, a whole number of cycles per loop so the seam holds.
    return [v * (1 + .12 * math.sin(TAU * 52 * i / N)) for i, v in enumerate(buf)], .14


def pad_warm():
    return ensemble(chords_with_bass(0, 12), soft_saw(1400), .9, .9, 1.0, .002, spread=(-14, -6, 6, 14)), .32


def pad_glass():
    sine_stack = lambda f: [(1, 1.0), (2, .25), (3, .12), (5, .05)]
    return ensemble(chords_with_bass(12, 24), sine_stack, .9, 1.2, 1.2, .003, spread=(-4, 0, 5)), .5


def pad_dark():
    return ensemble([tuple(m - 12 for m in chord) + (root + 12,) for chord, root in zip(CHORDS, ROOTS)], soft_saw(700), 1.0, 1.0, 1.1, .0015, spread=(-10, -3, 4, 11)), .36


def synth_stabs():
    buf = blank()
    for bar, chord in enumerate(CHORDS):
        for beat in (.5, 1.25, 2.5, 3.25):
            for midi in chord:
                for cents in (-8, 8):
                    pluck(buf, bar * 4 + beat, .45, midi, .16, 'saw', 7000, 600, 9, 18, cents=cents)
    return buf, .2


def vibraphone():
    buf = blank()
    partials = ((1, 1.0, 1.2), (4, .15, 4.0), (10, .04, 9.0))
    for bar, chord in enumerate(CHORDS):
        for beat, gain in ((0, 1.0), (2.5, .75)):
            for midi in chord + (chord[0] + 12,):
                mallet(buf, bar * 4 + beat, 3.0, midi, partials, .22 * gain, .22)
    return buf, .26


def pizzicato():
    buf = blank()
    order = (0, 1, 2, 1, 0, 1, 2, 1)
    for bar, chord in enumerate(CHORDS):
        for step, index in enumerate(order):
            pluck(buf, bar * 4 + step / 2, .4, chord[index] + 12, .4, 'saw', 3500, 500, 7, 12)
    return buf, .18


# ---- Melody ----

def arp_pluck():
    buf = blank()
    up_down = (0, 1, 2, 3, 4, 3, 2, 1) * 2
    for bar, chord in enumerate(CHORDS):
        tones = [m + 12 for m in chord] + [chord[0] + 24, chord[1] + 24]
        for step, index in enumerate(up_down):
            pluck(buf, bar * 4 + step / 4, .6, tones[index], .32, 'saw', 6000, 800, 6, 16)
    return buf, .22


def arp_bell():
    buf = blank()
    for bar, chord in enumerate(CHORDS):
        for step, index in enumerate((0, 1, 2, 1, 0, 1, 2, 1)):
            fm(buf, bar * 4 + step / 2, 1.8, chord[index] + 24, .3, 3.5, 2.4, 3.0, 1.9)
    return buf, .34


def lead_saw():
    buf, rng = blank(), random.Random(4)
    for beat, midi, length in MELODY_A:
        for cents in (-6, 6):
            f = note(midi) * 2 ** (cents / 1200)
            voice(buf, round(beat * BEAT * SR), round((length * BEAT + .04) * SR), f, wave('saw', f, 3500), .22, .02, .12, .005, 5.4, .25, rng)
    return buf, .22


def lead_chip():
    buf = blank()
    for beat, midi, length in MELODY_B:
        pluck(buf, beat, length * .95, midi, .4, 'square', 5000, 2500, 1.2, 4, .002, .02)
    return buf, .1


def marimba():
    buf = blank()
    partials = ((1, 1.0, 5.0), (3.93, .22, 14.0), (9.9, .06, 26.0))
    for beat, midi, length in MELODY_B:
        mallet(buf, beat, 1.4, midi - 12, partials, .5)
    return buf, .2


def kalimba():
    buf = blank()
    partials = ((1, 1.0, 3.5), (5.4, .3, 11.0), (8.1, .1, 16.0))
    for bar, chord in enumerate(CHORDS):
        for step, index in enumerate((0, 2, 1, 2, 0, 2, 1, 2)):
            mallet(buf, bar * 4 + step / 2, 1.8, chord[index] + 12, partials, .45)
    return buf, .24


def music_box():
    buf = blank()
    partials = ((1, 1.0, 2.2), (2.76, .3, 4.5), (5.4, .15, 8.0))
    for beat, midi, length in MELODY_A:
        mallet(buf, beat, 2.4, midi + 12, partials, .42)
    return buf, .32


def guitar():
    buf = blank()
    shapes = ((45, 52, 57, 60, 64), (41, 48, 53, 57, 60), (48, 52, 55, 60, 64), (43, 50, 55, 59, 62))
    for bar, shape in enumerate(shapes):
        for beat, gain, up in ((0, 1.0, False), (1.5, .7, False), (2, .65, True), (3, .8, False)):
            strum(buf, bar * 4 + beat, shape, .34 * gain, up=up, ring=2.0)
    return buf, .16


def harp():
    buf = blank()
    for bar, chord in enumerate(CHORDS):
        tones = [m + 12 for m in chord] + [m + 24 for m in chord] + [chord[0] + 36]
        strum(buf, bar * 4, tones, .36, spread=.5, ring=3.2, bright=.4, decay=.9985)
    return buf, .4


def flute():
    buf, rng = blank(), random.Random(6)
    tab = table([(1, 1.0), (2, .15), (3, .08)])
    for beat, midi, length in MELODY_A:
        f = note(midi + 12)
        start, count = round(beat * BEAT * SR), round((length * BEAT + .05) * SR)
        voice(buf, start, count, f, tab, .5, .06, .1, .004, 5.2, .3, rng)
        breath, seconds = high_pass_noise(rng), count / SR
        play(buf, beat, lambda t, b=breath, s=seconds: .018 * b() * min(1, t / .03, (s - t) / .08), seconds)
    return buf, .26


SAMPLES = [
    ('choir-ah', 'Choir Ah', choir_ah), ('choir-oo', 'Choir Oo', choir_oo), ('choir-low', 'Choir Low', choir_low),
    ('strings', 'Strings', strings), ('bells', 'Bells', bells),
    ('sub-bass', 'Sub Bass', sub_bass), ('saw-bass', 'Saw Bass', saw_bass), ('pluck-bass', 'Pluck Bass', pluck_bass),
    ('808-bass', '808 Bass', bass_808), ('acid', 'Acid Line', acid), ('square-bass', 'Square Bass', square_bass), ('wobble', 'Wobble Bass', wobble),
    ('piano', 'Piano Chords', piano), ('piano-arp', 'Piano Arp', piano_arp), ('electric-piano', 'Electric Piano', electric_piano),
    ('organ', 'Organ', organ), ('pad-warm', 'Pad Warm', pad_warm), ('pad-glass', 'Pad Glass', pad_glass), ('pad-dark', 'Pad Dark', pad_dark),
    ('synth-stabs', 'Synth Stabs', synth_stabs), ('vibraphone', 'Vibraphone', vibraphone), ('pizzicato', 'Pizzicato', pizzicato),
    ('arp-pluck', 'Arp Pluck', arp_pluck), ('arp-bell', 'Arp Bell', arp_bell), ('lead-saw', 'Lead Saw', lead_saw), ('lead-chip', 'Lead Chip', lead_chip),
    ('marimba', 'Marimba', marimba), ('kalimba', 'Kalimba', kalimba), ('music-box', 'Music Box', music_box),
    ('guitar', 'Guitar', guitar), ('harp', 'Harp', harp), ('flute', 'Flute', flute),
]
