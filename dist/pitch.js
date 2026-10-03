'use strict';
// Shift spectral pitch without changing sample count or musical duration.
window.musicPitchBuffer=function(ctx,original,semitones){
  if(!semitones)return original;
  const size=1024,hop=256,half=size/2,ratio=2**(semitones/12),input=original.getChannelData(0),length=input.length;
  const result=ctx.createBuffer(1,length,original.sampleRate),output=result.getChannelData(0),weight=new Float32Array(length);
  const windowing=Float64Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/size));
  const re=new Float64Array(size),im=new Float64Array(size),previous=new Float64Array(half+1),phase=new Float64Array(half+1),magnitude=new Float64Array(half+1),frequency=new Float64Array(half+1);
  function fft(inverse){
    for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let span=2;span<=size;span*=2){const angle=(inverse?2:-2)*Math.PI/span,cr=Math.cos(angle),ci=Math.sin(angle);
      for(let start=0;start<size;start+=span){let wr=1,wi=0;for(let j=0;j<span/2;j++){const a=start+j,b=a+span/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}}
    if(inverse)for(let i=0;i<size;i++){re[i]/=size;im[i]/=size;}
  }
  for(let start=-size;start<length;start+=hop){
    for(let i=0;i<size;i++){re[i]=input[((start+i)%length+length)%length]*windowing[i];im[i]=0;}fft(false);magnitude.fill(0);frequency.fill(0);
    for(let k=0;k<=half;k++){
      const angle=Math.atan2(im[k],re[k]),power=Math.hypot(re[k],im[k]),expected=2*Math.PI*k*hop/size;
      let delta=angle-previous[k]-expected;previous[k]=angle;delta-=2*Math.PI*Math.round(delta/(2*Math.PI));
      const bin=k+delta*size/(2*Math.PI*hop),target=Math.round(k*ratio);
      if(target<=half){magnitude[target]+=power;frequency[target]+=power*bin*ratio;}
    }
    re.fill(0);im.fill(0);
    for(let k=0;k<=half;k++){const bin=magnitude[k]?frequency[k]/magnitude[k]:k;phase[k]+=2*Math.PI*bin*hop/size;re[k]=magnitude[k]*Math.cos(phase[k]);im[k]=magnitude[k]*Math.sin(phase[k]);if(k>0&&k<half){re[size-k]=re[k];im[size-k]=-im[k];}}
    fft(true);
    for(let i=0;i<size;i++){const index=start+i;if(index>=0&&index<length){output[index]+=re[i]*windowing[i];weight[index]+=windowing[i]**2;}}
  }
  for(let i=0;i<length;i++)output[i]=weight[i]?output[i]/weight[i]:0;
  return result;
};
