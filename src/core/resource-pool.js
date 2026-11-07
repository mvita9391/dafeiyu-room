// Scene resources are reference-counted: shared cache materials survive sibling releases.
export class ResourcePool{
 constructor(){this.refs=new Map();}
 retain(root){const items=new Set();root.traverse(o=>{let owner=o;while(owner){if(owner.userData?.localAssetManaged)return;owner=owner.parent;}if(o.isInstancedMesh)items.add(o);if(o.geometry)items.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){items.add(m);for(const v of Object.values(m))if(v?.isTexture)items.add(v);}});for(const r of items)this.refs.set(r,(this.refs.get(r)||0)+1);return items;}
 release(items){for(const r of items){const n=(this.refs.get(r)||0)-1;if(n>0)this.refs.set(r,n);else{this.refs.delete(r);r.dispose?.();}}}
}
