#!/usr/bin/env node
/**
 * Borra el tab "Proyectos" (sheetId 1995845138) que se había creado por error.
 * El usuario aclaró: NO tab nuevo, se reutiliza "Estado de Pedidos".
 * Crea un wf temporal con Google Sheets resource=sheet operation=remove, lo
 * ejecuta una vez y se borra solo.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const env = (() => { const v={}; for (const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>-1)v[t.slice(0,i).trim()]=t.slice(i+1).trim();} return v; })();
const baseUrl=(env.N8N_BASE_URL||'').replace(/\/+$/,''); const apiKey=env.N8N_API_KEY||'';
const SHEET_DOC_ID='1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const SHEETS_CRED_ID='LiTV16yWQFogsvNY';

const wf={
  name:'CLEANUP del Proyectos (temporal)',
  nodes:[
    {parameters:{path:'cleanup-proyectos',httpMethod:'POST',responseMode:'lastNode',options:{}},type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],id:'c1',name:'Webhook',webhookId:'cleanup-proyectos'},
    {parameters:{resource:'sheet',operation:'remove',documentId:{__rl:true,value:SHEET_DOC_ID,mode:'list'},sheetName:{__rl:true,value:1995845138,mode:'list',cachedResultName:'Proyectos'}},type:'n8n-nodes-base.googleSheets',typeVersion:4.7,position:[220,0],id:'c2',name:'Borrar Hoja',credentials:{googleSheetsOAuth2Api:{id:SHEETS_CRED_ID,name:'Google Sheets OAuth2 API'}}},
  ],
  connections:{'Webhook':{main:[[{node:'Borrar Hoja',type:'main',index:0}]]}},
  settings:{executionOrder:'v1'},
};
(async()=>{
  let res=await fetch(`${baseUrl}/api/v1/workflows`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify(wf)});
  if(!res.ok){console.error('✖ crear',res.status,await res.text());process.exit(1);}
  const id=JSON.parse(await res.text()).id;
  await fetch(`${baseUrl}/api/v1/workflows/${id}/activate`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('wf temp:',id);
  await new Promise(r=>setTimeout(r,1500));
  res=await fetch(`${baseUrl}/webhook/cleanup-proyectos`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  console.log('exec HTTP:',res.status, (await res.text()).slice(0,200));
  await new Promise(r=>setTimeout(r,2000));
  res=await fetch(`${baseUrl}/api/v1/workflows/${id}`,{method:'DELETE',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('wf temp borrado:',res.status);
})();
