
const VEH=[['001','2t'],['002','4t'],['003','2t'],['004','4t'],['005','2t'],['006','4t'],['007','2t']],PEOPLE=['田中','鈴木','佐藤','山田','高橋','伊藤','渡辺','小林'],COL=['#15803d','#0f766e','#2563eb','#4f46e5','#7c3aed','#365314','#334155','#166534','#115e59','#1d4ed8','#312e81','#5b21b6','#4d7c0f','#475569','#047857','#134e4a','#0369a1','#4338ca','#6d28d9','#3f6212','#374151','#14532d','#0e7490','#1e3a8a','#3730a3','#581c87','#155e75','#1e40af','#164e63','#0f3d56'];;let events=(JSON.parse(localStorage.getItem('vehicleScheduleExact')||'null')||[]).map(e=>e&&e.kind==='work'?{...e,kind:'confirmed'}:e),cur=new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()),view='month',eid=null,cm={},ci=0;
// v51: filter/drag/notification state is initialized before the first render.
let searchText='',kindFilter='all',dragEventId=null,notifiedKeys=new Set();
function K(d){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}let weekMode=localStorage.getItem('vehicleWeekMode')||'people';function setWeekMode(mode,ev){if(ev)ev.stopPropagation();weekMode=mode;localStorage.setItem('vehicleWeekMode',mode);render()}function E(x){return String(x??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}function CH(s){let key=String(s||'未設定'),h=0;for(let i=0;i<key.length;i++)h=((h*31)+key.charCodeAt(i))>>>0;return h>>>0}
function hexRGB(hex){const h=hex.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
const COLRGB=COL.map(hexRGB);
function colorDist(a,b){const A=COLRGB[a],B=COLRGB[b];const r=A[0]-B[0],g=A[1]-B[1],bl=A[2]-B[2];return Math.sqrt(r*r+g*g+bl*bl)}
function dayColorMap(d){
  const ds=typeof d==='string'?d:K(d);
  const active=[...new Set(events.filter(e=>e.kind==='confirmed'||e.kind==='work').filter(e=>ON(e,new Date(ds+'T00:00'))).map(e=>String(e.site||'未設定')))].sort((a,b)=>CH(ds+'|'+a)-CH(ds+'|'+b));
  const dayNo=Math.floor(new Date(ds+'T00:00').getTime()/86400000);
  const seed=((dayNo*17)%COL.length+COL.length)%COL.length;
  const used=[]; const map={};
  active.forEach((site,idx)=>{
    let best=-1,bestScore=-Infinity;
    for(let i=0;i<COL.length;i++){
      if(used.includes(i))continue;
      const ci=(seed+i*7+idx*11)%COL.length;
      const sameDay=used.length?Math.min(...used.map(u=>colorDist(ci,u))):9999;
      const score=sameDay*10 + colorDist(ci,(seed+17)%COL.length)*0.15 - Math.abs(((ci-seed+COL.length)%COL.length)-15)*0.01;
      if(score>bestScore){bestScore=score;best=ci}
    }
    used.push(best);map[site]=best;
  });
  return map;
}
function BG(e,d){if(e.kind==='plan')return '#9ca3af';if(e.kind==='off')return '#f7d8e6';if(CF(e))return '#dc2626';return C(e.site||'未設定',d)}function TM(t){let m=String(t||'00:00').match(/^(\d+):(\d{2})$/);if(!m)return 0;return Number(m[1])*60+Number(m[2])}function DT(ds,tm){let base=new Date(ds+'T00:00');let mins=TM(tm);base.setMinutes(mins);return base}function R(e){let a=DT(e.date,e.start),ed=e.endDate||e.date,b=DT(ed,e.end);if(b<=a)b=new Date(a.getTime()+3600000);return[a,b]}function O(a,b){let[x,y]=R(a),[u,v]=R(b);return x<v&&u<y}function CF(e){return (e.kind==='work'||e.kind==='plan'||e.kind==='confirmed')&&events.some(x=>x!==e&&(x.kind==='work'||x.kind==='plan'||x.kind==='confirmed')&&O(e,x)&&((e.vehicles||[]).some(v=>(x.vehicles||[]).includes(v))||(e.people||[]).some(p=>(x.people||[]).includes(p))))}function ON(e,d){let s=new Date(K(d)+'T00:00'),n=new Date(s);n.setDate(n.getDate()+1);let[a,b]=R(e);return a<n&&b>s}function SEG(e,d){let day=new Date(K(d)+'T00:00'),next=new Date(day);next.setDate(next.getDate()+1);let[a,b]=R(e),s=a<day?day:a,t=b>next?next:b;if(t<=s)return null;return[s,t]}function NX(e,d){let[a,b]=R(e),k=K(d);return e.date!==k&&K(a)===k||e.endDate&&e.endDate!==e.date&&e.endDate===k}
function BAR(e,d){let night=e.date!==K(d)||((e.endDate||e.date)!==e.date);let txt=e.kind==='off'?'休み':(e.kind==='plan'?'予定 ': '')+e.site+' '+e.start+'-'+e.end;let bg=e.kind==='off'?'':`background:${BG(e,d)}`;let label=night?`<span class="nighttag">🌙 日またぎ</span>`:'';return `<button draggable="true" ondragstart="dragStartEvent(${e.id})" class="bar ${e.kind==='off'?'off ':e.kind==='plan'?'plan ':''}${CF(e)?'conf ':''}${night?'overnight nightbar':''}" style="${bg}" title="${night?'🌙 日またぎ：':''}${E(txt)}" onclick="editEvent(${e.id},'${K(d)}')">${label}${E(txt)}</button>`}
function MONTH(){let y=cur.getFullYear(),m=cur.getMonth(),s=new Date(y,m,1);s.setDate(1-((s.getDay()+6)%7));let h='<div class="month">';['月','火','水','木','金','土','日'].forEach(x=>h+=`<div class="dow">${x}</div>`);for(let i=0;i<42;i++){let d=new Date(s);d.setDate(s.getDate()+i);let cn='day '+(d.getMonth()!=m?'out ':'')+(K(d)===K(cur)?'selected':'');let dn=d.getDay()===0?'sun':d.getDay()===6?'sat':'';h+=`<div class="${cn}" ondragover="event.preventDefault()" ondrop="dropEvent('${K(d)}')" onclick="selectDay('${K(d)}')"><div class="date ${dn}">${d.getDate()}</div>${filteredEvents().filter(e=>ON(e,d)).slice(0,5).map(e=>BAR(e,d)).join('')}</div>`}return h+'</div>'}
function WTXT(e,d){let night=e.date!==K(d)||(e.endDate&&e.endDate!==e.date);return e.kind==='off'?'休み':(night?'🌙 ':'')+(e.kind==='plan'?'予定 ': '')+e.site+' '+e.start+'-'+e.end+(night?'（日またぎ）':'')}
function WEEK(){let s=new Date(cur);s.setDate(s.getDate()-((s.getDay()+6)%7));let h='<div class="week"><div class="wh week-switch"><span>週予定</span><div class="week-mode"><button class="wm '+(weekMode==="people"?"on":"")+'" onclick="setWeekMode(\'people\',event)">人員別</button><button class="wm '+(weekMode==="vehicle"?"on":"")+'" onclick="setWeekMode(\'vehicle\',event)">車両別</button></div></div>';for(let i=0;i<7;i++){let d=new Date(s);d.setDate(s.getDate()+i);let ds=K(d);h+=`<div class="wh week-date" title="この日を選択" onclick="selectWeekDate('${ds}',event)">${d.getMonth()+1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）</div>`}const all=filteredEvents();if(weekMode==="vehicle"){VEH.forEach(v=>{h+=`<div class="person">${E(v[0])}（${E(v[1])}）</div>`;for(let i=0;i<7;i++){let d=new Date(s);d.setDate(s.getDate()+i);let es=all.filter(e=>ON(e,d)&&(e.vehicles||[]).includes(v[0]));h+=`<div>${es.map(e=>`<button class="wbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':' '} ${CF(e)?'conf ':''}${(e.date!==K(d)||(e.endDate&&e.endDate!==e.date))?'overnight':''}" style="background:${BG(e,d)}" onclick="editEvent(${e.id},'${K(d)}')">${E(WTXT(e,d))}</button>`).join('')||'－'}</div>`}});h+=`<div class="person">未割当</div>`;for(let i=0;i<7;i++){let d=new Date(s);d.setDate(s.getDate()+i);let es=all.filter(e=>ON(e,d)&&!(e.vehicles||[]).length);h+=`<div>${es.map(e=>`<button class="wbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':' '} ${CF(e)?'conf ':''}${(e.date!==K(d)||(e.endDate&&e.endDate!==e.date))?'overnight':''}" style="background:${BG(e,d)}" onclick="editEvent(${e.id},'${K(d)}')">${E(WTXT(e,d))}</button>`).join('')||'－'}</div>`}}else{PEOPLE.forEach(p=>{h+=`<div class="person">${E(p)}</div>`;for(let i=0;i<7;i++){let d=new Date(s);d.setDate(s.getDate()+i);let es=all.filter(e=>ON(e,d)&&(e.people||[]).includes(p));h+=`<div>${es.map(e=>`<button class="wbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':' '} ${CF(e)?'conf ':''}${(e.date!==K(d)||(e.endDate&&e.endDate!==e.date))?'overnight':''}" style="background:${BG(e,d)}" onclick="editEvent(${e.id},'${K(d)}')">${E(WTXT(e,d))}</button>`).join('')||'－'}</div>`}});h+=`<div class="person">未割当</div>`;for(let i=0;i<7;i++){let d=new Date(s);d.setDate(s.getDate()+i);let es=all.filter(e=>ON(e,d)&&!(e.people||[]).length);h+=`<div>${es.map(e=>`<button class="wbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':' '} ${CF(e)?'conf ':''}${(e.date!==K(d)||(e.endDate&&e.endDate!==e.date))?'overnight':''}" style="background:${BG(e,d)}" onclick="editEvent(${e.id},'${K(d)}')">${E(WTXT(e,d))}</button>`).join('')||'－'}</div>`}}return h+'</div>'}
function DH(dt,day){let h=dt.getHours()+dt.getMinutes()/60;if(K(dt)!==K(day)||h<6)h+=24;return h}function DAY(){let h='<div class="timeline"><div class="times"><div>車両 / 人員</div>'+[6,8,10,12,14,16,18,20,22,24,2,4,6].map(x=>`<div>${x}:00</div>`).join('')+'</div>';filteredEvents().filter(e=>ON(e,cur)).forEach(e=>{let seg=SEG(e,cur);if(!seg)return;let[a,b]=seg,sh=DH(a,cur),eh=DH(b,cur),l=Math.max(0,(sh-6)/24)*100,r=Math.min(100,(eh-6)/24*100),w=Math.max(1,r-l);if(r<=0||l>=100)return;let night=e.date!==K(cur)||((e.endDate||e.date)!==K(cur));let txt=e.kind==='off'?'休み':(e.kind==='plan'?'予定 ':'')+e.site+' '+e.start+'～'+e.end;let label=night?'🌙 日またぎ｜':'';h+=`<div class="trow"><div class="who">${E((e.vehicles||[]).join(', '))}<br>${E((e.people||[]).join(', '))}</div><div class="track"><button class="tbar ${e.kind==='off'?'off':e.kind==='plan'?'plan':' '} ${CF(e)?'conflict':''} ${night?'overnight nightbar':''}" style="left:${l}%;width:${w}%;background:${BG(e,d)}" title="${night?'🌙 日またぎ：':''}${E(txt)}" onclick="editEvent(${e.id},'${K(cur)}')">${E(label+txt)}</button></div></div>`});return h+'</div>'}
function render(){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===view));document.getElementById('title').textContent=`${cur.getFullYear()}年${cur.getMonth()+1}月`;document.getElementById('sub').textContent=view==='month'?'週予定':view==='week'?'日予定':'月予定';document.getElementById('main').innerHTML=view==='month'?MONTH():view==='week'?WEEK():DAY();document.getElementById('secondary').innerHTML=view==='month'?WEEK():view==='week'?DAY():MONTH();status()}function status(){let bv=new Set(),bp=new Set(),ov=new Set(),op=new Set();events.filter(e=>ON(e,cur)).forEach(e=>{let vs=e.vehicles||[],ps=e.people||[];if(e.kind==='off'){vs.forEach(v=>ov.add(v));ps.forEach(p=>op.add(p));}else if(e.kind==='plan'||e.kind==='confirmed'||e.kind==='work'){vs.forEach(v=>bv.add(v));ps.forEach(p=>bp.add(p));}});document.getElementById('stitle').textContent='空き状況（'+K(cur)+'）';document.getElementById('status').innerHTML=VEH.map(v=>`<div>${E(v[0])}（${E(v[1])}） <span class="${ov.has(v[0])?'off-note':bv.has(v[0])?'busy':'free'}">${ov.has(v[0])?'● 休み':bv.has(v[0])?'● 稼働':'○ 空き'}</span></div>`).join('')+PEOPLE.map(p=>`<div>${E(p)} <span class="${op.has(p)?'off-note':bp.has(p)?'busy':'free'}">${op.has(p)?'● 休み':bp.has(p)?'● 稼働':'○ 空き'}</span></div>`).join('')+'<div class="status-note">※予定に割り当てた車両・人員を「稼働」、休みを「休み」と表示。共有中は古い端末のデータで新しい割り当てを上書きしない仕組みです。</div>'}
function checks(){rebuildChecks()}
function rebuildChecks(){
 document.getElementById('vs').innerHTML=VEH.map(v=>`<label class="check"><input class="v" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');
 document.getElementById('ps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="p" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');
 document.getElementById('mvs').innerHTML=VEH.map(v=>`<label class="check"><input class="mv" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');
 document.getElementById('mps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="mp" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');
}
function setFormValues(prefix, e){
 document.getElementById(prefix+'kind').value=e.kind||'plan';
 document.getElementById(prefix+'site').value=e.site||'';
 document.getElementById(prefix+'work').value=e.work||'';
 document.getElementById(prefix+'sd').value=e.date||K(cur);
 document.getElementById(prefix+'ed').value=e.endDate||e.date||K(cur);
 document.getElementById(prefix+'st').value=e.start||'08:00';
 document.getElementById(prefix+'et').value=e.end||'16:00';
 document.querySelectorAll('.'+(prefix==='m'?'mv':'v')).forEach(x=>x.checked=(e.vehicles||[]).includes(x.value));
 document.querySelectorAll('.'+(prefix==='m'?'mp':'p')).forEach(x=>x.checked=(e.people||[]).includes(x.value));
}
function getFormValues(prefix){
 return {kind:document.getElementById(prefix+'kind').value,site:document.getElementById(prefix+'site').value,work:document.getElementById(prefix+'work').value,date:document.getElementById(prefix+'sd').value,endDate:document.getElementById(prefix+'ed').value,start:document.getElementById(prefix+'st').value,end:document.getElementById(prefix+'et').value,vehicles:[...document.querySelectorAll('.'+(prefix==='m'?'mv':'v')+':checked')].map(x=>x.value),people:[...document.querySelectorAll('.'+(prefix==='m'?'mp':'p')+':checked')].map(x=>x.value)};
}
let editOriginal=null,editAssignmentChanged=false;

document.addEventListener('change',ev=>{if(ev.target&&ev.target.matches('.v,.p,.mv,.mp')&&eid)editAssignmentChanged=true});

function openEventModal(){document.getElementById('eventModal').classList.add('open');document.body.style.overflow='hidden'}
function closeEventModal(){document.getElementById('eventModal').classList.remove('open');document.body.style.overflow='';}
function newEvent(){eid=null;editOriginal=null;editAssignmentChanged=false;setFormValues('m',{kind:'plan',site:'',work:'',date:K(cur),endDate:K(cur),start:'08:00',end:'16:00',vehicles:[],people:[]});setFormValues('',{kind:'plan',site:'',work:'',date:K(cur),endDate:K(cur),start:'08:00',end:'16:00',vehicles:[],people:[]});document.getElementById('ftitle').textContent='予定の追加';document.getElementById('mftitle').textContent='予定の追加';openEventModal();}
function editEvent(id,d){let e=events.find(x=>String(x.id)===String(id));if(!e)return;cur=new Date(d+'T00:00');eid=e.id;editOriginal=JSON.parse(JSON.stringify(e));editAssignmentChanged=false;setFormValues('m',e);setFormValues('',e);document.getElementById('ftitle').textContent='予定の編集';document.getElementById('mftitle').textContent='予定の編集';render();openEventModal();}
function syncAddDate(){const sd=document.getElementById('sd'),ed=document.getElementById('ed');if(sd&&!eid)sd.value=K(cur);if(ed&&!eid)ed.value=K(cur);const msd=document.getElementById('msd'),med=document.getElementById('med');if(msd&&!eid)msd.value=K(cur);if(med&&!eid)med.value=K(cur)}
function selectDay(d){cur=new Date(d+'T00:00');syncAddDate();render()}
function selectWeekDate(d,ev){if(ev)ev.stopPropagation();eid=null;cur=new Date(d+'T00:00');render();newEvent();syncAddDate();}
function saveEvent(fromModal=false){
 const form=getFormValues(fromModal?'m':'');
 const old=eid?events.find(x=>String(x.id)===String(eid)):null;
 let e=old?{...old,...form}:{...form};
 e.id=eid||Date.now();
 // 「予定→確定」など区分だけを変更した場合、既存の割り当ては絶対に消さない。
 // 車両・人員のチェックボックスを実際に触った場合だけ、その選択結果を保存する。
 if(old&&!editAssignmentChanged){
   e.vehicles=Array.isArray(old.vehicles)?old.vehicles.slice():[];
   e.people=Array.isArray(old.people)?old.people.slice():[];
   if(old.vehicle)e.vehicle=old.vehicle;
   if(old.person)e.person=old.person;
 }
 e.updatedAt=Date.now();
 if(!e.date)return alert('開始日を入力してください');
 if(e.kind==='off'){e.site='';e.work=''}
 if(eid)events=events.map(x=>String(x.id)===String(eid)?e:x);else events.push(e);
 dirtyEventIds.add(String(e.id));
 saveLocalAndCloud();render();eid=null;editOriginal=null;editAssignmentChanged=false;
 if(fromModal)closeEventModal();
 setFormValues('',{kind:'plan',site:'',work:'',date:K(cur),endDate:K(cur),start:'08:00',end:'16:00',vehicles:[],people:[]});
}
function delEvent(fromModal=false){if(eid){const id=String(eid);pendingDeletedIds.push(id);dirtyEventIds.delete(id);events=events.filter(x=>String(x.id)!==id);saveLocalAndCloud()}eid=null;if(fromModal)closeEventModal();render();}
function shift(n){if(view==='month')cur.setMonth(cur.getMonth()+n);else if(view==='week')cur.setDate(cur.getDate()+7*n);else cur.setDate(cur.getDate()+n);render()}document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});prev.onclick=()=>shift(-1);next.onclick=()=>shift(1);today.onclick=()=>{cur=new Date();cur.setHours(0,0,0,0);render()};subPrev.onclick=()=>shift(-1);subNext.onclick=()=>shift(1);checks();newEvent();render();
