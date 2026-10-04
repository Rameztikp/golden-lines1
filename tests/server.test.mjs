import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker,{validateData,imageType} from '../server/worker.mjs';
import seed from '../server/seed.json' with {type:'json'};
function setup(){const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));const DB={prepare(query){return {bind(...values){return {async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}}}}}}}};const files=new Map();const env={DB,ADMIN_OWNER_EMAIL:'owner@example.test',BUCKET:{async put(id,bytes,opt){files.set(id,{body:bytes,httpMetadata:opt.httpMetadata})},async get(id){return files.get(id)},async delete(id){files.delete(id)}},ASSETS:{fetch:()=>new Response('asset')}};return {env,sql,files};}
function request(path,method='GET',data=null,role='owner',extra={}){return new Request('https://shop.test'+path,{method,headers:{Origin:'https://shop.test',...(role?{'oai-authenticated-user-id':role+'-id','oai-authenticated-user-email':role+'@example.test'}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})})}
async function call(env,...args){const r=await worker.fetch(request(...args),env);return {status:r.status,body:await r.json()}}
const booking={name:'عميلة اختبار',phone:'0501234567',date:'2027-01-02',wedding:'2027-02-01',time:'10:00',service:'تجربة فستان',dress:'lian',notes:''};
test('anonymous, unknown and cross-origin callers cannot administer',async()=>{const {env}=setup();assert.equal((await call(env,'/api/admin/content','GET',null,null)).status,401);assert.equal((await call(env,'/api/admin/content','GET',null,'stranger')).status,403);assert.equal((await call(env,'/api/admin/content','PUT',{data:seed,revision:0},'owner',{Origin:'https://evil.test'})).status,403);assert.equal((await call(env,'/api/admin/content')).status,200)});
test('content persists, stale edits rejected, unpublished designs excluded',async()=>{const {env}=setup(),d=structuredClone(seed);d.dresses[0].published=false;let r=await call(env,'/api/admin/content','PUT',{data:d,revision:0});assert.equal(r.status,200);assert.equal(r.body.revision,1);assert.equal((await call(env,'/api/admin/content','PUT',{data:seed,revision:0})).status,409);const pub=await call(env,'/api/catalog','GET',null,null);assert.equal(pub.body.data.dresses.length,7);assert.equal((await call(env,'/api/admin/content')).body.data.dresses.length,8)});
test('data validation rejects unsafe files, bad angles, missing relationships',()=>{for(const mutate of [d=>d.settings.logo='javascript:alert(1)',d=>d.dresses[0].frames[1].angle=0,d=>d.dresses[0].group='unknown',d=>d.settings.openTime=24,d=>d.settings.instagram='javascript:alert(1)']){const d=structuredClone(seed);mutate(d);assert.throws(()=>validateData(d))}assert.equal(validateData(structuredClone(seed)).dresses.length,8)});
test('booking requests persist idempotently and capacity is enforced atomically',async()=>{const {env}=setup();const key=crypto.randomUUID();const send=()=>call(env,'/api/bookings','POST',booking,null,{'Idempotency-Key':key});const first=await send();assert.equal(first.status,201);assert.equal((await send()).body.id,first.body.id);const second=await call(env,'/api/bookings','POST',{...booking,name:'عميلة ثانية'},null,{'Idempotency-Key':crypto.randomUUID()});assert.equal(second.status,201);assert.equal((await call(env,'/api/admin/requests/'+first.body.id,'PATCH',{status:'confirmed',version:1,notes:'تم التنسيق'})).status,200);assert.equal((await call(env,'/api/admin/requests/'+second.body.id,'PATCH',{status:'confirmed',version:1,notes:''})).status,409);assert.equal((await call(env,'/api/admin/requests/'+first.body.id,'PATCH',{status:'completed',version:1,notes:''})).status,409);assert.equal((await call(env,'/api/admin/requests')).body.items.length,2)});
test('closure, invalid inputs, messages, newsletter and rate limits',async()=>{const {env}=setup();assert.equal((await call(env,'/api/bookings','POST',{...booking,date:'2027-01-01'},null,{'Idempotency-Key':crypto.randomUUID()})).status,400);assert.equal((await call(env,'/api/messages','POST',{name:'اختبار',email:'bad',subject:'سؤال',message:'مرحبًا'},null,{'Idempotency-Key':crypto.randomUUID()})).status,400);assert.equal((await call(env,'/api/messages','POST',{name:'اختبار',email:'test@example.test',subject:'سؤال',message:'مرحبًا'},null,{'Idempotency-Key':crypto.randomUUID()})).status,201);assert.equal((await call(env,'/api/subscribers','POST',{email:'test@example.test'},null,{'Idempotency-Key':crypto.randomUUID()})).status,201);let r;for(let i=0;i<20;i++)r=await call(env,'/api/subscribers','POST',{email:'test@example.test'},null,{'Idempotency-Key':crypto.randomUUID()});assert.equal(r.status,429)});
test('team roles separated; owner cannot be removed; revoked member blocked',async()=>{const {env}=setup();assert.equal((await call(env,'/api/admin/members','POST',{name:'Editor',email:'editor@example.test',role:'editor'})).status,200);assert.equal((await call(env,'/api/admin/content','GET',null,'editor')).status,200);assert.equal((await call(env,'/api/admin/requests','GET',null,'editor')).status,403);assert.equal((await call(env,'/api/admin/members','GET',null,'editor')).status,403);assert.equal((await call(env,'/api/admin/members/owner%40example.test','DELETE')).status,400);await call(env,'/api/admin/members/editor%40example.test','DELETE');assert.equal((await call(env,'/api/admin/content','GET',null,'editor')).status,403)});
test('media upload validates signature, stores bytes, protects referenced images',async()=>{const {env}=setup();await call(env,'/api/admin/me');const upload=async(file)=>{const f=new FormData();f.append('file',file);return worker.fetch(new Request('https://shop.test/api/admin/media',{method:'POST',headers:{Origin:'https://shop.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'},body:f}),env)};assert.equal((await upload(new File(['<svg/>'],'evil.jpg',{type:'image/jpeg'}))).status,400);const r=await upload(new File([fs.readFileSync('public/images/dress-lian.jpg')],'test.jpg',{type:'image/jpeg'}));assert.equal(r.status,201);const item=await r.json();const d=structuredClone(seed);d.dresses[0].image=item.url;await call(env,'/api/admin/content','PUT',{data:d,revision:0});assert.equal((await call(env,'/api/admin/media/'+item.id,'DELETE')).status,409);await call(env,'/api/admin/content','PUT',{data:seed,revision:1});assert.equal((await call(env,'/api/admin/media/'+item.id,'DELETE')).status,200)});

