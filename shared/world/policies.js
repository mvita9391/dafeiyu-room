/** X/Z are ground axes, Y is vertical; all angles are radians. Engine-owned. */
export const RULES_VERSION = 'world-v1';
export const WORLD_LIMITS = Object.freeze({scenes:8,entitiesPerScene:100,operationsPerBuild:20,grid:0.25,rotationStep:Math.PI/12});
const common={az:Math.PI/4,el:Math.atan(1/Math.SQRT2),distance:26,targetY:1.05,groundY:0};
const indoor=Object.freeze({...common,id:'indoor_fixed_v1',horizontalRotation:false,horizontalDragLimit:Math.PI*8/180});
const outdoor=Object.freeze({...common,id:'outdoor_orbit_v1',horizontalRotation:true});
const localOutdoor=Object.freeze({...outdoor,distance:180,far:700});
const townOutdoor=Object.freeze({...localOutdoor,el:28*Math.PI/180});
export function cameraPolicyFor(templateId){
 if(['cozy_room_v1','bedroom','room','living'].includes(templateId))return indoor;
 if(templateId==='forest_v1')return outdoor;
 if(templateId==='local_author_town_v1')return townOutdoor;
 if(templateId.startsWith('local_'))return localOutdoor;
 if(['courtyard_v1','yard','street_corner_v1','convenience-store','coastal_town_v1','seaside-town'].includes(templateId))return outdoor;
 throw new RangeError(`Unknown template: ${templateId}`);
}
export const canonicalSceneId=id=>id==='room'?'bedroom':id;
