'use strict';
// The canvas is a fixed square board of 64 × 64 squares. It is laid out at 20px per square and the whole
// interface is scaled by --sf to fit the window, so every viewport shows the same squares.
window.musicBoard={columns:64,rows:64,unit:20,width:1280,height:1280,scale:1,left:0,top:0};
(function(){
  const board=window.musicBoard;
  function fit(){
    // Whole-pixel squares keep grid lines and waveforms crisp.
    // One extra row is kept free above the board for the Music chip and the loop region controls.
    const square=Math.max(4,Math.floor(board.unit*Math.min(window.innerWidth/board.width,window.innerHeight/(board.height+board.unit))));
    board.scale=square/board.unit;
    board.left=Math.max(0,Math.floor((window.innerWidth-board.width*board.scale)/2));board.top=Math.max(square,Math.floor((window.innerHeight-board.height*board.scale)/2));
    const root=document.documentElement.style;root.setProperty('--sf',String(board.scale));root.setProperty('--board-width',board.width+'px');root.setProperty('--board-height',board.height+'px');root.setProperty('--board-left',board.left+'px');root.setProperty('--board-top',board.top+'px');
    // The menu is 400 board pixels wide. In the margin beside the board it never covers a square; without room it overlays the board.
    board.menuBeside=board.left>=400*board.scale;root.setProperty('--menu-left',(board.menuBeside?-400:0)+'px');
  }
  fit();window.addEventListener('resize',fit);
  // Pointer positions are handed to the app in board pixels, so its geometry never has to know the scale.
  const convert=event=>{
    if(event.rawX!==undefined)return;
    const x=event.clientX,y=event.clientY;
    Object.defineProperties(event,{rawX:{value:x},rawY:{value:y},clientX:{value:(x-board.left)/board.scale},clientY:{value:(y-board.top)/board.scale}});
  };
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','pointerleave','lostpointercapture','mousedown','mousemove','mouseup','click','dblclick','contextmenu'])window.addEventListener(type,convert,true);
})();
