import {formats,preloadScenes,renderFrame} from './renderer.js';
const decode=async(ctx,url,label)=>{try{return await ctx.decodeAudioData(await(await fetch(url)).arrayBuffer())}catch{throw new Error(`Não foi possível ler ${label}. Gere a narração de novo ou use um arquivo WAV/MP3 válido.`)}};
/* Mixagem em um único grafo Web Audio: voz + trilha em loop com ducking automático e fade final. */
async function buildMix(scenes,{voiceUrl,musicUrl,musicVolume,total}){
 const ctx=new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();const dest=ctx.createMediaStreamDestination(),sources=[];
 const voiceBufs=[];let hasScene=false;for(const sc of scenes){if(sc.audioUrl){hasScene=true;voiceBufs.push(await decode(ctx,sc.audioUrl,'a narração de uma cena'))}else voiceBufs.push(null)}
 const voice=hasScene?true:(voiceUrl?await decode(ctx,voiceUrl,'a narração'):null),music=musicUrl?await decode(ctx,musicUrl,'a música de fundo'):null;
 if(hasScene){voiceBufs.forEach((b,i)=>{if(!b)return;const s=ctx.createBufferSource();s.buffer=b;s.connect(dest);s.offset=scenes.slice(0,i).reduce((a,x)=>a+Math.max(1,Number(x.duration)||5),0)+.15;sources.push(s)})}else if(voice){const s=ctx.createBufferSource();s.buffer=voice;s.connect(dest);sources.push(s)}
 if(music){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=music;s.loop=true;s.connect(g);g.connect(dest);sources.push(s);
  const base=Math.max(0,Math.min(1,Number(musicVolume)/100)),duck=base*.3,mid=voice?base*.6:base,timed=scenes.some(x=>x.speech);g.gain.value=voice&&!timed?duck:mid;
  sources.plan=at=>{g.gain.cancelScheduledValues(at);g.gain.setValueAtTime(voice&&!timed?duck:mid,at);let off=0;
   if(voice&&timed)for(const sc of scenes){if(sc.speech){g.gain.setTargetAtTime(duck,Math.max(at,at+off+sc.speech.start-.2),.2);g.gain.setTargetAtTime(mid,at+off+sc.speech.end+.1,.35)}off+=Number(sc.duration)||5}
   g.gain.setTargetAtTime(0,at+Math.max(0,total-2),.6)}}
 return{ctx,dest,sources,hasVoice:!!voice,hasMusic:!!music,voiceLen:hasScene?0:(voice&&voice!==true?voice.duration:0)};
}
export async function exportVideo({scenes,canvas,format,title,caption,quality,voiceUrl,musicUrl,musicVolume,onProgress}){
 if(!scenes.length)throw new Error('Adicione pelo menos uma cena.');if(!window.MediaRecorder||!canvas.captureStream)throw new Error('Use uma versão atual do Chrome ou Edge para exportar.');
 await preloadScenes(scenes);const f=formats[format],height=Number(quality),scale=height/f.h,w=Math.round(f.w*scale),h=Math.round(f.h*scale);canvas.width=w;canvas.height=h;
 const total=scenes.reduce((a,s)=>a+Math.max(1,Number(s.duration)||5),0),stream=canvas.captureStream(30);let mix=null;
 try{if(voiceUrl||musicUrl||scenes.some(x=>x.audioUrl)){mix=await buildMix(scenes,{voiceUrl,musicUrl,musicVolume,total});mix.dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t))}}
 catch(err){stream.getTracks().forEach(t=>t.stop());if(mix?.ctx)await mix.ctx.close();throw err}
 const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
 const recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:height>=1080?7000000:4500000,audioBitsPerSecond:192000}),chunks=[];
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const stopped=new Promise(r=>recorder.onstop=r);
 try{recorder.start(250);const lead=.15,at=mix?mix.ctx.currentTime+lead:0;if(mix){mix.sources.forEach(s=>s.start(at+(s.offset||0)));mix.sources.plan?.(at)}
  const t0=performance.now()+lead*1000;let acc=0;
  for(let i=0;i<scenes.length;i++){const scene=scenes[i],dur=Math.max(1,Number(scene.duration)||5)*1000,base=t0+acc;
   await new Promise(res=>{const step=now=>{const t=now-base;renderFrame(canvas.getContext('2d'),scene,i,scenes,Math.max(0,t)/1000,{width:w,height:h,caption,title,transition:true});onProgress(Math.min(99,Math.max(0,Math.round((acc+t)/1000/total*100))),`Renderizando cena ${i+1}/${scenes.length}`);if(t<dur)requestAnimationFrame(step);else res()};requestAnimationFrame(step)});acc+=dur}
  await new Promise(r=>setTimeout(r,250));recorder.stop();await stopped;
  return{blob:new Blob(chunks,{type:recorder.mimeType||'video/webm'}),hasVoice:!!mix?.hasVoice,hasMusic:!!mix?.hasMusic,voiceLen:mix?.voiceLen||0,total};
 }finally{try{mix?.sources.forEach(s=>{try{s.stop()}catch{}})}catch{}stream.getTracks().forEach(t=>t.stop());if(mix?.ctx)await mix.ctx.close()}
}
/* Regrava o contêiner com ffmpeg (se instalado) para incluir duração e permitir avançar/voltar no player. */
export async function finalizeWebm(blob){try{const r=await fetch('/api/finalize',{method:'POST',body:blob});return r.ok?await r.blob():blob}catch{return blob}}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000)}
