"""Read author Unity scenes with UnityPy, preserving original prefab/mesh transforms. Usage: python import-town-scenes.py PACKAGE LOCAL_OUTPUT"""
import sys,pathlib,json,re,math,collections
import UnityPy,tarfile
PACKAGE,OUTPUT=map(pathlib.Path,sys.argv[1:3]);ROOT=OUTPUT/'unity-source';ROOT.mkdir(parents=True,exist_ok=True);guid_index={}
with tarfile.open(PACKAGE) as tar:
 for member in tar.getmembers():
  if not member.name.endswith('/pathname'):continue
  name=tar.extractfile(member).read().decode().split('\n')[0];guid=member.name.split('/')[0];p=pathlib.PurePosixPath(name)
  if p.is_absolute() or '..'in p.parts:raise ValueError('Unsafe package path')
  guid_index[guid]=name
  if p.suffix in ['.unity','.prefab']:
   dest=ROOT/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(tar.extractfile(guid+'/asset').read())
  if p.suffix.lower()=='.fbx':
   dest=(OUTPUT/'source'/p).with_suffix('.fbx.meta');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(tar.extractfile(guid+'/asset.meta').read())
(ROOT/'guid-index.json').write_text(json.dumps(guid_index))
class Asset:
 def __init__(self,path):
  env=UnityPy.load(str(path));self.raw={o.path_id:o for o in env.objects};self.objects={k:{'classId':o.type.value}for k,o in self.raw.items()};f=next(iter(env.files.values()));self.externals=[{'guid':''.join(f'{v&15:x}{v>>4:x}'for v in e.guid),'path':e.path}for e in f.externals]
def obj(asset,record):return asset.raw[next(k for k,v in asset.objects.items() if v is record)].read_typetree()

index=json.load(open(ROOT/'guid-index.json'));manifest=json.load(open(OUTPUT/'manifest.json'));models={a['name']:a for a in manifest['assets']};cache={}
def read(path):
 if path not in cache:
  a=Asset(ROOT/path);a.data={k:obj(a,o) for k,o in a.objects.items() if o['classId'] in [1,4,224,33,1001,23,137]};cache[path]=a
 return cache[path]
def refpath(a,ref):return index.get(a.externals[ref['m_FileID']-1]['guid']) if ref['m_FileID'] else None
I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def mul(a,b):return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]
def matrix(t):
 p=t['m_LocalPosition'];q=t['m_LocalRotation'];s=t['m_LocalScale'];x,y,z,w=(q[k] for k in 'xyzw');sx,sy,sz=(s[k] for k in 'xyz')
 return [(1-2*y*y-2*z*z)*sx,(2*x*y-2*w*z)*sy,(2*x*z+2*w*y)*sz,p['x'],(2*x*y+2*w*z)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*w*x)*sz,p['y'],(2*x*z-2*w*y)*sx,(2*y*z+2*w*x)*sy,(1-2*x*x-2*y*y)*sz,p['z'],0,0,0,1]
def meshname(path,pid):
 text=((OUTPUT/'source')/path).with_suffix('.fbx.meta').read_text();match=re.search(r'^\s+'+str(pid)+r': (.+)$',text,re.M);return match.group(1) if match else None
