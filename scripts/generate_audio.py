import math, random, wave, struct, json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'dist'
SR = 22050
BPM = 112
BEAT = 60 / BPM
N = round(SR * BEAT * 8)
PEAK_COUNT = 512
random.seed(17)

def add(buf, onset, dur, fn, gain=1):
    start = round(onset * SR)
    for j in range(round(dur * SR)):
        if start+j >= N: break
        buf[start+j] += gain * fn(j/SR)

def note(m): return 440 * 2 ** ((m-69)/12)

names = [
 ['Four on the floor','Offbeat','Half time','Double kick'],
 ['Backbeat','Clap','Rim','Broken beat'],
 ['Closed hats','Open hats','Shaker','Skip hats'],
 ['Root','Walk','Low pulse','Octaves'],
 ['Soft chords','Little steps','Glass','Long chords'],
 ['Room','Drift','Rain','Horizon'],
 ['Soft pulse','Steps','Echo','Rise'],
 ['Invention','Answer','Sequence','Cadence']
]
clips = []
for track in range(len(names)):
    row=[]
    for variant in range(4):
        buf=[0.0]*N
        events=[]
        if track==0:
            beats=[[0,1,2,3,4,5,6,7],[0,1.5,2,3.5,4,5.5,6,7.5],[0,3,4,6.5],[0,.75,1,2,3,3.75,4,5,6,7]][variant]
            events=[{'beat':b,'dur':min(1,(beats[i+1] if i+1<len(beats) else 8)-b)} for i,b in enumerate(beats)]
            for b in beats:
                add(buf,b*BEAT,.38,lambda t: math.sin(2*math.pi*(45*t+3.8*(1-math.exp(-t*28))))*math.exp(-t*14),.72)
        elif track==1:
            beats=[1,3,5,7] if variant!=3 else [1,2.75,5,6.5,7]
            events=[{'beat':b,'dur':.25 if b%1 else 1} for b in beats]
            for b in beats:
                if variant==2:
                    add(buf,b*BEAT,.13,lambda t: math.sin(2*math.pi*820*t)*math.exp(-t*65),.26)
                else:
                    add(buf,b*BEAT,.23,lambda t: (random.uniform(-1,1)*.6+math.sin(2*math.pi*180*t)*.3)*math.exp(-t*24),.42)
        elif track==2:
            for step in range(16 if variant!=2 else 32):
                b=step*(.5 if variant!=2 else .25)
                if variant==3 and step%4==2: continue
                events.append({'beat':b,'dur':.25 if variant==2 else .5})
                duration=.22 if variant==1 and step%2 else .075
                add(buf,b*BEAT,duration,lambda t,d=duration: random.uniform(-1,1)*math.exp(-t*(7/d)),.15 if step%2 else .1)
        elif track==3:
            patterns=[[33,33,36,31,33,33,40,36],[33,36,40,43,33,36,31,36],[33,33,33,31,33,33,36,31],[33,45,33,45,36,48,31,43]]
            for b,m in enumerate(patterns[variant]):
                freq=note(m)
                add(buf,b*BEAT,BEAT*.84,lambda t,f=freq: (math.sin(2*math.pi*f*t)+.16*math.sin(2*math.pi*2*f*t))*min(1,t/.012)*math.exp(-t*5),.34)
        elif track==4:
            chords=[[57,60,64,67],[53,57,60,64]]
            for bar,chord in enumerate(chords):
                if variant in [0,3]:
                    for m in chord:
                        add(buf,bar*4*BEAT,4*BEAT,lambda t,f=note(m): (math.sin(2*math.pi*f*t)+.12*math.sin(2*math.pi*f*2*t))*min(1,t/.035)*math.exp(-t*(1.8 if variant==0 else .75)),.1)
                else:
                    for step in range(8):
                        f=note(chord[(step+variant)%4]+(12 if variant==2 else 0))
                        add(buf,(bar*4+step*.5)*BEAT,BEAT*.8,lambda t,f=f: math.sin(2*math.pi*f*t)*min(1,t/.007)*math.exp(-t*8),.2)
        elif track==5:
            for i in range(N):
                t=i/SR
                envelope=math.sin(math.pi*i/N)**2
                buf[i]=envelope*(.022*math.sin(2*math.pi*note([69,72,76,67][variant])*t)+.012*math.sin(2*math.pi*note(81)*t)+random.uniform(-.01,.01))
        elif track==6:
            patterns=[[0,2,4,6],[0,.75,2,3.5,4,4.75,6,7.5],[0,1.5,3,4,5.5,7],[0,1,2,3,4,5,6,7]]
            for step,b in enumerate(patterns[variant]):
                freq=note([69,72,76,79][(step+variant)%4])
                add(buf,b*BEAT,.34,lambda t,f=freq: (math.sin(2*math.pi*f*t)+.22*math.sin(2*math.pi*f*2*t))*min(1,t/.008)*math.exp(-t*15),.13)
        else:
            # Original two-voice invention: imitation, sequence, and a minor-key cadence.
            upper=[
                [69,72,71,69,68,71,76,74,72,71,69,68,69,72,71,69],
                [72,76,74,72,71,74,79,77,76,74,72,71,72,76,74,72],
                [74,77,76,74,72,76,81,79,77,76,74,72,71,74,72,71],
                [76,74,72,71,69,72,71,69,68,71,76,74,72,71,68,69]
            ][variant]
            lower=[
                [45,52,48,52,41,48,45,52],
                [48,55,52,55,43,50,47,55],
                [50,57,53,57,45,52,48,52],
                [52,47,48,43,40,47,52,45]
            ][variant]
            events=[{'pitch':m,'beat':i*.5,'dur':.5,'voice':'treble'} for i,m in enumerate(upper)]
            events += [{'pitch':m,'beat':i,'dur':1,'voice':'bass'} for i,m in enumerate(lower)]
            for event in events:
                freq=note(event['pitch']);duration=event['dur']*BEAT*.94
                def piano(t,f=freq,d=duration):
                    attack=min(1,t/.004)
                    release=min(1,max(0,(d-t)/.035))
                    tone=sum(amp*math.sin(2*math.pi*f*h*math.sqrt(1+.00012*h*h)*t)*math.exp(-t*(1.8+.55*h)) for h,amp in [(1,1),(2,.42),(3,.2),(4,.1),(6,.045)])
                    return attack*release*tone
                add(buf,event['beat']*BEAT,duration,piano,.19 if event['voice']=='treble' else .16)
        # A tiny fade keeps loop boundaries and transport changes clean.
        for i in range(160):
            buf[i]*=i/160
            buf[-1-i]*=i/160
        samples=[max(-.95,min(.95,x)) for x in buf]
        filename=f'audio/{track}-{variant}.wav'
        with wave.open(str(OUT/filename),'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes(struct.pack('<'+'h'*N,*[round(x*32767) for x in samples]))
        peaks=[]
        for p in range(PEAK_COUNT):
            chunk=samples[p*N//PEAK_COUNT:(p+1)*N//PEAK_COUNT]
            peaks.append(round(max(abs(x) for x in chunk),4))
        clip={'name':names[track][variant],'file':filename,'peaks':peaks}
        if events:clip['notes']=events
        row.append(clip)
    # Test arrangement: repeat the same groove, without changing clip variants.
    clips.append([dict(row[0]) for _ in range(4)])
(OUT/'clips.js').write_text('window.MUSIC_CLIPS='+json.dumps(clips,separators=(',',':'))+';\n')
print(f'Generated {len(clips)*4} original 2-bar loops at {BPM} BPM with measured waveform peaks.')
