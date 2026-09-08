(function(root){
const text=v=>String(v==null?'':typeof v==='object'?(v.text??(v.richText?v.richText.map(x=>x.text).join(''):v.result??'')):v);
const norm=s=>String(s).replace(/\s+/g,'').toLowerCase();
const headers={date:['날짜','이용일자','사용일','사용일자','거래일자'],amount:['금액','금액(카드결제액)','매입금액','카드결제액','결제금액'],user:['이름','이름(파일명)','사용자','사용자이름','성명'],merchant:['거래처','가맹점명','가맹점','사용처']};
function mapping(sheet){for(let n=1;n<=Math.min(sheet.rowCount,30);n++){const result={};sheet.getRow(n).eachCell((c,i)=>{for(const [field,aliases]of Object.entries(headers))if(aliases.includes(norm(text(c.value))))result[field]=i;});if(Object.keys(result).length===4)return{row:n,...result};}return null;}
function dateValue(value,date1904){
 if(value&&typeof value==='object'&&!(value instanceof Date))value=value.result;
 if(typeof value==='number')value=new Date(Date.UTC(1899,11,30)+(value+(date1904?1462:0))*86400000);
 if(value instanceof Date)return isNaN(value)?'':value.toISOString().slice(0,10);
 const m=String(value||'').trim().match(/^(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})(?:일|\s.*)?$/);
 return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';
}
function readRows(sheet,date1904){const map=mapping(sheet);if(!map)throw Error('날짜·금액·이름·거래처 열이 있는 시트를 선택해 주세요.');const rows=[],errors=[];
 for(let n=map.row+1;n<=sheet.rowCount;n++){const row=sheet.getRow(n);const values=Object.fromEntries(Object.entries(map).filter(([k])=>k!=='row').map(([k,i])=>[k,row.getCell(i).value]));
 if(Object.values(values).every(v=>!text(v)))continue;
 if(/^(합계|총합계|총계|소계)$/.test(text(values.date).trim()))continue;
 const date=dateValue(values.date,date1904),user=text(values.user).trim(),merchant=text(values.merchant).trim();
 const amountText=text(values.amount).replace(/[₩원,\s]/g,'');const amount=/^\d+(?:\.0+)?$/.test(amountText)?Number(amountText):NaN;
 const d=new Date(date+'T00:00:00Z');
 if(!date||isNaN(d)||d.toISOString().slice(0,10)!==date||!user||!merchant||!Number.isSafeInteger(amount)||amount<=0){errors.push(`${n}행: 날짜·금액·이름·거래처를 확인하세요.`);continue;}
 rows.push({date,amount,user,merchant,excelRow:n});
 }if(!rows.length)throw Error(errors.join('\n')||'사용 내역이 없습니다.');return{rows,errors};
}
function match(rows,transactions){return rows.map(r=>{const candidates=transactions.flatMap((t,i)=>t.date===r.date&&t.amount===r.amount?[i]:[]);const exact=candidates.filter(i=>norm(transactions[i].merchant)===norm(r.merchant));return{...r,candidates,target:exact.length===1?exact[0]:null,approved:exact.length===1,excluded:false};});}
function assess(rows,transactions){return rows.map(r=>{
 if(r.excluded)return{ready:false,status:'제외'};
 if(r.target===null||!transactions[r.target])return{ready:false,status:r.candidates.length?'거래처 확인 후 선택':'일치하는 날짜·금액 없음'};
 const t=transactions[r.target];if(t.date!==r.date||t.amount!==r.amount)return{ready:false,status:'날짜·금액 불일치'};
 if(rows.some(x=>x!==r&&!x.excluded&&x.target===r.target)||transactions.filter(x=>x.date===t.date&&x.amount===t.amount&&norm(x.merchant)===norm(t.merchant)).length!==1)return{ready:false,status:'중복 거래 확인 필요'};
 if(!r.approved)return{ready:false,status:'거래처 차이 확인 체크 필요'};
 return{ready:true,status:t.memo.trim()&&t.memo.trim()!==r.user?'기존 메모 교체 예정':'입력 준비 완료'};
});}
const api={text,mapping,dateValue,readRows,match,assess};root.CardExcel=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