allreports=[]
for scenePath in sorted(p for p in index.values() if pathlib.Path(p).name in ['Demo_Town.unity','Demo_Beach.unity']):
 scene=read(scenePath);worlds={};instances={};records=[];missing=[]
 def world(pid):
  if not pid:return I
  if pid in worlds:return worlds[pid]
  t=scene.data[pid]
  if 'm_LocalPosition' not in t:
   inst=t['m_PrefabInternal']['m_PathID'];root,localworld=instance(inst);v=localworld(t['m_PrefabParentObject']['m_PathID'])
  else:v=mul(world(t['m_Father']['m_PathID']),matrix(t))
  worlds[pid]=v;return v
 def instance(pid):
  if pid in instances:return instances[pid]
  inst=scene.data[pid];path=refpath(scene,inst['m_ParentPrefab']);pref=read(path);data=json.loads(json.dumps(pref.data));data={int(k):v for k,v in data.items()}
  for m in inst['m_Modification']['m_Modifications']:
   target=m['target']['m_PathID'];prop=m['propertyPath'];v=m['value'];d=data.get(target)
   if d is None:
    roots=[v for v in data.values() if 'm_LocalPosition'in v and not v['m_Father']['m_PathID']]
    if len(roots)==1 and (prop.startswith('m_Local') or prop=='m_RootOrder'):d=roots[0];missing.append(['repaired-stale-root-id',path,target,prop])
    else:missing.append(['mod-target',path,target,prop]);continue
   keys=prop.split('.')
   try:
    for k in keys[:-1]:d=d[k]
    old=d.get(keys[-1]);d[keys[-1]]=float(v) if isinstance(old,(float,int)) and v else v
   except (KeyError,TypeError):pass
  parent=world(inst['m_Modification']['m_TransformParent']['m_PathID']);localcache={}
  def localworld(tid):
   if not tid:return parent
   if tid not in localcache:
    t=data[tid];localcache[tid]=mul(localworld(t['m_Father']['m_PathID']),matrix(t))
   return localcache[tid]
  instances[pid]=(data,localworld)
  for oid,o in pref.objects.items():
   if o['classId'] not in [33,137]:continue
   f=data[oid];go=data[f['m_GameObject']['m_PathID']]
   if not go.get('m_IsActive',1):continue
   transform=next((d for d in data.values() if d.get('m_GameObject')==f['m_GameObject'] and 'm_LocalPosition'in d),None)
   tid=next(k for k,v in data.items() if v is transform)
   mp=refpath(pref,f['m_Mesh'])
   if not mp:
    matches=[p for p in index.values() if p.endswith('.fbx') and pathlib.Path(p).stem==go['m_Name']]
    if len(matches)==1:mp=matches[0];missing.append(['repaired-stale-mesh-guid',path,mp])
   if not mp or pathlib.Path(mp).stem not in models:missing.append(['mesh',path,mp]);continue
   a=models[pathlib.Path(mp).stem];mn=meshname(mp,f['m_Mesh']['m_PathID'])
   if not mn:missing.append(['mesh-id',mp,f['m_Mesh']]);continue
   m=localworld(tid);reflect=[-1,1,1,1];m=[m[r*4+c]*reflect[r]*reflect[c] for r in range(4) for c in range(4)]
   records.append({'id':str(pid)+'-'+str(oid),'type':a['type'],'mesh':mn,'matrix':[m[r*4+c] for c in range(4) for r in range(4)],'prefab':pathlib.Path(path).stem,'category':a['category'],'sourceInstance':pid})
  return data,localworld
 for pid,o in scene.objects.items():
  if o['classId']==1001:instance(pid)
 for oid,o in scene.objects.items():
  if o['classId']!=33:continue
  f=scene.data[oid];mp=refpath(scene,f['m_Mesh'])
  tid=next((k for k,d in scene.data.items() if 'm_LocalPosition'in d and d.get('m_GameObject')==f['m_GameObject']),None)
  if not mp or tid is None:missing.append(['native-mesh',oid]);continue
  a=models[pathlib.Path(mp).stem];m=world(tid);reflect=[-1,1,1,1];m=[m[r*4+c]*reflect[r]*reflect[c]for r in range(4)for c in range(4)]
  records.append({'id':'native-'+str(oid),'type':a['type'],'mesh':meshname(mp,f['m_Mesh']['m_PathID']),'matrix':[m[r*4+c]for c in range(4)for r in range(4)],'prefab':'native scene mesh','category':a['category'],'sourceInstance':None})
 name=pathlib.Path(scenePath).stem;report={'id':name,'instanceCount':len(instances),'meshCount':len(records),'missing':missing,'records':records};(OUTPUT/(name+'.json')).write_text(json.dumps(report,indent=2));allreports.append({k:v for k,v in report.items() if k!='records'})
(OUTPUT/'author-scene-index.json').write_text(json.dumps(allreports,indent=2));print(json.dumps(allreports,indent=2))
