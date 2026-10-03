'use strict';
// Each horizontal or vertical track owns its source and playback position.
const clips=window.MUSIC_CLIPS;
const names=['Kick','Snare','Hats','Bass','Keys','Air','Pulse'];
// Ezo note colors, from shared/noteAppearance.ts.
const palette=[
  {id:'white',name:'White',hex:'#ffffff'},
  {id:'red',name:'Tuned red',hex:'#ff5f5f'},
  {id:'orange',name:'Orange',hex:'#fec20d'},
  {id:'yellow',name:'Yellow',hex:'#eaff00'},
  {id:'light-green',name:'Apple green',hex:'#99ff73'},
  {id:'green',name:'Every green',hex:'#979441'},
  {id:'light-blue',name:'Zenith blue',hex:'#ccccff'},
  {id:'blue',name:'Sharp blue',hex:'#594dff'},
  {id:'pink',name:'Pink',hex:'#f5aad1'}
];
const colorKey='music-track-colors-v1';
let trackColors=names.map(()=>null);
try{const saved=JSON.parse(localStorage.getItem(colorKey));if(Array.isArray(saved)&&saved.length===names.length)trackColors=saved.map(id=>palette.some(color=>color.id===id)?id:null);}catch{}
const muted=Array(names.length).fill(false),solo=Array(names.length).fill(false);
const baseTempo=112,totalBeats=32,pixelsPerBeat=40;
const loopBeats=names.map(()=>totalBeats);
const trackPeaks=clips.map(row=>row.flatMap(clip=>clip.peaks));
const expandedArrangements=names.map(()=>null);
const $=selector=>document.querySelector(selector);
const playback=names.map(()=>({running:false,starting:false,beat:0,startedAt:0,epoch:0,source:null}));
let tempo=112,ctx,master,analyser,gains=[],arrangements,loading,barOrigin=null,pausedTracks=[];
const play=$('#play'),message=$('#message');
function waveform(peaks,vertical=false,width=160,height=16,startPixel=0,displayPixelsPerBeat=pixelsPerBeat){
  const length=vertical?height:width,cross=vertical?width:height;
  const first=(2-startPixel%2)%2,count=Math.max(1,Math.ceil((length-first)/2)),max=Math.max(...peaks,.001);
  const samplesPerPixel=peaks.length/(totalBeats*displayPixelsPerBeat);
  // The display scale samples the same audio; only the end handle trims duration.
  const bars=Array.from({length:count},(_,i)=>{
    const pixel=first+i*2,start=Math.floor((startPixel+pixel)*samplesPerPixel),end=Math.max(start+1,Math.ceil((startPixel+pixel+2)*samplesPerPixel));
    let peak=0;for(let p=start;p<end;p++)peak=Math.max(peak,peaks[p%peaks.length]);
    const amplitude=Math.max(1,Math.round(peak/max*cross*.9)),offset=Math.round((cross-amplitude)/2);
    return vertical?`<rect x="${offset}" y="${pixel}" width="${amplitude}" height="1" fill="currentColor"/>`:`<rect x="${pixel}" y="${offset}" width="1" height="${amplitude}" fill="currentColor"/>`;
  }).join('');
  return `<svg class="waveform" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="width:${width}px;height:${height}px" shape-rendering="crispEdges" aria-hidden="true">${bars}</svg>`;
}
function loopMarkers({width,height,vertical,beats}){
  const length=vertical?height:width,boundaries=[];
  for(let beat=totalBeats;beat<beats;beat+=totalBeats)boundaries.push(beat);
  boundaries.push(beats);
  return boundaries.map(beat=>{
    const end=beat===beats,pixel=Math.min(length-1,Math.round(beat/beats*length));
    return `<span class="loop-boundary${end?' loop-end':''}" data-loop-beat="${beat}" style="${vertical?'top':'left'}:${pixel}px" title="${end?'Track loop end':'Audio pattern repeats'}"></span>`;
  }).join('');
}
function trackChip(name,t){
  return `<div class="track-info"><div class="track-name"><button class="track-play" data-track-play="${t}" aria-label="Play ${name}" aria-pressed="false" title="Play ${name}">▶</button><span class="track-label">${name}</span></div></div>`;
}
function trackControls(name,t){
  return `<div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button></div>`;
}
function trackClips(t,vertical=false){
  return clips[t].map((clip,c)=>`<button class="clip${vertical?' vertical-clip':''}" data-clip="${t},${c}" aria-label="${names[t]}: ${clip.name}. Click to move playhead." title="${clip.name}"></button>`).join('');
}
function resizeHandle(t){return `<button class="resize-handle" data-resize="${t}" aria-label="Scale ${names[t]} display; use arrow keys" title="Scale display"></button>`;}
function trimHandle(t){return `<button class="trim-handle" data-trim="${t}" aria-label="Trim ${names[t]} loop; use arrow keys" title="Trim loop end"></button>`;}
$('#tracks').innerHTML=names.slice(0,6).map((name,t)=>`<div class="track-row track-surface" data-track="${t}">${trackChip(name,t)}<div class="clips" data-timeline="${t}">${trackClips(t)}<div class="playhead" aria-hidden="true" hidden></div></div>${trackControls(name,t)}${resizeHandle(t)}${trimHandle(t)}</div>`).join('');
$('#vertical-track').innerHTML=`<div class="vertical-track track-surface" data-track="6">${trackChip(names[6],6)}<div class="vertical-lane"><div class="vertical-clips" data-timeline="6">${trackClips(6,true)}</div><div class="playhead vertical-playhead" aria-hidden="true" hidden></div></div>${trackControls(names[6],6)}${resizeHandle(6)}${trimHandle(6)}</div>`;
const rows=Array.from(document.querySelectorAll('.track-surface'));
const cells=rows.map(row=>Array.from(row.querySelectorAll('.clip')));
const playheads=rows.map(row=>row.querySelector('.playhead'));
const loopBoundaries=rows.map(row=>{
  const layer=document.createElement('div');layer.className='loop-boundaries';layer.setAttribute('aria-hidden','true');row.appendChild(layer);return layer;
});
const sweepTrackHeads=rows.map(row=>{
  const layer=document.createElement('div');layer.className='sweep-track-heads';layer.setAttribute('aria-hidden','true');row.appendChild(layer);return layer;
});
const layout=window.createMusicLayout(rows,(t,vertical)=>{
  cells[t].forEach(cell=>cell.classList.toggle('vertical-clip',vertical));
  playheads[t].classList.toggle('vertical-playhead',vertical);
  playheads[t].style.left='0px';playheads[t].style.top='0px';
});
const sweeps=window.createMusicSweeps({
  canvas:$('#canvas'),positions:()=>layout.getPositions(),baseTempo,totalBeats,audible,
  audio:()=>({ctx,tempo,pixelsPerBeat,arrangements,gains,master}),
  async prepare(){message.textContent='Preparing the audio…';createAudio();await ctx.resume();await loadAudio();},
  startTime(){
    const earliest=ctx.currentTime+.06,barSeconds=240/tempo;
    if(barOrigin===null||!playback.some(state=>state.running||state.starting)&&!sweeps.read().some(head=>head.playing)){barOrigin=earliest;return earliest;}
    return barOrigin+Math.max(0,Math.ceil((earliest-barOrigin)/barSeconds-1e-9))*barSeconds;
  },
  changed:()=>render(),clearMessage:()=>message.textContent='',error:error=>message.textContent=error.message||'Audio could not start. Please try again.'
});
document.addEventListener('dblclick',event=>{
  if(event.button!==0||event.target.closest('.track-surface,.transport,.context-menu,.canvas-playhead,.canvas-playhead-track,input,textarea,select,[contenteditable="true"]'))return;
  event.preventDefault();void sweeps.add(event.clientX+window.scrollX,event.clientY+window.scrollY,event.shiftKey);
});
const waveformSizes=Array(names.length).fill('');
function updateWaveforms(sizes){
  sizes.forEach(({width,height,vertical,beats},t)=>{
    const key=`${width},${height},${vertical},${beats}`;if(waveformSizes[t]===key)return;
    waveformSizes[t]=key;
    const length=vertical?height:width,part=length/4,displayPixelsPerBeat=length/beats;
    rows[t].style.setProperty('--clip-span',8*displayPixelsPerBeat+'px');
    const clipWidth=vertical?width-6:part,clipHeight=vertical?part:height-4;
    cells[t].forEach((cell,c)=>{
      cell.innerHTML=waveform(trackPeaks[t],vertical,clipWidth,clipHeight,c*part,displayPixelsPerBeat);
      cell.style.backgroundPosition=vertical?`0px ${-c*part}px`:`${-c*part}px 0px`;
      const clip=clips[t][Math.floor(c*part/(8*displayPixelsPerBeat))%4];
      cell.title=clip.name;cell.setAttribute('aria-label',`${names[t]}: ${clip.name}. Click to move playhead.`);
    });
    loopBoundaries[t].innerHTML=loopMarkers({width,height,vertical,beats});
    resizeLoop(t,beats);
  });
}
function tint(hex,amount){return '#'+[1,3,5].map(index=>Math.round(255*(1-amount)+parseInt(hex.slice(index,index+2),16)*amount).toString(16).padStart(2,'0')).join('');}
function applyTrackColor(t){
  const color=palette.find(color=>color.id===trackColors[t]);if(!color)return;
  const ink=color.id==='blue'?'#ffffff':'#1e1e1e';
  const values={'--track-color':color.hex,'--track-active-ink':ink,'--track-sweep-ink':color.id==='blue'?'#ffffff':'#594dff','--track-rest':tint(color.hex,.12),'--track-alt':tint(color.hex,.18),'--track-hover':tint(color.hex,.3)};
  Object.entries(values).forEach(([key,value])=>rows[t].style.setProperty(key,value));
}
rows.forEach((_,t)=>applyTrackColor(t));
const menu=$('#track-menu'),orientationButton=$('#orientation');
$('#track-colors').innerHTML=palette.map(color=>`<button class="color-swatch" data-color="${color.id}" role="menuitemradio" aria-checked="false" aria-label="${color.name}" title="${color.name}" style="--swatch-ink:${color.id==='blue'?'#fff':'#1e1e1e'}"><span style="background:${color.hex}" aria-hidden="true"></span></button>`).join('');
const swatchButtons=Array.from(menu.querySelectorAll('[data-color]'));
swatchButtons.forEach(button=>button.addEventListener('click',()=>{
  if(menuTrack===null)return;trackColors[menuTrack]=button.dataset.color;applyTrackColor(menuTrack);
  try{localStorage.setItem(colorKey,JSON.stringify(trackColors));}catch{}
  closeMenu(true);
}));
const menuItems=[orientationButton,...swatchButtons];
menu.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=Math.max(0,menuItems.indexOf(document.activeElement));
  const next=event.key==='Home'?0:event.key==='End'?menuItems.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+menuItems.length)%menuItems.length;
  menuItems[next].focus();
});
let menuTrack=null;
function closeMenu(restoreFocus=false){
  const t=menuTrack;menu.hidden=true;menuTrack=null;
  if(restoreFocus&&t!==null)rows[t].querySelector('[data-track-play]').focus();
}
function openMenu(t,clientX,clientY){
  menuTrack=t;orientationButton.textContent=layout.getPositions()[t].vertical?'Make horizontal':'Make vertical';
  swatchButtons.forEach(button=>button.setAttribute('aria-checked',button.dataset.color===(trackColors[t]||'light-green')));
  const left=Math.max(0,Math.min(window.innerWidth-120,clientX)),top=Math.max(0,Math.min(window.innerHeight-80,clientY));
  menu.style.left=Math.floor((left+window.scrollX)/20)*20+'px';menu.style.top=Math.floor((top+window.scrollY)/20)*20+'px';
  menu.hidden=false;orientationButton.focus();
}
rows.forEach((row,t)=>{
  row.addEventListener('contextmenu',event=>{
    event.preventDefault();event.stopPropagation();
    const rect=row.getBoundingClientRect();openMenu(t,event.clientX||rect.left,event.clientY||rect.bottom);
  });
  row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=row.getBoundingClientRect();openMenu(t,rect.left,rect.bottom);}});
});
orientationButton.addEventListener('click',()=>{if(menuTrack!==null){layout.toggleOrientation(menuTrack);updatePlayhead();closeMenu(true);}});
document.addEventListener('pointerdown',event=>{if(menuTrack!==null&&!menu.contains(event.target))closeMenu();});
document.addEventListener('keydown',event=>{if(menuTrack!==null&&(event.key==='Escape'||event.key==='Tab')){if(event.key==='Escape')event.preventDefault();closeMenu(true);}});
window.addEventListener('scroll',()=>closeMenu(),{passive:true});window.addEventListener('resize',()=>closeMenu());
function audible(t){return !muted[t]&&(!solo.some(Boolean)||solo[t]);}
function updateGain(t){if(gains[t])gains[t].gain.setTargetAtTime(audible(t)?1:0,ctx.currentTime,.012);}
function currentBeat(t){const state=playback[t];return state.running?(state.beat+Math.max(0,ctx.currentTime-state.startedAt)*tempo/60+1e-9)%loopBeats[t]:state.beat;}
function snapBeat(beat,t){return Math.min(Math.round(Math.max(0,beat)/4)*4,loopBeats[t])%loopBeats[t];}
function hasPlayback(){return playback.some(state=>state.running||state.starting)||sweeps.hasPlayback();}
function render(){
  const active=hasPlayback();
  play.querySelector('.play-icon').textContent=active?'Ⅱ':'▶';
  play.setAttribute('aria-label',active?'Pause all tracks':'Play all tracks');
  rows.forEach((row,t)=>{
    row.classList.toggle('silent',!audible(t));
    row.classList.toggle('has-track-state',muted[t]||solo[t]);
    const mute=row.querySelector('[data-mute]'),s=row.querySelector('[data-solo]'),trackPlay=row.querySelector('[data-track-play]');
    const active=playback[t].running||playback[t].starting||sweeps.trackActive(t);
    trackPlay.textContent=active?'■':'▶';trackPlay.setAttribute('aria-pressed',active);
    trackPlay.setAttribute('aria-label',(active?'Stop ':'Play ')+names[t]);
    trackPlay.title=(active?'Stop ':'Play ')+names[t];
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
function bufferForLoop(t){
  if(loopBeats[t]<=totalBeats)return arrangements[t];
  const original=arrangements[t],length=Math.round(loopBeats[t]*60/baseTempo*original.sampleRate);
  const cached=expandedArrangements[t];if(cached?.length===length)return cached;
  const buffer=ctx.createBuffer(1,length,original.sampleRate),samples=original.getChannelData(0);
  for(let offset=0;offset<length;offset+=samples.length)buffer.copyToChannel(samples.subarray(0,Math.min(samples.length,length-offset)),0,offset);
  expandedArrangements[t]=buffer;return buffer;
}
function startSource(t,at,beat){
  const state=playback[t],source=ctx.createBufferSource();source.buffer=bufferForLoop(t);source.loop=true;
  source.loopStart=0;source.loopEnd=loopBeats[t]*60/baseTempo;
  source.playbackRate.value=tempo/baseTempo;source.connect(gains[t]);source.start(at,beat*60/baseTempo);
  state.beat=beat;state.source=source;state.startedAt=at;state.running=true;state.starting=false;
  source.onended=()=>source.disconnect();
}
function resizeLoop(t,beats){
  if(loopBeats[t]===beats)return;
  const state=playback[t],beat=currentBeat(t)%beats;loopBeats[t]=beats;
  if(state.running){
    const at=Math.max(ctx.currentTime,state.startedAt);
    try{state.source.stop();}catch{}
    startSource(t,at,beat);
  }else state.beat=beat;
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
    const otherActive=sweeps.hasPlayback()||playback.some((state,t)=>!joining.has(t)&&(state.running||state.starting));
    const earliest=ctx.currentTime+.06,barSeconds=240/tempo;
    let at=earliest;
    if(barOrigin===null||!otherActive)barOrigin=earliest;
    else at=barOrigin+Math.max(0,Math.ceil((earliest-barOrigin)/barSeconds-1e-9))*barSeconds;
    valid.forEach(({t,token})=>{
      const state=playback[t];if(token!==state.epoch)return;
      startSource(t,at,snapBeat(state.beat,t));
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
  pausedTracks=names.map((_,t)=>t).filter(t=>playback[t].running||playback[t].starting);
  sweeps.pause();names.forEach((_,t)=>pauseTrack(t));message.textContent='';render();
}
function stop(){pause();sweeps.stop();pausedTracks=[];barOrigin=null;playback.forEach(state=>state.beat=0);render();}
function toggleTrack(t){
  if(playback[t].running||playback[t].starting||sweeps.trackActive(t)){sweeps.stopTrack(t);pauseTrack(t);playback[t].beat=0;if(!playback.some(state=>state.starting))message.textContent='';render();}
  else void startTracks([t]);
}
function toggleAll(){if(hasPlayback())pause();else if(sweeps.hasPaused()){sweeps.resume();void startTracks(pausedTracks);pausedTracks=[];}else void startTracks(names.map((_,t)=>t));}
function seekTrack(t,beat){
  const resume=playback[t].running||playback[t].starting;pauseTrack(t);
  playback[t].beat=snapBeat(Math.min(loopBeats[t],beat),t);render();if(resume)void startTracks([t]);
}
document.querySelectorAll('[data-track-play]').forEach(button=>button.addEventListener('click',()=>toggleTrack(Number(button.dataset.trackPlay))));
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',event=>{
  const [t,c]=button.dataset.clip.split(',').map(Number),position=layout.getPositions()[t];
  const rect=rows[t].getBoundingClientRect(),vertical=position.vertical;
  const length=vertical?position.height:position.width;
  const pixel=event.detail===0?c*length/4:Math.max(0,Math.min(length,vertical?event.clientY-rect.top:event.clientX-rect.left));
  seekTrack(t,pixel/length*position.beats);
}));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.mute);muted[t]=!muted[t];updateGain(t);render();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',()=>{const t=Number(button.dataset.solo);solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();}));
play.addEventListener('click',toggleAll);$('#stop').addEventListener('click',stop);
$('#tempo').addEventListener('change',event=>{
  const value=Number(event.target.value);if(!Number.isFinite(value)||value<70||value>160){event.target.value=tempo;return;}
  const active=names.map((_,t)=>t).filter(t=>playback[t].running||playback[t].starting);
  active.forEach(pauseTrack);sweeps.setTempo();tempo=value;sweeps.reschedule();if(active.length)void startTracks(active);
});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();toggleAll();}});
function updatePlayhead(){
  const sizes=layout.getPositions();updateWaveforms(sizes);sweeps.tick(sizes);
  playheads.forEach((head,t)=>{
    const beat=currentBeat(t),active=playback[t].running&&audible(t);
    const vertical=head.classList.contains('vertical-playhead');
    head.style[vertical?'top':'left']=Math.floor(beat/loopBeats[t]*(vertical?sizes[t].height:sizes[t].width)+1e-7)+'px';
    head.hidden=!active||ctx.currentTime<playback[t].startedAt;
    cells[t].forEach(cell=>cell.classList.toggle('active',(active||sweeps.trackActive(t))&&audible(t)));
    sweepTrackHeads[t].innerHTML=audible(t)?sweeps.trackPositions(t).map(beat=>`<span class="sweep-track-head" style="${vertical?'top':'left'}:${Math.floor(beat/loopBeats[t]*(vertical?sizes[t].height:sizes[t].width))}px"></span>`).join(''):'';
  });
}
function animate(){layout.tick();updatePlayhead();requestAnimationFrame(animate);}
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'read_music_arrangement',description:'Read each track’s independent playback position, tempo, and controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{playing:hasPlayback(),tempo,pixelsPerBeat,canvasPlayheads:sweeps.read(),tracks:names.map((name,t)=>({name,playing:playback[t].running,loading:playback[t].starting,beat:currentBeat(t),bars:loopBeats[t]/4,muted:muted[t],solo:solo[t],color:trackColors[t]||'light-green',position:layout.getPositions()[t]}))};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
render();animate();
