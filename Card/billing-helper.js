// Read only the card detail dialog; unrelated overview/attachment tables are excluded.
function readModernBilling(doc) {
  const dialog = doc.querySelector('[role="dialog"][aria-labelledby="billing-card-detail-dialog"]');
  if (!dialog) throw new Error('회사 카드 상세 화면을 연 상태로 HTML을 저장해 주세요.');
  const title = dialog.querySelector('#billing-card-detail-dialog span')?.textContent.trim();
  const tables = [...dialog.querySelectorAll('table')].filter(table =>
    JSON.stringify([...table.querySelectorAll('thead th')].map(th => th.textContent.trim())) ===
    JSON.stringify(['', '순번', '이용일자', '가맹점명', '매입금액', '적요', '계정과목', '메모']));
  if (!title || tables.length !== 1) throw new Error('회사 카드 표 구조를 확인할 수 없습니다.');
  const transactions = [...tables[0].querySelectorAll('tbody tr')].map(row => {
    const c = row.cells;
    const kind = c[5]?.querySelector('[aria-haspopup="listbox"]');
    const memo = c[7]?.querySelector('input[type="text"]');
    const account = c[6]?.querySelector('input[type="text"]');
    const used = c[0]?.querySelector('input[type="checkbox"]');
    if (c.length !== 8 || !kind || !memo || !account || !used) throw new Error('회사 카드 입력란 구조가 달라졌습니다.');
    const receiptDate = c[2].textContent.trim(), merchant = c[3].textContent.trim();
    const amountText = c[4].textContent.replace(/[,\s]/g, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate) || !/^\d+$/.test(amountText) || !merchant) throw new Error('거래 날짜 또는 금액을 확인해 주세요.');
    const kindLabel = kind.textContent.trim();
    return { receiptDate, merchant, amount: Number(amountText), description: memo.value.trim(),
      kind: kindLabel === '-' ? '' : kindLabel, account: account.value.trim(), row, memo, kindControl: kind, accountControl: account, used };
  });
  return { title, transactions };
}

function modernBillingContext(source) {
  const saved = source.match(/<!--\s*saved from url=\(\d+\)(https:\/\/[^\s]+)\s*-->/);
  if (!saved) throw new Error('원본 주소가 포함된 HTML이 필요합니다. 회사 페이지를 브라우저에서 다시 저장해 주세요.');
  const url = new URL(saved[1]);
  if (url.origin !== 'https://gw.estgames.com' || url.pathname !== '/apps/billing/cards' ||
      !/^\d+$/.test(url.searchParams.get('periodId') || '') || !/^\d+$/.test(url.searchParams.get('cardId') || '')) {
    throw new Error('회사 카드 상세 페이지의 주소를 확인할 수 없습니다.');
  }
  return { periodId: url.searchParams.get('periodId'), cardId: url.searchParams.get('cardId') };
}

