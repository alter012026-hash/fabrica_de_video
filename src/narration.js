import {elevenSettings} from './eleven.js';
export async function synthesizeNarration({text,voice,rate}){
 const e=elevenSettings,eleven=e.provider==='eleven';
 if(eleven&&!e.key)throw new Error('Cole a chave API da ElevenLabs.');if(eleven&&!e.voiceId)throw new Error('Escolha ou cole o ID de uma voz da ElevenLabs.');
 const response=eleven?await fetch('/api/eleven/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:e.key,voiceId:e.voiceId,model:e.model,text,speed:rate,stability:e.stability,similarity:e.similarity,style:e.style})}):await fetch('/api/narrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice,rate})});
 if(!response.ok){let body={};try{body=await response.json()}catch{}throw new Error(body.error||`Falha na narração (HTTP ${response.status}).`)}
 return await response.blob();
}
export function audioDuration(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),audio=new Audio();audio.onloadedmetadata=()=>{const d=audio.duration;URL.revokeObjectURL(url);resolve(d)};audio.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não foi possível ler a duração do áudio.'))};audio.src=url})}
export function attachAudio(blob,which,state){const url=URL.createObjectURL(blob);if(which==='voice'){if(state.voiceUrl)URL.revokeObjectURL(state.voiceUrl);state.voiceBlob=blob;state.voiceUrl=url;state.voiceName='Narração gerada'}else{if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);state.musicBlob=blob;state.musicUrl=url}}

/* Narra cena por cena: mede a duração exata de cada fala e monta um único WAV. */
function wavBlob(pcm,sr){const b=new ArrayBuffer(44+pcm.length*2),v=new DataView(b),w=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,pcm[i]))*32767,true);return new Blob([b],{type:'audio/wav'})}
export async function narrateScenes({scenes,voice,rate,onProgress=()=>{},lead=.15,gap=.4}){
 const ac=new(window.AudioContext||window.webkitAudioContext)(),clips=[];let sr=22050;
 try{for(let i=0;i<scenes.length;i++){onProgress(i+1,scenes.length);const text=scenes[i].text.trim();
  if(!text){clips.push({pcm:new Float32Array(Math.round(sr*(Number(scenes[i].duration)||3))),start:0,end:0});continue}
  const buf=await ac.decodeAudioData(await(await synthesizeNarration({text,voice,rate})).arrayBuffer());sr=buf.sampleRate;const d=buf.getChannelData(0);let a=0,z=d.length-1;while(a<z&&Math.abs(d[a])<.012)a++;while(z>a&&Math.abs(d[z])<.012)z--;
  const from=Math.max(0,a-Math.round(sr*.03)),to=Math.min(d.length,z+Math.round(sr*.06)),L=Math.round(sr*lead),G=Math.round(sr*gap),pcm=new Float32Array(L+(to-from)+G);pcm.set(d.subarray(from,to),L);
  clips.push({pcm,start:lead+(a-from)/sr,end:lead+(z-from)/sr})}}finally{await ac.close()}
 const total=clips.reduce((x,c)=>x+c.pcm.length,0),all=new Float32Array(total);let o=0;const timings=clips.map(c=>{all.set(c.pcm,o);o+=c.pcm.length;return{duration:Math.round(c.pcm.length/sr*100)/100,start:c.start,end:c.end}});
 return{blob:wavBlob(all,sr),timings};
}