test('malformed JSON values are client errors, never server failures',async()=>{
 const {env}=setup();
 for(const path of ['/api/bookings','/api/messages','/api/subscribers','/api/admin/members','/api/admin/content'])for(const value of ['null','[]','42','"text"','{']){
  const r=await worker.fetch(new Request('https://shop.test'+path,{method:path.endsWith('content')?'PUT':'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'},body:value}),env);
  assert.equal(r.status,400,path+' '+value);
 }
});
test('invalid content types and calendar dates are rejected cleanly',()=>{
 for(const mutate of [d=>d.settings.phone=123456789,d=>d.settings.instagram={},d=>d.settings.blockedDates=['2027-02-30'],d=>d.dresses[0].id=123,d=>d.dresses[0].frames=[null],d=>d.dresses[0].frames=['bad'],d=>d.settings.email=false]){
  const d=structuredClone(seed);mutate(d);assert.throws(()=>validateData(d),e=>e.status===400);
 }
});
test('existing confirmed bookings allow notes after their date or closure',async()=>{
 const {env,sql}=setup();const key=crypto.randomUUID();
 sql.prepare('INSERT INTO requests (id,kind,data,status,notes,created,updated,version,dedupe) VALUES (?,?,?,?,?,?,?,?,?)').run(key,'bookings',JSON.stringify({...booking,date:'2020-01-02',wedding:'2020-02-01'}),'confirmed','','2020-01-01','2020-01-01',1,crypto.randomUUID());
 assert.equal((await call(env,'/api/admin/requests/'+key,'PATCH',{status:'confirmed',notes:'تم التواصل',version:1})).status,200);
 assert.equal((await call(env,'/api/admin/requests/'+key,'PATCH',{status:'confirmed',notes:'',version:2,appointment:{date:'2020-01-03',time:'10:00'}})).status,400);
 assert.equal((await call(env,'/api/admin/requests/'+key,'PATCH',{status:'completed',notes:'',version:2})).status,200);
});
test('request pagination returns every row exactly once for matching timestamps',async()=>{
 const {env,sql}=setup(),ids=[];const insert=sql.prepare('INSERT INTO requests (id,kind,data,status,notes,created,updated,version,dedupe) VALUES (?,?,?,?,?,?,?,?,?)');
 for(let n=0;n<5101;n++){const key=crypto.randomUUID();ids.push(key);insert.run(key,'messages',JSON.stringify({name:'اختبار '+n,email:'test@example.test',subject:'فحص',message:'رسالة'}),'new','','2026-09-27T00:00:00Z','2026-09-27T00:00:00Z',1,crypto.randomUUID())}
 let cursor='',seen=[];do{const r=await call(env,'/api/admin/requests?limit=500'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(r.status,200);assert.ok(r.body.items.length<=500);seen.push(...r.body.items.map(x=>x.id));cursor=r.body.nextCursor}while(cursor);
 assert.deepEqual(seen.sort(),ids.sort());assert.equal((await call(env,'/api/admin/requests?cursor=invalid')).status,400);
});
test('media rejects truncated images and malformed multipart requests',async()=>{
 const {env}=setup(),headers={Origin:'https://shop.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'};
 for(const bytes of [[255,216,255,224,0,0,0,0],[137,80,78,71],Array.from(new TextEncoder().encode('RIFF0000WEBP'))]){
  const f=new FormData();f.append('file',new File([new Uint8Array(bytes)],'broken.jpg'));
  assert.equal((await worker.fetch(new Request('https://shop.test/api/admin/media',{method:'POST',headers,body:f}),env)).status,400);
 }
 assert.equal((await worker.fetch(new Request('https://shop.test/api/admin/media',{method:'POST',headers:{...headers,'Content-Type':'multipart/form-data; boundary=missing'},body:'bad'}),env)).status,400);
});

test('all shipped photographs and catalog references are present and valid',()=>{
 const images=fs.readdirSync('public/images');for(const name of images)assert.ok(imageType(fs.readFileSync('public/images/'+name)),name);
 const walk=v=>{if(typeof v==='string'&&v.startsWith('/images/'))assert.ok(fs.existsSync('public'+v),v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(seed);
});
test('reception can process requests but cannot change content, media or access',async()=>{
 const {env}=setup();await call(env,'/api/admin/members','POST',{name:'Reception',email:'reception@example.test',role:'reception'});
 for(const [path,method,data] of [['content','GET',null],['content','PUT',{data:seed,revision:0}],['media','GET',null],['media/unknown','DELETE',null],['members','GET',null],['members','POST',{email:'new@example.test',role:'editor'}],['audit','GET',null]])assert.equal((await call(env,'/api/admin/'+path,method,data,'reception')).status,403,path);
 assert.equal((await call(env,'/api/admin/requests','GET',null,'reception')).status,200);
 const r=await call(env,'/api/bookings','POST',booking,null,{'Idempotency-Key':crypto.randomUUID()});
 assert.equal((await call(env,'/api/admin/requests/'+r.body.id,'PATCH',{status:'confirmed',version:1,notes:''},'reception')).status,200);
 assert.equal((await call(env,'/api/admin/requests/'+r.body.id,'DELETE',null,'reception')).status,403);
});
test('bound identities cannot be impersonated with a different user id',async()=>{
 const {env}=setup();await call(env,'/api/admin/me');
 assert.equal((await call(env,'/api/admin/me','GET',null,'owner',{'oai-authenticated-user-id':'another-account'})).status,403);
 assert.equal((await call(env,'/api/admin/me','GET',null,null,{'oai-authenticated-user-email':'owner@example.test'})).status,401);
});
test('CSRF protections reject missing origin and cross-site mutations',async()=>{
 const {env}=setup();for(const headers of [{Origin:''},{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await call(env,'/api/bookings','POST',booking,null,headers)).status,403);
});
test('rescheduling respects capacity and cancellation releases the original slot',async()=>{
 const {env}=setup();const send=async data=>(await call(env,'/api/bookings','POST',data,null,{'Idempotency-Key':crypto.randomUUID()})).body.id;
 const a=await send(booking),b=await send({...booking,time:'11:00'});
 for(const id of [a,b])assert.equal((await call(env,'/api/admin/requests/'+id,'PATCH',{status:'confirmed',notes:'',version:1})).status,200);
 assert.equal((await call(env,'/api/admin/requests/'+b,'PATCH',{status:'confirmed',notes:'',version:2,appointment:{date:booking.date,time:'10:00'}})).status,409);
 assert.equal((await call(env,'/api/admin/requests/'+a,'PATCH',{status:'cancelled',notes:'',version:2})).status,200);
 assert.equal((await call(env,'/api/admin/requests/'+b,'PATCH',{status:'confirmed',notes:'',version:2,appointment:{date:booking.date,time:'10:00'}})).status,200);
});
test('disabled bookings, blocked dates, unavailable designs and wrong statuses',async()=>{
 const {env}=setup(),data=structuredClone(seed);data.settings.bookingEnabled=false;
 await call(env,'/api/admin/content','PUT',{data,revision:0});
 assert.equal((await call(env,'/api/bookings','POST',booking,null,{'Idempotency-Key':crypto.randomUUID()})).status,409);
 data.settings.bookingEnabled=true;data.settings.blockedDates=[booking.date];await call(env,'/api/admin/content','PUT',{data,revision:1});
 assert.equal((await call(env,'/api/bookings','POST',booking,null,{'Idempotency-Key':crypto.randomUUID()})).status,400);
 data.settings.blockedDates=[];data.dresses[0].published=false;await call(env,'/api/admin/content','PUT',{data,revision:2});
 assert.equal((await call(env,'/api/bookings','POST',booking,null,{'Idempotency-Key':crypto.randomUUID()})).status,400);
 const r=await call(env,'/api/messages','POST',{name:'اختبار',email:'test@example.test',subject:'فحص',message:'نص'},null,{'Idempotency-Key':crypto.randomUUID()});
 assert.equal((await call(env,'/api/admin/requests/'+r.body.id,'PATCH',{status:'confirmed',notes:'',version:1})).status,400);
 assert.equal((await call(env,'/api/admin/requests/'+r.body.id,'PATCH',{status:'read',notes:'',version:1})).status,200);
});
test('oversized JSON and media are rejected before persistence',async()=>{
 const {env,sql}=setup();const headers={Origin:'https://shop.test','oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.test'};
 for(const [path,size] of [['/api/messages',13000],['/api/admin/content',1800001],['/api/admin/media',13000000]]){
  const r=await worker.fetch(new Request('https://shop.test'+path,{method:path.endsWith('content')?'PUT':'POST',headers:{...headers,'Content-Length':String(size)},body:'{}'}),env);assert.equal(r.status,413,path);
 }
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM requests').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM media').get().n,0);
});
test('empty catalog and prototype-like content references are handled safely',async()=>{
 const {env}=setup(),data=structuredClone(seed);data.dresses=[];data.collections=[];data.designers=[];assert.equal((await call(env,'/api/admin/content','PUT',{data,revision:0})).status,200);assert.deepEqual((await call(env,'/api/catalog','GET',null,null)).body.data.dresses,[]);
 data.pages.home=JSON.parse('{"__proto__":"bad"}');assert.throws(()=>validateData(data),e=>e.status===400);
});
test('successful writes leave audit records and private responses are not cached',async()=>{
 const {env}=setup();await call(env,'/api/admin/content','PUT',{data:seed,revision:0});
 const r=await worker.fetch(request('/api/admin/audit'),env);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');const rows=await r.json();assert.equal(rows[0].action,'content.save');
});
test('content saves reject missing images without changing the saved revision',async()=>{
 const {env}=setup();for(const url of ['/images/does-not-exist.jpg','/media/'+crypto.randomUUID()]){const data=structuredClone(seed);data.dresses[0].image=url;assert.equal((await call(env,'/api/admin/content','PUT',{data,revision:0})).status,400);assert.equal((await call(env,'/api/admin/content')).body.revision,0)}
});

