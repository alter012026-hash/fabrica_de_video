/* Narração por cena: guarda o áudio na própria cena e deriva duração + janela de fala (usada pelas legendas). */
import {synthesizeNarration} from './narration.js';
export const AUDIO_DELAY=.15,AUDIO_TAIL=.45;
let current=null;
const toDataURL=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Não foi possível ler o áudio.'));r.readAsDataURL(blob)});
export async function analyze(blob){
 const ac=new(window.AudioContext||window.webkitAudioContext)();
 try{const buf=await ac.decodeAudioData(await blob.arrayBuffer()),d=buf.getChannelData(0),sr=buf.sampleRate,fr=Math.round(sr*.01),n=Math.floor(d.length/fr),rms=new Float32Array(n);
  for(let i=0;i<n;i++){let t=0;for(let j=0,o=i*fr;j<fr;j++){const v=d[o+j];t+=v*v}rms[i]=Math.sqrt(t/fr)}
  const sorted=Float32Array.from(rms).sort(),p90=sorted[Math.floor(n*.9)]||0,thr=Math.max(.006,p90*.1),MINGAP=15,raw=[];let cur=null,last=-1;
  for(let i=0;i<n;i++){if(rms[i]>thr){if(!cur)cur=[i,i];else cur[1]=i;last=i}else if(cur&&i-last>=MINGAP){raw.push(cur);cur=null}}if(cur)raw.push(cur);
  const voiced=raw.map(([a,z])=>[a*.01,(z+1)*.01+.02]).filter(([a,z])=>z-a>=.06);
  if(!voiced.length)voiced.push([0,buf.duration]);
  return{duration:buf.duration,start:voiced[0][0],end:Math.max(voiced[0][0]+.2,voiced[voiced.length-1][1]),voiced}}
 catch{throw new Error('Formato de áudio não suportado. Use WAV, MP3, M4A ou OGG.')}finally{await ac.close()}
}
const applyInfo=(scene,info)=>{scene.speech={start:AUDIO_DELAY+info.start,end:AUDIO_DELAY+info.end};scene.voiced=info.voiced.map(([a,z])=>[AUDIO_DELAY+a,AUDIO_DELAY+z])};
/* Reanalisa cenas antigas (sem mapa de pausas) para melhorar a sincronia das legendas. */
export async function ensureAnalysis(scenes){let changed=false;for(const sc of scenes){if(!sc.audioUrl||sc.voiced||sc._an)continue;sc._an=true;try{applyInfo(sc,await analyze(await(await fetch(sc.audioUrl)).blob()));changed=true}catch{}}return changed}
export async function attachSceneAudio(scene,blob,source='upload',name=''){
 const info=await analyze(blob);scene.audioUrl=await toDataURL(blob);scene.audioSource=source;scene.audioName=name||(source==='tts'?'Voz gerada':'Áudio enviado');scene.audioText=scene.text;scene.audioLen=info.duration;
 applyInfo(scene,info);scene.duration=Math.round((AUDIO_DELAY+info.duration+AUDIO_TAIL)*100)/100;return scene;
}
export function clearSceneAudio(scene){if(!scene)return;for(const k of['audioUrl','audioSource','audioName','audioText','audioLen','speech','voiced'])delete scene[k]}
export const isStale=s=>!!s.audioUrl&&s.audioSource==='tts'&&s.audioText!==s.text;
export async function generateForScenes(scenes,{voice,rate,onProgress=()=>{}}){
 for(let i=0;i<scenes.length;i++){onProgress(i+1,scenes.length);const blob=await synthesizeNarration({text:scenes[i].text.trim(),voice,rate});await attachSceneAudio(scenes[i],blob,'tts')}
}
export function stopSceneAudio(){if(current){current.onended=null;current.pause();current=null}}
export function playSceneAudio(scene,delay=0){stopSceneAudio();if(!scene?.audioUrl)return;const a=new Audio(scene.audioUrl);current=a;setTimeout(()=>{if(current===a)a.play().catch(()=>{})},delay*1000)}
export function playChain(scenes,fallbackUrl,done){stopSceneAudio();const urls=scenes?scenes.map(s=>s.audioUrl):[fallbackUrl];let i=0;const next=()=>{if(i>=urls.length){current=null;done();return}const a=new Audio(urls[i++]);current=a;a.onended=next;a.onerror=next;a.play().catch(next)};next()}
