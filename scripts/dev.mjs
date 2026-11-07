import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['server/start.js','--dev'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'})];
let closing=false;
function close(code=0){if(closing)return;closing=true;for(const child of children)child.kill('SIGTERM');process.exitCode=code;}
for(const child of children){child.on('error',()=>close(1));child.on('exit',code=>close(code||0));}
process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
