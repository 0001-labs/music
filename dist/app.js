'use strict';
// Each track owns its source and playback position.
const clips=window.MUSIC_CLIPS;
let firstVisit=false;try{firstVisit=localStorage.getItem('music-grid-layout-four-bar-v1')===null&&localStorage.getItem('music-arrangement-blocks-v1')===null;}catch{}
const names=['Kick','Snare','Hats','Bass','Keys','Air','Pulse','Piano'];
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
try{const saved=JSON.parse(localStorage.getItem(colorKey));if(Array.isArray(saved)&&saved.length<=names.length)trackColors=names.map((_,t)=>palette.some(color=>color.id===saved[t])?saved[t]:null);}catch{}
const muted=Array(names.length).fill(false),solo=Array(names.length).fill(false);
const linkedKey='music-linked-controls-v1',linkedMuted=names.map(()=>false),linkedSolo=names.map(()=>false);
function restoreLinked(state={}){
  for(const [key,target] of [['linkedMuted',linkedMuted],['linkedSolo',linkedSolo]])target.splice(0,target.length,...names.map((_,t)=>state[key]?.[t]===true));
  try{localStorage.setItem(linkedKey,JSON.stringify({linkedMuted,linkedSolo}));}catch{}
}
try{const saved=JSON.parse(localStorage.getItem(linkedKey));if(saved)restoreLinked(saved);}catch{}
function sourceAudible(state,t){return !state.positions[t].deleted&&!state.muted[t]&&!linkedMuted[t]&&(linkedSolo.some(Boolean)?linkedSolo[t]:!state.solo.some((value,i)=>value&&!state.positions[i].deleted)||state.solo[t]);}
function toggleLinked(indices,kind){
  const values=kind==='mute'?linkedMuted:linkedSolo,next=!indices.every(t=>values[t]);indices.forEach(t=>values[t]=next);restoreLinked({linkedMuted:[...linkedMuted],linkedSolo:[...linkedSolo]});
  names.forEach((_,t)=>updateGain(t));render();recordEdit();
  void blocks?.remix().then(()=>{sweeps.reschedule();render();}).catch(error=>message.textContent=error.message);
}

