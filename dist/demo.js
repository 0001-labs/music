'use strict';
// The arrangement shown on a first visit and restored by Reset: two four-bar sections under one region loop.
window.MUSIC_DEMO=(function(){
  const track=(x,y,width,height,beats)=>({x,y,width,height,deleted:false,beats});
  // Kick, Snare, Hats, Bass, Keys, Air, Pulse, Piano.
  const positions=[track(0,120,1280,40,32),track(640,200,640,40,16),track(0,160,1280,40,32),track(0,240,1280,80,32),track(640,320,640,80,16),track(0,440,1280,40,32),track(0,600,640,40,16),track(0,320,640,80,16)];
  const settings={tempo:112,colors:['red','orange','yellow','blue','pink','light-blue','green','white'],pitches:[0,0,0,0,0,0,0,0],muted:Array(8).fill(false),solo:Array(8).fill(false)};
  const sample=(id,name,x,color)=>({id:'demo-'+id,name,color,x,y:480,width:640,height:80,beats:16,muted:false,solo:false,opened:false,sourceSlice:{sample:id,offset:0,beats:16,loopBeats:16},
    data:{format:'music-arrangement',version:1,name:'Arrangement',state:{...settings,positions:positions.map(p=>({...p,deleted:true})),regions:[]}}});
  return {format:'music-arrangement',version:1,name:'Demo',state:{...settings,positions,blocks:[sample('choir-ah','Choir Ah',0,'light-blue'),sample('strings','Strings',640,'pink')],regions:[{direction:'right',start:0,end:1280,cross:80}]}};
})();
