'use strict';
// Each horizontal or vertical track owns its source and playback position.
const clips=window.MUSIC_CLIPS;
const names=['Kick','Snare','Hats','Bass','Keys','Air','Pulse'];
const muted=Array(names.length).fill(false),solo=Array(names.length).fill(false);
const baseTempo=112,totalBeats=32;
const $=selector=>document.querySelector(selector);
const playback=names.map(()=>({running:false,starting:false,beat:0,startedAt:0,epoch:0,source:null}));
let tempo=112,ctx,master,analyser,gains=[],arrangements,loading,barOrigin=null;
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
  return `<div class="track-info"><div class="track-name"><button class="track-play" data-track-play="${t}" aria-label="Play ${name}" aria-pressed="false" title="Play ${name}">▶</button><span class="track-label">${name}</span><div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button></div></div></div>`;
}
function trackClips(t,vertical=false){
  return clips[t].map((clip,c)=>`<button class="clip${vertical?' vertical-clip':''}" data-clip="${t},${c}" aria-label="${names[t]}: ${clip.name}. Click to move playhead." title="${clip.name}">${waveform(clip.peaks,vertical)}</button>`).join('');
}
$('#tracks').innerHTML=names.slice(0,6).map((name,t)=>`<div class="track-row track-surface" data-track="${t}">${trackChip(name,t)}<div class="clips" data-timeline="${t}">${trackClips(t)}<div class="playhead" aria-hidden="true" hidden></div></div></div>`).join('');
$('#vertical-track').innerHTML=`<div class="vertical-track track-surface" data-track="6">${trackChip(names[6],6)}<div class="vertical-lane"><div class="vertical-clips" data-timeline="6">${trackClips(6,true)}</div><div class="playhead vertical-playhead" aria-hidden="true" hidden></div></div></div>`;
const rows=Array.from(document.querySelectorAll('.track-surface'));
const cells=rows.map(row=>Array.from(row.querySelectorAll('.clip')));
const playheads=rows.map(row=>row.querySelector('.playhead'));
const layout=window.createMusicLayout(rows);
function audible(t){return !muted[t]&&(!solo.some(Boolean)||solo[t]);}
function updateGain(t){if(gains[t])gains[t].gain.setTargetAtTime(audible(t)?1:0,ctx.currentTime,.012);}
function currentBeat(t){const state=playback[t];return state.running?(state.beat+Math.max(0,ctx.currentTime-state.startedAt)*tempo/60)%totalBeats:state.beat;}
function snapBeat(beat){return (Math.round(Math.max(0,beat)/4)*4)%totalBeats;}
function hasPlayback(){return playback.some(state=>state.running||state.starting);}
function render(){
  const active=hasPlayback();
  play.querySelector('.play-icon').textContent=active?'Ⅱ':'▶';
  play.setAttribute('aria-label',active?'Pause all tracks':'Play all tracks');
  rows.forEach((row,t)=>{
    row.classList.toggle('silent',!audible(t));
    row.classList.toggle('has-track-state',muted[t]||solo[t]);
    const mute=row.querySelector('[data-mute]'),s=row.querySelector('[data-solo]'),trackPlay=row.querySelector('[data-track-play]');
    const active=playback[t].running||playback[t].starting;
    trackPlay.textContent=active?'Ⅱ':'▶';trackPlay.setAttribute('aria-pressed',active);
    trackPlay.setAttribute('aria-label',(active?'Pause ':'Play ')+names[t]);
    trackPlay.title=(active?'Pause ':'Play ')+names[t];
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
  ctx.addEventListener('statechange',()=>{if(hasPlayback()&&ctx.state!=='running')pause();});
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
async function startTracks(indices){
  const pending=indices.filter(t=>!playback[t].running&&!playback[t].starting).map(t=>{
    const state=playback[t];state.starting=true;return {t,token:++state.epoch};
  });
  if(!pending.length)return;
  message.textContent='Preparing the audio…';render();
  try{
    createAudio();await ctx.resume();await loadAudio();
    const valid=pending.filter(({t,token})=>token===playback[t].epoch);
    if(!valid.length)return;
    const joining=new Set(valid.map(({t})=>t));
    const otherActive=playback.some((state,t)=>!joining.has(t)&&(state.running||state.starting));
    const earliest=ctx.currentTime+.06,barSeconds=240/tempo;
    let at=earliest;
    if(barOrigin===null||!otherActive)barOrigin=earliest;
    else at=barOrigin+Math.max(0,Math.ceil((earliest-barOrigin)/barSeconds-1e-9))*barSeconds;
    valid.forEach(({t,token})=>{
      const state=playback[t];if(token!==state.epoch)return;
      const source=ctx.createBufferSource();source.buffer=arrangements[t];source.loop=true;
      source.playbackRate.value=tempo/baseTempo;source.connect(gains[t]);
      state.beat=snapBeat(state.beat);
      source.start(at,state.beat*60/baseTempo);
      state.source=source;state.startedAt=at;state.running=true;state.starting=false;
      source.onended=()=>source.disconnect();
    });
    if(!playback.some(state=>state.starting))message.textContent='';
  }catch(error){
    if(pending.some(({t,token})=>token===playback[t].epoch))message.textContent=error.message||'Audio could not start. Please try again.';
  }finally{
    pending.forEach(({t,token})=>{if(token===playback[t].epoch)playback[t].starting=false;});render();
  }
}
function pauseTrack(t){
  const state=playback[t];if(state.running)state.beat=currentBeat(t);
  state.running=false;state.starting=false;state.epoch++;
  if(state.source){try{state.source.stop();}catch{}state.source=null;}
}
function pause(){
  names.forEach((_,t)=>pauseTrack(t));message.textContent='';render();
}
function stop(){pause();barOrigin=null;playback.forEach(state=>state.beat=0);updatePlayhead();}
function toggleTrack(t){
  if(playback[t].running||playback[t].starting){pauseTrack(t);if(!playback.some(state=>state.starting))message.textContent='';render();}
  else void startTracks([t]);
}
function toggleAll(){if(hasPlayback())pause();else void startTracks(names.map((_,t)=>t));}
function seekTrack(t,beat){
  const resume=playback[t].running||playback[t].starting;pauseTrack(t);
  playback[t].beat=snapBeat(Math.min(totalBeats,beat));render();if(resume)void startTracks([t]);
}
document.querySelectorAll('[data-track-play]').forEach(button=>button.addEventListener('click',()=>toggleTrack(Number(button.dataset.trackPlay))));
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',event=>{
  const [t,c]=button.dataset.clip.split(',').map(Number),rect=button.getBoundingClientRect();
  const vertical=button.classList.contains('vertical-clip');
  const fraction=event.detail===0?0:Math.max(0,Math.min(1,vertical?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width));
  seekTrack(t,c*8+fraction*8);
}));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.mute);muted[t]=!muted[t];updateGain(t);render();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.solo);solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();}));
play.addEventListener('click',toggleAll);$('#stop').addEventListener('click',stop);
$('#tempo').addEventListener('change',event=>{
  const value=Number(event.target.value);if(!Number.isFinite(value)||value<70||value>160){event.target.value=tempo;return;}
  const active=names.map((_,t)=>t).filter(t=>playback[t].running||playback[t].starting);
  active.forEach(pauseTrack);tempo=value;if(active.length)void startTracks(active);
});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();toggleAll();}});
function updatePlayhead(){
  playheads.forEach((head,t)=>{
    const beat=currentBeat(t),active=playback[t].running&&audible(t);
    head.style[head.classList.contains('vertical-playhead')?'top':'left']=Math.floor(beat/totalBeats*640)+'px';
    head.hidden=!active||ctx.currentTime<playback[t].startedAt;
    cells[t].forEach(cell=>cell.classList.toggle('active',active));
  });
}
function animate(){layout.tick();updatePlayhead();requestAnimationFrame(animate);}
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'read_music_arrangement',description:'Read each track’s independent playback position, tempo, and controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{playing:hasPlayback(),tempo,bars:8,tracks:names.map((name,t)=>({name,playing:playback[t].running,loading:playback[t].starting,beat:currentBeat(t),muted:muted[t],solo:solo[t],position:layout.getPositions()[t]}))};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
render();animate();
