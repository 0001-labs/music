'use strict';
window.musicGrid={unit:20,placementStep:80};
window.createMusicLayout=function(rows,onOrientationChange,onCommit){
  const {unit,placementStep}=window.musicGrid,key='music-grid-layout-four-bar-v1',canvas=document.querySelector('#canvas');
  const snap=value=>Math.max(0,Math.round(value/unit)*unit);
  const snapPosition=value=>Math.max(0,Math.round(value/placementStep)*placementStep);
  const viewport=document.documentElement;
  const initialX=Math.max(placementStep,snapPosition((viewport.clientWidth-640)/2));
  const initialY=placementStep;
  const minimumSize=vertical=>vertical?{width:80,height:160}:{width:160,height:20};
  const sizeStep=(t,axis,vertical=positions[t].vertical)=>(vertical?axis==='height':axis==='width')?4*unit:unit;
  const sizeSnap=(t,axis,value,vertical=positions[t].vertical)=>Math.max(minimumSize(vertical)[axis],Math.round(value/sizeStep(t,axis,vertical))*sizeStep(t,axis,vertical));
  let positions=rows.map((row,t)=>({x:initialX,y:initialY+t*placementStep,width:row.classList.contains('vertical-track')?80:640,height:row.classList.contains('vertical-track')?640:row.offsetHeight,vertical:row.classList.contains('vertical-track'),deleted:false,beats:16}));
  const defaultPositions=positions.map(p=>({...p}));
  let migrated=false;
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved)&&saved.length>0&&saved.length<=rows.length&&saved.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000))positions=positions.map((initial,t)=>{
      const p=saved[t];if(!p){migrated=true;return initial;}
      const vertical=typeof p.vertical==='boolean'?p.vertical:positions[t].vertical;
      const hasBeats=Number.isFinite(p.beats)&&p.beats>=2&&p.beats<=2500;
      const dimension=(axis,value)=>Number.isFinite(value)&&value<=100000?(hasBeats?Math.max(minimumSize(vertical)[axis],snap(value)):sizeSnap(t,axis,value,vertical)):positions[t][axis];
      let width=dimension('width',p.width),height=dimension('height',p.height);
      const oldBeats=hasBeats?p.beats:(vertical?height:width)/40,beats=Math.max(16,Math.round(oldBeats/16)*16);
      if(beats!==oldBeats){
        const length=Math.max(minimumSize(vertical)[vertical?'height':'width'],Math.round((vertical?height:width)*beats/oldBeats/placementStep)*placementStep);
        if(vertical)height=length;else width=length;migrated=true;
      }
      const x=snapPosition(p.x),y=snapPosition(p.y);
      if(x!==p.x||y!==p.y)migrated=true;
      return {x,y,vertical,width,height,deleted:p.deleted===true,beats};
    });
    if(migrated&&Array.isArray(saved)&&saved.length>0&&saved.length<rows.length)positions.slice(saved.length).forEach((p,t)=>{p.y=Math.ceil(Math.max(...positions.slice(0,saved.length+t).map(item=>item.y+item.height))/placementStep)*placementStep;});
  }catch{}
  let drag=null,marquee=null,suppressClick=null,layer=10;
  const selected=new Set(),selectionBox=document.querySelector('#selection-marquee');
  function showSelection(){rows.forEach((row,t)=>row.classList.toggle('selected',selected.has(t)));}
  function selectOnly(t){selected.clear();selected.add(t);showSelection();}
  function save(){try{localStorage.setItem(key,JSON.stringify(positions));}catch{}onCommit?.();}
  function resizeCanvas(){
    const width=Math.max(viewport.clientWidth,...positions.filter(p=>!p.deleted).map(p=>p.x+p.width+40));
    const height=Math.max(viewport.clientHeight,...positions.filter(p=>!p.deleted).map(p=>p.y+p.height+40));
    canvas.style.width=Math.ceil(width/unit)*unit+'px';
    canvas.style.height=Math.ceil(height/unit)*unit+'px';
  }
  function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
  function overlaps(t,next,limit=positions.length){return positions.some((p,i)=>i!==t&&i<limit&&!p.deleted&&intersects(next,p));}
  function freePosition(position,occupied){
    const xs=new Set([position.x,0]),ys=new Set([position.y,0]);
    occupied.forEach(p=>{
      xs.add(Math.max(0,Math.floor((p.x-position.width)/placementStep)*placementStep));xs.add(Math.ceil((p.x+p.width)/placementStep)*placementStep);
      ys.add(Math.max(0,Math.floor((p.y-position.height)/placementStep)*placementStep));ys.add(Math.ceil((p.y+p.height)/placementStep)*placementStep);
    });
    const candidates=Array.from(xs).flatMap(x=>Array.from(ys,y=>({...position,x,y})));
    candidates.sort((a,b)=>(a.x-position.x)**2+(a.y-position.y)**2-((b.x-position.x)**2+(b.y-position.y)**2)||a.y-b.y||a.x-b.x);
    return candidates.find(p=>occupied.every(other=>!intersects(p,other)));
  }
  function nearestFree(t,position,limit=positions.length){return freePosition(position,positions.filter((p,i)=>i!==t&&i<limit&&!p.deleted));}
  let repaired=false;
  positions.forEach((p,t)=>{if(!p.deleted&&overlaps(t,p,t)){positions[t]=nearestFree(t,p,t);repaired=true;}});
  if(repaired||migrated)save();
  function paint(t){
    rows[t].hidden=!!positions[t].deleted;
    const next=positions[t],changed=rows[t].classList.contains('vertical-track')!==next.vertical;
    rows[t].classList.toggle('vertical-track',next.vertical);rows[t].classList.toggle('track-row',!next.vertical);rows[t].classList.toggle('compact-track',!next.vertical&&next.height===20);
    if(changed)onOrientationChange?.(t,next.vertical);
    const floating=drag?.active&&!drag.resize&&!drag.trim&&drag.members.includes(t);
    Object.assign(rows[t].style,{left:(floating?drag.baseline[t].x+drag.deltaX:next.x)+'px',top:(floating?drag.baseline[t].y+drag.deltaY:next.y)+'px',width:next.width+'px',height:next.height+'px'});
  }
  function paintAll(){rows.forEach((_,t)=>paint(t));resizeCanvas();}
  function place(t,x,y,width=positions[t].width,height=positions[t].height,vertical=positions[t].vertical,beats=positions[t].beats,trim=false){
    const dimension=(axis,value)=>trim?Math.max(minimumSize(vertical)[axis],snap(value)):sizeSnap(t,axis,value,vertical);
    const next={x:snapPosition(x),y:snapPosition(y),vertical,deleted:!!positions[t].deleted,beats,width:dimension('width',width),height:dimension('height',height)};
    if(overlaps(t,next))return false;
    positions[t]=next;paint(t);resizeCanvas();return true;
  }
  function trimTrack(t,delta,baseline=positions[t]){
    const length=baseline.vertical?baseline.height:baseline.width,pixelsPerBeat=length/baseline.beats;
    const minimumBeats=Math.max(16,Math.ceil(minimumSize(baseline.vertical)[baseline.vertical?'height':'width']/pixelsPerBeat/16)*16);
    const beats=Math.max(minimumBeats,Math.round((baseline.beats+delta/pixelsPerBeat)/16)*16);
    const nextLength=snap(beats*pixelsPerBeat);
    return place(t,baseline.x,baseline.y,baseline.vertical?baseline.width:nextLength,baseline.vertical?nextLength:baseline.height,baseline.vertical,beats,true);
  }
  paintAll();
  function reflowGroup(indices,targets,baseline){
    const next=baseline.map(p=>({...p})),occupied=[...targets],displaced=[];
    indices.forEach((t,i)=>next[t]=targets[i]);
    baseline.forEach((p,i)=>{if(!p.deleted&&!indices.includes(i)){if(targets.some(target=>intersects(p,target)))displaced.push(i);else occupied.push(p);}});
    displaced.forEach(i=>{next[i]=freePosition(baseline[i],occupied);occupied.push(next[i]);});
    positions=next;paintAll();
  }
  function moveSelected(dx,dy){
    finish(true);const members=Array.from(selected);if(!members.length)return;
    const baseline=positions.map(p=>({...p}));
    dx=Math.max(dx,-Math.min(...members.map(t=>baseline[t].x)));dy=Math.max(dy,-Math.min(...members.map(t=>baseline[t].y)));
    reflowGroup(members,members.map(t=>({...baseline[t],x:baseline[t].x+dx,y:baseline[t].y+dy})),baseline);save();
  }
  function move(){
    if(!drag?.active)return;
    const dx=drag.clientX+window.scrollX-drag.startX,dy=drag.clientY+window.scrollY-drag.startY;
    if(drag.trim)trimTrack(drag.t,drag.vertical?dy:dx,drag.baseline[drag.t]);
    else if(drag.resize)place(drag.t,drag.x,drag.y,drag.width+dx,drag.height+dy);
    else{
      drag.deltaX=Math.max(dx,-Math.min(...drag.members.map(t=>drag.baseline[t].x)));
      drag.deltaY=Math.max(dy,-Math.min(...drag.members.map(t=>drag.baseline[t].y)));
      const gridX=Math.round(drag.deltaX/placementStep)*placementStep,gridY=Math.round(drag.deltaY/placementStep)*placementStep;
      reflowGroup(drag.members,drag.members.map(t=>({...drag.baseline[t],x:drag.baseline[t].x+gridX,y:drag.baseline[t].y+gridY})),drag.baseline);
    }
  }
  function finish(cancel=false){
    if(!drag)return;
    const state=drag;drag=null;
    if(state.active){
      if(cancel)positions=state.baseline.map(p=>({...p}));
      suppressClick=state.t;state.members.forEach(t=>{rows[t].classList.remove('dragging');rows[t].classList.remove('resizing');rows[t].classList.remove('trimming');});
      document.body.classList.remove('moving-track');document.body.classList.remove('resizing-track');document.body.classList.remove('trimming-track');
      paintAll();if(!cancel)save();
      if(rows[state.t].hasPointerCapture(state.id))rows[state.t].releasePointerCapture(state.id);
    }
  }
  rows.forEach((row,t)=>{
    row.setAttribute('role','group');
    row.setAttribute('aria-label',`${row.querySelector('.track-label').textContent}. Drag to move; Select and use arrow keys to move four grid squares. Delete removes selected tracks. The corner handle scales its display; the centered end handle trims its loop.`);
    row.addEventListener('pointerdown',event=>{
      if(positions[t].deleted||event.button!==0||!event.isPrimary||event.target.closest('[data-track-play],[data-mute],[data-solo]'))return;
      suppressClick=null;document.activeElement?.blur();
      if(event.shiftKey){if(selected.has(t))selected.delete(t);else selected.add(t);showSelection();suppressClick=t;if(!selected.has(t))return;}
      else if(!selected.has(t))selectOnly(t);
      const resize=!!event.target.closest('[data-resize]'),trim=!!event.target.closest('[data-trim]');
      drag={t,id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,...positions[t],baseline:positions.map(p=>({...p})),members:resize||trim?[t]:Array.from(selected),resize,trim,active:false};
    });
    row.addEventListener('click',event=>{
      if(event.detail!==0&&suppressClick===t){suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    row.addEventListener('keydown',event=>{
      const steps={ArrowLeft:[-placementStep,0],ArrowRight:[placementStep,0],ArrowUp:[0,-placementStep],ArrowDown:[0,placementStep]};
      const resize=!!event.target?.closest('[data-resize]'),trim=!!event.target?.closest('[data-trim]');
      if((event.altKey||resize||trim)&&steps[event.key]){
        event.preventDefault();event.stopPropagation();const [x,y]=steps[event.key];
        finish(true);row.style.zIndex=++layer;
        if(trim){const p=positions[t],delta=p.vertical?y:x;if(delta)trimTrack(t,Math.sign(delta)*16*(p.vertical?p.height:p.width)/p.beats);}
        else if(resize)place(t,positions[t].x,positions[t].y,positions[t].width+Math.sign(x)*sizeStep(t,'width'),positions[t].height+Math.sign(y)*sizeStep(t,'height'));
        else{if(!selected.has(t))selectOnly(t);moveSelected(x,y);}
        save();
      }
    });
  });
  function updateMarquee(){
    const x=marquee.clientX+window.scrollX,y=marquee.clientY+window.scrollY;
    const area={x:Math.min(x,marquee.startX),y:Math.min(y,marquee.startY),width:Math.abs(x-marquee.startX),height:Math.abs(y-marquee.startY)};
    Object.assign(selectionBox.style,{left:area.x+'px',top:area.y+'px',width:area.width+'px',height:area.height+'px'});
    selected.clear();if(marquee.additive)marquee.before.forEach(t=>selected.add(t));
    positions.forEach((p,t)=>{if(!p.deleted&&intersects(area,p))selected.add(t);});showSelection();
  }
  function finishMarquee(cancel=false){
    if(!marquee)return;
    const state=marquee;marquee=null;selectionBox.hidden=true;
    if(cancel){selected.clear();state.before.forEach(t=>selected.add(t));showSelection();}
    if(canvas.hasPointerCapture(state.id))canvas.releasePointerCapture(state.id);
  }
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||event.target.closest('.track-surface,.transport,.context-menu,.canvas-playhead,.canvas-playhead-track,input,textarea,select,[contenteditable="true"]'))return;
    finish(true);
    marquee={id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,before:new Set(selected),additive:event.shiftKey||event.metaKey||event.ctrlKey,active:false};
    if(!marquee.additive){selected.clear();showSelection();}
    document.activeElement?.blur();
  });
  document.addEventListener('pointermove',event=>{
    if(marquee&&event.pointerId===marquee.id){
      marquee.clientX=event.clientX;marquee.clientY=event.clientY;
      if(!marquee.active&&Math.hypot(event.clientX+window.scrollX-marquee.startX,event.clientY+window.scrollY-marquee.startY)>=3){marquee.active=true;canvas.setPointerCapture(marquee.id);selectionBox.hidden=false;}
      if(marquee.active){event.preventDefault();updateMarquee();}return;
    }
    if(!drag||event.pointerId!==drag.id)return;
    drag.clientX=event.clientX;drag.clientY=event.clientY;
    if(!drag.active&&Math.hypot(event.clientX+window.scrollX-drag.startX,event.clientY+window.scrollY-drag.startY)>=6){
      drag.active=true;rows[drag.t].setPointerCapture(drag.id);rows[drag.t].style.zIndex=++layer;
      drag.members.forEach(t=>{rows[t].classList.add('dragging');rows[t].style.zIndex=++layer;});
      if(drag.resize)rows[drag.t].classList.add('resizing');if(drag.trim)rows[drag.t].classList.add('trimming');
      document.body.classList.add(drag.trim?'trimming-track':drag.resize?'resizing-track':'moving-track');
    }
    if(drag.active){event.preventDefault();move();}
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee();if(drag&&event.pointerId===drag.id)finish();});
  document.addEventListener('pointercancel',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee(true);if(drag&&event.pointerId===drag.id)finish(true);});
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.target?.closest?.('input,textarea,select,[contenteditable="true"],#track-menu,.canvas-playhead,.canvas-playhead-track'))return;
    if(event.key==='Escape'){
      if(marquee){event.preventDefault();finishMarquee(true);}
      else if(drag){event.preventDefault();finish(true);}
      else{selected.clear();showSelection();}return;
    }
    if(event.target?.closest?.('[data-resize],[data-trim]'))return;
    const steps={ArrowLeft:[-placementStep,0],ArrowRight:[placementStep,0],ArrowUp:[0,-placementStep],ArrowDown:[0,placementStep]};
    if(selected.size&&steps[event.key]){event.preventDefault();moveSelected(...steps[event.key]);}
  });
  window.addEventListener('resize',resizeCanvas);
  window.addEventListener('blur',()=>{finish(true);finishMarquee(true);});
  function tick(){
    const gesture=drag?.active?drag:marquee?.active?marquee:null;if(!gesture)return;
    const edge=32,speed=10;
    const dx=gesture.clientX<edge?-speed:gesture.clientX>window.innerWidth-edge?speed:0;
    const dy=gesture.clientY<edge?-speed:gesture.clientY>window.innerHeight-edge?speed:0;
    if(dx||dy){window.scrollBy(dx,dy);if(drag)move();else updateMarquee();}
  }
  function toggleOrientation(t){
    finish(true);
    const old=positions[t],vertical=!old.vertical;
    let next={...old,vertical,width:Math.max(minimumSize(vertical).width,old.height),height:Math.max(minimumSize(vertical).height,old.width)};
    if(overlaps(t,next))next=nearestFree(t,next);
    rows[t].style.zIndex=++layer;place(t,next.x,next.y,next.width,next.height,vertical,next.beats,true);save();
  }
  function deleteTracks(indices=Array.from(selected)){
    finish(true);finishMarquee(true);
    const targets=indices.filter(t=>positions[t]&&!positions[t].deleted);if(!targets.length)return;
    targets.forEach(t=>{positions[t]={...positions[t],deleted:true};selected.delete(t);});
    showSelection();paintAll();save();
  }
  function restore(next){
    finish(true);finishMarquee(true);positions=next.map(p=>({...p}));
    selected.clear();showSelection();paintAll();save();
  }
  function cancelGestures(){finish(true);finishMarquee(true);}
  return {tick,toggleOrientation,deleteTracks,restore,reset:()=>restore(defaultPositions),cancelGestures,getSelection:()=>Array.from(selected),getPositions:()=>positions.map(p=>({...p}))};
};
