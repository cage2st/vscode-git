/* Local receipt matching and the self-contained company-page bookmark. */
(function (root) {
  const normalize = value => String(value).replace(/\s+/g, '').toLowerCase();
  const key = row => JSON.stringify([row.date, normalize(row.merchant), row.amount]);
  function parseName(name) {
    const stem = name.replace(/\.(jpe?g|png|webp|pdf)$/i, '');
    const m = stem.match(/^(\d{4})_(\d{2})(\d{2})\([^)]*\)_([^_]+)_(.+)$/);
    if (!m) return { date: '', user: '', meal: '' };
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    if (!validDate(date)) return { date: '', user: '', meal: '' };
    return { date, meal: m[4].trim(), user: m[5].trim() };
  }
  function validDate(date) {
    const d = new Date(date + 'T00:00:00Z');
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(d) && d.toISOString().slice(0, 10) === date;
  }
  function amountsIn(text) {
    const tokens = text.match(/(?<![\d.,])(?:\d{1,3}(?:,\s*\d{3})+|\d{3,9})(?![\d.,])/g) || [];
    return [...new Set(tokens.map(t => Number(t.replace(/[,\s]/g, ''))).filter(n => n > 0))];
  }
  function readCompany(doc) {
    const dialogs = [...doc.querySelectorAll('[role="dialog"][aria-labelledby="billing-card-detail-dialog"]')];
    if (dialogs.length !== 1) throw new Error('카드 상세 창을 연 상태에서 저장한 HTML이 필요합니다.');
    const dialog = dialogs[0];
    const title = dialog.querySelector('#billing-card-detail-dialog span')?.textContent.trim();
    const tables = [...dialog.querySelectorAll('table')].filter(t =>
      JSON.stringify([...t.querySelectorAll('thead th')].map(x => x.textContent.trim())) ===
      JSON.stringify(['', '순번', '이용일자', '가맹점명', '매입금액', '적요', '계정과목', '메모']));
    if (!title || tables.length !== 1) throw new Error('회사 거래 표를 확인할 수 없습니다.');
    const rows = [...tables[0].querySelectorAll('tbody tr')].map(row => {
      const c = row.cells;
      const memo = c[7]?.querySelector('input[type="text"]');
      const kind = c[5]?.querySelector('[aria-haspopup="listbox"]');
      const amount = c[4]?.textContent.replace(/[,\s]/g, '');
      if (c.length !== 8 || !memo || !kind || !/^\d+$/.test(amount)) throw new Error('거래 입력란 구조를 확인해 주세요.');
      const date = c[2].textContent.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('거래 날짜를 확인할 수 없습니다.');
      return { date, merchant: c[3].textContent.trim(), amount: Number(amount), memo: memo.value,
        kind: kind.textContent.trim(), input: memo };
    });
    if (!rows.length) throw new Error('카드 거래 내역이 없습니다.');
    return { title, rows };
  }
  function readContext(source) {
    const match = source.match(/<!--\s*saved from url=\(\d+\)(https:\/\/[^\s]+)\s*-->/);
    if (!match) throw new Error('브라우저의 페이지 저장 기능으로 HTML을 다시 저장해 주세요 (원본 주소 누락).');
    const url = new URL(match[1]);
    if (url.origin !== 'https://gw.estgames.com' || url.pathname !== '/apps/billing/cards' ||
        !/^\d+$/.test(url.searchParams.get('cardId') || '') || !/^\d+$/.test(url.searchParams.get('periodId') || '')) {
      throw new Error('회사 카드 상세 주소가 올바르지 않습니다.');
    }
    return { cardId: url.searchParams.get('cardId'), periodId: url.searchParams.get('periodId') };
  }
  function suggest(receipt, rows) {
    if (!validDate(receipt.date) || !receipt.user.trim()) return [];
    return rows.filter(t => t.date === receipt.date);
  }
  function assess(receipts, rows, month) {
    return receipts.map(r => {
      if (r.excluded) return { status: '제외', ready: false };
      if (!validDate(r.date) || !r.user.trim()) return { status: '날짜·사용자 이름 필요', ready: false };
      if (r.date.slice(0, 7) !== month) return { status: '다른 월', ready: false };
      if (r.hash && receipts.some(x => x !== r && !x.excluded && x.hash === r.hash)) return { status: '동일 파일 중복 — 한 개만 남겨 주세요', ready: false };
      if (r.target === null || r.target === undefined || !rows[r.target]) return { status: '거래 연결 필요', ready: false };
      const t = rows[r.target];
      if (t.date !== r.date) return { status: '날짜 확인 필요', ready: false };
      if (rows.filter(x => key(x) === key(t)).length !== 1 || receipts.some(x => x !== r && !x.excluded && x.target === r.target)) return { status: '거래 중복 연결', ready: false };
      if (t.memo.trim() && t.memo.trim() !== r.user.trim()) return { status: '기존 메모 충돌', ready: false };
      if (!r.confirmed) return { status: '원본 대조 후 확인 체크', ready: false };
      return { status: '입력 준비 완료', ready: true };
    });
  }
  async function fillMemos(payload, expected, readPage) {
    if (window.__csMemoRunning) { alert('메모 입력이 진행 중입니다.'); return; }
    window.__csMemoRunning = true;
    let completed = 0;
    const originals = new Map();
    const norm = s => s.replace(/\s+/g, '').toLowerCase();
    const key = t => JSON.stringify([t.date, norm(t.merchant), t.amount]);
    const wait = () => new Promise(resolve => setTimeout(resolve, 60));
    function locate(item) {
      const url = new URL(location.href);
      if (url.origin !== 'https://gw.estgames.com' || url.pathname !== '/apps/billing/cards' ||
          url.searchParams.get('cardId') !== expected.cardId || url.searchParams.get('periodId') !== expected.periodId) throw new Error('대조한 카드·청구월의 상세 창을 열어 주세요.');
      const page = readPage(document);
      if (page.title !== expected.title) throw new Error('카드 상세 제목이 달라졌습니다.');
      const matches = page.rows.filter(t => key(t) === key(item));
      if (matches.length !== 1) throw new Error('거래가 없거나 중복됩니다. 다시 대조해 주세요.');
      const t = matches[0], input = t.input;
      if (t.kind !== '휴근식대') throw new Error('먼저 상단 적요에서 휴근식대를 선택하고 전체 적용을 눌러 주세요.');
      if (input.disabled || input.readOnly || input.closest('.Mui-disabled') ||
          input.getAttribute('aria-disabled') === 'true') throw new Error('메모 입력란이 잠겨 있습니다.');
      if (!item.user.trim() || (input.maxLength >= 0 && item.user.length > input.maxLength)) throw new Error('사용자 이름을 확인해 주세요.');
      if (originals.has(key(item)) && input.value !== originals.get(key(item)) && input.value !== item.user) throw new Error('확인 후 메모 내용이 변경되었습니다. 다시 실행해 주세요.');
      return input;
    }
    try {
      if (!payload.length || new Set(payload.map(key)).size !== payload.length) throw new Error('입력 대상이 비어 있거나 중복됩니다.');
      payload.forEach(item => originals.set(key(item), locate(item).value));
      const replacements = payload.filter(item => originals.get(key(item)).trim() && originals.get(key(item)) !== item.user);
      const changes = replacements.map(item => `${item.date} · ${item.merchant} · ${item.amount.toLocaleString('ko-KR')}원\n${JSON.stringify(originals.get(key(item)))} → ${JSON.stringify(item.user)}`).join('\n\n');
      if (!confirm(`${expected.title}\n${payload.length}건의 메모에 엑셀의 사용자 이름을 입력합니다.\n${replacements.length ? `기존 메모 ${replacements.length}건을 아래 이름으로 교체합니다.\n\n${changes}\n\n` : ''}이 내용으로 입력할까요? 저장과 결재 제출은 직접 진행해 주세요.`)) return;
      payload.forEach(locate);
      for (const item of payload) {
        const input = locate(item);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, item.user);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await wait();
        if (locate(item).value !== item.user) throw new Error('입력값이 반영되지 않았습니다.');
        completed++;
      }
      payload.forEach(item => { if (locate(item).value !== item.user) throw new Error('입력값이 변경되었습니다.'); });
      alert(`${completed}건의 사용자 이름을 입력했습니다.\n결과와 영수증 첨부를 확인한 뒤 직접 저장해 주세요.`);
    } catch (error) {
      alert(`입력 중단 (${completed}건 완료): ${error.message}\n일부 값이 남아 있을 수 있으니 현재 화면을 확인해 주세요.`);
    } finally { delete window.__csMemoRunning; }
  }
  function bookmark(payload, context) {
    const code = `void (${fillMemos.toString()})(${JSON.stringify(payload)},${JSON.stringify(context)},${readCompany.toString()})`;
    return 'javascript:' + encodeURIComponent(code).replace(/'/g, '%27');
  }
  const api = { parseName, validDate, amountsIn, readCompany, readContext, suggest, assess, bookmark, fillMemos, key };
  if (typeof module !== 'undefined') module.exports = api;
  root.CardMonthly = api;
})(globalThis);
