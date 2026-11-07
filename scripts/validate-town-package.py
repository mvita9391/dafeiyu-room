"""Read-only bounded Unity archive preflight. Never extracts or executes package files."""
import sys, pathlib, tarfile, gzip, hashlib, re, json
SUPPORTED='f830be48858b060063e3d4aad8535a933770f00b873e0965c3869a4f62fa76f2'
MAX_EXPANDED=512*1024*1024
class Invalid(Exception):pass
class LimitedReader:
 def __init__(self,raw):self.raw=raw;self.total=0
 def read(self,n=-1):
  if n<0:n=65536
  data=self.raw.read(min(n,MAX_EXPANDED-self.total+1));self.total+=len(data)
  if self.total>MAX_EXPANDED:raise Invalid('UNSAFE_PACKAGE')
  return data

def validate(file,expected=SUPPORTED):
 if pathlib.Path(file).stat().st_size>32*1024*1024:raise Invalid('UNSAFE_PACKAGE')
 seen=set();paths=set();count=0;expanded=0
 with open(file,'rb') as probe:is_gzip=probe.read(2)==b'\x1f\x8b'
 with (gzip.open(file,'rb') if is_gzip else open(file,'rb')) as compressed:
  bounded=LimitedReader(compressed)
  with tarfile.open(fileobj=bounded,mode='r|') as tar:
   for member in tar:
    count+=1;expanded+=member.size
    if count>5000 or expanded>MAX_EXPANDED or member.size>64*1024*1024:raise Invalid('UNSAFE_PACKAGE')
    name=member.name.rstrip('/')
    if name in seen or name!='.icon.png' and not re.fullmatch(r'[a-f0-9]{32}(?:/(?:asset|asset.meta|pathname|preview.png))?',name):raise Invalid('UNSAFE_PACKAGE')
    seen.add(name)
    if not(member.isdir() or member.isreg()):raise Invalid('UNSAFE_PACKAGE')
    if member.name.endswith('/pathname'):
     if member.size>4096:raise Invalid('UNSAFE_PACKAGE')
     raw=tar.extractfile(member).read().decode('utf-8');value,separator,tail=raw.partition('\n');value=value.rstrip('\x00\r')
     if separator and not re.fullmatch(r'[0\x00\r\n]*',tail):raise Invalid('UNSAFE_PACKAGE')
     p=pathlib.PurePosixPath(value)
     if '\\'in value or ':'in value or '\x00'in value or '\n'in value or '\r'in value or p.is_absolute() or '..'in p.parts or '.'in value.split('/') or not value.startswith('Assets/') or '//'in value or value in paths:raise Invalid('UNSAFE_PACKAGE')
     paths.add(value)
  # Count trailing expanded data too; gzip bombs cannot hide after the tar EOF.
  while bounded.read(65536):pass
 with open(file,'rb')as f:digest=hashlib.file_digest(f,'sha256').hexdigest() if hasattr(hashlib,'file_digest') else hashlib.sha256(f.read()).hexdigest()
 if digest!=expected:raise Invalid('UNSUPPORTED_PACKAGE')
 return {'files':count,'expandedBytes':expanded,'sourcePaths':len(paths),'version':'1.0','sha256':digest}
if __name__=='__main__':
 try:print(json.dumps(validate(sys.argv[1])))
 except Invalid as e:print('PACK_ERROR:'+str(e),file=sys.stderr);sys.exit(2)
 except Exception:print('PACK_ERROR:UNSAFE_PACKAGE',file=sys.stderr);sys.exit(2)
