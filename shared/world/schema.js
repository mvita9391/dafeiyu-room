import {z} from 'zod';
import {TEMPLATE_IDS} from './templates.js';
import {ASSET_TYPES} from './catalog.js';
import {GAITS,MANEUVERS,SEQUENCE_MANEUVERS} from './maneuvers.js';
import {SPELLS} from './spells.js';
import {FOODS} from './foods.js';
const obj=shape=>z.object(shape).strict();
export const idSchema=z.string().min(1).max(128).regex(/^[\w.-]+$/);
export const vectorSchema=z.tuple([z.number().finite(),z.number().finite(),z.number().finite()]);
export const spellFields={
 slot:z.number().int().min(1).max(SPELLS.length).optional(),
 groundPosition:z.tuple([z.number().finite(),z.number().finite()]).optional(),
};
const rev=z.number().int().nonnegative();
const transform={position:vectorSchema,rotation:z.number().finite(),scale:z.tuple([z.number().positive().max(4),z.number().positive().max(4),z.number().positive().max(4)])};
const end=obj({sceneId:idSchema,slotId:idSchema});
export const buildOperationSchema=z.discriminatedUnion('kind',[
 obj({kind:z.literal('scene.create'),ref:idSchema,templateId:z.string().refine(id=>TEMPLATE_IDS.includes(id),"Unknown template"),name:z.string().min(1).max(80),style:z.enum(['cozy','natural']).optional()}),
 obj({kind:z.literal('portal.link'),from:end,to:end}),
 obj({kind:z.literal('entity.add'),ref:idSchema,sceneId:idSchema,type:z.string().refine(type=>ASSET_TYPES.includes(type),"Unknown asset"),...transform,supportEntityId:idSchema.optional(),supportAnchorId:idSchema.optional()}),
 obj({kind:z.literal('entity.transform'),entityId:idSchema,...transform}),obj({kind:z.literal('entity.remove'),entityId:idSchema})]);
const destination=z.union([obj({sceneId:idSchema,groundPosition:z.tuple([z.number().finite(),z.number().finite()])}),obj({sceneId:idSchema,landmarkId:idSchema}),obj({sceneId:idSchema,position:vectorSchema}),obj({entityId:idSchema,anchorId:idSchema}),obj({sceneId:idSchema})]);
export const taskSequenceFields={
 target:destination,
 maneuvers:z.array(z.enum(SEQUENCE_MANEUVERS)).min(1).max(8),
};
export const taskAttackFields={
 targetId:idSchema,
 continuous:z.boolean().optional(),
 spell:z.enum(SPELLS.map(spell=>spell.id)).optional().describe('指定攻击目标所用的魔法。省略时轮换可用技能。'),
};
const task=obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,plan:z.discriminatedUnion('kind',[
 obj({kind:z.literal('sequence'),...taskSequenceFields}),
 obj({kind:z.literal('attack'),...taskAttackFields}),
])});
const base={worldId:idSchema,requestId:idSchema};
const cmd=(kind,payload)=>obj({...base,kind:z.literal(kind),payload});
export const commandSchema=z.discriminatedUnion('kind',[
 cmd('build.editLock',obj({sceneId:idSchema,locked:z.boolean()})),
 cmd('build.preview',obj({baseRevision:rev,ops:z.array(buildOperationSchema).min(1).max(20)})),
 cmd('build.apply',obj({planId:idSchema})),cmd('build.undo',obj({changeId:idSchema})),
 cmd('action.submit',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,kind:z.enum(['move','sit','sleep','swim','slide','eat','cancel','jump','climbTree','maneuver','computer']),gait:z.enum(GAITS).optional(),maneuver:z.enum(MANEUVERS).optional(),...spellFields,heading:z.number().finite().optional(),target:destination.optional(),foodId:z.enum(Object.keys(FOODS)).optional()})),
 cmd('action.task',task),
 cmd('actor.teleport',obj({actorId:idSchema,sceneId:idSchema})),
 cmd('actor.input',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,frames:z.array(obj({sequence:z.number().int().positive(),jump:z.boolean().optional(),dtMs:z.number().finite().min(0).max(50),direction:z.tuple([z.number().finite().min(-1).max(1),z.number().finite().min(-1).max(1)]),sprint:z.boolean().optional(),crawl:z.boolean().optional(),boxing:z.boolean().optional()})).min(1).max(120)})),
 cmd('action.cancel',obj({actorId:idSchema,actionId:idSchema,leaseId:idSchema,leaseVersion:rev})),
 cmd('control.renew',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev})),cmd('control.release',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev})),
 cmd('control.acquire',obj({actorId:idSchema})),cmd('control.takeover',obj({actorId:idSchema})),
 cmd('events.ack',obj({cursor:rev}))]);
export function validateCommand(command){const result=commandSchema.safeParse(command);return result.success?{ok:true,errors:[]}:{ok:false,errors:result.error.issues.map(i=>({path:i.path.join('.'),code:i.code,message:i.message}))};}
