'use strict';
// A global canvas loop mixes both track orientations on a shared audio-clock timeline.
window.createMusicSweeps=function(options){
  const {placementStep}=window.musicGrid;
  const heads=[],regionColors=['#e9e4ff','#dceeff','#ffe7ed','#fff0cf','#dff3e5','#f5e4d5','#e0f3f1','#eee7d7'];let activeSignature='',nextRegionColor=0;
  const axis=(p,vertical)=>({start:vertical?p.y:p.x,end:vertical?p.y+p.height:p.x+p.width,cross:vertical?p.x:p.y,span:vertical?p.width:p.height});
  function regionBounds(head,positions){
    const tracks=positions.filter(p=>!p.deleted).map(p=>axis(p,head.vertical));
    const first=tracks.length?Math.min(...tracks.map(p=>p.cross)):head.cross,last=tracks.length?Math.max(...tracks.map(p=>p.cross+p.span)):head.cross+20;
    return head.vertical?{left:first,top:head.origin,right:last,bottom:head.end}:{left:head.origin,top:first,right:head.end,bottom:last};
  }
  function arrangeTabs(positions=options.positions()){
    const remaining=heads.filter(head=>head.controls),bounds=new Map(remaining.map(head=>[head,regionBounds(head,positions)]));
    const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    while(remaining.length){
      const group=[remaining.shift()];
      for(let i=0;i<group.length;i++)for(let j=remaining.length-1;j>=0;j--)if(overlaps(bounds.get(group[i]),bounds.get(remaining[j])))group.push(remaining.splice(j,1)[0]);
      group.sort((a,b)=>heads.indexOf(a)-heads.indexOf(b));
      const left=Math.min(...group.map(head=>bounds.get(head).left)),right=Math.max(...group.map(head=>bounds.get(head).right)),top=Math.min(...group.map(head=>bounds.get(head).top));
      const columns=Math.max(1,Math.floor((right-left)/80)),rows=Math.ceil(group.length/columns);
      group.forEach((head,i)=>{const row=Math.floor(i/columns),count=Math.min(columns,group.length-row*columns);Object.assign(head.controls.style,{left:(right-count*80+i%columns*80)+'px',top:Math.max(20,top-rows*20)+row*20+'px'});});
    }
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
  function buildTimeline(head,tracks,defaultSpeed){
    const clips=tracks.filter(p=>p.vertical===head.vertical&&options.audible(p.t)&&!head.skipped.has(p.t)&&p.start<head.end&&p.end>head.origin);
    const edges=Array.from(new Set([head.origin,head.end,...clips.flatMap(p=>[Math.max(head.origin,p.start),Math.min(head.end,p.end)])])).sort((a,b)=>a-b);
    const nearest=(a,b)=>Math.abs(a.cross-head.cross)-Math.abs(b.cross-head.cross)||a.t-b.t;
    let beat=0;head.timeline=[];
    for(let i=0;i<edges.length-1;i++){
      const start=edges[i],end=edges[i+1];
      const active=clips.filter(p=>p.start<=start&&p.end>start).sort((a,b)=>b.start-a.start||nearest(a,b));
      const upcoming=clips.filter(p=>p.start>start).sort((a,b)=>a.start-b.start||nearest(a,b));
      const previous=clips.filter(p=>p.end<=start).sort((a,b)=>b.end-a.end||nearest(a,b));
      const clip=active[0]||upcoming[0]||previous[0],speed=clip?(clip.end-clip.start)/clip.beats:defaultSpeed;
      const beats=(end-start)/speed;head.timeline.push({start,end,beat,beats,speed});beat+=beats;
    }
    head.cycleBeats=beat;
  }
  function pixelForBeat(head,beat){
    const phase=head.looping?beat%head.cycleBeats:Math.min(head.cycleBeats,beat);
    const segment=head.timeline.find(p=>phase<p.beat+p.beats)||head.timeline.at(-1);
    return segment?Math.min(segment.end,segment.start+Math.max(0,phase-segment.beat)*segment.speed):head.origin;
  }
  function beatForPixel(head,pixel){
    if(pixel<=head.origin)return 0;if(pixel>=head.end)return head.cycleBeats;
    const segment=head.timeline.find(p=>pixel<p.end);return segment.beat+(pixel-segment.start)/segment.speed;
  }
  function coordinate(head){
    const span=head.end-head.origin;if(!head.running||span<=0)return head.position;
    return pixelForBeat(head,timelineBeat(head));
  }
  function cancelSource(head){if(head.source){try{head.source.stop();}catch{}head.source=null;}}
  function geometry(head,positions){return positions.map((p,t)=>({...axis(p,head.vertical),t,vertical:p.vertical,beats:p.beats,deleted:p.deleted})).filter(p=>!p.deleted&&(p.vertical!==head.vertical||p.end>head.origin));}
  function signature(head,positions){return JSON.stringify([positions,positions.map((_,t)=>options.audible(t)),Array.from(head.skipped)]);}
  function paint(head,positions){
    const tracks=positions.filter(p=>!p.deleted).map(p=>axis(p,head.vertical));
    const first=tracks.length?Math.min(...tracks.map(p=>p.cross)):head.cross,last=tracks.length?Math.max(...tracks.map(p=>p.cross+p.span)):head.cross+20;
    const position=Math.floor(coordinate(head)),length=head.end-head.origin;
    Object.assign(head.element.style,head.vertical?{left:first+'px',top:head.origin+'px',width:(last-first)+'px',height:length+'px'}:{left:head.origin+'px',top:first+'px',width:length+'px',height:(last-first)+'px'});
    Object.assign(head.cursor.style,head.vertical?{left:first+'px',top:position+'px',width:(last-first)+'px',height:'1px'}:{left:position+'px',top:first+'px',width:'1px',height:(last-first)+'px'});
    if(head.resizeHandle)Object.assign(head.resizeHandle.style,head.vertical?{left:((first+last)/2-6)+'px',top:(head.end-6)+'px'}:{left:(head.end-6)+'px',top:((first+last)/2-6)+'px'});
    head.progress.style[head.vertical?'top':'left']=Math.floor(coordinate(head)-head.origin)+'px';
    head.element.classList.toggle('paused',!head.running&&!head.loading);head.cursor.classList.toggle('paused',!head.running&&!head.loading);
    for(const [button,value,kind] of [[head.muteButton,head.muted,'muted'],[head.soloButton,head.solo,'soloed']])if(button){button.classList.toggle(kind,value);button.setAttribute('aria-pressed',String(value));}
    if(head.playButton){const active=head.running||head.loading;head.playButton.textContent=active?'Ⅱ':'▶';head.playButton.title=active?'Pause white playback area':'Play white playback area';head.playButton.setAttribute('aria-label',head.playButton.title);}
  }
  function buildMix(head,positions){
    const {ctx,arrangements,pixelsPerBeat}=options.audio(),tracks=geometry(head,positions);
    head.end=head.customEnd??head.fixedEnd??Math.max(head.origin+20,...tracks.map(p=>p.end));
    const span=head.end-head.origin;
    buildTimeline(head,tracks,pixelsPerBeat);
    const cycleBeats=head.cycleBeats,rate=arrangements[0].sampleRate;
    const length=Math.max(1,Math.round(cycleBeats*60/options.baseTempo*rate));
    const mix=ctx.createBuffer(1,length,rate),samples=mix.getChannelData(0);head.voices=[];
    tracks.forEach(p=>{
      if(head.skipped.has(p.t))return;
      const startBeat=p.vertical===head.vertical?beatForPixel(head,p.start):0;
      const offsetBeat=p.vertical===head.vertical?Math.max(0,(head.origin-p.start)/(p.end-p.start)*p.beats):0;
      const durationBeats=Math.min(p.beats-offsetBeat,cycleBeats-startBeat);if(durationBeats<=0)return;
      head.voices.push({t:p.t,startBeat,offsetBeat,durationBeats});
      if(!options.audible(p.t))return;
      const original=arrangements[p.t].getChannelData(0),start=Math.round(startBeat*60/options.baseTempo*rate);
      const count=Math.min(length-start,Math.round(durationBeats*60/options.baseTempo*rate)),offset=Math.round(offsetBeat*60/options.baseTempo*rate);
      for(let i=0;i<count;i++){
        const fade=Math.min(1,i/64,(count-1-i)/64);
        samples[start+i]+=original[(offset+i)%original.length]*fade;
      }
    });
    head.mix=mix;head.signature=signature(head,positions);
  }
  function startSource(head){
    cancelSource(head);
    const {ctx,tempo,pixelsPerBeat,master}=options.audio(),source=ctx.createBufferSource();source.buffer=head.mix;source.loop=head.looping;
    source.playbackRate.value=tempo/options.baseTempo;if(!head.gain){head.gain=ctx.createGain();head.gain.connect(master);}
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
    head.epoch++;cancelSource(head);head.gain?.disconnect();head.element.remove();head.cursor.remove();head.controls?.remove();head.resizeHandle?.remove();
    const index=heads.indexOf(head);if(index!==-1)heads.splice(index,1);updateRegionGains();
  }
  async function launch(head){
    const token=++head.epoch;head.loading=true;head.paused=false;options.changed();
    try{
      await options.prepare();if(token!==head.epoch||!heads.includes(head))return;
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
    const handle=document.createElement('button');handle.className='global-loop-resize'+(head.vertical?' down':'');handle.title='Resize white loop end';handle.setAttribute('aria-label','Resize white loop end; use arrow keys');
    let drag=null;
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary)return;
      event.preventDefault();event.stopPropagation();drag={id:event.pointerId,end:head.end,customEnd:head.customEnd,start:head.vertical?event.clientY+window.scrollY:event.clientX+window.scrollX};handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;event.preventDefault();event.stopPropagation();resizeArea(head,drag.end+(head.vertical?event.clientY+window.scrollY:event.clientX+window.scrollX)-drag.start);});
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
      const delta=head.vertical?({ArrowDown:placementStep,ArrowUp:-placementStep}[event.key]):({ArrowRight:placementStep,ArrowLeft:-placementStep}[event.key]);
      if(delta){event.preventDefault();event.stopPropagation();resizeArea(head,head.end+delta);}
    });
    head.resizeHandle=handle;options.canvas.appendChild(handle);
  }
  function add(x,y,vertical=false,looping=true,autoplay=true,savedEnd,savedState={}){
    const origin=Math.max(0,Math.round((vertical?y:x)/placementStep)*placementStep);
    const head={origin,position:origin,beat:0,cross:Math.max(0,Math.round((vertical?x:y)/placementStep)*placementStep),vertical,looping,color:regionColors.includes(savedState.color)?savedState.color:(regionColors.find(color=>!heads.some(head=>head.looping&&head.color===color))||regionColors[nextRegionColor++%regionColors.length]),muted:!!savedState.muted,solo:!!savedState.solo,startedAt:0,running:false,loading:false,paused:false,epoch:0,voices:[],skipped:new Set(),source:null};
    const tracks=geometry(head,options.positions());if(savedEnd===undefined&&(!tracks.length||Math.max(...tracks.map(p=>p.end))<=origin))return;
    head.end=savedEnd??Math.max(...tracks.map(p=>p.end));if(looping)head.fixedEnd=head.end;head.paused=!autoplay;
    const element=document.createElement('div');element.className='canvas-playhead-track'+(vertical?' down':'');element.style.setProperty('--region-color',head.color);element.hidden=!looping;element.setAttribute('role','group');element.setAttribute('aria-label',looping?'Global playback loop':'Global arrangement playback');
    const stop=document.createElement('button');stop.className='canvas-loop-stop';stop.textContent='■';stop.setAttribute('aria-label','Stop global playback loop');stop.title='Stop loop';
    const progress=document.createElement('span');progress.className='canvas-loop-progress';progress.setAttribute('aria-hidden','true');
    const cursor=document.createElement('button');cursor.className='canvas-playhead'+(vertical?' down':'');cursor.setAttribute('aria-label','Stop global playback loop');cursor.title='Stop loop';
    const end=event=>{event.stopPropagation();remove(head);options.changed();};stop.addEventListener('click',end);cursor.addEventListener('click',end);
    element.appendChild(progress);
    if(looping&&options.controls){
      const controls=document.createElement('div');controls.className='white-loop-controls';controls.addEventListener('pointerdown',event=>event.stopPropagation());controls.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});controls.setAttribute('role','group');controls.style.setProperty('--region-color',head.color);controls.setAttribute('aria-label','Loop region playback controls');
      const play=document.createElement('button');play.className='white-loop-play';play.addEventListener('click',event=>{event.stopPropagation();if(head.running||head.loading){pauseHead(head);options.changed();}else void launch(head);});
      stop.className='white-loop-stop';controls.appendChild(play);controls.appendChild(stop);
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
  function tick(positions=options.positions()){
    heads.slice().forEach(head=>{if(head.running&&!head.looping&&coordinate(head)>=head.end){remove(head);options.changed();return;}if(head.running&&head.signature!==signature(head,positions))rescheduleHead(head,positions);paint(head,positions);});
    arrangeTabs(positions);
    const next=positions.map((_,t)=>trackActive(t)).join(',');
    if(next!==activeSignature){activeSignature=next;options.changed();}
  }
  function trackPositions(t,looping){
    const now=options.audio().ctx?.currentTime;
    return heads.flatMap(head=>{
      if(!head.running||!regionAudible(head)||now<head.startedAt||looping!==undefined&&head.looping!==looping)return [];
      const elapsed=timelineBeat(head),phase=head.looping?elapsed%head.cycleBeats:Math.min(head.cycleBeats,elapsed);
      return head.voices.filter(voice=>voice.t===t&&phase>=voice.startBeat&&phase<voice.startBeat+voice.durationBeats).map(voice=>voice.offsetBeat+phase-voice.startBeat);
    });
  }
  function trackActive(t){return trackPositions(t).length>0;}
  function stopTrack(t){heads.forEach(head=>{head.skipped.add(t);if(head.running)rescheduleHead(head,options.positions());});}
  function setTempo(){heads.forEach(head=>{if(head.running){head.position=coordinate(head);head.beat=timelineBeat(head);head.startedAt=Math.max(options.audio().ctx.currentTime,head.startedAt);}});}
  function reschedule(){heads.forEach(head=>{if(head.running)rescheduleHead(head,options.positions());});}
  return {add,tick,pause,resume,stop,stopTrack,setTempo,reschedule,trackActive,trackLooping:t=>trackPositions(t,true).length>0,trackPositions,hasPlayback:()=>heads.some(head=>head.running||head.loading),hasPaused:()=>heads.some(head=>head.paused),read:()=>heads.map(head=>({direction:head.vertical?'down':'right',cross:head.cross,color:head.color,muted:head.muted,solo:head.solo,start:head.origin,position:coordinate(head),end:head.end,looping:head.looping,beats:head.cycleBeats,playing:head.running,loading:head.loading}))};
};
