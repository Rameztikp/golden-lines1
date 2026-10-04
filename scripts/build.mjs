import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const output=path.resolve(root,'dist');
if(path.dirname(output)!==root)throw new Error('Build output must stay inside the project.');
if(fs.existsSync(output)){if(fs.lstatSync(output).isSymbolicLink()||fs.realpathSync(output)!==output)throw new Error('Refusing to clean a redirected build folder.');fs.rmSync(output,{recursive:true});}
for(const name of ['client','server','.openai'])fs.mkdirSync(path.join(root,'dist',name),{recursive:true});
fs.cpSync('public','dist/client',{recursive:true});
const imageManifest=JSON.stringify(fs.readdirSync('public/images').sort().map(name=>'/images/'+name));
fs.writeFileSync('server/images.json',imageManifest+'\n');
const code=fs.readFileSync('server/worker.mjs','utf8').replace("import imagePaths from './images.json' with {type:'json'};",'const imagePaths='+imageManifest+';').replace("import seed from './seed.json' with {type:'json'};",'const seed='+fs.readFileSync('server/seed.json','utf8')+';');
fs.writeFileSync('dist/server/index.js',code);
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
if(fs.existsSync('drizzle'))fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
fs.writeFileSync('dist/server/wrangler.json',JSON.stringify({name:'golden-lines',main:'index.js',compatibility_date:'2026-09-24',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'golden-lines',database_id:'local'}],r2_buckets:[{binding:'BUCKET',bucket_name:'golden-lines-media'}]}));
console.log('Built Worker, public assets, hosting metadata and database migrations.');
