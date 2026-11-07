// Catalog images are static previews. Browsing never acquires a 3D asset lease.
export function appendCatalogPreview(button,meta){
 const doc=button.ownerDocument;
 const fallback=()=>{
  const icon=doc.createElement('span');
  icon.className=meta.local?'catalog-preview catalog-missing':'catalog-icon';
  icon.textContent=meta.local?'图片暂缺':meta.icon;
  return icon;
 };
 const preview=meta.thumbnailURL?doc.createElement('img'):fallback();
 if(meta.thumbnailURL){
  preview.className='catalog-preview';preview.width=preview.height=88;
  preview.alt='';preview.loading='lazy';preview.decoding='async';preview.src=meta.thumbnailURL;
  preview.onerror=()=>preview.replaceWith(fallback());
 }
 const label=doc.createElement('span');label.className='catalog-label';label.textContent=meta.label;
 button.append(preview,label);
}
