import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {ActorTimeline} from '../src/core/actor-timeline.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('crossing a doorway hands confirmed local position to renderer without rewinding interpolation',async()=>{
 const timeline=new ActorTimeline();const make=x=>({actorId:'whale',sceneId:'bedroom',position:[x,0,1.05],rotation:-Math.PI/2,pose:'walking',form:'normal'});
 timeline.push(make(-1.8),600);timeline.push(make(-2.3),800);timeline.push(make(-2.58),900);
 const confirmed=make(-2.86);let active=true,submitted=false;
 const player={get active(){return active;},stop(){},async drain(){},sample:()=>active?confirmed:null,release(){active=false;}};
 const context={player,client:{snapshot:{actors:[make(-2.58)]},async refreshState(){this.snapshot={actors:[confirmed]};return this.snapshot;}},actor:confirmed,actorTimeline:timeline,performance:{now:()=>1000},dispatcher:{async submit(){submitted=true;return {actionId:'door'};}},showMessage:message=>assert.fail(message),portalPending:true,encounterPending:true};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function action('),source.indexOf('function interact(')),context);
 await context.action('move',{sceneId:'yard'});assert.equal(submitted,false);
 context.encounterPending=false;
 await context.action('move',{sceneId:'yard'});assert.equal(submitted,true);
 assert.deepEqual(timeline.sample(1000).position,confirmed.position,'renderer must not jump back to its 250 ms old sample after local input is released');
});

test('new authority samples continue forward after handoff and scene change never interpolates across rooms',()=>{
 const timeline=new ActorTimeline();const actor={actorId:'whale',sceneId:'bedroom',position:[-2.86,0,1.05],rotation:-Math.PI/2};timeline.handoff(actor,1000);
 let previous=timeline.sample(1000).position[0];
 for(let step=1;step<=6;step++){const now=1000+step*50;timeline.push({...actor,position:[-2.86-step*.025,0,1.05]},now);const current=timeline.sample(now).position[0];assert.ok(current<=previous+1e-10,`backstep at ${now}: ${previous} -> ${current}`);previous=current;}
 timeline.push({...actor,sceneId:'yard',position:[-6.6,0,.1]},1400);assert.equal(timeline.sample(1400).sceneId,'yard');assert.deepEqual(timeline.sample(1400).position,[-6.6,0,.1]);
});
