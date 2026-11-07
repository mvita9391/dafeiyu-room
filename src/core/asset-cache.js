// Templates own resources. Consumers lease clones; only unreferenced templates may evict.
export class AssetCache{
 constructor({load,dispose,concurrency=3,maxIdle=16,maxBytes=32*1024*1024}){Object.assign(this,{load,dispose,concurrency,maxIdle,maxBytes});this.entries=new Map();this.queue=[];this.running=0;this.clock=0;this.stats={loads:0,failures:0,active:0,idle:0,bytes:0,pending:0};}
 acquire(key){let e=this.entries.get(key);if(!e){e={key,refs:0,value:null,stamp:++this.clock};e.promise=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});this.entries.set(key,e);this.queue.push(e);}e.refs++;let released=false;this.pump();return {promise:e.promise,release:()=>{if(released)return;released=true;e.refs--;e.stamp=++this.clock;if(!e.refs&&!e.value){e.cancelled=true;this.entries.delete(e.key);this.queue=this.queue.filter(job=>job!==e);e.resolve(null);}this.trim();}};}
 pump(){while(this.running<this.concurrency&&this.queue.length){const e=this.queue.shift();if(e.cancelled)continue;this.running++;this.stats.loads++;Promise.resolve().then(()=>this.load(e.key)).then(value=>{if(e.cancelled||!e.refs){this.dispose(value);if(this.entries.get(e.key)===e)this.entries.delete(e.key);e.resolve(null);}else{e.value=value;e.resolve(value);}},error=>{this.stats.failures++;if(this.entries.get(e.key)===e)this.entries.delete(e.key);e.reject(error);}).finally(()=>{this.running--;this.trim();this.pump();});}this.measure();}
 trim(){const idle=[...this.entries.values()].filter(e=>e.value&&!e.refs).sort((a,b)=>a.stamp-b.stamp);let bytes=idle.reduce((n,e)=>n+(e.value.bytes||0),0);while(idle.length>this.maxIdle||bytes>this.maxBytes){const e=idle.shift();bytes-=e.value.bytes||0;this.entries.delete(e.key);this.dispose(e.value);}this.measure();}
 measure(){const entries=[...this.entries.values()];Object.assign(this.stats,{active:entries.filter(e=>e.refs>0).length,idle:entries.filter(e=>e.value&&!e.refs).length,bytes:entries.reduce((n,e)=>n+(e.value?.bytes||0),0),pending:this.running+this.queue.length});}
}

export class PalettePool{
 constructor(dispose){this.entries=new Map();this.dispose=dispose;}
 acquire(key,value){let e=this.entries.get(key);if(e){if(e.value!==value)this.dispose(value);}else{e={value,refs:0};this.entries.set(key,e);}e.refs++;let released=false;return {value:e.value,release:()=>{if(released)return;released=true;if(--e.refs===0){this.entries.delete(key);this.dispose(e.value);}}};}
}
