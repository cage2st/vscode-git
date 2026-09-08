const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8770/');
 await page.locator('#xlsx').setInputFiles(path.resolve('Card/2026_08_법인카드_영수증_정리.xlsx'));
 await page.waitForFunction(()=>!document.querySelector('#prepare').disabled);
 assert.equal(await page.locator('#rows tr').count(),19);
 await page.locator('#prepare').click();
 await page.locator('#final').waitFor({state:'visible'});
 assert.equal(await page.locator('#result-rows tr').count(),19);
 assert.match(await page.locator('#result-info').textContent(),/260,240/);
 const code=await page.locator('#code').inputValue();assert.ok(code.startsWith('javascript:'));
 const downloadEvent=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadEvent;await download.saveAs('/tmp/corporate-result.html');
 const downloaded=await browser.newPage();await downloaded.goto('file:///tmp/corporate-result.html');assert.equal(await downloaded.locator('#code').inputValue(),code);assert.equal(await downloaded.locator('#result-rows tr').count(),19);await downloaded.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('test fallback');}}}));await downloaded.locator('#copy').click();await downloaded.waitForFunction(()=>document.getElementById('copy-status').textContent.length>0);
 const company=await browser.newPage();await company.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:fs.readFileSync('Card/작성_결재 _ 법인카드 - ESTgames Groupware.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}):route.abort());
 await company.goto('https://gw.estgames.com/apps/billing/cards?periodId=496&cardId=578');
 await company.evaluate(()=>{document.querySelectorAll('tbody tr').forEach(tr=>{const kind=tr.cells[5]?.querySelector('[aria-haspopup="listbox"]');if(kind)kind.textContent='휴근식대';});});
 const dialogs=[];company.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 await company.evaluate(code=>eval(decodeURIComponent(code.slice(11))),code);
 await company.waitForFunction(()=>!window.__csMemoRunning);
 assert.ok(dialogs.some(s=>s.includes('19건의 사용자 이름을 입력했습니다.')),JSON.stringify(dialogs));
 const filled=await company.evaluate(()=>[...document.querySelectorAll('tbody tr')].flatMap(tr=>{const input=tr.cells[7]?.querySelector('input[type="text"]');return input?[input.value]:[];}));
 assert.equal(filled.filter(Boolean).length,19);
 await page.locator('#back').click();assert.equal(await page.locator('#code').inputValue(),'');assert.ok(await page.locator('#setup').isVisible());
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: 19 receipts, 260240 total, standalone download, 19 company memos, reset, mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