const baseTempo=112,totalBeats=32,pixelsPerBeat=40;
const loopBeats=names.map(()=>totalBeats);
const displayZoom=names.map(()=>1);
const pitches=names.map(()=>0),pitchCache=names.map(()=>null),pitchKey='music-track-pitches-v1';
try{const saved=JSON.parse(localStorage.getItem(pitchKey));if(Array.isArray(saved))pitches.forEach((_,t)=>{if(Number.isInteger(saved[t])&&Math.abs(saved[t])<=24)pitches[t]=saved[t];});}catch{}
const trackPeaks=clips.map(row=>row.flatMap(clip=>clip.peaks));
const expandedArrangements=names.map(()=>null),trackOffsets=names.map(()=>0);
// Each clip can run at its own BPM. It is stored as a speed relative to the global tempo, so clips keep
// their ratio when the global tempo changes. Pitch follows speed.
const speedKey='music-track-speeds-v1',trackSpeeds=names.map(()=>1);
const validSpeed=speed=>Number.isFinite(speed)&&speed>=.25&&speed<=4;
try{const saved=JSON.parse(localStorage.getItem(speedKey));if(Array.isArray(saved))trackSpeeds.forEach((_,t)=>{if(validSpeed(saved[t]))trackSpeeds[t]=saved[t];});}catch{}
function speedLabel(speed){return speed===1?'':Math.round(tempo*speed)+' bpm';}
// A menu row with a number field; `changed` receives the new speed.
function bpmRow(changed){
  const row=document.createElement('label');row.className='bpm-row';row.innerHTML='<span>BPM</span><input type="number" min="20" max="640" step="1" aria-label="Clip tempo in beats per minute">';
  const input=row.querySelector('input');
  input.addEventListener('change',()=>{const value=Number(input.value);if(!Number.isFinite(value)||value<=0){return;}const speed=Math.min(4,Math.max(.25,value/tempo));input.value=Math.round(tempo*speed);changed(speed);});
  input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Enter')input.blur();});
  return {row,show(speed){input.value=Math.round(tempo*speed);}};
}
function saveSpeeds(){try{localStorage.setItem(speedKey,JSON.stringify(trackSpeeds));}catch{}}
const $=selector=>document.querySelector(selector);
const playback=names.map(()=>({running:false,starting:false,beat:0,startedAt:0,epoch:0,source:null}));
let blocks=null,blockTransaction=false,rootRestoring=false;
function recordEdit(){if(!blockTransaction)editHistory?.record();}
let tempo=112,ctx,master,analyser,gains=[],arrangements,loading,barOrigin=null,pausedTracks=[];
// Effect map (Music menu > Effects): each effect is strongest toward one edge of the canvas, so where a clip sits sets how much it gets.
const fxKey='music-effect-map-v1',fxNames=[['reverb','Reverb'],['delay','Echo'],['pan','Pan'],['filter','Filter']],fxEdges=['off','up','down','left','right'];
const fxMap={reverb:'off',delay:'off',pan:'off',filter:'off'},fxField=window.musicBoard;
let reverb=null,delayBus=null,delayNode=null,fxChains=[],fxVersion=0;
try{
  const saved=JSON.parse(localStorage.getItem(fxKey));
  if(saved)fxNames.forEach(([id])=>{if(fxEdges.includes(saved[id]))fxMap[id]=saved[id];});
  else if(localStorage.getItem('music-position-reverb-v1')==='on')fxMap.reverb='up';
}catch{}
// How far a clip's centre is toward the chosen edge of the map, 0 to 1.
function fxAmount(edge,rect){
  if(edge==='off')return 0;
  const across=(rect.x+rect.width/2)/fxField.width,down=(rect.y+rect.height/2)/fxField.height;
  return Math.max(0,Math.min(1,edge==='up'?1-down:edge==='down'?down:edge==='left'?1-across:across));
}
function fxValues(rect){
  const pan=fxMap.pan==='off'?0:fxAmount(fxMap.pan,rect)*2-1,dark=fxAmount(fxMap.filter,rect);
  return {reverb:.5*fxAmount(fxMap.reverb,rect)**2,delay:.45*fxAmount(fxMap.delay,rect)**2,left:Math.min(1,1-pan),right:Math.min(1,1+pan),cutoff:dark?300+17700*(1-dark)**2:20000};
}
// One clip's path to the output: filter, left/right balance, and sends to the reverb and echo.
function fxChain(){
  const filter=ctx.createBiquadFilter(),left=ctx.createGain(),right=ctx.createGain(),merge=ctx.createChannelMerger(2),toReverb=ctx.createGain(),toEcho=ctx.createGain();
  filter.type='lowpass';filter.frequency.value=20000;filter.Q.value=.5;toReverb.gain.value=0;toEcho.gain.value=0;
  filter.connect(left);filter.connect(right);left.connect(merge,0,0);right.connect(merge,0,1);merge.connect(master);filter.connect(toReverb);toReverb.connect(reverb);filter.connect(toEcho);toEcho.connect(delayBus);
  let applied='';
  return {input:filter,apply(rect){
    const key=fxVersion+':'+rect.x+','+rect.y+','+rect.width+','+rect.height;if(key===applied)return;applied=key;
    const values=fxValues(rect),now=ctx.currentTime;
    left.gain.setTargetAtTime(values.left,now,.05);right.gain.setTargetAtTime(values.right,now,.05);toReverb.gain.setTargetAtTime(values.reverb,now,.05);toEcho.gain.setTargetAtTime(values.delay,now,.05);filter.frequency.setTargetAtTime(values.cutoff,now,.05);
  },disconnect(){[filter,left,right,merge,toReverb,toEcho].forEach(node=>node.disconnect());}};
}
function reverbImpulse(){
  const rate=ctx.sampleRate,length=Math.round(2.4*rate),buffer=ctx.createBuffer(2,length,rate),fade=rate*.004;
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel);let low=0;
    for(let i=0;i<length;i++){const t=i/length;low+=(Math.random()*2-1-low)*(.55-.4*t);data[i]=low*Math.exp(-5.5*t)*(i<fade?i/fade:1);}
  }
  return buffer;
}
const play=$('#play'),message=$('#message');
function waveform(peaks,width=160,height=16,startPixel=0,displayPixelsPerBeat=pixelsPerBeat){
  const first=(2-startPixel%2)%2,count=Math.max(1,Math.ceil((width-first)/2)),max=Math.max(...peaks,.001);
  const samplesPerPixel=peaks.length/(totalBeats*displayPixelsPerBeat);
  // The display scale samples the same audio; only the end handle trims duration.
  const bars=Array.from({length:count},(_,i)=>{
    const pixel=first+i*2,start=Math.floor((startPixel+pixel)*samplesPerPixel),end=Math.max(start+1,Math.ceil((startPixel+pixel+2)*samplesPerPixel));
    let peak=0;for(let p=start;p<end;p++)peak=Math.max(peak,peaks[p%peaks.length]);
    const amplitude=Math.max(1,Math.round(peak/max*height*.9)),offset=Math.round((height-amplitude)/2);
    return `M${pixel+.5} ${offset}v${amplitude}`;
  }).join('');
  return `<svg class="waveform" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="width:${width}px;height:${height}px" shape-rendering="crispEdges" aria-hidden="true"><path d="${bars}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
}
function loopMarkers({width,beats}){
  const boundaries=[];
  for(let beat=16;beat<beats;beat+=16)boundaries.push(beat);
  boundaries.push(beats);
  return boundaries.map(beat=>{
    const end=beat===beats,pixel=Math.min(width-1,Math.round(beat/beats*width));
    return `<span class="loop-boundary${end?' loop-end':''}" data-loop-beat="${beat}" style="left:${pixel}px" title="${end?'Track loop end':'Audio pattern repeats'}"></span>`;
  }).join('');
}
function trackChip(name,t){
  return `<div class="track-info"><div class="track-name"><button class="track-play" data-track-play="${t}" aria-label="Play ${name}" aria-pressed="false" title="Play ${name}">▶</button><span class="track-label">${name}</span></div></div>`;
}
function trackControls(name,t){
  return `<div class="track-controls"><button data-mute="${t}" aria-label="Mute ${name}" aria-pressed="false" title="Mute ${name}">M</button><button data-solo="${t}" aria-label="Solo ${name}" aria-pressed="false" title="Solo ${name}">S</button></div>`;
}
function trackClips(t){
  return clips[t].map((clip,c)=>`<button class="clip" data-clip="${t},${c}" aria-label="${names[t]}: ${clip.name}. Click to move playhead." title="${clip.name}"></button>`).join('');
}
function resizeHandle(t){return `<button class="resize-handle" data-resize="${t}" aria-label="Scale ${names[t]} display; use arrow keys" title="Scale display"></button>`;}
function trimHandle(t){return `<button class="trim-handle" data-trim="${t}" aria-label="Trim ${names[t]} loop; use arrow keys" title="Trim loop end"></button><button class="trim-handle trim-start" data-trim-start="${t}" aria-label="Trim ${names[t]} loop start; use arrow keys" title="Trim loop start"></button>`;}
$('#tracks').innerHTML=names.map((name,t)=>`<div class="track-row track-surface" data-track="${t}"${t===7?' style="height:160px"':''}>${trackChip(name,t)}<div class="clips" data-timeline="${t}">${trackClips(t)}<div class="playhead" aria-hidden="true" hidden></div></div>${trackControls(name,t)}${resizeHandle(t)}${trimHandle(t)}</div>`).join('');
const rows=Array.from(document.querySelectorAll('.track-surface'));
const cells=rows.map(row=>Array.from(row.querySelectorAll('.clip')));
const playheads=rows.map(row=>row.querySelector('.playhead'));
const pitchHandles=rows.map((row,t)=>{const handle=document.createElement('button');handle.className='track-pitch-handle';row.appendChild(handle);return handle;});
const zoomTags=rows.map(row=>{const tag=document.createElement('span');tag.className='track-zoom-tag';tag.hidden=true;row.appendChild(tag);return tag;});
const loopBoundaries=rows.map(row=>{
  const layer=document.createElement('div');layer.className='loop-boundaries';layer.setAttribute('aria-hidden','true');row.appendChild(layer);return layer;
});
const sweepTrackHeads=rows.map(row=>{
  const layer=document.createElement('div');layer.className='sweep-track-heads';layer.setAttribute('aria-hidden','true');row.appendChild(layer);return layer;
});
let editHistory=null;
const layout=window.createMusicLayout(rows,()=>{if(editHistory&&!editHistory.applying){recordEdit();syncTrackPresence();}});
layout.ensureHeight(3,80);
const sweeps=window.createMusicSweeps({
  canvas:$('#canvas'),controls:$('#global-loop-controls'),positions:()=>allPositions(),baseTempo,totalBeats,audible,
  looping:t=>t<names.length?playback[t].running||playback[t].starting:blocks?.looping(t-names.length)||false,
  release(indices){indices.forEach(t=>{if(t>=names.length)blocks?.haltIndex(t-names.length);else if(playback[t].running||playback[t].starting){pauseTrack(t);playback[t].beat=0;}});},
  audio:()=>({ctx,tempo,pixelsPerBeat,arrangements:arrangements?.map((_,t)=>bufferForLoop(t)).concat(blocks?.buffers()||[]),gains,master,reverb,delayBus}),fx:fxValues,
  async prepare(){message.textContent='Preparing the audio…';createAudio();await ctx.resume();await loadAudio();await blocks?.prepareAll();},
  startTime(){
    const earliest=ctx.currentTime+.06,barSeconds=240/tempo;
    if(barOrigin===null||!blocks?.hasPlayback()&&!playback.some(state=>state.running||state.starting)&&!sweeps.read().some(head=>head.playing)){barOrigin=earliest;return earliest;}
    return barOrigin+Math.max(0,Math.ceil((earliest-barOrigin)/barSeconds-1e-9))*barSeconds;
  },
  changed:()=>render(),clearMessage:()=>message.textContent='',error:error=>message.textContent=error.message||'Audio could not start. Please try again.'
});
document.addEventListener('dblclick',event=>{
  if(event.button!==0||event.target.closest('.track-surface,.music-header,.transport,.context-menu,.canvas-playhead,.canvas-playhead-track,.arrangement-block,.arrangement-block-menu,input,textarea,select,[contenteditable="true"]'))return;
  event.preventDefault();void sweeps.add(event.clientX+window.scrollX,event.clientY+window.scrollY);
});
const waveformSizes=Array(names.length).fill('');
function updateWaveforms(sizes){
  sizes.forEach(({width,height,beats,offset=0},t)=>{
    if(trackOffsets[t]!==offset){trackOffsets[t]=offset;expandedArrangements[t]=null;restartTrack(t);}
    const key=`${width},${height},${beats},${offset},${pitches[t]},${trackSpeeds[t]},${tempo}`;if(waveformSizes[t]===key)return;
    waveformSizes[t]=key;
    const part=width/4,displayPixelsPerBeat=width/beats;
    const zoom=displayPixelsPerBeat/pixelsPerBeat,change=Math.round((zoom-1)*100),tag=zoomTags[t];
    displayZoom[t]=zoom;applyZoomColor(t);
    // The title carries the display size whenever it is not 100%.
    tag.hidden=true;rows[t].querySelector('.track-label').textContent=[names[t],change?+(zoom*100).toFixed(1)+'%':'',speedLabel(trackSpeeds[t])].filter(Boolean).join(' ');
    rows[t].style.setProperty('--clip-span',8*displayPixelsPerBeat+'px');
    cells[t].forEach((cell,c)=>{
      cell.innerHTML=waveform(trackPeaks[t],part,height-4,Math.round(c*part+offset*displayPixelsPerBeat),displayPixelsPerBeat);
      cell.style.backgroundPosition=`${-c*part}px 0px`;
      const clip=clips[t][Math.floor((c*part/displayPixelsPerBeat+offset)/8)%4];
      cell.title=clip.name;cell.setAttribute('aria-label',`${names[t]}: ${clip.name}. Click to move playhead.`);
    });
    loopBoundaries[t].innerHTML=loopMarkers({width,beats});
    resizeLoop(t,beats);
  });
}
function tint(hex,amount){return '#'+[1,3,5].map(index=>Math.round(255*(1-amount)+parseInt(hex.slice(index,index+2),16)*amount).toString(16).padStart(2,'0')).join('');}
function applyZoomColor(t){
  const color=palette.find(color=>color.id===trackColors[t]),hex=color?.hex||'#d6d6d6',zoom=displayZoom[t];
  const darken=Math.min(.22,Math.max(0,Math.log2(zoom))*.12);
  const display=zoom<1?tint(hex,Math.max(.15,zoom)):'#'+[1,3,5].map(index=>Math.round(parseInt(hex.slice(index,index+2),16)*(1-darken)).toString(16).padStart(2,'0')).join('');
  rows[t].style.setProperty('--track-display-color',display);
  rows[t].style.setProperty('--track-active-ink',color?.id==='blue'&&zoom>=.75?'#ffffff':'#1e1e1e');
}
function applyTrackColor(t){
  // A track with no color chosen stays neutral grey; idle tracks show their color, playing ones fill with it.
  const color=palette.find(color=>color.id===trackColors[t]);
  const values=color?{'--track-color':color.hex,'--track-sweep-ink':color.id==='blue'?'#ffffff':'#594dff','--track-rest':tint(color.hex,.55),'--track-alt':tint(color.hex,.65),'--track-hover':tint(color.hex,.8)}
    :{'--track-color':'#d6d6d6','--track-sweep-ink':'','--track-rest':'#fafafa','--track-alt':'#f0f0f0','--track-hover':'#e6e6e6'};
  Object.entries(values).forEach(([key,value])=>rows[t].style.setProperty(key,value));applyZoomColor(t);
}
rows.forEach((_,t)=>applyTrackColor(t));
const menu=$('#track-menu'),deleteButton=$('#delete-track');
// One color row: its dot shows the current color and each click steps to the next one (none, then the Ezo palette).
const colorCycle=document.createElement('button');colorCycle.className='color-cycle';colorCycle.setAttribute('role','menuitem');colorCycle.innerHTML='<span>Color</span><i aria-hidden="true"></i>';menu.appendChild(colorCycle);
// Size row: each click steps the clip's display scale through the sizes that keep 4/4 on the grid (12.5, 25, 50, 100, 200, 400%).
function nextLength(beats,length,grid,minimum){
  const now=length/beats/pixelsPerBeat,sizes=window.musicGrid.scales,order=[...sizes.filter(size=>size>now+.01),...sizes.filter(size=>size<=now+.01)];
  for(const size of order){const target=beats*pixelsPerBeat*size;if(target>=minimum&&target%grid===0&&target!==length)return target;}
  return length;
}
function showSize(button,beats,length){button.querySelector('b').textContent=+(length/beats/pixelsPerBeat*100).toFixed(1)+'%';}
const trackBpm=bpmRow(speed=>{
  if(menuTrack===null)return;const t=menuTrack,state=playback[t],beat=state.running?currentBeat(t):state.beat,at=state.running?Math.max(ctx.currentTime,state.startedAt):0;
  trackSpeeds[t]=speed;saveSpeeds();waveformSizes[t]='';
  if(state.running){try{state.source.stop();}catch{}startSource(t,at,beat,beat);}
  sweeps.reschedule();render();recordEdit();
});
menu.insertBefore(trackBpm.row,colorCycle);
const sizeCycle=document.createElement('button');sizeCycle.className='size-cycle';sizeCycle.setAttribute('role','menuitem');sizeCycle.title='Display size; click for the next size';sizeCycle.innerHTML='<span>Size</span><b></b>';menu.insertBefore(sizeCycle,colorCycle);
sizeCycle.addEventListener('click',()=>{
  if(menuTrack===null)return;const t=menuTrack,p=layout.getPositions()[t];
  layout.setLength(t,nextLength(p.beats,p.width,80,80));const next=layout.getPositions()[t];showSize(sizeCycle,next.beats,next.width);updatePlayhead();
});
function nextColor(id){const ids=[null,...palette.map(color=>color.id)];return ids[(ids.indexOf(id??null)+1)%ids.length];}
function showCycle(button,id){const color=palette.find(color=>color.id===id);button.querySelector('i').style.background=color?color.hex:'transparent';button.title=color?color.name:'No color';button.setAttribute('aria-label','Color: '+button.title+'. Click for the next color.');}
colorCycle.addEventListener('click',()=>{
  if(menuTrack===null)return;trackColors[menuTrack]=nextColor(trackColors[menuTrack]);applyTrackColor(menuTrack);showCycle(colorCycle,trackColors[menuTrack]);
  try{localStorage.setItem(colorKey,JSON.stringify(trackColors));}catch{}
  recordEdit();
});
const menuItems=[deleteButton,sizeCycle,colorCycle];
menu.addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const index=Math.max(0,menuItems.indexOf(document.activeElement));
  const next=event.key==='Home'?0:event.key==='End'?menuItems.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+menuItems.length)%menuItems.length;
  menuItems[next].focus();
});
let menuTrack=null;
function closeMenu(restoreFocus=false){
  const t=menuTrack;menu.hidden=true;menuTrack=null;
  if(restoreFocus&&t!==null&&!layout.getPositions()[t].deleted)rows[t].querySelector('[data-track-play]').focus();
}
function openMenu(t,clientX,clientY){
  menuTrack=t;menuPoint={x:clientX+window.scrollX,y:clientY+window.scrollY};
  showCycle(colorCycle,trackColors[t]);trackBpm.show(trackSpeeds[t]);{const p=layout.getPositions()[t];showSize(sizeCycle,p.beats,p.width);}
  const left=Math.max(0,Math.min(window.musicBoard.width-80,clientX)),top=Math.max(0,Math.min(window.musicBoard.height-140,clientY));
  menu.style.left=Math.floor((left+window.scrollX)/20)*20+'px';menu.style.top=Math.floor((top+window.scrollY)/20)*20+'px';
  menu.hidden=false;menu.querySelector('button').focus();
}
rows.forEach((row,t)=>{
  row.addEventListener('contextmenu',event=>{
    event.preventDefault();event.stopPropagation();
    const p=layout.getPositions()[t];openMenu(t,event.clientX||p.x,event.clientY||p.y+p.height);
  });
  row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const p=layout.getPositions()[t];openMenu(t,p.x,p.y+p.height);}});
});
document.addEventListener('pointerdown',event=>{if(menuTrack!==null&&!menu.contains(event.target))closeMenu();});
document.addEventListener('keydown',event=>{if(menuTrack!==null&&(event.key==='Escape'||event.key==='Tab')){if(event.key==='Escape')event.preventDefault();closeMenu(true);}});
window.addEventListener('scroll',()=>closeMenu(),{passive:true});window.addEventListener('resize',()=>closeMenu());
function allPositions(){return layout.getPositions().map((p,t)=>({...p,speed:trackSpeeds[t]})).concat(blocks?.positions()||[]);}
function audible(t){if(t>=names.length)return blocks?.audible(t-names.length)||false;const positions=layout.getPositions();return (blocks?.activeAudible()??true)&&(linkedSolo.some(Boolean)||!blocks?.hasSolo()||blocks?.activeSolo())&&sourceAudible({positions,muted,solo},t);}
function updateGain(t){if(gains[t])gains[t].gain.setTargetAtTime(audible(t)?1:0,ctx.currentTime,.012);}
function currentBeat(t){const state=playback[t];return state.running?(state.beat+Math.max(0,ctx.currentTime-state.startedAt)*tempo/60*trackSpeeds[t]+1e-9)%loopBeats[t]:state.beat;}
function snapBeat(beat,t){return Math.min(Math.round(Math.max(0,beat)/4)*4,loopBeats[t])%loopBeats[t];}
function hasPlayback(){return blocks?.hasPlayback()||playback.some(state=>state.running||state.starting)||sweeps.hasPlayback();}
function render(){
  const active=blocks?.hasPlayback()||playback.some(state=>state.running||state.starting)||sweeps.read().some(head=>head.looping&&(head.playing||head.loading));
  setText(play.querySelector('.play-icon'),active?'Ⅱ':'▶');
  play.setAttribute('aria-label',active?'Pause track loops':'Play all track loops');
  play.title=active?'Pause loops':'Play loops';
  const arrangementActive=sweeps.read().some(head=>!head.looping&&(head.playing||head.loading));
  const arrangementButton=$('#play-arrangement');setText(arrangementButton,arrangementActive?'Ⅱ':'▶');
  arrangementButton.setAttribute('aria-label',arrangementActive?'Pause arrangement':'Play arrangement from 0.0 to the last track');
  arrangementButton.title=arrangementActive?'Pause arrangement':'Play arrangement once from 0.0';
  rows.forEach((row,t)=>{
    row.classList.toggle('silent',!audible(t));
    row.classList.toggle('has-track-state',muted[t]||solo[t]||linkedMuted[t]||linkedSolo[t]);
    const mute=row.querySelector('[data-mute]'),s=row.querySelector('[data-solo]'),trackPlay=row.querySelector('[data-track-play]');
    const active=playback[t].running||playback[t].starting||sweeps.trackActive(t);
    const pitch=pitches[t],handle=pitchHandles[t];setText(handle,pitch?`${pitch>0?'+':'−'}${Math.abs(pitch)}`:'↓');handle.dataset.active=String(pitch!==0);handle.title=`Pitch ${pitch>0?'+':''}${pitch} semitones; drag down to lower`;handle.setAttribute('aria-label',`${names[t]}: ${handle.title}`);
    setText(trackPlay,active?'■':'▶');trackPlay.setAttribute('aria-pressed',active);
    trackPlay.setAttribute('aria-label',(active?'Stop ':'Play ')+names[t]);
    trackPlay.title=(active?'Stop ':'Play ')+names[t];
    mute.classList.toggle('muted',muted[t]||linkedMuted[t]);mute.classList.toggle('linked-control',linkedMuted[t]);mute.setAttribute('aria-pressed',muted[t]||linkedMuted[t]);mute.title=linkedMuted[t]?'Command-click to unmute every '+names[t]:'Mute '+names[t]+'; Command-click for all instances';
    s.classList.toggle('soloed',solo[t]||linkedSolo[t]);s.classList.toggle('linked-control',linkedSolo[t]);s.setAttribute('aria-pressed',solo[t]||linkedSolo[t]);s.title=linkedSolo[t]?'Command-click to unsolo every '+names[t]:'Solo '+names[t]+'; Command-click for all instances';
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
  reverb=ctx.createConvolver();reverb.buffer=reverbImpulse();reverb.connect(master);
  // Echo: a dotted-eighth delay with feedback, darkened a little on each repeat.
  delayBus=ctx.createGain();delayNode=ctx.createDelay(2);delayNode.delayTime.value=45/tempo;
  const repeats=ctx.createGain(),tone=ctx.createBiquadFilter();repeats.gain.value=.42;tone.type='lowpass';tone.frequency.value=3500;
  delayBus.connect(delayNode);delayNode.connect(tone);tone.connect(master);tone.connect(repeats);repeats.connect(delayNode);
  gains=names.map((_,t)=>{const gain=ctx.createGain();gain.gain.value=audible(t)?1:0;return gain;});
  fxChains=gains.map(gain=>{const chain=fxChain();gain.connect(chain.input);return chain;});
  ctx.addEventListener('statechange',()=>{if(hasPlayback()&&ctx.state!=='running')pause();});
}
// Audio files load a few at a time and retry, so one dropped request does not leave a clip silent.
let audioSlots=6;const audioQueue=[];
async function fetchAudio(url){
  if(audioSlots<=0)await new Promise(resolve=>audioQueue.push(resolve));else audioSlots--;
  try{
    for(let attempt=0;;attempt++){
      try{const response=await fetch(url);if(!response.ok)throw new Error('A loop could not load. Please try Play again.');return await response.arrayBuffer();}
      catch(error){if(attempt>=3)throw error instanceof TypeError?new Error('A loop could not load. Please try Play again.'):error;await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}
    }
  }finally{const next=audioQueue.shift();if(next)next();else audioSlots++;}
}
function loadAudio(){
  if(!loading)loading=Promise.all(clips.map(async row=>{
    const decoded=await Promise.all(row.map(async clip=>ctx.decodeAudioData(await fetchAudio(clip.file))));
    const length=decoded.reduce((sum,buffer)=>sum+buffer.length,0);
    const result=ctx.createBuffer(1,length,decoded[0].sampleRate);
    let offset=0;
    decoded.forEach(buffer=>{result.copyToChannel(buffer.getChannelData(0),0,offset);offset+=buffer.length;});
    return result;
  })).then(result=>arrangements=result).catch(error=>{loading=null;throw error;});
  return loading;
}
const pitchJobs=new Map(),pitchPending=names.map(()=>null);
function pitchBufferAsync(t,semitones){
  if(!semitones)return Promise.resolve(arrangements[t]);
  const key=t+':'+semitones;let job=pitchJobs.get(key);
  if(!job){
    const original=arrangements[t];
    job=window.musicPitch(original.getChannelData(0),semitones).then(samples=>{const buffer=ctx.createBuffer(1,samples.length,original.sampleRate);buffer.copyToChannel(samples,0);return buffer;});
    pitchJobs.set(key,job);job.catch(()=>pitchJobs.delete(key));
    if(pitchJobs.size>16)pitchJobs.delete(pitchJobs.keys().next().value);
  }
  return job;
}
function restartTrack(t){
  const state=playback[t];if(!state.running)return;
  const beat=state.beat+Math.max(0,ctx.currentTime-state.startedAt)*tempo/60*trackSpeeds[t],at=Math.max(ctx.currentTime,state.startedAt);
  try{state.source.stop();}catch{}startSource(t,at,beat%loopBeats[t],beat);
}
// Until the worker delivers the new pitch, the track keeps sounding at its previous one.
function pitchedBuffer(t){
  const original=arrangements[t];if(!pitches[t])return original;
  const cache=pitchCache[t];if(cache?.semitones===pitches[t]&&cache.original===original)return cache.buffer;
  const semitones=pitches[t];
  if(pitchPending[t]!==semitones){
    pitchPending[t]=semitones;
    pitchBufferAsync(t,semitones).then(buffer=>{
      if(pitchPending[t]===semitones)pitchPending[t]=null;if(pitches[t]!==semitones||arrangements[t]!==original)return;
      pitchCache[t]={semitones,original,buffer};expandedArrangements[t]=null;restartTrack(t);sweeps.reschedule();render();
    }).catch(error=>{if(pitchPending[t]===semitones)pitchPending[t]=null;message.textContent=error.message||'The pitch could not be changed.';});
  }
  return cache?.original===original?cache.buffer:original;
}
function setTrackPitch(t,value){
  value=Math.max(-24,Math.min(24,Math.round(value)));if(value===pitches[t])return;
  pitches[t]=value;expandedArrangements[t]=null;
  if(arrangements&&!value){restartTrack(t);sweeps.reschedule();}else if(arrangements)pitchedBuffer(t);
  try{localStorage.setItem(pitchKey,JSON.stringify(pitches));}catch{}render();
}
function bufferForLoop(t){
  if(loopBeats[t]<=totalBeats&&!trackOffsets[t])return pitchedBuffer(t);
  // A loop longer than the source repeats it; a trimmed start begins partway into it.
  const original=pitchedBuffer(t),length=Math.round(loopBeats[t]*60/baseTempo*original.sampleRate),shift=Math.round(trackOffsets[t]*60/baseTempo*original.sampleRate);
  const cached=expandedArrangements[t];if(cached?.length===length&&cached.shift===shift&&cached.original===original)return cached.buffer;
  const buffer=ctx.createBuffer(1,length,original.sampleRate),samples=original.getChannelData(0),output=buffer.getChannelData(0);
  let read=shift%samples.length;for(let i=0;i<length;i++){output[i]=samples[read];if(++read===samples.length)read=0;}
  expandedArrangements[t]={length,shift,original,buffer};return buffer;
}
function startSource(t,at,beat,timelineBeat=beat){
  const state=playback[t],source=ctx.createBufferSource();source.buffer=bufferForLoop(t);source.loop=true;
  source.loopStart=0;source.loopEnd=loopBeats[t]*60/baseTempo;
  source.playbackRate.value=tempo/baseTempo*trackSpeeds[t];source.connect(gains[t]);source.start(at,beat*60/baseTempo);
  state.beat=timelineBeat;state.source=source;state.startedAt=at;state.running=true;state.starting=false;
  source.onended=()=>source.disconnect();
}
function resizeLoop(t,beats){
  if(loopBeats[t]===beats)return;
  const state=playback[t],timelineBeat=state.running?state.beat+Math.max(0,ctx.currentTime-state.startedAt)*tempo/60*trackSpeeds[t]:state.beat,beat=timelineBeat%beats;loopBeats[t]=beats;
  if(state.running){
    const at=Math.max(ctx.currentTime,state.startedAt);
    try{state.source.stop();}catch{}
    startSource(t,at,beat,timelineBeat);
  }else state.beat=beat;
}
async function startTracks(indices){
  const pending=indices.filter(t=>!layout.getPositions()[t].deleted&&!playback[t].running&&!playback[t].starting).map(t=>{
    const state=playback[t];state.starting=true;return {t,token:++state.epoch};
  });
  if(!pending.length)return;
  message.textContent='Preparing the audio…';render();
  try{
    createAudio();await ctx.resume();await loadAudio();
    const valid=pending.filter(({t,token})=>token===playback[t].epoch);
    if(!valid.length)return;
    const joining=new Set(valid.map(({t})=>t));
    const otherActive=blocks?.hasPlayback()||sweeps.hasPlayback()||playback.some((state,t)=>!joining.has(t)&&(state.running||state.starting));
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
  blocks?.pauseAll();sweeps.pause();names.forEach((_,t)=>pauseTrack(t));message.textContent='';render();
}
function stop(){blocks?.stop();pause();sweeps.stop();pausedTracks=[];barOrigin=null;playback.forEach(state=>state.beat=0);render();}
function toggleTrack(t){
  // Stopping a clip's own loop hands it back to any region; stopping it while a region plays it takes it out of that region.
  if(playback[t].running||playback[t].starting||sweeps.trackActive(t)){if(!playback[t].running&&!playback[t].starting)sweeps.stopTrack(t);pauseTrack(t);playback[t].beat=0;if(!playback.some(state=>state.starting))message.textContent='';render();}
  else void startTracks([t]);
}
// Play marker: click empty grid to set where playback starts; Space plays everything from there once, Space again stops.
let marker=null;
const markerLine=document.createElement('div');markerLine.className='play-marker';markerLine.hidden=true;markerLine.setAttribute('aria-hidden','true');$('#canvas').appendChild(markerLine);
function setMarker(x){marker=x===null?null:Math.max(0,Math.round(x/20)*20);markerLine.hidden=marker===null;if(marker!==null)markerLine.style.left=marker+'px';}
let markerY=0;layout.setGridClick((x,y)=>{setMarker(x);markerY=y;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&marker!==null&&!event.defaultPrevented)setMarker(null);});
function toggleAll(){
  if(sweeps.read().some(head=>!head.looping&&(head.playing||head.loading))){sweeps.stopLines();render();return;}
  if(marker!==null&&!hasPlayback()){void sweeps.add(marker,0,false);return;}
  if(hasPlayback())pause();else if(sweeps.hasPaused()){sweeps.resume();void startTracks(pausedTracks);pausedTracks=[];}else{blocks?.startAll();void startTracks(names.map((_,t)=>t));}}
function seekTrack(t,beat){
  const resume=playback[t].running||playback[t].starting;pauseTrack(t);
  playback[t].beat=snapBeat(Math.min(loopBeats[t],beat),t);render();if(resume)void startTracks([t]);
}
document.querySelectorAll('[data-track-play]').forEach(button=>button.addEventListener('click',()=>toggleTrack(Number(button.dataset.trackPlay))));
document.querySelectorAll('[data-clip]').forEach(button=>button.addEventListener('click',event=>{
  const [t,c]=button.dataset.clip.split(',').map(Number),position=layout.getPositions()[t];
  const pixel=event.detail===0?c*position.width/4:Math.max(0,Math.min(position.width,event.clientX-position.x));
  seekTrack(t,pixel/position.width*position.beats);
}));
document.querySelectorAll('[data-mute]').forEach(button=>button.addEventListener('click',event=>{const t=Number(button.dataset.mute);if(event.metaKey){toggleLinked([t],'mute');return;}muted[t]=!muted[t];updateGain(t);render();recordEdit();}));
document.querySelectorAll('[data-solo]').forEach(button=>button.addEventListener('click',event=>{const t=Number(button.dataset.solo);if(event.metaKey){toggleLinked([t],'solo');return;}solo[t]=!solo[t];names.forEach((_,i)=>updateGain(i));render();recordEdit();}));
play.addEventListener('click',()=>{
  const active=blocks?.hasPlayback()||playback.some(state=>state.running||state.starting)||sweeps.read().some(head=>head.looping&&(head.playing||head.loading));
  if(active){
    pausedTracks=names.map((_,t)=>t).filter(t=>playback[t].running||playback[t].starting);
    blocks?.pauseAll();sweeps.pause(true);names.forEach((_,t)=>pauseTrack(t));render();
  }else{
    const pausedLoops=sweeps.read().some(head=>head.looping);
    blocks?.startAll();sweeps.resume(true);void startTracks(pausedTracks.length?pausedTracks:pausedLoops?[]:names.map((_,t)=>t));pausedTracks=[];
  }
});
$('#play-arrangement').addEventListener('click',()=>{
  const sequence=sweeps.read().find(head=>!head.looping);
  if(sequence&&(sequence.playing||sequence.loading)){sweeps.pause(false);render();return;}
  if(sequence){sweeps.resume(false);return;}
  const positions=allPositions().filter(p=>!p.deleted);if(!positions.length)return;
  const first=0,top=Math.max(0,Math.min(...positions.map(p=>p.y))-window.musicGrid.placementStep);
  void sweeps.add(first,top,false);
});
$('#stop').addEventListener('click',stop);
function changeTempo(value){
  const active=names.map((_,t)=>t).filter(t=>playback[t].running||playback[t].starting);
  const apply=()=>{tempo=value;$('#tempo').value=value;if(delayNode)delayNode.delayTime.setTargetAtTime(45/value,ctx.currentTime,.05);};
  active.forEach(pauseTrack);sweeps.setTempo();if(blocks)blocks.setTempo(apply);else apply();sweeps.reschedule();if(active.length)void startTracks(active);
}
$('#tempo').addEventListener('change',event=>{
  const value=Number(event.target.value);if(!Number.isFinite(value)||value<70||value>160){event.target.value=tempo;return;}
  changeTempo(value);recordEdit();
});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|BUTTON|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();toggleAll();}});
const sweepHeadMarkup=names.map(()=>'');
function setText(element,text){if(element.textContent!==text)element.textContent=text;}
function updatePlayhead(){
  const sizes=layout.getPositions();updateWaveforms(sizes);sweeps.tick(allPositions());blocks?.tick();
  playheads.forEach((head,t)=>{
    fxChains[t]?.apply(sizes[t]);
    const beat=currentBeat(t),active=playback[t].running&&audible(t);
    head.style.left=Math.floor(beat/loopBeats[t]*sizes[t].width+1e-7)+'px';
    head.hidden=!active||ctx.currentTime<playback[t].startedAt;
    cells[t].forEach(cell=>cell.classList.toggle('active',(active||sweeps.trackActive(t))&&audible(t)));
    rows[t].classList.toggle('looping',audible(t)&&(playback[t].running||playback[t].starting));
    const heads=audible(t)?sweeps.trackPositions(t).map(beat=>`<span class="sweep-track-head" style="left:${Math.floor(beat/loopBeats[t]*sizes[t].width)}px"></span>`).join(''):'';
    if(sweepHeadMarkup[t]!==heads)sweepTrackHeads[t].innerHTML=sweepHeadMarkup[t]=heads;
  });
}
function animate(){layout.tick();updatePlayhead();requestAnimationFrame(animate);}
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'read_music_arrangement',description:'Read each track’s independent playback position, tempo, and controls.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{playing:hasPlayback(),tempo,pixelsPerBeat,canvasPlayheads:sweeps.read(),tracks:names.map((name,t)=>({name,playing:playback[t].running,loading:playback[t].starting,beat:currentBeat(t),bars:loopBeats[t]/4,muted:muted[t],solo:solo[t],color:trackColors[t],pitchSemitones:pitches[t],position:layout.getPositions()[t]})).filter(track=>!track.position.deleted)};}};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
function syncTrackPresence(){
  layout.getPositions().forEach((p,t)=>{
    if(p.deleted){if(playback[t].running||playback[t].starting)pauseTrack(t);playback[t].beat=0;}
    updateGain(t);
  });
  render();
}
const samples=window.MUSIC_SAMPLES||[],sampleBuffers=new Map();
function sampleBuffer(id){
  let job=sampleBuffers.get(id);
  if(!job){
    const sample=samples.find(sample=>sample.id===id);if(!sample)return Promise.reject(new Error('This sample is missing.'));
    job=fetchAudio(sample.file).then(data=>ctx.decodeAudioData(data));
    sampleBuffers.set(id,job);job.catch(()=>sampleBuffers.delete(id));
  }
  return job;
}
// Files and storage from before everything ran left to right: a vertical track or clip is laid on its side, and downward regions are dropped.
function layFlat(p,minimumWidth=80,maximumHeight=100000){
  if(!p||typeof p!=='object')return false;
  const flip=p.vertical===true;delete p.vertical;
  if(flip)[p.width,p.height]=[Math.max(minimumWidth,p.height),Math.min(maximumHeight,p.width)];
  return flip;
}
function validBlock(record){
  layFlat(record,record?.sourceSlice?20:80,record?.sourceSlice?100000:2000);
  if(!record||typeof record.id!=='string'||typeof record.name!=='string'||record.name.length>120||![record.x,record.y,record.width,record.height,record.beats].every(Number.isFinite)||record.x<0||record.y<0||record.width<(record.sourceSlice?20:80)||record.height<20||record.height>(record.sourceSlice?100000:2000)||![record.muted,record.solo,record.opened].every(v=>typeof v==='boolean')||record.beats<=0||record.beats>10000||record.data?.state?.blocks?.length)return false;
  if(record.color!=null&&!palette.some(color=>color.id===record.color))return false;
  if(record.pitch!==undefined&&!(Number.isInteger(record.pitch)&&Math.abs(record.pitch)<=24))return false;
  if(record.speed!==undefined&&!validSpeed(record.speed))return false;
  if(record.children!=null&&(!Array.isArray(record.children)||record.children.length<1||record.children.length>256||!record.children.every(validBlock)))return false;
  const validSlice=(slice,depth=0)=>slice&&depth<=32&&[slice.offset,slice.beats].every(Number.isFinite)&&slice.offset>=0&&slice.offset<=100000&&slice.beats>0&&slice.beats<=10000&&(slice.track===undefined||Number.isInteger(slice.track)&&slice.track>=0&&slice.track<names.length&&Number.isFinite(slice.loopBeats)&&slice.loopBeats>0)&&(slice.sample===undefined||samples.some(sample=>sample.id===slice.sample))&&(slice.parent===undefined||validSlice(slice.parent,depth+1));if(record.sourceSlice&&!validSlice(record.sourceSlice))return false;
  try{validArrangement(record.data);return true;}catch{return false;}
}
// A compacted selection: each clip inside sounds from its position, at grid speed, and is cut at its own edge.
async function mixGroup(children){
  const width=Math.max(80,Math.ceil(Math.max(...children.map(child=>child.x+child.width))/80)*80),beats=width/pixelsPerBeat;
  const anySolo=children.some(child=>child.solo),audible=children.filter(child=>!child.muted&&(!anySolo||child.solo));
  const mixes=await Promise.all(audible.map(child=>blocks.mixRecord(child)));
  const rate=arrangements[0].sampleRate,spb=60/baseTempo*rate,buffer=ctx.createBuffer(1,Math.max(1,Math.round(beats*spb)),rate),output=buffer.getChannelData(0);
  audible.forEach((child,index)=>{
    const input=mixes[index].buffer.getChannelData(0),start=Math.round(child.x/pixelsPerBeat*spb);
    const speed=child.speed||1,count=Math.min(output.length-start,Math.round(Math.min(child.beats/speed,child.width/pixelsPerBeat)*spb));
    for(let i=0;i<count;i++){const edge=i<count-1-i?i:count-1-i;output[start+i]+=input[Math.floor(i*speed)%input.length]*(edge<64?edge/64:1);}
  });
  return {buffer,beats};
}
async function mixBlockSnapshot(data,sourceSlice,children){
  if(sourceSlice?.parent){const original=await mixBlockSnapshot(data,sourceSlice.parent,children),rate=original.buffer.sampleRate,buffer=ctx.createBuffer(1,Math.max(1,Math.round(sourceSlice.beats*60/baseTempo*rate)),rate),output=buffer.getChannelData(0),input=original.buffer.getChannelData(0),offset=Math.round(sourceSlice.offset*60/baseTempo*rate);for(let i=0;i<output.length;i++)output[i]=input[(offset+i)%input.length];return {buffer,beats:sourceSlice.beats};}
  if(sourceSlice?.sample){
    const original=await sampleBuffer(sourceSlice.sample),rate=original.sampleRate,buffer=ctx.createBuffer(1,Math.max(1,Math.round(sourceSlice.beats*60/baseTempo*rate)),rate),output=buffer.getChannelData(0),input=original.getChannelData(0),offset=Math.round(sourceSlice.offset*60/baseTempo*rate);
    for(let i=0;i<output.length;i++)output[i]=input[(offset+i)%input.length];return {buffer,beats:sourceSlice.beats};
  }
  if(children){
    const full=await mixGroup(children);if(!sourceSlice)return full;
    const rate=full.buffer.sampleRate,input=full.buffer.getChannelData(0),sliced=ctx.createBuffer(1,Math.max(1,Math.round(sourceSlice.beats*60/baseTempo*rate)),rate),output=sliced.getChannelData(0),offset=Math.round(sourceSlice.offset*60/baseTempo*rate);
    for(let i=0;i<output.length;i++)output[i]=input[(offset+i)%input.length];return {buffer:sliced,beats:sourceSlice.beats};
  }
  const state=data.state,pitched=t=>pitchBufferAsync(t,state.pitches[t]);
  if(sourceSlice&&Number.isInteger(sourceSlice.track)){
    const t=sourceSlice.track,original=await pitched(t),rate=original.sampleRate,buffer=ctx.createBuffer(1,Math.max(1,Math.round(sourceSlice.beats*60/baseTempo*rate)),rate),output=buffer.getChannelData(0),input=original.getChannelData(0),offset=Math.round(sourceSlice.offset*60/baseTempo*rate),loopLength=Math.round(sourceSlice.loopBeats*60/baseTempo*rate);
    if(sourceAudible(state,t))for(let i=0;i<output.length;i++)output[i]=input[((offset+i)%loopLength)%input.length];return {buffer,beats:sourceSlice.beats};
  }
  const rotated=(buffer,beats)=>{if(!beats)return buffer;const input=buffer.getChannelData(0),copy=ctx.createBuffer(1,input.length,buffer.sampleRate),output=copy.getChannelData(0),shift=Math.round(beats*60/baseTempo*buffer.sampleRate);for(let i=0;i<output.length;i++)output[i]=input[(shift+i)%input.length];return copy;};
  const buffers=(await Promise.all(arrangements.map((_,t)=>pitched(t)))).map((buffer,t)=>rotated(buffer,state.positions[t].offset));
  const renderer=window.createMusicSweeps({positions:()=>state.positions,baseTempo,totalBeats,audible:t=>sourceAudible(state,t),audio:()=>({ctx,arrangements:buffers,pixelsPerBeat})});
  const visible=state.positions.filter(p=>!p.deleted),regions=state.regions.length?state.regions.filter(r=>!r.muted&&(!state.regions.some(p=>p.solo)||r.solo)):[{start:Math.min(...visible.map(p=>p.x)),end:Math.max(...visible.map(p=>p.x+p.width)),cross:Math.min(...visible.map(p=>p.y))}];
  const mixes=regions.map(region=>renderer.renderRegion(region)),beats=Math.max(16,Math.ceil(Math.max(0,...mixes.map(mix=>mix.beats))/16)*16),rate=buffers[0].sampleRate,buffer=ctx.createBuffer(1,Math.round(beats*60/baseTempo*rate),rate),samples=buffer.getChannelData(0);
  mixes.forEach(mix=>{const input=mix.buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]+=input[i%input.length];});
  if(sourceSlice){const sliced=ctx.createBuffer(1,Math.max(1,Math.round(sourceSlice.beats*60/baseTempo*rate)),rate),output=sliced.getChannelData(0),offset=Math.round(sourceSlice.offset*60/baseTempo*rate);for(let i=0;i<output.length;i++)output[i]=samples[(offset+i)%samples.length];return {buffer:sliced,beats:sourceSlice.beats};}
  return {buffer,beats};
}
blocks=window.createMusicBlocks({bpmRow,speedLabel,continueAsRegion(x,y,end,beat){void sweeps.add(x,y,true,true,end,{beat});},palette,tint,nextColor,showCycle,nextLength,showSize,hasRange:()=>!!layout.getRange(),shiftTracks(fromY,distance){const positions=layout.getPositions();let moved=false;positions.forEach(p=>{if(!p.deleted&&p.y>=fromY){p.y+=distance;moved=true;}});if(moved){layout.restore(positions);syncTrackPresence();}},splitAt:point=>splitAt(point),mixRevision:()=>JSON.stringify([linkedMuted,linkedSolo]),linkedSoloActive:()=>linkedSolo.some(Boolean),linkedAction:toggleLinked,linkedState:(indices,kind)=>indices.length>0&&(kind==='mute'?indices.every(t=>linkedMuted[t]):indices.some(t=>linkedSolo[t])),canvas:$('#canvas'),baseTempo,regions:()=>sweeps.read().filter(h=>h.looping),globalActive:index=>sweeps.trackActive(names.length+index),globalLoop:index=>sweeps.trackLooping(names.length+index),stopGlobal:index=>sweeps.stopTrack(names.length+index),positions:()=>layout.getPositions(),trackSolo:()=>solo.some((value,t)=>value&&!layout.getPositions()[t].deleted),audio:()=>({ctx,master,tempo}),fxChain:()=>fxChain(),valid:validBlock,
  applying:()=>rootRestoring,capture:()=>captureArrangement('Arrangement',false),clear(){closeMenu();stop();const positions=layout.getPositions();positions.forEach(p=>p.deleted=true);layout.restore(positions);syncTrackPresence();},restore:data=>loadArrangement(data,true),newArrangement(){recordEdit();blockTransaction=true;try{resetArrangement(true);}finally{blockTransaction=false;recordEdit();}},begin(){recordEdit();blockTransaction=true;},end(){blockTransaction=false;recordEdit();},
  moveActive(dx,dy){const positions=layout.getPositions();positions.forEach(p=>{p.x=Math.max(0,p.x+dx);p.y=Math.max(0,p.y+dy);});layout.restore(positions);sweeps.translate(dx,dy);syncTrackPresence();},
  activePlayback:()=>playback.some((p,t)=>!layout.getPositions()[t].deleted&&(p.running||p.starting||sweeps.trackActive(t))),
  toggleActive(){const indices=names.map((_,t)=>t).filter(t=>!layout.getPositions()[t].deleted);if(indices.some(t=>playback[t].running||playback[t].starting)){indices.forEach(t=>{pauseTrack(t);playback[t].beat=0;sweeps.stopTrack(t);});render();}else void startTracks(indices);},
  preview(data,area){return data.state.positions.map((p,t)=>{if(p.deleted)return '';const color=palette.find(c=>c.id===data.state.colors[t])?.hex||'#fafafa',ppb=p.width/p.beats;return `<div class="expanded-preview-track" style="left:${p.x-area.x}px;top:${p.y-area.y}px;width:${p.width}px;height:${p.height}px;background:${color}">${waveform(trackPeaks[t],p.width-6,p.height-4,Math.round((p.offset||0)*ppb),ppb)}</div>`;}).join('');},
  async prepareAudio(){createAudio();await loadAudio();},resumeAudio:async()=>{createAudio();await ctx.resume();},resized(){sweeps.reschedule();layout.setObstacles(()=>blocks.bounds());render();},
  // A block's own pitch is applied to its finished mix, in the pitch worker.
  async mix(data,sourceSlice,pitch,children){const result=await mixBlockSnapshot(data,sourceSlice,children);if(!pitch)return result;const samples=await window.musicPitch(result.buffer.getChannelData(0),pitch),buffer=ctx.createBuffer(1,samples.length,result.buffer.sampleRate);buffer.copyToChannel(samples,0);return {buffer,beats:result.beats};},
  startTime(){const earliest=ctx.currentTime+.06,barSeconds=240/tempo;if(barOrigin===null||!blocks.hasRunning()&&!playback.some(state=>state.running)&&!sweeps.read().some(head=>head.playing)){barOrigin=earliest;return earliest;}return barOrigin+Math.max(0,Math.ceil((earliest-barOrigin)/barSeconds-1e-9))*barSeconds;},
  changed(){if(blocks)layout.setObstacles(()=>blocks.bounds());names.forEach((_,t)=>updateGain(t));render();},record:()=>recordEdit(),error:error=>message.textContent=error.message
});
layout.setObstacles(()=>blocks.bounds());
function trackRecord(t,positions){
  const data=captureArrangement('Arrangement',false);delete data.state.blocks;data.state.regions=[];data.state.positions.forEach((p,i)=>p.deleted=i!==t);data.state.muted.fill(false);data.state.solo.fill(false);
  const p=positions[t];return {id:'',name:names[t],color:trackColors[t],speed:trackSpeeds[t],data,...p,opened:false,muted:muted[t],solo:solo[t],sourceSlice:{track:t,offset:p.offset||0,beats:p.beats,loopBeats:(p.offset||0)+p.beats}};
}
function compactSelection(area=layout.getRange()){
  if(!area||area.width<=0||area.height<=0)return;
  const hit=p=>!p.deleted&&p.x<area.x+area.width&&p.x+p.width>area.x&&p.y<area.y+area.height&&p.y+p.height>area.y,positions=layout.getPositions(),indices=positions.flatMap((p,t)=>hit(p)?[t]:[]);
  if(indices.length+blocks.bounds().filter(hit).length<2)return;
  recordEdit();blockTransaction=true;
  // Regions keep playing through a compact: they pick the new clip up as soon as its audio is mixed.
  try{const records=indices.map(t=>trackRecord(t,positions));indices.forEach(t=>positions[t].deleted=true);layout.restore(positions);blocks.group(area,records);layout.clearRange();syncTrackPresence();}
  finally{blockTransaction=false;recordEdit();}
}
layout.setGroupHandler(area=>compactSelection(area));layout.setSelectHandler(area=>blocks.selectArea(area));
function splitMarquee(area=layout.getRange(),removeMiddle=false){
  if(!area||area.width<=0||area.height<=0)return;
  const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,positions=layout.getPositions(),indices=positions.flatMap((p,t)=>!p.deleted&&intersects(p,area)?[t]:[]);
  if(!indices.length&&!blocks.bounds().some(p=>intersects(p,area)))return;
  recordEdit();blockTransaction=true;
  try{
    pause();const records=indices.map(t=>trackRecord(t,positions));
    indices.forEach(t=>positions[t].deleted=true);layout.restore(positions);blocks.splitRange(area,records,removeMiddle);layout.clearRange();syncTrackPresence();
  }finally{blockTransaction=false;recordEdit();}
}
layout.setRangeHandler(area=>{splitMarquee(area);return blocks.dragParts();});
// Cut the clip under the pointer in two at the nearest grid line (20px, half a beat at normal scale).
let lastPointer=null,clipboard=[];
document.addEventListener('pointermove',event=>{lastPointer={x:event.clientX+window.scrollX,y:event.clientY+window.scrollY};},{passive:true});
function splitAt(point=lastPointer){
  if(!point)return false;
  const hit=layout.getPositions().filter(p=>!p.deleted).concat(blocks.bounds()).find(p=>point.x>=p.x&&point.x<p.x+p.width&&point.y>=p.y&&point.y<p.y+p.height);if(!hit)return false;
  const cut=Math.round(point.x/20)*20;if(cut<=hit.x||cut>=hit.x+hit.width)return false;
  splitMarquee({x:hit.x,y:hit.y,width:cut-hit.x,height:hit.height});return true;
}
let menuPoint=null;
const splitButton=document.createElement('button');splitButton.textContent='Split';splitButton.setAttribute('role','menuitem');menu.insertBefore(splitButton,deleteButton);splitButton.addEventListener('click',()=>{const point=menuPoint;closeMenu();splitAt(point);});
const compactButton=document.createElement('button');compactButton.textContent='Compact';compactButton.setAttribute('role','menuitem');menu.insertBefore(compactButton,deleteButton);compactButton.addEventListener('click',()=>{closeMenu();blocks.compact();});
const undoButton=$('#undo'),redoButton=$('#redo');
editHistory=window.createMusicHistory({
  read:()=>({tempo,pitches:[...pitches],positions:layout.getPositions(),colors:[...trackColors],muted:[...muted],solo:[...solo],linkedMuted:[...linkedMuted],linkedSolo:[...linkedSolo],blocks:blocks?.snapshot()||[],regions:sweeps.read().filter(h=>h.looping).map(h=>({direction:h.direction,start:h.start,end:h.end,cross:h.cross,color:h.color,muted:h.muted,solo:h.solo}))}),
  apply(state){
    rootRestoring=true;try{stop();restoreLinked(state);
    if(state.tempo!==tempo)changeTempo(state.tempo);
    state.pitches.forEach((value,t)=>setTrackPitch(t,value));
    trackColors=[...state.colors];muted.splice(0,muted.length,...state.muted);solo.splice(0,solo.length,...state.solo);
    blocks?.restore(state.blocks||[]);layout.restore(state.positions);names.forEach((_,t)=>applyTrackColor(t));
    try{localStorage.setItem(colorKey,JSON.stringify(trackColors));}catch{}
    (state.regions||[]).forEach(r=>sweeps.add(r.start,r.cross,true,false,r.end,r));syncTrackPresence();}finally{rootRestoring=false;}blocks?.tick();
  },
  changed(state){undoButton.disabled=!state.undo;redoButton.disabled=!state.redo;}
});
function resetArrangement(preserveBlocks=false){
  layout.cancelGestures();closeMenu();stop();if(!preserveBlocks){restoreLinked();blocks?.restore([]);}
  pitches.fill(0);pitchCache.fill(null);pitchPending.fill(null);expandedArrangements.fill(null);try{localStorage.setItem(pitchKey,JSON.stringify(pitches));}catch{}
  tempo=baseTempo;$('#tempo').value=tempo;muted.fill(false);solo.fill(false);trackColors=names.map(()=>null);
  names.forEach((_,t)=>applyTrackColor(t));
  try{localStorage.setItem(colorKey,JSON.stringify(trackColors));}catch{}
  layout.reset();if(preserveBlocks){const positions=layout.getPositions(),bottom=Math.ceil(Math.max(0,...blocks.bounds().map(p=>p.y+p.height))/20)*20+20;positions.forEach(p=>p.y+=bottom);layout.restore(positions);}syncTrackPresence();updatePlayhead();recordEdit();
}
function loadDemo(){loadArrangement(JSON.parse(JSON.stringify(window.MUSIC_DEMO)));message.textContent='';}
$('#reset').addEventListener('click',loadDemo);
pitchHandles.forEach((handle,t)=>{
  let drag=null;
  handle.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();drag={id:event.pointerId,y:event.clientY,pitch:pitches[t]};handle.setPointerCapture(event.pointerId);});
  handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();event.stopPropagation();setTrackPitch(t,drag.pitch-Math.round((event.clientY-drag.y)/12));});
  function finish(cancel){if(!drag)return;const previous=drag;drag=null;if(cancel)setTrackPitch(t,previous.pitch);else recordEdit();if(handle.hasPointerCapture(previous.id))handle.releasePointerCapture(previous.id);}
  handle.addEventListener('pointerup',event=>{event.stopPropagation();finish(false);});handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('lostpointercapture',()=>finish(true));
  handle.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);return;}if(!['ArrowDown','ArrowUp','Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();setTrackPitch(t,event.key==='Home'?0:pitches[t]+(event.key==='ArrowDown'?-1:1));recordEdit();});
  handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();setTrackPitch(t,0);recordEdit();});
});
function undoEdits(){layout.cancelGestures();closeMenu();editHistory.undo();}
function redoEdits(){layout.cancelGestures();closeMenu();editHistory.redo();}
function deleteSelectedTracks(target=null){
  const selection=layout.getSelection(),indices=target===null?selection:selection.includes(target)?selection:[target];
  closeMenu();layout.deleteTracks(indices);$('#canvas').focus();
}
undoButton.addEventListener('click',undoEdits);redoButton.addEventListener('click',redoEdits);
deleteButton.addEventListener('click',()=>{if(menuTrack!==null)deleteSelectedTracks(menuTrack);});
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const key=event.key.toLowerCase(),command=(event.metaKey||event.ctrlKey)&&!event.altKey;
  if(command&&key==='c'){
    // With a marquee, copy just the selected part of each clip; otherwise the selected clips.
    const area=layout.getRange(),positions=layout.getPositions();
    const copied=area?blocks.copyRange(area,positions.flatMap((p,t)=>!p.deleted&&p.x<area.x+area.width&&p.x+p.width>area.x&&p.y<area.y+area.height&&p.y+p.height>area.y?[trackRecord(t,positions)]:[])):blocks.copySelected();
    if(copied.length){event.preventDefault();clipboard=copied;}
  }
  else if(command&&key==='v'&&clipboard.length){
    // Paste at the play marker (click the grid to set it), or at the pointer when there is none.
    const point=marker!==null?{x:marker,y:markerY}:lastPointer;if(!point)return;
    event.preventDefault();layout.clearRange();blocks.paste(clipboard,Math.max(0,Math.round(point.x/20)*20),Math.max(0,Math.floor(point.y/20)*20));
  }
  else if(command&&key==='g'){event.preventDefault();if(layout.getRange())compactSelection();else blocks.groupSelected();}
  else if(command&&key==='e'){event.preventDefault();if(layout.getRange())splitMarquee();else splitAt();}
  else if(command&&(key==='z'||key==='y')){event.preventDefault();if(key==='y'||event.shiftKey)redoEdits();else undoEdits();}
  else if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&(event.key==='Delete'||event.key==='Backspace')){
    if(layout.getRange()){event.preventDefault();splitMarquee(layout.getRange(),true);}
    else if(menuTrack!==null||layout.getSelection().length||blocks.selection().length){
      event.preventDefault();
      // Tracks and clips chosen together go in one edit, so one Undo brings them all back.
      if(menuTrack===null&&blocks.selection().length){recordEdit();blockTransaction=true;try{blocks.removeSelected();deleteSelectedTracks();}finally{blockTransaction=false;recordEdit();}}
      else deleteSelectedTracks(menuTrack);
    }
  }
});
window.createMusicKeyboard({layout,blocks,rows});
const arrangementKey='music-saved-arrangements-v1',loadSelect=$('#load-arrangement'),fileInput=$('#arrangement-file');
let savedArrangements=[];
function validArrangement(data){
  if(!data||data.format!=='music-arrangement'||data.version!==1||typeof data.name!=='string'||data.name.length>120)throw new Error('This is not a Music arrangement file.');
  const state=data.state,n=names.length,finite=value=>Number.isFinite(value)&&value>=0&&value<=100000;
  if(!state||!Number.isFinite(state.tempo)||state.tempo<70||state.tempo>160||!Array.isArray(state.positions)||state.positions.length!==n)throw new Error('Invalid arrangement.');
  const turned=state.positions.map(p=>layFlat(p)),hit=(p,q)=>p.x<q.x+q.width&&p.x+p.width>q.x&&p.y<q.y+q.height&&p.y+p.height>q.y;
  if(!state.positions.every(p=>p&&[p.x,p.y,p.width,p.height].every(finite)&&p.width>=80&&p.height>=20&&typeof p.deleted==='boolean'&&Number.isInteger(p.beats)&&p.beats>=16&&p.beats<=2496&&p.beats%16===0&&(p.offset===undefined||Number.isFinite(p.offset)&&p.offset>=0&&p.offset<totalBeats)))throw new Error('Invalid track positions.');
  // A turned track or clip that now lies on a neighbour moves to the nearest free spot.
  const turnedBlocks=Array.isArray(state.blocks)?state.blocks.filter(b=>b&&b.vertical===true):[],resting=item=>{
    const others=state.positions.filter(p=>p!==item&&!p.deleted).concat(Array.isArray(state.blocks)?state.blocks.filter(b=>b!==item&&b&&!b.opened&&[b.x,b.y,b.width,b.height].every(finite)):[]);
    const board=window.musicBoard;if(item.x+item.width>board.width)item.x=Math.max(0,Math.floor((board.width-item.width)/80)*80);
    if(others.some(other=>hit(item,other))){const spot=layout.freePosition(item,others);if(spot){item.x=spot.x;item.y=spot.y;}}
  };
  state.positions.forEach((p,t)=>{if(turned[t]&&!p.deleted)resting(p);});
  const visible=state.positions.filter(p=>!p.deleted);if(visible.some((p,i)=>visible.slice(i+1).some(q=>p.x<q.x+q.width&&p.x+p.width>q.x&&p.y<q.y+q.height&&p.y+p.height>q.y)))throw new Error('Arrangement tracks overlap.');
  if(!Array.isArray(state.colors)||state.colors.length!==n||!state.colors.every(c=>c===null||palette.some(p=>p.id===c))||!Array.isArray(state.pitches)||state.pitches.length!==n||!state.pitches.every(p=>Number.isInteger(p)&&Math.abs(p)<=24))throw new Error('Invalid track settings.');
  if(!['muted','solo'].every(key=>Array.isArray(state[key])&&state[key].length===n&&state[key].every(v=>typeof v==='boolean')))throw new Error('Invalid playback settings.');
  if(Array.isArray(state.regions))state.regions=state.regions.filter(r=>r?.direction!=='down');
  if(!Array.isArray(state.regions)||state.regions.length>32||!state.regions.every(r=>r&&(r.direction===undefined||r.direction==='right')&&[r.start,r.end,r.cross].every(finite)&&r.end>=r.start+80&&[r.muted,r.solo].every(v=>v===undefined||typeof v==='boolean')))throw new Error('Invalid loop regions.');
  for(const key of ['linkedMuted','linkedSolo'])if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].length!==n||!state[key].every(v=>typeof v==='boolean')))throw new Error('Invalid linked controls.');
  if(state.blocks!==undefined&&(!Array.isArray(state.blocks)||state.blocks.length>256||!state.blocks.every(validBlock)))throw new Error('Invalid arrangement blocks.');
  turnedBlocks.forEach(resting);
  return data;
}
try{const data=JSON.parse(localStorage.getItem(arrangementKey));if(Array.isArray(data))savedArrangements=data.slice(0,50).filter(item=>{try{validArrangement(item);return true;}catch{return false;}});}catch{}
function refreshArrangementLibrary(){
  loadSelect.innerHTML='';const option=document.createElement('option');option.value='';option.textContent='Load';loadSelect.appendChild(option);
  savedArrangements.forEach((data,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=data.name;loadSelect.appendChild(option);});
  const file=document.createElement('option');file.value='file';file.textContent='Open file…';loadSelect.appendChild(file);loadSelect.value='';
}
function captureArrangement(name,includeBlocks=true){
  return {format:'music-arrangement',version:1,name,state:{tempo,positions:layout.getPositions(),colors:[...trackColors],pitches:[...pitches],muted:[...muted],solo:[...solo],...(includeBlocks?{linkedMuted:[...linkedMuted],linkedSolo:[...linkedSolo]}:{}),blocks:includeBlocks?blocks?.snapshot()||[]:[],regions:sweeps.read().filter(head=>head.looping).map(head=>({direction:head.direction,start:head.start,end:head.end,cross:head.cross,color:head.color,muted:head.muted,solo:head.solo}))}};
}
function rememberArrangement(data){
  const index=savedArrangements.findIndex(item=>item.name===data.name);if(index<0)savedArrangements.unshift(data);else savedArrangements[index]=data;savedArrangements=savedArrangements.slice(0,50);
  try{localStorage.setItem(arrangementKey,JSON.stringify(savedArrangements));}catch{}refreshArrangementLibrary();
}
function loadArrangement(data,preserveBlocks=false){
  validArrangement(data);rootRestoring=true;try{layout.cancelGestures();closeMenu();stop();const state=data.state;if(!preserveBlocks){restoreLinked(state);blocks?.restore(state.blocks||[]);}
  tempo=state.tempo;$('#tempo').value=tempo;
  pitches.splice(0,pitches.length,...state.pitches);pitchCache.fill(null);pitchPending.fill(null);expandedArrangements.fill(null);
  muted.splice(0,muted.length,...state.muted);solo.splice(0,solo.length,...state.solo);trackColors=[...state.colors];
  names.forEach((_,t)=>applyTrackColor(t));layout.restore(state.positions);
  try{localStorage.setItem(colorKey,JSON.stringify(trackColors));localStorage.setItem(pitchKey,JSON.stringify(pitches));}catch{}
  state.regions.forEach(r=>sweeps.add(r.start,r.cross,true,false,r.end,r));
  syncTrackPresence();}finally{rootRestoring=false;}fitToBoard();blocks?.tick();recordEdit();message.textContent=`Loaded ${data.name}`;
}
$('#save-arrangement').addEventListener('click',()=>{
  const name=window.prompt('Name this arrangement','My arrangement');if(!name?.trim())return;
  const data=captureArrangement(name.trim().slice(0,120));rememberArrangement(data);
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=data.name.replace(/[^a-z0-9 _-]/gi,'').trim()||'Music arrangement';link.download+='.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=`Saved ${data.name}`;
});
loadSelect.addEventListener('change',()=>{const value=loadSelect.value;loadSelect.value='';if(value==='file'){fileInput.click();return;}if(value!==''&&savedArrangements[Number(value)])loadArrangement(savedArrangements[Number(value)]);});
fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];if(!file)return;try{if(file.size>1048576)throw new Error('Arrangement file is too large.');const data=validArrangement(JSON.parse(await file.text()));loadArrangement(data);rememberArrangement(data);}catch(error){message.textContent=error.message||'Could not load arrangement.';}finally{fileInput.value='';}
});
refreshArrangementLibrary();
// Hovering empty grid beside the tracks offers a play button on the square where a region loop would start.
const regionStart=document.createElement('button');regionStart.className='region-start';regionStart.textContent='▶';regionStart.title='Play a loop from here';regionStart.setAttribute('aria-label',regionStart.title);regionStart.hidden=true;$('#canvas').appendChild(regionStart);
let regionStartAt=null;
document.addEventListener('pointermove',event=>{
  if(event.target===regionStart)return;
  const free=event.pointerType==='mouse'&&!event.buttons&&event.target.closest?.('#canvas')&&!event.target.closest('.track-surface,.arrangement-block,.transport,.context-menu,.canvas-playhead,.marquee-portion,button');
  const x=Math.floor((event.clientX+window.scrollX)/80)*80,y=Math.floor((event.clientY+window.scrollY)/20)*20,tracks=free?allPositions().filter(p=>!p.deleted):[];
  const show=tracks.some(p=>p.x+p.width>x);
  regionStart.hidden=!show;if(show){regionStartAt={x,y};Object.assign(regionStart.style,{left:x+'px',top:y+'px'});}
});
document.documentElement.addEventListener('pointerleave',()=>{regionStart.hidden=true;});
regionStart.addEventListener('pointerdown',event=>event.stopPropagation());
regionStart.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
regionStart.addEventListener('click',event=>{event.stopPropagation();regionStart.hidden=true;void sweeps.add(regionStartAt.x,regionStartAt.y);});
// Drawing in the row above the board makes a loop region: drag for where it starts and how long it runs, in 80px steps.
const loopStrip=document.createElement('div');loopStrip.className='loop-strip';loopStrip.title='Drag to draw a loop region';
const loopDraft=document.createElement('div');loopDraft.className='loop-draft';loopDraft.hidden=true;
$('#canvas').append(loopStrip,loopDraft);
let loopDraw=null;
const loopCell=x=>Math.min(1200,Math.max(0,Math.floor(x/80)*80));
function paintLoopDraft(){
  const {start,end}=loopDraw,bars=(end-start)/160;
  Object.assign(loopDraft.style,{left:start+'px',width:(end-start)+'px'});loopDraft.textContent=bars+(bars===1?' bar':' bars');
}
loopStrip.addEventListener('pointerdown',event=>{
  if(event.button!==0||!event.isPrimary)return;
  event.preventDefault();event.stopPropagation();
  const cell=loopCell(event.clientX);loopDraw={id:event.pointerId,anchor:cell,start:cell,end:cell+80,x:event.clientX,moved:false};
  loopStrip.setPointerCapture(event.pointerId);loopDraft.hidden=false;paintLoopDraft();
});
loopStrip.addEventListener('pointermove',event=>{
  if(!loopDraw||event.pointerId!==loopDraw.id)return;
  if(Math.abs(event.clientX-loopDraw.x)>4)loopDraw.moved=true;
  const cell=loopCell(event.clientX);loopDraw.start=Math.min(loopDraw.anchor,cell);loopDraw.end=Math.max(loopDraw.anchor,cell)+80;paintLoopDraft();
});
function finishLoopDraw(event,cancel){
  if(!loopDraw||event.pointerId!==loopDraw.id)return;
  const draw=loopDraw;loopDraw=null;loopDraft.hidden=true;if(loopStrip.hasPointerCapture(draw.id))loopStrip.releasePointerCapture(draw.id);
  // A plain click draws nothing; only a drag makes a region.
  if(!cancel&&draw.moved)void sweeps.add(draw.start,0,true,true,draw.end);
}
loopStrip.addEventListener('pointerup',event=>finishLoopDraw(event,false));
loopStrip.addEventListener('pointercancel',event=>finishLoopDraw(event,true));
loopStrip.addEventListener('lostpointercapture',event=>finishLoopDraw(event,true));
loopStrip.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&loopDraw){const id=loopDraw.id;loopDraw=null;loopDraft.hidden=true;if(loopStrip.hasPointerCapture(id))loopStrip.releasePointerCapture(id);}});
// Sample explorer: click a row to hear it, drag it onto the grid to place it as a loop.
const sampleList=document.createElement('div');sampleList.className='sample-list';sampleList.hidden=true;sampleList.setAttribute('aria-label','Samples');
sampleList.innerHTML='<div class="sample-heading">Samples · drag onto the grid</div>'+samples.map((sample,i)=>(sample.group&&sample.group!==samples[i-1]?.group?`<div class="sample-group">${sample.group}</div>`:'')+`<button class="sample-row" data-sample="${sample.id}" title="Click to hear, drag to place">${sample.name}</button>`).join('');
document.body.appendChild(sampleList);
const audition=new Audio();let sampleDrag=null;
function placeSample(sample,x,y){
  const data=captureArrangement('Arrangement',false);delete data.state.blocks;data.state.regions=[];data.state.positions.forEach(p=>p.deleted=true);data.state.muted.fill(false);data.state.solo.fill(false);
  blocks.add({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:sample.name,data,x,y,width:sample.beats*pixelsPerBeat,height:80,beats:sample.beats,muted:false,solo:false,opened:false,sourceSlice:{sample:sample.id,offset:0,beats:sample.beats,loopBeats:sample.beats}});
}
sampleList.addEventListener('pointerdown',event=>{
  event.stopPropagation();const row=event.target.closest('[data-sample]');if(!row||event.button!==0||!event.isPrimary)return;
  event.preventDefault();sampleDrag={id:event.pointerId,sample:samples.find(sample=>sample.id===row.dataset.sample),x:event.clientX,y:event.clientY,ghost:null,row};row.setPointerCapture(event.pointerId);
});
sampleList.addEventListener('pointermove',event=>{
  if(!sampleDrag||event.pointerId!==sampleDrag.id)return;
  if(!sampleDrag.ghost){
    if(Math.hypot(event.clientX-sampleDrag.x,event.clientY-sampleDrag.y)<6)return;
    const ghost=document.createElement('div');ghost.className='sample-ghost';ghost.textContent=sampleDrag.sample.name;Object.assign(ghost.style,{width:sampleDrag.sample.beats*pixelsPerBeat+'px',height:'80px'});$('#canvas').appendChild(ghost);sampleDrag.ghost=ghost;
  }
  sampleDrag.left=Math.max(0,Math.floor((event.clientX+window.scrollX)/80)*80);sampleDrag.top=Math.max(0,Math.round((event.clientY+window.scrollY-40)/80)*80);
  sampleDrag.over=!!document.elementsFromPoint(event.rawX??event.clientX,event.rawY??event.clientY).some(element=>element.closest('.sample-list,.transport,.music-header'));
  Object.assign(sampleDrag.ghost.style,{left:sampleDrag.left+'px',top:sampleDrag.top+'px',opacity:sampleDrag.over?.3:1});
});
function finishSample(event,cancel){
  if(!sampleDrag||event.pointerId!==sampleDrag.id)return;
  const state=sampleDrag;sampleDrag=null;if(state.row.hasPointerCapture(state.id))state.row.releasePointerCapture(state.id);
  if(state.ghost){state.ghost.remove();if(!cancel&&!state.over)placeSample(state.sample,state.left,state.top);return;}
  if(cancel)return;
  const playing=!audition.paused&&audition.dataset.sample===state.sample.id;audition.pause();
  if(!playing){audition.src=state.sample.file;audition.dataset.sample=state.sample.id;audition.currentTime=0;void audition.play().catch(()=>{});}
}
sampleList.addEventListener('pointerup',event=>finishSample(event,false));sampleList.addEventListener('pointercancel',event=>finishSample(event,true));
sampleList.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
// Effects panel: one row per effect, one button per edge of the map.
const fxButton=$('#effects-toggle'),fxPanel=document.createElement('div');fxPanel.className='fx-map';fxPanel.hidden=true;fxPanel.setAttribute('aria-label','Effect map');document.body.appendChild(fxPanel);
let fxOpen=window.musicBoard.menuBeside;
const fxGuides=document.createElement('div');fxGuides.className='fx-guides';fxGuides.setAttribute('aria-hidden','true');$('#canvas').appendChild(fxGuides);
function renderFx(){
  const marks=['×','↑','↓','←','→'],words=['off','strongest at the top','strongest at the bottom','strongest on the left','strongest on the right'];
  fxPanel.innerHTML='<div class="fx-row"><span>Strongest</span>'+['off','top','low','left','right'].map(word=>`<i>${word}</i>`).join('')+'</div>'
    +fxNames.map(([id,label])=>`<div class="fx-row"><span>${label}</span>${fxEdges.map((edge,i)=>`<button data-fx="${id}" data-edge="${edge}" aria-pressed="${fxMap[id]===edge}" title="${label}: ${words[i]}" aria-label="${label}: ${words[i]}">${marks[i]}</button>`).join('')}</div>`).join('')
    +'<p class="fx-note">Where a clip sits on the canvas sets how much it gets. Pan: that edge is the right speaker. Filter: that edge is darkest. The map is the whole board, edge to edge.</p>';
  fxButton.setAttribute('aria-pressed',String(fxNames.some(([id])=>fxMap[id]!=='off')));
  // Edge labels on the board say what each side does: the strong end of every active effect, and its opposite.
  const edges={up:[],down:[],left:[],right:[]},across={up:'down',down:'up',left:'right',right:'left'},ends={reverb:['Reverb wet','Reverb dry'],delay:['Echo','No echo'],pan:['Pan right','Pan left'],filter:['Filter dark','Filter open']};
  fxNames.forEach(([id])=>{const edge=fxMap[id];if(edge==='off')return;edges[edge].push(ends[id][0]);edges[across[edge]].push(ends[id][1]);});
  fxGuides.innerHTML=Object.entries(edges).map(([edge,list])=>list.length?`<span class="fx-edge-${edge}">${list.join(' · ')}</span>`:'').join('');
}
fxPanel.addEventListener('pointerdown',event=>event.stopPropagation());fxPanel.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
fxPanel.addEventListener('click',event=>{
  const button=event.target.closest('[data-fx]');if(!button)return;
  fxMap[button.dataset.fx]=button.dataset.edge;fxVersion++;try{localStorage.setItem(fxKey,JSON.stringify(fxMap));}catch{}
  renderFx();sweeps.reschedule();render();
});
fxButton.addEventListener('click',()=>{fxOpen=!fxOpen;fxPanel.hidden=!fxOpen;});
renderFx();
const settingsButton=$('#music-settings'),settings=$('.transport');
function showSettings(open){fxPanel.hidden=!open||!fxOpen;sampleList.hidden=!open;if(!open)audition.pause();settings.hidden=!open;settingsButton.setAttribute('aria-expanded',String(open));}
settingsButton.addEventListener('click',()=>showSettings(settings.hidden));
// Beside the board the menu stays open, whatever is clicked; over the board it closes on a click elsewhere or Escape.
document.addEventListener('pointerdown',event=>{if(!settings.hidden&&!window.musicBoard.menuBeside&&!event.target.closest('.music-header,.transport,.sample-list,.fx-map'))showSettings(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!settings.hidden&&!window.musicBoard.menuBeside){showSettings(false);settingsButton.focus();}});
// Open when there is room for it beside the board, and tidy away when a resize takes the room.
let menuWasBeside=null;
function placeMenu(){const beside=window.musicBoard.menuBeside;if(beside===menuWasBeside)return;menuWasBeside=beside;if(beside)fxOpen=true;showSettings(beside);}
placeMenu();window.addEventListener('resize',placeMenu);

// Arrangements made before the board had a fixed size can reach past it; slide everything back so nothing is cut off.
function fitToBoard(){
  const board=window.musicBoard,all=layout.getPositions().filter(p=>!p.deleted).concat(blocks.bounds());if(!all.length)return;
  const left=Math.min(...all.map(p=>p.x)),top=Math.min(...all.map(p=>p.y)),right=Math.max(...all.map(p=>p.x+p.width)),bottom=Math.max(...all.map(p=>p.y+p.height));
  const dx=right>board.width?-Math.min(Math.ceil((right-board.width)/80)*80,Math.floor(left/80)*80):0,dy=bottom>board.height?-Math.min(Math.ceil((bottom-board.height)/80)*80,Math.floor(top/80)*80):0;
  if(!dx&&!dy)return;
  const positions=layout.getPositions();positions.forEach(p=>{p.x=Math.max(0,p.x+dx);p.y=Math.max(0,p.y+dy);});blocks.shift(dx,dy);layout.restore(positions);syncTrackPresence();
}
fitToBoard();
if(firstVisit&&window.MUSIC_DEMO)loadDemo();
render();animate();
