import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import path from 'path';
const [,, serveUrl, outDir, ...jobs] = process.argv; // jobs: Comp:frame
const browser = await openBrowser('chrome', {browserExecutable:'/tmp/chromium', chromiumOptions:{gl:'swangle'}});
const cache={};
for (const j of jobs){
  const [id,fr]=j.split(':');
  cache[id] ??= await selectComposition({serveUrl,id,puppeteerInstance:browser,browserExecutable:'/tmp/chromium'});
  const t=Date.now();
  await renderStill({composition:cache[id],serveUrl,frame:+fr,output:path.join(outDir,`${id}-${fr}.jpg`),imageFormat:'jpeg',scale:0.4,puppeteerInstance:browser,chromiumOptions:{gl:'swangle'},timeoutInMilliseconds:120000});
  console.log('ok',j,((Date.now()-t)/1000).toFixed(1)+'s');
}
await browser.close({silent:true});
