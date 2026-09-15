const DEFAULT_VEH=[['001','2t'],['002','4t'],['003','2t'],['004','4t'],['005','2t'],['006','4t'],['007','2t']];
const DEFAULT_PEOPLE=['田中','鈴木','佐藤','山田','高橋','伊藤','渡辺','小林'];
// 赤系は競合表示専用にするため、通常色には使わない。
const COL=['#2563eb','#0891b2','#0f766e','#15803d','#65a30d','#ca8a04','#d97706','#ea580c','#c026d3','#9333ea','#7c3aed','#4f46e5','#4338ca','#1d4ed8','#0369a1','#0e7490','#166534','#365314','#4d7c0f','#854d0e','#a16207','#57534e','#475569','#334155','#0f3d56','#14532d','#6b21a8','#1e3a8a','#164e63','#312e81'];
const GAS_URL='https://script.google.com/macros/s/AKfycbywG4OiBm2s5onSo1jAkF4uDpChps_do99lPsSDuD-RNN_ABU9cvaooG__WSGHjsHvs/exec';
const CLIENT_ID=localStorage.getItem('vehicleClientId')||((crypto.randomUUID&&crypto.randomUUID())||('client_'+Date.now()+'_'+Math.random().toString(36).slice(2)));
localStorage.setItem('vehicleClientId',CLIENT_ID);

let peopleList=JSON.parse(localStorage.getItem('vehiclePeopleList')||'null');
if(!Array.isArray(peopleList)||!peopleList.length) peopleList=DEFAULT_PEOPLE.slice();
let vehicleList=JSON.parse(localStorage.getItem('vehicleList')||'null');
if(!Array.isArray(vehicleList)||!vehicleList.length) vehicleList=DEFAULT_VEH.map(v=>({id:v[0],detail:v[1],memo:''}));
vehicleList=vehicleList.filter(v=>v&&String(v.id||'').trim()).map(v=>({id:String(v.id),detail:String(v.detail||'2t'),memo:String(v.memo||'')}));

const VEH=[];
const PEOPLE=[];
function syncMaster(){
  PEOPLE.splice(0,PEOPLE.length,...peopleList);
  VEH.splice(0,VEH.length,...vehicleList.map(v=>[v.id,v.detail]));
}
syncMaster();

let events=(JSON.parse(localStorage.getItem('vehicleScheduleExact')||'null')||[]).map(normalizeEvent);
let cur=new Date();cur.setHours(0,0,0,0);
let view='month',eid=null,weekMode=localStorage.getItem('vehicleWeekMode')||'people';
let dirtyEvents=new Map();
let pendingDeletes=new Map();
let assignmentTouched={desktop:false,mobile:false};
let editAssignmentSnapshot=null;
let masterDirty=false;
let cloudSaving=false,cloudLoading=false,cloudTimer=null;
let cloudMasterUpdatedAt=Number(localStorage.getItem('vehicleCloudMasterUpdatedAt')||0);
let colorCache=new Map();
let colorPreparedFor='';
let deferredInstallPrompt=null;

