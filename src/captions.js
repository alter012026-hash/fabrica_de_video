/* Motor de legendas: tempo por palavra, páginas, animações e estilo configurável. */
const KEY='ev_caption_style_v1';
export const FONTS={'Sistema (Segoe/Inter)':'system-ui,"Segoe UI",sans-serif','Impact (viral)':'Impact,"Arial Black",sans-serif','Arial Black':'"Arial Black",Arial,sans-serif','Georgia (cinema)':'Georgia,"Times New Roman",serif','Trebuchet':'"Trebuchet MS",sans-serif','Verdana':'Verdana,sans-serif','Courier (máquina)':'"Courier New",monospace'};
export const PRESETS={
 'Clássico':{font:FONTS['Sistema (Segoe/Inter)'],sizePct:4.6,weight:700,upper:false,color:'#ffffff',hi:'#ffffff',dim:1,stroke:'#000000',strokeW:0,box:'solid',boxColor:'#070b13',boxAlpha:.78,anim:'fade',pos:'bottom',maxWords:9,maxLines:2},
 'Karaokê':{font:FONTS['Sistema (Segoe/Inter)'],sizePct:5,weight:800,upper:false,color:'#ffffff',hi:'#4de0bd',dim:.55,stroke:'#000000',strokeW:4,box:'none',boxColor:'#000000',boxAlpha:.5,anim:'karaoke',pos:'bottom',maxWords:6,maxLines:2},
 'Viral':{font:FONTS['Impact (viral)'],sizePct:7,weight:900,upper:true,color:'#ffffff',hi:'#ffe14d',dim:1,stroke:'#000000',strokeW:8,box:'none',boxColor:'#000000',boxAlpha:.5,anim:'pop',pos:'middle',maxWords:3,maxLines:2},
 'Cinema':{font:FONTS['Georgia (cinema)'],sizePct:4.2,weight:600,upper:false,color:'#f3ecd8',hi:'#f3ecd8',dim:1,stroke:'#000000',strokeW:3,box:'none',boxColor:'#000000',boxAlpha:.5,anim:'fade',pos:'bottom',maxWords:8,maxLines:2},
 'Máquina':{font:FONTS['Courier (máquina)'],sizePct:4.4,weight:700,upper:false,color:'#9dffb0',hi:'#ffffff',dim:1,stroke:'#001a08',strokeW:3,box:'solid',boxColor:'#02130a',boxAlpha:.8,anim:'typewriter',pos:'bottom',maxWords:7,maxLines:2}
};
export const config={...PRESETS['Karaokê'],syncMs:40};
try{Object.assign(config,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(config))}catch{}};

