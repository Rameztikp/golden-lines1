import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudflareHandler,verifyAccessIdentity} from '../server/cloudflare.mjs';
const application={async fetch(request){return Response.json({uid:request.headers.get('oai-authenticated-user-id'),email:request.headers.get('oai-authenticated-user-email')})}};
const forged={headers:{'oai-authenticated-user-id':'attacker','oai-authenticated-user-email':'rameztalal.a.h@gmail.com'}};
test('Cloudflare strips client-supplied identity from public requests',async()=>{
 const response=await createCloudflareHandler({application}).fetch(new Request('https://example.com/api/catalog',forged),{});
 assert.deepEqual(await response.json(),{uid:null,email:null});
});
test('Cloudflare administration fails closed without Access configuration',async()=>{
 for(const path of ['/admin','/admin.html','/api/admin/me','/api/admin/content']) {
  const response=await createCloudflareHandler({application}).fetch(new Request('https://example.com'+path,forged),{});
  assert.equal(response.status,503);
 }
});
test('Cloudflare rejects absent or invalid Access assertions instead of trusting headers',async()=>{
 const env={CF_ACCESS_TEAM_DOMAIN:'https://example.cloudflareaccess.com',CF_ACCESS_AUD:'expected',ADMIN_OWNER_EMAIL:'owner@example.com'};
 await assert.rejects(verifyAccessIdentity(new Request('https://example.com/admin',forged),env));
 const response=await createCloudflareHandler({application,verifyIdentity:async()=>{throw Error('bad signature')}}).fetch(new Request('https://example.com/api/admin/me',forged),env);
 assert.equal(response.status,401);
});
test('Only verified identity reaches existing role authorization',async()=>{
 const response=await createCloudflareHandler({application,verifyIdentity:async()=>({id:'verified-user',email:'verified@example.com'})}).fetch(new Request('https://example.com/api/admin/me',forged),{});
 assert.deepEqual(await response.json(),{uid:'verified-user',email:'verified@example.com'});
});
test('Cloudflare login and logout use local fixed destinations',async()=>{
 const handler=createCloudflareHandler({application});
 for(const [path,target] of [['/signin-with-chatgpt?return_to=https://evil.example','/admin'],['/signout-with-chatgpt','/cdn-cgi/access/logout']]){
 const response=await handler.fetch(new Request('https://example.com'+path),{});
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://example.com'+target);
 }
});