async function fillModernBilling(payload, expected, readPage) {
  let completed = 0;
  const wait = () => new Promise(resolve => setTimeout(resolve, 40));
  const norm = value => value.replace(/\s+/g, '').toLowerCase();
  const same = (t, p) => t.receiptDate === p.date && norm(t.merchant) === norm(p.merchant) && t.amount === p.amount;
  const editable = el => el && !el.disabled && !el.readOnly && el.getAttribute('aria-disabled') !== 'true' && !el.closest('.Mui-disabled');
  const setText = (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  function current() {
    const url = new URL(location.href);
    if (url.origin !== 'https://gw.estgames.com' || url.pathname !== '/apps/billing/cards' ||
        url.searchParams.get('periodId') !== expected.periodId || url.searchParams.get('cardId') !== expected.cardId) {
      throw new Error('대조한 청구월과 카드의 회사 상세 페이지에서 실행해 주세요.');
    }
    const page = readPage(document);
    if (page.title !== expected.title) throw new Error('카드 상세 제목이 달라졌습니다. 다시 대조해 주세요.');
    return page.transactions;
  }
  function find(item) {
    const matches = current().filter(t => same(t, item));
    if (matches.length !== 1) throw new Error('거래 목록이 달라졌거나 중복됩니다. 다시 대조해 주세요.');
    const t = matches[0];
    if (![t.memo, t.kindControl, t.accountControl, t.used].every(editable) ||
        (t.description && t.description !== item.user) || (t.kind && t.kind !== item.kindLabel) ||
        (t.account && t.account !== '복리후생비') || (t.memo.maxLength >= 0 && item.user.length > t.memo.maxLength)) {
      throw new Error('기존 메모·적요·계정과목과 충돌하거나 입력이 잠겨 있습니다.');
    }
    return t;
  }
  try {
    if (!payload.length) return;
    const keys = payload.map(p => JSON.stringify([p.date, norm(p.merchant), p.amount]));
    if (new Set(keys).size !== keys.length) throw new Error('입력 대상에 중복 거래가 있습니다.');
    payload.forEach(find);
    if (!confirm(`${payload.length}건의 적요, 계정과목, 메모(사용자이름)를 입력합니다. 저장과 결재 제출은 직접 진행해 주세요.`)) return;
    for (const item of payload) {
      let t = find(item);
      if (!t.used.checked) { t.used.click(); await wait(); }
      t = find(item);
      if (t.kind !== item.kindLabel) {
        t.kindControl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        let options = [];
        for (let attempt = 0; attempt < 25; attempt++) {
          await wait(); current();
          options = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
            .filter(el => el.textContent.trim() === item.kindLabel && el.getAttribute('aria-disabled') !== 'true');
          if (options.length) break;
        }
        if (options.length !== 1) {
          document.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          throw new Error(`적요 메뉴에서 ${item.kindLabel} 항목을 찾지 못했습니다.`);
        }
        options[0].click(); await wait();
      }
      t = find(item);
      if (t.kind !== item.kindLabel) throw new Error('적요 선택이 반영되지 않았습니다.');
      if (t.account !== '복리후생비') { setText(t.accountControl, '복리후생비'); await wait(); }
      t = find(item);
      setText(t.memo, item.user); await wait();
      t = find(item);
      if (t.description !== item.user || t.account !== '복리후생비' || !t.used.checked) throw new Error('입력값이 화면에 반영되지 않았습니다.');
      completed++;
    }
    alert(`${completed}건 입력 완료. 메모와 적요를 확인하고 영수증을 업로드한 뒤 회사 화면에서 저장해 주세요.`);
  } catch (error) {
    alert(`입력을 중단했습니다 (${completed}건 완료). ${error.message} 현재 행에 일부 값이 입력되었을 수 있으니 확인해 주세요.`);
  }
}

/* The saved company page is parsed as inert data; its scripts are never run. */
function billingKey(date, merchant, amount) {
  return JSON.stringify([date, merchant.replace(/\s+/g, '').toLowerCase(), amount]);
}

function matchBilling(receipts, transactions) {
  const key = x => billingKey(x.receiptDate, x.merchant, x.amount);
  return receipts.map(receipt => {
    const candidates = transactions.filter(row => key(row) === key(receipt));
    const duplicate = receipts.filter(row => key(row) === key(receipt)).length > 1;
    const transaction = candidates[0];
    let status = '일치 내역 없음';
    if (duplicate || candidates.length > 1) status = '중복 거래 확인 필요';
    else if (transaction) status = transaction.description && transaction.description !== receipt.user
      ? '기존 사용자이름 확인 필요' : '입력 가능';
    return { receipt, transaction, status };
  });
}

function fillCompanyBilling(payload) {
  if (location.origin !== 'https://billing.estgames.com' || location.pathname !== '/Card/BillingList') {
    alert('회사 카드 입력 페이지에서 실행해 주세요.');
    return;
  }
  const normalize = value => value.replace(/\s+/g, '').toLowerCase();
  const plan = [];
  for (const item of payload) {
    const candidates = [...document.querySelectorAll('tr[class^="divBillingDetailContainer1_"]')]
      .filter(row => row.querySelector('.hdnBillingDetailIdx')?.value === item.id);
    if (candidates.length !== 1) { alert('거래 목록이 달라졌습니다. 최신 HTML로 다시 대조해 주세요.'); return; }
    const row = candidates[0], cells = row.cells;
    const kind = row.querySelector('.cbBillingKindIdx');
    const desc = row.querySelector('.txtBillingKindDesc');
    const used = row.querySelector('.chkIsPublic');
    const style = row.querySelector('.cbBillingStyleIdx');
    const styleDesc = row.querySelector('.txtBillingStyleDesc');
    if (cells.length < 8 || row.querySelector('.hdnCardOwnerIdx')?.value !== item.owner ||
        row.querySelector('.hdnMonthlyBillingIdx')?.value !== item.period ||
        cells[4].textContent.trim() !== item.date || normalize(cells[5].textContent) !== normalize(item.merchant) ||
        Number(cells[6].textContent.replace(/[,\s]/g, '')) !== item.amount ||
        !kind || !desc || !used || !style || !styleDesc ||
        [kind, desc, used, style, styleDesc].some(el => el.disabled) || desc.readOnly ||
        ![...kind.options].some(option => option.value === item.kind) ||
        ![...style.options].some(option => option.value === '1') ||
        (desc.value.trim() && desc.value.trim() !== item.user) ||
        (kind.value && kind.value !== item.kind)) {
      alert('기존 입력값 또는 거래 정보가 달라졌습니다. 최신 HTML로 다시 대조해 주세요.'); return;
    }
    plan.push({ kind, desc, used, style, styleDesc, item });
  }
  if (!plan.length) return;
  if (!confirm(`${plan.length}건의 적요와 이름을 채웁니다. 저장 및 결재 요청은 하지 않습니다.`)) return;
  for (const { kind, desc, used, style, styleDesc, item } of plan) {
    kind.value = item.kind;
    desc.value = item.user;
    style.value = '1';
    styleDesc.value = '복리후생비';
    // The company's legacy save handler reads the checked attribute.
    used.checked = true;
    used.setAttribute('checked', 'checked');
  }
  alert(`${plan.length}건 입력 완료. 내용을 확인한 후 회사 화면에서 저장해 주세요.`);
}

if (typeof document !== 'undefined') {
  const section = document.createElement('section');
  section.className = 'billing-helper';
  section.innerHTML = `
    <h2>회사 입력 준비</h2>
    <div class="billing-controls">
      <label>회사 내역 HTML <input id="billing-html" type="file" accept=".html,.htm,text/html"></label>
      <label>식대 적요 <select id="billing-kind"><option value="">선택</option><option value="7">휴근식대</option><option value="1">야근식대</option></select></label>
      <button type="button" id="billing-export" class="drive" disabled>입력 도구 다운로드</button>
      <a href="billing-help.md" class="view">사용 안내</a>
    </div>
    <p id="billing-summary" role="status">회사 내역 미선택</p>
    <div class="table-card"><table><thead><tr><th>이용일자</th><th>가맹점명</th><th>금액</th><th>사용자이름 → 메모</th><th>대조 결과</th></tr></thead><tbody id="billing-preview"></tbody></table></div>`;
  document.querySelector('main').append(section);
  const css = document.createElement('style');
  css.textContent = '.billing-helper{margin-top:36px;border-top:1px solid var(--line);padding-top:26px}.billing-controls{display:flex;flex-wrap:wrap;align-items:end;gap:14px;margin-top:18px}.billing-controls label{display:grid;gap:7px;font-size:12px}.billing-controls input{width:min(310px,100%);height:auto;padding:9px}.billing-controls button{cursor:pointer}.billing-controls button:disabled{opacity:.45;cursor:default}#billing-summary{font-size:13px;line-height:1.6}.billing-helper table{min-width:620px}.billing-controls label{max-width:100%}';
  document.head.append(css);
  let transactions = [], loaded = false, payload = [], readVersion = 0, modernContext = null;
  const control = id => section.querySelector('#' + id);
  function preview() {
    const receipts = data.filter(item => item.receiptDate.slice(5, 7) === month.value);
    const matches = loaded ? matchBilling(receipts, transactions) : [];
    const kind = control('billing-kind').value;
    const kindLabel = control('billing-kind').selectedOptions[0].textContent;
    payload = [];
    control('billing-preview').replaceChildren();
    for (const match of matches) {
      const { receipt: r, transaction: t } = match;
      let status = match.status;
      if (status === '입력 가능' && kind && t.kind && t.kind !== (modernContext ? kindLabel : kind)) status = '기존 적요 구분 확인 필요';
      if (status === '입력 가능' && modernContext && t.account && t.account !== '복리후생비') status = '기존 계정과목 확인 필요';
      if (status === '입력 가능' && !kind) status = '적요 선택 필요';
      if (status === '입력 가능') payload.push({ id: t.id, owner: t.owner, period: t.period,
        date: t.receiptDate, merchant: t.merchant, amount: t.amount, user: r.user, kind, kindLabel });
      const tr = document.createElement('tr');
      for (const value of [r.receiptDate, r.merchant, r.amount.toLocaleString('ko-KR'), r.user, status]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      control('billing-preview').append(tr);
    }
    const periods = [...new Set(transactions.map(t => t.receiptDate.slice(0, 7)))].join(', ');
    control('billing-summary').textContent = loaded
      ? `회사 내역 ${transactions.length}건 (${periods}) / ${month.value}월 영수증 ${receipts.length}건 / 입력 가능 ${payload.length}건 / 확인 필요 ${receipts.length - payload.length}건`
      : '회사 내역 미선택';
    control('billing-export').disabled = !payload.length;
  }
  control('billing-html').addEventListener('change', async event => {
    const version = ++readVersion;
    loaded = false; transactions = []; modernContext = null; preview();
    const file = event.target.files[0];
    if (!file) return;
    try {
      const source = await file.text();
      if (version !== readVersion) return;
      const doc = new DOMParser().parseFromString(source, 'text/html');
      if (doc.querySelector('[aria-labelledby="billing-card-detail-dialog"]')) {
        const page = readModernBilling(doc);
        modernContext = { ...modernBillingContext(source), title: page.title };
        transactions = page.transactions;
      } else transactions = [...doc.querySelectorAll('tr[class^="divBillingDetailContainer1_"]')].map(row => {
        const cells = row.cells;
        const value = selector => row.querySelector(selector)?.value || '';
        return { id: value('.hdnBillingDetailIdx'), owner: value('.hdnCardOwnerIdx'), period: value('.hdnMonthlyBillingIdx'),
          receiptDate: cells[4]?.textContent.trim(), merchant: cells[5]?.textContent.trim() || '',
          amount: Number(cells[6]?.textContent.replace(/[,\s]/g, '')),
          description: value('.txtBillingKindDesc').trim(), kind: value('.cbBillingKindIdx') };
      }).filter(t => t.id && t.owner && t.period && /^\d{4}-\d{2}-\d{2}$/.test(t.receiptDate) && Number.isFinite(t.amount));
      if (!transactions.length) throw new Error('회사 카드 내역을 찾지 못했습니다. 입력 페이지의 HTML을 선택해 주세요.');
      loaded = true; preview();
    } catch (error) { control('billing-summary').textContent = error.message; }
  });
  month.addEventListener('change', preview);
  control('billing-kind').addEventListener('change', preview);
  control('billing-export').addEventListener('click', () => {
    if (!payload.length) return;
    const code = modernContext
      ? `void (${fillModernBilling.toString()})(${JSON.stringify(payload)},${JSON.stringify(modernContext)},${readModernBilling.toString()})`
      : `(${fillCompanyBilling.toString()})(${JSON.stringify(payload)})`;
    const bookmark = 'javascript:' + encodeURIComponent(code).replace(/'/g, '%27');
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>회사 카드 입력 도구</title><h1>${month.value}월 카드 입력</h1><p>${payload.length}건</p><p>아래 링크를 북마크바로 드래그한 후 로그인된 회사 카드 입력 페이지에서 해당 북마크를 누르세요.</p><a href="${bookmark}">회사 카드 입력</a><p>입력 결과를 확인한 후 회사 화면에서 저장해 주세요.</p></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `billing-input-${month.value}.html`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  preview();
}
