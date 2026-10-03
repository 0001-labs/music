'use strict';
window.createMusicLayout=function(rows){
  const unit=20,key='music-grid-layout-v1',canvas=document.querySelector('#canvas');
  const snap=value=>Math.max(0,Math.round(value/unit)*unit);
  const viewport=document.documentElement;
  const initialX=Math.max(unit,snap((viewport.clientWidth-640)/2));
  const initialY=viewport.clientWidth<=560?40:80;
  const minimum=rows.map(row=>row.classList.contains('vertical-track')?{width:80,height:160}:{width:160,height:20});
  const sizeStep=(t,axis)=>(rows[t].classList.contains('vertical-track')?axis==='height':axis==='width')?4*unit:unit;
  const sizeSnap=(t,axis,value)=>Math.max(minimum[t][axis],Math.round(value/sizeStep(t,axis))*sizeStep(t,axis));
  let positions=rows.map((row,t)=>({x:initialX,y:initialY+t*unit,width:row.offsetWidth,height:row.offsetHeight}));
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved)&&saved.length===rows.length&&saved.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000))positions=saved.map((p,t)=>({x:snap(p.x),y:snap(p.y),width:Number.isFinite(p.width)&&p.width<=100000?sizeSnap(t,'width',p.width):positions[t].width,height:Number.isFinite(p.height)&&p.height<=100000?sizeSnap(t,'height',p.height):positions[t].height}));
  }catch{}
  let drag=null,suppressClick=null,layer=10;
  function save(){try{localStorage.setItem(key,JSON.stringify(positions));}catch{}}
  function resizeCanvas(){
    const width=Math.max(viewport.clientWidth,...positions.map((p,t)=>p.x+p.width+40));
    const height=Math.max(viewport.clientHeight,...positions.map((p,t)=>p.y+p.height+40));
    canvas.style.width=Math.ceil(width/unit)*unit+'px';
    canvas.style.height=Math.ceil(height/unit)*unit+'px';
  }
  function overlaps(t,next,limit=positions.length){
    return positions.some((p,i)=>i!==t&&i<limit&&next.x<p.x+p.width&&next.x+next.width>p.x&&next.y<p.y+p.height&&next.y+next.height>p.y);
  }
  function nearestFree(t,position){
    const xs=new Set([position.x,0]),ys=new Set([position.y,0]);
    positions.slice(0,t).forEach(p=>{
      xs.add(snap(p.x-position.width));xs.add(p.x+p.width);
      ys.add(snap(p.y-position.height));ys.add(p.y+p.height);
    });
    const candidates=Array.from(xs).flatMap(x=>Array.from(ys,y=>({...position,x,y})));
    candidates.sort((a,b)=>(a.x-position.x)**2+(a.y-position.y)**2-((b.x-position.x)**2+(b.y-position.y)**2)||a.y-b.y||a.x-b.x);
    return candidates.find(p=>!overlaps(t,p,t));
  }
  let repaired=false;
  positions.forEach((p,t)=>{if(overlaps(t,p,t)){positions[t]=nearestFree(t,p);repaired=true;}});
  if(repaired)save();
  function place(t,x,y,width=positions[t].width,height=positions[t].height){
    const next={x:snap(x),y:snap(y),width:sizeSnap(t,'width',width),height:sizeSnap(t,'height',height)};
    if(overlaps(t,next))return false;
    positions[t]=next;
    Object.assign(rows[t].style,{left:next.x+'px',top:next.y+'px',width:next.width+'px',height:next.height+'px'});
    resizeCanvas();return true;
  }
  positions.forEach((p,t)=>place(t,p.x,p.y,p.width,p.height));
  function move(){
    if(!drag?.active)return;
    const dx=drag.clientX+window.scrollX-drag.startX,dy=drag.clientY+window.scrollY-drag.startY;
    if(drag.resize)place(drag.t,drag.x,drag.y,drag.width+dx,drag.height+dy);
    else place(drag.t,drag.x+dx,drag.y+dy);
  }
  function finish(cancel=false){
    if(!drag)return;
    const state=drag;drag=null;
    if(state.active){
      if(cancel)place(state.t,state.x,state.y,state.width,state.height);else save();
      suppressClick=state.t;rows[state.t].classList.remove('dragging');rows[state.t].classList.remove('resizing');
      document.body.classList.remove('moving-track');document.body.classList.remove('resizing-track');
      if(rows[state.t].hasPointerCapture(state.id))rows[state.t].releasePointerCapture(state.id);
    }
  }
  rows.forEach((row,t)=>{
    row.setAttribute('role','group');
    row.setAttribute('aria-label',`${row.querySelector('.track-label').textContent}. Drag to move; Alt and arrow keys move one grid square. The corner handle resizes the waveform.`);
    row.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||event.target.closest('[data-track-play],[data-mute],[data-solo]'))return;
      suppressClick=null;
      drag={t,id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,...positions[t],resize:!!event.target.closest('[data-resize]'),active:false};
    });
    row.addEventListener('click',event=>{
      if(event.detail!==0&&suppressClick===t){suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    row.addEventListener('keydown',event=>{
      const steps={ArrowLeft:[-unit,0],ArrowRight:[unit,0],ArrowUp:[0,-unit],ArrowDown:[0,unit]};
      const resize=!!event.target?.closest('[data-resize]');
      if((event.altKey||resize)&&steps[event.key]){
        event.preventDefault();event.stopPropagation();const [x,y]=steps[event.key];
        row.style.zIndex=++layer;
        if(resize)place(t,positions[t].x,positions[t].y,positions[t].width+Math.sign(x)*sizeStep(t,'width'),positions[t].height+Math.sign(y)*sizeStep(t,'height'));
        else place(t,positions[t].x+x,positions[t].y+y);
        save();
      }
    });
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    drag.clientX=event.clientX;drag.clientY=event.clientY;
    if(!drag.active&&Math.hypot(event.clientX+window.scrollX-drag.startX,event.clientY+window.scrollY-drag.startY)>=6){
      drag.active=true;rows[drag.t].setPointerCapture(drag.id);rows[drag.t].style.zIndex=++layer;
      rows[drag.t].classList.add('dragging');
      if(drag.resize)rows[drag.t].classList.add('resizing');
      document.body.classList.add(drag.resize?'resizing-track':'moving-track');
    }
    if(drag.active){event.preventDefault();move();}
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.id)finish();});
  document.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.id)finish(true);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish(true);}});
  window.addEventListener('resize',resizeCanvas);
  window.addEventListener('blur',()=>finish(true));
  function tick(){
    if(!drag?.active)return;
    const edge=32,speed=10;
    const dx=drag.clientX<edge?-speed:drag.clientX>window.innerWidth-edge?speed:0;
    const dy=drag.clientY<edge?-speed:drag.clientY>window.innerHeight-edge?speed:0;
    if(dx||dy){window.scrollBy(dx,dy);move();}
  }
  return {tick,getPositions:()=>positions.map(p=>({...p}))};
};
