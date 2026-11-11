import {PET_SKILL_CHOICES} from './pet-skills.js';
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
 cmd('build.resetScene',obj({sceneId:idSchema,baseRevision:rev})),
 cmd('build.resetWorld',obj({baseRevision:rev})),
 cmd('build.preview',obj({baseRevision:rev,ops:z.array(buildOperationSchema).min(1).max(20)})),
 cmd('build.apply',obj({planId:idSchema})),cmd('build.undo',obj({changeId:idSchema})),
 cmd('action.submit',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,kind:z.enum(['move','sit','sleep','swim','slide','eat','cancel','jump','climbTree','maneuver','computer']),gait:z.enum(GAITS).optional(),maneuver:z.enum(MANEUVERS).optional(),...spellFields,heading:z.number().finite().optional(),target:destination.optional(),foodId:z.enum(Object.keys(FOODS)).optional()})),
 cmd('action.task',task),
 cmd('battle.start',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,sequence:z.number().int().positive()})),
 cmd('battle.choose',obj({actorId:idSchema,battleId:idSchema,turn:rev,choice:z.enum([...PET_SKILL_CHOICES,'wait']),unitId:idSchema.optional(),target:idSchema.optional()})),
 cmd('battle.leave',obj({actorId:idSchema,battleId:idSchema})),
 cmd('pet.import',obj({actorId:idSchema,localVersion:z.number().int().optional(),followPetId:idSchema.nullable().optional(),battlePetId:idSchema.nullable().optional(),
  pets:z.array(obj({petId:idSchema,speciesId:idSchema,nickname:z.string().min(1).max(24).optional(),level:z.number().int().min(1).max(50).optional(),exp:z.number().int().min(0).optional(),bond:z.number().int().min(0).max(100).optional(),evolved:z.boolean().optional(),learnedSkills:z.array(idSchema).max(12).optional(),skillLoadout:z.array(idSchema).max(4).optional(),homeSceneId:idSchema.optional(),homePosition:vectorSchema.optional(),bondWindowStart:z.number().finite().optional(),bondWindowPoints:z.number().int().min(0).max(10).optional()})).min(1).max(20)})),
 cmd('pet.bootstrap',obj({actorId:idSchema})),
 cmd('pet.hatchEgg',obj({actorId:idSchema,eggId:idSchema})),
 cmd('item.import',obj({actorId:idSchema,state:z.object({}).passthrough()})),
 cmd('item.moveSlot',obj({actorId:idSchema,from:z.number().int().nonnegative(),to:z.number().int().nonnegative()})),
 cmd('item.poop',obj({actorId:idSchema,sceneId:idSchema,position:vectorSchema})),
 cmd('item.pickup',obj({actorId:idSchema,itemId:idSchema})),
 cmd('item.drop',obj({actorId:idSchema,type:idSchema,sceneId:idSchema,position:vectorSchema})),
 cmd('item.compost',obj({actorId:idSchema})),
 cmd('item.collect',obj({actorId:idSchema})),
 cmd('pet.settlePoops',obj({actorId:idSchema,sceneId:idSchema})),
 cmd('pet.setPoopSpeed',obj({actorId:idSchema,petId:idSchema,speed:z.enum(['slow','normal','fast'])})),
 cmd('pet.feed',obj({actorId:idSchema,petId:idSchema,foodId:idSchema.optional()})),
 cmd('pet.rename',obj({actorId:idSchema,petId:idSchema,name:z.string().min(1).max(24)})),
 cmd('pet.syncPositions',obj({actorId:idSchema,positions:z.array(obj({petId:idSchema,sceneId:idSchema,position:vectorSchema})).max(20)})),
 cmd('pet.setMode',obj({actorId:idSchema,petId:idSchema,mode:z.enum(['follow','standby']),homeSceneId:idSchema.optional(),homePosition:vectorSchema.optional()})),
 cmd('pet.setBattle',obj({actorId:idSchema,petId:idSchema.nullable()})),
 cmd('pet.pet',obj({actorId:idSchema,petId:idSchema})),
 cmd('pet.evolve',obj({actorId:idSchema,petId:idSchema})),
 cmd('actor.teleport',z.union([
  obj({actorId:idSchema,sceneId:idSchema,landmarkId:idSchema.optional()}),
  obj({actorId:idSchema,templateId:z.literal('forest_v1'),landmarkId:idSchema}),
 ])),
 cmd('actor.input',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev,frames:z.array(obj({sequence:z.number().int().positive(),jump:z.boolean().optional(),dtMs:z.number().finite().min(0).max(50),direction:z.tuple([z.number().finite().min(-1).max(1),z.number().finite().min(-1).max(1)]),sprint:z.boolean().optional(),crawl:z.boolean().optional(),boxing:z.boolean().optional(),dive:z.boolean().optional()})).min(1).max(120)})),
 cmd('action.cancel',obj({actorId:idSchema,actionId:idSchema,leaseId:idSchema,leaseVersion:rev})),
 cmd('control.renew',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev})),cmd('control.release',obj({actorId:idSchema,leaseId:idSchema,leaseVersion:rev})),
 cmd('control.acquire',obj({actorId:idSchema})),cmd('control.takeover',obj({actorId:idSchema})),
 cmd('events.ack',obj({cursor:rev}))]);
export function validateCommand(command){const result=commandSchema.safeParse(command);return result.success?{ok:true,errors:[]}:{ok:false,errors:result.error.issues.map(i=>({path:i.path.join('.'),code:i.code,message:i.message}))};}
