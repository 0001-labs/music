'use strict';
// Arrangement prototype: six horizontal tracks and one vertical track share one clock.
const clips=window.MUSIC_CLIPS;
const names=['Kick','Snare','Hats','Bass','Keys','Air','Pulse'];
const muted=Array(names.length).fill(false),solo=Array(names.length).fill(false);
const baseTempo=112,totalBeats=32;
const $=selector=>document.querySelector(selector);
function alignWorkspace(){
  const unit=20,viewport=document.documentElement.clientWidth;
  const width=Math.min(640,Math.max(unit,Math.floor((viewport-2*unit)/unit)*unit));
  const left=Math.max(0,Math.round((viewport-width)/(2*unit))*unit);
  document.documentElement.style.setProperty('--workspace-width',width+'px');
  document.documentElement.style.setProperty('--workspace-left',left+'px');
}
alignWorkspace();
window.addEventListener('resize',alignWorkspace);
const liveSources=new Set();
let tempo=112,ctx,master,analyser,gains=[],arrangements,loading;
let running=false,starting=false,origin=0,pausedBeat=0,epoch=0;
const play=$('#play'),message=$('#message');
function waveform(peaks,vertical=false){
  const max=Math.max(...peaks,.001);
  const bars=peaks.map((p,i)=>{
    const amplitude=Math.max(1,p/max*36);
    return vertical?`<rect x="${(40-amplitude)/2}" y="${i*2}" width="${amplitude}" height="1" fill="currentColor"/>`:`<rect x="${i*2}" y="${(40-amplitude)/2}" width="1" height="${amplitude}" fill="currentColor"/>`;
  }).join('');
  return `<svg class="waveform" viewBox="${vertical?'0 0 40 128':'0 0 128 40'}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}
function trackChip(name,t){
  return `<div class="track-info"><div class="track-name"><span class="track-label">${name}</span><div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button></div></div></div>`;
}
function trackClips(t,vertical=false){
  return clips[t].map((clip,c)=>`<button class="clip${vertical?' vertical-clip':''}" data-clip="${t},${c}" aria-label="${names[t]}: ${clip.name}. Click to move playhead." title="${clip.name}">${waveform(clip.peaks,vertical)}</button>`).join('');
}
$('#tracks').innerHTML=names.slice(0,6).map((name,t)=>`<div class="track-row track-surface" data-track="${t}">${trackChip(name,t)}<div class="clips" data-timeline="${t}">${trackClips(t)}<div class="playhead" aria-hidden="true" hidden></div></div></div>`).join('');
$('#vertical-track').innerHTML=`<div class="vertical-track track-surface" data-track="6">${trackChip(names[6],6)}<div class="vertical-lane"><div class="vertical-clips" data-timeline="6">${trackClips(6,true)}</div><div class="playhead vertical-playhead" aria-hidden="true" hidden></div></div></div>`;
const rows=Array.from(document.querySelectorAll('.track-surface'));
const cells=rows.map(row=>Array.from(row.querySelectorAll('.clip')));
const playheads=rows.map(row=>row.querySelector('.playhead'));
function audible(t){return !muted[t]&&(!solo.some(Boolean)||solo[t]);}
function updateGain(t){if(gains[t])gains[t].gain.setTargetAtTime(audible(t)?1:0,ctx.currentTime,.012);}
function currentBeat(){return running?Math.max(0,(ctx.currentTime-origin)*tempo/60)%totalBeats:pausedBeat;}
function render(){
  play.querySelector('.play-icon').textContent=running?'Ⅱ':'▶';
  play.setAttribute('aria-label',running?'Pause arrangement':'Play arrangement');
  play.disabled=starting;
  rows.forEach((row,t)=>{
    row.classList.toggle('silent',!audible(t));
    row.classList.toggle('has-track-state',muted[t]||solo[t]);
    const mute=row.querySelector('[data-mute]'),s=row.querySelector('[data-solo]');
    mute.classList.toggle('muted',muted[t]);mute.setAttribute('aria-pressed',muted[t]);
    s.classList.toggle('soloed',solo[t]);s.setAttribute('aria-pressed',solo[t]);
  });
  updatePlayhead();
}
function createAudio(){
  if(ctx)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)throw new Error('Audio is unavailable in this browser.');
  ctx=new Audio();master=ctx.createGain();master.gain.value=.72;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-4;limiter.knee.value=8;limiter.ratio.value=8;
  analyser=ctx.createAnalyser();analyser.fftSize=256;
  master.connect(limiter);limiter.connect(analyser);analyser.connect(ctx.destination);
  gains=names.map((_,t)=>{const gain=ctx.createGain();gain.gain.value=audible(t)?1:0;gain.connect(master);return gain;});
  ctx.addEventListener('statechange',()=>{if(running&&ctx.state!=='running')pause();});
}
function loadAudio(){
  if(!loading)loading=Promise.all(clips.map(async row=>{
    const decoded=await Promise.all(row.map(async clip=>{const response=await fetch(clip.file);if(!response.ok)throw new Error('A loop could not load. Please try Play again.');return ctx.decodeAudioData(await response.arrayBuffer());}));
    const length=decoded.reduce((sum,buffer)=>sum+buffer.length,0);
    const result=ctx.createBuffer(1,length,decoded[0].sampleRate);
    let offset=0;
    decoded.forEach(buffer=>{result.copyToChannel(buffer.getChannelData(0),0,offset);offset+=buffer.length;});
    return result;
  })).then(result=>arrangements=result).catch(error=>{loading=null;throw error;});
  return loading;
}
async function start(){
  if(running||starting)return;
  const token=++epoch;starting=true;message.textContent='Preparing the audio…';render();
  try{
    createAudio();await ctx.resume();await loadAudio();if(token!==epoch)return;
    const at=ctx.currentTime+.06;origin=at-pausedBeat*60/tempo;
    names.forEach((_,t)=>{const source=ctx.createBufferSource();source.buffer=arrangements[t];source.loop=true;source.playbackRate.value=tempo/baseTempo;source.connect(gains[t]);source.start(at,pausedBeat*60/baseTempo);liveSources.add(source);source.onended=()=>{source.disconnect();liveSources.delete(source);};});
    running=true;message.textContent='';
  }catch(error){if(token===epoch)message.textContent=error.message||'Audio could not start. Please try again.';}
  finally{if(token===epoch){starting=false;render();}}
}
function pause(){
  if(running)pausedBeat=currentBeat();running=false;starting=false;epoch++;
  liveSources.forEach(source=>{try{source.stop();}catch{}});liveSources.clear();render();
}
function stop(){pause();pausedBeat=0;message.textContent='';updatePlayhead();}
function seek(beat){const resume=running;if(resume)pause();pausedBeat=Math.max(0,Math.min(totalBeats-.001,beat));updatePlayhead();if(resume)void start();}
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',event=>{
  const [,c]=button.dataset.clip.split(',').map(Number),rect=button.getBoundingClientRect();
  const vertical=button.classList.contains('vertical-clip');
  const fraction=event.detail===0?0:Math.max(0,Math.min(1,vertical?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width));
  seek(c*8+fraction*8);
}));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.mute);muted[t]=!muted[t];updateGain(t);render();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.solo);solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();}));
play.addEventListener('click',()=>running?pause():void start());$('#stop').addEventListener('click',stop);
$('#tempo').addEventListener('change',event=>{const value=Number(event.target.value);if(!Number.isFinite(value)||value<70||value>160){event.target.value=tempo;return;}const resume=running;if(resume)pause();tempo=value;if(resume)void start();});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();if(!starting)running?pause():void start();}});
function updatePlayhead(){
  const beat=currentBeat();
  const position=Math.floor(beat/totalBeats*640)+'px';
  playheads.forEach(head=>{
    head.style[head.classList.contains('vertical-playhead')?'top':'left']=position;
  });
  playheads.forEach((head,t)=>{head.hidden=!running||!audible(t);});
  const segment=Math.floor(beat/8);
  cells.forEach((row,t)=>row.forEach((cell,c)=>cell.classList.toggle('active',running&&audible(t)&&c===segment)));
}
function animate(){updatePlayhead();requestAnimationFrame(animate);}
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'read_music_arrangement',description:'Read the arrangement playback position, tempo, and track controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{playing:running,tempo,beat:currentBeat(),bars:8,tracks:names.map((name,t)=>({name,muted:muted[t],solo:solo[t]}))};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
render();animate();
