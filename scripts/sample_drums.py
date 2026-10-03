"""Drum and percussion loops. Each builder returns (samples, reverb room)."""
import math, random
from synth import TAU, band_pass, high_pass_noise, sweep_phase
from sample_core import blank, lay

noise = lambda: random.uniform(-1, 1)


def kick(top=150, bottom=46, rate=26, decay=8.0, drive=2.2):
    return lambda t: .9 * math.tanh(drive * math.sin(TAU * sweep_phase(t, top, bottom, rate)) * math.exp(-t * decay)) + .2 * noise() * math.exp(-t * 240)


def snare():
    hiss = high_pass_noise()
    return lambda t: math.tanh(1.5 * (.45 * (math.sin(TAU * 186 * t) + .6 * math.sin(TAU * 332 * t)) * math.exp(-t * 22) + .8 * hiss() * math.exp(-t * 15) + .4 * noise() * math.exp(-t * 34)))


def rim():
    return lambda t: (math.sin(TAU * 820 * t) + .5 * math.sin(TAU * 1730 * t) + .3 * noise()) * math.exp(-t * 70)


def hat(seconds):
    hiss, previous = high_pass_noise(), [0.0]

    def fn(t):
        metal = sum(1 if math.sin(TAU * f * t) > 0 else -1 for f in (3141, 4270, 5390, 6512, 7903, 9330)) / 6
        value = (.5 * metal + .7 * hiss()) * math.exp(-t * 7 / seconds)
        out, previous[0] = value - previous[0], value
        return out
    return fn


def tom(freq, decay=9.0):
    return lambda t: math.sin(TAU * sweep_phase(t, freq * 1.5, freq, 22)) * math.exp(-t * decay) + .25 * noise() * math.exp(-t * 60)


def conga(freq):
    return lambda t: .9 * math.sin(TAU * sweep_phase(t, freq * 1.18, freq, 60)) * math.exp(-t * 15) + .2 * noise() * math.exp(-t * 90)


def cowbell():
    body = band_pass(760, .9)
    sq = lambda f, t: 1 if math.sin(TAU * f * t) > 0 else -1
    return lambda t: 1.6 * body(sq(587, t) + sq(845, t)) * math.exp(-t * 11) * min(1, t / .001)


def tambourine():
    grain, previous = high_pass_noise(), [0.0]

    def fn(t):
        jingle = sum(1 if math.sin(TAU * f * t) > 0 else -1 for f in (4870, 6110, 7340, 8950)) / 4
        value = (.6 * grain() + .35 * jingle) * math.exp(-t * 26) * min(1, t / .004)
        out, previous[0] = value - previous[0], value
        return out
    return fn


def crash():
    hiss = high_pass_noise()
    return lambda t: (.7 * hiss() + .3 * sum(1 if math.sin(TAU * f * t) > 0 else -1 for f in (2830, 4090, 5370, 6830, 8210)) / 5) * (math.exp(-t * 1.5) * .8 + math.exp(-t * 14) * .5) * min(1, t / .002)


def clap():
    """Three quick bursts, the last the loudest, like a small group clapping together."""
    body, air = band_pass(1250, 1.6), high_pass_noise()
    bursts = ((0, .5), (.015, .6), (.03, 1))
    return lambda t: body(noise()) * 2.2 * sum(level * math.exp(-(t - at) * 26) for at, level in bursts if t >= at) + .25 * air() * math.exp(-t * 40)


def shaker():
    grain = high_pass_noise()
    return lambda t: grain() * math.sin(min(1, t / .012) * math.pi / 2) * math.exp(-t * 38)


def loop(*layers, room=.12):
    """layers: (bars, factory, length[, gain]) tuples laid onto one buffer."""
    buf = blank()
    for bars, factory, length, *gain in layers:
        lay(buf, bars, factory, length, *gain)
    return buf, room


def four(pattern):
    return [pattern] * 4


def kick_four():
    return loop((four('x...x...x...x...'), kick, .45))


def kick_broken():
    a, b = 'x.....x..x..x...', 'x..x..x...x..x..'
    return loop(([a, a, a, b], kick, .45))


def snare_backbeat():
    a = '....x..o....x..o'
    return loop(([a, a, a, '....x.......5.79'], snare, .35))


def snare_roll():
    return loop((['5...5...5...5...', '5.5.5.5.5.5.5.5.', '5555555555555555', '55555555555555555555555555555555'], snare, .3, 1.0, .06, (.3, 1.0)), room=.18)


def rim_clave():
    a = 'x..x..x...x.x...'
    return loop(([a, a, a, 'x..x..x...x.o.o.'], rim, .15))


