const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/billing-helper.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const receipt = { receiptDate: '2026-08-01', merchant: '매장 A', amount: 15000, user: '사용자' };
test('unique date, merchant and amount match; whitespace is ignored', () => {
  assert.equal(context.matchBilling([receipt], [{ ...receipt, merchant: '매장A' }])[0].status, '입력 가능');
});
test('wrong month, merchant or amount cannot match', () => {
  for (const change of [{ receiptDate: '2026-07-01' }, { merchant: '다른 매장' }, { amount: 14000 }]) {
    assert.equal(context.matchBilling([receipt], [{ ...receipt, ...change }])[0].status, '일치 내역 없음');
  }
});
test('duplicate source or target and conflicting existing names are blocked', () => {
  assert.equal(context.matchBilling([receipt, receipt], [receipt])[0].status, '중복 거래 확인 필요');
  assert.equal(context.matchBilling([receipt], [receipt, receipt])[0].status, '중복 거래 확인 필요');
  assert.equal(context.matchBilling([receipt], [{ ...receipt, description: '다른 사용자' }])[0].status, '기존 사용자이름 확인 필요');
});
function fixture() {
  const fields = {};
  for (const [selector, value] of Object.entries({
    '.hdnBillingDetailIdx': '1', '.hdnCardOwnerIdx': '2', '.hdnMonthlyBillingIdx': '3',
    '.cbBillingKindIdx': '', '.txtBillingKindDesc': '', '.chkIsPublic': '',
    '.cbBillingStyleIdx': '', '.txtBillingStyleDesc': ''
  })) fields[selector] = { value, options: [{ value: '7' }, { value: '1' }], setAttribute(name, value) { this[name] = value; } };
  const row = { cells: ['', '', '', '', '2026-08-01', '매장 A', '15,000', ''].map(textContent => ({ textContent })), querySelector: selector => fields[selector] };
  const alerts = [];
  context.location = { origin: 'https://billing.estgames.com', pathname: '/Card/BillingList' };
  context.document = { querySelectorAll: () => [row] };
  context.alert = message => alerts.push(message);
  context.confirm = () => true;
  const payload = { id: '1', owner: '2', period: '3', date: receipt.receiptDate, merchant: receipt.merchant, amount: receipt.amount, user: receipt.user, kind: '7' };
  return { fields, payload, alerts };
}
test('fills intended fields and legacy checked attribute without server APIs', () => {
  const { fields, payload } = fixture();
  context.fillCompanyBilling([payload]);
  assert.equal(fields['.txtBillingKindDesc'].value, receipt.user);
  assert.equal(fields['.cbBillingKindIdx'].value, '7');
  assert.equal(fields['.cbBillingStyleIdx'].value, '1');
  assert.equal(fields['.chkIsPublic'].checked, 'checked');
});
test('preflight rejects all changes for stale period, existing kind or name, and locked fields', () => {
  for (const [selector, property, value] of [
    ['.hdnMonthlyBillingIdx', 'value', 'other-month'],
    ['.cbBillingKindIdx', 'value', '6'],
    ['.txtBillingKindDesc', 'value', '기존 이름'],
    ['.txtBillingKindDesc', 'readOnly', true]
  ]) {
    const { fields, payload, alerts } = fixture();
    fields[selector][property] = value;
    context.fillCompanyBilling([payload]);
    assert.equal(fields['.cbBillingStyleIdx'].value, '');
    assert.equal(alerts.length, 1);
  }
});
test('wrong site and cancelled confirmation do not modify inputs', () => {
  const { fields, payload } = fixture();
  context.location.origin = 'https://example.com';
  context.fillCompanyBilling([payload]);
  assert.equal(fields['.txtBillingKindDesc'].value, '');
  context.location.origin = 'https://billing.estgames.com';
  context.confirm = () => false;
  context.fillCompanyBilling([payload]);
  assert.equal(fields['.txtBillingKindDesc'].value, '');
});
