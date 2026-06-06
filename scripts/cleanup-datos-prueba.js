#!/usr/bin/env node
/**
 * Limpia datos de prueba: vacía "Clientes" y "Estado de Pedidos" (Proyectos)
 * dejando SOLO los encabezados. No toca stock/estandares/historial/alertas.
 * Temp workflow: clear + re-seed headers de cada hoja, en secuencia.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const env=(()=>{const v={};for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>-1)v[t.slice(0,i).trim()]=t.slice(i+1).trim();}return v;})();
const baseUrl=(env.N8N_BASE_URL||'').replace(/\/+$/,''); const apiKey=env.N8N_API_KEY;
const DOC='1qKDeWUli8N5wVxoPx89yF9nVnq3_jdyIpJP7g_gVcOQ', CRED='LiTV16yWQFogsvNY';
const GID_CLIENTES=915059545, GID_PEDIDOS=440974926;
const H_CLI=['cliente_id','nombre','telefono','email','direccion','localidad','notas'];
const H_PRY=['proyecto_id','fecha_alta','estado','cliente_id','cliente_nombre','direccion_colocacion','clasificacion_cliente','como_nos_conocio','espacios','que_te_dijo','fecha_tentativa','notas','vendedor'];

const gs=(name,op,gid,cached,extra={})=>({parameters:{operation:op,documentId:{__rl:true,value:DOC,mode:'list'},sheetName:{__rl:true,value:gid,mode:'list',cachedResultName:cached},...extra},type:'n8n-nodes-base.googleSheets',typeVersion:4.7,position:[0,0],id:name,name,credentials:{googleSheetsOAuth2Api:{id:CRED,name:'Google Sheets OAuth2 API'}}});
const seed=(name,H)=>({parameters:{jsCode:'return [{json:'+JSON.stringify(Object.fromEntries(H.map(h=>[h,''])))+'}];'},type:'n8n-nodes-base.code',typeVersion:2,position:[0,0],id:name,name});

const wf={name:'CLEANUP datos prueba (temp)',nodes:[
  {parameters:{path:'cleanup-datos',httpMethod:'POST',responseMode:'lastNode',options:{}},type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],id:'w',name:'W',webhookId:'cleanup-datos'},
  gs('ClearCli','clear',GID_CLIENTES,'Clientes',{clear:'wholeSheet'}),
  seed('SeedCli',H_CLI),
  gs('HdrCli','append',GID_CLIENTES,'Clientes',{columns:{mappingMode:'autoMapInputData',value:{},matchingColumns:[]}}),
  gs('ClearPry','clear',GID_PEDIDOS,'Estado de Pedidos',{clear:'wholeSheet'}),
  seed('SeedPry',H_PRY),
  gs('HdrPry','append',GID_PEDIDOS,'Estado de Pedidos',{columns:{mappingMode:'autoMapInputData',value:{},matchingColumns:[]}}),
],connections:{
  'W':{main:[[{node:'ClearCli',type:'main',index:0}]]},
  'ClearCli':{main:[[{node:'SeedCli',type:'main',index:0}]]},
  'SeedCli':{main:[[{node:'HdrCli',type:'main',index:0}]]},
  'HdrCli':{main:[[{node:'ClearPry',type:'main',index:0}]]},
  'ClearPry':{main:[[{node:'SeedPry',type:'main',index:0}]]},
  'SeedPry':{main:[[{node:'HdrPry',type:'main',index:0}]]},
},settings:{executionOrder:'v1'}};

(async()=>{
  let r=await fetch(`${baseUrl}/api/v1/workflows`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify(wf)});
  if(!r.ok){console.error('✖ crear',r.status,await r.text());process.exit(1);}
  const id=JSON.parse(await r.text()).id;
  await fetch(`${baseUrl}/api/v1/workflows/${id}/activate`,{method:'POST',headers:{'X-N8N-API-KEY':apiKey}});
  await new Promise(s=>setTimeout(s,1500));
  r=await fetch(`${baseUrl}/webhook/cleanup-datos`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  console.log('exec HTTP:',r.status);
  await new Promise(s=>setTimeout(s,3000));
  r=await fetch(`${baseUrl}/api/v1/executions?workflowId=${id}&limit=1&includeData=true`,{headers:{'X-N8N-API-KEY':apiKey}});
  const e=JSON.parse(await r.text()).data[0];
  console.log('status:',e.status,'last:',e.data?.resultData?.lastNodeExecuted);
  if(e.data?.resultData?.error)console.log('ERR:',e.data.resultData.error.message);
  await fetch(`${baseUrl}/api/v1/workflows/${id}`,{method:'DELETE',headers:{'X-N8N-API-KEY':apiKey}});
  console.log('temp borrado');
})();
