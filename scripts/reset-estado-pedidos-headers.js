#!/usr/bin/env node
/**
 * Resetea la hoja "Estado de Pedidos" al esquema Etapa 1 (Proyectos).
 * Reutiliza el tab existente (NO crea uno nuevo). Limpia data vieja de prueba
 * y escribe los headers nuevos vía clear + append autoMap.
 *
 * Nuevo esquema:
 *   proyecto_id, fecha_alta, estado, nombre, apellidos, telefono, email,
 *   direccion_colocacion, clasificacion_cliente, como_nos_conocio, espacios,
 *   que_te_dijo, fecha_tentativa, notas, vendedor
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const env = (() => { const v={}; for (const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>-1)v[t.slice(0,i).trim()]=t.slice(i+1).trim();} return v; })();
const baseUrl=(env.N8N_BASE_URL||'').replace(/\/+$/,''); const apiKey=env.N8N_API_KEY||'';
const DOC='1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ';
const CRED='LiTV16yWQFogsvNY';
const GID_PEDIDOS=440974926; // Estado de Pedidos
const HEADERS=['proyecto_id','fecha_alta','estado','cliente_id','cliente_nombre','direccion_colocacion','clasificacion_cliente','como_nos_conocio','espacios','que_te_dijo','fecha_tentativa','notas','vendedor'];

const wf={
  name:'RESET Estado de Pedidos (temporal)',
  nodes:[
    {parameters:{path:'reset-ep',httpMethod:'POST',responseMode:'lastNode',options:{}},type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],id:'r1',name:'Webhook',webhookId:'reset-ep'},
    {parameters:{operation:'clear',documentId:{__rl:true,value:DOC,mode:'list'},sheetName:{__rl:true,value:GID_PEDIDOS,mode:'list',cachedResultName:'Estado de Pedidos'},clear:'wholeSheet',options:{}},type:'n8n-nodes-base.googleSheets',typeVersion:4.7,position:[220,0],id:'r2',name:'Limpiar',credentials:{googleSheetsOAuth2Api:{id:CRED,name:'Google Sheets OAuth2 API'}}},
    {parameters:{jsCode:'return [{ json: '+JSON.stringify(Object.fromEntries(HEADERS.map(h=>[h,''])))+' }];'},type:'n8n-nodes-base.code',typeVersion:2,position:[440,0],id:'r3',name:'Seed'},
    {parameters:{operation:'append',documentId:{__rl:true,value:DOC,mode:'list'},sheetName:{__rl:true,value:GID_PEDIDOS,mode:'list',cachedResultName:'Estado de Pedidos'},columns:{mappingMode:'autoMapInputData',value:{},matchingColumns:[]},options:{}},type:'n8n-nodes-base.googleSheets',typeVersion:4.7,position:[660,0],id:'r4',name:'Headers',credentials:{googleSheetsOAuth2Api:{id:CRED,name:'Google Sheets OAuth2 API'}}},
  ],
  connections:{'Webhook':{main:[[{node:'Limpiar',type:'main',index:0}]]},'Limpiar':{main:[[{node:'Seed',type:'main',index:0}]]},'Seed':{main:[[{node:'Headers',type:'main',index:0}]]}},
  settings:{executionOrder:'v1'},
};
(async()=>{
  let res=await fetch(`${baseUrl}/api/v1/workflows`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify(wf)});
  if(!res.ok){console.error('✖ crear',res.status,await res.text());process.exit(1);}
  const id=JSON.parse(await res.text()).id;
  await fetch(`${baseUrl}/api/v1/workflows/${id}/activate`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('wf temp:',id);
  await new Promise(r=>setTimeout(r,1500));
  res=await fetch(`${baseUrl}/webhook/reset-ep`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  console.log('exec HTTP:',res.status,(await res.text()).slice(0,150));
  await new Promise(r=>setTimeout(r,2500));
  res=await fetch(`${baseUrl}/api/v1/workflows/${id}`,{method:'DELETE',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('wf temp borrado:',res.status);
})();
