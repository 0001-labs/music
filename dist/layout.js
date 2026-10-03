'use strict';
// Display scales are limited to those that keep 4/4 bars on the grid: each step halves or doubles the size.
window.musicGrid={unit:20,placementStep:80,sourceBeats:32,scales:[.125,.25,.5,1,2,4],
  // Clip heights are 1, 2, 4, 8 or 12 squares.
  heights:[20,40,80,160,240],
  // A clip sits on rows of its own height, up to the 4-square section: a 2-square clip on every second row, a 4-square or taller clip on section lines.
  rowStep(height){return height>=80?80:height>=40?40:20;},nearestHeight(wanted){return this.heights.reduce((best,height)=>Math.abs(height-wanted)<Math.abs(best-wanted)?height:best);},
  scaledLength(beats,wanted,grid,minimum){const lengths=this.scales.map(scale=>beats*40*scale).filter(length=>length>=minimum&&length%grid===0);return lengths.length?lengths.reduce((best,length)=>Math.abs(length-wanted)<Math.abs(best-wanted)?length:best):null;}};
window.createMusicLayout=function(rows,onCommit){
  const {unit,placementStep}=window.musicGrid,key='music-grid-layout-four-bar-v1',canvas=document.querySelector('#canvas');
  const snap=value=>Math.max(0,Math.round(value/unit)*unit);
  const snapPosition=value=>Math.max(0,Math.round(value/placementStep)*placementStep);
  const board=window.musicBoard;
  const initialX=Math.max(placementStep,snapPosition((board.width-640)/2));
  const initialY=placementStep;
  const minimumSize={width:80,height:20};
  const sizeStep=axis=>axis==='width'?4*unit:unit;
  const sizeSnap=(axis,value)=>Math.max(minimumSize[axis],Math.round(value/sizeStep(axis))*sizeStep(axis));
  let positions=rows.map((_,t)=>({x:initialX,y:initialY+t*placementStep,width:640,height:4*unit,deleted:false,beats:16,offset:0}));
  const defaultPositions=positions.map(p=>({...p}));
  let migrated=false;
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved)&&saved.length>0&&saved.length<=rows.length&&saved.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000))positions=positions.map((initial,t)=>{
      const p=saved[t];if(!p){migrated=true;return initial;}
      // Saved before tracks were horizontal-only: a vertical track is laid on its side; the overlap repair below finds it room.
      const flip=p.vertical===true;if(flip)migrated=true;
      const hasBeats=Number.isFinite(p.beats)&&p.beats>=2&&p.beats<=2500;
      const dimension=(axis,value)=>Number.isFinite(value)&&value<=100000?(hasBeats?Math.max(minimumSize[axis],snap(value)):sizeSnap(axis,value)):positions[t][axis];
      let width=dimension('width',flip?p.height:p.width),height=dimension('height',flip?p.width:p.height);
      const oldBeats=hasBeats?p.beats:width/40,beats=Math.max(16,Math.round(oldBeats/16)*16);
      if(beats!==oldBeats){width=Math.max(minimumSize.width,Math.round(width*beats/oldBeats/placementStep)*placementStep);migrated=true;}
      const x=snapPosition(flip?Math.min(p.x,Math.max(0,board.width-width)):p.x),y=snap(p.y);
      if(x!==p.x||y!==p.y)migrated=true;
      return {x,y,width,height,deleted:p.deleted===true,beats,offset:Number.isFinite(p.offset)&&p.offset>=0&&p.offset<window.musicGrid.sourceBeats?p.offset:0};
    });
    if(migrated&&Array.isArray(saved)&&saved.length>0&&saved.length<rows.length)positions.slice(saved.length).forEach((p,t)=>{p.y=Math.ceil(Math.max(...positions.slice(0,saved.length+t).map(item=>item.y+item.height))/unit)*unit;});
  }catch{}
  let obstacles=()=>[];
  let drag=null,marquee=null,range=null,rangeCut=null,suppressClick=null,suppressMarqueeClick=false,layer=10;
  const selected=new Set(),selectionBox=document.querySelector('#selection-marquee');
  // The marquee is a time selection: it lights the part of each track it crosses, over the track's full height.
  const portions=document.createElement('div');portions.setAttribute('aria-hidden','true');canvas.appendChild(portions);
  // With two or more clips in the selection, a corner button compacts them into one clip.
  let rangeGroup=null,rangeSelect=null,gridClick=null;
  const groupControl=document.createElement('button');groupControl.className='marquee-cut';groupControl.title='Compact selection into one clip (Command-G)';groupControl.setAttribute('aria-label',groupControl.title);groupControl.hidden=true;groupControl.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 14v-4h4M2 2l4 4M14 14l-4-4"/></svg>';canvas.appendChild(groupControl);
  groupControl.addEventListener('pointerdown',event=>event.stopPropagation());groupControl.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
  groupControl.addEventListener('click',event=>{event.stopPropagation();if(range)rangeGroup?.({...range});});
  function clearRange(){range=null;selectionBox.hidden=true;groupControl.hidden=true;portions.innerHTML='';}
  // Dragging a lit portion cuts it out of its track and carries it along.
  let portionDrag=null;
  portions.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||!range)return;
    event.preventDefault();event.stopPropagation();portionDrag={id:event.pointerId,x:event.clientX+window.scrollX,y:event.clientY+window.scrollY,mover:null};portions.setPointerCapture(event.pointerId);
  });
  portions.addEventListener('pointermove',event=>{
    if(!portionDrag||event.pointerId!==portionDrag.id)return;
    const dx=event.clientX+window.scrollX-portionDrag.x,dy=event.clientY+window.scrollY-portionDrag.y;
    if(!portionDrag.mover){if(Math.hypot(dx,dy)<6)return;portionDrag.mover=rangeCut?.({...range})||{move(){},end(){}};}
    event.preventDefault();portionDrag.mover.move(dx,dy);
  });
  function finishPortion(event){
    if(!portionDrag||event.pointerId!==portionDrag.id)return;
    const state=portionDrag;portionDrag=null;if(portions.hasPointerCapture(state.id))portions.releasePointerCapture(state.id);
    if(state.mover)state.mover.end();else clearRange();
  }
  portions.addEventListener('pointerup',finishPortion);portions.addEventListener('pointercancel',finishPortion);
  function paintRange(){selectionBox.hidden=!range||range.width===0||range.height===0;const hits=selectionBox.hidden?[]:positions.concat(obstacles()).filter(p=>!p.deleted&&intersects(range,p));groupControl.hidden=hits.length<2;if(range)Object.assign(groupControl.style,{left:(range.x+range.width-20)+'px',top:range.y+'px'});
    portions.innerHTML=hits.map(p=>{const x=Math.max(p.x,range.x),y=p.y,width=Math.min(p.x+p.width,range.x+range.width)-x,height=p.height,whole=width===p.width;return `<span class="marquee-portion${whole?' whole':''}" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></span>`;}).join('');
    if(range){Object.assign(selectionBox.style,{left:range.x+'px',top:range.y+'px',width:range.width+'px',height:range.height+'px'});}}
  function showSelection(){rows.forEach((row,t)=>row.classList.toggle('selected',selected.has(t)));}
  function selectOnly(t){selected.clear();selected.add(t);showSelection();}
  function save(){try{localStorage.setItem(key,JSON.stringify(positions));}catch{}onCommit?.();}
  function resizeCanvas(){
    // The board is a fixed size; nothing scrolls.
    canvas.style.width=board.width+'px';canvas.style.height=board.height+'px';
  }
  function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
  function overlaps(t,next,limit=positions.length){return positions.some((p,i)=>i!==t&&i<limit&&!p.deleted&&intersects(next,p))||obstacles().some(p=>intersects(next,p));}
  function freePosition(position,occupied){
    const rows=window.musicGrid.rowStep(position.height),xs=new Set([position.x,0]),ys=new Set([Math.round(position.y/rows)*rows,0]);
    occupied.forEach(p=>{
      xs.add(Math.max(0,Math.floor((p.x-position.width)/placementStep)*placementStep));xs.add(Math.ceil((p.x+p.width)/placementStep)*placementStep);
      ys.add(Math.max(0,Math.floor((p.y-position.height)/rows)*rows));ys.add(Math.ceil((p.y+p.height)/rows)*rows);
    });
    const everywhere=Array.from(xs).flatMap(x=>Array.from(ys,y=>({...position,x,y}))),onBoard=everywhere.filter(p=>p.x+p.width<=board.width&&p.y+p.height<=board.height),candidates=onBoard.length?onBoard:everywhere;
    candidates.sort((a,b)=>(a.x-position.x)**2+(a.y-position.y)**2-((b.x-position.x)**2+(b.y-position.y)**2)||a.y-b.y||a.x-b.x);
    return candidates.find(p=>occupied.every(other=>!intersects(p,other)));
  }
  function nearestFree(t,position,limit=positions.length){return freePosition(position,positions.filter((p,i)=>i!==t&&i<limit&&!p.deleted).concat(obstacles()));}
  let repaired=false;
  positions.forEach((p,t)=>{if(!p.deleted&&overlaps(t,p,t)){positions[t]=nearestFree(t,p,t);repaired=true;}});
  if(repaired||migrated)save();
  function paint(t){
    rows[t].hidden=!!positions[t].deleted;
    const next=positions[t];rows[t].classList.toggle('compact-track',next.height===20);
    const floating=drag?.active&&!drag.resize&&!drag.trim&&drag.members.includes(t);
    Object.assign(rows[t].style,{left:(floating?drag.baseline[t].x+drag.deltaX:next.x)+'px',top:(floating?drag.baseline[t].y+drag.deltaY:next.y)+'px',width:next.width+'px',height:next.height+'px'});
  }
  function paintAll(){rows.forEach((_,t)=>paint(t));resizeCanvas();}
  function place(t,x,y,width=positions[t].width,height=positions[t].height,beats=positions[t].beats,trim=false,offset=positions[t].offset||0){
    const dimension=(axis,value)=>trim?Math.max(minimumSize[axis],snap(value)):sizeSnap(axis,value);
    const next={x:snapPosition(x),y:snap(y),deleted:!!positions[t].deleted,beats,offset,width:dimension('width',width),height:dimension('height',height)};
    if(overlaps(t,next)||next.x+next.width>board.width||next.y+next.height>board.height)return false;
    positions[t]=next;paint(t);resizeCanvas();return true;
  }
  // Scaling never stops at a neighbour: tracks in the way move down, and return when it shrinks back.
  function resizeTrack(t,width,height,baseline=positions){
    const next={...baseline[t],width:sizeSnap('width',width),height:window.musicGrid.nearestHeight(height)};
    next.y=Math.floor(next.y/window.musicGrid.rowStep(next.height))*window.musicGrid.rowStep(next.height);
    next.width=window.musicGrid.scaledLength(baseline[t].beats,width,placementStep,minimumSize.width)??baseline[t].width;
    if(obstacles().some(p=>intersects(next,p)))return false;
    const settled=[next,...obstacles()],result=baseline.map(p=>({...p}));result[t]=next;
    result.map((_,i)=>i).filter(i=>i!==t&&!result[i].deleted).sort((a,b)=>result[a].y-result[b].y||a-b).forEach(i=>{
      const p=result[i];
      for(let hit;(hit=settled.find(other=>intersects(p,other)));)p.y=hit.y+hit.height;
      settled.push(p);
    });
    positions=result;paintAll();return true;
  }
  function trimTrack(t,delta,baseline=positions[t],fromStart=false){
    const pixelsPerBeat=baseline.width/baseline.beats;
    const minimumBeats=Math.max(16,Math.ceil(minimumSize.width/pixelsPerBeat/16)*16);
    if(fromStart){
      // The end stays put: dragging the start right crops the beginning, dragging it left brings earlier audio back in.
      const beats=Math.max(minimumBeats,Math.round((baseline.beats-delta/pixelsPerBeat)/16)*16),far=baseline.x+baseline.width;
      if(far-beats*pixelsPerBeat<0)return false;
      const near=snapPosition(far-beats*pixelsPerBeat),source=window.musicGrid.sourceBeats;if(near>=far)return false;
      const offset=(((baseline.offset||0)+baseline.beats-beats)%source+source)%source;
      return place(t,near,baseline.y,far-near,baseline.height,beats,true,offset);
    }
    const beats=Math.max(minimumBeats,Math.round((baseline.beats+delta/pixelsPerBeat)/16)*16);
    return place(t,baseline.x,baseline.y,snap(beats*pixelsPerBeat),baseline.height,beats,true);
  }
  paintAll();
  function reflowGroup(indices,targets,baseline){
    targets=targets.map(target=>obstacles().some(p=>intersects(target,p))?freePosition(target,obstacles()):target);
    const next=baseline.map(p=>({...p})),occupied=[...targets,...obstacles()],displaced=[];
    indices.forEach((t,i)=>next[t]=targets[i]);
    baseline.forEach((p,i)=>{if(!p.deleted&&!indices.includes(i)){if(targets.some(target=>intersects(p,target)))displaced.push(i);else occupied.push(p);}});
    displaced.forEach(i=>{next[i]=freePosition(baseline[i],occupied);occupied.push(next[i]);});
    positions=next;paintAll();
  }
  function moveSelected(dx,dy){
    finish(true);const members=Array.from(selected);if(!members.length)return;
    const baseline=positions.map(p=>({...p}));
    dx=Math.min(Math.max(dx,-Math.min(...members.map(t=>baseline[t].x))),board.width-Math.max(...members.map(t=>baseline[t].x+baseline[t].width)));dy=Math.min(Math.max(dy,-Math.min(...members.map(t=>baseline[t].y))),board.height-Math.max(...members.map(t=>baseline[t].y+baseline[t].height)));
    reflowGroup(members,members.map(t=>({...baseline[t],x:baseline[t].x+dx,y:baseline[t].y+dy})),baseline);save();
  }
  function move(){
    if(!drag?.active)return;
    const dx=drag.clientX+window.scrollX-drag.startX,dy=drag.clientY+window.scrollY-drag.startY;
    if(drag.trim)trimTrack(drag.t,dx,drag.baseline[drag.t],drag.start);
    else if(drag.resize)resizeTrack(drag.t,drag.width+dx,drag.height+dy,drag.baseline);
    else{
      // Dragged tracks stay on the board.
      drag.deltaX=Math.min(Math.max(dx,-Math.min(...drag.members.map(t=>drag.baseline[t].x))),board.width-Math.max(...drag.members.map(t=>drag.baseline[t].x+drag.baseline[t].width)));
      drag.deltaY=Math.min(Math.max(dy,-Math.min(...drag.members.map(t=>drag.baseline[t].y))),board.height-Math.max(...drag.members.map(t=>drag.baseline[t].y+drag.baseline[t].height)));
      // The group moves in steps of its tallest member's rows, measured from the dragged track so it lands on its own rows.
      const rows=Math.max(...drag.members.map(t=>window.musicGrid.rowStep(drag.baseline[t].height))),lead=drag.baseline[drag.t];
      const gridX=Math.round(drag.deltaX/placementStep)*placementStep,gridY=Math.round((lead.y+drag.deltaY)/rows)*rows-lead.y;
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
      if(event.altKey)return;clearRange();if(positions[t].deleted||event.button!==0||!event.isPrimary||event.target.closest('[data-track-play],[data-mute],[data-solo]'))return;
      suppressClick=null;document.activeElement?.blur();
      if(event.shiftKey){if(selected.has(t))selected.delete(t);else selected.add(t);showSelection();suppressClick=t;if(!selected.has(t))return;}
      else if(!selected.has(t))selectOnly(t);
      const resize=!!event.target.closest('[data-resize]'),start=!!event.target.closest('[data-trim-start]'),trim=start||!!event.target.closest('[data-trim]');
      drag={start,t,id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,...positions[t],baseline:positions.map(p=>({...p})),members:resize||trim?[t]:Array.from(selected),resize,trim,active:false};
    });
    row.addEventListener('click',event=>{
      if(event.detail!==0&&suppressClick===t){suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    row.addEventListener('keydown',event=>{
      const rows=Math.max(window.musicGrid.rowStep(positions[t].height),...Array.from(selected,i=>window.musicGrid.rowStep(positions[i].height))),steps={ArrowLeft:[-placementStep,0],ArrowRight:[placementStep,0],ArrowUp:[0,-rows],ArrowDown:[0,rows]};
      const resize=!!event.target?.closest('[data-resize]'),start=!!event.target?.closest('[data-trim-start]'),trim=start||!!event.target?.closest('[data-trim]');
      if((event.altKey||resize||trim)&&steps[event.key]){
        event.preventDefault();event.stopPropagation();const [x,y]=steps[event.key];
        finish(true);row.style.zIndex=++layer;
        if(trim){const p=positions[t];if(x)trimTrack(t,Math.sign(x)*16*p.width/p.beats,p,start);}
        else if(resize)resizeTrack(t,positions[t].width+Math.sign(x)*sizeStep('width'),positions[t].height+Math.sign(y)*sizeStep('height'));
        else{if(!selected.has(t))selectOnly(t);moveSelected(x,y);}
        save();
      }
    });
  });
  function updateMarquee(){
    const x=snapPosition(marquee.clientX+window.scrollX),y=snap(marquee.clientY+window.scrollY);
    const area={x:Math.min(x,marquee.startX),y:Math.min(y,marquee.startY),width:Math.abs(x-marquee.startX),height:Math.abs(y-marquee.startY)};
    // The selection always covers the full height of every clip it touches.
    for(let pass=0,changed=true;changed&&pass<20;pass++){
      changed=false;
      positions.concat(obstacles()).forEach(p=>{
        if(p.deleted||!intersects(area,p))return;
        const start=Math.min(area.y,p.y),end=Math.max(area.y+area.height,p.y+p.height);
        if(start!==area.y||end!==area.y+area.height){area.y=start;area.height=end-start;changed=true;}
      });
    }
    range=area;paintRange();
    selected.clear();if(marquee.additive)marquee.before.forEach(t=>selected.add(t));
    positions.forEach((p,t)=>{if(!p.deleted&&intersects(area,p)&&area.x<=p.x&&area.x+area.width>=p.x+p.width)selected.add(t);});showSelection();rangeSelect?.(area);
  }
  function finishMarquee(cancel=false){
    if(!marquee)return;
    const state=marquee;marquee=null;if(state.active&&!cancel)suppressMarqueeClick=true;if(!state.active){clearRange();if(!cancel&&!state.additive)gridClick?.(state.rawX,state.rawY);}else paintRange();
    if(cancel){range=state.beforeRange;paintRange();selected.clear();state.before.forEach(t=>selected.add(t));showSelection();rangeSelect?.(null);}
    if(canvas.hasPointerCapture(state.id))canvas.releasePointerCapture(state.id);
  }
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||event.target.closest('.music-header,.transport,.context-menu,.canvas-playhead,.marquee-cut,input,textarea,select,[contenteditable="true"]')||(!event.altKey&&event.target.closest('.track-surface,.arrangement-block,.arrangement-block-menu')))return;
    finish(true);
    marquee={id:event.pointerId,rawX:event.clientX+window.scrollX,rawY:event.clientY+window.scrollY,startX:snapPosition(event.clientX+window.scrollX),startY:snap(event.clientY+window.scrollY),clientX:event.clientX,clientY:event.clientY,beforeRange:range?{...range}:null,before:new Set(selected),additive:event.shiftKey||event.metaKey||event.ctrlKey,active:false};
    if(!marquee.additive){selected.clear();showSelection();}
    document.activeElement?.blur();
  });
  document.addEventListener('pointermove',event=>{
    if(marquee&&event.pointerId===marquee.id){
      marquee.clientX=event.clientX;marquee.clientY=event.clientY;
      if(!marquee.active&&Math.hypot(event.clientX+window.scrollX-marquee.rawX,event.clientY+window.scrollY-marquee.rawY)>=3){marquee.active=true;canvas.setPointerCapture(marquee.id);selectionBox.hidden=false;}
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
  document.addEventListener('pointerdown',event=>{suppressMarqueeClick=false;if(!event.altKey&&event.target.closest?.('.arrangement-block'))clearRange();},true);
  document.addEventListener('click',event=>{if(suppressMarqueeClick){suppressMarqueeClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('pointerup',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee();if(drag&&event.pointerId===drag.id)finish();});
  document.addEventListener('pointercancel',event=>{if(marquee&&event.pointerId===marquee.id)finishMarquee(true);if(drag&&event.pointerId===drag.id)finish(true);});
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.target?.closest?.('input,textarea,select,[contenteditable="true"],#track-menu,.canvas-playhead,.canvas-playhead-track'))return;
    if(event.key==='Escape'){
      if(marquee){event.preventDefault();finishMarquee(true);}
      else if(drag){event.preventDefault();finish(true);}
      else{clearRange();selected.clear();showSelection();}return;
    }
    if(event.target?.closest?.('[data-resize],[data-trim],[data-trim-start]'))return;
    const rows=Math.max(unit,...Array.from(selected,t=>window.musicGrid.rowStep(positions[t].height))),steps={ArrowLeft:[-placementStep,0],ArrowRight:[placementStep,0],ArrowUp:[0,-rows],ArrowDown:[0,rows]};
    if(selected.size&&steps[event.key]){event.preventDefault();clearRange();moveSelected(...steps[event.key]);}
  });
  window.addEventListener('resize',resizeCanvas);
  window.addEventListener('blur',()=>{finish(true);finishMarquee(true);});
  function tick(){
    const gesture=drag?.active?drag:marquee?.active?marquee:null;if(!gesture)return;
    // Nothing to do per frame now that the board no longer scrolls under a gesture.
  }
  function setLength(t,length){finish(true);const p=positions[t];if(!p||p.deleted)return;rows[t].style.zIndex=++layer;resizeTrack(t,length,p.height);save();}
  function ensureHeight(t,minimum){
    const current=positions[t];if(!current||current.height>=minimum)return;
    const delta=minimum-current.height,oldFar=current.y+current.height,next=positions.map(item=>({...item}));
    next[t]={...current,height:minimum};
    positions.forEach((item,i)=>{
      if(i!==t&&item.y>=oldFar-0.1&&item.y<oldFar+delta&&intersects(next[t],item))next[i]={...item,y:item.y+delta};
    });
    positions=next;
    // A pushed track can land on one further along; settle those too.
    positions.forEach((item,i)=>{if(i!==t&&!item.deleted&&overlaps(i,item))positions[i]=nearestFree(i,item);});
    paintAll();save();
  }
  function deleteTracks(indices=Array.from(selected)){
    finish(true);finishMarquee(true);
    const targets=indices.filter(t=>positions[t]&&!positions[t].deleted);if(!targets.length)return;
    targets.forEach(t=>{positions[t]={...positions[t],deleted:true};selected.delete(t);});
    showSelection();paintAll();save();
  }
  function restore(next){
    finish(true);finishMarquee(true);clearRange();positions=next.map(p=>({...p}));
    selected.clear();showSelection();paintAll();save();
  }
  function cancelGestures(){finish(true);finishMarquee(true);}
  return {getRange:()=>range?{...range}:null,clearRange,setRangeHandler(callback){rangeCut=callback;},setGroupHandler(callback){rangeGroup=callback;},setSelectHandler(callback){rangeSelect=callback;},setGridClick(callback){gridClick=callback;},setObstacles(callback){obstacles=callback;paintAll();},tick,deleteTracks,restore,reset:()=>restore(defaultPositions),cancelGestures,ensureHeight,freePosition,setLength,getSelection:()=>Array.from(selected),setSelection(indices){clearRange();selected.clear();indices.forEach(t=>{if(positions[t]&&!positions[t].deleted)selected.add(t);});showSelection();},getPositions:()=>positions.map(p=>({...p}))};
};
