"""Local-only Unity FBX import. Run with Blender -b --python this.py -- PACKAGE OUTPUT.
No Unity scripts are extracted/executed. OUTPUT must stay outside public assets.
"""
import sys, pathlib, tarfile, json, hashlib, re
import bpy
from mathutils import Vector
package, output = map(pathlib.Path, sys.argv[sys.argv.index('--')+1:])
output=output.resolve(); source=output/'source'; models=output/'models'; models.mkdir(parents=True,exist_ok=True)
with tarfile.open(package) as tar:
    for item in tar.getmembers():
        if not item.name.endswith('/pathname'): continue
        name=tar.extractfile(item).read().decode().split('\n')[0].rstrip('\0')
        p=pathlib.PurePosixPath(name)
        if p.is_absolute() or '..' in p.parts: raise ValueError('Unsafe pathname')
        if p.suffix.lower() not in ('.fbx','.png'): continue
        try: data=tar.extractfile(item.name.rsplit('/',1)[0]+'/asset').read()
        except KeyError: continue
        target=source/p; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
textures={p.stem:p for p in source.rglob('*.png') if p.parent.name=='Textures'}
assets=[]
for index,path in enumerate(sorted(source.rglob('*.fbx'))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(path),use_anim=False)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bounds=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3))); hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    # Blender is Z-up; GLB export is Y-up. Preserve metres and normalize ground-centre pivot.
    shift=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))
    for obj in bpy.context.scene.objects:
        if obj.parent is None: obj.location+=shift
    material_names=[]
    for mat in bpy.data.materials:
        base=re.sub(r'\.\d+$','',mat.name); material_names.append(base)
        texture='GlossyColors' if 'Glossy' in base else 'Floor' if 'Floor' in base else 'Colors'
        mat.use_nodes=True; nodes=mat.node_tree.nodes; nodes.clear()
        bs=nodes.new('ShaderNodeBsdfPrincipled'); out=nodes.new('ShaderNodeOutputMaterial'); mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
        bs.inputs['Roughness'].default_value=.35 if texture=='GlossyColors' else .85
        tex=nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(textures[texture]),check_existing=True); tex.interpolation='Closest'
        mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        if base=='Alpha': mat.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
        if texture=='Colors' and 'Colors_Emission' in textures:
            em=nodes.new('ShaderNodeTexImage'); em.image=bpy.data.images.load(str(textures['Colors_Emission']),check_existing=True); em.interpolation='Closest'
            mat.node_tree.links.new(em.outputs['Color'],bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value=.35
    relative=path.relative_to(source); parts=relative.parts; category=parts[parts.index('Models')+1]
    slug=re.sub('[^a-z0-9]+','-',path.stem.lower()).strip('-'); key='town-'+slug
    if any(a['type']==key for a in assets): key+='-'+hashlib.sha256(str(relative).encode()).hexdigest()[:6]
    dest=models/(key+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(dest),export_format='GLB',export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
    size=hi-lo
    assets.append(dict(type=key,name=path.stem,category=category,file='models/'+dest.name,dimensions=[round(size.x,6),round(size.z,6),round(size.y,6)],sourcePivot=[round(v,6) for v in lo],materials=material_names,meshCount=len(meshes),vertices=sum(len(o.data.vertices) for o in meshes),uvMeshes=sum(bool(o.data.uv_layers) for o in meshes),bytes=dest.stat().st_size))
    print('CONVERTED',index+1,key,flush=True)
manifest={'version':1,'license':'local-user-supplied','assets':assets}
(output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('COMPLETE',len(assets),sum(a['bytes'] for a in assets),flush=True)
