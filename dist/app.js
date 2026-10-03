'use strict';
// Throwaway prototype: one square launches a two-bar loop on its track.
const clips = window.MUSIC_CLIPS;
const names = ['Kick', 'Snare', 'Hats', 'Bass', 'Keys', 'Air'];
const kinds = ['Drum machine', 'Drum machine', 'Percussion', 'Warm synth', 'Electric keys', 'Texture'];
const baseTempo = 112;
const selected = Array(6).fill(0);
const muted = Array(6).fill(false);
const solo = Array(6).fill(false);
const levels = [.9, .9, .7, .9, .85, .8];
const queued = Array(6).fill(null);
const transitions = Array(6).fill(null);
let tempo = baseTempo, ctx, master, analyser, buffers, loading, nodes = [], sources = [];
let running = false, starting = false, origin = 0, pausedBeat = 0, epoch = 0;
const liveSources = new Set();
const $ = (selector) => document.querySelector(selector);
const play = $('#play');
const message = $('#message');
const rows = [];
const cells = [];

function waveform(peaks) {
  const max = Math.max(...peaks, .001);
  return `<svg class="waveform" viewBox="0 0 128 40" preserveAspectRatio="none" aria-hidden="true">${peaks.map((p, i) => {
    const h = Math.max(1, p / max * 36);
    return `<rect x="${i * 2}" y="${(40-h)/2}" width="1" height="${h}" fill="currentColor"/>`;
  }).join('')}</svg>`;
}

$('#tracks').innerHTML = names.map((name, t) => `<div class="track-row" data-track="${t}">
  <div class="track-info"><div><div class="track-title"><span class="track-number">${String(t+1).padStart(2,'0')}</span><span class="track-name">${name}</span></div><p class="track-kind">${kinds[t]}</p></div><div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button><span class="track-dot" aria-hidden="true"></span></div></div>
  <div class="clips">${clips[t].map((clip,c) => `<button class="clip" data-clip="${t},${c}" aria-label="Play ${clip.name} on ${name}" aria-pressed="${c===0}"><span class="clip-name">${clip.name}</span>${waveform(clip.peaks)}<span class="clip-bottom"><span class="clip-symbol" aria-hidden="true">▶</span><span>2 bars</span></span><span class="clip-progress"></span></button>`).join('')}</div>
  <div class="level"><output id="level-${t}">${Math.round(levels[t]*100)}%</output><input type="range" data-level="${t}" min="0" max="1" step="0.01" value="${levels[t]}" aria-label="${name} volume"></div></div>`).join('');
for (let t=0;t<6;t++) {
  rows.push($(`[data-track="${t}"]`));
  cells.push(Array.from(rows[t].querySelectorAll('.clip')));
}

function audible(t) { return !muted[t] && (!solo.some(Boolean) || solo[t]); }
function updateGain(t) {
  if (nodes[t]) nodes[t].gain.setTargetAtTime(audible(t) ? levels[t] : 0, ctx.currentTime, .012);
}
function render() {
  $('#play-label').textContent = starting ? 'Loading' : running ? 'Pause' : 'Play';
  play.querySelector('.play-icon').textContent = running ? 'Ⅱ' : '▶';
  play.setAttribute('aria-label', running ? 'Pause all tracks' : 'Play all tracks');
  play.disabled = starting;
  for (let t=0;t<6;t++) {
    rows[t].classList.toggle('silent', !audible(t));
    rows[t].classList.toggle('audible', running && audible(t));
    const mute = rows[t].querySelector('[data-mute]');
    const soloButton = rows[t].querySelector('[data-solo]');
    mute.classList.toggle('muted',muted[t]); mute.setAttribute('aria-pressed',muted[t]);
    soloButton.classList.toggle('soloed',solo[t]); soloButton.setAttribute('aria-pressed',solo[t]);
    for (let c=0;c<4;c++) {
      const cell=cells[t][c];
      const pending=(queued[t] || transitions[t])?.variant===c;
      cell.classList.toggle('active',selected[t]===c);
      cell.classList.toggle('playing',running && selected[t]===c && audible(t));
      cell.classList.toggle('queued',pending);
      cell.setAttribute('aria-pressed',selected[t]===c);
      cell.querySelector('.clip-symbol').textContent=pending ? '◷' : running && selected[t]===c ? '■' : '▶';
      cell.title=pending ? 'Queued for the next bar' : clips[t][c].name;
    }
  }
  document.querySelectorAll('[data-scene]').forEach(button => button.classList.toggle('selected',selected.every(c=>c===Number(button.dataset.scene))));
}

