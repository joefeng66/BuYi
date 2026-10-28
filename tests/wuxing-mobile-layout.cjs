// Local browser regression checks. These are desktop engines, not iPhone hardware.
const pw=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DIST=path.join(ROOT,'dist');
const value=(key,fallback)=>process.argv.find(arg=>arg.startsWith('--'+key+'='))?.split('=')[1]||fallback;
const phase=value('phase','after'),engine=value('engine','webkit');
const OUT=path.join(ROOT,'.release-private/wuxing-layout',phase+'-'+engine);fs.mkdirSync(OUT,{recursive:true});
const allowed=new Set([...Object.keys(JSON.parse(fs.readFileSync(path.join(DIST,'release-manifest.json'))).files),'release-manifest.json']);
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const name=pathname.startsWith('/BuYi/')?decodeURIComponent(pathname.slice(6))||'index.html':'';
  if(!allowed.has(name)){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.pdf':'application/pdf'}[path.extname(name)]||'text/plain';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(DIST,name)));
});
const report={phase,engine,actual_iPhone:false,states:{},checks:[],errors:[],external:[]};
let browser,page,frame,base;
const tick=async()=>{await frame.evaluate(()=>document.fonts.ready);await frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
async function state(name,screenshot=true){
  await tick();
  const metrics=await frame.evaluate(()=>{
    const rect=selector=>{const n=document.querySelector(selector);if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const svg=rect('#board'),c=document.querySelector('.board-wrap'),instruction=document.getElementById('wuxing-focus-instruction');
    return {board:svg,center:{x:svg.x+svg.width*.5,y:svg.y+svg.height*406/840},wrap:rect('.board-wrap'),canvas:rect('.wheel-canvas'),nav:rect('.page-nav'),controls:rect('#wuxing-focus-controls'),reset:rect('#reset'),exit:rect('#wuxing-focus-exit'),help:rect('#wuxing-help-popover'),scrollY,viewport:{width:innerWidth,height:innerHeight,visualHeight:visualViewport?.height},overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,instruction:{text:instruction?.textContent,client:instruction?.clientHeight,scroll:instruction?.scrollHeight},styles:{wrapHeight:getComputedStyle(c).height,wrapMinHeight:getComputedStyle(c).minHeight,wrapAspect:getComputedStyle(c).aspectRatio,boardHeight:getComputedStyle(document.getElementById('board')).height}};
  });
  metrics.shell=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,header:document.querySelector('.masthead')?.getBoundingClientRect().height||0}));
  report.states[name]=metrics;
  if(screenshot)await page.screenshot({path:path.join(OUT,name+'.png')});
  return metrics;
}
function unchanged(a,b,label){for(const key of ['x','y','width','height'])assert(Math.abs(a.board[key]-b.board[key])<.75,label+' board '+key+': '+a.board[key]+' -> '+b.board[key]);}
function separate(a,b){return a.right<=b.x+.1||b.right<=a.x+.1||a.bottom<=b.y+.1||b.bottom<=a.y+.1;}
async function sceneReady(){
  await page.waitForFunction(()=>{const w=document.getElementById('app-frame')?.contentWindow;return w?.TCMWuXingFocus&&w?.TCMSuite;});
  frame=page.frames().find(f=>f.url().includes('/apps/wuxing.html'));await tick();
}
async function select(index){const category=await frame.evaluate(()=>document.querySelector('#layer-list select').value);await frame.locator('.token[data-category="'+category+'"][data-index="'+index+'"]').tap();await tick();}
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base='http://127.0.0.1:'+server.address().port+'/BuYi/';
  browser=await pw[engine].launch(engine==='chromium'?{channel:'chrome',headless:true,chromiumSandbox:true}:{headless:true});report.version=browser.version();
  const context=await browser.newContext({viewport:{width:402,height:740},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();report.external.push(u);return route.abort();});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(base+'#wuxing');await sceneReady();
  const stableBoard=await frame.$('#board'),stableWrap=await frame.$('.board-wrap');
  report.dataSHA=crypto.createHash('sha256').update(await frame.evaluate(()=>JSON.stringify(WuXing.source))).digest('hex');
  const full=await state('portrait-full');await select(0);const single=await state('portrait-single');
  await select(1);const switched=await state('portrait-focus-changed');
  await frame.locator('#wuxing-focus-exit').tap();const returned=await state('portrait-returned');
  if(phase==='after'){
    unchanged(full,single,'enter');unchanged(full,switched,'change focus');unchanged(full,returned,'return');
    assert(separate(single.board,single.exit)&&separate(single.board,single.reset)&&separate(single.exit,single.reset),'side controls overlap the board or one another');
    assert(full.board.y-full.nav.bottom<24,'unexpected gap between controls and board');
    report.checks.push('full/single/focus/return retain board rectangle and center; rail buttons are separate');
    await frame.locator('#wuxing-help-toggle').tap();const help=await state('portrait-help');unchanged(returned,help,'open help');
    assert(await frame.locator('#wuxing-help-popover').evaluate(n=>n.open));
    assert.equal(await frame.locator('#wuxing-help-toggle').getAttribute('aria-expanded'),'true');
    await frame.locator('#wuxing-help-close').tap();unchanged(returned,await state('portrait-help-closed',false),'close help');
    report.checks.push('instruction dialog opens and closes without changing the board');
  }
  for(const height of [640,820,874,740]){
    await page.setViewportSize({width:402,height});const current=await state('portrait-height-'+height,false);
    if(phase==='after'){unchanged(full,current,'viewport height '+height);assert(current.overflow<=1&&current.shell.overflow<=1);}
  }
  await page.setViewportSize({width:874,height:402});await state('landscape-full');await select(0);const landscape=await state('landscape-single');
  if(phase==='after'){unchanged(report.states['landscape-full'],landscape,'landscape mode');assert(landscape.overflow<=1&&landscape.shell.overflow<=1);}
  await frame.locator('#wuxing-focus-exit').tap();await page.setViewportSize({width:402,height:740});const back=await state('portrait-after-orientation');
  if(phase==='after'){unchanged(full,back,'orientation roundtrip');report.checks.push('height changes and orientation roundtrip preserve portrait geometry without overflow');}
  if(phase==='after'){
    assert(await stableBoard.evaluate(n=>n===document.getElementById('board')));assert(await stableWrap.evaluate(n=>n===document.querySelector('.board-wrap')));
    const cases=[[[4,0],[0,1],[0,2],[3,0]],[[0,1],[1,2],[1,3],[4,1]],[[1,2],[2,3],[2,4],[0,2]],[[2,3],[3,4],[3,0],[1,3]],[[3,4],[4,0],[4,1],[2,4]]];
    const order=await frame.evaluate(()=>[...document.querySelectorAll('#layer-list select')].map(n=>n.value));
    for(const id of order)for(let index=0;index<5;index++){
      const edges=await frame.evaluate(({id,index})=>{TCMWuXingFocus.enter(id,index);return TCMWuXingFocus.edges().map(e=>[e.fromIndex,e.toIndex]);},{id,index});
      assert.deepEqual(edges,cases[index]);unchanged(full,await state('edge-check-'+id+'-'+index,false),'relation state');
    }
    await frame.locator('#wuxing-focus-exit').tap();
    await frame.locator('.center-label:visible').first().tap();await frame.locator('.category-option[data-category="colors"]').tap();
    assert.equal(await frame.evaluate(()=>document.querySelector('#layer-list select').value),'colors');unchanged(full,await state('changed-category',false),'category selection');
    await frame.locator('#reset').tap();assert.deepEqual(await frame.evaluate(()=>[...document.querySelectorAll('#layer-list select')].map(n=>n.value)),order);
    const box=await frame.locator('#board').boundingBox(),cx=box.x+box.width*.5,cy=box.y+box.height*406/840,r=box.width*.32;
    const beforeRotation=await frame.evaluate(()=>TCMRotation.target);
    await page.mouse.move(cx,cy-r);await page.mouse.down();
    for(let i=1;i<=12;i++){const a=-Math.PI/2+i*(Math.PI*2/5)/12;await page.mouse.move(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
    await page.mouse.up();await frame.waitForFunction(()=>Math.abs(TCMRotation.value-TCMRotation.target)<1e-5);
    assert.notEqual(await frame.evaluate(()=>TCMRotation.target),beforeRotation);assert.equal(await frame.evaluate(()=>TCMWuXingFocus.getState()),null);
    await frame.locator('#reset').tap();unchanged(full,await state('after-drag-reset',false),'drag/reset');
    report.checks.push('original SVG/container, all 15 focus-edge cases, category picker, drag and reset remain intact');
    await page.setViewportSize({width:320,height:568});const narrow=await state('narrow-full');await select(0);const narrowSingle=await state('narrow-single');unchanged(narrow,narrowSingle,'320px mode');
    assert(narrowSingle.overflow<=1&&narrowSingle.shell.overflow<=1&&separate(narrowSingle.board,narrowSingle.exit)&&separate(narrowSingle.exit,narrowSingle.reset));
    await frame.addStyleTag({content:'#wuxing-focus-controls{font-size:22px} #wuxing-focus-controls p{font-size:22px}'});
    await frame.locator('#wuxing-help-toggle').tap();await state('narrow-large-help');
    const readable=await frame.evaluate(()=>{const body=document.getElementById('wuxing-focus-controls');body.scrollTop=body.scrollHeight;const b=body.getBoundingClientRect(),last=body.lastElementChild.getBoundingClientRect(),close=document.getElementById('wuxing-help-close').getBoundingClientRect();return{lastVisible:last.bottom<=b.bottom+1,scrollable:body.scrollHeight>body.clientHeight,widthOK:body.scrollWidth<=body.clientWidth+1,closeVisible:close.top>=0&&close.bottom<=innerHeight};});
    assert(readable.lastVisible&&readable.scrollable&&readable.widthOK&&readable.closeVisible,JSON.stringify(readable));
    await frame.locator('#wuxing-help-close').tap();unchanged(narrow,await state('narrow-help-closed',false),'large help close');await frame.locator('#wuxing-focus-exit').tap();
    report.checks.push('320px view and enlarged instruction text remain readable through an internal scroller');
    await page.setViewportSize({width:402,height:740});
    await page.evaluate(()=>{document.body.style.setProperty('--wuxing-safe-top','62px');document.body.style.setProperty('--wuxing-safe-bottom','34px');});
    const safe=await state('safe-area-portrait');await select(0);unchanged(safe,await state('safe-area-portrait-single',false),'safe portrait');await frame.locator('#wuxing-focus-exit').tap();
    assert(Math.abs(safe.shell.header-full.shell.header-62)<1);
    await page.setViewportSize({width:874,height:402});await page.evaluate(()=>{document.body.style.setProperty('--wuxing-safe-top','0px');document.body.style.setProperty('--wuxing-safe-bottom','21px');document.body.style.setProperty('--wuxing-safe-left','47px');document.body.style.setProperty('--wuxing-safe-right','47px');});
    const safeWide=await state('safe-area-landscape');await select(0);const safeSingle=await state('safe-area-landscape-single',false);unchanged(safeWide,safeSingle,'safe landscape');assert(safeSingle.overflow<=1&&safeSingle.shell.overflow<=1&&safeSingle.reset.right<=safeSingle.viewport.width);
    report.checks.push('representative CSS safe-area insets keep controls inside the shell; hardware insets are not emulated');
    await page.setViewportSize({width:402,height:740});await page.goto(base+'apps/wuxing.html');await page.waitForFunction(()=>window.TCMWuXingFocus);frame=page.mainFrame();
    const standalone=await state('standalone-full');await select(0);unchanged(standalone,await state('standalone-single'),'standalone mode');assert(standalone.overflow<=1);
    report.checks.push('standalone five-element page retains the same mode geometry');
  }
  await context.close();
  const desktop=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});page=await desktop.newPage();page.on('pageerror',e=>report.errors.push(String(e)));await page.goto(base+'#wuxing');await sceneReady();
  const wide=await state('desktop-full');await frame.evaluate(()=>TCMWuXingFocus.enter(document.querySelector('#layer-list select').value,0));const wideSingle=await state('desktop-single');
  if(phase==='after'){unchanged(wide,wideSingle,'desktop modes');assert(wide.overflow<=1&&wide.shell.overflow<=1);report.checks.push('desktop layout and mode changes remain stable');}
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.passed=true;
})().catch(e=>{report.passed=false;report.error=String(e.stack||e);console.error(e);process.exitCode=1;}).finally(async()=>{
  await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({phase,engine,version:report.version,passed:report.passed,checks:report.checks,stateCount:Object.keys(report.states).length,portrait:report.states['portrait-full']?.board,error:report.error},null,2));
});
