'use strict';
window.createMusicBlocks=function(options){
  const key='music-arrangement-blocks-v1',step=80,rowStep=20,clone=value=>JSON.parse(JSON.stringify(value));
  let items=[],editing=null,menuTarget=null,selected=null,transitioning=false;
  const menu=document.createElement('div');menu.className='context-menu arrangement-block-menu';menu.hidden=true;menu.setAttribute('role','menu');options.canvas.appendChild(menu);
  const compactControl=document.createElement('button');compactControl.className='arrangement-compact';compactControl.title='Compact arrangement';compactControl.setAttribute('aria-label','Compact arrangement');compactControl.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h4v4M14 14h-4v-4M6 6 2 2M10 10l4 4"/></svg>';compactControl.addEventListener('pointerdown',event=>event.stopPropagation());compactControl.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});compactControl.addEventListener('click',event=>{event.stopPropagation();compact();});options.canvas.appendChild(compactControl);
  const buttons={};
  for(const [action,label] of [['compact','Compact arrangement'],['open','Expand arrangement'],['duplicate','Duplicate block'],['new','New arrangement'],['delete','Delete block']]){
    const button=document.createElement('button');button.textContent=label;button.setAttribute('role','menuitem');menu.appendChild(button);buttons[action]=button;
    button.addEventListener('click',()=>{menu.hidden=true;if(action==='compact')compact();if(action==='open')open(menuTarget);if(action==='duplicate')duplicate(menuTarget);if(action==='new'){options.begin();if(editing)freezeEditing();else if(options.positions().some(p=>!p.deleted)){const data=options.capture(),area=metrics(data);delete data.state.blocks;create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:'',data,x:area.x,y:area.y,width:Math.max(step,Math.ceil((area.right-area.x)/step)*step),height:80,beats:Math.max(16,Math.ceil((area.right-area.x)/40/16)*16),muted:false,solo:false,opened:true});}options.newArrangement();persist();options.end();}if(action==='delete')remove(menuTarget);});
  }
  function metrics(data){const tracks=data.state.positions.filter(p=>!p.deleted);if(!tracks.length)return {x:0,y:0,right:80,bottom:80};const regions=data.state.regions.filter(r=>r.direction==='right');return {x:Math.floor(Math.min(...tracks.map(p=>p.x),...regions.map(r=>r.start))/step)*step,y:Math.floor(Math.min(...tracks.map(p=>p.y))/rowStep)*rowStep,right:Math.max(...tracks.map(p=>p.x+p.width),...regions.map(r=>r.end)),bottom:Math.max(...tracks.map(p=>p.y+p.height))};}
  function height(item){if(!item.opened)return item.height;const area=metrics(item.data);return Math.max(80,area.bottom-area.y);}
  function rectangle(item){return {x:item.x,y:item.y,width:item.width,height:height(item),beats:item.beats,vertical:false,deleted:false};}
  function snapshot(captureRoot=true){return items.map(item=>{const {id,name,x,y,width,height,beats,muted,solo,opened}=item;const data=item.id===editing&&captureRoot&&!transitioning&&!options.applying()?options.capture():clone(item.data);delete data.state.blocks;return {id,name,data,x,y,width,height,beats,muted,solo,opened,active:item.id===editing};});}
  function freezeEditing(){const item=items.find(item=>item.id===editing);if(item){item.data=options.capture();delete item.data.state.blocks;item.buffer=null;item.previewSignature=null;}editing=null;}

  function persist(captureRoot=true){try{localStorage.setItem(key,JSON.stringify(snapshot(captureRoot)));}catch{}options.changed();}
  function bounds(){return items.filter(item=>item.id!==editing).map(rectangle);}
  const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  function free(item,x,y){const next={...rectangle(item),x,y};return ![...(item.id===editing?[]:options.positions().filter(p=>!p.deleted)),...items.filter(other=>other!==item&&other.id!==editing).map(rectangle)].some(other=>intersects(next,other));}
  function phase(item){return item.running?item.beat+Math.max(0,options.audio().ctx.currentTime-item.startedAt)*options.audio().tempo/60:item.beat;}
  function audible(item){return item.id!==editing&&!item.muted&&(!options.trackSolo()&&!items.some(p=>p.solo)||item.solo);}
  function gains(){items.forEach(item=>{if(item.gain)item.gain.gain.setTargetAtTime(audible(item)?1:0,options.audio().ctx.currentTime,.012);paint(item);});options.changed();}
  function halt(item,reset=false){item.epoch++;item.running=false;item.loading=false;if(item.source){try{item.source.stop();}catch{}item.source=null;}if(reset)item.beat=0;paint(item);}
  function pause(item){item.beat=phase(item);halt(item);}
  function stop(){items.forEach(item=>halt(item,true));}
  function paint(item){
    item.element.hidden=false;item.element.classList.toggle('expanded-arrangement',item.opened);item.element.classList.toggle('editing-arrangement',item.id===editing);item.preview.hidden=!item.opened||item.id===editing;item.wave.hidden=item.opened;item.moveGrip.hidden=!item.opened;item.expand.hidden=item.id===editing;item.expand.title=item.opened?'Compact arrangement':'Expand arrangement';Object.assign(item.element.style,{left:item.x+'px',top:item.y+'px',width:item.width+'px',height:height(item)+'px'});
    const active=item.id===editing?options.activePlayback():item.running||item.loading||options.globalActive(items.indexOf(item));item.element.classList.toggle('playing',active&&audible(item));item.label.hidden=true;item.play.textContent=active?'■':'▶';item.play.title=active?'Stop clip and reset':'Play clip loop';item.play.setAttribute('aria-label',item.play.title);item.play.setAttribute('aria-pressed',String(active));item.loop.hidden=!(item.running||options.globalLoop?.(items.indexOf(item)));item.mute.classList.toggle('muted',item.muted);item.soloButton.classList.toggle('soloed',item.solo);item.mute.setAttribute('aria-pressed',String(item.muted));item.soloButton.setAttribute('aria-pressed',String(item.solo));
    item.cursor.hidden=!item.running||!audible(item);item.cursor.style.left=Math.floor(phase(item)%item.beats/item.beats*item.width)+'px';item.element.classList.toggle('selected',selected===item.id);
    if(item.opened){const signature=JSON.stringify(item.data)+':'+item.width;if(item.previewSignature!==signature){item.previewSignature=signature;item.preview.innerHTML=options.preview(item.data,metrics(item.data));}return;}
    const signature=item.width+':'+(item.buffer?'ready':'pending');if(item.waveSignature===signature)return;
    const samples=item.buffer?.getChannelData(0),peaks=Array.from({length:Math.max(1,Math.floor(item.width/3))},(_,i)=>{
      if(!samples)return .01;
      const start=Math.floor(i*samples.length/Math.max(1,Math.floor(item.width/3))),end=Math.floor((i+1)*samples.length/Math.max(1,Math.floor(item.width/3)));let peak=0;for(let j=start;j<end;j+=Math.max(1,Math.floor((end-start)/24)))peak=Math.max(peak,Math.abs(samples[j]));return peak;
    });
    if(item.waveSignature!==signature){item.waveSignature=signature;const max=Math.max(...peaks,.01);item.wave.innerHTML=peaks.map((p,i)=>`<rect x="${i*3}" y="${40-p/max*23}" width="1" height="${Math.max(1,p/max*46)}"/>`).join('');item.wave.setAttribute('viewBox',`0 0 ${item.width} 80`);}
  }
  async function prepare(item){
    if(item.buffer)return item.buffer;const data=clone(item.data),version=JSON.stringify(data);
    if(item.preparing&&item.preparingVersion===version)return item.preparing;
    const pending=options.prepareAudio().then(()=>options.mix(data)).then(result=>{if(JSON.stringify(item.data)===version){item.buffer=result.buffer;item.beats=result.beats;paint(item);}return result.buffer;}).finally(()=>{if(item.preparing===pending)item.preparing=null;});
    item.preparingVersion=version;item.preparing=pending;return pending;
  }
  function source(item,at){const {ctx,master,tempo}=options.audio();if(!item.gain){item.gain=ctx.createGain();item.gain.connect(master);}item.gain.gain.value=audible(item)?1:0;const source=ctx.createBufferSource();source.buffer=item.buffer;source.loop=true;source.playbackRate.value=tempo/options.baseTempo;source.connect(item.gain);source.start(at,item.beat%item.beats*60/options.baseTempo);source.onended=()=>source.disconnect();item.source=source;item.startedAt=at;item.running=true;item.loading=false;}
  async function play(item){if(item.id===editing){options.toggleActive();return;}const token=++item.epoch;item.loading=true;paint(item);try{await prepare(item);if(token!==item.epoch||!items.includes(item))return;source(item,options.startTime());options.changed();}catch(error){options.error(error);item.loading=false;paint(item);}}
  function create(record){
    const item={...clone(record),epoch:0,beat:0,running:false,loading:false,buffer:null};
    const element=document.createElement('div');element.className='arrangement-block';element.tabIndex=0;element.setAttribute('aria-label','Arrangement block '+item.name);item.element=element;
    const wave=document.createElementNS?document.createElementNS('http://www.w3.org/2000/svg','svg'):document.createElement('svg');wave.classList.add('block-waveform');item.wave=wave;element.appendChild(wave);
    const preview=document.createElement('div');preview.className='expanded-arrangement-tracks';item.preview=preview;element.appendChild(preview);
    const controls=document.createElement('div');controls.className='block-controls';element.appendChild(controls);
    const control=(text,title,handler)=>{const button=document.createElement('button');button.textContent=text;button.title=title;button.setAttribute('aria-label',title);button.addEventListener('click',event=>{event.stopPropagation();handler();});controls.appendChild(button);return button;};
    item.play=control('▶','Play clip loop',()=>{if(item.id===editing){options.toggleActive();return;}if(item.running||item.loading||options.globalActive(items.indexOf(item))){options.stopGlobal(items.indexOf(item));halt(item,true);options.changed();}else void play(item);});
    const label=document.createElement('span');label.className='block-name';controls.appendChild(label);item.label=label;
    const end=document.createElement('div');end.className='block-end-controls';element.appendChild(end);item.loop=document.createElement('span');item.loop.textContent='↻';end.appendChild(item.loop);
    item.mute=control('M','Mute block',()=>{item.muted=!item.muted;gains();persist();options.record();});item.soloButton=control('S','Solo block',()=>{item.solo=!item.solo;gains();persist();options.record();});end.appendChild(item.mute);end.appendChild(item.soloButton);item.expand=control('','Expand arrangement',()=>item.opened?collapse(item.id):open(item.id));item.expand.className='block-expand';item.expand.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2H2v4M10 14h4v-4M2 2l4 4M14 14l-4-4"/></svg>';end.appendChild(item.expand);
    item.moveGrip=document.createElement('span');item.moveGrip.className='arrangement-move-grip';item.moveGrip.textContent='⠿';item.moveGrip.title='Move whole arrangement';item.moveGrip.setAttribute('aria-label','Move whole arrangement');item.moveGrip.tabIndex=0;element.appendChild(item.moveGrip);
    item.cursor=document.createElement('span');item.cursor.className='block-playhead';element.appendChild(item.cursor);
    let drag=null;
    element.addEventListener('pointerdown',event=>{if(event.button!==0||!event.isPrimary||event.target.closest('button'))return;event.preventDefault();event.stopPropagation();selected=item.id;options.begin();drag={id:event.pointerId,x:item.x,y:item.y,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY};element.setPointerCapture(event.pointerId);paint(item);});
    element.addEventListener('pointermove',event=>{if(!drag)return;const x=Math.max(0,Math.round((drag.x+event.clientX+window.scrollX-drag.startX)/step)*step),y=Math.max(0,Math.round((drag.y+event.clientY+window.scrollY-drag.startY)/rowStep)*rowStep);if(free(item,x,y)){moveItem(item,x,y);}});
    const finish=()=>{if(!drag)return;const id=drag.id;drag=null;if(element.hasPointerCapture(id))element.releasePointerCapture(id);persist();options.end();};element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',()=>{if(drag){moveItem(item,drag.x,drag.y);}finish();});
    element.addEventListener('keydown',event=>{if(event.target.closest('button'))return;const delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-rowStep],ArrowDown:[0,rowStep]}[event.key];if(delta){event.preventDefault();event.stopPropagation();const x=Math.max(0,item.x+delta[0]),y=Math.max(0,item.y+delta[1]);if(free(item,x,y)){options.begin();moveItem(item,x,y);persist();options.end();}}if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();event.stopPropagation();remove(item.id);}if(event.key==='Enter'){event.preventDefault();open(item.id);}});
    element.addEventListener('dblclick',event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();open(item.id);});
    element.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();showMenu(event,item.id);});
    controls.addEventListener('pointerdown',event=>event.stopPropagation());end.addEventListener('pointerdown',event=>event.stopPropagation());options.canvas.appendChild(element);items.push(item);paint(item);return item;
  }
  function compact(){
    menu.hidden=true;
    const data=options.capture();delete data.state.blocks;const tracks=data.state.positions.filter(p=>!p.deleted);if(!tracks.length){options.error(new Error('Add or open an arrangement first.'));return;}
    const name='';
    let item=items.find(p=>p.id===editing);const regionStarts=data.state.regions.filter(r=>r.direction==='right').map(r=>r.start),regionEnds=data.state.regions.filter(r=>r.direction==='right').map(r=>r.end);
    const x=Math.floor(Math.min(...tracks.map(p=>p.x),...regionStarts)/step)*step,y=Math.floor(Math.min(...tracks.map(p=>p.y))/rowStep)*rowStep,width=Math.max(step,Math.ceil((Math.max(...tracks.map(p=>p.x+p.width),...regionEnds)-x)/step)*step);
    options.begin();options.clear();
    if(item){halt(item,true);item.data=data;item.name=name.trim().slice(0,120);item.opened=false;item.buffer=null;item.waveSignature=null;item.width=width;}else item=create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:name.trim().slice(0,120),data,x,y,width,height:80,beats:Math.max(16,Math.ceil(width/40/16)*16),muted:false,solo:false,opened:false});
    while(!free(item,item.x,item.y))item.y+=rowStep;
    editing=null;paint(item);persist();options.end();void prepare(item).catch(options.error);
  }
  function moveItem(item,x,y){const dx=x-item.x,dy=y-item.y;item.x=x;item.y=y;if(item.id===editing){options.moveActive(dx,dy);item.data=options.capture();delete item.data.state.blocks;}paint(item);}
  function collapse(id){const item=items.find(p=>p.id===id);if(!item)return;if(item.id===editing){compact();return;}options.begin();halt(item,true);item.opened=false;paint(item);persist();options.end();}
  function open(id){
    const item=items.find(p=>p.id===id);if(!item||editing===id)return;options.begin();
    if(!editing&&options.positions().some(p=>!p.deleted)){
      const data=options.capture(),area=metrics(data);delete data.state.blocks;create({id:'block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:'',data,x:area.x,y:area.y,width:Math.max(step,Math.ceil((area.right-area.x)/step)*step),height:80,beats:Math.max(16,Math.ceil((area.right-area.x)/40/16)*16),muted:false,solo:false,opened:true});
    }
    freezeEditing();halt(item,true);item.opened=true;
    const occupied=items.filter(other=>other!==item).map(rectangle);while(occupied.some(other=>intersects(rectangle(item),other)))item.y+=rowStep;
    editing=id;const data=clone(item.data),area=metrics(data),dx=item.x-area.x,dy=item.y-area.y;
    data.state.positions.forEach(p=>{p.x=Math.max(0,p.x+dx);p.y=Math.max(0,p.y+dy);});data.state.regions.forEach(r=>{const length=r.end-r.start;r.start=Math.max(0,r.start+(r.direction==='down'?dy:dx));r.end=r.start+length;r.cross=Math.max(0,r.cross+(r.direction==='down'?dx:dy));});
    item.data=clone(data);transitioning=true;try{options.restore(data);}finally{transitioning=false;}items.forEach(paint);persist();options.end();
  }
  function duplicate(id){const original=items.find(p=>p.id===id);if(!original)return;const record=clone(snapshot().find(p=>p.id===id));record.id='block-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);if(record.name)record.name+=' copy';record.opened=false;record.x+=record.width;const item=create(record);while(!free(item,item.x,item.y))item.y+=rowStep;paint(item);persist();options.record();}
  function remove(id){const item=items.find(p=>p.id===id);if(!item)return;halt(item,true);item.gain?.disconnect();item.element.remove();items=items.filter(p=>p!==item);if(editing===id)editing=null;gains();persist();options.record();}
  function showMenu(event,id=null){menuTarget=id;buttons.compact.hidden=id!==null||!options.positions().some(p=>!p.deleted);buttons.open.hidden=buttons.duplicate.hidden=buttons.delete.hidden=id===null;menu.style.left=(event.clientX+window.scrollX)+'px';menu.style.top=(event.clientY+window.scrollY)+'px';menu.hidden=false;}
  document.addEventListener('contextmenu',event=>{if(event.defaultPrevented||event.target.closest('.transport,.context-menu,.track-surface,.arrangement-block,input,select,textarea'))return;event.preventDefault();showMenu(event);});
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.hidden=true;});
  function restore(records){stop();items.forEach(item=>{item.gain?.disconnect();item.element.remove();});items=[];editing=null;records.forEach(record=>{const item=create(record);if(record.active)editing=item.id;});if(!records.some(r=>r.active!==undefined))editing=items.find(p=>p.opened)?.id||null;persist(false);}
  function tick(){
    const active=items.find(item=>item.id===editing);if(active&&!transitioning&&!options.applying()&&options.positions().some(p=>!p.deleted)){active.data=options.capture();delete active.data.state.blocks;const area=metrics(active.data);active.x=area.x;active.y=area.y;active.width=Math.max(step,Math.ceil((area.right-area.x)/step)*step);}
    items.forEach(paint);const tracks=options.positions().filter(p=>!p.deleted);compactControl.hidden=!tracks.length;if(!tracks.length)return;
    const regions=options.regions(),right=Math.max(...tracks.map(p=>p.x+p.width),...regions.filter(r=>r.direction==='right').map(r=>r.end)),top=Math.min(...tracks.map(p=>p.y),...regions.filter(r=>r.direction==='down').map(r=>r.start));Object.assign(compactControl.style,{left:(right-20)+'px',top:top+'px'});
  }
  try{const saved=JSON.parse(localStorage.getItem(key));if(Array.isArray(saved)&&saved.length<=64&&saved.every(options.valid)){saved.forEach(record=>{const item=create(record);if(record.active)editing=item.id;});if(!saved.some(r=>r.active!==undefined))editing=items.find(p=>p.opened)?.id||null;}}catch{}
  return {compactControl,compact,open,collapse,duplicate,remove,snapshot,restore,tick,bounds,positions:()=>items.map(item=>({...rectangle(item),deleted:item.id===editing})),buffers:()=>items.map(item=>item.buffer),audible:index=>items[index]?audible(items[index]):false,activeAudible:()=>!items.find(p=>p.id===editing)?.muted,activeSolo:()=>!!items.find(p=>p.id===editing)?.solo,hasSolo:()=>items.some(p=>p.solo),hasPlayback:()=>items.some(p=>p.running||p.loading),startAll:()=>items.filter(p=>p.id!==editing).forEach(item=>void play(item)),pauseAll:()=>items.forEach(pause),stop,prepareAll:()=>Promise.all(items.filter(p=>p.id!==editing).map(prepare)),setTempo:()=>{items.filter(p=>p.running).forEach(item=>{const beat=phase(item);halt(item);item.beat=beat;source(item,options.audio().ctx.currentTime);});},menu,buttons};
};