/* ---------- Linha do tempo ---------- */
const pause=w=>/[.!?…]$/.test(w)?7:/[:;]$/.test(w)?4:/[,—–)]$/.test(w)?3:0;
const syl=w=>{const t=w.toLowerCase(),g=(t.match(/[aeiouáéíóúâêôãõàüy]+/g)||[]).length,d=(t.match(/\d/g)||[]).length;return Math.max(1,g+d*1.2)+t.replace(/[^\p{L}\p{N}]/gu,'').length*.22};
/* Alinhamento: distribui as palavras pelo tempo VOZEADO real do áudio e ancora as vírgulas/pontos nas pausas detectadas. */
export function alignWords(raw,voiced){
 const wt=raw.map(syl),W=wt.reduce((a,b)=>a+b,0)||1,segs=voiced.map(([s,e])=>({s,e})),V=segs.reduce((a,x)=>a+x.e-x.s,0)||1;
 const toReal=(v,start)=>{let acc=0;for(const g of segs){const L=g.e-g.s;if(start?v<acc+L-1e-9:v<=acc+L+1e-9)return g.s+Math.max(0,v-acc);acc+=L}return segs[segs.length-1].e};
 const bounds=[];let cum=0;raw.forEach((w,i)=>{cum+=wt[i];if(i<raw.length-1&&/[.,;:!?…—]$/.test(w))bounds.push(cum/W)});
 const pauses=[];let acc=0;for(let i=0;i<segs.length-1;i++){acc+=segs[i].e-segs[i].s;pauses.push(acc/V)}
 const anchors=[[0,0]];let pi=0;
 for(const b of bounds){let best=-1,bd=.07;for(let j=pi;j<pauses.length;j++){const d=Math.abs(pauses[j]-b);if(d<bd){bd=d;best=j}if(pauses[j]>b+.07)break}if(best>=0){anchors.push([b,pauses[best]]);pi=best+1}}
 anchors.push([1,1]);
 const map=f=>{for(let i=1;i<anchors.length;i++){const[a0,v0]=anchors[i-1],[a1,v1]=anchors[i];if(f<=a1+1e-9)return v0+(v1-v0)*((f-a0)/Math.max(1e-9,a1-a0))}return 1};
 let c=0;return raw.map(()=>0).map((_,i)=>{const f0=c/W;c+=wt[i];const f1=c/W,s=toReal(map(f0)*V,true);return{s,e:Math.max(s+.05,toReal(map(f1)*V,false))}});
}
const cache=new WeakMap();
export function buildTimeline(scene){
 const text=String(scene.text||'').trim(),dur=Math.max(1,Number(scene.duration)||5),vo=Array.isArray(scene.voiced)&&scene.voiced.length?scene.voiced:null;
 const sp=scene.speech&&scene.speech.end>scene.speech.start?scene.speech:{start:Math.min(.2,dur*.05),end:Math.max(dur*.6,dur-.3)};
 const key=`${text}|${dur}|${sp.start}|${sp.end}|${vo?vo.length+':'+vo[0][0]:0}|${config.maxWords}`,c=cache.get(scene);if(c&&c.key===key)return c;
 const raw=text.split(/\s+/).filter(Boolean);let words;
 if(vo&&raw.length)words=alignWords(raw,vo).map((x,i)=>({t:raw[i],s:x.s,e:x.e}));
 else{const wl=raw.map(w=>Math.max(2,w.replace(/[^\p{L}\p{N}]/gu,'').length)),pw=raw.map(pause),total=wl.reduce((a,b)=>a+b,0)+pw.reduce((a,b)=>a+b,0)||1,span=sp.end-sp.start;let acc=0;
  words=raw.map((t,i)=>{const s=sp.start+span*acc/total;acc+=wl[i];const e=sp.start+span*acc/total;acc+=pw[i];return{t,s,e}})}
 const pages=[];let cur=[];const flush=()=>{if(cur.length){pages.push({words:cur});cur=[]}};
 words.forEach(w=>{cur.push(w);const strong=/[.!?…]$/.test(w.t),soft=/[,;:]$/.test(w.t);if(cur.length>=config.maxWords||strong||(soft&&cur.length>=Math.ceil(config.maxWords*.6)))flush()});flush();
 pages.forEach((p,i)=>{const last=p.words[p.words.length-1];p.start=Math.max(0,p.words[0].s-.06);p.end=i<pages.length-1?Math.min(pages[i+1].words[0].s-.02,last.e+.6):Math.min(dur,Math.max(last.e,sp.end)+.35)});
 const out={key,words,pages};cache.set(scene,out);return out;
}
export const demoTime=scene=>{const tl=buildTimeline(scene),w=tl.words[Math.min(tl.words.length-1,Math.floor(tl.words.length*.35))];return w?(w.s+w.e)/2:0};

