// Isolated browser and localhost-only server. Run with Playwright available in NODE_PATH.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DIST=path.join(ROOT,'dist');
const report={checks:[],pageErrors:[],externalRequests:[],failedResponses:[],consoleErrors:[]};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(DIST,pathname.slice('/BuYi/'.length)||'index.html');
  if(!pathname.startsWith('/BuYi/')||!file.startsWith(DIST+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404);res.end();return;
  }
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.pdf':'application/pdf'}[path.extname(file)]||'text/plain';
  res.writeHead(200,{'Content-Type':mime});res.end(fs.readFileSync(file));
});
let browser;
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+'/BuYi/';
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();report.externalRequests.push(u);return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',e=>report.pageErrors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)report.failedResponses.push({url:r.url(),status:r.status()});});
  async function app(name){
    await page.goto(base+'#'+name);
    await page.waitForFunction(n=>{const f=document.getElementById('app-frame');return f?.contentWindow?.TCMSuite&&f?.contentDocument?.documentElement.dataset.suiteApp===n&&document.getElementById('load-status').hidden;},name);
    return page.frames().find(f=>f.url().includes('/apps/'+name+'.html'));
  }
  await check('home resources resolve under /BuYi/',async()=>{await page.goto(base);await page.locator('#home-view').waitFor({state:'visible'});assert.match(await page.locator('#formula-coverage').textContent(),/160/);});
  let f=await app('formulas');
  await check('formula search and deep route work',async()=>{
    assert.equal(await f.locator('.formula-button').count(),160);
    await page.locator('#formula-query').fill('gzt');await page.locator('#formula-query').press('Enter');await f.locator('[data-card="84"]').click();
    assert.equal(await f.locator('#reader-title').textContent(),'桂枝汤');
    await page.waitForURL('**/BuYi/#formulas/card/84');
  });
  await check('formula prose is restored while private note paths stay absent',async()=>{
    const data=await f.evaluate(()=>CardLibrary.data);
    const original=JSON.parse(fs.readFileSync(path.join(ROOT,'originals/formulas.html'),'utf8').match(/<script id="card-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    for(const card of data.cards){const before=original.cards.find(c=>c.id===card.id);assert.equal(card.dose,before.dose);assert.equal(card.method,before.method);assert.deepEqual(card.back,before.back);assert.equal(card.path,undefined);}
    assert.equal(await f.locator('#reader-dose').textContent(),original.cards.find(c=>c.id===84).dose);
    await page.locator('#formula-query').fill('桂枝加桂汤');await page.locator('#formula-query').press('Enter');
    await f.locator('[data-card="84"]').click();
    assert(!((await f.locator('#reader').textContent()).includes('undefined')));
  });
  f=await app('meridians');
  await check('embedded atlas loads without model or annotation fallback',async()=>{
    await f.locator('#loading').waitFor({state:'hidden',timeout:30000});
    assert.equal(await f.locator('#canvas-host canvas').count(),1);assert.equal(await f.locator('#failure').isVisible(),false);
  });
  await check('point selection, PDF, audio and guide work under /BuYi/',async()=>{
    await page.locator('#meridian-query').fill('ST36');await page.locator('#meridian-query').press('Enter');await f.locator('#point-results button').first().click();
    assert.match(await f.locator('#selected-name').textContent(),/足三里/);
    await f.locator('#tab-source').click();
    const local=await f.locator('a[href]').evaluateAll(as=>as.map(a=>a.getAttribute('href')).filter(h=>h.startsWith('obsidian:')||decodeURIComponent(h).includes('源文件和材料')));
    assert.deepEqual(local,[]);assert(await f.locator('#speak-point').isEnabled());
    assert.equal(await f.locator('.cun-illustration').count(),3);
    const pdf=await f.locator('a[href*="lecture.pdf"]').first().getAttribute('href');
    const pdfUrl=new URL(pdf,f.url());assert.equal(pdfUrl.pathname,'/BuYi/assets/lecture.pdf');
    const response=await context.request.head(pdfUrl.href);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/application\/pdf/);
    await f.locator('#speak-point').click();await f.waitForFunction(()=>document.getElementById('speak-point').getAttribute('aria-pressed')==='true');await f.locator('#speak-point').click();
    const data=await f.evaluate(()=>window.__PILOT_ASSETS__.annotations);
    assert(data.points.every(p=>p.location&&p.location!=='来源文字的公开许可未确认，暂不提供。'));
  });
  f=await app('wuxing');
  await check('wuxing rotation and private-note replacement work',async()=>{
    const n=await f.evaluate(()=>TCMRotation.target);await f.locator('#cw').click();assert.equal(await f.evaluate(()=>TCMRotation.target),n+1);
    assert.match(await f.evaluate(()=>WuXing.source.source_text),/未包含私人笔记/);
    assert.equal(await f.evaluate(()=>WuXing.source.source_snapshot),'');
    assert.equal(await f.evaluate(()=>WuXing.source.blocks.length),7);
  });
  await check('standalone module works under /BuYi/',async()=>{
    await page.goto(base+'apps/meridians.html');await page.locator('#loading').waitFor({state:'hidden',timeout:30000});
    assert.equal(await page.locator('#canvas-host canvas').count(),1);assert.equal(await page.locator('#failure').isVisible(),false);
  });
  await check('desktop home and theme render',async()=>{await page.setViewportSize({width:1280,height:900});await page.goto(base);await page.locator('#theme-toggle').click();assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'true');});
  await check('rights notice provides the public contact',async()=>{await page.goto(base+'#about');await page.locator('#about-view').waitFor({state:'visible'});assert.equal(await page.locator('#rights-notice a').getAttribute('href'),'mailto:joefeng66@gmail.com');assert.match(await page.locator('#rights-notice').textContent(),/更正或下架/);});
  await check('no failed requests, JavaScript errors or external runtime dependencies',async()=>{
    assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.failedResponses,[]);assert.deepEqual(report.externalRequests,[]);
  });
  report.passed=true;
})().catch(e=>{report.passed=false;report.error=String(e.stack||e);console.error(e);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await new Promise(r=>server.close(r));
  fs.mkdirSync(path.join(ROOT,'.release-private'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'.release-private/browser-verification.json'),JSON.stringify(report,null,2)+'\n');
});