function normalizeEvent(e){
  const x=Object.assign({},e||{});
  x.id=x.id||Date.now()+'_'+Math.random().toString(36).slice(2);
  if(!Array.isArray(x.vehicles)) x.vehicles=x.vehicle?[x.vehicle]:[];
  if(!Array.isArray(x.people)) x.people=x.person?[x.person]:[];
  x.vehicles=x.vehicles.map(String); x.people=x.people.map(String);
  if(!x.kind&&x.status) x.kind=x.status==='確定'?'confirmed':'plan';
  if(x.kind==='work') x.kind='confirmed';
  if(!x.kind) x.kind='plan';
  if(!x.start)x.start='08:00'; if(!x.end)x.end='16:00';
  if(!x.date)x.date=K(cur); if(!x.endDate)x.endDate=x.date;
  x.updatedAt=Number(x.updatedAt||0);
  x.updatedBy=String(x.updatedBy||'');
  return x;
}
function K(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function E(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function setCloudStatus(t){const el=document.getElementById('cloudStatus');if(el)el.textContent=t;}
function hash(s){let h=2166136261;for(let i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
function colorDist(a,b){const x=rgb(a),y=rgb(b);return Math.sqrt((x[0]-y[0])**2+(x[1]-y[1])**2+(x[2]-y[2])**2);}
function siteColorKey(site){return String(site||'未設定').trim().replace(/\s+/g,' ')||'未設定';}
function prepareColors(startDate,endDate){
  const key=events.map(e=>`${e.id}:${siteColorKey(e.site)}:${e.kind}:${e.date}:${e.endDate}`).join(';');
  if(colorPreparedFor===key)return;
  colorCache.clear();
  const sites=[...new Set(events.filter(e=>['confirmed','work'].includes(e.kind)&&siteColorKey(e.site)!=='未設定').map(e=>siteColorKey(e.site)))];
  const assigned=new Map();
  const used=[];
  sites.sort((a,b)=>hash(a)-hash(b));
  sites.forEach(site=>{
    let best=null,bestScore=-1e9;
    COL.forEach(c=>{
      if(used.includes(c))return;
      const score=used.length?Math.min(...used.map(u=>colorDist(c,u))):999;
      if(score>bestScore){bestScore=score;best=c;}
    });
    if(!best)best=COL[hash(site)%COL.length];
    assigned.set(site,best);used.push(best);
  });
  assigned.forEach((color,site)=>colorCache.set('site|'+site,color));
  colorPreparedFor=key;
}
function C(site,date){
  const name=siteColorKey(site);
  if(!colorCache.has('site|'+name))prepareColors(cur,cur);
  return colorCache.get('site|'+name)||COL[hash(name)%COL.length];
}
function R(e){let a=DT(e.date,e.start),b=DT(e.endDate||e.date,e.end);if(b<=a)b=new Date(a.getTime()+3600000);return[a,b];}
function TM(t){const m=String(t||'00:00').match(/^(\d+):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):0;}
function DT(ds,tm){const d=new Date(ds+'T00:00');d.setMinutes(TM(tm));return d;}
function O(a,b){const[x,y]=R(a),[u,v]=R(b);return x<v&&u<y;}
function CF(e){return ['plan','confirmed','work'].includes(e.kind)&&events.some(x=>x!==e&&['plan','confirmed','work'].includes(x.kind)&&O(e,x)&&(((e.vehicles||[]).some(v=>(x.vehicles||[]).includes(v)))||((e.people||[]).some(p=>(x.people||[]).includes(p)))));}
function ON(e,d){const day=new Date(K(d)+'T00:00'),next=new Date(day);next.setDate(next.getDate()+1);const[a,b]=R(e);return a<next&&b>day;}
function SEG(e,d){const day=new Date(K(d)+'T00:00'),next=new Date(day);next.setDate(next.getDate()+1);const[a,b]=R(e),s=a<day?day:a,t=b>next?next:b;return t>s?[s,t]:null;}
function nightOnDay(e,d){const day=K(d);return e.date!==day||String(e.endDate||e.date)!==String(e.date)||R(e)[1].getTime()>new Date(day+'T23:59:59').getTime();}
function BG(e,d){if(e.kind==='plan')return '#9ca3af';if(e.kind==='off')return '#f7d8e6';if(CF(e))return '#dc2626';return C(e.site||'未設定',d);}
function WTXT(e,d){return e.kind==='off'?'休み':(nightOnDay(e,d)?'🌙 ':'')+(e.kind==='plan'?'予定 ':'')+(e.site||'未設定')+' '+e.start+'-'+e.end;}
function BAR(e,d){const night=nightOnDay(e,d),bg=BG(e,d);return `<button class="bar ${e.kind==='off'?'off ':e.kind==='plan'?'plan ':''}${CF(e)?'conf ':''}${night?'overnight':''}" style="background:${bg}" onclick="editEvent('${E(e.id)}','${K(d)}');event.stopPropagation()">${E(WTXT(e,d))}</button>`;}
function MONTH(){
  const y=cur.getFullYear(),m=cur.getMonth(),s=new Date(y,m,1);s.setDate(1-((s.getDay()+6)%7));const end=new Date(s);end.setDate(end.getDate()+41);prepareColors(s,end);
  let h='<div class="month">';['月','火','水','木','金','土','日'].forEach(x=>h+=`<div class="dow">${x}</div>`);
  for(let i=0;i<42;i++){const d=new Date(s);d.setDate(s.getDate()+i);const cn='day '+(d.getMonth()!=m?'out ':'')+(K(d)===K(cur)?'selected':'');const dn=d.getDay()===0?'sun':d.getDay()===6?'sat':'';h+=`<div class="${cn}" onclick="selectDay('${K(d)}')"><div class="date ${dn}">${d.getDate()}</div>${events.filter(e=>ON(e,d)).slice(0,6).map(e=>BAR(e,d)).join('')}</div>`;}return h+'</div>';
}
function WEEK(){
  const s=new Date(cur);s.setDate(s.getDate()-((s.getDay()+6)%7));const end=new Date(s);end.setDate(end.getDate()+6);prepareColors(s,end);
  let h='<div class="week"><div class="wh week-switch"><span>週予定</span><div class="week-mode"><button class="wm '+(weekMode==='people'?'on':'')+'" onclick="setWeekMode(\'people\',event)">人員別</button><button class="wm '+(weekMode==='vehicle'?'on':'')+'" onclick="setWeekMode(\'vehicle\',event)">車両別</button></div></div>';
  for(let i=0;i<7;i++){const d=new Date(s);d.setDate(s.getDate()+i);h+='<div class="wh week-date '+(K(d)===K(cur)?'selected':'')+'" onclick="selectDay(\''+K(d)+'\')">'+(d.getMonth()+1)+'/'+d.getDate()+'（'+'日月火水木金土'[d.getDay()]+'）</div>'; }
  const rows=weekMode==='vehicle'?VEH.map(v=>({label:v[0]+'（'+v[1]+'）',id:v[0],field:'vehicles'})):PEOPLE.map(p=>({label:p,id:p,field:'people'}));
  rows.forEach(r=>{
    h+='<div class="person">'+E(r.label)+'</div>';
    for(let i=0;i<7;i++){
      const d=new Date(s);d.setDate(s.getDate()+i);const es=events.filter(e=>ON(e,d)&&(e[r.field]||[]).includes(r.id));
      let cell='';
      es.forEach(e=>{cell+='<button class="wbar '+(e.kind==='off'?'off':e.kind==='plan'?'plan':'')+' '+(CF(e)?'conf ':'')+' '+(nightOnDay(e,d)?'overnight':'')+'" style="background:'+BG(e,d)+'" onclick="editEvent(\''+E(e.id)+'\',\''+K(d)+'\');event.stopPropagation()">'+E(WTXT(e,d))+'</button>';});
      h+='<div>'+(cell||'－')+'</div>';
    }
  });
  // 割当なし予定も専用行で表示し、スマホでも未割当を見落とさない。
  const field=weekMode==='vehicle'?'vehicles':'people';
  h+='<div class="person">未割当</div>';
  for(let i=0;i<7;i++){const d=new Date(s);d.setDate(s.getDate()+i);const es=events.filter(e=>ON(e,d)&&!(e[field]||[]).length);let cell='';es.forEach(e=>{cell+='<button class="wbar '+(e.kind==='off'?'off':e.kind==='plan'?'plan':'')+' '+(CF(e)?'conf ':'')+' '+(nightOnDay(e,d)?'overnight':'')+'" style="background:'+BG(e,d)+'" onclick="editEvent(\''+E(e.id)+'\',\''+K(d)+'\');event.stopPropagation()">'+E(WTXT(e,d))+'</button>';});h+='<div>'+(cell||'－')+'</div>';}
  return h+'</div>';
}
function DH(dt,day){let h=dt.getHours()+dt.getMinutes()/60;if(K(dt)!==K(day)||h<6)h+=24;return h;}
function DAY(){
  const start=new Date(cur);start.setDate(start.getDate()-1);const end=new Date(cur);end.setDate(end.getDate()+1);prepareColors(start,end);
  let h='<div class="timeline"><div class="times"><div>車両 / 人員</div>'+[6,8,10,12,14,16,18,20,22,24,2,4,6].map(x=>`<div>${x}:00</div>`).join('')+'</div>';
  events.filter(e=>ON(e,cur)).forEach(e=>{const seg=SEG(e,cur);if(!seg)return;let[a,b]=seg,sh=DH(a,cur),eh=DH(b,cur),l=Math.max(0,(sh-6)/24)*100,r=Math.min(100,(eh-6)/24*100);if(r<=0||l>=100)return;const w=Math.max(1,r-l),night=nightOnDay(e,cur);h+=`<div class="trow"><div class="who">${E((e.vehicles||[]).join(', '))}<br>${E((e.people||[]).join(', '))}</div><div class="track"><button class="tbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':''} ${CF(e)?'conflict':''} ${night?'overnight':''}" style="left:${l}%;width:${w}%;background:${BG(e,cur)}" onclick="editEvent('${E(e.id)}','${K(cur)}')">${E(e.kind==='off'?'休み':(night?'🌙 ':'')+(e.kind==='plan'?'予定 ':'')+(e.site||'未設定')+' '+e.start+'～'+e.end)}</button></div></div>`;});
  return h+'</div>';
}
function render(){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===view));document.getElementById('title').textContent=`${cur.getFullYear()}年${cur.getMonth()+1}月`;document.getElementById('sub').textContent=view==='month'?'週予定':view==='week'?'日予定':'月予定';document.getElementById('main').innerHTML=view==='month'?MONTH():view==='week'?WEEK():DAY();document.getElementById('secondary').innerHTML=view==='month'?WEEK():view==='week'?DAY():MONTH();status();}
function status(){
  const bv=new Set(),bp=new Set();events.filter(e=>['plan','confirmed','work'].includes(e.kind)&&ON(e,cur)).forEach(e=>{(e.vehicles||[]).forEach(v=>bv.add(v));(e.people||[]).forEach(p=>bp.add(p));});
  document.getElementById('stitle').textContent='空き状況（'+K(cur)+'）';
  document.getElementById('status').innerHTML=VEH.map(v=>`<div>${E(v[0])}（${E(v[1])}） <span class="${bv.has(v[0])?'busy':'free'}">${bv.has(v[0])?'● 稼働':'○ 空き'}</span></div>`).join('')+PEOPLE.map(p=>`<div>${E(p)} <span class="${bp.has(p)?'busy':'free'}">${bp.has(p)?'● 稼働':'○ 空き'}</span></div>`).join('');
}
function rebuildChecks(){
  const currentDesktopV=assignmentTouched.desktop?[...document.querySelectorAll('.v:checked')].map(x=>x.value):null;
  const currentDesktopP=assignmentTouched.desktop?[...document.querySelectorAll('.p:checked')].map(x=>x.value):null;
  const currentMobileV=assignmentTouched.mobile?[...document.querySelectorAll('.mv:checked')].map(x=>x.value):null;
  const currentMobileP=assignmentTouched.mobile?[...document.querySelectorAll('.mp:checked')].map(x=>x.value):null;
  document.getElementById('vs').innerHTML=VEH.map(v=>`<label class="check"><input class="v" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');
  document.getElementById('ps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="p" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');
  document.getElementById('mvs').innerHTML=VEH.map(v=>`<label class="check"><input class="mv" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');
  document.getElementById('mps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="mp" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');
  const old=eid?events.find(x=>String(x.id)===String(eid)):null;
  const dv=currentDesktopV??(old?(old.vehicles||[]):[]),dp=currentDesktopP??(old?(old.people||[]):[]);
  const mv=currentMobileV??(old?(old.vehicles||[]):[]),mp=currentMobileP??(old?(old.people||[]):[]);
  document.querySelectorAll('.v').forEach(x=>x.checked=dv.includes(x.value));
  document.querySelectorAll('.p').forEach(x=>x.checked=dp.includes(x.value));
  document.querySelectorAll('.mv').forEach(x=>x.checked=mv.includes(x.value));
  document.querySelectorAll('.mp').forEach(x=>x.checked=mp.includes(x.value));
}
function setFormValues(prefix,e){document.getElementById(prefix+'kind').value=e.kind||'plan';document.getElementById(prefix+'site').value=e.site||'';document.getElementById(prefix+'work').value=e.work||'';document.getElementById(prefix+'sd').value=e.date||K(cur);document.getElementById(prefix+'ed').value=e.endDate||e.date||K(cur);document.getElementById(prefix+'st').value=e.start||'08:00';document.getElementById(prefix+'et').value=e.end||'16:00';document.querySelectorAll('.'+(prefix==='m'?'mv':'v')).forEach(x=>x.checked=(e.vehicles||[]).includes(x.value));document.querySelectorAll('.'+(prefix==='m'?'mp':'p')).forEach(x=>x.checked=(e.people||[]).includes(x.value));;const ot=document.getElementById(prefix+'overnight');if(ot)ot.checked=(e.endDate||e.date)!==e.date;}
function getFormValues(prefix){return {kind:document.getElementById(prefix+'kind').value,site:document.getElementById(prefix+'site').value,work:document.getElementById(prefix+'work').value,date:document.getElementById(prefix+'sd').value,endDate:document.getElementById(prefix+'ed').value,start:document.getElementById(prefix+'st').value,end:document.getElementById(prefix+'et').value,vehicles:[...document.querySelectorAll('.'+(prefix==='m'?'mv':'v')+':checked')].map(x=>x.value),people:[...document.querySelectorAll('.'+(prefix==='m'?'mp':'p')+':checked')].map(x=>x.value)};}
function addDays(ds,n){const d=new Date(ds+'T00:00');d.setDate(d.getDate()+n);return K(d);}
function toggleOvernight(prefix){const ot=document.getElementById(prefix+'overnight');const sd=document.getElementById(prefix+'sd');const ed=document.getElementById(prefix+'ed');if(!ot||!sd||!ed)return;if(ot.checked){if(!ed.value||ed.value===sd.value)ed.value=addDays(sd.value,1);}else ed.value=sd.value;}

function openEventModal(){document.getElementById('eventModal').classList.add('open');document.body.style.overflow='hidden';}
function closeEventModal(){document.getElementById('eventModal').classList.remove('open');document.body.style.overflow='';}
function newEvent(){eid=null;assignmentTouched={desktop:false,mobile:false};editAssignmentSnapshot=null;const blank={kind:'plan',site:'',work:'',date:K(cur),endDate:K(cur),start:'08:00',end:'16:00',vehicles:[],people:[]};setFormValues('m',blank);setFormValues('',blank);document.getElementById('ftitle').textContent='予定の追加';document.getElementById('mftitle').textContent='予定の追加';openEventModal();}
function editEvent(id,d){assignmentTouched={desktop:false,mobile:false};const e=events.find(x=>String(x.id)===String(id));if(!e)return;cur=new Date(d+'T00:00');eid=e.id;editAssignmentSnapshot={vehicles:(e.vehicles||[]).map(String),people:(e.people||[]).map(String)};setFormValues('m',e);setFormValues('',e);document.getElementById('ftitle').textContent='予定の編集';document.getElementById('mftitle').textContent='予定の編集';render();openEventModal();}
function selectDay(d){cur=new Date(d+'T00:00');render();}
function selectWeekDate(d,ev){if(ev)ev.stopPropagation();cur=new Date(d+'T00:00');render();}
function markDirtyEvent(e,baseUpdatedAt,preserveAssignments=false){e.updatedAt=Number(e.updatedAt||baseUpdatedAt||0);const prev=dirtyEvents.get(String(e.id));dirtyEvents.set(String(e.id),{event:JSON.parse(JSON.stringify(e)),baseUpdatedAt:Number(baseUpdatedAt||0),preserveAssignments:!!preserveAssignments||!!(prev&&prev.preserveAssignments)});pendingDeletes.delete(String(e.id));}
function sameAssignment(a,b){return JSON.stringify((a||[]).map(String).sort())===JSON.stringify((b||[]).map(String).sort());}
function saveEvent(fromModal=false){
  const prefix=fromModal?'m':'';const form=getFormValues(prefix);if(!form.date)return alert('開始日を入力してください');
  const ot=document.getElementById(prefix+'overnight');if(ot)form.endDate=ot.checked?(form.endDate&&form.endDate!==form.date?form.endDate:addDays(form.date,1)):form.date;
  const old=eid?events.find(x=>String(x.id)===String(eid)):null;
  let preserveAssignments=false;
  if(old){
    const snap=editAssignmentSnapshot||{vehicles:old.vehicles||[],people:old.people||[]};
    // 区分・現場・日時だけを編集した場合は、車両・人員を絶対に変更しない。
    // 実際にチェックを変更した時だけ、その変更内容（全解除も含む）を保存する。
    const currentV=form.vehicles||[],currentP=form.people||[];
    preserveAssignments=sameAssignment(currentV,snap.vehicles)&&sameAssignment(currentP,snap.people);
    if(preserveAssignments){form.vehicles=(old.vehicles||[]).map(String);form.people=(old.people||[]).map(String);}
  }
  const e=normalizeEvent(Object.assign({},old||{},form,{id:old?old.id:(Date.now()+'_'+Math.random().toString(36).slice(2))}));
  if(e.kind==='off'){e.site='';e.work='';}
  if(old)markDirtyEvent(e,old.updatedAt,preserveAssignments);else markDirtyEvent(e,0,false);
  if(old)events=events.map(x=>String(x.id)===String(old.id)?e:x);else events.push(e);
  colorPreparedFor='';persistLocal();render();eid=null;editAssignmentSnapshot=null;if(fromModal)closeEventModal();
  setFormValues('',{kind:'plan',site:'',work:'',date:K(cur),endDate:K(cur),start:'08:00',end:'16:00',vehicles:[],people:[]});queueCloudSave();
}
function delEvent(fromModal=false){if(!eid)return;if(!confirm('この予定を削除しますか？'))return;const old=events.find(x=>String(x.id)===String(eid));if(old){pendingDeletes.set(String(old.id),{id:String(old.id),baseUpdatedAt:Number(old.updatedAt||0)});dirtyEvents.delete(String(old.id));events=events.filter(x=>String(x.id)!==String(eid));persistLocal();queueCloudSave();}eid=null;if(fromModal)closeEventModal();render();}
function shift(n){if(view==='month')cur.setMonth(cur.getMonth()+n);else if(view==='week')cur.setDate(cur.getDate()+7*n);else cur.setDate(cur.getDate()+n);render();}
function setWeekMode(mode,ev){if(ev)ev.stopPropagation();weekMode=mode;localStorage.setItem('vehicleWeekMode',mode);render();}

function persistLocal(){localStorage.setItem('vehiclePeopleList',JSON.stringify(peopleList));localStorage.setItem('vehicleList',JSON.stringify(vehicleList));localStorage.setItem('vehicleScheduleExact',JSON.stringify(events));localStorage.setItem('vehicleDirtyEvents',JSON.stringify([...dirtyEvents.values()]));localStorage.setItem('vehiclePendingDeletes',JSON.stringify([...pendingDeletes.values()]));localStorage.setItem('vehicleMasterDirty',masterDirty?'1':'0');localStorage.setItem('vehicleCloudMasterUpdatedAt',String(cloudMasterUpdatedAt||0));}
function restoreDirty(){
  try{const a=JSON.parse(localStorage.getItem('vehicleDirtyEvents')||'[]');dirtyEvents=new Map(a.map(x=>[String(x.event.id),x]));}catch(e){dirtyEvents=new Map();}
  try{const a=JSON.parse(localStorage.getItem('vehiclePendingDeletes')||'[]');pendingDeletes=new Map(a.map(x=>[String(x.id),x]));}catch(e){pendingDeletes=new Map();}
  masterDirty=localStorage.getItem('vehicleMasterDirty')==='1';
}
restoreDirty();
document.addEventListener('change',e=>{if(e.target.classList.contains('v')||e.target.classList.contains('p'))assignmentTouched.desktop=true;if(e.target.classList.contains('mv')||e.target.classList.contains('mp'))assignmentTouched.mobile=true;});

let jsonpSeq=0;
function jsonpGet(timeout=15000){return new Promise((resolve,reject)=>{const cb='__vehicleScheduleJsonp_'+Date.now()+'_'+(++jsonpSeq),script=document.createElement('script');let done=false;const timer=setTimeout(()=>finish(new Error('GAS読み込みタイムアウト')),timeout);function finish(err,data){if(done)return;done=true;clearTimeout(timer);if(script.parentNode)script.parentNode.removeChild(script);try{delete window[cb]}catch(e){window[cb]=undefined}err?reject(err):resolve(data);}window[cb]=data=>finish(null,data);script.onerror=()=>finish(new Error('GAS読み込みエラー'));script.src=GAS_URL+'?api=1&nocache=1&prefix='+encodeURIComponent(cb)+'&_='+Date.now();document.head.appendChild(script);});}
function postForm(payload,timeout=20000){return new Promise((resolve,reject)=>{const frame=document.createElement('iframe');frame.name='vehicleSaveFrame_'+Date.now()+'_'+Math.random().toString(36).slice(2);frame.style.display='none';const form=document.createElement('form');form.method='POST';form.action=GAS_URL;form.target=frame.name;form.style.display='none';const input=document.createElement('textarea');input.name='payload';input.value=JSON.stringify(payload);form.appendChild(input);document.body.appendChild(frame);document.body.appendChild(form);let done=false;const timer=setTimeout(()=>finish(false,new Error('GAS保存タイムアウト')),timeout);function finish(ok,err){if(done)return;done=true;clearTimeout(timer);setTimeout(()=>{frame.remove();form.remove();},100);ok?resolve():reject(err);}frame.addEventListener('load',()=>finish(true),{once:true});try{form.submit();}catch(err){finish(false,err);}});}
function queueCloudSave(){if(!GAS_URL)return;if(cloudTimer)clearTimeout(cloudTimer);cloudTimer=setTimeout(postCloud,150);}
function buildPatch(){const changes=[...dirtyEvents.values()].map(x=>Object.assign({},x.event,{baseUpdatedAt:Number(x.baseUpdatedAt||0)}));const deletes=[...pendingDeletes.values()];return {action:'patch',clientId:CLIENT_ID,changes,deletes,vehicles:masterDirty?vehicleList:null,people:masterDirty?peopleList:null,masterChanged:masterDirty,baseMasterUpdatedAt:cloudMasterUpdatedAt};}
async function postCloud(){
  if(cloudSaving||(!dirtyEvents.size&&!pendingDeletes.size&&!masterDirty))return;
  cloudSaving=true;setCloudStatus('共有保存中…');
  const patch=buildPatch();
  const sentIds=new Map([...dirtyEvents].map(([id,x])=>[id,{baseUpdatedAt:Number(x.baseUpdatedAt||0),event:x.event,preserveAssignments:!!x.preserveAssignments}]));
  const sentDeletes=new Map([...pendingDeletes]);
  const sentMaster=masterDirty, sentMasterBase=cloudMasterUpdatedAt;
  let retry=false;
  try{
    await postForm(patch,20000);
    const server=await jsonpGet(10000,true);
    if(!server||!server.hasData)throw new Error('保存確認データを取得できませんでした');
    const remoteEvents=(server.events||[]).map(normalizeEvent), remoteById=new Map(remoteEvents.map(e=>[String(e.id),e]));
    const isPatchBackend=Object.prototype.hasOwnProperty.call(server,'masterUpdatedAt')&&Object.prototype.hasOwnProperty.call(server,'deleted');
    const accepted=[];
    sentIds.forEach((meta,id)=>{
      const r=remoteById.get(id);
      if(r&&String(r.updatedBy||'')===CLIENT_ID&&Number(r.updatedAt||0)>meta.baseUpdatedAt){
        const acceptedEvent=Object.assign({},r);
        // ステータス変更だけで保存した予定は、サーバー応答でも元の割当を優先して保持。
        if(meta.preserveAssignments){acceptedEvent.vehicles=(meta.event.vehicles||[]).map(String);acceptedEvent.people=(meta.event.people||[]).map(String);}
        events=events.map(e=>String(e.id)===id?normalizeEvent(acceptedEvent):e);dirtyEvents.delete(id);accepted.push(id);
      }
    });
    const remoteDeleted=server.deleted||{};
    sentDeletes.forEach((meta,id)=>{const tomb=remoteDeleted[id];if(!remoteById.has(id)&&tomb&&Number(tomb.updatedAt||0)>Number(meta.baseUpdatedAt||0)&&String(tomb.deletedBy||'')===CLIENT_ID){pendingDeletes.delete(id);}});

    // 旧v47 GASがまだ公開先に残っている場合は、旧save形式へ一度だけフォールバックする。
    // 新patch backendで競合した場合は勝手に上書きせず、競合として止める。
    if(!isPatchBackend && (sentIds.size||sentDeletes.size||sentMaster)){
      const legacy={action:'save',events:events,vehicles:vehicleList,people:peopleList,logs:[],lastUpdated:Date.now(),deletedIds:[...pendingDeletes.keys()],saveToken:CLIENT_ID+'_'+Date.now()};
      await postForm(legacy,20000);
      const latest=await jsonpGet(10000,true);
      if(!latest||!latest.hasData)throw new Error('旧GASへの保存確認に失敗しました');
      events=(latest.events||[]).map(normalizeEvent);
      if(Array.isArray(latest.people)&&latest.people.length)peopleList=latest.people.map(String);
      if(Array.isArray(latest.vehicles)&&latest.vehicles.length)vehicleList=latest.vehicles.map(v=>({id:String(v.id||''),detail:String(v.detail||'2t'),memo:String(v.memo||'')})).filter(v=>v.id);
      syncMaster();
      dirtyEvents.clear();pendingDeletes.clear();masterDirty=false;
      cloudMasterUpdatedAt=Number(latest.masterUpdatedAt||cloudMasterUpdatedAt||0);
      persistLocal();colorPreparedFor='';render();setCloudStatus('共有保存・同期済み');return;
    }

    if(sentMaster&&Number(server.masterUpdatedAt||0)>Number(sentMasterBase||0)&&Number(server.masterUpdatedAt||0)>0){cloudMasterUpdatedAt=Number(server.masterUpdatedAt);masterDirty=false;}
    mergeRemote(server,true);
    accepted.forEach(id=>{const r=remoteById.get(id);if(r)events=events.map(e=>String(e.id)===id?r:e);});
    sentDeletes.forEach((meta,id)=>{if(!pendingDeletes.has(id))events=events.filter(e=>String(e.id)!==id);});
    cloudMasterUpdatedAt=Number(server.masterUpdatedAt||cloudMasterUpdatedAt);
    persistLocal();
    const conflictCount=Array.from(sentIds.keys()).filter(id=>dirtyEvents.has(id)).length+Array.from(sentDeletes.keys()).filter(id=>pendingDeletes.has(id)).length+(sentMaster&&masterDirty?1:0);
    if(conflictCount){setCloudStatus('共有競合あり：最新データを確認してください');}
    else {setCloudStatus('共有保存・同期済み');}
  }catch(err){console.warn('共有保存失敗',err);setCloudStatus('共有保存失敗：再試行待ち');retry=true;}
  finally{cloudSaving=false;if(retry&& (dirtyEvents.size||pendingDeletes.size||masterDirty)){if(cloudTimer)clearTimeout(cloudTimer);cloudTimer=setTimeout(postCloud,5000);}}
}
function mergeRemote(d,fromSave=false){
  const remote=Array.isArray(d.events)?d.events.map(normalizeEvent):[];const localById=new Map(events.map(e=>[String(e.id),e]));const remoteById=new Map(remote.map(e=>[String(e.id),e]));
  const merged=[];
  remoteById.forEach((r,id)=>{if(pendingDeletes.has(id))return;const dirty=dirtyEvents.get(id);const l=localById.get(id);if(dirty){merged.push(l||dirty.event);return;}if(!l||Number(r.updatedAt||0)>=Number(l.updatedAt||0))merged.push(r);else merged.push(l);});
  localById.forEach((l,id)=>{if(!remoteById.has(id)&&!pendingDeletes.has(id)){merged.push(l);}});
  events=merged; cloudMasterUpdatedAt=Number(d.masterUpdatedAt||cloudMasterUpdatedAt||0); if(Array.isArray(d.people)&&d.people.length&&!masterDirty)peopleList=d.people.map(String); if(Array.isArray(d.vehicles)&&d.vehicles.length&&!masterDirty)vehicleList=d.vehicles.map(v=>({id:String(v.id||''),detail:String(v.detail||'2t'),memo:String(v.memo||'')})).filter(v=>v.id); syncMaster();rebuildChecks();colorPreparedFor='';if(!fromSave)persistLocal();
}
async function loadCloud(){if(cloudLoading||cloudSaving)return;cloudLoading=true;setCloudStatus('共有読込中…');try{const d=await jsonpGet(15000);if(d&&d.hasData){mergeRemote(d);render();setCloudStatus(dirtyEvents.size||pendingDeletes.size||masterDirty?'共有同期済み・未保存あり':'共有同期済み');if(dirtyEvents.size||pendingDeletes.size||masterDirty)queueCloudSave();}else if(d){setCloudStatus('共有データなし');if(events.length||vehicleList.length||peopleList.length)queueCloudSave();}else setCloudStatus('共有接続エラー');}catch(err){console.warn(err);setCloudStatus('共有接続エラー')}finally{cloudLoading=false;}}
function persist(){masterDirty=true;persistLocal();queueCloudSave();}
function forceCloudReload(){loadCloud();}

function openCloudDiag(){document.getElementById('cloudDiag').classList.add('open');runCloudDiag();}
function closeCloudDiag(){document.getElementById('cloudDiag').classList.remove('open');}
async function runCloudDiag(){const out=document.getElementById('cloudDiagText');out.textContent='GASから最新データを確認しています…';const started=Date.now();try{const d=await jsonpGet(15000);if(!d){out.textContent='【接続失敗】';return;}out.textContent='【GAS接続：OK】\n取得時間: '+(Date.now()-started)+'ms\nrevision: '+(d.revision||0)+'\n最終更新: '+(d.lastUpdated?new Date(Number(d.lastUpdated)).toLocaleString():'なし')+'\n予定件数(GAS): '+(d.events||[]).length+'\n予定件数(端末): '+events.length+'\n車両数: '+(d.vehicles||[]).length+'\n人員数: '+(d.people||[]).length+'\n未保存予定: '+dirtyEvents.size+'\n未保存削除: '+pendingDeletes.size;}catch(err){out.textContent='【接続失敗】\n'+String(err&&err.message||err)+'\n\nGAS Webアプリは「自分として実行」＋「全員」で公開してください。';}}

function openSettings(){document.getElementById('settings').classList.add('open');manageTab('people');}
function closeSettings(){document.getElementById('settings').classList.remove('open');rebuildChecks();render();}
function manageTab(m){document.getElementById('tabPeople').classList.toggle('on',m==='people');document.getElementById('tabVehicles').classList.toggle('on',m==='vehicles');let h='';if(m==='people'){h='<h3>人員の増減・名前変更</h3>';peopleList.forEach((n,i)=>h+=`<div class="manage-row people"><input id="pn${i}" value="${E(n)}"><button onclick="renamePerson(${i})">変更</button><button onclick="removePerson(${i})">削除</button></div>`);h+='<div class="manage-add"><input id="newPerson" placeholder="新しい人員名"><button onclick="addPerson()">＋ 人員追加</button></div>';}else{h='<h3>車両の増減・詳細変更</h3>';vehicleList.forEach((v,i)=>h+=`<div class="manage-row"><input id="vn${i}" value="${E(v.id)}"><input id="vd${i}" value="${E(v.detail)}"><input id="vm${i}" value="${E(v.memo)}" placeholder="詳細・メモ"><button onclick="updateVehicle(${i})">変更</button><button onclick="removeVehicle(${i})">削除</button></div>`);h+='<div class="manage-add"><input id="newVehicleId" placeholder="車両番号 008"><input id="newVehicleDetail" placeholder="2t"><input id="newVehicleMemo" placeholder="詳細・メモ"><button onclick="addVehicle()">＋ 車両追加</button></div>';}document.getElementById('manageBody').innerHTML=h;}
function addPerson(){const n=document.getElementById('newPerson').value.trim();if(!n)return alert('人員名を入力してください');if(peopleList.includes(n))return alert('同じ名前があります');peopleList.push(n);syncMaster();masterDirty=true;persistLocal();rebuildChecks();manageTab('people');render();queueCloudSave();}
function renamePerson(i){const old=peopleList[i],n=document.getElementById('pn'+i).value.trim();if(!n)return alert('名前を入力してください');if(n!==old&&peopleList.includes(n))return alert('同じ名前があります');events.forEach(e=>{if((e.people||[]).includes(old)){const copy=Object.assign({},e,{people:(e.people||[]).map(x=>x===old?n:x)});events=events.map(x=>String(x.id)===String(e.id)?copy:x);markDirtyEvent(copy,e.updatedAt);}});peopleList[i]=n;syncMaster();masterDirty=true;persistLocal();manageTab('people');rebuildChecks();render();queueCloudSave();}
function removePerson(i){const n=peopleList[i];if(!confirm(n+' を削除しますか？'))return;events.forEach(e=>{if((e.people||[]).includes(n)){const copy=Object.assign({},e,{people:(e.people||[]).filter(x=>x!==n)});events=events.map(x=>String(x.id)===String(e.id)?copy:x);markDirtyEvent(copy,e.updatedAt);}});peopleList.splice(i,1);syncMaster();masterDirty=true;persistLocal();manageTab('people');rebuildChecks();render();queueCloudSave();}
function addVehicle(){const id=document.getElementById('newVehicleId').value.trim(),detail=document.getElementById('newVehicleDetail').value.trim()||'2t',memo=document.getElementById('newVehicleMemo').value.trim();if(!id)return alert('車両番号を入力してください');if(vehicleList.some(v=>v.id===id))return alert('同じ車両番号があります');vehicleList.push({id,detail,memo});syncMaster();masterDirty=true;persistLocal();manageTab('vehicles');rebuildChecks();render();queueCloudSave();}
function updateVehicle(i){const old=vehicleList[i].id,id=document.getElementById('vn'+i).value.trim(),detail=document.getElementById('vd'+i).value.trim()||'2t',memo=document.getElementById('vm'+i).value.trim();if(!id)return alert('車両番号を入力してください');if(id!==old&&vehicleList.some(v=>v.id===id))return alert('同じ車両番号があります');events.forEach(e=>{if((e.vehicles||[]).includes(old)){const copy=Object.assign({},e,{vehicles:(e.vehicles||[]).map(x=>x===old?id:x)});events=events.map(x=>String(x.id)===String(e.id)?copy:x);markDirtyEvent(copy,e.updatedAt);}});vehicleList[i]={id,detail,memo};syncMaster();masterDirty=true;persistLocal();manageTab('vehicles');rebuildChecks();render();queueCloudSave();}
function removeVehicle(i){const v=vehicleList[i];if(!confirm(v.id+' を削除しますか？'))return;events.forEach(e=>{if((e.vehicles||[]).includes(v.id)){const copy=Object.assign({},e,{vehicles:(e.vehicles||[]).filter(x=>x!==v.id)});events=events.map(x=>String(x.id)===String(e.id)?copy:x);markDirtyEvent(copy,e.updatedAt);}});vehicleList.splice(i,1);syncMaster();masterDirty=true;persistLocal();manageTab('vehicles');rebuildChecks();render();queueCloudSave();}

// 起動は全関数・変数の初期化後に一度だけ行う。v47系で問題になった「関数定義前のrender/checks呼び出し」を排除。
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{view=b.dataset.v;render();});
document.getElementById('prev').onclick=()=>shift(-1);document.getElementById('next').onclick=()=>shift(1);document.getElementById('today').onclick=()=>{cur=new Date();cur.setHours(0,0,0,0);render();};document.getElementById('subPrev').onclick=()=>shift(-1);document.getElementById('subNext').onclick=()=>shift(1);
rebuildChecks();render();loadCloud();
setInterval(()=>{if(!cloudSaving&&!cloudLoading)loadCloud();},7000);

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const b=document.getElementById('installBtn');if(b)b.style.display='';});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;const b=document.getElementById('installBtn');if(b)b.style.display='none';});
async function installApp(){if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice;}catch(e){}deferredInstallPrompt=null;const b=document.getElementById('installBtn');if(b)b.style.display='none';return;}alert('iPhone/iPad：共有ボタン →「ホーム画面に追加」\nAndroid：ブラウザの「アプリをインストール」または「ホーム画面に追加」から登録してください。');}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=47fix8').catch(err=>console.warn('PWA登録失敗',err)));

