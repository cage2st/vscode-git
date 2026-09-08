const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const C=require('./monthly-core.js');
const source=fs.readFileSync(__dirname+'/monthly-core.js','utf8');
const saved=fs.readFileSync(__dirname+'/작성_결재 _ 법인카드 - ESTgames Groupware.html','utf8');
const url='https://gw.estgames.com/apps/billing/cards?periodId=496&cardId=578';
test('filename parsing handles any year, missing extension, timestamps and invalid dates',()=>{
 assert.equal(C.parseName('2027_0102(토)_점심 식대_홍길동').user,'홍길동');
 assert.equal(C.parseName('2026_0830(일)_주말 식대_김승희.jpeg').date,'2026-08-30');
 assert.equal(C.parseName('20260907_001130.jpg').user,'');
 assert.equal(C.parseName('2026_0230(월)_식대_사용자.jpg').date,'');
});
test('date suggestions require review; company amounts need no receipt amount entry',()=>{
 const rows=[{date:'2026-08-30',amount:13500,merchant:'가맹점',memo:''}];
 const r={date:'2026-08-30',user:'사용자',numbers:C.amountsIn('TOTAL 13,500 TAX 1,227'),amount:13500,target:0,hash:'abc'};
 assert.equal(C.suggest(r,rows).length,1);
 assert.equal(C.assess([r],rows,'2026-08')[0].ready,false);
 r.confirmed=true;assert.equal(C.assess([r],rows,'2026-08')[0].ready,true);
 assert.equal(C.assess([r],rows,'2026-09')[0].ready,false);
 assert.equal(C.assess([r,{...r}],rows,'2026-08')[0].ready,false);
 assert.equal(C.assess([r,{...r,excluded:true}],rows,'2026-08')[0].ready,true);
 assert.equal(C.assess([r],[...rows,...rows],'2026-08')[0].ready,false);
 assert.equal(C.assess([r],[{...rows[0],memo:'다른 사용자'}],'2026-08')[0].ready,false);
 assert.equal(C.assess([{...r,amount:undefined}],rows,'2026-08')[0].ready,true);
 assert.equal(C.assess([{...r,date:'2026-08-29'}],rows,'2026-08')[0].ready,false);
});
function fixture(){
 const dom=new JSDOM(saved,{url,runScripts:'outside-only'});const w=dom.window;w.eval(source);
 const page=w.CardMonthly.readCompany(w.document);const expected={...C.readContext(saved),title:page.title};
 const alerts=[];w.alert=m=>alerts.push(m);w.confirm=()=>true;
 const item={...page.rows[0],user:'테스트 사용자'};delete item.input;
 return {dom,w,page,expected,alerts,item};
}
test('attached HTML is read without running company scripts; bookmark is standalone',()=>{
 const f=fixture();assert.equal(f.page.rows.length,20);
 assert.equal(f.expected.cardId,'578');assert.equal(f.expected.periodId,'496');
 new vm.Script(decodeURIComponent(C.bookmark([f.item],f.expected).slice(11)));
 assert.throws(()=>C.readContext(saved.replace('gw.estgames.com','evil.example')));
 f.dom.window.close();
});
test('requires bulk holiday-meal selection before any memo changes',async()=>{
 const f=fixture();await f.w.CardMonthly.fillMemos([f.item],f.expected,f.w.CardMonthly.readCompany);
 assert.equal(f.page.rows[0].input.value,'');assert.match(f.alerts[0],/전체 적용/);f.dom.window.close();
});
test('updates only memo using React-compatible native setter; preserves account, checks, category, save buttons',async()=>{
 const f=fixture();const input=f.page.rows[0].input;const row=input.closest('tr');
 row.cells[5].querySelector('[aria-haspopup]').textContent='휴근식대';
 row.cells[6].querySelector('input').value='기존 자동 계정';
 let state='', tracked='', clicks=0;
 const native=Object.getOwnPropertyDescriptor(f.w.HTMLInputElement.prototype,'value');
 Object.defineProperty(input,'value',{get(){return native.get.call(this)},set(v){tracked=v;native.set.call(this,v)}});
 input.addEventListener('input',()=>{if(input.value!==tracked){state=input.value;tracked=input.value}});
 f.w.document.querySelectorAll('button,input[type=checkbox]').forEach(el=>el.addEventListener('click',()=>clicks++));
 await f.w.CardMonthly.fillMemos([f.item],f.expected,f.w.CardMonthly.readCompany);
 assert.equal(state,f.item.user);assert.equal(row.cells[6].querySelector('input').value,'기존 자동 계정');
 assert.equal(clicks,0);assert.match(f.alerts[0],/1건의 사용자/);assert.equal(f.w.__csMemoRunning,undefined);f.dom.window.close();
});
test('wrong card, duplicates, locked or occupied memo and cancellation never overwrite',async()=>{
 for(const change of [f=>f.expected.cardId='1',f=>f.page.rows[0].input.readOnly=true,f=>{f.page.rows[0].input.value='기존 이름';f.w.confirm=()=>false;},f=>f.w.confirm=()=>false,f=>{const row=f.page.rows[0].input.closest('tr');row.after(row.cloneNode(true));}]){
  const f=fixture();f.page.rows[0].input.closest('tr').cells[5].querySelector('[aria-haspopup]').textContent='휴근식대';change(f);
  await f.w.CardMonthly.fillMemos([f.item],f.expected,f.w.CardMonthly.readCompany);
  assert.notEqual(f.page.rows[0].input.value,f.item.user);f.dom.window.close();
 }
});

test('existing memo replacement requires a before/after confirmation; intervening edits abort',async()=>{
 for(const changed of [false,true]){
  const f=fixture();const input=f.page.rows[0].input;
  input.closest('tr').cells[5].querySelector('[aria-haspopup]').textContent='휴근식대';input.value='기존 메모';
  f.w.confirm=message=>{assert.match(message,/기존 메모/);assert.ok(message.includes(f.item.user));assert.ok(message.includes(f.item.merchant));if(changed)input.value='확인 중 변경';return true;};
  await f.w.CardMonthly.fillMemos([f.item],f.expected,f.w.CardMonthly.readCompany);
  assert.equal(input.value,changed?'확인 중 변경':f.item.user);
  if(changed)assert.match(f.alerts[0],/확인 후 메모/);
  f.dom.window.close();
 }
});
