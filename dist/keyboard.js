'use strict';
// Keyboard selection across tracks and placed clips.
//   Shift+Arrow   extend the selection to the nearest clip that way; the opposite arrow takes it back
//   Arrow         with nothing selected, select a clip (the focused one, else the first or last)
//   Command-A     select every clip        Escape  clear the selection
// Moving (plain arrows) and deleting act on the whole selection; those live with the tracks and clips.
window.createMusicKeyboard=function({layout,blocks,rows}){
  const DIRECTIONS={ArrowRight:'right',ArrowLeft:'left',ArrowDown:'down',ArrowUp:'up'};
  const OPPOSITE={right:'left',left:'right',down:'up',up:'down'};
  let trail=[],focus=null;

  const clips=()=>[
    ...layout.getPositions().flatMap((p,t)=>p.deleted?[]:[{key:'t'+t,x:p.x,y:p.y,width:p.width,height:p.height,element:rows[t]}]),
    ...blocks.list().map(b=>({key:'b'+b.id,x:b.x,y:b.y,width:b.width,height:b.height,element:b.element}))
  ];
  const chosen=()=>new Set([...layout.getSelection().map(t=>'t'+t),...blocks.selection().map(id=>'b'+id)]);
  function apply(keys){
    layout.setSelection([...keys].filter(k=>k[0]==='t').map(k=>Number(k.slice(1))));
    blocks.setSelection([...keys].filter(k=>k[0]==='b').map(k=>k.slice(1)));
  }
  const readingOrder=list=>[...list].sort((a,b)=>a.y-b.y||a.x-b.x);

  // The distance between two ranges along one axis; zero when they overlap.
  const gap=(a,aEnd,b,bEnd)=>Math.max(0,b-aEnd,a-bEnd);
  // The nearest clip in a direction: close along the way, and lined up across it.
  function neighbour(from,direction,pool){
    const horizontal=direction==='left'||direction==='right',sign=direction==='right'||direction==='down'?1:-1;
    const centre=c=>horizontal?c.x+c.width/2:c.y+c.height/2;
    let best=null,bestScore=Infinity;
    for(const c of pool){
      if(c.key===from.key||(centre(c)-centre(from))*sign<=0)continue;
      const along=horizontal?gap(from.x,from.x+from.width,c.x,c.x+c.width):gap(from.y,from.y+from.height,c.y,c.y+c.height);
      const across=horizontal?gap(from.y,from.y+from.height,c.y,c.y+c.height):gap(from.x,from.x+from.width,c.x,c.x+c.width);
      const score=along+2*across+Math.abs(centre(c)-centre(from))*.001;
      if(score<bestScore){best=c;bestScore=score;}
    }
    return best;
  }

  function extend(direction,target,grow=true){
    const all=clips(),byKey=new Map(all.map(c=>[c.key,c])),now=chosen();
    if(!now.size){
      const start=all.find(c=>c.element&&target?.closest&&c.element===target.closest('.track-surface,.arrangement-block'));
      if(!start){const ordered=readingOrder(all),first=direction==='right'||direction==='down'?ordered[0]:ordered.at(-1);if(first){apply([first.key]);focus=first.key;trail=[];}return;}
      apply([start.key]);now.add(start.key);focus=start.key;trail=[];
      if(!grow)return;
    }
    if(!focus||!now.has(focus)||!byKey.has(focus)){focus=[...now].filter(k=>byKey.has(k)).at(-1)||null;trail=[];}
    if(!focus)return;
    trail=trail.filter(step=>now.has(step.key));
    const last=trail.at(-1);
    // Going back the way the selection grew gives up the clip it last reached.
    if(last&&last.key===focus&&last.direction===OPPOSITE[direction]){now.delete(focus);focus=last.from;trail.pop();apply(now);return;}
    const next=neighbour(byKey.get(focus),direction,all.filter(c=>!now.has(c.key)));
    if(!next)return;
    now.add(next.key);trail.push({key:next.key,from:focus,direction});focus=next.key;apply(now);
  }

  // Keys belong to the board only when nothing else has the focus: not a field, a menu, a handle or a transport control.
  function onBoard(target){
    if(!target||target===document.body||target===document.documentElement||target.id==='canvas')return true;
    if(target.matches?.('.track-surface,.arrangement-block'))return true;
    // A track's own play, mute and solo buttons and the Music chip keep the focus after a click; the arrows still belong to the board.
    return !!target.matches?.('[data-track-play],[data-mute],[data-solo],.music-header');
  }

  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||!onBoard(event.target))return;
    const command=(event.metaKey||event.ctrlKey)&&!event.altKey;
    if(command&&!event.shiftKey&&event.key.toLowerCase()==='a'){
      event.preventDefault();event.stopPropagation();
      apply(clips().map(c=>c.key));trail=[];focus=null;return;
    }
    const direction=DIRECTIONS[event.key];
    if(!direction||event.altKey||event.metaKey||event.ctrlKey)return;
    if(event.shiftKey){event.preventDefault();event.stopPropagation();extend(direction,event.target);return;}
    if(!chosen().size){
      // Nothing selected yet: an arrow picks the clip it points toward instead of doing nothing.
      event.preventDefault();event.stopPropagation();extend(direction,event.target,false);return;
    }
    // Clips are moved by their own handlers when focused; with the focus elsewhere, move the selected clips here.
    const [dx,dy]={right:[1,0],left:[-1,0],down:[0,1],up:[0,-1]}[direction];
    if(blocks.selection().length&&!event.target.closest?.('.arrangement-block')){
      blocks.nudge(dx,dy);
      if(!layout.getSelection().length)event.preventDefault();
    }
  },true);

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.defaultPrevented&&onBoard(event.target)){blocks.setSelection([]);trail=[];focus=null;}
  });
};
