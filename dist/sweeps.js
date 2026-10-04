'use strict';
// A global canvas loop mixes the clips it covers on a shared audio-clock timeline.
window.createMusicSweeps=function(options){
  const {placementStep}=window.musicGrid;
  const heads=[],regionColors=['#2a2547','#1d2c45','#3d2232','#3a311b','#1d3628','#3b2a1e','#1b3535','#33302b'];let activeSignature='',nextRegionColor=0;
  const axis=p=>({start:p.x,end:p.x+p.width,cross:p.y,span:p.height});
  // Every region runs the full height of the board, top to bottom.
  function regionBounds(head){return {left:head.origin,top:0,right:head.end,bottom:options.canvas.offsetHeight||960};}
  function arrangeTabs(positions=options.positions()){
    // Tabs sit in the row above the board, next to the Music chip.
    const placed=[{left:0,top:-20,right:80,bottom:0}],overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    heads.filter(head=>head.controls).forEach(head=>{
      const bounds=regionBounds(head,positions),columns=Math.max(1,Math.floor((bounds.right-bounds.left)/100)),rows=Math.max(1,Math.floor((bounds.bottom-bounds.top)/20));
      // Tabs sit on the square above the region, clear of the tracks; later ones step along it, then inside.
      const first=-20;let tab;
      for(let i=0;i<columns*(rows+1);i++){
        const left=bounds.left+i%columns*100,top=first+Math.floor(i/columns)*20;
        tab={left,top,right:left+100,bottom:top+20};if(!placed.some(other=>overlaps(tab,other)))break;
      }
      placed.push(tab);Object.assign(head.controls.style,{left:tab.left+'px',top:tab.top+'px'});
    });
  }
  function timelineBeat(head){
    if(!head.running)return head.beat;
    const {ctx,tempo}=options.audio();
    return head.beat+Math.max(0,ctx.currentTime-head.startedAt)*tempo/60;
  }
  function regionAudible(head){return !head.muted&&(!head.looping||!heads.some(h=>h.looping&&h.solo)||head.solo);}
  function updateRegionGains(){
    heads.forEach(head=>{if(head.gain)head.gain.gain.setTargetAtTime(regionAudible(head)?1:0,options.audio().ctx.currentTime,.012);paint(head,options.positions());});
    arrangeTabs();options.changed();
  }
  // The playhead always moves at grid speed, so a region lasts exactly its width in beats.
  function buildTimeline(head,speed){
    const beats=(head.end-head.origin)/speed;
    head.timeline=[{start:head.origin,end:head.end,beat:0,beats,speed}];head.cycleBeats=beats;
  }
  function pixelForBeat(head,beat){
    const phase=head.looping?beat%head.cycleBeats:Math.min(head.cycleBeats,beat);
    const segment=head.timeline.find(p=>phase<p.beat+p.beats)||head.timeline.at(-1);
    return segment?Math.min(segment.end,segment.start+Math.max(0,phase-segment.beat)*segment.speed):head.origin;
  }
  function coordinate(head){
    const span=head.end-head.origin;if(!head.running||span<=0)return head.position;
    return pixelForBeat(head,timelineBeat(head));
  }
  function cancelSource(head){if(head.source){try{head.source.stop();}catch{}head.source=null;}}
  function geometry(head,positions){return positions.map((p,t)=>({...axis(p),t,rect:{x:p.x,y:p.y,width:p.width,height:p.height},beats:p.beats,speed:p.speed||1,deleted:p.deleted})).filter(p=>!p.deleted&&p.end>head.origin);}
  // The part every region shares is built once per frame, not once per region.
  function sharedSignature(positions){return JSON.stringify([positions,positions.map((_,t)=>options.audible(t)),options.audio().arrangements?.map(Boolean),positions.map((_,t)=>!!options.looping?.(t))]);}
  function signature(head,positions,shared=sharedSignature(positions)){return shared+JSON.stringify(Array.from(head.skipped));}
  function paint(head,positions){
    const tracks=positions.filter(p=>!p.deleted).map(axis);
    // One-shot playback draws its playhead across the whole canvas, like an arrangement cursor.
    const first=0,last=options.canvas.offsetHeight||960;
    const position=Math.floor(coordinate(head)),length=head.end-head.origin;
    Object.assign(head.element.style,{left:head.origin+'px',top:first+'px',width:length+'px',height:(last-first)+'px'});
    Object.assign(head.cursor.style,{left:position+'px',top:first+'px',width:'1px',height:(last-first)+'px'});
    if(head.resizeHandle)Object.assign(head.resizeHandle.style,{left:(head.end-6)+'px',top:((first+last)/2-6)+'px'});
    head.progress.style.left=Math.floor(coordinate(head)-head.origin)+'px';
    head.element.classList.toggle('paused',!head.running&&!head.loading);head.cursor.classList.toggle('paused',!head.running&&!head.loading);
    for(const [button,value,kind] of [[head.muteButton,head.muted,'muted'],[head.soloButton,head.solo,'soloed']])if(button){button.classList.toggle(kind,value);button.setAttribute('aria-pressed',String(value));}
    if(head.playButton){const active=head.running||head.loading,icon=active?'Ⅱ':'▶';if(head.playButton.textContent!==icon)head.playButton.textContent=icon;head.playButton.title=active?'Pause loop region':'Play loop region';head.playButton.setAttribute('aria-label',head.playButton.title);}
  }
  function buildMix(head,positions){
    const {ctx,arrangements,pixelsPerBeat}=options.audio(),tracks=geometry(head,positions);
    head.end=head.customEnd??head.fixedEnd??Math.max(head.origin+20,...tracks.map(p=>p.end));
    const span=head.end-head.origin;
    buildTimeline(head,pixelsPerBeat);
    const cycleBeats=head.cycleBeats,rate=arrangements[0].sampleRate;
    const length=Math.max(1,Math.round(cycleBeats*60/options.baseTempo*rate));
    // Channels: left, right, reverb send, echo send. Each clip's place on the effect map is baked in here.
    const mix=ctx.createBuffer(4,length,rate),left=mix.getChannelData(0),right=mix.getChannelData(1),toReverb=mix.getChannelData(2),toEcho=mix.getChannelData(3);head.voices=[];
    tracks.forEach(p=>{
      // A clip looping on its own is left to that loop; a region never doubles it.
      if(head.skipped.has(p.t)||options.looping?.(p.t))return;
      // A clip along the region sounds only while the playhead is over it, at normal speed, once.
      // A squeezed clip is therefore cut at its edge; a stretched one falls silent when its audio ends.
      const from=Math.max(head.origin,p.start),to=Math.min(head.end,p.end);
      const startBeat=(from-head.origin)/pixelsPerBeat,offsetBeat=(from-p.start)/pixelsPerBeat;
      // At its own playback speed a clip runs through its audio faster or slower than the grid.
      const durationBeats=Math.min(p.beats/p.speed-offsetBeat,(to-from)/pixelsPerBeat);if(durationBeats<=0)return;
      head.voices.push({t:p.t,startBeat,offsetBeat,durationBeats,scale:pixelsPerBeat*p.beats/(p.end-p.start)});
      // A block that is still mixing joins on the reschedule its finished buffer triggers.
      if(!options.audible(p.t)||!arrangements[p.t])return;
      const original=arrangements[p.t].getChannelData(0),start=Math.round(startBeat*60/options.baseTempo*rate);
      const count=Math.min(length-start,Math.round(durationBeats*60/options.baseTempo*rate)),offset=Math.round(offsetBeat*60/options.baseTempo*rate);
      const fx=options.fx?options.fx(p.rect):{left:1,right:1,reverb:0,delay:0,cutoff:20000},smooth=fx.cutoff<19000?1-Math.exp(-2*Math.PI*fx.cutoff/rate):1;
      let read=offset*p.speed%original.length,low=0;
      for(let i=0;i<count;i++){
        const edge=i<count-1-i?i:count-1-i,whole=read|0,next=whole+1<original.length?whole+1:0,sample=original[whole]+(original[next]-original[whole])*(read-whole);let value=edge<64?sample*edge/64:sample;
        if(smooth<1){low+=smooth*(value-low);value=low;}
        left[start+i]+=value*fx.left;right[start+i]+=value*fx.right;if(fx.reverb)toReverb[start+i]+=value*fx.reverb;if(fx.delay)toEcho[start+i]+=value*fx.delay;
        read+=p.speed;if(read>=original.length)read-=original.length;
      }
    });
    head.mix=mix;head.signature=signature(head,positions);
  }
  function startSource(head){
    cancelSource(head);
    const {ctx,tempo,pixelsPerBeat,master,reverb,delayBus}=options.audio(),source=ctx.createBufferSource();source.buffer=head.mix;source.loop=head.looping;
    source.playbackRate.value=tempo/options.baseTempo;if(!head.gain){head.gain=ctx.createGain();head.gain.channelInterpretation='discrete';if(reverb){head.split=ctx.createChannelSplitter(4);head.merge=ctx.createChannelMerger(2);head.gain.connect(head.split);head.split.connect(head.merge,0,0);head.split.connect(head.merge,1,1);head.merge.connect(master);head.split.connect(reverb,2);head.split.connect(delayBus,3);}else head.gain.connect(master);}
    head.gain.gain.value=regionAudible(head)?1:0;source.connect(head.gain);
    const phase=(head.looping?head.beat%head.cycleBeats:Math.min(head.cycleBeats,head.beat))/head.cycleBeats;
    source.start(head.startedAt,Math.max(0,Math.min(1-1e-9,phase))*head.mix.length/head.mix.sampleRate);
    source.onended=()=>{source.disconnect();if(!head.looping&&head.source===source&&head.running){remove(head);options.changed();}};head.source=source;
  }
  function rescheduleHead(head,positions){
    head.beat=timelineBeat(head);head.startedAt=Math.max(options.audio().ctx.currentTime,head.startedAt);
    buildMix(head,positions);
    head.position=coordinate(head);startSource(head);
  }
  function remove(head){
    head.epoch++;cancelSource(head);head.gain?.disconnect();head.split?.disconnect();head.merge?.disconnect();head.element.remove();head.cursor.remove();head.controls?.remove();head.resizeHandle?.remove();
    const index=heads.indexOf(head);if(index!==-1)heads.splice(index,1);updateRegionGains();
  }
  async function launch(head){
    const token=++head.epoch;head.loading=true;head.paused=false;options.changed();
    try{
      await options.prepare();if(token!==head.epoch||!heads.includes(head))return;
      // Starting a region takes over the clips it covers: their own loops stop.
      options.release?.(geometry(head,options.positions()).filter(p=>p.start<head.end).map(p=>p.t));
      head.startedAt=options.startTime();buildMix(head,options.positions());
      head.position=head.origin+((head.position-head.origin)%(head.end-head.origin));head.running=true;head.loading=false;
      startSource(head);paint(head,options.positions());options.clearMessage();
    }catch(error){if(token===head.epoch){remove(head);options.error(error);}}
    finally{if(token===head.epoch)head.loading=false;options.changed();}
  }
  function resizeArea(head,end){
    head.customEnd=Math.max(head.origin+placementStep,Math.round(end/placementStep)*placementStep);
    if(head.running)rescheduleHead(head,options.positions());
    else if(head.mix){buildMix(head,options.positions());head.position=pixelForBeat(head,head.beat);}
    else head.end=head.customEnd;
    paint(head,options.positions());arrangeTabs();options.changed();
  }
  function areaResizeHandle(head){
    const handle=document.createElement('button');handle.className='global-loop-resize';handle.title='Resize loop region end';handle.setAttribute('aria-label','Resize loop region end; use arrow keys');
    let drag=null;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary)return;
      event.preventDefault();event.stopPropagation();drag={id:event.pointerId,end:head.end,customEnd:head.customEnd,start:event.clientX+window.scrollX};handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();event.stopPropagation();resizeArea(head,drag.end+event.clientX+window.scrollX-drag.start);});
    function finish(cancel){
      if(!drag)return;const previous=drag;drag=null;
      if(cancel){head.customEnd=previous.customEnd;if(head.running)rescheduleHead(head,options.positions());else if(head.mix){buildMix(head,options.positions());head.position=pixelForBeat(head,head.beat);}else head.end=previous.end;paint(head,options.positions());options.changed();}
      if(handle.hasPointerCapture(previous.id))handle.releasePointerCapture(previous.id);
    }
    handle.addEventListener('pointerup',event=>{event.stopPropagation();finish(false);});
    handle.addEventListener('pointercancel',()=>finish(true));handle.addEventListener('lostpointercapture',()=>finish(true));
    handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
    handle.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();finish(true);return;}
      const delta={ArrowRight:placementStep,ArrowLeft:-placementStep}[event.key];
      if(delta){event.preventDefault();event.stopPropagation();resizeArea(head,head.end+delta);}
    });
    head.resizeHandle=handle;options.canvas.appendChild(handle);
  }
  function add(x,y,looping=true,autoplay=true,savedEnd,savedState={}){
    // Loop regions start on the placement grid; one-shot playback can start on any grid square.
    const snap=looping?placementStep:20,origin=Math.max(0,Math.round(x/snap)*snap);
    const head={origin,position:origin,beat:savedState.beat||0,cross:Math.max(0,Math.round(y/placementStep)*placementStep),looping,color:regionColors.includes(savedState.color)?savedState.color:(regionColors.find(color=>!heads.some(head=>head.looping&&head.color===color))||regionColors[nextRegionColor++%regionColors.length]),muted:!!savedState.muted,solo:!!savedState.solo,startedAt:0,running:false,loading:false,paused:false,epoch:0,voices:[],skipped:new Set(),source:null};
    const tracks=geometry(head,options.positions());if(savedEnd===undefined&&(!tracks.length||Math.max(...tracks.map(p=>p.end))<=origin))return;
    head.end=savedEnd??Math.max(...tracks.map(p=>p.end));if(looping)head.fixedEnd=head.end;head.paused=!autoplay;
    const element=document.createElement('div');element.className='canvas-playhead-track';element.style.setProperty('--region-color',head.color);element.hidden=!looping;element.setAttribute('role','group');element.setAttribute('aria-label',looping?'Global playback loop':'Global arrangement playback');
    const stop=document.createElement('button');stop.className='canvas-loop-stop';stop.textContent='■';stop.setAttribute('aria-label','Stop and remove loop region');stop.title='Stop and remove region';
    const progress=document.createElement('span');progress.className='canvas-loop-progress';progress.setAttribute('aria-hidden','true');
    const cursor=document.createElement('button');cursor.className='canvas-playhead'+(looping?'':' transport-line');cursor.setAttribute('aria-label','Stop global playback loop');cursor.title='Stop loop';
    const end=event=>{event.stopPropagation();remove(head);options.changed();};stop.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();remove(head);options.changed();});cursor.addEventListener('click',end);
    element.appendChild(progress);
    if(looping&&options.controls){
      const controls=document.createElement('div');controls.className='white-loop-controls';controls.addEventListener('pointerdown',event=>event.stopPropagation());controls.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});controls.setAttribute('role','group');controls.style.setProperty('--region-color',head.color);controls.setAttribute('aria-label','Loop region playback controls');
      const play=document.createElement('button');play.className='white-loop-play';play.addEventListener('click',event=>{event.stopPropagation();for(const part of [head.element,head.cursor,head.controls,head.resizeHandle])if(part)options.canvas.appendChild(part);if(head.running||head.loading){pauseHead(head);options.changed();}else void launch(head);});
      // Grip: drag (or use the arrow keys) to slide the whole region along the grid.
      const grip=document.createElement('button');grip.className='white-loop-move';grip.textContent='⠿';grip.title='Move loop region';grip.setAttribute('aria-label','Move loop region; drag or use arrow keys');
      const shift=(base,delta)=>{
        delta=Math.max(Math.round(delta/placementStep)*placementStep,-base.origin);if(head.origin===base.origin+delta)return;
        head.origin=base.origin+delta;head.end=base.end+delta;if(base.fixedEnd!==undefined)head.fixedEnd=base.fixedEnd+delta;if(base.customEnd!==undefined)head.customEnd=base.customEnd+delta;
        if(head.running)rescheduleHead(head,options.positions());else if(head.mix){buildMix(head,options.positions());head.position=pixelForBeat(head,head.beat);}else head.position=head.origin;
        paint(head,options.positions());arrangeTabs();options.changed();
      };
      const base=()=>({origin:head.origin,end:head.end,fixedEnd:head.fixedEnd,customEnd:head.customEnd});
      let moving=null;const along=event=>event.clientX+window.scrollX;
      grip.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();moving={id:event.pointerId,start:along(event),base:base()};grip.setPointerCapture(event.pointerId);});
      grip.addEventListener('pointermove',event=>{if(!moving||event.pointerId!==moving.id)return;event.preventDefault();shift(moving.base,along(event)-moving.start);});
      const moved=cancel=>{if(!moving)return;const state=moving;moving=null;if(grip.hasPointerCapture(state.id))grip.releasePointerCapture(state.id);if(cancel)shift(state.base,0);};
      grip.addEventListener('pointerup',()=>moved(false));grip.addEventListener('pointercancel',()=>moved(true));grip.addEventListener('click',event=>event.stopPropagation());
      grip.addEventListener('keydown',event=>{const delta={ArrowLeft:-placementStep,ArrowRight:placementStep}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();shift(base(),delta);});
      stop.className='white-loop-stop';controls.appendChild(grip);controls.appendChild(play);controls.appendChild(stop);
      for(const [key,label] of [['muted','Mute'],['solo','Solo']]){
        const button=document.createElement('button');button.textContent=label[0];button.title=label+' loop region';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(head[key]));
        button.addEventListener('click',event=>{event.stopPropagation();head[key]=!head[key];updateRegionGains();});controls.appendChild(button);head[key==='muted'?'muteButton':'soloButton']=button;
      }
      options.canvas.appendChild(controls);head.controls=controls;head.playButton=play;
    }
    head.element=element;head.cursor=cursor;head.progress=progress;head.stopButton=stop;
    heads.push(head);updateRegionGains();options.canvas.appendChild(element);options.canvas.appendChild(cursor);if(looping)areaResizeHandle(head);paint(head,options.positions());arrangeTabs();if(autoplay)void launch(head);else options.changed();return head;
  }
  function pauseHead(head){if(head.running||head.loading){head.position=coordinate(head);head.beat=timelineBeat(head);head.running=false;head.loading=false;head.paused=true;head.epoch++;cancelSource(head);paint(head,options.positions());}}
  function pause(looping){heads.filter(head=>looping===undefined||head.looping===looping).forEach(pauseHead);}
  function resume(looping){heads.filter(head=>head.paused&&(looping===undefined||head.looping===looping)).forEach(head=>void launch(head));}
  function stop(){heads.slice().forEach(remove);}
  function stopLines(){heads.filter(head=>!head.looping).forEach(remove);}
  function tick(positions=options.positions()){
    const shared=heads.some(head=>head.running)?sharedSignature(positions):'';
    heads.slice().forEach(head=>{if(head.running&&!head.looping&&coordinate(head)>=head.end){remove(head);options.changed();return;}if(head.running&&head.signature!==signature(head,positions,shared))rescheduleHead(head,positions);paint(head,positions);});
    arrangeTabs(positions);
    const next=positions.map((_,t)=>trackActive(t)).join(',');
    if(next!==activeSignature){activeSignature=next;options.changed();}
  }
  function trackPositions(t,looping){
    const now=options.audio().ctx?.currentTime;
    return heads.flatMap(head=>{
      if(!head.running||!regionAudible(head)||now<head.startedAt||looping!==undefined&&head.looping!==looping)return [];
      const elapsed=timelineBeat(head),phase=head.looping?elapsed%head.cycleBeats:Math.min(head.cycleBeats,elapsed);
      return head.voices.filter(voice=>voice.t===t&&phase>=voice.startBeat&&phase<voice.startBeat+voice.durationBeats).map(voice=>(voice.offsetBeat+phase-voice.startBeat)*voice.scale);
    });
  }
  function trackActive(t){return trackPositions(t).length>0;}
  function stopTrack(t){heads.forEach(head=>{head.skipped.add(t);if(head.running)rescheduleHead(head,options.positions());});}
  function setTempo(){heads.forEach(head=>{if(head.running){head.position=coordinate(head);head.beat=timelineBeat(head);head.startedAt=Math.max(options.audio().ctx.currentTime,head.startedAt);}});}
  function reschedule(){heads.forEach(head=>{if(head.running)rescheduleHead(head,options.positions());});}
  function translate(dx,dy){heads.forEach(head=>{head.origin+=dx;head.end+=dx;head.position+=dx;head.cross+=dy;if(head.fixedEnd!==undefined)head.fixedEnd+=dx;if(head.customEnd!==undefined)head.customEnd+=dx;if(head.running)rescheduleHead(head,options.positions());paint(head,options.positions());});arrangeTabs();}
  function renderRegion(region){
    const head={origin:region.start,end:region.end,fixedEnd:region.end,cross:region.cross||0,looping:true,skipped:new Set()};
    buildMix(head,options.positions());return {buffer:head.mix,beats:head.cycleBeats};
  }
  return {translate,renderRegion,add,tick,pause,resume,stop,stopLines,stopTrack,setTempo,reschedule,trackActive,trackLooping:t=>trackPositions(t,true).length>0,trackPositions,hasPlayback:()=>heads.some(head=>head.running||head.loading),hasPaused:()=>heads.some(head=>head.paused),read:()=>heads.map(head=>({direction:'right',cross:head.cross,color:head.color,muted:head.muted,solo:head.solo,start:head.origin,position:coordinate(head),end:head.end,looping:head.looping,beats:head.cycleBeats,playing:head.running,loading:head.loading}))};
};
