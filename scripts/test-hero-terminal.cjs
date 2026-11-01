/* Local browser verification; artifacts default to the OS temporary directory.
   NODE_PATH=<bundled modules> TERMINAL_OUTPUT=<artifact folder> node scripts/test-hero-terminal.cjs */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.env.TERMINAL_OUTPUT||path.join(require('node:os').tmpdir(),'spawnpoint-terminal');
const base=process.env.HERO_LAB_URL||'http://127.0.0.1:8873';
fs.mkdirSync(out,{recursive:true});
const order=['sales','marketing','personal','playful'],errors=[],results=[];
async function snapshot(p){return p.evaluate(()=>{
  const t=document.querySelector('[data-terminal]'),scene=t.querySelector('[data-active=true]')||t.querySelector('.lp-term-scene');
  const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
  return{elapsed:+(t.dataset.elapsed||0),scenario:t.dataset.scenario,playback:t.dataset.playback,terminal:box(t),hero:box(document.querySelector('.lp-hero-v2')),bar:box(t.querySelector('.lp-term-bar')),pageWidth:document.documentElement.scrollWidth,
    opacity:+getComputedStyle(scene).opacity,rows:[...scene.children].map(e=>({text:e.querySelector('.lp-term-live')?.textContent||'',full:e.querySelector('[data-full]').textContent,opacity:+getComputedStyle(e).opacity,filter:getComputedStyle(e).filter,rect:box(e),overflow:e.scrollWidth>e.clientWidth})),
    markers:[...scene.children].map(e=>({mark:e.querySelector('.lp-term-mark').textContent,color:getComputedStyle(e.querySelector('.lp-term-mark')).color,width:box(e.querySelector('.lp-term-mark')).width,role:e.className})),
    cursorRows:[...t.querySelectorAll('.lp-term-caret')].map(e=>e.closest('li').className),
    caret:!!scene.querySelector('.lp-term-caret:not([hidden])'),controls:t.querySelectorAll('button').length,label:t.querySelectorAll('.lp-term-label').length,dots:t.querySelectorAll('.lp-term-dot').length,links:t.querySelectorAll('a').length,liveRegions:t.querySelectorAll('[aria-live]').length};
});}
async function at(p,target){const s=await snapshot(p);if(target>s.elapsed)await p.clock.fastForward(target-s.elapsed);return snapshot(p);}
function stable(a,b){assert.deepEqual(b.markers.map(m=>m.mark),['>','-','-','-','-','•']);assert.equal(b.markers[0].role,'is-user');assert.equal(b.markers[5].role,'is-agent');assert.equal(b.markers[0].color,'rgb(239, 40, 94)');assert.equal(b.markers[5].color,'rgb(163, 163, 163)');assert.ok(b.markers.every(m=>m.width===8));assert.deepEqual(b.cursorRows,['is-user','is-user','is-user','is-user']);assert.deepEqual(b.terminal,a.terminal);assert.deepEqual(b.hero,a.hero);assert.equal(b.bar.height,26);assert.ok(b.rows.every(r=>!r.overflow),JSON.stringify({elapsed:b.elapsed,scenario:b.scenario,terminal:b.terminal,rows:b.rows.filter(r=>r.overflow)}));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const width of [320,390,880,881,1024,1200,1440,1920])for(const dpr of [1,...([390,1440].includes(width)?[2]:[])]){
  const p=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:dpr});p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.clock.pauseAt(Date.now()+1000);await p.goto(base);await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='playing');await p.clock.fastForward(50);
  const initial=await snapshot(p);assert.equal(initial.terminal.height,width===320?380:width===390?280:240);assert.equal(initial.links,0);assert.equal(initial.liveRegions,0);assert.equal(initial.controls,0);assert.equal(initial.label,0);assert.equal(initial.dots,3);assert.ok(initial.terminal.x>=0&&initial.terminal.x+initial.terminal.width<=width);
  assert.equal(initial.pageWidth,width);
  const loops=width===1440&&dpr===1?2:1;
  const phases = [...new Set([100, 650, ...Array.from({length:36},(_,i)=>750+i*100), 4250, 7150, 7250, 7350])].sort((a,b)=>a-b);
  for(let loop=0;loop<loops;loop++)for(let scene=0;scene<4;scene++)for(const phase of phases){
    const s=await at(p,loop*29600+scene*7400+phase);stable(initial,s);assert.equal(s.scenario,order[scene]);
    const t=s.elapsed%7400;
    const request=s.rows[0].full;
    const count=Math.max(0,Math.min(request.length,Math.floor((t-600)*request.length/1600)));
    assert.equal(s.rows[0].text,request.slice(0,count));assert.equal(s.caret,t<2200);
    assert.equal(s.rows[0].filter,'none');
    for(let i=1;i<=5;i++){
      const row=s.rows[i],start=[2400,2900,3300,3600,3800][i-1];
      assert.equal(row.text,row.full,'Output is a complete message, not partial streaming');
      if(t<=start){assert.equal(row.opacity,0);assert.equal(row.filter,'blur(2px)');}
      else if(t>=start+(i<=4?200:400)){assert.equal(row.opacity,1);assert.equal(row.filter,'none');}
      else {assert.ok(row.opacity>0&&row.opacity<1);const blur=parseFloat(row.filter.slice(5));assert.ok(blur>0&&blur<2);assert.ok(Math.abs(blur-2*(1-row.opacity))<0.00002);if(i===5)assert.ok(Math.abs(row.opacity-(t-start)/400)<0.002);else if(t-start===50)assert.ok(Math.abs(row.opacity-0.2366)<0.002);}
    }
    if(t>=4200&&t<7200){assert.equal(s.rows[5].text,s.rows[5].full);assert.equal(s.opacity,1);}
    if(t>7200){assert.ok(s.opacity>0&&s.opacity<1);assert.ok(s.rows.every(r=>r.filter==='none'));}

  }
  await at(p,loops*29600+6100);assert.equal((await snapshot(p)).scenario,'sales');
  if(dpr===1&&[320,390,1440].includes(width))await p.screenshot({path:path.join(out,`terminal-${width}.png`)});
  results.push({width,dpr,loops,geometry:initial.terminal,hero:initial.hero,stable:true});await p.close();
 }
 const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.clock.install();await p.clock.pauseAt(Date.now()+1000);await p.goto(base);await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='playing');await p.clock.runFor(34);await at(p,2500);
 await p.evaluate(()=>dispatchEvent(new Event('pagehide')));const paused=await snapshot(p);await p.clock.fastForward(5000);assert.deepEqual(await snapshot(p),paused);assert.equal(paused.playback,'waiting');assert.ok(paused.rows[1].opacity>0&&paused.rows[1].opacity<1);assert.notEqual(paused.rows[1].filter,'none');
 await p.evaluate(()=>dispatchEvent(new Event('pageshow')));await p.clock.runFor(34);await p.clock.fastForward(1000);assert.ok((await snapshot(p)).elapsed>paused.elapsed);
 await p.locator('.lp-term').hover();let before=await snapshot(p);await p.clock.fastForward(1000);assert.ok((await snapshot(p)).elapsed>before.elapsed,'Hover does not pause or restart');
 await p.evaluate(()=>scrollTo(0,1500));await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='waiting');before=await snapshot(p);await p.clock.fastForward(5000);assert.equal((await snapshot(p)).elapsed,before.elapsed);
 await p.evaluate(()=>scrollTo(0,0));await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='playing');await p.clock.runFor(34);await p.clock.fastForward(1000);assert.ok((await snapshot(p)).elapsed>before.elapsed);
 // Explicit synthetic visibility transition; native background-tab throttling is not claimed.
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});before=await snapshot(p);await p.clock.fastForward(5000);assert.equal((await snapshot(p)).elapsed,before.elapsed);
 await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.clock.runFor(34);await p.clock.fastForward(1000);assert.ok((await snapshot(p)).elapsed>before.elapsed);
 await at(p,7400+4000);await p.clock.resume();await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot();await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='reduced');const reduced=await snapshot(p);assert.equal(reduced.scenario,'marketing');assert.equal(reduced.rows[5].text,reduced.rows[5].full);assert.equal(reduced.caret,false);assert.ok(reduced.rows.every(r=>r.filter==='none'&&r.opacity===1));assert.equal(reduced.elapsed%7400,4200);await p.waitForTimeout(500);assert.equal((await snapshot(p)).elapsed,reduced.elapsed);assert.equal(await p.locator('.lp-term-toggle').isVisible(),false);
 await p.emulateMedia({reducedMotion:'no-preference'});await p.screenshot();await p.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='playing');await p.clock.runFor(34);await p.clock.fastForward(500);const preResize=await snapshot(p);await p.setViewportSize({width:390,height:900});await p.clock.fastForward(500);const postResize=await snapshot(p);assert.ok(postResize.elapsed>=preResize.elapsed);assert.equal(postResize.scenario,preResize.scenario);assert.equal(postResize.terminal.height,280);await p.close();
 // At less than half visible, the first scene has not started.
 const entry=await browser.newPage({viewport:{width:1440,height:500}});await entry.clock.install();await entry.goto(base);await entry.waitForFunction(()=>document.querySelector('.lp-term').classList.contains('is-enhanced'));await entry.clock.fastForward(5000);assert.equal((await snapshot(entry)).elapsed,0);await entry.evaluate(()=>scrollTo(0,240));await entry.waitForFunction(()=>document.querySelector('[data-terminal]').dataset.playback==='playing');await entry.clock.runFor(34);await entry.clock.fastForward(1000);assert.ok((await snapshot(entry)).elapsed>0);await entry.close();
 for(const width of [320,390,1440]){
  const nojs=await browser.newPage({viewport:{width,height:1000},javaScriptEnabled:false});await nojs.goto(base);await nojs.evaluate(()=>document.fonts.ready);const s=await snapshot(nojs);assert.equal(s.terminal.height,width===320?380:width===390?280:240);assert.deepEqual(s.markers.map(m=>m.mark),['>','-','-','-','-','•']);assert.deepEqual(s.cursorRows,[]);assert.ok(s.rows.every(r=>r.filter==='none'&&r.opacity===1));assert.equal(await nojs.locator('.lp-term-toggle').isVisible(),false);assert.equal(await nojs.locator('.lp-term-scene:visible').count(),1);assert.match(await nojs.locator('.lp-term-scene:visible').textContent(),/sales dashboard/);await nojs.close();
 }
 await browser.close();assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'terminal-validation.json'),JSON.stringify({passed:true,results,lifecycle:true,manualControls:false,pageSuspension:true,visibilityTest:'synthetic document.hidden',noJavaScript:true,reducedMotion:true,errors},null,2));console.log('Passed terminal sequence, geometry, lifecycle, control removal, and fallback checks.');
})().catch(e=>{console.error(e);process.exit(1)});
