import {DatabaseSync} from 'node:sqlite';
import {writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {readBundledModels} from '../server/local-assets.js';
import {createStarterWorld,STARTER_SCENES} from '../server/world/starter.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{database:{type:'string'},output:{type:'string'}}});
const database=resolve(root,values.database||'data/game.sqlite');
const output=resolve(root,values.output||'shared/world/starter-world.json');
const db=new DatabaseSync(database,{readOnly:true});
try{
 const row=db.prepare('SELECT snapshot FROM worlds WHERE world_id=?').get('default');
 if(!row)throw Error('WORLD_NOT_FOUND');
 const snapshot=JSON.parse(row.snapshot);
 // Apply the declared four-scene export boundary before checking private assets.
 // Private content inside a published scene still fails closed.
 const publicSnapshot={...snapshot,scenes:snapshot.scenes.filter(s=>STARTER_SCENES.includes(s.sceneId)),entities:snapshot.entities.filter(e=>STARTER_SCENES.includes(e.sceneId))};
 readBundledModels(publicSnapshot.entities);
 const starter=createStarterWorld(publicSnapshot);
 writeFileSync(`${output}.tmp`,JSON.stringify(starter,null,2)+'\n');renameSync(`${output}.tmp`,output);
 console.log(`已更新发布默认布局：${starter.scenes.map(s=>`${s.name} ${s.entities.length} 件家具`).join('、')}。`);
 console.log('运行存档未修改；未导出人物状态、会话、授权、事件和操作记录。');
 const skipped=snapshot.scenes.filter(s=>!STARTER_SCENES.includes(s.sceneId)).length;
 if(skipped)console.log(`另有 ${skipped} 个运行场景未发布；此命令只发布卧室、客厅、院子和便利店。`);
 console.log('请检查配置差异并提交代码后再发布仓库。');
}finally{db.close();}
