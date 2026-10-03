"""Textures, risers and effects. Each builder returns (samples, reverb room)."""
import math, random
from synth import SR, TAU, band_pass, high_pass_noise, svf, sweep_phase
from sample_core import N, blank, play, loop_voice
from sample_tones import ensemble, soft_saw, chords_with_bass

noise = lambda: random.uniform(-1, 1)


def vinyl():
    rng, buf = random.Random(12), blank()
    hiss = high_pass_noise(rng)
    for i in range(N):
        buf[i] += .012 * hiss()
    for _ in range(round(300 * N / SR)):  # a dense bed of tiny ticks
        buf[rng.randrange(N)] += rng.uniform(-1, 1) * .05
    for _ in range(round(40 * N / SR)):  # audible crackle
        at, amp, width = rng.randrange(N), rng.random() ** 3 * rng.choice((-1, 1)) * .6, rng.randint(12, 50)
        for k in range(width):
            buf[(at + k) % N] += amp * math.exp(-k * 4 / width) * (1 if k else -1)
    for _ in range(round(1.6 * N / SR)):  # the odd pop, ringing briefly
        at, amp, freq = rng.randrange(N), rng.uniform(.5, 1.0) * rng.choice((-1, 1)), rng.uniform(900, 2600)
        for k in range(600):
            buf[(at + k) % N] += amp * math.exp(-k / 90) * math.sin(TAU * freq * k / SR)
    return buf, .04


def rain():
    rng, buf = random.Random(21), blank()
    bed = svf([rng.uniform(-1, 1) for _ in range(N)], 3000, 1.2, 'band')
    for i in range(N):
        buf[i] = bed[i] * 1.8 * (1 + .25 * math.sin(TAU * 2 * i / N))
    for _ in range(round(90 * N / SR)):  # single drops
        at, amp, freq = rng.randrange(N), rng.uniform(.05, .3), rng.uniform(2200, 6000)
        for k in range(260):
            buf[(at + k) % N] += amp * math.exp(-k / 35) * math.sin(TAU * freq * k / SR)
    return buf, .12


def wind():
    rng = random.Random(33)
    cutoff = lambda i: 450 + 350 * math.sin(TAU * i / N) + 150 * math.sin(TAU * 3 * i / N + 1.3)
    out = svf([rng.uniform(-1, 1) for _ in range(N)], cutoff, .12, 'band')
    return [v * (.6 + .4 * math.sin(TAU * 2 * i / N + .7)) for i, v in enumerate(out)], .2


def waves():
    rng = random.Random(41)
    swell = [(.5 - .5 * math.cos(TAU * 2 * i / N)) ** 1.5 for i in range(N)]
    body = svf([rng.uniform(-1, 1) * (.15 + swell[i]) for i in range(N)], lambda i: 400 + 2600 * swell[i], .8)
    foam = high_pass_noise(rng)
    return [b + .12 * foam() * swell[i] ** 2 for i, b in enumerate(body)], .24


def sweep_effect(rising):
    rng, buf = random.Random(51), blank()
    level = (lambda p: p) if rising else (lambda p: 1 - p)
    dry = [rng.uniform(-1, 1) * level(i / N) ** 2.2 for i in range(N)]
    cutoff = lambda i: 250 * (6000 / 250) ** level(i / N)
    noise_part = svf(dry, cutoff, .6)
    phase = 0.0
    for i in range(N):
        p = level(i / N)
        phase += 180 * (1800 / 180) ** p / SR
        buf[i] = noise_part[i] * 2.2 + .25 * p ** 1.5 * math.sin(TAU * phase) + .1 * p ** 2 * math.sin(TAU * 2 * phase)
    return buf, .2


def riser():
    return sweep_effect(True)


def downlifter():
    return sweep_effect(False)


def impact():
    buf = blank()
    body, crack = band_pass(180, .7), high_pass_noise()
    for beat, gain in ((0, 1.0), (8, .75)):
        play(buf, beat, lambda t: math.tanh(1.5 * math.sin(TAU * sweep_phase(t, 95, 32, 6))) * math.exp(-t * 1.1) * min(1, t / .002) + body(noise()) * 2 * math.exp(-t * 6) + .3 * crack() * math.exp(-t * 40), 3.5, gain)
    return buf, .5


def drone():
    buf = blank()
    voices = ((33, 1.0), (40, .7), (45, .6), (52, .4), (57, .25))
    for index, (midi, level) in enumerate(voices):
        for cents, phase in ((-7, 0.0), (7, 2.1)):
            loop_voice(buf, midi, 'saw', 600, level * .35, cents, .25, index % 3 + 1, phase)
    return buf, .4


def pulse_gate():
    pad = ensemble(chords_with_bass(0, 12), soft_saw(2200), 1.0, .05, .05, .002, spread=(-10, 0, 10))
    pattern = 'x.xx.xx.x.xx.xx.' * 4
    step = N / len(pattern)
    out, gate = [0.0] * N, 0.0
    for i in range(N):
        gate += ((1.0 if pattern[int(i / step)] == 'x' else 0.0) - gate) * .01
        out[i] = pad[i] * gate
    return out, .22


def cymbal_swell():
    hiss = high_pass_noise(random.Random(62))
    period = N // 2
    buf = [0.0] * N
    for i in range(N):
        pos = i % period
        buf[i] = hiss() * (pos / period) ** 2.5 * min(1.0, (period - pos) / 90)
    return buf, .3


SAMPLES = [
    ('vinyl', 'Vinyl Crackle', vinyl), ('rain', 'Rain', rain), ('wind', 'Wind', wind), ('waves', 'Waves', waves),
    ('riser', 'Riser', riser), ('downlifter', 'Downlifter', downlifter), ('impact', 'Impact', impact),
    ('drone', 'Drone', drone), ('pulse-gate', 'Pulse Gate', pulse_gate), ('cymbal-swell', 'Cymbal Swell', cymbal_swell),
]
