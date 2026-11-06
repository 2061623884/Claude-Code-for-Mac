const {app,BrowserWindow}=require('electron');const fs=require('fs');const path=require('path');
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
fs.mkdirSync('/tmp/crab-preview',{recursive:true});
require('esbuild').buildSync({entryPoints:['src/renderer/components/newSession/Crab.tsx'],outfile:'/tmp/crab-preview/crab.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic'});
const {Crab}=require('/tmp/crab-preview/crab.cjs');
const groups=['thinking','cooking','making','sorting','growing','exploring','playing'];
app.whenReady().then(async()=>{const win=new BrowserWindow({width:360,height:240,show:false,webPreferences:{offscreen:true}});
for(const gesture of groups){const svg=renderToStaticMarkup(React.createElement(Crab,{pose:gesture==='thinking'?'thinking':'working',gesture}));const css=fs.readFileSync('src/renderer/styles/theme.css','utf8');
const html=`<html><style>${css}</style><style>body{margin:0;background:#faf8f4;display:flex;align-items:center;justify-content:center;height:240px}svg.crab{width:260px;height:170px}svg,svg *{transition:none!important}svg *{animation-play-state:paused!important}</style><body>${svg}</body></html>`;
await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
// Verify the actual-size still and motion settings in Chromium before exporting.
const still = await win.webContents.executeJavaScript(`(() => {
  document.documentElement.dataset.reduceMotion = 'true';
  const svg = document.querySelector('svg.crab');
  svg.style.width = '78px'; svg.style.height = '51px';
  const eyes = [...svg.querySelectorAll('.crab-gaze rect')];
  const ok = eyes.length === 2 && eyes.every(eye => {
    const box = eye.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2;
  }) && svg.getAnimations({subtree:true}).length === 0;
  if (!ok) return JSON.stringify({eyes:eyes.map(e=>e.getBoundingClientRect().toJSON()),animations:svg.getAnimations({subtree:true}).map(a=>a.animationName)});
  delete document.documentElement.dataset.reduceMotion;
  svg.style.removeProperty('width'); svg.style.removeProperty('height');
  return ok;
})()`);
if (still !== true) throw Error(gesture + JSON.stringify(still));
const gazeMoves = await win.webContents.executeJavaScript(`(() => {
 const gaze = document.querySelector('.crab-gaze');
 const eye = gaze.lastElementChild;
 const poses = new Set();
 for (let t=0; t<4000; t+=125) {
   for (const a of document.getAnimations()) { a.pause(); a.currentTime=t; }
   poses.add(getComputedStyle(gaze).transform+' '+getComputedStyle(eye).transform);
 }
 return poses.size > 1;
})()`);
if (!gazeMoves) throw Error('Gaze did not move: '+gesture);
const dir='/tmp/crab-preview/'+gesture;fs.mkdirSync(dir,{recursive:true});
for(let i=0;i<32;i++){await win.webContents.executeJavaScript(`document.getAnimations().forEach(a=>{a.pause();a.currentTime=${i*125}})`);await new Promise(r=>setTimeout(r,25));const image=await win.webContents.capturePage();fs.writeFileSync(path.join(dir,`${i}.png`),image.toPNG());}
}win.destroy();app.quit()}).catch(e=>{console.error(e);app.exit(1)})
