import {randomUUID} from 'node:crypto';
export const acquireControl=(service,principal,{worldId='default',actorId,requestId=randomUUID()})=>service.execute(principal,{worldId,requestId,kind:'control.acquire',payload:{actorId}});
export const takeOver=(service,owner,{worldId='default',actorId,requestId=randomUUID()})=>service.execute(owner,{worldId,requestId,kind:'control.takeover',payload:{actorId}});
