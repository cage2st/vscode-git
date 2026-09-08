(() => {
const $=id=>document.getElementById(id), X=CardExcel, C=CardMonthly;
let workbook=null, sourceRows=[], invalid=[], company=null, context=null, matches=[], blobURL=null, excelVersion=0, companyVersion=0;
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const status=text=>{$('status').textContent=text;};
function clearResult(){if(blobURL)URL.revokeObjectURL(blobURL);blobURL=null;$('result').hidden=true;$('code').value='';$('download').removeAttribute('href');$('copy-status').textContent='';}
function rematch(){clearResult();matches=X.match(sourceRows.filter(r=>r.date.slice(0,7)===$('month').value),company?.rows||[]);render();}
function loadSheet(){
 sourceRows=[];invalid=[];clearResult();
 try{const parsed=X.readRows(workbook.getWorksheet(Number($('sheet').value)),workbook.properties.date1904);sourceRows=parsed.rows;invalid=parsed.errors;const months=[...new Set(sourceRows.map(r=>r.date.slice(0,7)))].sort();$('month').replaceChildren(...months.map(m=>{const o=el('option',m);o.value=m;return o;}));$('month').disabled=false;status(`${sourceRows.length}건을 읽었습니다.${invalid.length?` 읽지 못한 ${invalid.length}개 행을 확인하세요.`:''}`);}
 catch(e){$('month').replaceChildren();$('month').disabled=true;status(e.message);}
 $('errors').hidden=!invalid.length;$('error-list').replaceChildren(...invalid.map(t=>el('li',t)));rematch();
}
$('xlsx').onchange=async event=>{
 const version=++excelVersion;workbook=null;sourceRows=[];invalid=[];$('sheet').replaceChildren();$('sheet').disabled=true;$('month').replaceChildren();$('month').disabled=true;$('errors').hidden=true;rematch();
 const file=event.target.files[0];if(!file)return;status('엑셀을 읽고 있습니다.');
 try{const next=new ExcelJS.Workbook();await next.xlsx.load(await file.arrayBuffer());if(version!==excelVersion)return;
 const sheets=next.worksheets.filter(X.mapping);if(!sheets.length)throw Error('날짜·금액·이름·거래처 열이 있는 시트가 없습니다.');
 workbook=next;$('sheet').replaceChildren(...sheets.map(s=>{const o=el('option',s.name);o.value=s.id;return o;}));$('sheet').disabled=false;loadSheet();
 }catch(e){if(version===excelVersion)status('엑셀 읽기 실패: '+e.message);}
};
$('sheet').onchange=loadSheet;$('month').onchange=rematch;
$('company').onchange=async event=>{
 const version=++companyVersion;company=null;context=null;$('company-info').textContent='회사 내역 미선택';$('company-link').hidden=true;$('company-link').removeAttribute('href');rematch();
 const file=event.target.files[0];if(!file)return;
 try{const source=await file.text();if(version!==companyVersion)return;const parsed=C.readCompany(new DOMParser().parseFromString(source,'text/html'));const ctx=C.readContext(source);
 company={title:parsed.title,rows:parsed.rows.map(({input,...r})=>r)};context={...ctx,title:parsed.title};$('company-info').textContent=`${parsed.title} · ${parsed.rows.length}건`;
 $('company-link').href=`https://gw.estgames.com/apps/billing/cards?periodId=${ctx.periodId}&cardId=${ctx.cardId}`;$('company-link').hidden=false;status('회사 내역을 불러왔습니다. 대조 결과를 확인하세요.');rematch();
 }catch(e){status(e.message);}
};
function render(){
 const tx=company?.rows||[],checks=X.assess(matches,tx),ready=checks.filter(c=>c.ready).length;
 $('count').textContent=matches.length;$('ready').textContent=ready;$('pending').textContent=matches.filter((r,i)=>!r.excluded&&!checks[i].ready).length;
 $('rows').replaceChildren();
 matches.forEach((r,i)=>{
 const tr=el('tr');tr.append(el('td',`${r.excelRow}행 · ${r.date}`),el('td',r.amount.toLocaleString('ko-KR')+'원'),el('td',r.user),el('td',r.merchant));
 const cell=el('td'),select=el('select');select.setAttribute('aria-label',`${r.excelRow}행 회사 거래`);const empty=el('option','거래를 선택하세요');empty.value='';select.append(empty);
 r.candidates.forEach(index=>{const t=tx[index],o=el('option',`${t.merchant} · ${t.amount.toLocaleString('ko-KR')}원`);o.value=index;select.append(o);});select.value=r.target===null?'':String(r.target);select.disabled=r.excluded;
 select.onchange=()=>{r.target=select.value===''?null:Number(select.value);r.approved=false;clearResult();render();};cell.append(select);
 if(r.target!==null)cell.append(el('small',`현재 메모: ${tx[r.target].memo||'(비어 있음)'}`));
 const checkCell=el('td'),label=el('label'),check=el('input');check.type='checkbox';check.checked=r.approved;check.disabled=r.target===null||r.excluded;check.onchange=()=>{r.approved=check.checked;clearResult();render();};label.append(check,'거래 확인');
 const excludeLabel=el('label'),exclude=el('input');exclude.type='checkbox';exclude.checked=r.excluded;exclude.onchange=()=>{r.excluded=exclude.checked;clearResult();render();};excludeLabel.append(exclude,'제외');
 const state=el('span',checks[i].status);state.className='state'+(checks[i].ready?' ready':'');checkCell.append(label,excludeLabel,state);tr.append(cell,checkCell);$('rows').append(tr);
 });
 if(!matches.length){const tr=el('tr'),td=el('td','엑셀과 회사 내역을 불러오세요.');td.colSpan=6;tr.append(td);$('rows').append(tr);}
 const linked=new Set(matches.filter((r,i)=>checks[i].ready).map(r=>r.target));const unlinked=tx.filter((r,i)=>r.date.slice(0,7)===$('month').value&&!linked.has(i));$('unmatched').textContent=unlinked.length;$('unmatched-list').replaceChildren(...unlinked.map(r=>el('li',`${r.date} · ${r.merchant} · ${r.amount.toLocaleString('ko-KR')}원`)));
}
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('code').value);$('copy-status').textContent='복사했습니다. 새 북마크의 URL에 붙여넣거나 기존 북마크 URL을 교체하세요.';}catch{$('code').closest('details').open=true;$('code').focus();$('code').select();$('copy-status').textContent='주소를 선택했습니다. Ctrl+C로 복사하세요.';}};
$('prepare').onclick=()=>{
 try{
 if(!sourceRows.length||!company||!context){status('엑셀과 회사 페이지 HTML을 모두 불러오세요.');return;}
 const checks=X.assess(matches,company.rows);const payload=matches.flatMap((r,i)=>checks[i].ready?[{date:r.date,amount:r.amount,merchant:company.rows[r.target].merchant,user:r.user}]:[]);
 if(!payload.length){status('입력 가능한 거래가 없습니다. 날짜·금액·거래처와 선택 월을 확인하세요.');return;}
 const missing=matches.filter((r,i)=>!r.excluded&&!checks[i].ready).length;
 if((missing||invalid.length)&&!confirm(`입력 가능 ${payload.length}건만 포함합니다.\n선택 월 미확인 ${missing}건, 시트에서 읽지 못한 행 ${invalid.length}개는 포함되지 않습니다. 계속할까요?`))return;
 clearResult();const code=C.bookmark(payload,context);$('code').value=code;$('result-info').textContent=`${context.title} · 선택 월 ${$('month').value} · ${payload.length}건 / ${payload.reduce((sum,r)=>sum+r.amount,0).toLocaleString('ko-KR')}원 · 미확인 ${missing}건 제외 · 읽지 못한 행 ${invalid.length}개 제외`;
 $('result').hidden=false;
 const doc=document.implementation.createHTMLDocument(`${$('month').value} 회사 메모 입력`);doc.documentElement.lang='ko';const meta=doc.createElement('meta');meta.charset='utf-8';doc.head.prepend(meta);
 const result=$('result').cloneNode(true);result.hidden=false;result.querySelector('#download').remove();result.querySelector('#code').textContent=code;doc.body.append(result);
 const table=$('rows').closest('table').cloneNode(true);table.querySelectorAll('input,select').forEach(n=>n.remove());doc.body.append(el('h2','대조 내역 (체크 상태와 별개로 위 건수만 입력)'),table);
 const script=doc.createElement('script');script.textContent="document.getElementById('copy').onclick=async()=>{const field=document.getElementById('code');try{await navigator.clipboard.writeText(field.value);document.getElementById('copy-status').textContent='복사했습니다. 북마크 URL에 붙여넣으세요.';}catch{field.closest('details').open=true;field.focus();field.select();document.getElementById('copy-status').textContent='Ctrl+C로 복사하세요.';}};";doc.body.append(script);
 blobURL=URL.createObjectURL(new Blob(['<!doctype html>'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));$('download').href=blobURL;$('download').download=`회사메모입력-${$('month').value}.html`;
 status(`${payload.length}건의 입력 도구를 만들었습니다. 북마크 주소를 복사해 등록하세요.`);$('result').scrollIntoView({behavior:'smooth'});
 }catch(e){clearResult();status('입력 도구 생성 실패: '+e.message);}
};
render();
})();
