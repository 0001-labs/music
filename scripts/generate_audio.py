import math, random, json
from pathlib import Path
from synth import SR, TAU, note, table, harmonics, voice, high_pass_noise, reverb, write_wav

OUT = Path(__file__).resolve().parents[1] / 'dist'
BPM = 112
BEAT = 60 / BPM
N = round(SR * BEAT * 8)
PEAK_COUNT = 512
random.seed(17)

def add(buf, onset, dur, fn, gain=1):
    start = round(onset * SR)
    for j in range(round(dur * SR)):
        buf[(start+j) % len(buf)] += gain * fn(j/SR)

def kick(t):
    body = math.sin(TAU*(46*t+4.2*(1-math.exp(-t*30))))*math.exp(-t*8.5)
    return .9*math.tanh(2.2*body)+.22*random.uniform(-1,1)*math.exp(-t*220)

def snare():
    hiss = high_pass_noise()
    def fn(t):
        tone = (math.sin(TAU*186*t)+.6*math.sin(TAU*332*t))*math.exp(-t*22)
        return math.tanh(1.5*(.45*tone+.8*hiss()*math.exp(-t*15)+.4*random.uniform(-1,1)*math.exp(-t*34)))
    return fn

def rim(t):
    return (math.sin(TAU*820*t)+.5*math.sin(TAU*1730*t)+.3*random.uniform(-1,1))*math.exp(-t*70)

def hat(duration):
    hiss, previous = high_pass_noise(), [0.0]
    def fn(t):
        metal = sum(1 if math.sin(TAU*f*t)>0 else -1 for f in (3141,4270,5390,6512,7903,9330))/6
        value = (.5*metal+.7*hiss())*math.exp(-t*(7/duration))
        out = value-previous[0]; previous[0] = value
        return out
    return fn

def bass(f):
    def fn(t):
        tone = sum(math.sin(TAU*f*k*t)/k*math.exp(-t*2.2*(k-1)) for k in range(1,9))
        return min(1,t/.006)*math.exp(-t*3.5)*math.tanh(1.3*tone)
    return fn

def electric_piano(f, decay):
    def fn(t):
        index = 2.4*math.exp(-t*6)+.3
        a = math.sin(TAU*f*t+index*math.sin(TAU*f*t))
        b = math.sin(TAU*f*1.003*t+index*math.sin(TAU*f*1.003*t))
        bell = .2*math.sin(TAU*f*4*t)*math.exp(-t*12)
        return min(1,t/.008)*math.exp(-t*decay)*(1+.1*math.sin(TAU*4.6*t))*(.5*a+.5*b+bell)
    return fn

def pluck(buf, onset, f, gain, dur=.6):
    """Karplus-Strong string: a noise burst circulating through an averaging delay line."""
    line = [random.uniform(-1,1) for _ in range(max(2,round(SR/f)))]
    start, count, i = round(onset*SR), round(dur*SR), 0
    for j in range(count):
        y = line[i]; nxt = i+1 if i+1 < len(line) else 0
        line[i] = .997*.5*(y+line[nxt]); i = nxt
        buf[(start+j) % len(buf)] += gain*y*min(1,(count-j)/(.03*SR))

def grand_piano(f, d):
    partials = [(h, f*h*math.sqrt(1+.0003*h*h), 1/h**1.25) for h in range(1,9) if f*h < SR/2-1000]
    def fn(t):
        tone = sum(amp*math.exp(-t*(1.4+.5*h))*.5*(math.sin(TAU*fh*t)+math.sin(TAU*fh*1.0012*t)) for h,fh,amp in partials)
        return min(1,t/.003)*min(1,max(0,(d-t)/.035))*(tone+.08*random.uniform(-1,1)*math.exp(-t*300))
    return fn

