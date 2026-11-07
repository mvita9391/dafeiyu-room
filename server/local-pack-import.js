import{randomUUID}from'node:crypto';
import{existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync,renameSync,openSync,closeSync,unlinkSync}from'node:fs';
import path from'node:path';import{fileURLToPath}from'node:url';import{spawn,execFile}from'node:child_process';import{promisify}from'node:util';
const exec=promisify(execFile),project=fileURLToPath(new URL('../',import.meta.url));
export const PACK_INFO=Object.freeze({id:'cartoon-town',name:'Cartoon Town – Low Poly Assets',publisher:'ricimi',supportedVersion:'1.0',notice:'素材包不随本项目提供，请自行查找并取得合法使用授权，再导入本地素材包。',compatibility:'仅支持已验证的1.0素材包；其他版本（包括1.5）尚未验证，兼容检查不通过时不会替换现有素材。'});
export const MAX_UPLOAD=32*1024*1024;
const errors={IMPORT_STORAGE_FAILED:'本机写入失败，请检查可用磁盘空间与目录权限后重试。现有素材未替换。',IMPORT_BUSY:'已有导入任务正在运行，请等待完成。',IMPORT_DISABLED:'请在本机游戏服务中导入素材。',IMPORT_STORAGE_FULL:'导入记录已达保留上限，请先清理本机 .cache 下的旧导入任务备份。',DEPENDENCIES_MISSING:'转换工具尚未就绪，请根据工具检查提示安装或配置后重试。',UNSUPPORTED_PACKAGE:'未识别为已验证的1.0素材包；不支持此版本或文件内容。现有素材未改动。',UNSAFE_PACKAGE:'素材包路径、文件类型或大小不符合安全要求。',PACKAGE_TOO_LARGE:'素材包超出32MiB上传限制。',PIPELINE_FAILED:'转换失败。现有素材已保留，可查看本机导入任务日志后重试。',OUTPUT_INVALID:'转换结果未通过完整性检查，现有素材已保留。',ACTIVATION_FAILED:'启用失败，已尝试恢复原素材目录。请查看本机任务日志。',IMPORT_INTERRUPTED:'服务已停止，导入中断。现有素材已保留。'};
const publicError=e=>({code:Object.hasOwn(errors,e?.code||e?.message)?(e.code||e.message):'PIPELINE_FAILED',message:errors[e?.code||e?.message]||errors.PIPELINE_FAILED});
const fail=code=>Object.assign(Error(code),{code});
function liveImportLock(directory){const lock=path.join(directory,'active.lock');if(!existsSync(lock))return false;const pid=Number(readFileSync(lock,'utf8'));if(!Number.isSafeInteger(pid)||pid<=0)return true;try{process.kill(pid,0);return true;}catch(e){if(e.code!=='ESRCH')return true;unlinkSync(lock);return false;}}
// Called before reading any promoted manifest. The DB commit ID is the journal's
// authority if a process stopped between the two renames and the final status write.
export function recoverLocalPack(directory,committedImportId){
 if(!directory)return;const jobs=path.join(path.dirname(directory),'.town-import-jobs'),file=path.join(jobs,'latest.json');if(!existsSync(file)||liveImportLock(jobs))return;
 let job;try{job=JSON.parse(readFileSync(file));}catch{return;}if(!/^[-a-f0-9]{36}$/.test(job.id)||job.status!=='running')return;
 const jobDir=path.join(jobs,job.id),previous=path.join(jobDir,'previous');
 if(committedImportId===job.id){Object.assign(job,{status:'complete',stage:'complete',progress:100});}
 else{
  if(job.stage==='activating'&&(existsSync(previous)||job.promotionHadPrevious===false)){
   if(existsSync(directory))renameSync(directory,path.join(jobDir,'uncommitted-'+randomUUID()));
   if(existsSync(previous))renameSync(previous,directory);
  }else if(!existsSync(directory)&&existsSync(previous))renameSync(previous,directory);
  job.status='error';job.error=publicError(fail('IMPORT_INTERRUPTED'));
 }
 writeFileSync(file+'.tmp',JSON.stringify(job));renameSync(file+'.tmp',file);
}
export async function checkPackPrerequisites({signal}={}){
 const blender=process.env.TOWN_BLENDER_PATH||(existsSync('/Applications/Blender.app/Contents/MacOS/Blender')?'/Applications/Blender.app/Contents/MacOS/Blender':'blender');
 const python=process.env.TOWN_PYTHON_PATH||(existsSync(path.join(project,'.cache/unity-parser-venv/bin/python'))?path.join(project,'.cache/unity-parser-venv/bin/python'):'python3');
 const issues=[],tools=[];let chromium=process.env.TOWN_CHROMIUM_PATH;
 for(const[name,file,args,help]of [['Blender',blender,['--version'],'安装 Blender，并用 TOWN_BLENDER_PATH 指向其可执行文件。'],['Python / UnityPy',python,['-c','import UnityPy; assert UnityPy.__version__ == "1.25.4"; print(UnityPy.__version__)'],'使用独立Python虚拟环境安装 UnityPy==1.25.4，并用 TOWN_PYTHON_PATH 指向该环境的Python。']]){try{await exec(file,args,{timeout:15000,maxBuffer:65536,signal,killSignal:'SIGKILL'});tools.push({name,ready:true});}catch{if(signal?.aborted)throw fail('IMPORT_INTERRUPTED');tools.push({name,ready:false,message:help});issues.push(help);}}
 try{const {chromium:pw}=await import('playwright');chromium||=existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':pw.executablePath();if(!existsSync(chromium))throw Error('missing');await exec(chromium,['--version'],{timeout:15000,maxBuffer:65536,signal,killSignal:'SIGKILL'});tools.push({name:'Chromium / Playwright',ready:true});}catch{if(signal?.aborted)throw fail('IMPORT_INTERRUPTED');const message='安装本机 Chrome/Chromium，或配置 TOWN_CHROMIUM_PATH；项目依赖需要包含 Playwright。';tools.push({name:'Chromium / Playwright',ready:false,message});issues.push(message);}
 return{ready:!issues.length,issues,tools,executables:{blender,python,chromium}};
}

export class LocalPackImporter{
 constructor({directory,preflight=checkPackPrerequisites,runPipeline,validate,activate=()=>({}),rollback=()=>{},killGraceMs=2000}){
  Object.assign(this,{directory,preflight,activate,rollback,killGraceMs});this.runPipeline=runPipeline||this.pipeline.bind(this);this.validate=validate||this.validateOutput.bind(this);this.abortController=new AbortController();this.closed=false;this.child=null;this.busy=false;
  this.jobsDirectory=directory?path.join(path.dirname(directory),'.town-import-jobs'):null;this.job=null;
  if(this.jobsDirectory){mkdirSync(this.jobsDirectory,{recursive:true,mode:0o700});const liveLock=liveImportLock(this.jobsDirectory);const file=path.join(this.jobsDirectory,'latest.json');if(existsSync(file)){try{this.job=JSON.parse(readFileSync(file));if(this.job.status==='running'&&!liveLock){this.recover();this.job.status='error';this.job.error=publicError(fail('IMPORT_INTERRUPTED'));this.persist();}}catch{this.job=null;}}}
 }
 recover(){if(!this.job?.id||!/^[-a-f0-9]{36}$/.test(this.job.id))return;const previous=path.join(this.jobsDirectory,this.job.id,'previous');if(!existsSync(this.directory)&&existsSync(previous))renameSync(previous,this.directory);}
 persist(){if(this.jobsDirectory&&this.job){const file=path.join(this.jobsDirectory,'latest.json');writeFileSync(file+'.tmp',JSON.stringify(this.job));renameSync(file+'.tmp',file);}}
 get(id){return this.job&&(!id||id===this.job.id)?structuredClone(this.job):null;}
 async prerequisites(){const result=await this.preflight({signal:this.abortController.signal});const{executables,...visible}=result;return visible;}
 start(buffer){
  if(!this.directory||this.closed)throw fail('IMPORT_DISABLED');if(this.busy)throw fail('IMPORT_BUSY');if(!Buffer.isBuffer(buffer)||buffer.length===0)throw fail('UNSUPPORTED_PACKAGE');if(buffer.length>MAX_UPLOAD)throw fail('PACKAGE_TOO_LARGE');
  if(readdirSync(this.jobsDirectory,{withFileTypes:true}).filter(e=>e.isDirectory()).length>=5)throw fail('IMPORT_STORAGE_FULL');
  const lock=path.join(this.jobsDirectory,'active.lock');let fd;try{fd=openSync(lock,'wx',0o600);}catch(e){throw fail(e.code==='EEXIST'?'IMPORT_BUSY':'IMPORT_STORAGE_FAILED');}
  this.busy=true;const id=randomUUID(),jobDir=path.join(this.jobsDirectory,id),file=path.join(jobDir,'upload.unitypackage'),output=path.join(jobDir,'output'),previousJob=this.job;
  try{writeFileSync(fd,String(process.pid));closeSync(fd);fd=null;mkdirSync(jobDir,{mode:0o700});mkdirSync(output);writeFileSync(file,buffer,{mode:0o600});this.job={id,status:'running',stage:'checking',progress:2,startedAt:new Date().toISOString()};this.persist();}
  catch{if(fd!==null)try{closeSync(fd);}catch{}this.busy=false;this.job=previousJob;try{unlinkSync(lock);}catch{}throw fail('IMPORT_STORAGE_FAILED');}
  this.promise=Promise.resolve().then(async()=>{try{const checked=await this.preflight({signal:this.abortController.signal});if(!checked.ready){this.job.tools=checked.tools;throw fail('DEPENDENCIES_MISSING');}this.assertOpen();await this.runPipeline(file,output,(s,p)=>this.stage(s,p),checked.executables);this.assertOpen();await this.validate(output);this.assertOpen();this.stage('activating',98);const previous=path.join(jobDir,'previous');let movedOld=false,movedNew=false;
    try{this.job.promotionHadPrevious=existsSync(this.directory);this.persist();if(this.job.promotionHadPrevious){renameSync(this.directory,previous);movedOld=true;}renameSync(output,this.directory);movedNew=true;const result=this.activate(this.directory,this.job.id);if(result&&typeof result.then==='function')throw Error('Activation must be synchronous');this.job.result=result;}
    catch(error){if(movedNew)renameSync(this.directory,output);if(movedOld)renameSync(previous,this.directory);this.rollback();throw fail('ACTIVATION_FAILED');}
    Object.assign(this.job,{status:'complete',stage:'complete',progress:100});
   }catch(error){this.job.status='error';this.job.error=publicError(error);}finally{this.job.finishedAt=new Date().toISOString();try{this.persist();}catch{}this.busy=false;try{unlinkSync(lock);}catch{}}});return this.get();
 }
 assertOpen(){if(this.closed)throw fail('IMPORT_INTERRUPTED');}
 stage(stage,progress){this.assertOpen();Object.assign(this.job,{stage,progress});this.persist();}
 async wait(){await this.promise;}
 async close(){this.closed=true;this.abortController.abort();const child=this.child;child?.kill('SIGTERM');const timer=child?setTimeout(()=>child.kill('SIGKILL'),this.killGraceMs):null;try{await this.wait();}finally{clearTimeout(timer);}}
 run(command,args,{env={}}={}){this.assertOpen();return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:project,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],shell:false});this.child=child;let tail='',size=0,killer,settled=false;const log=chunk=>{if(size>=256*1024)return;const text=String(chunk).slice(0,256*1024-size);size+=text.length;tail=(tail+text).slice(-65536);};child.stdout.on('data',log);child.stderr.on('data',log);const timer=setTimeout(()=>{child.kill('SIGTERM');killer=setTimeout(()=>child.kill('SIGKILL'),3000);},15*60*1000);const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killer);this.child=null;try{writeFileSync(path.join(this.jobsDirectory,this.job.id,this.job.stage+'.log'),tail);}catch{error||=fail('IMPORT_STORAGE_FAILED');}if(this.closed)return reject(fail('IMPORT_INTERRUPTED'));error?reject(error):resolve();};child.once('error',()=>finish(fail('PIPELINE_FAILED')));child.once('close',code=>{if(code===0)return finish();const match=tail.match(/PACK_ERROR:(UNSUPPORTED_PACKAGE|UNSAFE_PACKAGE)/);finish(fail(match?.[1]||'PIPELINE_FAILED'));});});}
 async pipeline(file,output,stage,tools){
  await this.run(tools.python,[path.join(project,'scripts/validate-town-package.py'),file]);
  stage('models',8);await this.run(tools.blender,['-b','--python',path.join(project,'scripts/import-town-assets.py'),'--',file,output]);
  stage('author-scenes',40);await this.run(tools.python,[path.join(project,'scripts/import-town-scenes.py'),file,output]);
  stage('surfaces',55);await this.run(process.execPath,[path.join(project,'scripts/prepare-town-surfaces.mjs'),output]);
  stage('playable-town',65);await this.run(process.execPath,[path.join(project,'scripts/prepare-town-playable.mjs'),output]);
  stage('thumbnails',75);await this.run(process.execPath,[path.join(project,'scripts/render-town-thumbnails.mjs'),output],{env:{TOWN_CHROMIUM_PATH:tools.chromium}});stage('validating',95);
 }
 async validateOutput(output){try{await this.run(process.execPath,[path.join(project,'scripts/validate-town-output.mjs'),output]);}catch(e){if(this.closed)throw e;throw fail('OUTPUT_INVALID');}}
}