/* ---------- Desenho ---------- */
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),easeBack=t=>{const c=1.9;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2)};
function layout(ctx,page,maxW,size){
 const f=`${config.weight} ${size}px ${config.font}`;ctx.font=f;const sp=ctx.measureText(' ').width,lines=[];let line=[],lw=0;
 for(const w of page.words){const txt=config.upper?w.t.toUpperCase():w.t,width=ctx.measureText(txt).width;if(line.length&&lw+sp+width>maxW){lines.push({items:line,w:lw});line=[];lw=0}line.push({w,txt,width});lw+=(line.length>1?sp:0)+width}
 if(line.length)lines.push({items:line,w:lw});return{lines,sp,f};
}
export function drawCaption(ctx,scene,t,W,H){
 const tl=buildTimeline(scene);if(!tl.pages.length)return;
 t+=(config.syncMs||0)/1000;const page=tl.pages.find(p=>t>=p.start&&t<=p.end+.0001)||null;if(!page)return;
 const size=Math.max(18,W*config.sizePct/100),maxW=W*.86,{lines,sp,f}=layout(ctx,page,maxW,size),lh=size*1.25;
 const boxH=lines.length*lh,mg=H*.075;let top=config.pos==='top'?mg+size*.4:config.pos==='middle'?(H-boxH)/2:H-mg-boxH-size*.3;
 const a=config.anim,tin=clamp((t-page.start)/.18),tout=clamp((page.end-t)/.15);
 let alpha=a==='fade'||a==='classic'?Math.min(tin,tout):Math.min(1,tout*1.5),slide=a==='fade'?(1-tin)*size*.5:0;
 ctx.save();ctx.globalAlpha*=alpha;ctx.textBaseline='top';ctx.textAlign='left';ctx.lineJoin='round';ctx.font=f;
 const bw=Math.max(...lines.map(l=>l.w)),pad=size*.45;
 if(config.box!=='none'){ctx.fillStyle=hexA(config.boxColor,config.boxAlpha);ctx.beginPath();ctx.roundRect((W-bw)/2-pad,top+slide-pad*.5,bw+pad*2,boxH+pad*.7,config.box==='pill'?(boxH+pad)/2:size*.28);ctx.fill()}
 lines.forEach((ln,li)=>{let x=(W-ln.w)/2;const y=top+slide+li*lh;
  for(const it of ln.items){const w=it.w,active=t>=w.s&&t<w.e+.04,spoken=t>=w.e;let scale=1,col=config.color,al=1,txt=it.txt;
   if(a==='karaoke'){al=spoken||active?1:config.dim;if(active){col=config.hi;scale=1.1}}
   else if(a==='pop'){const k=clamp((t-w.s)/.2);if(t<w.s)al=0;scale=.55+.45*easeBack(k)+(active?.06:0);if(active)col=config.hi}
   else if(a==='typewriter'){const k=clamp((t-w.s)/Math.max(.05,w.e-w.s));txt=it.txt.slice(0,Math.ceil(it.txt.length*k));if(t<w.s)al=0;if(active)col=config.hi}
   else if(config.hi!==config.color&&active)col=config.hi;
   if(al>0&&txt){ctx.save();ctx.globalAlpha*=al;ctx.translate(x+it.width/2,y+size/2);ctx.scale(scale,scale);ctx.translate(-it.width/2,-size/2);
    if(config.strokeW>0){ctx.strokeStyle=config.stroke;ctx.lineWidth=config.strokeW*(W/1280)*2;ctx.strokeText(txt,0,0)}
    ctx.fillStyle=col;ctx.fillText(txt,0,0);ctx.restore()}
   x+=it.width+sp}});
 ctx.restore();
}
const hexA=(h,a)=>{const n=parseInt(h.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};

/* ---------- Interface ---------- */
export function mountCaptionUI(host,onChange){
 const sel=(id,label,opts)=>`<label class="field">${label}<select id="${id}">${opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>`;
 const num=(id,label,min,max,step)=>`<label class="field">${label}<input id="${id}" type="number" min="${min}" max="${max}" step="${step}"></label>`;
 const col=(id,label)=>`<label class="field">${label}<input id="${id}" type="color" style="height:38px;padding:2px"></label>`;
 const el=document.createElement('section');el.className='panel caption-panel';
 el.innerHTML=`<div class="panel-heading"><div><div><h2>Legendas animadas</h2><p>Sincronizadas palavra por palavra com a narração. Suas escolhas ficam salvas.</p></div></div><span class="tag green">MOTOR v1</span></div>
 <div class="cap-presets">${Object.keys(PRESETS).map(n=>`<button class="btn small" data-preset="${n}">${n}</button>`).join('')}</div>
 <div class="grid two" style="margin-top:12px">${sel('cpFont','Fonte',Object.keys(FONTS).map(l=>[l,l]))}${sel('cpAnim','Animação',[['karaoke','Karaokê (destaca a palavra)'],['pop','Pop palavra a palavra'],['typewriter','Máquina de escrever'],['fade','Aparece e some'],['classic','Estática']])}
 ${num('cpSize','Tamanho (% da largura)',2,12,.2)}${num('cpMax','Palavras por bloco',2,14,1)}${sel('cpPos','Posição',[['bottom','Embaixo'],['middle','Centro'],['top','Topo']])}${sel('cpWeight','Peso',[[400,'Normal'],[600,'Semi'],[700,'Negrito'],[900,'Extra']])}
 ${col('cpColor','Cor do texto')}${col('cpHi','Cor do destaque')}${col('cpStroke','Cor do contorno')}${num('cpStrokeW','Contorno (px)',0,14,1)}
 ${sel('cpBox','Fundo',[['none','Sem fundo'],['solid','Caixa'],['pill','Cápsula']])}${col('cpBoxColor','Cor do fundo')}${num('cpBoxAlpha','Opacidade do fundo (0–1)',0,1,.05)}${sel('cpUpper','Caixa alta',[['0','Não'],['1','Sim']])}${num('cpSync','Antecipar legenda (ms) · ajuste fino',-300,400,10)}</div>`;
 // Keep the export card beside the preview. Inserting captions before it
 // made the export card a third grid item and pushed it below the fold.
 host.after(el);
 const map={cpFont:'font',cpAnim:'anim',cpSize:'sizePct',cpMax:'maxWords',cpPos:'pos',cpWeight:'weight',cpColor:'color',cpHi:'hi',cpStroke:'stroke',cpStrokeW:'strokeW',cpBox:'box',cpBoxColor:'boxColor',cpBoxAlpha:'boxAlpha',cpUpper:'upper',cpSync:'syncMs'};
 const fill=()=>{for(const[id,k]of Object.entries(map)){const e=el.querySelector('#'+id);e.value=k==='upper'?(config.upper?'1':'0'):k==='font'?(Object.keys(FONTS).find(l=>FONTS[l]===config.font)||Object.keys(FONTS)[0]):config[k]}};
 const numeric=new Set(['sizePct','maxWords','weight','strokeW','boxAlpha','syncMs']);
 for(const[id,k]of Object.entries(map))el.querySelector('#'+id).addEventListener('input',e=>{let v=e.target.value;config[k]=k==='upper'?v==='1':k==='font'?FONTS[v]:numeric.has(k)?Number(v):v;save();onChange()});
 el.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{Object.assign(config,PRESETS[b.dataset.preset]);save();fill();onChange()});
 fill();return el;
}
