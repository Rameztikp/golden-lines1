import {createRemoteJWKSet, jwtVerify} from 'jose';
import app from './worker.mjs';

const keySets = new Map();
export async function verifyAccessIdentity(request, env) {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_OWNER_EMAIL) {
    throw Object.assign(new Error('لم يكتمل إعداد تسجيل دخول الإدارة.'), {status:503});
  }
  const issuer = new URL(env.CF_ACCESS_TEAM_DOMAIN).origin;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) throw new Error('Invalid Access issuer');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw Object.assign(new Error('يلزم تسجيل الدخول إلى الإدارة.'), {status:401});
  if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs')));
  const {payload} = await jwtVerify(token, keySets.get(issuer), {
    issuer, audience:env.CF_ACCESS_AUD, algorithms:['RS256'], requiredClaims:['exp','sub','email'],
  });
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email.includes('@')) {
    throw new Error('Invalid Access identity');
  }
  return {id:payload.sub,email:payload.email.toLowerCase()};
}

export function createCloudflareHandler({verifyIdentity=verifyAccessIdentity, application=app}={}) {
  return {async fetch(request, env, ctx) {
    const url=new URL(request.url);
    if (url.pathname==='/signin-with-chatgpt') return Response.redirect(new URL('/admin',url),302);
    if (url.pathname==='/signout-with-chatgpt') return Response.redirect(new URL('/cdn-cgi/access/logout',url),302);
    const headers=new Headers(request.headers);
    for (const key of [...headers.keys()]) if (key.toLowerCase().startsWith('oai-authenticated-')) headers.delete(key);
    const protectedPath=url.pathname==='/admin'||url.pathname==='/admin.html'||url.pathname==='/api/admin'||url.pathname.startsWith('/api/admin/');
    if (protectedPath) {
      try {
        const identity=await verifyIdentity(request,env);
        headers.set('oai-authenticated-user-id',identity.id);
        headers.set('oai-authenticated-user-email',identity.email);
      } catch(error) {
        return Response.json({error:error.status===503?error.message:'سجّلي الدخول من صفحة الإدارة للوصول إلى حسابك.'}, {
          status:error.status===503?503:401,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},
        });
      }
    }
    return application.fetch(new Request(request,{headers}),env,ctx);
  }};
}
export default createCloudflareHandler();
