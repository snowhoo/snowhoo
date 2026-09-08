const fs = require('fs');
const vm = require('vm');
const JSZip = require('D:/hexo/source/kaoqing/lib/jszip.min.js');
const mainCode = fs.readFileSync('D:/hexo/source/kaoqing/_main_extracted.js', 'utf8');

function makeEl(){
  const t={ _html:'', value:'', textContent:'', className:'', hidden:false, checked:false, disabled:false,
    style:new Proxy({},{get:()=>'',set:()=>true}), dataset:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    options:[], children:[], childNodes:[], files:[],
    addEventListener(){},removeEventListener(){},appendChild(){},removeChild(){},insertBefore(){},
    setAttribute(){},getAttribute(){return null},removeAttribute(){},remove(){},
    focus(){},click(){},scrollIntoView(){},contains(){return false},
    querySelector(){return makeEl()},querySelectorAll(){return []},cloneNode(){return makeEl()},
    getBoundingClientRect(){return {top:0,left:0,width:0,height:0}} };
  return new Proxy(t,{ get(o,p){ if(p==='innerHTML')return o._html; if(p in o)return o[p]; return undefined; },
    set(o,p,v){ if(p==='innerHTML')o._html=v; else o[p]=v; return true; } });
}
const doc=new Proxy({},{get(o,p){
  if(p==='getElementById')return ()=>makeEl();
  if(p==='querySelector')return ()=>makeEl();
  if(p==='querySelectorAll')return ()=>[];
  if(p==='createElement')return ()=>makeEl();
  if(p==='createTextNode')return (t)=>({textContent:t,nodeType:3});
  if(p==='createDocumentFragment')return ()=>makeEl();
  if(p==='addEventListener')return ()=>{};
  if(p==='body')return makeEl();
  if(p==='documentElement')return makeEl();
  return undefined; }});
const sandbox={ window:{}, document:doc, location:{href:'http://localhost/kaoqing/kaoqing.html'},
  localStorage:{getItem:()=>null,setItem:()=>{}},
  fetch:()=>Promise.reject(new Error('no fetch')),
  setTimeout:(fn)=>{try{fn()}catch(e){}}, console, btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  Promise, encodeURIComponent, decodeURIComponent, Math, Date, JSON, RegExp, String, Number,
  Array, Object, Boolean, parseInt, parseFloat, isNaN, Proxy, URL, Blob, Error,
  XLSX:JSZip };
sandbox.window=sandbox; sandbox.window.JSZip=JSZip; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);
// 去掉末尾 init() 自动调用，避免无关报错
let code = mainCode.replace(/init\(\);\s*$/,'');
try{ vm.runInContext(code, sandbox, {filename:'kq_main.js'}); }catch(e){ console.log('[init partial]', e.message); }

(async()=>{
  try{
    const ab=fs.readFileSync('D:/hexo/source/kaoqing/template/请假申请单模板.xlsx');
    const u8=new Uint8Array(ab); const buf=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);
    const model=await sandbox.getTemplateModel(buf);
    console.log('dataStart/end:', model.dataStart, model.dataEnd);
    console.log('pageMargins:', JSON.stringify(model.pageMargins));
    sandbox.PRINT_CAT='lv'; sandbox.PRINT_GROUP='全品管考勤组'; sandbox.PRINT_PER_PAGE=1;
    const rec={'序号':1,'姓名':'张三','签名':'张三','一级部门':'生产部','日期':'2026-09-08 ~ 2026-09-10','起日期':'2026-09-08','至日期':'2026-09-10','星期':'二','开始':'08:30','结束':'17:30','时段':'08:30 ~ 17:30','小时':16.5,'说明':'家中有事','状态':'待提交','类别':'事假','加班类型':''};
    const html=await sandbox.renderTemplateToHtml(buf,[rec],{'打印日期':'2026-09-08','总条数':1},{});
    fs.writeFileSync('D:/hexo/source/kaoqing/_bdump.html', html);
    // 统计四边 border 出现次数
    const cnt=k=>(html.match(new RegExp(k+':','g'))||[]).length;
    console.log('border-left 出现:', cnt('border-left'));
    console.log('border-right 出现:', cnt('border-right'));
    console.log('border-top 出现:', cnt('border-top'));
    console.log('border-bottom 出现:', cnt('border-bottom'));
    // 每个数据段最后一列 td 的 style
    const trs=html.split('<tr'); 
    trs.slice(1).forEach((tr,i)=>{
      const tds=[...tr.matchAll(/<td[^>]*style="([^"]*)"[^>]*>/g)];
      if(!tds.length) return;
      const last=tds[tds.length-1][1];
      console.log('row',i,'末列 style:', last);
    });
    console.log('SAVED _bdump.html');
  }catch(e){ console.log('ERR', e.message, e.stack&&e.stack.split('\n').slice(0,3).join(' | ')); }
})();
