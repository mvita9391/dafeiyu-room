import {selectAuthorizedWorld} from './world-selection.js';
import {z} from 'zod';
import {GAITS,MANEUVERS,SEQUENCE_MANEUVERS} from '../../shared/world/maneuvers.js';
import {combatTargets} from '../../shared/world/combat-targets.js';
import {SPELLS} from '../../shared/world/spells.js';
import {idSchema,vectorSchema,buildOperationSchema,spellFields,taskSequenceFields,taskAttackFields} from '../../shared/world/schema.js';
import {listPortalSlots} from '../world/build.js';
import {suggestLayout} from '../world/layout-suggestions.js';
import {RULES,catalog,projectSnapshot} from './resources.js';
const id=idSchema,rev=z.number().int().nonnegative(),request={requestId:id},world={worldId:id.optional().describe('通常省略：自动进入当前凭证授权的默认世界。首次调用 world_enter {}，使用返回的 worldId；不要猜 main、home 或角色名字。')},actor={actorId:id},lease={...actor,leaseId:id,leaseVersion:rev},obj=shape=>z.object({...world,...shape}).strict();
const target=z.union([z.object({sceneId:id,groundPosition:z.tuple([z.number().finite(),z.number().finite()])}).strict(),z.object({sceneId:id,landmarkId:id}).strict(),z.object({sceneId:id,position:vectorSchema}).strict(),z.object({entityId:id,anchorId:id}).strict(),z.object({sceneId:id}).strict()]);
const definitions=[
 ['audio_play','播放智能体已生成的音频；需要 audio:play 授权和主人开启声音。最多4MiB、60秒；结果仅表示设备播放回执，不能证明听见。',{...request,audioBase64:z.string().min(4).max(5592408),mimeType:z.enum(['audio/mpeg','audio/wav','audio/ogg'])}],
 ['audio_get_status','查询本授权的实际播放状态。',{playbackId:id}],
 ['audio_stop','取消本授权音频并删除临时内容。',{...request,playbackId:id}],
 ['world_enter','进入当前授权世界。首次调用 world_enter {}，省略 worldId 即可；不要猜世界名。返回实际 worldId、角色、规则与能力，不移动或新建角色。',{}],
 ['world_observe','观察场景和物件；detail=portals 返回当前可用门槽。',{sceneId:id.optional(),entityId:id.optional(),detail:z.enum(['summary','entities','portals','map']).optional()}],
 ['world_get_events','按游标读取有序事件；读取不确认消费。',{afterCursor:rev.optional(),limit:z.number().int().min(1).max(500).optional()}],
 ['world_ack_events','确认已处理的事件游标；历史缺口须先处理 world_enter 返回的 recoverySnapshot，再提交其 recoveryToken 和 recoveryCursor。',{...request,cursor:rev,recoveryToken:id.optional()}],
 ['catalog_list','查询批准的场景模板和家具目录。',{category:z.enum(['all','templates','assets']).optional(),sceneKind:z.enum(['indoor','outdoor']).optional()}],
 ['layout_suggest','按区域与用途生成候选 ops；不会修改世界。',{sceneId:id,purpose:z.string().max(80).optional(),zoneId:id.optional(),preferences:z.union([z.array(id).max(6),z.object({types:z.array(id).max(6)}).strict()]).optional()}],
 ['actor_take_control','取得指定已授权角色60秒控制租约，不能抢占他人。',{...actor,...request}],
 ['actor_release_control','归还租约，并取消该角色未完成动作。',{...lease,...request}],
 ['actor_move','支持 groundPosition:[X,Z] 自动采样地面、landmarkId 地标，兼容 position:[X,Y,Z]；指定sceneId，提交后查询 actionId。gait=sprint 在地面冲刺，默认 walk。',{...lease,...request,target,gait:z.enum(GAITS).optional()}],
 ['actor_maneuver','执行飞踢、翻滚、滑铲、三连拳、二段跳、随机舞、原地连踢或魔法。heading 为弧度，默认当前朝向。仅飞踢支持 gait。spell 必填 slot（技能栏 1–8），可选 groundPosition:[X,Z]。',{...lease,...request,maneuver:z.enum(MANEUVERS),...spellFields,heading:z.number().finite().optional(),gait:z.enum(GAITS).optional()}],
 ['actor_run_sequence','冲刺到目标位置再按顺序执行招式。程序负责寻路和确认到达。返回 actionId，可查询或取消。',{...lease,...request,...taskSequenceFields}],
 ['actor_attack_target','自动对 world_observe 的 combatTargets 中指定目标跑位和瞄准。省略 spell 时轮换可用魔法，也可指定 spell。默认攻击一次，continuous=true 持续到取消或租约结束。返回 actionId。',{...lease,...request,...taskAttackFields}],
 ['actor_jump','原地或朝1.6米内目标跳跃，落地后完成；不可二段跳。',{...lease,...request,target:target.optional()}],
 ['actor_interact','走到物件交互点再坐、睡、游泳、滑梯、爬树或吃白饭。',{...lease,...request,verb:z.enum(['sit','sleep','swim','slide','eat','climbTree']),targetId:id.optional()}],
 ['action_get','读取属于本授权主体的动作真实状态、阶段与结果。',{actionId:id}],
 ['action_cancel','取消本授权主体正在执行的动作。',{actionId:id,...request}],
 ['build_preview','预览最多20项严格建设操作，签发5分钟方案，不自动应用。',{...request,baseRevision:rev,ops:z.array(buildOperationSchema).min(1).max(20)}],
 ['build_apply','原子提交自己的有效预览方案。',{...request,planId:id}],
 ['build_undo','撤销自己的建设变更；后续依赖会明确报错。',{...request,changeId:id}],

];
const toolDefinitions=definitions.map(([name,description,shape])=>({name,description,schema:obj(shape)}));
const advancedActionNames=new Set(['actor_maneuver','actor_jump']);
export function mcpTools(advancedActions=false){
 return advancedActions?toolDefinitions:toolDefinitions.filter(tool=>!advancedActionNames.has(tool.name));
}
export function createToolCaller(service,{resolvePrincipal,extensions={},advancedActions=false}={}){
 const tools=mcpTools(advancedActions);
 return async(name,input)=>{const def=tools.find(d=>d.name===name);if(!def)throw Error('UNKNOWN_TOOL');const a=def.schema.parse(input),p=await resolvePrincipal(),worldId=selectAuthorizedWorld(p,a.worldId,service.clock());
 const snap=()=>service.getSnapshot(p,worldId),command=(kind,payload)=>service.execute(p,{worldId,requestId:a.requestId,kind,payload});
 const action=()=>{const act=snap().actions?.[a.actionId];if(!act||!p.actorIds.includes(act.actorId)||(p.role!=='owner'&&act.subjectId!==p.subjectId))throw Error('UNAUTHORIZED');return act;};
 if(extensions[name])return extensions[name]({principal:p,worldId,args:a,service});
 switch(name){
 case 'world_enter':{const s=projectSnapshot(snap(),p),summary=service.resumeSummary(p,worldId),recovery=summary.snapshotResetRequired?service.snapshotRecovery(p,worldId):null;return {worldId,...summary,...recovery?{recoveryToken:recovery.recoveryToken,recoveryCursor:recovery.recoveryCursor,recoverySnapshot:projectSnapshot(recovery.snapshot,p)}:{},actor:s.actors[0]||null,actors:s.actors,activeActions:Object.values(s.actions).filter(a=>['running','queued'].includes(a.status)),permissions:{scopes:p.scopes,actorIds:p.actorIds},rules:RULES,capabilities:{tools:tools.map(t=>t.name),ackEvents:true,attackSpells:SPELLS.map(({id,label})=>({id,label})),maneuvers:advancedActions?MANEUVERS:SEQUENCE_MANEUVERS,...advancedActions?{spellSlots:SPELLS.map(({id,label,kind,range},index)=>({slot:index+1,id,label,kind,range}))}:{}},nextStep:'先观察目录与场景，再按授权取得控制或预览建设。'};}
 case 'world_observe':{const s=projectSnapshot(snap(),p);s.combatTargets=combatTargets(s,a.sceneId);if(a.sceneId&&!s.scenes.some(s=>s.sceneId===a.sceneId))throw Error('SCENE_NOT_FOUND');if(a.entityId){const entity=s.entities.find(e=>e.entityId===a.entityId);if(!entity)throw Error('ENTITY_NOT_FOUND');return {worldId,layoutRevision:s.layoutRevision,entity};}if(a.detail==='portals'){if(!a.sceneId)throw Error('SCENE_REQUIRED');return {worldId,sceneId:a.sceneId,slots:listPortalSlots(snap(),a.sceneId)};}if(a.sceneId)return {...s,scenes:s.scenes.filter(s=>s.sceneId===a.sceneId),entities:s.entities.filter(e=>e.sceneId===a.sceneId),actors:s.actors.filter(e=>e.sceneId===a.sceneId)};return s;}
 case 'world_get_events':return service.getEvents(p,{worldId,afterCursor:a.afterCursor||0,limit:a.limit||100});
 case 'world_ack_events':return service.ackEvents(p,{worldId,cursor:a.cursor,requestId:a.requestId,recoveryToken:a.recoveryToken});
 case 'catalog_list':{const c=catalog();return {worldId,...a.category==='assets'?{}:{templates:c.templates.filter(t=>!a.sceneKind||t.kind===a.sceneKind)},...a.category==='templates'?{}:{assets:c.assets.filter(t=>!a.sceneKind||t.sceneKinds.includes(a.sceneKind))}};}
 case 'layout_suggest':return {worldId,...suggestLayout(snap(),a)};
 case 'actor_take_control':return command('control.acquire',{actorId:a.actorId});
 case 'actor_release_control':return command('control.release',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion});
 case 'actor_move':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:'move',target:a.target,...a.gait?{gait:a.gait}:{}});
 case 'actor_maneuver':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:'maneuver',maneuver:a.maneuver,...a.heading!==undefined?{heading:a.heading}:{},...a.gait?{gait:a.gait}:{},...a.slot!==undefined?{slot:a.slot}:{},...a.groundPosition?{groundPosition:a.groundPosition}:{}});
 case 'actor_run_sequence':return command('action.task',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,plan:{kind:'sequence',target:a.target,maneuvers:a.maneuvers}});
 case 'actor_attack_target':return command('action.task',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,plan:{kind:'attack',targetId:a.targetId,continuous:a.continuous,spell:a.spell}});
 case 'actor_jump':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:'jump',target:a.target});
 case 'actor_interact':return command('action.submit',{actorId:a.actorId,leaseId:a.leaseId,leaseVersion:a.leaseVersion,kind:a.verb,...a.targetId?{target:{entityId:a.targetId,anchorId:'approach'}}:{}});
 case 'action_get':return {worldId,...action()};
 case 'action_cancel':{const act=action(),actor=snap().actors.find(a=>a.actorId===act.actorId),l=actor.controller||act;return command('action.cancel',{actorId:actor.actorId,actionId:act.actionId,leaseId:l.leaseId,leaseVersion:l.leaseVersion});}
 case 'build_preview':return command('build.preview',{baseRevision:a.baseRevision,ops:a.ops});
 case 'build_apply':return command('build.apply',{planId:a.planId});
 case 'build_undo':return command('build.undo',{changeId:a.changeId});
 default:throw Error('CAPABILITY_UNAVAILABLE');
 }
 };
}
