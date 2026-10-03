'use strict';
// Canvas playheads use the audio clock and scheduled voices, independently of track loops.
window.createMusicSweeps=function(options){
  const heads=[];let activeSignature='';
  const axis=(p,vertical)=>({start:vertical?p.y:p.x,end:vertical?p.y+p.height:p.x+p.width,cross:vertical?p.x:p.y,span:vertical?p.width:p.height});
  const coordinate=head=>head.running?head.position+Math.max(0,options.audio().ctx.currentTime-head.startedAt)*options.audio().tempo/60*options.audio().pixelsPerBeat:head.position;
  function cancelVoices(head){
    head.voices.forEach(voice=>{try{voice.source.stop();}catch{}});head.voices=[];
  }
  function geometry(head,positions){
    return positions.map((p,t)=>({...axis(p,head.vertical),t,vertical:p.vertical})).filter(p=>p.vertical===head.vertical&&p.end>head.position);
  }
  function paint(head,positions){
    const tracks=positions.filter(p=>p.vertical===head.vertical).map(p=>axis(p,head.vertical));
    const first=Math.min(head.cross,...tracks.map(p=>p.cross)),last=Math.max(head.cross+20,...tracks.map(p=>p.cross+p.span));
    const position=Math.floor(coordinate(head));
    Object.assign(head.element.style,head.vertical?{left:first+'px',top:position+'px',width:(last-first)+'px',height:'1px'}:{left:position+'px',top:first+'px',width:'1px',height:(last-first)+'px'});
    head.element.classList.toggle('paused',!head.running&&!head.loading);
  }
  function schedule(head,positions){
    cancelVoices(head);
    const {ctx,tempo,pixelsPerBeat,arrangements,gains}=options.audio(),secondsPerPixel=60/tempo/pixelsPerBeat;
    const tracks=geometry(head,positions);
    head.end=tracks.length?Math.max(...tracks.map(p=>p.end)):head.position;
    head.signature=JSON.stringify(positions);
    tracks.forEach(p=>{
      if(head.skipped.has(p.t))return;
      const from=Math.max(head.position,p.start),to=Math.min(head.end,p.end);if(to<=from)return;
      const startAt=head.startedAt+(from-head.position)*secondsPerPixel,endAt=head.startedAt+(to-head.position)*secondsPerPixel;
      const source=ctx.createBufferSource(),buffer=arrangements[p.t];source.buffer=buffer;source.loop=true;
      source.playbackRate.value=tempo/options.baseTempo;source.connect(gains[p.t]);
      // The original arrangement repeats only when the visible track is longer than it.
      source.start(startAt,((from-p.start)/pixelsPerBeat%options.totalBeats)*60/options.baseTempo);
      source.stop(endAt);source.onended=()=>source.disconnect();
      head.voices.push({t:p.t,source,startAt,endAt});
    });
  }
  function remove(head){
    head.epoch++;cancelVoices(head);head.element.remove();
    const index=heads.indexOf(head);if(index!==-1)heads.splice(index,1);
  }
  async function launch(head,resume=false){
    const token=++head.epoch;head.loading=true;head.paused=false;options.changed();
    try{
      await options.prepare();if(token!==head.epoch||!heads.includes(head))return;
      const {ctx}=options.audio();head.startedAt=options.startTime(resume);head.running=true;head.loading=false;
      schedule(head,options.positions());paint(head,options.positions());options.clearMessage();
    }catch(error){if(token===head.epoch){remove(head);options.error(error);}}
    finally{if(token===head.epoch)head.loading=false;options.changed();}
  }
  function add(x,y,vertical=false){
    const head={position:Math.max(0,Math.round((vertical?y:x)/20)*20),cross:Math.max(0,Math.round((vertical?x:y)/20)*20),vertical,startedAt:0,running:false,loading:false,paused:false,epoch:0,voices:[],skipped:new Set()};
    if(!geometry(head,options.positions()).length)return;
    const element=document.createElement('button');element.className='canvas-playhead'+(vertical?' down':'');
    element.setAttribute('aria-label',vertical?'Stop downward blue playhead':'Stop rightward blue playhead');element.title='Stop playhead';
    element.addEventListener('click',event=>{event.stopPropagation();remove(head);options.changed();});
    head.element=element;heads.push(head);options.canvas.appendChild(element);paint(head,options.positions());void launch(head);return head;
  }
  function pause(){heads.forEach(head=>{if(head.running||head.loading){head.position=coordinate(head);head.running=false;head.loading=false;head.paused=true;head.epoch++;cancelVoices(head);paint(head,options.positions());}});}
  function resume(){heads.filter(head=>head.paused).forEach(head=>void launch(head,true));}
  function stop(){heads.slice().forEach(remove);}
  function tick(positions=options.positions()){
    let finished=false;
    heads.slice().forEach(head=>{
      if(head.running){
        if(head.signature!==JSON.stringify(positions)){
          head.position=coordinate(head);head.startedAt=Math.max(options.audio().ctx.currentTime,head.startedAt);schedule(head,positions);
        }
        if(coordinate(head)>=head.end){remove(head);finished=true;return;}
      }
      paint(head,positions);
    });
    const next=positions.map((_,t)=>trackActive(t)).join(',');
    if(next!==activeSignature){activeSignature=next;finished=true;}
    if(finished)options.changed();
  }
  function trackActive(t){const now=options.audio().ctx?.currentTime;return heads.some(head=>head.running&&head.voices.some(voice=>voice.t===t&&now>=voice.startAt&&now<voice.endAt));}
  function stopTrack(t){heads.forEach(head=>{head.skipped.add(t);head.voices.filter(voice=>voice.t===t).forEach(voice=>{try{voice.source.stop();}catch{}});head.voices=head.voices.filter(voice=>voice.t!==t);});}
  function setTempo(){heads.forEach(head=>{if(head.running){head.position=coordinate(head);head.startedAt=Math.max(options.audio().ctx.currentTime,head.startedAt);}});}
  function reschedule(){heads.forEach(head=>{if(head.running)schedule(head,options.positions());});}
  return {add,tick,pause,resume,stop,stopTrack,setTempo,reschedule,trackActive,hasPlayback:()=>heads.some(head=>head.running||head.loading),hasPaused:()=>heads.some(head=>head.paused),read:()=>heads.map(head=>({direction:head.vertical?'down':'right',position:coordinate(head),end:head.end,playing:head.running,loading:head.loading}))};
};