# One eight-bar loop per track over a shared progression: Am7, Fmaj7, Cmaj7, G6, twice.
CHORDS = ['Am7', 'Fmaj7', 'Cmaj7', 'G6']
KEYS = [[57,60,64,67],[53,57,60,64],[55,59,60,64],[55,59,62,64]]
BASS = [[33,33,40,36],[29,29,36,33],[36,36,43,40],[31,31,38,35]]
PULSE = [[69,72,76,72,79,76,72,76],[69,72,77,72,81,77,72,77],[67,72,76,72,79,76,72,76],[67,71,74,71,79,74,71,74]]
PAD = [[45,57,64,69],[41,57,65,69],[48,55,64,67],[43,55,62,67]]
LEFT = [[45,52,57,52],[41,48,53,48],[48,55,60,55],[43,50,55,50]]
# Right-hand melody as (pitch, beats) per bar; the second four bars answer the first.
MELODY = [
    [(76,2),(74,1),(72,1)], [(69,1.5),(72,.5),(76,2)], [(79,2),(76,1),(74,1)], [(74,1.5),(71,.5),(67,1),(71,1)],
    [(72,1),(76,1),(81,2)], [(79,1),(77,1),(76,1),(72,1)], [(76,1.5),(79,.5),(84,2)], [(83,1),(81,1),(79,1),(74,1)]
]
BARS = 8
FULL = N * 4
TRACKS = 8
clips = []
for track in range(TRACKS):
    buf = [0.0] * FULL
    events = []  # (beat within the eight bars, event)
    for bar in range(BARS):
        chord, at = bar % 4, bar * 4
        if track == 0:
            for b in range(4):
                add(buf, (at+b)*BEAT, .5, kick, .62); events.append((at+b, {'dur':1}))
        elif track == 1:
            for b in (1, 3):
                add(buf, (at+b)*BEAT, .32, snare(), .42); events.append((at+b, {'dur':1}))
        elif track == 2:
            for step in range(8):
                add(buf, (at+step*.5)*BEAT, .075, hat(.075), .26 if step%2 else .18); events.append((at+step*.5, {'dur':.5}))
        elif track == 3:
            for b, m in enumerate(BASS[chord]):
                add(buf, (at+b)*BEAT, BEAT*.9, bass(note(m)), .36); events.append((at+b, {'pitch':m,'dur':1}))
        elif track == 4:
            for m in KEYS[chord]:
                add(buf, at*BEAT, 2.4*BEAT, electric_piano(note(m), 1.5), .11)
                add(buf, (at+2.5)*BEAT, 1.4*BEAT, electric_piano(note(m), 3), .08)
                events.append((at, {'pitch':m,'dur':4}))
        elif track == 5:
            for m, level in zip(PAD[chord], (.03, .026, .022, .018)):
                for cents in (-8, 0, 8):
                    f = note(m) * 2 ** (cents/1200)
                    voice(buf, round(at*BEAT*SR), round(4*BEAT*SR + .3*SR), f, table(harmonics(f, 1.4, [(600,900,1),(2400,1200,.25)])), level, attack=.5, release=.6, vibrato=.003)
        elif track == 6:
            for step, m in enumerate(PULSE[chord]):
                pluck(buf, (at+step*.5)*BEAT, note(m), .17, .5); events.append((at+step*.5, {'pitch':m,'dur':.5}))
        else:
            beat = at
            for m, length in MELODY[bar]:
                events.append((beat, {'pitch':m,'dur':length,'voice':'treble'})); beat += length
            for b, m in enumerate(LEFT[chord]):
                events.append((at+b, {'pitch':m,'dur':1,'voice':'bass'}))
    if track == 5:
        breath = high_pass_noise()
        for i in range(FULL): buf[i] += .008 * breath()
    if track == 7:
        for beat, event in events:
            duration = event['dur'] * BEAT * .96
            add(buf, beat*BEAT, duration + .25, grand_piano(note(event['pitch']), duration + .25), .15 if event['voice']=='treble' else .1)
    # Room on the pitched and snare tracks; the tail wraps around so the loop stays seamless.
    room = {1:.1, 4:.22, 5:.3, 6:.2, 7:.2}.get(track)
    if room: buf = reverb(buf, room)
    samples = [max(-.95, min(.95, x)) for x in buf]
    row = []
    for part in range(4):
        piece = samples[part*N:(part+1)*N]
        filename = f'audio/{track}-{part}.wav'
        write_wav(OUT/filename, piece)
        peaks = [round(max(abs(x) for x in piece[p*N//PEAK_COUNT:(p+1)*N//PEAK_COUNT]), 4) for p in range(PEAK_COUNT)]
        clip = {'name': f'{CHORDS[part%2*2]} – {CHORDS[part%2*2+1]}', 'file': filename, 'peaks': peaks}
        row.append(clip)
    clips.append(row)
(OUT/'clips.js').write_text('window.MUSIC_CLIPS='+json.dumps(clips,separators=(',',':'))+';\n')
print(f'Generated {len(clips)} eight-bar loops at {BPM} BPM with measured waveform peaks.')