def hats_eighths():
    return loop((four('5.9.5.9.5.9.5.9.'), lambda: hat(.05), .15, .6), room=.08)


def hats_sixteenths():
    a = '9344634483446344'
    return loop(([a, a, a, a], lambda: hat(.045), .15, .6), (['.' * 16] * 3 + ['..............7.'], lambda: hat(.3), .6, .5), room=.1)


def open_hats():
    return loop((four('..x...x...x...x.'), lambda: hat(.3), .6, .6), room=.1)


def trap_hats():
    plain = '7...5...7...5...7...5...7...5...'
    double = '7...5...7...5...7...5...7.5.7.5.'
    roll = '7...5...7...5...7...5...7...5679'
    return loop(([plain, double, plain, roll], lambda: hat(.04), .12, .55), room=.08)


def toms():
    floor_bars = ['x.....x.....x...'] * 3 + ['............7799']
    mid_bars = ['....o...o.......'] * 3 + ['..........8.9...']
    hi_bars = ['................'] * 3 + ['........9.7.....']
    return loop((floor_bars, lambda: tom(95), .6, .9), (mid_bars, lambda: tom(140), .5, .85), (hi_bars, lambda: tom(205), .4, .8), room=.16)


def congas():
    lo = ['x.....o.....x.o.'] * 4
    hi = ['..5.x.x...5.x.x.'] * 4
    return loop((lo, lambda: conga(170), .35, .9), (hi, lambda: conga(265), .3, .75), room=.1)


def tambourine_loop():
    return loop((four('3535953535359535'), tambourine, .15, .8), room=.08)


def cowbell_loop():
    a = 'x.....o...o.x...'
    return loop(([a, a, a, 'x.....o...o.o.o.'], cowbell, .4, .7), room=.1)


def break_loop():
    kick_a, kick_b = 'x.....x.x.x.....', 'x..x..x...x..x..'
    snare_a, snare_b = '....x..o.o..x..o', '....x..o.o..x.xo'
    return loop(
        ([kick_a, kick_b, kick_a, kick_b], kick, .45),
        ([snare_a, snare_a, snare_a, snare_b], snare, .35, .9),
        (four('x.x.x.x.x.x.x.x.'), lambda: hat(.05), .15, .5),
        room=.12)


def kit_straight():
    k, h = 'x.......x.x.....', 'x.o.x.o.x.o.x.o.'
    return loop(
        ([k, k, k, 'x.......x.......'], kick, .45),
        (['....x.......x...'] * 3 + ['....x...6.7.8.9.'], snare, .35),
        ([h, h, h, 'x.o.x.o.x.o.x...'], lambda: hat(.05), .15, .5),
        (['.' * 16] * 3 + ['..............x.'], lambda: hat(.3), .6, .5),
        room=.12)


def kit_halftime():
    return loop(
        (four('x.....x...x.....'), kick, .45),
        (four('........x.......'), snare, .4),
        (four('x.xxx.x.x.xxx.xo'), lambda: hat(.04), .12, .5),
        room=.2)


def crash_cymbal():
    return loop((['x...............', '................', 'o...............', '................'], crash, 4.0, .7), room=.25)


def clap_loop():
    return loop((four('....x.......x...'), clap, .4, .8), room=.14)


def shaker_loop():
    return loop((four('x.5.x.5.x.5.x.5.'), shaker, .3, .8), room=.06)


SAMPLES = [
    ('kick-four', 'Kick Four', kick_four),
    ('kick-broken', 'Kick Broken', kick_broken),
    ('snare-backbeat', 'Snare Backbeat', snare_backbeat),
    ('snare-roll', 'Snare Roll', snare_roll),
    ('clap', 'Clap', clap_loop),
    ('rim-clave', 'Rim Clave', rim_clave),
    ('hats-eighths', 'Hats Eighths', hats_eighths),
    ('hats-sixteenths', 'Hats Sixteenths', hats_sixteenths),
    ('open-hats', 'Open Hats', open_hats),
    ('trap-hats', 'Trap Hats', trap_hats),
    ('toms', 'Toms', toms),
    ('congas', 'Congas', congas),
    ('tambourine', 'Tambourine', tambourine_loop),
    ('shaker', 'Shaker', shaker_loop),
    ('cowbell', 'Cowbell', cowbell_loop),
    ('break', 'Break', break_loop),
    ('kit-straight', 'Kit Straight', kit_straight),
    ('kit-halftime', 'Kit Halftime', kit_halftime),
    ('crash', 'Crash', crash_cymbal),
]
