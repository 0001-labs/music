'use strict';
window.createMusicLayout=function(rows){
  const unit=20,key='music-grid-layout-v1',canvas=document.querySelector('#canvas');
  const snap=value=>Math.max(0,Math.round(value/unit)*unit);
  const viewport=document.documentElement;
  const initialX=Math.max(unit,snap((viewport.clientWidth-640)/2));
  const initialY=viewport.clientWidth<=560?40:80;
  let positions=rows.map((row,t)=>({x:initialX,y:initialY+t*unit}));
  try{
    const saved=JSON.parse(localStorage.getItem(key));
    if(Array.isArray(saved)&&saved.length===rows.length&&saved.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=100000&&p.y<=100000))positions=saved.map(p=>({x:snap(p.x),y:snap(p.y)}));
  }catch{}
  let drag=null,suppressClick=null,layer=10;
  function save(){try{localStorage.setItem(key,JSON.stringify(positions));}catch{}}
  function resizeCanvas(){
    const width=Math.max(viewport.clientWidth,...positions.map((p,t)=>p.x+rows[t].offsetWidth+40));
    const height=Math.max(viewport.clientHeight,...positions.map((p,t)=>p.y+rows[t].offsetHeight+40));
    canvas.style.width=Math.ceil(width/unit)*unit+'px';
    canvas.style.height=Math.ceil(height/unit)*unit+'px';
  }
  function place(t,x,y){
    positions[t]={x:snap(x),y:snap(y)};
    rows[t].style.left=positions[t].x+'px';rows[t].style.top=positions[t].y+'px';
    resizeCanvas();
  }
  positions.forEach((p,t)=>place(t,p.x,p.y));
  function move(){
    if(!drag?.active)return;
    place(drag.t,drag.x+drag.clientX+window.scrollX-drag.startX,drag.y+drag.clientY+window.scrollY-drag.startY);
  }
  function finish(cancel=false){
    if(!drag)return;
    const state=drag;drag=null;
    if(state.active){
      if(cancel)place(state.t,state.x,state.y);else save();
      suppressClick=state.t;rows[state.t].classList.remove('dragging');
      document.body.classList.remove('moving-track');
      if(rows[state.t].hasPointerCapture(state.id))rows[state.t].releasePointerCapture(state.id);
    }
  }
  rows.forEach((row,t)=>{
    row.setAttribute('role','group');
    row.setAttribute('aria-label',`${row.querySelector('.track-label').textContent}. Drag to move; Alt and arrow keys move one grid square.`);
    row.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary||event.target.closest('[data-track-play],[data-mute],[data-solo]'))return;
      suppressClick=null;
      drag={t,id:event.pointerId,startX:event.clientX+window.scrollX,startY:event.clientY+window.scrollY,clientX:event.clientX,clientY:event.clientY,x:positions[t].x,y:positions[t].y,active:false};
    });
    row.addEventListener('click',event=>{
      if(event.detail!==0&&suppressClick===t){suppressClick=null;event.preventDefault();event.stopImmediatePropagation();}
    },true);
    row.addEventListener('keydown',event=>{
      const steps={ArrowLeft:[-unit,0],ArrowRight:[unit,0],ArrowUp:[0,-unit],ArrowDown:[0,unit]};
      if(event.altKey&&steps[event.key]){
        event.preventDefault();event.stopPropagation();const [x,y]=steps[event.key];
        row.style.zIndex=++layer;place(t,positions[t].x+x,positions[t].y+y);save();
      }
    });
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    drag.clientX=event.clientX;drag.clientY=event.clientY;
    if(!drag.active&&Math.hypot(event.clientX+window.scrollX-drag.startX,event.clientY+window.scrollY-drag.startY)>=6){
      drag.active=true;rows[drag.t].setPointerCapture(drag.id);rows[drag.t].style.zIndex=++layer;
      rows[drag.t].classList.add('dragging');document.body.classList.add('moving-track');
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
