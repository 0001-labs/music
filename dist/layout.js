'use strict';
window.createMusicLayout=function(rows,onOrientationChange){
  const unit=20,key='music-grid-layout-v1',canvas=document.querySelector('#canvas');
  const snap=value=>Math.max(0,Math.round(value/unit)*unit);
  const viewport=document.documentElement;
  const initialX=Math.max(unit,snap((viewport.clientWidth-640)/2));
  const initialY=viewport.clientWidth<=560?40:80;
  const minimumSize=vertical=>vertical?{width:80,height:160}:{width:160,height:20};
  const sizeStep=(t,axis,vertical=positions[t].vertical)=>(vertical?axis==='height':axis==='width')?4*unit:unit;
  const sizeSnap=(t,axis,value,vertical=positions[t].vertical)=>Math.max(minimumSize(vertical)[axis],Math.round(value/sizeStep(t,axis,vertical))*sizeStep(t,axis,vertical));
  let positions=rows.map((row,t)=>({x:initialX,y:initialY+t*unit,width:row.offsetWidth,height:row.offsetHeight,vertical:row.classList.contains('vertical-track')}));
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved)&&saved.length===rows.length&&saved.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000))positions=saved.map((p,t)=>{
      const vertical=typeof p.vertical==='boolean'?p.vertical:positions[t].vertical;
      return {x:snap(p.x),y:snap(p.y),vertical,width:Number.isFinite(p.width)&&p.width<=100000?sizeSnap(t,'width',p.width,vertical):positions[t].width,height:Number.isFinite(p.height)&&p.height<=100000?sizeSnap(t,'height',p.height,vertical):positions[t].height};
    });
  }catch{}
  let drag=null,marquee=null,suppressClick=null,layer=10;
  const selected=new Set(),selectionBox=document.querySelector('#selection-marquee');
  function showSelection(){rows.forEach((row,t)=>row.classList.toggle('selected',selected.has(t)));}
  function selectOnly(t){selected.clear();selected.add(t);showSelection();}
  function save(){try{localStorage.setItem(key,JSON.stringify(positions));}catch{}}
  function resizeCanvas(){
    const width=Math.max(viewport.clientWidth,...positions.map((p,t)=>p.x+p.width+40));
    const height=Math.max(viewport.clientHeight,...positions.map((p,t)=>p.y+p.height+40));
    canvas.style.width=Math.ceil(width/unit)*unit+'px';
    canvas.style.height=Math.ceil(height/unit)*unit+'px';
  }
  function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
  function overlaps(t,next,limit=positions.length){return positions.some((p,i)=>i!==t&&i<limit&&intersects(next,p));}
  function freePosition(position,occupied){
    const xs=new Set([position.x,0]),ys=new Set([position.y,0]);
    occupied.forEach(p=>{
      xs.add(snap(p.x-position.width));xs.add(p.x+p.width);
      ys.add(snap(p.y-position.height));ys.add(p.y+p.height);
    });
    const candidates=Array.from(xs).flatMap(x=>Array.from(ys,y=>({...position,x,y})));
    candidates.sort((a,b)=>(a.x-position.x)**2+(a.y-position.y)**2-((b.x-position.x)**2+(b.y-position.y)**2)||a.y-b.y||a.x-b.x);
    return candidates.find(p=>occupied.every(other=>!intersects(p,other)));
  }
  function nearestFree(t,position,limit=positions.length){return freePosition(position,positions.filter((_,i)=>i!==t&&i<limit));}
  let repaired=false;
  positions.forEach((p,t)=>{if(overlaps(t,p,t)){positions[t]=nearestFree(t,p,t);repaired=true;}});
  if(repaired)save();
  function paint(t){
    const next=positions[t],changed=rows[t].classList.contains('vertical-track')!==next.vertical;
    rows[t].classList.toggle('vertical-track',next.vertical);rows[t].classList.toggle('track-row',!next.vertical);rows[t].classList.toggle('compact-track',!next.vertical&&next.height===20);
    if(changed)onOrientationChange?.(t,next.vertical);
    const floating=drag?.active&&!drag.resize&&drag.members.includes(t);
    Object.assign(rows[t].style,{left:(floating?drag.baseline[t].x+drag.deltaX:next.x)+'px',top:(floating?drag.baseline[t].y+drag.deltaY:next.y)+'px',width:next.width+'px',height:next.height+'px'});
  }
  function paintAll(){rows.forEach((_,t)=>paint(t));resizeCanvas();}
  function place(t,x,y,width=positions[t].width,height=positions[t].height,vertical=positions[t].vertical){
    const next={x:snap(x),y:snap(y),vertical,width:sizeSnap(t,'width',width,vertical),height:sizeSnap(t,'height',height,vertical)};
    if(overlaps(t,next))return false;
    positions[t]=next;paint(t);resizeCanvas();return true;
  }
  paintAll();
  function reflowGroup(indices,targets,baseline){
    const next=baseline.map(p=>({...p})),occupied=[...targets],displaced=[];
    indices.forEach((t,i)=>next[t]=targets[i]);
    baseline.forEach((p,i)=>{if(!indices.includes(i)){if(targets.some(target=>intersects(p,target)))displaced.push(i);else occupied.push(p);}});
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
    if(drag.resize)place(drag.t,drag.x,drag.y,drag.width+dx,drag.height+dy);
    else{
      drag.deltaX=Math.max(dx,-Math.min(...drag.members.map(t=>drag.baseline[t].x)));
      drag.deltaY=Math.max(dy,-Math.min(...drag.members.map(t=>drag.baseline[t].y)));
      const gridX=Math.round(drag.deltaX/unit)*unit,gridY=Math.round(drag.deltaY/unit)*unit;
      reflowGroup(drag.members,drag.members.map(t=>({...drag.baseline[t],x:drag.baseline[t].x+gridX,y:drag.baseline[t].y+gridY})),drag.baseline);
    }
  }
  function finish(cancel=false){
    if(!drag)return;
    const state=drag;drag=null;
    if(state.active){
      if(cancel)positions=state.baseline.map(p=>({...p}));
      suppressClick=state.t;state.members.forEach(t=>{rows[t].classList.remove('dragging');rows[t].classList.remove('resizing');});
      document.body.classList.remove('moving-track');document.body.classList.remove('resizing-track');
      paintAll();if(!cancel)save();
      if(rows[state.t].hasPointerCapture(state.id))rows[state.t].releasePointerCapture(state.id);
    }
  }
  rows.forEach((row,t)=>{
    row.setAttribute('role','group');
    row.setAttribute('aria-label',`${row.querySelector('.track-label').textContent}. Drag to move; Select and use arrow keys to move one grid square. The corner handle resizes the waveform.`);
    row.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||event.target.closest('[data-track-play],[data-mute],[data-solo]'))return;
      suppressClick=null;document.activeElement?.blur();
      if(event.shiftKey){if(selected.has(t))selected.delete(t);else selected.add(t);showSelection();suppressClick=t;if(!selected.has(t))return;}
      else if(!selected.has(t))selectOnly(t);
      const resize=!!event.target.closest('[data-resize]');
      drag={t,id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,...positions[t],baseline:positions.map(p=>({...p})),members:resize?[t]:Array.from(selected),resize,active:false};
    });
    row.addEventListener('click',event=>{
      if(event.detail!==0&&suppressClick===t){suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    row.addEventListener('keydown',event=>{
      const steps={ArrowLeft:[-unit,0],ArrowRight:[unit,0],ArrowUp:[0,-unit],ArrowDown:[0,unit]};
      const resize=!!event.target?.closest('[data-resize]');
      if((event.altKey||resize)&&steps[event.key]){
        event.preventDefault();event.stopPropagation();const [x,y]=steps[event.key];
        finish(true);row.style.zIndex=++layer;
        if(resize)place(t,positions[t].x,positions[t].y,positions[t].width+Math.sign(x)*sizeStep(t,'width'),positions[t].height+Math.sign(y)*sizeStep(t,'height'));
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
    positions.forEach((p,t)=>{if(intersects(area,p))selected.add(t);});showSelection();
  }
  function finishMarquee(cancel=false){
    if(!marquee)return;
    const state=marquee;marquee=null;selectionBox.hidden=true;
    if(cancel){selected.clear();state.before.forEach(t=>selected.add(t));showSelection();}
    if(canvas.hasPointerCapture(state.id))canvas.releasePointerCapture(state.id);
  }
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||event.target.closest('.track-surface,.transport,.context-menu,.canvas-playhead,input,textarea,select,[contenteditable="true"]'))return;
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
      if(drag.resize)rows[drag.t].classList.add('resizing');
      document.body.classList.add(drag.resize?'resizing-track':'moving-track');
    }
    if(drag.active){event.preventDefault();move();}
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee();if(drag&&event.pointerId===drag.id)finish();});
  document.addEventListener('pointercancel',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee(true);if(drag&&event.pointerId===drag.id)finish(true);});
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.target?.closest?.('input,textarea,select,[contenteditable="true"],#track-menu,.canvas-playhead,[data-resize]'))return;
    if(event.key==='Escape'){
      if(marquee){event.preventDefault();finishMarquee(true);}
      else if(drag){event.preventDefault();finish(true);}
      else{selected.clear();showSelection();}return;
    }
    const steps={ArrowLeft:[-unit,0],ArrowRight:[unit,0],ArrowUp:[0,-unit],ArrowDown:[0,unit]};
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
    let next={...old,vertical,width:sizeSnap(t,'width',old.height,vertical),height:sizeSnap(t,'height',old.width,vertical)};
    if(overlaps(t,next))next=nearestFree(t,next);
    rows[t].style.zIndex=++layer;place(t,next.x,next.y,next.width,next.height,vertical);save();
  }
  return {tick,toggleOrientation,getSelection:()=>Array.from(selected),getPositions:()=>positions.map(p=>({...p}))};
};
