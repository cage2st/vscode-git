const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(__dirname + '/billing-helper.js', 'utf8');
const saved = fs.readFileSync(__dirname + '/작성_결재 _ 법인카드 - ESTgames Groupware.html', 'utf8');
const url = 'https://gw.estgames.com/apps/billing/cards?periodId=496&cardId=578';
function fixture() {
  const dom = new JSDOM(saved, { url });
  const w = dom.window;
  const c = vm.createContext({ URL, setTimeout: resolve => setTimeout(resolve, 0) });
  vm.runInContext(source, c);
  const alerts = [];
  Object.assign(c, { document: w.document, location: w.location, HTMLInputElement: w.HTMLInputElement,
    Event: w.Event, MouseEvent: w.MouseEvent, KeyboardEvent: w.KeyboardEvent,
    alert: message => alerts.push(message), confirm: () => true });
  const page = c.readModernBilling(w.document);
  const expected = { ...c.modernBillingContext(saved), title: page.title };
  const item = page.transactions[0];
  const payload = { date: item.receiptDate, merchant: item.merchant, amount: item.amount, user: '테스트 사용자', kindLabel: '휴근식대' };
  return { c, w, dom, page, expected, payload, alerts };
}
test('attached HTML: reads 20 detail rows, memo, and saved card/period', () => {
  const { c, page, expected, dom } = fixture();
  assert.equal(page.transactions.length, 20);
  assert.equal(expected.cardId, '578'); assert.equal(expected.periodId, '496');
  assert.equal(page.transactions[0].receiptDate, '2026-08-30');
  assert.equal(page.transactions[0].amount, 13500);
  assert.equal(page.transactions[0].description, '');
  assert.equal(page.transactions[0].kind, '');
  assert.equal(page.transactions[19].receiptDate, '2026-07-04');
  assert.throws(() => c.modernBillingContext(saved.replace('gw.estgames.com/apps/billing/cards?', 'example.com/apps/billing/cards?')));
  dom.window.close();
});
test('uses dropdown option clicks and native input events; never clicks save', async () => {
  const { c, w, dom, page, expected, payload, alerts } = fixture();
  const item = page.transactions[0], state = {};
  let saveClicks = 0;
  w.document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => saveClicks++));
  // Simulate a React value tracker: assigning .value directly updates the tracker,
  // so it would not create a state update on the next input event.
  for (const [key, el] of [['memo', item.memo], ['account', item.accountControl]]) {
    const native = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value');
    let tracked = el.value;
    Object.defineProperty(el, 'value', { configurable: true, get() { return native.get.call(this); },
      set(value) { tracked = value; native.set.call(this, value); } });
    el.addEventListener('input', () => { if (el.value !== tracked) { state[key] = el.value; tracked = el.value; } });
  }
  item.kindControl.addEventListener('mousedown', () => {
    const menu = w.document.createElement('ul'); menu.setAttribute('role', 'listbox');
    const option = w.document.createElement('li'); option.setAttribute('role', 'option'); option.textContent = '휴근식대';
    option.addEventListener('click', () => { item.kindControl.textContent = '휴근식대'; menu.remove(); });
    menu.append(option); w.document.body.append(menu);
  });
  item.used.checked = false;
  await c.fillModernBilling([payload], expected, c.readModernBilling);
  assert.equal(state.memo, payload.user); assert.equal(state.account, '복리후생비');
  assert.equal(item.used.checked, true); assert.equal(item.kindControl.textContent, '휴근식대');
  assert.equal(saveClicks, 0); assert.match(alerts[0], /1건 입력 완료/);
  dom.window.close();
});
test('wrong card, title, conflicting memo/account/kind, duplicates and disabled inputs stop before edits', async () => {
  const changes = [
    f => { f.expected.cardId = '999'; },
    f => { f.expected.title = '다른 청구'; },
    f => { f.page.transactions[0].memo.value = '기존 메모'; },
    f => { f.page.transactions[0].accountControl.value = '다른 계정'; },
    f => { f.page.transactions[0].kindControl.textContent = '야근식대'; },
    f => { f.page.transactions[0].memo.disabled = true; },
    f => { const row = f.page.transactions[0].row; row.after(row.cloneNode(true)); }
  ];
  for (const change of changes) {
    const f = fixture(); change(f);
    let confirmations = 0; f.c.confirm = () => { confirmations++; return true; };
    await f.c.fillModernBilling([f.payload], f.expected, f.c.readModernBilling);
    assert.equal(confirmations, 0); assert.match(f.alerts[0], /중단/);
    assert.notEqual(f.page.transactions[0].memo.value, f.payload.user);
    f.dom.window.close();
  }
});
test('cancel and missing dropdown option do not fill memo', async () => {
  for (const cancel of [true, false]) {
    const f = fixture(); f.c.confirm = () => !cancel;
    await f.c.fillModernBilling([f.payload], f.expected, f.c.readModernBilling);
    assert.equal(f.page.transactions[0].memo.value, '');
    if (!cancel) assert.match(f.alerts[0], /항목을 찾지 못했습니다/);
    f.dom.window.close();
  }
});
test('receipt UI imports the new HTML and exports a self-contained modern bookmark', async () => {
  const html = fs.readFileSync(__dirname + '/legacy-index.html', 'utf8');
  const dom = new JSDOM(html, { url: 'https://receipts.example/', runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(w.document.querySelector('script:not([src])').textContent + '\n' + source);
  const input = w.document.querySelector('#billing-html');
  Object.defineProperty(input, 'files', { value: [{ text: async () => saved }] });
  input.dispatchEvent(new w.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  const kind = w.document.querySelector('#billing-kind'); kind.value = '7'; kind.dispatchEvent(new w.Event('change'));
  assert.match(w.document.querySelector('#billing-summary').textContent, /회사 내역 20건/);
  const button = w.document.querySelector('#billing-export'); assert.equal(button.disabled, false);
  let blob;
  w.URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  button.click();
  const generated = await new Promise(resolve => { const reader = new w.FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
  const tool = new JSDOM(generated);
  const code = decodeURIComponent(tool.window.document.querySelector('a').getAttribute('href').slice(11));
  assert.match(code, /fillModernBilling/); assert.match(code, /readModernBilling/);
  assert.match(code, /"cardId":"578"/); new vm.Script(code);
  tool.window.close(); dom.window.close();
});
