const fs=require('fs');const path=require('path');
const Excel=require('/tmp/cs-card-xlsx/node_modules/exceljs');
const {JSDOM}=require('/tmp/global-cs-billing-tests/node_modules/jsdom');
const C=require('../monthly-core.js');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync('/tmp/august-review/manifest.json','utf8'));
// Verified against each receipt image/PDF. Amounts are actual card payments, not subtotal or cash.
const verified=[
 [15000,'프레디버거 교대역점',''],
 [15000,'포호아 예술의전당점','영수증 총액 16,000원 = 카드 15,000원 + 현금 1,000원. 금액은 카드 결제액.'],
 [8800,'이마트24 서초점','할인 적용 후 카드 결제액 8,800원.'],
 [10500,'고봉김밥 예술의전당점',''],
 [10500,'세븐일레븐 서초예당점',''],
 [15000,'KFC 서초동점','영수증 표기 “서초동”; 사업자번호·전화번호가 다른 KFC 영수증과 일치하며 회사 거래처 표기로 정리.'],
 [14600,'KFC 서초동점','영수증 표기: KFC서초동에프.'],
 [14000,'평안도식당 교대점',''],
 [14900,'KFC 서초동점','영수증 표기: KFC서초동에프.'],
 [14500,'고봉김밥 예술의전당점',''],
 [14900,'KFC 서초동점','영수증 표기: KFC서초동에프.'],
 [12340,'이마트24 예술의전당점',''],
 [14200,'순옥정','회사 거래처 표기는 순옥에프앤비. 영수증의 상점명 사용.'],
 [14000,'허수아비돈까스','영수증에 지점명이 “(서”까지 표시되어 지점명 생략.'],
 [14800,'세븐일레븐 서초예당점',''],
 [14500,'제육대가(서초점)',''],
 [14500,'제육대가(서초점)',''],
 [14700,'KFC 서초동점','영수증 표기: KFC서초동에프.'],
 [13500,'포호아 예술의전당점','']
];
const rows=manifest.map((r,i)=>{const p=C.parseName(r.file);if(!p.user||!p.date)throw Error('Bad filename');return{date:p.date,user:p.user,meal:p.meal,amount:verified[i][0],merchant:verified[i][1],note:verified[i][2],file:r.file}});
const total=rows.reduce((s,r)=>s+r.amount,0);
const doc=new JSDOM(fs.readFileSync(path.join(root,'작성_결재 _ 법인카드 - ESTgames Groupware.html'),'utf8'));
const company=C.readCompany(doc.window.document).rows.filter(r=>r.date.startsWith('2026-08'));
const amountKeys=a=>a.map(r=>r.date+'|'+r.amount).sort();
if(JSON.stringify(amountKeys(rows))!==JSON.stringify(amountKeys(company)))throw Error('Company dates/amounts differ');
if(rows.length!==19||total!==260240)throw Error('Unexpected totals');
const wb=new Excel.Workbook();wb.creator='CS팀';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
const color='234F40',light='EAF1EB',gray='56665C';
function setup(name,title,sub,widths,headers){
 const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:4}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 ws.columns=widths.map(width=>({width}));ws.mergeCells(1,1,1,headers.length);ws.getCell('A1').value=title;ws.getRow(1).height=32;ws.getCell('A1').font={name:'맑은 고딕',size:19,bold:true,color:{argb:color}};
 ws.mergeCells(2,1,2,headers.length);ws.getCell('A2').value=sub;ws.getCell('A2').font={name:'맑은 고딕',size:10,color:{argb:gray}};ws.getCell('A2').alignment={wrapText:true,vertical:'middle'};ws.getRow(2).height=32;
 ws.getRow(4).values=headers;ws.getRow(4).height=25;ws.getRow(4).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};c.font={name:'맑은 고딕',bold:true,color:{argb:'FFFFFF'}};c.alignment={vertical:'middle'}});
 ws.headerFooter.oddFooter='&L2026년 08월 법인카드 영수증&R&P / &N';ws.pageSetup.printTitlesRow='1:4';return ws;
}
function body(ws,start,end){for(let n=start;n<=end;n++){const row=ws.getRow(n);row.height=36;row.eachCell(c=>{c.font={name:'맑은 고딕',size:10};c.alignment={vertical:'middle',wrapText:true};if(n%2===1)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F2F6F1'}};c.border={bottom:{style:'hair',color:{argb:'DCE4DC'}}}})}ws.autoFilter={from:{row:4,column:1},to:{row:end,column:ws.columnCount}};}
function totals(ws,row,label,col,value,formula){ws.getCell(row,1).value=label;ws.getCell(row,col).value={formula,result:value};ws.getRow(row).height=26;ws.getRow(row).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:light}};c.font={name:'맑은 고딕',bold:true,color:{argb:color}}});ws.getCell(row,col).numFmt='#,##0"원"';}
const main=setup('08월 사용내역','2026년 08월 법인카드 영수증',`영수증 ${rows.length}건 | 사용자 ${new Set(rows.map(r=>r.user)).size}명 | 카드 결제액 ${total.toLocaleString('ko-KR')}원 | 이름은 파일명 기준, 날짜·금액은 원본 확인`,[15,17,13,29,15,59,72],['날짜','금액(카드 결제액)','이름(파일명)','거래처','사용 구분(파일명)','원본 파일명','비고']);
rows.forEach(r=>main.addRow([new Date(r.date+'T00:00:00Z'),r.amount,r.user,r.merchant,r.meal,r.file,r.note]));
body(main,5,23);main.getColumn(1).numFmt='yyyy-mm-dd';main.getColumn(2).numFmt='#,##0"원"';
for(let i=0;i<rows.length;i++){const cell=main.getCell(i+5,6);cell.value={text:rows[i].file,hyperlink:'G:\\공유 드라이브\\[EG] CS팀\\CS팀\\99. CS팀 법인카드 영수증\\2026_08\\'+rows[i].file};cell.font={name:'맑은 고딕',size:10,color:{argb:'2463A0'},underline:true};}
main.getRow(6).height=46;main.getRow(10).height=46;
totals(main,24,'합계',2,total,'SUM(B5:B23)');
for(const [name,field,col]of [['사용자별 합계','user','C'],['거래처별 합계','merchant','D'],['날짜별 합계','date','A']]){
 const groups=[...new Set(rows.map(r=>r[field]))].sort((a,b)=>a.localeCompare(b,'ko'));
 const ws=setup(name,'2026년 08월 '+name,'08월 사용내역 시트를 기준으로 집계한 카드 결제액입니다.',[34,16,22],[field==='user'?'이름(파일명)':field==='merchant'?'거래처':'날짜','건수','카드 결제액']);
 groups.forEach((g,i)=>{const n=i+5,items=rows.filter(r=>r[field]===g);ws.addRow([field==='date'?new Date(g+'T00:00:00Z'):g,{formula:`COUNTIF('08월 사용내역'!${col}$5:${col}$23,A${n})`,result:items.length},{formula:`SUMIF('08월 사용내역'!${col}$5:${col}$23,A${n},'08월 사용내역'!B$5:B$23)`,result:items.reduce((s,r)=>s+r.amount,0)}]);});
 body(ws,5,groups.length+4);if(field==='date')ws.getColumn(1).numFmt='yyyy-mm-dd';ws.getColumn(3).numFmt='#,##0"원"';const end=groups.length+5;totals(ws,end,'합계',3,total,`SUM(C5:C${end-1})`);ws.getCell(end,2).value={formula:`SUM(B5:B${end-1})`,result:19};
}
const filename='2026_08_법인카드_영수증_정리.xlsx';
(async()=>{
 await wb.xlsx.writeFile(path.join(root,filename));
 const check=new Excel.Workbook();await check.xlsx.readFile(path.join(root,filename));
 const data=check.getWorksheet('08월 사용내역');let sum=0;for(let n=5;n<=23;n++){if(!(data.getCell(n,1).value instanceof Date))throw Error('Invalid date');sum+=data.getCell(n,2).value;if(data.getCell(n,3).value!==rows[n-5].user)throw Error('Name mismatch');}
 if(sum!==total||check.worksheets.length!==4)throw Error('Workbook verification failed');
 fs.writeFileSync(path.join(__dirname,'2026_08_verified.json'),JSON.stringify({source:'G:\\공유 드라이브\\[EG] CS팀\\CS팀\\99. CS팀 법인카드 영수증\\2026_08',amountBasis:'카드 결제액; 현금 결제 제외',rows,total},null,2));
 console.log(JSON.stringify({path:path.join(root,filename),receipts:rows.length,users:new Set(rows.map(r=>r.user)).size,total,sheets:check.worksheets.map(s=>s.name),companyDateAmountCheck:'19/19 일치'}));
})();
