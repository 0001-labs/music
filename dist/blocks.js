'use strict';
window.createMusicBlocks=function(options){
  const key='music-arrangement-blocks-v1',step=80,rowStep=20,clone=value=>JSON.parse(JSON.stringify(value)),compactIcon='M6 2v4H2M10 14v-4h4M2 2l4 4M14 14l-4-4',expandIcon='M6 2H2v4M10 14h4v-4M2 2l4 4M14 14l-4-4';
  let items=[],editing=null,menuTarget=null,selected=null,selectedParts=new Set(),transitioning=false;
  const menu=document.createElement('div');menu.className='context-menu arrangement-block-menu';menu.hidden=true;menu.setAttribute('role','menu');options.canvas.appendChild(menu);
  const compactControl=document.createElement('button');compactControl.className='arrangement-compact';compactControl.title='Compact arrangement';compactControl.setAttribute('aria-label','Compact arrangement');compactControl.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="'+compactIcon+'"/></svg>';compactControl.addEventListener('pointerdown',event=>event.stopPropagation());compactControl.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});compactControl.addEventListener('click',event=>{event.stopPropagation();compact();});options.canvas.appendChild(compactControl);
  const buttons={};
  let menuPoint=null;
  for(const [action,label] of [['compact','Compact'],['open','Expand'],['split','Split'],['duplicate','Duplicate'],['new','New arr.'],['delete','Delete']]){
    const button=document.createElement('button');button.textContent=label;button.setAttribute('role','menuitem');if(action==='delete')button.className='menu-delete';menu.appendChild(button);buttons[action]=button;
    button.addEventListener('click',()=>{menu.hidden=true;if(action==='compact')compact();if(action==='split')options.splitAt(menuPoint);if(action==='open')open(menuTarget);if(action==='duplicate')duplicate(menuTarget);if(action==='new'){options.begin();if(editing)freezeEditing();else if(options.positions().some(p=>!p.deleted)){const data=options.capture(),area=metrics(data);delete data.state.blocks;create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:'',data,x:area.x,y:area.y,width:Math.max(step,Math.ceil((area.right-area.x)/step)*step),height:80,beats:Math.max(16,Math.ceil((area.right-area.x)/40/16)*16),muted:false,solo:false,opened:true});}options.newArrangement();persist();options.end();}if(action==='delete')remove(menuTarget);});
  }
  // BPM row: a clip's own tempo, kept as a speed relative to the global tempo; pitch follows speed.
  const clipBpm=options.bpmRow(speed=>{
    const item=items.find(p=>p.id===menuTarget);if(!item)return;
    const running=item.running,beat=running?phase(item):item.beat,at=running?Math.max(options.audio().ctx.currentTime,item.startedAt):0;if(running)halt(item);
    item.speed=speed;item.beat=beat%item.beats;if(running)source(item,at);
    paint(item);persist();options.resized();options.record();
  });
  menu.appendChild(clipBpm.row);
  const sizeCycle=document.createElement('button');sizeCycle.className='size-cycle';sizeCycle.setAttribute('role','menuitem');sizeCycle.title='Display size; click for the next size';sizeCycle.innerHTML='<span>Size</span><b></b>';menu.appendChild(sizeCycle);
  sizeCycle.addEventListener('click',()=>{const item=items.find(p=>p.id===menuTarget);if(!item)return;options.begin();item.setLength(options.nextLength(item.beats,item.width,rowStep,rowStep));persist();options.end();options.showSize(sizeCycle,item.beats,item.width);});
  const colorCycle=document.createElement('button');colorCycle.className='color-cycle';colorCycle.setAttribute('role','menuitem');colorCycle.innerHTML='<span>Color</span><i aria-hidden="true"></i>';menu.appendChild(colorCycle);
  colorCycle.addEventListener('click',()=>{const item=items.find(p=>p.id===menuTarget);if(!item)return;item.color=options.nextColor(item.color);options.showCycle(colorCycle,item.color);paint(item);persist();options.record();});
  function metrics(data){const tracks=data.state.positions.filter(p=>!p.deleted);if(!tracks.length)return {x:0,y:0,right:80,bottom:80};const regions=data.state.regions;return {x:Math.floor(Math.min(...tracks.map(p=>p.x),...regions.map(r=>r.start))/step)*step,y:Math.floor(Math.min(...tracks.map(p=>p.y))/rowStep)*rowStep,right:Math.max(...tracks.map(p=>p.x+p.width),...regions.map(r=>r.end)),bottom:Math.max(...tracks.map(p=>p.y+p.height))};}
  function height(item){if(!item.opened)return item.height;const area=metrics(item.data);return Math.max(80,area.bottom-area.y);}
  function rectangle(item){return {x:item.x,y:item.y,width:item.width,height:height(item),beats:item.beats,speed:item.speed||1,deleted:false};}
  function snapshot(captureRoot=true){return items.map(item=>{const {id,name,x,y,width,height,beats,muted,solo,opened,durationEdited=false,sourceSlice,color=null,pitch=0,speed=1,children}=item;const data=item.id===editing&&captureRoot&&!transitioning&&!options.applying()?options.capture():clone(item.data);delete data.state.blocks;return {id,name,color,pitch,speed,children:children?clone(children):undefined,data,x,y,width,height,beats,muted,solo,opened,durationEdited,sourceSlice,active:item.id===editing};});}
  function freezeEditing(){const item=items.find(item=>item.id===editing);if(item){item.data=options.capture();delete item.data.state.blocks;item.buffer=null;item.sourceBuffer=null;item.previewSignature=null;}editing=null;}

  function persist(captureRoot=true){try{localStorage.setItem(key,JSON.stringify(snapshot(captureRoot)));}catch{}options.changed();}
  function bounds(){return items.filter(item=>item.id!==editing).map(rectangle);}
  const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  function free(item,x,y){const next={...rectangle(item),x,y};return ![...(item.id===editing?[]:options.positions().filter(p=>!p.deleted)),...items.filter(other=>other!==item&&other.id!==editing).map(rectangle)].some(other=>intersects(next,other));}
  function phase(item){return item.running?item.beat+Math.max(0,options.audio().ctx.currentTime-item.startedAt)*options.audio().tempo/60*(item.speed||1):item.beat;}
  function audible(item){return item.id!==editing&&!item.muted&&(options.linkedSoloActive()||!options.trackSolo()&&!items.some(p=>p.solo)||item.solo);}
  function gains(){items.forEach(item=>{if(item.gain)item.gain.gain.setTargetAtTime(audible(item)?1:0,options.audio().ctx.currentTime,.012);paint(item);});options.changed();}
  function halt(item,reset=false){item.epoch++;item.running=false;item.loading=false;if(item.source){try{item.source.stop();}catch{}item.source=null;}if(reset)item.beat=0;paint(item);}
  function pause(item){item.beat=phase(item);halt(item);}
  function stop(){items.forEach(item=>halt(item,true));}
  function paint(item){
    if(item.paintedColor!==item.color){item.paintedColor=item.color;const color=options.palette.find(p=>p.id===item.color);for(const [key,value] of [['--block-rest',color?options.tint(color.hex,.55):''],['--block-color',color?color.hex:''],['--block-ink',color?.id==='blue'?'#fff':'']])item.element.style.setProperty(key,value);}
    {const pitch=item.pitch||0,text=pitch?`${pitch>0?'+':'−'}${Math.abs(pitch)}`:'↓',handle=item.pitchHandle;handle.hidden=item.opened;if(handle.textContent!==text){handle.textContent=text;handle.dataset.active=String(pitch!==0);handle.title=`Pitch ${pitch>0?'+':''}${pitch} semitones; drag up or down`;handle.setAttribute('aria-label',handle.title);}}
    item.fx?.apply(rectangle(item));
    // Display scale tag, as on tracks: shown whenever the clip is drawn narrower or wider than 40px per beat.
    // The title carries the display size whenever it is not 100%, as on tracks.
    {const percent=+(item.width/item.beats/40*100).toFixed(1),sized=item.sourceSlice||item.children,speed=item.speed||1,text=[item.name,sized&&percent!==100?percent+'%':'',options.speedLabel(speed)].filter(Boolean).join(' ');if(item.titleText!==text){item.titleText=text;item.title.textContent=text;}}
    item.element.hidden=false;item.element.classList.toggle('expanded-arrangement',item.opened);item.element.classList.toggle('editing-arrangement',item.id===editing);item.preview.hidden=!item.opened||item.id===editing;
    // A compacted clip shows a miniature of what is inside it, in the clips' own colors, instead of a waveform.
    const compacted=!item.sourceSlice;item.wave.toggleAttribute('hidden',item.opened||compacted);item.mini.hidden=item.opened||!compacted;
    if(compacted&&!item.opened){
      const source=item.children||item.data;
      if(item.miniSource!==source){
        item.miniSource=source;let parts;
        if(item.children)parts=item.children.map(child=>({x:child.x,y:child.y,width:child.width,height:child.height,color:child.color}));
        else{const state=item.data.state,area=metrics(item.data);parts=state.positions.flatMap((p,t)=>p.deleted?[]:[{x:p.x-area.x,y:p.y-area.y,width:p.width,height:p.height,color:state.colors[t]}]);}
        const across=Math.max(step,Math.ceil(Math.max(0,...parts.map(p=>p.x+p.width))/step)*step),down=Math.max(1,...parts.map(p=>p.y+p.height));
        item.mini.innerHTML=parts.map(p=>`<i style="left:${p.x/across*100}%;top:${p.y/down*100}%;width:${p.width/across*100}%;height:${p.height/down*100}%;background:${options.palette.find(color=>color.id===p.color)?.hex||'#d6d6d6'}"></i>`).join('');
      }
      item.mini.style.width=(item.sourceBeats||item.beats)/item.beats*100+'%';
    }
    item.moveGrip.hidden=!item.opened;item.expand.hidden=item.id===editing||!!item.sourceSlice&&!item.children;item.expand.title=item.opened?'Compact arrangement':'Expand arrangement';item.expand.setAttribute('aria-label',item.expand.title);item.expand.querySelector('path').setAttribute('d',item.opened?compactIcon:expandIcon);Object.assign(item.element.style,{left:item.x+'px',top:item.y+'px',width:item.width+'px',height:height(item)+'px'});item.trim.hidden=item.resize.hidden=item.trimStart.hidden=item.opened;
    const active=item.id===editing?options.activePlayback():item.running||item.loading||options.globalActive(items.indexOf(item));item.element.classList.toggle('playing',active&&audible(item));item.label.hidden=true;if(item.play.textContent!==(active?'■':'▶'))item.play.textContent=active?'■':'▶';item.play.title=active?'Stop clip and reset':'Play clip loop';item.play.setAttribute('aria-label',item.play.title);item.play.setAttribute('aria-pressed',String(active));item.loop.hidden=true;item.element.classList.toggle('looping',item.running&&audible(item));item.mute.classList.toggle('muted',item.muted);item.soloButton.classList.toggle('soloed',item.solo);const indices=item.data.state.positions.flatMap((p,t)=>p.deleted?[]:[t]),linkedMute=options.linkedState(indices,'mute'),linkedSolo=options.linkedState(indices,'solo');item.mute.classList.toggle('linked-control',linkedMute);item.soloButton.classList.toggle('linked-control',linkedSolo);item.mute.setAttribute('aria-pressed',String(item.muted||linkedMute));item.soloButton.setAttribute('aria-pressed',String(item.solo||linkedSolo));
    item.cursor.hidden=!item.running||!audible(item);item.cursor.style.left=Math.floor(phase(item)%item.beats/item.beats*item.width)+'px';item.element.classList.toggle('selected',selected===item.id||selectedParts.has(item.id));
    if(item.opened){const signature=JSON.stringify(item.data)+':'+item.width;if(item.previewSignature!==signature){item.previewSignature=signature;item.preview.innerHTML=options.preview(item.data,metrics(item.data));}return;}
    const signature=item.width+':'+item.height+':'+item.beats+':'+(item.buffer?'ready':'pending');if(item.waveSignature===signature)return;
    const samples=item.buffer?.getChannelData(0),timeLength=item.width,count=Math.max(1,Math.floor(timeLength/2));
    const envelope=Array.from({length:count},(_,i)=>{
      if(!samples)return 0;
      const start=Math.floor(i*samples.length/count),end=Math.max(start+1,Math.floor((i+1)*samples.length/count));let peak=0,energy=0;
      for(let j=start;j<end;j++){const value=samples[j]||0;peak=Math.max(peak,Math.abs(value));energy+=value*value;}
      return .35*peak+.65*Math.sqrt(energy/(end-start));
    });
    const max=Math.max(...envelope,.001),cross=item.height;
    item.waveSignature=signature;item.wave.innerHTML='<path class="block-wave" d="'+envelope.map((value,i)=>{const amplitude=Math.max(1,Math.round(value/max*cross*.84)),offset=Math.round((cross-amplitude)/2);return `M${i*2+.5} ${offset}v${amplitude}`;}).join('')+'"/>';
    const sourceBeats=item.sourceBeats||item.beats;
    for(let beat=sourceBeats;beat<item.beats;beat+=sourceBeats)item.wave.innerHTML+=`<path d="M${beat/item.beats*timeLength} 0v${cross}" class="block-loop-boundary"/>`;
    item.wave.setAttribute('viewBox',`0 0 ${item.width} ${item.height}`);
  }
  function loopBuffer(item){
    const original=item.sourceBuffer;if(!original)return;
    const length=Math.round(item.beats*60/options.baseTempo*original.sampleRate);
    if(length===original.length)item.buffer=original;
    else{item.buffer=options.audio().ctx.createBuffer(1,length,original.sampleRate);const input=original.getChannelData(0),output=item.buffer.getChannelData(0);for(let i=0;i<length;i++)output[i]=input[i%input.length];}
    item.waveSignature=null;
  }

  async function prepare(item,force=false){
    if(item.buffer&&!force)return item.buffer;const data=clone(item.data),version=JSON.stringify([data,options.mixRevision(),item.pitch||0,item.children||null]);
    if(item.preparing&&item.preparingVersion===version)return item.preparing;
    const pending=options.prepareAudio().then(()=>options.mix(data,item.sourceSlice,item.pitch||0,item.children)).then(result=>{if(JSON.stringify([item.data,options.mixRevision(),item.pitch||0,item.children||null])===version){item.sourceBuffer=result.buffer;item.sourceBeats=result.beats;if(!item.durationEdited)item.beats=result.beats;loopBuffer(item);paint(item);}else return prepare(item,true);return item.buffer||result.buffer;}).finally(()=>{if(item.preparing===pending)item.preparing=null;});
    item.preparingVersion=version;item.preparing=pending;return pending;
  }
  async function remix(){
    await Promise.all(items.filter(item=>item.id!==editing).map(async item=>{
      item.buffer=null;item.sourceBuffer=null;item.waveSignature=null;await prepare(item);
      if(!items.includes(item))return;
      if(item.running){const beat=phase(item),at=Math.max(options.audio().ctx.currentTime,item.startedAt);halt(item);item.beat=beat;source(item,at);}paint(item);
    }));options.changed();
  }
  function source(item,at){const {ctx,master,tempo}=options.audio();if(!item.gain){item.gain=ctx.createGain();item.fx=options.fxChain?.();item.gain.connect(item.fx?item.fx.input:master);}item.gain.gain.value=audible(item)?1:0;const source=ctx.createBufferSource();source.buffer=item.buffer;source.loop=true;source.playbackRate.value=tempo/options.baseTempo*(item.speed||1);source.connect(item.gain);source.start(at,item.beat%item.beats*60/options.baseTempo);source.onended=()=>source.disconnect();item.source=source;item.startedAt=at;item.running=true;item.loading=false;}
  async function play(item){if(item.id===editing){options.toggleActive();return;}const token=++item.epoch;item.loading=true;paint(item);try{await options.resumeAudio();await prepare(item);if(token!==item.epoch||!items.includes(item))return;source(item,options.startTime());options.changed();}catch(error){options.error(error);item.loading=false;paint(item);}}
  function create(record){
    const item={...clone(record),epoch:0,beat:0,running:false,loading:false,buffer:null};
    const element=document.createElement('div');element.className='arrangement-block';element.tabIndex=0;element.setAttribute('aria-label','Arrangement block '+item.name);item.element=element;
    const wave=document.createElementNS?document.createElementNS('http://www.w3.org/2000/svg','svg'):document.createElement('svg');wave.classList.add('block-waveform');item.wave=wave;element.appendChild(wave);
    const mini=document.createElement('div');mini.className='block-minimap';mini.setAttribute('aria-hidden','true');item.mini=mini;element.appendChild(mini);
    const preview=document.createElement('div');preview.className='expanded-arrangement-tracks';item.preview=preview;element.appendChild(preview);
    const controls=document.createElement('div');controls.className='block-controls';element.appendChild(controls);
    const control=(text,title,handler)=>{const button=document.createElement('button');button.textContent=text;button.title=title;button.setAttribute('aria-label',title);button.addEventListener('click',event=>{event.stopPropagation();handler(event);});controls.appendChild(button);return button;};
    item.play=control('▶','Play clip loop',()=>{if(item.id===editing){options.toggleActive();return;}if(item.running||item.loading||options.globalActive(items.indexOf(item))){if(!item.running&&!item.loading)options.stopGlobal(items.indexOf(item));halt(item,true);options.changed();}else void play(item);});
    const label=document.createElement('span');label.className='block-name';controls.appendChild(label);item.label=label;
    const title=document.createElement('span');title.className='block-title';item.title=title;element.appendChild(title);
    const end=document.createElement('div');end.className='block-end-controls';element.appendChild(end);item.loop=document.createElement('span');item.loop.textContent='↻';end.appendChild(item.loop);
    item.mute=control('M','Mute block; Command-click for every matching instrument',event=>{if(event.metaKey){options.linkedAction(item.data.state.positions.flatMap((p,t)=>p.deleted?[]:[t]),'mute');return;}item.muted=!item.muted;gains();persist();options.record();});item.soloButton=control('S','Solo block; Command-click for every matching instrument',event=>{if(event.metaKey){options.linkedAction(item.data.state.positions.flatMap((p,t)=>p.deleted?[]:[t]),'solo');return;}item.solo=!item.solo;gains();persist();options.record();});end.appendChild(item.mute);end.appendChild(item.soloButton);item.expand=control('','Expand arrangement',()=>item.opened?collapse(item.id):open(item.id));item.expand.className='block-expand';item.expand.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="'+expandIcon+'"/></svg>';end.appendChild(item.expand);
    item.moveGrip=document.createElement('span');item.moveGrip.className='arrangement-move-grip';item.moveGrip.textContent='⠿';item.moveGrip.title='Move whole arrangement';item.moveGrip.setAttribute('aria-label','Move whole arrangement');item.moveGrip.tabIndex=0;element.appendChild(item.moveGrip);
    item.cursor=document.createElement('span');item.cursor.className='block-playhead';element.appendChild(item.cursor);
    const handle=(kind,title)=>{const button=document.createElement('button');button.className=kind+'-handle block-'+kind;button.title=title;button.setAttribute('aria-label',title);button.dataset.blockHandle=kind;element.appendChild(button);return button;};
    item.trim=handle('trim','Trim loop end');item.resize=handle('resize','Scale display');
    // Start handle: the end stays put. Dragging right crops the beginning; dragging left brings earlier audio back in.
    item.trimStart=handle('trim','Trim loop start');item.trimStart.classList.add('block-trim-start');item.trimStart.dataset.blockHandle='trim-start';
    let starting=null;
    const startTo=(base,delta)=>{
      const scale=base.width/base.beats,beatStep=item.sourceSlice||item.children?Math.max(.001,step/scale):16;
      const beats=Math.min(2496,Math.max(beatStep,Math.round((base.beats-delta/scale)/beatStep)*beatStep)),far=base.x+base.width,near=Math.round((far-beats*scale)/step)*step;
      if(near<0||near>=far||beats===item.beats)return;
      const next={...rectangle(item),x:near,width:far-near};
      if([...options.positions().filter(p=>!p.deleted),...items.filter(other=>other!==item&&other.id!==editing).map(rectangle)].some(other=>intersects(next,other)))return;
      item.x=near;item.width=far-near;item.beats=beats;paint(item);options.resized();
    };
    const startCommit=base=>{
      const shift=base.beats-item.beats;
      if(shift){
        const slice=item.sourceSlice||{},span=slice.loopBeats??slice.parent?.beats??item.sourceBeats??base.beats;
        item.sourceSlice={...slice,offset:(((slice.offset||0)+shift)%span+span)%span,beats:item.beats};item.durationEdited=false;
        prepare(item,true).then(()=>{if(!items.includes(item))return;if(item.running){const beat=phase(item),at=Math.max(options.audio().ctx.currentTime,item.startedAt);halt(item);item.beat=beat%item.beats;source(item,at);}paint(item);options.resized();}).catch(options.error);
      }
      persist();options.end();
    };
    const startBase=()=>({x:item.x,y:item.y,width:item.width,height:item.height,beats:item.beats});
    item.trimStart.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();options.begin();starting={id:event.pointerId,x:event.clientX,base:startBase()};item.trimStart.setPointerCapture(event.pointerId);});
    item.trimStart.addEventListener('pointermove',event=>{if(!starting||event.pointerId!==starting.id)return;event.preventDefault();event.stopPropagation();startTo(starting.base,event.clientX-starting.x);});
    const startEnd=cancel=>{if(!starting)return;const state=starting;starting=null;if(item.trimStart.hasPointerCapture(state.id))item.trimStart.releasePointerCapture(state.id);if(cancel){Object.assign(item,state.base);paint(item);options.resized();}startCommit(state.base);};
    item.trimStart.addEventListener('pointerup',()=>startEnd(false));item.trimStart.addEventListener('pointercancel',()=>startEnd(true));
    item.trimStart.addEventListener('keydown',event=>{const sign={ArrowLeft:-1,ArrowRight:1}[event.key];if(!sign)return;event.preventDefault();event.stopPropagation();options.begin();const base=startBase();startTo(base,sign*(item.sourceSlice||item.children?step:16*base.width/base.beats));startCommit(base);});
    // Pitch handle, as on tracks: drag up or down, arrow keys, double-click to reset.
    item.pitchHandle=document.createElement('button');item.pitchHandle.className='track-pitch-handle';element.appendChild(item.pitchHandle);
    const setPitch=value=>{
      value=Math.max(-24,Math.min(24,Math.round(value)));if(value===(item.pitch||0))return;item.pitch=value;paint(item);
      prepare(item,true).then(()=>{if(!items.includes(item))return;if(item.running){const beat=phase(item),at=Math.max(options.audio().ctx.currentTime,item.startedAt);halt(item);item.beat=beat;source(item,at);}paint(item);options.resized();}).catch(options.error);
    };
    let pitching=null;
    const pitchDone=()=>{persist();options.record();};
    item.pitchHandle.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();pitching={id:event.pointerId,y:event.clientY,pitch:item.pitch||0};item.pitchHandle.setPointerCapture(event.pointerId);});
    item.pitchHandle.addEventListener('pointermove',event=>{if(!pitching||event.pointerId!==pitching.id)return;event.preventDefault();event.stopPropagation();setPitch(pitching.pitch-Math.round((event.clientY-pitching.y)/12));});
    const pitchEnd=cancel=>{if(!pitching)return;const state=pitching;pitching=null;if(item.pitchHandle.hasPointerCapture(state.id))item.pitchHandle.releasePointerCapture(state.id);if(cancel)setPitch(state.pitch);else pitchDone();};
    item.pitchHandle.addEventListener('pointerup',event=>{event.stopPropagation();pitchEnd(false);});item.pitchHandle.addEventListener('pointercancel',()=>pitchEnd(true));
    item.pitchHandle.addEventListener('click',event=>event.stopPropagation());
    item.pitchHandle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();setPitch(0);pitchDone();});
    item.pitchHandle.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home'].includes(event.key))return;event.preventDefault();event.stopPropagation();setPitch(event.key==='Home'?0:(item.pitch||0)+(event.key==='ArrowDown'?-1:1));pitchDone();});
    let sizing=null;
    const resizeTo=(baseline,dx,dy,trim)=>{
      const next={...rectangle(item)};
      let beats=item.beats;
      if(trim){const beatStep=item.sourceSlice||item.children?Math.max(.001,step*baseline.beats/baseline.width):16;beats=Math.min(2496,Math.max(beatStep,Math.round((baseline.beats+dx/(baseline.width/baseline.beats))/beatStep)*beatStep));next.width=Math.max(step,Math.round(beats*baseline.width/baseline.beats/step)*step);}
      else{
        next.height=window.musicGrid.nearestHeight(baseline.height+dy);next.y=Math.floor(next.y/window.musicGrid.rowStep(next.height))*window.musicGrid.rowStep(next.height);
        // Along the time axis only the 4/4-friendly scales are allowed.
        next.width=window.musicGrid.scaledLength(baseline.beats,baseline.width+dx,rowStep,rowStep)??baseline.width;
      }
      const fixed=options.positions().filter(p=>!p.deleted);if(fixed.some(other=>intersects(next,other))||next.x+next.width>window.musicBoard.width||next.y+next.height>window.musicBoard.height)return;
      if(next.width===item.width&&next.height===item.height&&beats===item.beats)return;
      // Blocks in the way move along: those after the end slide later, those beside it slide across. They return if it shrinks back.
      baseline.origins=baseline.origins||new Map(items.filter(other=>other!==item&&other.id!==editing).map(other=>[other,{x:other.x,y:other.y}]));
      const settled=[next,...fixed],end=item.x+baseline.width;
      items.filter(other=>baseline.origins.has(other)).map(other=>({other,rect:{...rectangle(other),...baseline.origins.get(other)}})).sort((a,b)=>a.rect.x-b.rect.x||a.rect.y-b.rect.y).forEach(({other,rect})=>{
        const along=rect.x>=end?'x':'y';
        for(let hit;(hit=settled.find(p=>intersects(rect,p)));)rect[along]=along==='x'?hit.x+hit.width:hit.y+hit.height;
        settled.push(rect);if(other.x!==rect.x||other.y!==rect.y){other.x=rect.x;other.y=rect.y;paint(other);}
      });
      const running=item.running,beat=running?phase(item):item.beat,resumeAt=running?Math.max(options.audio().ctx.currentTime,item.startedAt):0;if(running)halt(item);
      item.width=next.width;item.height=next.height;item.y=next.y;
      if(trim){item.beats=beats;item.durationEdited=true;loopBuffer(item);}
      item.beat=beat%item.beats;if(running)source(item,resumeAt);
      paint(item);options.resized();
    };
    item.setLength=length=>resizeTo({width:item.width,height:item.height,beats:item.beats},length-item.width,0,false);
    [item.trim,item.resize].forEach(button=>{
      button.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();options.begin();sizing={id:event.pointerId,x:event.clientX,y:event.clientY,width:item.width,height:item.height,beats:item.beats,durationEdited:item.durationEdited,trim:button===item.trim};button.setPointerCapture(event.pointerId);});
      button.addEventListener('pointermove',event=>{if(!sizing||event.pointerId!==sizing.id)return;event.preventDefault();event.stopPropagation();resizeTo(sizing,event.clientX-sizing.x,event.clientY-sizing.y,sizing.trim);});
      const finish=cancel=>{if(!sizing)return;if(cancel){const running=item.running,beat=running?phase(item):item.beat,at=running?Math.max(options.audio().ctx.currentTime,item.startedAt):0;if(running)halt(item);item.width=sizing.width;item.height=sizing.height;item.beats=sizing.beats;item.durationEdited=sizing.durationEdited;sizing.origins?.forEach((origin,other)=>{other.x=origin.x;other.y=origin.y;paint(other);});loopBuffer(item);item.beat=beat%item.beats;if(running)source(item,at);paint(item);options.resized();}const id=sizing.id;sizing=null;if(button.hasPointerCapture(id))button.releasePointerCapture(id);persist();options.end();};
      button.addEventListener('pointerup',()=>finish(false));button.addEventListener('pointercancel',()=>finish(true));
      button.addEventListener('keydown',event=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();options.begin();resizeTo({width:item.width,height:item.height,beats:item.beats},delta[0]*(button===item.trim&&!(item.sourceSlice||item.children)?16*item.width/item.beats:step),delta[1]*rowStep,button===item.trim);persist();options.end();});
    });
    let drag=null;
    element.addEventListener('pointerdown',event=>{if(event.altKey)return;if(event.button!==0||!event.isPrimary||event.target.closest('button'))return;event.preventDefault();event.stopPropagation();element.focus({preventScroll:true});if(event.shiftKey){if(selectedParts.has(item.id))selectedParts.delete(item.id);else selectedParts.add(item.id);selected=selectedParts.has(item.id)?item.id:null;items.forEach(paint);if(!selectedParts.has(item.id))return;}else if(!selectedParts.has(item.id)){selectedParts.clear();selectedParts.add(item.id);}selected=item.id;options.begin();drag={id:event.pointerId,x:item.x,y:item.y,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,origins:items.filter(other=>selectedParts.has(other.id)).map(other=>({id:other.id,x:other.x,y:other.y}))};element.setPointerCapture(event.pointerId);paint(item);});
    element.addEventListener('pointermove',event=>{if(!drag)return;const board=window.musicBoard,x=Math.min(Math.max(0,Math.round((drag.x+event.clientX+window.scrollX-drag.startX)/step)*step),Math.max(0,Math.floor((board.width-item.width)/step)*step)),rows=window.musicGrid.rowStep(item.height),y=Math.min(Math.max(0,Math.round((drag.y+event.clientY+window.scrollY-drag.startY)/rows)*rows),Math.max(0,Math.floor((board.height-height(item))/rows)*rows));if(selectedParts.has(item.id)&&selectedParts.size>1){moveParts(x-item.x,y-item.y);}else if(free(item,x,y)){moveItem(item,x,y);}});
    const finish=()=>{if(!drag)return;const id=drag.id;drag=null;if(element.hasPointerCapture(id))element.releasePointerCapture(id);persist();options.end();};element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',()=>{if(drag){if(drag.origins.length>1)drag.origins.forEach(origin=>{const target=items.find(other=>other.id===origin.id);if(target)moveItem(target,origin.x,origin.y);});else moveItem(item,drag.x,drag.y);}finish();});
    element.addEventListener('keydown',event=>{if(event.target.closest('button'))return;const rows=window.musicGrid.rowStep(item.height),delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-rows],ArrowDown:[0,rows]}[event.key];if(delta){event.preventDefault();event.stopPropagation();const x=Math.max(0,item.x+delta[0]),y=Math.max(0,item.y+delta[1]);if(selectedParts.has(item.id)&&selectedParts.size>1){options.begin();moveParts(x-item.x,y-item.y);persist();options.end();}else if(free(item,x,y)){options.begin();moveItem(item,x,y);persist();options.end();}}if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();if(selectedParts.has(item.id)){options.begin();Array.from(selectedParts).forEach(remove);selectedParts.clear();options.end();}else remove(item.id);}if(event.key==='Enter'){event.preventDefault();open(item.id);}});
    element.addEventListener('dblclick',event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();open(item.id);});
    element.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();showMenu(event,item.id);});
    controls.addEventListener('pointerdown',event=>event.stopPropagation());end.addEventListener('pointerdown',event=>event.stopPropagation());options.canvas.appendChild(element);items.push(item);paint(item);if(!item.opened)Promise.resolve().then(()=>prepare(item)).catch(options.error);return item;
  }
  function compact(){
    menu.hidden=true;
    const data=options.capture();delete data.state.blocks;const tracks=data.state.positions.filter(p=>!p.deleted);if(!tracks.length){options.error(new Error('Add or open an arrangement first.'));return;}
    const name='';
    let item=items.find(p=>p.id===editing);const regionStarts=data.state.regions.map(r=>r.start),regionEnds=data.state.regions.map(r=>r.end);
    const x=Math.floor(Math.min(...tracks.map(p=>p.x),...regionStarts)/step)*step,y=Math.floor(Math.min(...tracks.map(p=>p.y))/rowStep)*rowStep,width=Math.max(step,Math.ceil((Math.max(...tracks.map(p=>p.x+p.width),...regionEnds)-x)/step)*step);
    options.begin();options.clear();
    if(item){halt(item,true);item.data=data;item.name=name.trim().slice(0,120);item.opened=false;item.durationEdited=false;item.buffer=null;item.sourceBuffer=null;item.waveSignature=null;item.width=width;}else item=create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:name.trim().slice(0,120),data,x,y,width,height:80,beats:Math.max(16,Math.ceil(width/40/16)*16),muted:false,solo:false,opened:false});
    while(!free(item,item.x,item.y))item.y+=window.musicGrid.rowStep(item.height);
    editing=null;paint(item);persist();options.end();void prepare(item).catch(options.error);
  }
  function pieces(record,area,removeMiddle=false){
    const start=record.x,length=record.width,end=start+length;
    const from=Math.max(start,area.x),to=Math.min(end,area.x+area.width);if(to<=from)return [];
    const cuts=[start,from,to,end].filter((value,i,all)=>i===0||value!==all[i-1]),result=[];
    for(let i=0;i<cuts.length-1;i++){
      const a=cuts[i],b=cuts[i+1],middle=a>=from&&b<=to;if(removeMiddle&&middle)continue;
      const data=clone(record.data),slice=record.sourceSlice||{},beats=(b-a)/length*record.beats;
      result.push({...record,id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),data,opened:false,active:false,durationEdited:false,x:a,width:b-a,beats,sourceSlice:record.sourceSlice&&record.beats<=record.sourceSlice.beats?{...clone(record.sourceSlice),offset:(record.sourceSlice.offset||0)+(a-start)/length*record.beats,beats}:{...(record.sourceSlice?{parent:clone(record.sourceSlice)}:{}),offset:(a-start)/length*record.beats,beats},middle});
    }return result;
  }
  function splitRange(area,nativeRecords=[],removeMiddle=false){
    const originals=items.filter(item=>item.id!==editing&&intersects(rectangle(item),area));
    const records=[...nativeRecords,...originals.map(item=>snapshot().find(record=>record.id===item.id))],created=[];
    originals.forEach(item=>{halt(item,true);item.gain?.disconnect();item.fx?.disconnect();item.element.remove();items=items.filter(other=>other!==item);});
    if(nativeRecords.length&&editing){const frame=items.find(item=>item.id===editing);frame?.gain?.disconnect();frame?.fx?.disconnect();frame?.element.remove();items=items.filter(item=>item.id!==editing);editing=null;}
    records.forEach(record=>pieces(record,area,removeMiddle).forEach(part=>{const middle=part.middle;delete part.middle;const item=create(part);if(middle){selected=item.id;created.push(item.id);}}));
    selectedParts=new Set(created);items.forEach(paint);persist();items.find(item=>item.id===created.at(-1))?.element.focus();return created;
  }
  // Compact every clip the area touches into one clip that keeps them inside, so it can be expanded again.
  const newId=()=>'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  function group(area,nativeRecords=[],ids=null){
    const originals=items.filter(item=>item.id!==editing&&(ids?ids.has(item.id):intersects(rectangle(item),area))),all=snapshot();
    const children=[...nativeRecords.map(clone),...originals.map(item=>clone(all.find(record=>record.id===item.id)))];if(children.length<2)return null;
    originals.forEach(item=>{halt(item,true);item.gain?.disconnect();item.fx?.disconnect();item.element.remove();items=items.filter(other=>other!==item);});
    if(nativeRecords.length&&editing){const frame=items.find(item=>item.id===editing);frame?.gain?.disconnect();frame?.fx?.disconnect();frame?.element.remove();items=items.filter(item=>item.id!==editing);editing=null;}
    const x=Math.min(...children.map(child=>child.x)),y=Math.min(...children.map(child=>child.y)),right=Math.max(...children.map(child=>child.x+child.width));
    children.forEach(child=>{child.id=newId();child.x-=x;child.y-=y;child.opened=false;child.active=false;});
    const data=options.capture();delete data.state.blocks;data.state.regions=[];data.state.positions.forEach(p=>p.deleted=true);data.state.muted.fill(false);data.state.solo.fill(false);
    const width=Math.max(step,Math.ceil((right-x)/step)*step),name=Array.from(new Set(children.map(child=>child.name).filter(Boolean))).join(' + ').slice(0,120),item=create({id:newId(),name,data,x,y,width,height:80,beats:width/40,muted:false,solo:false,opened:false,children});
    while(!free(item,item.x,item.y))item.y+=window.musicGrid.rowStep(item.height);
    selectedParts.clear();selected=item.id;items.forEach(paint);persist();item.element.focus({preventScroll:true});return item.id;
  }
  // Opening a clip keeps the row order: everything below it moves down by the extra height it needs.
  function makeRoom(bottom,extra,tracks){
    if(extra<=0)return;extra=Math.ceil(extra/80)*80;
    items.forEach(other=>{if(other.id!==editing&&other.y>=bottom)other.y+=extra;});
    if(tracks)options.shiftTracks?.(bottom,extra);
  }
  // Copy takes only the part of each clip inside the selection; the clips themselves are left as they are.
  function copyRange(area,nativeRecords=[]){
    const all=snapshot(),records=[...nativeRecords,...items.filter(item=>item.id!==editing&&!item.opened&&intersects(rectangle(item),area)).map(item=>all.find(record=>record.id===item.id))];
    const parts=records.flatMap(record=>pieces(clone(record),area).filter(part=>part.middle));if(!parts.length)return [];
    const x=Math.min(...parts.map(part=>part.x)),y=Math.min(...parts.map(part=>part.y));
    return parts.map(part=>{delete part.middle;return {...part,x:part.x-x,y:part.y-y};});
  }
  function copySelected(){
    const chosen=snapshot().filter(record=>selectedParts.has(record.id)||record.id===selected&&!selectedParts.size&&items.some(item=>item.id===selected&&!item.opened));if(!chosen.length)return [];
    const x=Math.min(...chosen.map(record=>record.x)),y=Math.min(...chosen.map(record=>record.y));return chosen.map(record=>({...clone(record),x:record.x-x,y:record.y-y}));
  }
  // Paste keeps the copied clips' layout; if the spot is taken they land on the next free rows below it.
  function paste(parts,x,y){
    if(!parts.length)return;options.begin();{const rows=Math.max(...parts.map(part=>window.musicGrid.rowStep(part.height)));y=Math.floor(y/rows)*rows;}
    const created=parts.map(part=>create({...clone(part),id:newId(),x:x+part.x,y:y+part.y,opened:false,active:false}));
    for(let guard=0;guard<2000&&created.some(item=>!free(item,item.x,item.y));guard++)created.forEach(item=>item.y+=80);
    selectedParts=new Set(created.map(item=>item.id));selected=created[0].id;items.forEach(paint);persist();options.end();
  }
  // Selected clips (for instance the ones an expanded clip just opened into) can be compacted again in one step.
  function groupSelected(){if(selectedParts.size<2)return;options.begin();group(null,[],new Set(selectedParts));options.end();}
  const partsControl=document.createElement('button');partsControl.className='marquee-cut';partsControl.title='Compact selected clips into one (Command-G)';partsControl.setAttribute('aria-label',partsControl.title);partsControl.hidden=true;partsControl.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="'+compactIcon+'"/></svg>';options.canvas.appendChild(partsControl);
  partsControl.addEventListener('pointerdown',event=>event.stopPropagation());partsControl.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});partsControl.addEventListener('click',event=>{event.stopPropagation();groupSelected();});
  function ungroup(item){
    // If the clip was looping, the music carries on: a loop region takes over the same span at the same point.
    const carry=item.running?phase(item)%item.beats:null;
    options.begin();halt(item,true);item.gain?.disconnect();item.fx?.disconnect();item.element.remove();items=items.filter(other=>other!==item);
    const bottom=item.y+item.height,extra=Math.ceil((Math.max(...item.children.map(child=>child.y+child.height))-item.height)/rowStep)*rowStep;
    const taken=[...items.filter(other=>other.id!==editing).map(rectangle),...options.positions().filter(p=>!p.deleted)];
    if(item.children.some(child=>taken.some(other=>intersects({x:item.x+child.x,y:item.y+child.y,width:child.width,height:child.height},other))))makeRoom(bottom,extra,true);
    const created=item.children.map(child=>create({...clone(child),id:newId(),x:item.x+child.x,y:item.y+child.y}));
    // If the clips no longer fit where the compact clip sits, they open on the next free rows below.
    const blocked=()=>created.some(child=>!free(child,child.x,child.y)||created.some(other=>other!==child&&items.indexOf(other)<items.indexOf(child)&&intersects(rectangle(child),rectangle(other))));
    for(let guard=0;guard<2000&&blocked();guard++)created.forEach(child=>child.y+=80);
    selectedParts=new Set(created.map(child=>child.id));items.forEach(paint);gains();persist();options.end();
    if(carry!==null)options.continueAsRegion?.(item.x,item.y,item.x+item.width,carry);
  }
  // A marquee selects every clip it covers along its whole length, so they can be dragged or nudged together.
  function selectArea(area){selectedParts=new Set(area?items.filter(item=>item.id!==editing&&intersects(rectangle(item),area)&&area.x<=item.x&&area.x+area.width>=item.x+item.width).map(item=>item.id):[]);items.forEach(paint);}
  function shift(dx,dy){items.forEach(item=>{item.x=Math.max(0,item.x+dx);item.y=Math.max(0,item.y+dy);paint(item);});persist(false);}
  function moveParts(dx,dy){
    const members=items.filter(item=>selectedParts.has(item.id));if(!members.length)return;
    const board=window.musicBoard;dx=Math.min(Math.max(dx,-Math.min(...members.map(item=>item.x))),board.width-Math.max(...members.map(item=>item.x+item.width)));dy=Math.min(Math.max(dy,-Math.min(...members.map(item=>item.y))),board.height-Math.max(...members.map(item=>item.y+height(item))));
    const occupied=options.positions().filter(p=>!p.deleted).concat(items.filter(item=>!selectedParts.has(item.id)&&item.id!==editing).map(rectangle));
    if(members.some(item=>occupied.some(other=>intersects({...rectangle(item),x:item.x+dx,y:item.y+dy},other))))return;
    members.forEach(item=>moveItem(item,item.x+dx,item.y+dy));
  }
  // Carries the pieces a cut just selected; offsets are measured from where the drag began.
  function dragParts(){const anchor=items.find(item=>selectedParts.has(item.id));if(!anchor)return null;const x=anchor.x,y=anchor.y;options.begin();return {move(dx,dy){moveParts(Math.round(dx/step)*step-(anchor.x-x),Math.round(dy/rowStep)*rowStep-(anchor.y-y));},end(){persist();options.end();}};}
  function add(record){options.begin();const item=create(record);while(!free(item,item.x,item.y))item.y+=window.musicGrid.rowStep(item.height);paint(item);persist();options.end();return item.id;}
  function moveItem(item,x,y){const dx=x-item.x,dy=y-item.y;item.x=x;item.y=y;if(item.id===editing){options.moveActive(dx,dy);item.data=options.capture();delete item.data.state.blocks;}paint(item);}
  function collapse(id){const item=items.find(p=>p.id===id);if(!item)return;if(item.id===editing){compact();return;}options.begin();halt(item,true);item.opened=false;paint(item);persist();options.end();void prepare(item).catch(options.error);}
  function open(id){
    const item=items.find(p=>p.id===id);if(!item||item.sourceSlice&&!item.children||editing===id)return;if(item.children){ungroup(item);return;}options.begin();
    if(!editing&&options.positions().some(p=>!p.deleted)){
      const data=options.capture(),area=metrics(data);delete data.state.blocks;create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:'',data,x:area.x,y:area.y,width:Math.max(step,Math.ceil((area.right-area.x)/step)*step),height:80,beats:Math.max(16,Math.ceil((area.right-area.x)/40/16)*16),muted:false,solo:false,opened:true});
    }
    freezeEditing();halt(item,true);const closedBottom=item.y+item.height;item.opened=true;
    if(items.some(other=>other!==item&&intersects(rectangle(item),rectangle(other)))){const extra=height(item)-item.height;items.forEach(other=>{if(other!==item&&other.y>=closedBottom)other.y+=extra;});}
    const occupied=items.filter(other=>other!==item).map(rectangle);while(occupied.some(other=>intersects(rectangle(item),other)))item.y+=window.musicGrid.rowStep(item.height);
    editing=id;const data=clone(item.data),area=metrics(data),dx=item.x-area.x,dy=item.y-area.y;
    data.state.positions.forEach(p=>{p.x=Math.max(0,p.x+dx);p.y=Math.max(0,p.y+dy);});data.state.regions.forEach(r=>{const length=r.end-r.start;r.start=Math.max(0,r.start+dx);r.end=r.start+length;r.cross=Math.max(0,r.cross+dy);});
    item.data=clone(data);transitioning=true;try{options.restore(data);}finally{transitioning=false;}items.forEach(paint);persist();options.end();
  }
  function duplicate(id){const original=items.find(p=>p.id===id);if(!original)return;const record=clone(snapshot().find(p=>p.id===id));record.id='block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);if(record.name)record.name+=' copy';record.opened=false;record.x+=record.width;const item=create(record);while(!free(item,item.x,item.y))item.y+=window.musicGrid.rowStep(item.height);paint(item);persist();options.record();}
  function remove(id){const item=items.find(p=>p.id===id);if(!item)return;halt(item,true);item.gain?.disconnect();item.fx?.disconnect();item.element.remove();items=items.filter(p=>p!==item);if(editing===id)editing=null;gains();persist();options.record();}
  function showMenu(event,id=null){menuTarget=id;menuPoint={x:event.clientX+window.scrollX,y:event.clientY+window.scrollY};buttons.split.hidden=id===null;buttons.compact.hidden=id!==null||!options.positions().some(p=>!p.deleted);buttons.duplicate.hidden=buttons.delete.hidden=colorCycle.hidden=id===null;{const item=items.find(item=>item.id===id);sizeCycle.hidden=clipBpm.row.hidden=!item||item.opened;if(item)clipBpm.show(item.speed||1);if(item)options.showSize(sizeCycle,item.beats,item.width);}options.showCycle(colorCycle,items.find(item=>item.id===id)?.color);buttons.open.hidden=id===null||!!items.find(item=>item.id===id)?.sourceSlice;menu.style.left=Math.floor((event.clientX+window.scrollX)/rowStep)*rowStep+'px';menu.style.top=Math.floor((event.clientY+window.scrollY)/rowStep)*rowStep+'px';menu.hidden=false;}
  document.addEventListener('contextmenu',event=>{if(event.defaultPrevented||event.target.closest('.music-header,.transport,.context-menu,.track-surface,.arrangement-block,input,select,textarea'))return;event.preventDefault();showMenu(event);});
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.hidden=true;if((selectedParts.size||selected)&&!event.shiftKey&&!event.target.closest?.('.arrangement-block,.marquee-cut')){selectedParts.clear();selected=null;items.forEach(paint);}});
  function restore(records){stop();items.forEach(item=>{item.gain?.disconnect();item.fx?.disconnect();item.element.remove();});items=[];editing=null;selectedParts.clear();records.forEach(record=>{const item=create(record);if(record.active)editing=item.id;});if(!records.some(r=>r.active!==undefined))editing=items.find(p=>p.opened)?.id||null;persist(false);}
  function tick(){
    const active=items.find(item=>item.id===editing);if(active&&!transitioning&&!options.applying()&&options.positions().some(p=>!p.deleted)){active.data=options.capture();delete active.data.state.blocks;const area=metrics(active.data);active.x=area.x;active.y=area.y;active.width=Math.max(step,Math.ceil((area.right-area.x)/step)*step);}
    items.forEach(paint);
    const chosen=items.filter(item=>selectedParts.has(item.id));partsControl.hidden=chosen.length<2||options.hasRange();
    if(!partsControl.hidden)Object.assign(partsControl.style,{left:(Math.max(...chosen.map(item=>item.x+item.width))-20)+'px',top:Math.min(...chosen.map(item=>item.y))+'px'});
    const tracks=options.positions().filter(p=>!p.deleted);compactControl.hidden=!tracks.length;if(!tracks.length)return;
    const regions=options.regions(),right=Math.max(...tracks.map(p=>p.x+p.width),...regions.map(r=>r.end)),top=Math.min(...tracks.map(p=>p.y));Object.assign(compactControl.style,{left:(right-20)+'px',top:top+'px'});
  }
  try{const saved=JSON.parse(localStorage.getItem(key));if(Array.isArray(saved)&&saved.length<=256){
    // A clip saved as vertical is laid on its side by the validator; it then needs a free spot.
    const turned=saved.map(record=>record?.vertical===true);
    if(saved.every(options.valid)){saved.forEach(record=>{const item=create(record);if(record.active)editing=item.id;});
      items.forEach((item,i)=>{if(!turned[i])return;item.x=Math.max(0,Math.min(item.x,Math.floor((window.musicBoard.width-item.width)/step)*step));while(!free(item,item.x,item.y))item.y+=window.musicGrid.rowStep(item.height);paint(item);});
      if(turned.includes(true))try{localStorage.setItem(key,JSON.stringify(snapshot(false)));}catch{}
      if(!saved.some(r=>r.active!==undefined))editing=items.find(p=>p.opened)?.id||null;}}}catch{}
  // Keyboard selection: the clips on the board, which are chosen, and moving or removing them.
  const listable=()=>items.filter(item=>item.id!==editing);
  function list(){return listable().map(item=>({...rectangle(item),id:item.id,element:item.element}));}
  function selection(){return listable().filter(item=>selectedParts.has(item.id)||item.id===selected).map(item=>item.id);}
  function setSelection(ids){selectedParts=new Set(ids);selected=ids.length?ids[ids.length-1]:null;items.forEach(paint);}
  // The caller wraps this in its own edit, so a mixed selection of tracks and clips undoes in one step.
  function removeSelected(){selection().forEach(remove);selectedParts.clear();selected=null;}
  function nudge(sx,sy){
    const ids=selection();if(!ids.length)return;ids.forEach(id=>selectedParts.add(id));
    const rows=Math.max(...items.filter(item=>selectedParts.has(item.id)).map(item=>window.musicGrid.rowStep(item.height)));
    options.begin();moveParts(sx*step,sy*rows);persist();options.end();
  }
  return {list,selection,setSelection,removeSelected,nudge,splitRange,dragParts,add,shift,group,groupSelected,selectArea,copyRange,copySelected,paste,mixRecord:record=>options.mix(clone(record.data),record.sourceSlice,record.pitch||0,record.children),remix,compactControl,compact,open,collapse,duplicate,remove,snapshot,restore,tick,bounds,positions:()=>items.map(item=>({...rectangle(item),deleted:item.id===editing})),buffers:()=>items.map(item=>item.buffer),audible:index=>items[index]?audible(items[index]):false,activeAudible:()=>!items.find(p=>p.id===editing)?.muted,activeSolo:()=>!!items.find(p=>p.id===editing)?.solo,hasSolo:()=>items.some(p=>p.solo),hasPlayback:()=>items.some(p=>p.running||p.loading),hasRunning:()=>items.some(p=>p.running),looping:index=>!!items[index]&&(items[index].running||items[index].loading),haltIndex(index){const item=items[index];if(item&&(item.running||item.loading))halt(item,true);},startAll:()=>items.filter(p=>p.id!==editing).forEach(item=>void play(item)),pauseAll:()=>items.forEach(pause),stop,prepareAll:()=>Promise.all(items.filter(p=>p.id!==editing).map(prepare)),setTempo(change){const running=items.filter(p=>p.running);running.forEach(pause);change();running.forEach(item=>source(item,options.audio().ctx.currentTime));},menu,buttons};
};