export function installLocalPackRoutes(app,{directory,manifest,activate,rollback,importerOptions={}}){
 const importer=new LocalPackImporter({directory,activate,rollback,...importerOptions});app.decorate('localPackImporter',importer);app.addHook('preClose',async()=>importer.close());
 const auth=async(req,reply)=>{try{if(req.headers.authorization||!app.auth)throw Error('UNAUTHORIZED');app.auth.owner.resolve(req,{write:req.method==='POST'});if(req.method==='POST'&&(req.headers.origin!==new URL(app.auth.issuer).origin||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')))return reply.code(403).send({error:'ORIGIN_REQUIRED'});}catch(e){return reply.code(e.message==='CSRF_REQUIRED'?403:401).send({error:e.message});}};
 app.get('/api/local-packs/cartoon-town',async(_req,reply)=>{reply.header('Cache-Control','no-store');return{...PACK_INFO,installed:manifest.assets?.length===213,modelCount:manifest.assets?.length||0,importAvailable:!!directory&&!!app.auth};});
 app.get('/api/local-packs/cartoon-town/preflight',{onRequest:auth},async()=>importer.prerequisites());
 app.get('/api/local-packs/cartoon-town/imports/:id',{onRequest:auth},async(req,reply)=>{reply.header('Cache-Control','no-store');return importer.get(req.params.id==='latest'?undefined:req.params.id)||reply.code(404).send({error:'IMPORT_NOT_FOUND'});});
 app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:MAX_UPLOAD},(_req,body,done)=>done(null,body));
 app.post('/api/local-packs/cartoon-town/imports',{bodyLimit:MAX_UPLOAD,onRequest:[auth,async(req,reply)=>{if(importer.busy)return reply.code(409).send({error:'IMPORT_BUSY',message:errors.IMPORT_BUSY});if(req.headers['x-asset-rights']!=='confirmed')return reply.code(400).send({error:'RIGHTS_CONFIRMATION_REQUIRED'});}]},async(req,reply)=>{try{return reply.code(202).send(importer.start(req.body));}catch(e){const err=publicError(e);return reply.code(err.code==='IMPORT_BUSY'?409:400).send({error:err.code,message:err.message});}});
 return importer;
}
