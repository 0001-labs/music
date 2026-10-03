"""Small standard-library synthesis helpers shared by the audio generators."""
import math, random, struct, wave

SR = 44100
TAU = 2 * math.pi


def note(m):
    return 440 * 2 ** ((m - 69) / 12)


def table(weights, size=2048):
    """One period of a tone built from (harmonic, amplitude) pairs, with a guard sample."""
    period = [sum(a * math.sin(TAU * k * i / size) for k, a in weights) for i in range(size)]
    peak = max(abs(v) for v in period) or 1
    period = [v / peak for v in period]
    return period + period[:1]


def harmonics(freq, rolloff=1.0, formants=None, limit=None, odd=False):
    """Harmonic weights below Nyquist. Formants are (centre, bandwidth, level) resonances."""
    top = min(limit or SR, SR / 2 - 1000)
    result = []
    for k in range(1, 200):
        if odd and k % 2 == 0:
            continue
        f = freq * k
        if f > top:
            break
        gain = 1 / k ** rolloff
        if formants:
            gain *= 0.012 + sum(level / (1 + ((f - centre) / width) ** 2) for centre, width, level in formants)
        result.append((k, gain))
    return result


def voice(buf, start, count, freq, tab, gain, attack=.3, release=.5, vibrato=0.0, rate=5.5, delay=.35, rng=random):
    """Add a sustained wavetable voice; writes wrap around so loops stay seamless."""
    size, n, length = len(tab) - 1, len(buf), count / SR
    phase, wobble = rng.random() * size, rng.random() * TAU
    drift_rate, drift_phase = .2 + rng.random() * .3, rng.random() * TAU
    step = size * freq / SR
    for i in range(count):
        t = i / SR
        bend = vibrato * min(1, t / delay) * math.sin(wobble + TAU * rate * t) + .0012 * math.sin(drift_phase + TAU * drift_rate * t)
        phase += step * (1 + bend)
        if phase >= size:
            phase -= size
        j = int(phase)
        env = min(1.0, t / attack, (length - t) / release)
        buf[(start + i) % n] += gain * env * (tab[j] + (tab[j + 1] - tab[j]) * (phase - j))


def high_pass_noise(rng=random):
    previous = [0.0]
    def sample():
        value = rng.uniform(-1, 1)
        out = (value - previous[0]) * .5
        previous[0] = value
        return out
    return sample


def band_pass(freq, q):
    """Stateful two-pole band-pass filter."""
    w = TAU * freq / SR
    alpha = math.sin(w) / (2 * q)
    b0, a0, a1, a2 = alpha, 1 + alpha, -2 * math.cos(w), 1 - alpha
    state = [0.0, 0.0, 0.0, 0.0]
    def run(x):
        y = (b0 * x - b0 * state[1] - a1 * state[2] - a2 * state[3]) / a0
        state[1], state[0] = state[0], x
        state[3], state[2] = state[2], y
        return y
    return run


def reverb(dry, wet=.25, decay=.8, damp=.35):
    """Schroeder reverb run twice around the buffer, so the tail wraps into the loop start."""
    n = len(dry)
    out = list(dry)
    combs = [[0.0] * d for d in (1557, 1617, 1491, 1422, 1277, 1356)]
    comb_at, low = [0] * 6, [0.0] * 6
    passes = [[0.0] * d for d in (225, 556, 441)]
    pass_at = [0] * 3
    for lap in range(2):
        for i in range(n):
            x, total = dry[i], 0.0
            for c in range(6):
                line = combs[c]
                j = comb_at[c]
                y = line[j]
                low[c] = y * (1 - damp) + low[c] * damp
                line[j] = x + low[c] * decay
                comb_at[c] = j + 1 if j + 1 < len(line) else 0
                total += y
            total /= 6
            for a in range(3):
                line = passes[a]
                j = pass_at[a]
                delayed = line[j]
                line[j] = total + delayed * .5
                total = delayed - total * .5
                pass_at[a] = j + 1 if j + 1 < len(line) else 0
            if lap:
                out[i] = dry[i] + wet * total
    return out


def sweep_phase(t, start, end, rate):
    """Phase in cycles of a tone gliding exponentially from `start` to `end` Hz."""
    return end * t + (start - end) / rate * (1 - math.exp(-rate * t))


def svf(buf, cutoff, damp=.5, mode='low', laps=2):
    """State-variable filter over a looping buffer. `cutoff` is Hz, a list, or a function of the
    sample index; the buffer is run `laps` times so the output starts in its steady state."""
    n = len(buf)
    out = [0.0] * n
    low = band = f = 0.0
    for lap in range(laps):
        last = lap == laps - 1
        for i in range(n):
            if i % 16 == 0:
                fc = cutoff(i) if callable(cutoff) else cutoff[i] if isinstance(cutoff, list) else cutoff
                f = 2 * math.sin(math.pi * min(fc, 5000) / SR)
            low += f * band
            high = buf[i] - low - damp * band
            band += f * high
            if last:
                out[i] = low if mode == 'low' else band if mode == 'band' else high
    return out


def karplus(freq, seconds, rng=random, decay=.997, bright=.5):
    """Plucked string (Karplus-Strong with a tuned fractional delay)."""
    total = SR / freq - .5
    length = int(total - .5)
    frac = total - length
    a = (1 - frac) / (1 + frac)
    ring = [0.0] * length
    last = 0.0
    for i in range(length):
        raw = rng.uniform(-1, 1)
        last += bright * (raw - last)
        ring[i] = last
    count, at, prev, ap_x, ap_y = round(seconds * SR), 0, 0.0, 0.0, 0.0
    out = [0.0] * count
    fade = round(.03 * SR)
    for i in range(count):
        s = ring[at]
        mean = (s + prev) * .5 * decay
        y = a * mean + ap_x - a * ap_y
        ap_x, ap_y, prev = mean, y, s
        ring[at] = y
        at = at + 1 if at + 1 < length else 0
        out[i] = s * min(1.0, (count - i) / fade)
    return out


def write_wav(path, samples):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes(struct.pack('<' + 'h' * len(samples), *[round(max(-1, min(1, v)) * 32767) for v in samples]))
