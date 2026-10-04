'use strict';
// The canvas is a fixed board of 64 × 48 squares. It is laid out at 20px per square and the whole
// interface is scaled by --sf to fit the window, so every viewport shows the same squares.
window.musicBoard={columns:64,rows:48,unit:20,width:1280,height:960,menuWidth:400,scale:1,left:0,top:0,menuBeside:false};
(function(){
  const board=window.musicBoard;
  function fit(){
    const width=window.innerWidth,height=window.innerHeight,menu=board.menuWidth;
    // Whole-pixel squares keep grid lines and waveforms crisp.
    // One extra row is kept free above the board for the Music chip and the loop region controls.
    const squareFor=span=>Math.max(4,Math.floor(board.unit*Math.min(width/span,height/(board.height+board.unit))));
    const alone=squareFor(board.width),beside=squareFor(board.width+menu);
    // The menu sits left of the board, never over a square, unless making room for it would shrink the board by more than a sixth.
    board.menuBeside=beside>=alone*.85;
    const square=board.menuBeside?beside:alone,span=board.width+(board.menuBeside?menu:0);
    board.scale=square/board.unit;
    board.left=Math.max(0,Math.floor((width-span*board.scale)/2))+(board.menuBeside?menu*board.scale:0);
    board.top=Math.max(square,Math.floor((height-board.height*board.scale)/2));
    const root=document.documentElement.style;root.setProperty('--sf',String(board.scale));root.setProperty('--board-width',board.width+'px');root.setProperty('--board-height',board.height+'px');root.setProperty('--board-left',board.left+'px');root.setProperty('--board-top',board.top+'px');
    root.setProperty('--menu-left',(board.menuBeside?-menu:0)+'px');
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
