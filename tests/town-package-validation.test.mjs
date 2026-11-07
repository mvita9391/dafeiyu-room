import test from'node:test';import assert from'node:assert/strict';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
test('tar preflight accepts known pathname suffix and rejects traversal, duplicate and expansion attacks',()=>{
 const validator=fileURLToPath(new URL('../scripts/validate-town-package.py',import.meta.url));
 const code=String.raw`import runpy,tarfile,tempfile,pathlib,io,hashlib,json,gzip
v=runpy.run_path(__import__('sys').argv[1]);validate=v['validate'];bad=v['Invalid'];root=pathlib.Path(tempfile.mkdtemp());g='a'*32;results=[]
def archive(entries,gz=False):
 p=root/'sample';
 with tarfile.open(p,'w:gz' if gz else 'w') as t:
  for name,data,kind in entries:
   x=tarfile.TarInfo(name);x.type=kind;x.size=len(data) if kind==tarfile.REGTYPE else 0
   if kind==tarfile.SYMTYPE:x.linkname='/secret'
   t.addfile(x,io.BytesIO(data) if x.size else None)
 return p
def check(entries,expected,gz=False):
 p=archive(entries,gz);digest=hashlib.sha256(p.read_bytes()).hexdigest()
 try:validate(p,digest);result='ok'
 except bad as e:result=str(e)
 assert result==expected,(entries,result);results.append(result)
check([(g+'/pathname',b'Assets/Pack/Model.fbx\n00',tarfile.REGTYPE)],'ok')
check([(g+'/pathname',b'Assets/Pack/Model.fbx\n',tarfile.REGTYPE)],'ok',True)
for value in [b'../secret',b'/Assets/secret',b'Assets/../secret',b'C:\\secret',b'Assets/Pack\\secret',b'Assets//secret',b'Assets/./secret',b'Assets/x\nother']:
 check([(g+'/pathname',value,tarfile.REGTYPE)],'UNSAFE_PACKAGE')
check([('../asset',b'x',tarfile.REGTYPE)],'UNSAFE_PACKAGE')
check([(g+'/asset',b'x',tarfile.SYMTYPE)],'UNSAFE_PACKAGE')
check([(g+'/asset',b'x',tarfile.REGTYPE)]*2,'UNSAFE_PACKAGE')
check([(g+'/pathname',b'Assets/x',tarfile.REGTYPE),('b'*32+'/pathname',b'Assets/x',tarfile.REGTYPE)],'UNSAFE_PACKAGE')
check([(('%032x'%i)+'/asset',b'',tarfile.REGTYPE)for i in range(5001)],'UNSAFE_PACKAGE')
p=archive([(g+'/asset',b'x'*5000,tarfile.REGTYPE)],True);validate.__globals__['MAX_EXPANDED']=2048
try:validate(p,hashlib.sha256(p.read_bytes()).hexdigest());raise AssertionError('gzip expansion accepted')
except bad:results.append('UNSAFE_PACKAGE')
__import__('shutil').rmtree(root);print(json.dumps(results))`;
 const results=JSON.parse(execFileSync('python3',['-c',code,validator],{encoding:'utf8',timeout:15000}));assert.equal(results.length,16);assert.equal(results.filter(r=>r==='ok').length,2);
});
