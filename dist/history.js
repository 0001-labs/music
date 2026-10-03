'use strict';
window.createMusicHistory=function({read,apply,changed}){
  const encode=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  let current=encode(read()),past=[],future=[],applying=false;
  const state=()=>({undo:past.length>0,redo:future.length>0});
  function record(){
    if(applying)return;
    const next=encode(read());if(next===current)return;
    past.push(current);if(past.length>100)past.shift();current=next;future=[];changed(state());
  }
  function restore(from,to){
    if(!from.length)return;
    const next=from.pop();to.push(current);applying=true;
    try{apply(JSON.parse(next));current=encode(read());}finally{applying=false;changed(state());}
  }
  changed(state());
  return {record,undo:()=>restore(past,future),redo:()=>restore(future,past),state,get applying(){return applying;}};
};
