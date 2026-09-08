(function(root){
 async function run(rows,month,target,readPage,fill){
  try{
   const url=new URL(location.href);
   if(url.origin!=='https://gw.estgames.com'||url.pathname!=='/apps/billing/cards')throw Error('회사 카드 상세 페이지에서 북마크를 실행해 주세요.');
   const cardId=url.searchParams.get('cardId'),periodId=url.searchParams.get('periodId');
   if(!cardId||!periodId)throw Error('대상 카드의 상세 창을 열어 주세요.');
   if(target&&(target.cardId!==cardId||target.periodId!==periodId))throw Error('입력 도구를 만들 때 지정한 카드 페이지를 열어 주세요.');
   const page=readPage(document), norm=s=>s.replace(/\s+/g,'').toLowerCase(), used=new Set(), differences=[];
   const titleMonth=page.title.match(/(\d{2,4})년\s*(\d{1,2})월/);
   if(!titleMonth||`${titleMonth[1].length===2?'20':''}${titleMonth[1]}-${titleMonth[2].padStart(2,'0')}`!==month)throw Error('엑셀의 대상 월과 회사 카드 청구월이 다릅니다.');
   const payload=rows.map(r=>{
    const candidates=page.rows.filter(t=>t.date===r.date&&t.amount===r.amount);
    const exact=candidates.filter(t=>norm(t.merchant)===norm(r.merchant));
    const matches=exact.length?exact:candidates;
    if(matches.length!==1)throw Error(`${r.date} · ${r.merchant} · ${r.amount.toLocaleString('ko-KR')}원: 회사 거래가 없거나 여러 건입니다. 엑셀 거래처를 회사 표기와 맞춰 주세요.`);
    const t=matches[0];if(used.has(t))throw Error('같은 회사 거래에 여러 이름이 연결됩니다. 엑셀 중복 내역을 확인해 주세요.');used.add(t);
    if(!exact.length)differences.push(`${r.date} · ${r.amount.toLocaleString('ko-KR')}원 · ${r.user}\n엑셀: ${r.merchant}\n회사: ${t.merchant}`);
    return {...r,merchant:t.merchant};
   });
   if(differences.length&&!confirm(`날짜와 금액은 같지만 거래처 표기가 다른 ${differences.length}건이 있습니다.\n\n${differences.join('\n\n')}\n\n동일한 거래가 맞습니까?`))return;
   await fill(payload,{cardId,periodId,title:page.title},readPage);
  }catch(e){alert('입력하지 않았습니다: '+e.message);}
 }
 function bookmark(rows,month,target){return 'javascript:'+encodeURIComponent(`void (${run.toString()})(${JSON.stringify(rows)},${JSON.stringify(month)},${JSON.stringify(target)},${CardMonthly.readCompany.toString()},${CardMonthly.fillMemos.toString()})`).replace(/'/g,'%27');}
 root.CorporateMemo={bookmark,run};
})(globalThis);
