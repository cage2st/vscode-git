const C = window.CardMonthly, $ = id => document.getElementById(id);
let receipts = [], company = null, context = null, busy = false, revision = 0, downloadURL = null;
const initial = new Date(); initial.setMonth(initial.getMonth() - 1);
$('month').value = `${initial.getFullYear()}-${String(initial.getMonth() + 1).padStart(2, '0')}`;
const status = text => { $('status').textContent = text; };
function element(tag, text, className) {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
  if (className) el.className = className; return el;
}
function lock(value) {
  busy = value;
  for (const id of ['month', 'receipts', 'receipt-files', 'company']) $(id).disabled = value;
  render();
}
function invalidate() { receipts.forEach(r => { r.confirmed = false; r.target = null; }); }
function render() {
  const rows = company?.rows || [], month = $('month').value;
  const checks = C.assess(receipts, rows, month);
  const ready = checks.filter(c => c.ready).length;
  const active = receipts.filter(r => !r.excluded).length;
  $('count').textContent = receipts.length; $('ready').textContent = ready;
  $('pending').textContent = active - ready;
  $('analyze').disabled = busy || !receipts.length || !company;
  $('export').disabled = busy;
  $('export-help').textContent = !receipts.length ? '먼저 영수증 폴더를 불러오세요.'
    : !company ? '회사 페이지 HTML을 불러오세요.'
    : ready ? `확인된 ${ready}건을 다운로드할 수 있습니다.`
    : '입력 준비 완료가 0건입니다. 아래 대조표의 확인 · 상태를 확인해 주세요.';
  clearDownload();
  $('csv').disabled = busy || !receipts.length;
  $('rows').replaceChildren();
  receipts.forEach((r, i) => {
    const tr = element('tr'); if (r.excluded) tr.className = 'excluded';
    const fileCell = element('td'); fileCell.append(element('div', r.file.name, 'file-title'));
    const view = element('button', '원본 보기', 'secondary'); view.onclick = () => openReceipt(r); fileCell.append(view);
    const exclude = element('label'); const excluded = element('input'); excluded.type = 'checkbox'; excluded.checked = r.excluded;
    excluded.disabled = busy; excluded.onchange = () => { r.excluded = excluded.checked; r.confirmed = false; render(); };
    exclude.append(excluded, '입력 대상에서 제외'); fileCell.append(exclude);
    const person = element('td');
    for (const [field, type, label] of [['date', 'date', '사용일']]) {
      const input = element('input'); input.type = type; input.value = r[field]; input.setAttribute('aria-label', `${r.file.name} ${label}`);
      input.disabled = busy || r.excluded;
      input.onchange = () => { r[field] = input.value.trim(); r.confirmed = false; if (field === 'date') r.target = null; render(); };
      const holder = element('label', label + ' '); holder.append(input); person.append(holder);
    }
    person.append(element('strong', r.user || '파일명에 사용자 이름이 없습니다.', 'filename-user'), element('small', '파일명에서 읽은 이름 · 메모에 그대로 입력'));
    const amount = element('td', r.target !== null && rows[r.target] ? rows[r.target].amount.toLocaleString('ko-KR') + '원' : '거래 선택 후 표시');
    amount.append(element('small', '회사 내역 기준'));
    const target = element('td'), select = element('select'); select.setAttribute('aria-label', `${r.file.name} 회사 거래`);
    select.disabled = busy || r.excluded; const empty = element('option', '거래를 선택해 주세요'); empty.value = ''; select.append(empty);
    rows.forEach((t, index) => {
      if (t.date !== r.date || t.date.slice(0, 7) !== month) return;
      const option = element('option', `${t.merchant} · ${t.amount.toLocaleString('ko-KR')}원`); option.value = index; select.append(option);
    });
    select.value = r.target === null ? '' : String(r.target);
    select.onchange = () => { r.target = select.value === '' ? null : Number(select.value); r.confirmed = false; render(); };
    target.append(select);
    if (r.target !== null && rows[r.target]) target.append(element('small', `기존 메모: ${rows[r.target].memo || '(비어 있음)'}`));
    const check = element('td'), label = element('label'), confirmed = element('input'); confirmed.type = 'checkbox'; confirmed.checked = r.confirmed;
    confirmed.disabled = busy || r.excluded || r.target === null;
    confirmed.onchange = () => { r.confirmed = confirmed.checked; render(); };
    label.append(confirmed, '원본 대조 확인'); check.append(label, element('span', checks[i].status, 'state' + (checks[i].ready ? ' ready' : '')));
    tr.append(fileCell, person, amount, target, check); $('rows').append(tr);
  });
  if (!receipts.length) { const tr = element('tr'), td = element('td', '영수증 폴더를 불러오세요.', 'empty'); td.colSpan = 5; tr.append(td); $('rows').append(tr); }
  const linked = new Set(receipts.filter((r, i) => checks[i].ready).map(r => r.target));
  const unmatched = rows.filter((t, i) => t.date.slice(0, 7) === month && !linked.has(i));
  $('unmatched').textContent = unmatched.length;
  $('unmatched-list').replaceChildren(...unmatched.map(t => element('li', `${t.date} · ${t.merchant} · ${t.amount.toLocaleString('ko-KR')}원`)));
}
async function importReceipts(files) {
  if (busy) return;
  const supported = [...files].filter(f => /\.(jpe?g|png|webp|pdf)$/i.test(f.name) || /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type));
  if (!supported.length) { status('지원하는 이미지·PDF가 없습니다. ZIP은 먼저 압축을 풀어 주세요.'); return; }
  const skipped = files.length - supported.length;
  lock(true); status('영수증 이름과 중복 파일을 확인하고 있습니다.');
  try {
    const next = [];
    for (const file of supported) {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
      next.push({ file, ...C.parseName(file.name), hash, target: null, confirmed: false, excluded: false,
        url: URL.createObjectURL(file) });
    }
    receipts.forEach(r => URL.revokeObjectURL(r.url)); receipts = next;
    const months = [...new Set(receipts.map(r => r.date.slice(0, 7)).filter(Boolean))];
    if (months.length === 1) $('month').value = months[0];
    status(`영수증 ${receipts.length}개를 불러왔습니다.${skipped ? ` 지원하지 않는 파일 ${skipped}개 제외.` : ''} 회사 거래의 금액·가맹점과 사용자 이름을 확인하세요.`);
  } catch (error) { status(`영수증 가져오기 실패: ${error.message}`); }
  finally { recommend(); lock(false); }
}
$('receipts').onchange = event => importReceipts(event.target.files);
$('receipt-files').onchange = event => importReceipts(event.target.files);
$('company').onchange = async event => {
  const current = ++revision; company = null; context = null; invalidate(); render();
  $('company-info').textContent = '회사 내역을 불러오는 중입니다.';
  const file = event.target.files[0]; if (!file) { $('company-info').textContent = '회사 내역을 선택해 주세요.'; return; }
  try {
    const source = await file.text(); if (revision !== current) return;
    const parsed = C.readCompany(new DOMParser().parseFromString(source, 'text/html'));
    const sourceContext = C.readContext(source);
    // Keep only the values we use; never execute any attached page script.
    company = { title: parsed.title, rows: parsed.rows.map(({ input, ...row }) => row) };
    context = { ...sourceContext, title: parsed.title };
    recommend();
    $('company-info').textContent = `${parsed.title} · 회사 거래 ${parsed.rows.length}건`;
    status('회사 내역을 불러왔습니다. 회사 거래의 금액·가맹점과 사용자 이름을 확인하세요.');
  } catch (error) { $('company-info').textContent = '회사 HTML을 다시 선택해 주세요.'; status(error.message); }
  render();
};
$('month').onchange = () => { invalidate(); recommend(); render(); };
function openReceipt(r) {
  $('viewer-title').textContent = r.file.name; $('viewer-body').replaceChildren();
  const pdf = r.file.type === 'application/pdf' || /\.pdf$/i.test(r.file.name);
  const media = element(pdf ? 'iframe' : 'img'); media.src = r.url;
  if (pdf) media.title = r.file.name; else media.alt = r.file.name;
  $('viewer-body').append(media); $('viewer').showModal();
}
$('close-viewer').onclick = () => { $('viewer').close(); $('viewer-body').replaceChildren(); };
function recommend() {
  if (!company) return;
  for (const r of receipts) {
    if (r.excluded || r.confirmed || r.target !== null || r.date.slice(0, 7) !== $('month').value) continue;
    const matches = C.suggest(r, company.rows);
    if (matches.length === 1 && receipts.filter(x => !x.excluded && x.date === r.date).length === 1) r.target = company.rows.indexOf(matches[0]);
  }
}
$('analyze').onclick = () => {
  recommend(); render();
  status('같은 날짜의 거래를 추천했습니다. 여러 거래가 있는 날은 회사 가맹점·금액을 보고 연결한 뒤 확인을 체크하세요.');
};
function clearDownload() {
  if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = null; }
  $('download-result').replaceChildren();
}
function download(blob, name) {
  clearDownload();
  downloadURL = URL.createObjectURL(blob);
  const link = element('a', `${name} 다시 다운로드`);
  link.href = downloadURL; link.download = name;
  $('download-result').append(element('p', '파일을 준비했습니다. 자동 다운로드가 시작되지 않으면 아래 링크를 클릭하세요.'), link);
  // Keep the link in the document and its URL alive for a direct user click.
  link.click();
  status('파일을 준비했습니다. 브라우저 다운로드 목록 또는 03 영역의 다운로드 링크를 확인하세요.');
}
$('export').onclick = () => {
  try {
  if (busy) { status('분석이 끝난 뒤 다운로드해 주세요.'); return; }
  if (!receipts.length || !company || !context) {
    const message = !receipts.length ? '먼저 01에서 영수증 폴더를 불러오세요.' : '먼저 02에서 회사 페이지 HTML을 불러오세요.';
    status(message); $('export-help').textContent = message; return;
  }
  const checks = C.assess(receipts, company.rows, $('month').value);
  const payload = receipts.flatMap((r, i) => checks[i].ready ? [{ ...company.rows[r.target], user: C.parseName(r.file.name).user }] : []);
  if (!payload.length) {
    const counts = new Map(); checks.forEach((c, i) => { if (!receipts[i].excluded) counts.set(c.status, (counts.get(c.status) || 0) + 1); });
    const message = counts.size ? '다운로드 전 확인 필요: ' + [...counts].map(([reason, count]) => `${reason} ${count}건`).join(' / ') : '모든 영수증이 제외되어 있습니다. 입력할 영수증의 제외 체크를 해제하세요.';
    status(message); $('export-help').textContent = message;
    $('rows').scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
  }
  const omitted = receipts.filter((r, i) => !r.excluded && !checks[i].ready).length;
  if (omitted && !confirm(`확인된 ${payload.length}건만 포함합니다. 미확인 ${omitted}개 영수증은 빠집니다. 계속할까요?`)) return;
  const doc = document.implementation.createHTMLDocument('회사 메모 입력 도구'); doc.documentElement.lang = 'ko';
  const meta = doc.createElement('meta'); meta.setAttribute('charset', 'utf-8'); doc.head.prepend(meta);
  const body = doc.body;
  body.append(element('h1', `${$('month').value} 회사 메모 입력`), element('p', `${context.title} · 확인된 ${payload.length}건`));
  body.append(element('p', '1. 아래 링크를 북마크바로 드래그하세요.'));
  const link = element('a', '회사 메모에 사용자 이름 입력'); link.href = C.bookmark(payload, context); body.append(link);
  body.append(element('p', '2. 회사 카드 상세 창에서 상단 적요를 휴근식대로 선택하고 전체 적용을 누르세요. 상단 메모는 비워 두세요.'));
  body.append(element('p', '3. 회사 화면에서 해당 북마크를 실행하세요. 결과와 영수증 첨부를 확인한 뒤 직접 저장하세요.'));
  body.append(element('p', `미확인 영수증 ${omitted}개는 이 도구에 포함되지 않았습니다.`));
  const list = element('ul'); payload.forEach(p => list.append(element('li', `${p.date} · ${p.merchant} · ${p.amount.toLocaleString('ko-KR')}원 → ${p.user}`))); body.append(list);
  download(new Blob(['<!doctype html>' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }), `회사-메모-입력-${$('month').value}.html`);
  } catch (error) {
    const message = `입력 도구 생성 실패: ${error.message}`;
    status(message); $('export-help').textContent = message;
  }
};
$('csv').onclick = () => {
  const checks = C.assess(receipts, company?.rows || [], $('month').value);
  const escape = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  const lines = [['파일명', '사용일', '사용자', '금액', '회사 가맹점', '상태'], ...receipts.map((r, i) => [r.file.name, r.date, r.user, company?.rows[r.target]?.amount, company?.rows[r.target]?.merchant || '', checks[i].status])];
  download(new Blob(['\ufeff' + lines.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `영수증-대조-${$('month').value}.csv`);
};
render();
