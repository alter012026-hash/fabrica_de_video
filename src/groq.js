export async function generateStoryboard({apiKey,model,idea,audience,tone,format}){
  const response=await fetch('/api/script',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey,model,idea,audience,tone,format})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Groq respondeu com erro HTTP ${response.status}.`);
  let content=data.content||'';content=content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  let parsed;try{parsed=JSON.parse(content)}catch{const first=content.indexOf('{'),last=content.lastIndexOf('}');if(first<0||last<first)throw new Error('A Groq não retornou um roteiro estruturado. Tente novamente.');parsed=JSON.parse(content.slice(first,last+1))}
  if(!Array.isArray(parsed.scenes)||!parsed.scenes.length)throw new Error('O roteiro retornado não contém cenas.');return parsed;
}

export async function generateImagePrompts({apiKey,model,style,scenes}){
 const response=await fetch('/api/image-prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey,model,style,scenes})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Groq respondeu com erro HTTP ${response.status}.`);
 let content=data.content||'';content=content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();let parsed;try{parsed=JSON.parse(content)}catch{const first=content.indexOf('{'),last=content.lastIndexOf('}');if(first<0||last<first)throw new Error('A Groq não retornou prompts estruturados.');parsed=JSON.parse(content.slice(first,last+1))}if(!Array.isArray(parsed.prompts))throw new Error('A resposta não contém a lista de prompts.');return parsed.prompts;
}
