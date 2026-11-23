/* Configuração e interface da narração via ElevenLabs. A chave fica só na memória da página. */
const KEY='ev_eleven_v1';
export const MODELS=[['eleven_multilingual_v2','Multilingual v2 · melhor qualidade'],['eleven_flash_v2_5','Flash v2.5 · rápido e barato'],['eleven_turbo_v2_5','Turbo v2.5 · equilíbrio']];
export const elevenSettings={provider:'piper',key:'',voiceId:'',model:'eleven_multilingual_v2',stability:.5,similarity:.75,style:0};
try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');for(const k of['provider','voiceId','model','stability','similarity','style'])if(s[k]!==undefined)elevenSettings[k]=s[k]}catch{}
const persist=()=>{try{const{key,...rest}=elevenSettings;localStorage.setItem(KEY,JSON.stringify(rest))}catch{}};
export function mountElevenUI(anchor,toast){
 const el=document.createElement('div');el.className='eleven-box';
 el.innerHTML=`<label class="field">Motor de narração<select id="evProvider"><option value="piper">Piper · local e gratuito</option><option value="eleven">ElevenLabs · API (consome créditos)</option></select></label>
 <div id="evFields" hidden><div class="grid two compact"><label class="field">Chave API ElevenLabs<input type="password" id="evKey" placeholder="sk_…" autocomplete="off"><small>Usada só nesta sessão; não é salva.</small></label>
 <label class="field">Modelo<select id="evModel">${MODELS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label></div>
 <div class="grid two compact"><label class="field">Voz<select id="evVoiceSel"><option value="">— carregue as vozes —</option></select></label><label class="field">ou ID da voz<input id="evVoiceId" placeholder="Cole o voice_id" autocomplete="off"></label></div>
 <div class="actions"><button class="btn small" id="evLoad" type="button">↻ Carregar vozes da conta</button><small class="hint" id="evStatus">Escolha uma voz que fale português.</small></div>
 <div class="grid two compact"><label class="range-field">Estabilidade <input id="evStab" type="range" min="0" max="1" step=".05"></label><label class="range-field">Semelhança <input id="evSim" type="range" min="0" max="1" step=".05"></label><label class="range-field">Estilo <input id="evStyle" type="range" min="0" max="1" step=".05"></label></div></div>`;
 anchor.after(el);const $=s=>el.querySelector(s),voiceLabel=document.querySelector('#voice').closest('label');
 const apply=()=>{const e=elevenSettings.provider==='eleven';$('#evFields').hidden=!e;voiceLabel.style.display=e?'none':'';};
 $('#evProvider').value=elevenSettings.provider;$('#evModel').value=elevenSettings.model;$('#evVoiceId').value=elevenSettings.voiceId;$('#evStab').value=elevenSettings.stability;$('#evSim').value=elevenSettings.similarity;$('#evStyle').value=elevenSettings.style;apply();
 $('#evProvider').onchange=e=>{elevenSettings.provider=e.target.value;persist();apply()};
 $('#evKey').oninput=e=>elevenSettings.key=e.target.value.trim();
 $('#evModel').onchange=e=>{elevenSettings.model=e.target.value;persist()};
 $('#evVoiceId').oninput=e=>{elevenSettings.voiceId=e.target.value.trim();$('#evVoiceSel').value='';persist()};
 $('#evVoiceSel').onchange=e=>{if(e.target.value){elevenSettings.voiceId=e.target.value;$('#evVoiceId').value=e.target.value;persist()}};
 for(const[id,k]of[['#evStab','stability'],['#evSim','similarity'],['#evStyle','style']])$(id).oninput=e=>{elevenSettings[k]=Number(e.target.value);persist()};
 $('#evLoad').onclick=async()=>{if(!elevenSettings.key)return toast('Cole a chave da ElevenLabs primeiro.');const b=$('#evLoad');b.disabled=true;$('#evStatus').textContent='Consultando vozes…';
  try{const r=await fetch('/api/eleven/voices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:elevenSettings.key})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao listar vozes.');
   const sel=$('#evVoiceSel');sel.replaceChildren(new Option('— escolha uma voz —',''));for(const v of d.voices)sel.append(new Option(`${v.name}${v.category?' · '+v.category:''}${v.lang?' · '+v.lang:''}`,v.id));
   if(elevenSettings.voiceId)sel.value=elevenSettings.voiceId;$('#evStatus').textContent=`${d.voices.length} vozes disponíveis.`}catch(err){$('#evStatus').textContent=err.message;toast(err.message)}finally{b.disabled=false}};
}
