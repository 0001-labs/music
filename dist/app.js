'use strict';
// Throwaway arrangement prototype: six 20px track rows, eight bars, one clock.
const clips=window.MUSIC_CLIPS;
const names=['Kick','Snare','Hats','Bass','Keys','Air'];
const muted=Array(6).fill(false),solo=Array(6).fill(false);
const baseTempo=112,totalBeats=32;
const $=selector=>document.querySelector(selector);
function alignWorkspace(){
  const unit=20,viewport=document.documentElement.clientWidth;
  const width=Math.min(720,Math.max(unit,Math.floor((viewport-2*unit)/unit)*unit));
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
function waveform(peaks){
  const max=Math.max(...peaks,.001);
  return `<svg class="waveform" viewBox="0 0 128 40" preserveAspectRatio="none" aria-hidden="true">${peaks.map((p,i)=>{const h=Math.max(1,p/max*36);return `<rect x="${i*2}" y="${(40-h)/2}" width="1" height="${h}" fill="currentColor"/>`;}).join('')}</svg>`;
}
$('#ruler').innerHTML=Array.from({length:8},(_,bar)=>`<button data-bar="${bar}" aria-label="Move playhead to bar ${bar+1}">${bar+1}</button>`).join('');
$('#tracks').innerHTML=names.map((name,t)=>`<div class="track-row" data-track="${t}"><div class="track-info"><div class="track-name"><span class="track-label">${name}</span><div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button></div></div></div><div class="clips" data-timeline="${t}">${clips[t].map((clip,c)=>`<button class="clip" data-clip="${t},${c}" aria-label="${name}: ${clip.name}, bars ${c*2+1}–${c*2+2}. Click to move playhead." title="${clip.name}">${waveform(clip.peaks)}</button>`).join('')}</div></div>`).join('');
const rows=Array.from(document.querySelectorAll('.track-row'));
const cells=rows.map(row=>Array.from(row.querySelectorAll('.clip')));
function audible(t){return !muted[t]&&(!solo.some(Boolean)||solo[t]);}
function updateGain(t){if(gains[t])gains[t].gain.setTargetAtTime(audible(t)?1:0,ctx.currentTime,.012);}
function currentBeat(){return running?Math.max(0,(ctx.currentTime-origin)*tempo/60)%totalBeats:pausedBeat;}
function render(){
  play.querySelector('.play-icon').textContent=running?'Ⅱ':'▶';
  play.setAttribute('aria-label',running?'Pause arrangement':'Play arrangement');
  play.disabled=starting;
  rows.forEach((row,t)=>{
    row.classList.toggle('silent',!audible(t));
    const mute=row.querySelector('[data-mute]'),s=row.querySelector('[data-solo]');
    mute.classList.toggle('muted',muted[t]);mute.setAttribute('aria-pressed',muted[t]);
    s.classList.toggle('soloed',solo[t]);s.setAttribute('aria-pressed',solo[t]);
  });
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
document.querySelectorAll('[data-bar]').forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.bar)*4)));
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',event=>{const [,c]=button.dataset.clip.split(',').map(Number);const rect=button.getBoundingClientRect();seek(c*8+(event.clientX?Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)):0)*8);}));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.mute);muted[t]=!muted[t];updateGain(t);render();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.solo);solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();}));
play.addEventListener('click',()=>running?pause():void start());$('#stop').addEventListener('click',stop);
$('#tempo').addEventListener('change',event=>{const value=Number(event.target.value);if(!Number.isFinite(value)||value<70||value>160){event.target.value=tempo;return;}const resume=running;if(resume)pause();tempo=value;if(resume)void start();});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();if(!starting)running?pause():void start();}});
function updatePlayhead(){
  const beat=currentBeat();
  $('#playhead').style.left=(80+beat/totalBeats*640)+'px';$('#playhead').classList.toggle('playing',running);
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
