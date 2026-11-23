import {drawCaption,demoTime} from './captions.js';
export const formats={landscape:{w:1280,h:720,label:'16:9'},portrait:{w:720,h:1280,label:'9:16'},square:{w:900,h:900,label:'1:1'}};
export const getImages=s=>Array.isArray(s?.images)&&s.images.length?s.images:(s?.imageData?[{data:s.imageData,name:s.imageName||''}]:[]);
const FADE=.7;
function cover(ctx,im,w,h,k,dir,alpha){const sc=Math.max(w/im.width,h/im.height)*(1.03+k*.05),iw=im.width*sc,ih=im.height*sc,pan=(dir?1:-1)*(k-.5)*w*.025;ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,(w-iw)/2+pan,(h-ih)/2,iw,ih);ctx.restore()}
function drawImages(ctx,scene,w,h,progress,elapsed){
 const imgs=(scene._imgs&&scene._imgs.filter(Boolean).length?scene._imgs.filter(Boolean):(scene._image?[scene._image]:[]));if(!imgs.length)return;
 const n=imgs.length,dur=Math.max(1,Number(scene.duration)||5),seg=dur/n,idx=Math.min(n-1,Math.max(0,Math.floor(elapsed/seg))),local=n===1?progress:Math.min(1,Math.max(0,(elapsed-idx*seg)/seg));
 if(n>1&&idx>0){const fade=Math.min(1,(elapsed-idx*seg)/FADE);if(fade<1)cover(ctx,imgs[idx-1],w,h,1,(idx-1)%2===0,.83)}
 const a=n>1&&idx>0?Math.min(1,(elapsed-idx*seg)/FADE):1;cover(ctx,imgs[idx],w,h,local,idx%2===0,.83*a);
 const shade=ctx.createLinearGradient(0,h*.24,0,h);shade.addColorStop(0,'#060a1600');shade.addColorStop(1,'#060a16e8');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
}
const imageCache=new Map();
function loadImage(data){if(!data)return Promise.resolve(null);if(imageCache.has(data))return imageCache.get(data);const p=new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=data});imageCache.set(data,p);return p}
export async function prepareImages(scenes){await Promise.all(scenes.flatMap(s=>getImages(s).map(i=>loadImage(i.data))))}
function drawContent(ctx,scene,index,count,{width:w,height:h,progress=0,caption=true,title='Meu vídeo',elapsed=0}){
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#131937');bg.addColorStop(.55,'#222c55');bg.addColorStop(1,'#08151d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);const imgPromise=scene?.imageData?imageCache.get(scene.imageData):null;
 drawImages(ctx,scene,w,h,progress,elapsed);
 const pad=w*.065;ctx.fillStyle='#f0f3fb';ctx.globalAlpha=.88;ctx.font=`700 ${Math.max(14,w*.018)}px system-ui`;ctx.fillText(title,pad,pad*.9);ctx.globalAlpha=.75;ctx.font=`600 ${Math.max(12,w*.014)}px system-ui`;ctx.fillStyle='#c6baff';ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(count).padStart(2,'0')}`,w-pad-w*.07,pad*.9);ctx.globalAlpha=1;
 if(caption&&scene?.text){ctx.save();drawCaption(ctx,scene,elapsed,w,h);ctx.restore()}
}
function wrap(ctx,text,max,font){ctx.font=font;const lines=[];let line='';for(const word of String(text).trim().split(/\s+/)){const next=line?`${line} ${word}`:word;if(line&&ctx.measureText(next).width>max){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines}
export async function drawPreview(canvas,scene,index,count,{caption=true,title='Meu vídeo',format='landscape',elapsed=null}={}){const f=formats[format];if(canvas.width!==f.w||canvas.height!==f.h){canvas.width=f.w;canvas.height=f.h}scene._imgs=await Promise.all(getImages(scene).map(i=>loadImage(i.data)));drawContent(canvas.getContext('2d'),scene,index,count,{width:f.w,height:f.h,progress:.4,caption,title,elapsed:elapsed??demoTime(scene)})}
export function renderFrame(ctx,scene,index,scenes,elapsed,{width,height,caption=true,title='Meu vídeo',transition=true}){const duration=Math.max(1,Number(scene.duration)||5),ratio=Math.min(1,elapsed/duration),secs=transition?.55:0,type=scene.transition||'cut';
 const visual={...scene,_image:scene._preparedImage||null};
 const paint=(x=0,y=0,scale=1,alpha=1)=>{ctx.save();ctx.globalAlpha=alpha;if(scale!==1){ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.translate(-width/2,-height/2)}if(x||y)ctx.translate(x,y);drawContent(ctx,visual,index,scenes.length,{width,height,progress:ratio,caption,title,elapsed});ctx.restore()};
 const p=secs?Math.min(1,elapsed*1000/550):1,previous=index>0?scenes[index-1]:null;
 if(type==='cut'||!transition||index===0||p>=1){paint();return}
 if(previous)drawContent(ctx,{...previous,_image:previous._preparedImage||null},index-1,scenes.length,{width,height,progress:1,caption,title,elapsed:Number(previous.duration)||5});
 if(type==='fade')paint(0,0,1,p);else if(type==='slide')paint(width*(1-p),0,1,1);else if(type==='zoom')paint(0,0,1.12-.12*p,1);else if(type==='wipe'){ctx.save();ctx.beginPath();ctx.rect(0,0,width*p,height);ctx.clip();paint();ctx.restore()}else paint();
}
export async function preloadScenes(scenes){await prepareImages(scenes);for(const s of scenes){s._imgs=await Promise.all(getImages(s).map(i=>loadImage(i.data)));s._preparedImage=s._imgs[0]||null}}
