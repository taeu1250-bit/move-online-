// Loopback-only QA harness. This file is not part of the deployed Worker.
import {createServer} from 'vite'
import {mkdir,writeFile} from 'node:fs/promises'
import {testRuntime,migrateLocal} from './local-runtime.mjs'
import {execute,snapshot} from '../server/store.mjs'
import {teamCommand} from '../server/teams.mjs'
import {policyVersion} from '../src/domain/feedback.ts'
const mf=testRuntime(),db=await migrateLocal(mf),env={MOOV_ADMIN_UIDS:'["qa-host"]'},H=3600000
const q=(s,...a)=>db.prepare(s).bind(...a)
const people=[['qa-host','김태우'],['qa-a','윤여은'],['qa-b','김시웅'],['qa-c','복희수']]
for(const [uid,name] of people)await db.batch([q("INSERT INTO profiles(id,name,year,dept,levels) VALUES(?,?,2024,'미래융합학부','{}')",uid,name),q('INSERT INTO policy_consents(id,userId,version,at) VALUES(?,?,?,?)',crypto.randomUUID(),uid,policyVersion,new Date().toISOString())])
for(const [uid,name] of [people[0],people[1]])await teamCommand(db,uid,{type:'team.create',id:crypto.randomUUID(),fields:{name:uid==='qa-host'?'바구니':'함께 농구',sport:'농구',affiliation:'연세대학교 미래캠퍼스',bio:''},guests:[]},env)
const mid=crypto.randomUUID(),base={kind:'pickup',sport:'농구',title:'오늘 저녁 농구 같이 해요',venue:'농구장',start:new Date(Date.now()+4*H).toISOString(),endAt:new Date(Date.now()+6*H).toISOString(),capacity:10,minCapacity:6,minFormat:'3vs3',maxFormat:'5vs5',existing:1,members:[],memberIds:[],fee:0,level:'모든 레벨',description:'가볍게 운동하고 싶은 분들 환영해요.',info:{gender:'남녀모두'}}
await execute(db,'qa-host',{type:'create',id:mid,fields:base},env)
await execute(db,'qa-a',{type:'apply',matchId:mid,note:'같이 운동해요!',members:[],memberIds:[]},env)
await execute(db,'qa-host',{type:'create',id:crypto.randomUUID(),fields:{...base,title:'⚡ 지금 가볍게 농구할 분',start:new Date(Date.now()+H/2).toISOString(),endAt:new Date(Date.now()+2*H).toISOString(),minCapacity:2,capacity:6}},env)
const dir='.sites-runtime/qa';await mkdir(dir,{recursive:true})
await writeFile(dir+'/index.html',`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>moov. 로컬 검증</title></head><body><div id="qa"></div><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{App}from'/src/App.tsx';import'/src/styles.css';
let actor=localStorage.getItem('moov.qa.actor')||'qa-host',state={error:'loading'},listeners=new Set();
const request=async(path,body)=>{const r=await fetch('/__qa/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-QA-Actor':actor},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error);return data};
const refresh=async()=>{state={data:await request('state')};listeners.forEach(f=>f())};
const services={matches:{snapshot:()=>state,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},execute:async(_,c)=>{try{await request('command',c)}finally{await refresh()}}},session:{logout:async()=>{},save:async()=>{}},refresh,searchMembers:q=>request('members?q='+encodeURIComponent(q)),inviteLink:(input,read)=>request('invite'+(read?'?token='+input.token:''),read?undefined:input)};
const select=document.createElement('select');select.setAttribute('aria-label','로컬 테스트 계정');for(const[id,name]of ${JSON.stringify(people)}){const option=document.createElement('option');option.value=id;option.textContent=name+' · 로컬 검증';select.append(option)}select.value=actor;select.onchange=async()=>{actor=select.value;localStorage.setItem('moov.qa.actor',actor);await refresh()};document.querySelector('#qa').append(select);document.querySelector('#qa').style='position:fixed;bottom:85px;right:8px;z-index:100;max-width:180px;';await refresh();createRoot(document.querySelector('#root')).render(React.createElement(App,{services}));
</script></body></html>`)
const vite=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:5188,strictPort:true},plugins:[{name:'loopback-qa',configureServer(server){server.middlewares.use('/__qa',async(req,res)=>{try{const actor=req.headers['x-qa-actor'];if(!people.some(p=>p[0]===actor))throw Error('Unknown local test actor');const url=new URL(req.url,'http://local');let result
if(url.pathname==='/state')result=await snapshot(db,actor,env)
else if(url.pathname==='/members')result=(await q('SELECT id,name,year FROM profiles WHERE id<>? AND instr(name,?)>0',actor,url.searchParams.get('q')).all()).results
else {let body='';for await(const part of req)body+=part;const input=body?JSON.parse(body):{};if(url.pathname==='/invite'){const{inviteLink}=await import('../server/invite-links.mjs');result=await inviteLink(db,actor,req.method==='GET'?{token:url.searchParams.get('token')}:input,req.method==='GET')}else{await execute(db,actor,input,env);result={ok:true}}}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result))}catch(e){res.statusCode=e.status||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}))}})}}]})
await vite.listen();console.log('QA preview: http://127.0.0.1:5188/.sites-runtime/qa/index.html')
process.on('SIGINT',async()=>{await vite.close();await mf.dispose();process.exit(0)})