function createAudio() {
  if (ctx) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Audio is unavailable in this browser.');
  ctx = new Audio();
  master=ctx.createGain(); master.gain.value=Number($('#master-volume').value);
  const limiter=ctx.createDynamicsCompressor();
  limiter.threshold.value=-4; limiter.knee.value=8; limiter.ratio.value=8;
  analyser=ctx.createAnalyser(); analyser.fftSize=256;
  master.connect(limiter); limiter.connect(analyser); analyser.connect(ctx.destination);
  nodes=names.map((_,t)=>{const gain=ctx.createGain();gain.gain.value=audible(t)?levels[t]:0;gain.connect(master);return gain;});
  ctx.addEventListener('statechange',()=>{
    if (running && ctx.state !== 'running') pause();
  });
}
function loadAudio() {
  if (!loading) loading=Promise.all(clips.map(row=>Promise.all(row.map(async clip=>{
    const response=await fetch(clip.file);
    if (!response.ok) throw new Error('A loop could not be loaded. Please try Play again.');
    return ctx.decodeAudioData(await response.arrayBuffer());
  })))).then(result=>buffers=result).catch(error=>{loading=null;throw error;});
  return loading;
}
function beatsNow() { return running ? Math.max(0,(ctx.currentTime-origin)*tempo/60) : pausedBeat; }
function spawn(t,c,at,offset=0) {
  const source=ctx.createBufferSource(); source.buffer=buffers[t][c]; source.loop=true;
  source.playbackRate.value=tempo/baseTempo; source.connect(nodes[t]);
  source.start(at, offset % source.buffer.duration);
  liveSources.add(source);
  source.onended=()=>{source.disconnect();liveSources.delete(source);};
  return source;
}
async function start() {
  if (running || starting) return;
  const token=++epoch;
  starting=true; message.textContent='Preparing the loops…'; render();
  try {
    createAudio();
    await ctx.resume();
    await loadAudio();
    if (token!==epoch) return;
    const at=ctx.currentTime+.06;
    origin=at-pausedBeat*60/tempo;
    sources=names.map((_,t)=>spawn(t,selected[t],at,(pausedBeat%8)*60/baseTempo));
    running=true; message.textContent='';
  } catch(error) {
    if (token===epoch) message.textContent=error.message || 'Audio could not start. Please try again.';
  } finally { if(token===epoch){starting=false;render();} }
}
function killSources() {
  liveSources.forEach(source=>{try{source.stop();}catch{}});
  liveSources.clear();
  sources=[];
  for(let t=0;t<6;t++){queued[t]=null;transitions[t]=null;}
}
function pause() {
  if (running) pausedBeat=beatsNow();
  running=false; starting=false; epoch++; killSources(); render();
}
function stop() {
  pause(); pausedBeat=0; message.textContent='';
  $('#position').textContent='1.1.1'; $('#meter-fill').style.width='0%';
}
function choose(t,c) {
  if (!running) { selected[t]=c; render(); return; }
  if(selected[t]===c && !transitions[t]){queued[t]=null;render();return;}
  const earliest=Math.max(ctx.currentTime+.13,transitions[t]?.at+.13 || 0);
  const bar=4*60/tempo;
  const at=origin+Math.max(1,Math.ceil((earliest-origin)/bar))*bar;
  queued[t]={variant:c,at}; render();
}
function launchScene(c) { for(let t=0;t<6;t++)choose(t,c); if(!running)void start(); }

document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',()=>{
  const [t,c]=button.dataset.clip.split(',').map(Number); choose(t,c); if(!running)void start();
}));
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>launchScene(Number(button.dataset.scene))));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.mute);muted[t]=!muted[t];updateGain(t);render();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.solo);solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();}));
document.querySelectorAll('[data-level]').forEach(input=>input.addEventListener('input',()=>{const t=Number(input.dataset.level);levels[t]=Number(input.value);$(`#level-${t}`).textContent=Math.round(levels[t]*100)+'%';updateGain(t);}));
$('#master-volume').addEventListener('input',event=>{if(master)master.gain.setTargetAtTime(Number(event.target.value),ctx.currentTime,.01);});
play.addEventListener('click',()=>running?pause():void start());
$('#stop').addEventListener('click',stop);
$('#tempo').addEventListener('change',event=>{
  const value=Number(event.target.value);
  if(!Number.isFinite(value) || value<70 || value>160){event.target.value=tempo;return;}
  const resume=running;
  if(resume)pause();
  tempo=value; event.target.value=value;
  if(resume)void start();
});
document.addEventListener('keydown',event=>{
  if(event.code==='Space' && !/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){
    event.preventDefault(); if(!starting)running?pause():void start();
  }
});

// Schedule against the audio clock; animation never controls musical timing.
setInterval(()=>{
  if(!running)return;
  let changed=false;
  for(let t=0;t<6;t++) {
    if(transitions[t] && ctx.currentTime>=transitions[t].at){selected[t]=transitions[t].variant;transitions[t]=null;changed=true;}
    const next=queued[t];
    if(next && !transitions[t] && next.at<=ctx.currentTime+.1){
      // A background tab may resume after its original boundary has passed.
      if(next.at<ctx.currentTime+.015){const bar=4*60/tempo;next.at=origin+Math.ceil((ctx.currentTime+.13-origin)/bar)*bar;continue;}
      sources[t].stop(next.at);
      const beatAt=(next.at-origin)*tempo/60;
      sources[t]=spawn(t,next.variant,next.at,(beatAt%8)*60/baseTempo);
      transitions[t]=next; queued[t]=null; changed=true;
    }
  }
  if(changed)render();
},25);
const meterData=new Uint8Array(256);
function animate() {
  if(running) {
    const beat=beatsNow();
    const loopBeat=beat%8;
    $('#position').textContent=`${Math.floor(beat/4)+1}.${Math.floor(beat%4)+1}.${Math.floor((beat%1)*4)+1}`;
    for(let t=0;t<6;t++)cells[t][selected[t]].querySelector('.clip-progress').style.left=(loopBeat/8*100)+'%';
    analyser.getByteTimeDomainData(meterData);
    const peak=meterData.reduce((max,v)=>Math.max(max,Math.abs(v-128)),0)/128;
    $('#meter-fill').style.width=Math.min(100,peak*200)+'%';
  } else $('#meter-fill').style.width='0%';
  requestAnimationFrame(animate);
}

if(document.modelContext?.registerTool) {
  const lifecycle=new AbortController();
  const tool={name:'read_music_session',description:'Read selected loops, queued changes, tempo, and track controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input || typeof input!=='object' || Object.keys(input).length)throw new Error('Expected an empty object.');return{playing:running,tempo,tracks:names.map((name,t)=>({name,clip:clips[t][selected[t]].name,muted:muted[t],solo:solo[t],volume:levels[t],queued:(queued[t]||transitions[t])?.variant??null}))};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
render(); animate();
