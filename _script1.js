
let peopleList=JSON.parse(localStorage.getItem('vehiclePeopleList')||'null');
if(!Array.isArray(peopleList)||peopleList.length===0)peopleList=PEOPLE.slice();
let vehicleList=JSON.parse(localStorage.getItem('vehicleList')||'null');
if(!Array.isArray(vehicleList)||vehicleList.length===0)vehicleList=VEH.map(v=>({id:v[0],detail:v[1],memo:''}));
vehicleList=vehicleList.filter(v=>v&&typeof v==='object'&&String(v.id||'').trim()).map(v=>({id:String(v.id),detail:String(v.detail||'2t'),memo:String(v.memo||'')}));
function syncMaster(){PEOPLE.splice(0,PEOPLE.length,...peopleList);VEH.splice(0,VEH.length,...vehicleList.map(v=>[v.id,v.detail]));}
function rebuildChecks(){document.getElementById('vs').innerHTML=VEH.map(v=>`<label class="check"><input class="v" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');document.getElementById('ps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="p" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');document.getElementById('mvs').innerHTML=VEH.map(v=>`<label class="check"><input class="mv" type="checkbox" value="${E(v[0])}"> ${E(v[0])} (${E(v[1])})</label>`).join('');document.getElementById('mps').innerHTML=PEOPLE.map(p=>`<label class="check"><input class="mp" type="checkbox" value="${E(p)}"> ${E(p)}</label>`).join('');}
let cloudLastUpdated=Number(localStorage.getItem('vehicleCloudLastUpdated')||0),cloudRevision=Number(localStorage.getItem('vehicleCloudRevision')||0),pendingDeletedIds=JSON.parse(localStorage.getItem('vehiclePendingDeletedIds')||'[]'),dirtyEventIds=new Set(JSON.parse(localStorage.getItem('vehicleDirtyEventIds')||'[]').map(String)),cloudSaving=false,cloudLoading=false,cloudTimer=null,cloudLastSaveToken=localStorage.getItem('vehicleLastSaveToken')||'';
let localMutationVersion=0,cloudSaveQueued=(dirtyEventIds.size>0||pendingDeletedIds.length>0);
const GAS_URL='https://script.google.com/macros/s/AKfycbw6NI9FHyRj1afnCuPNeuUZCcFGP3n0n0OIlMEvlSrridqC1FcQl6166th9gGSmtzTP/exec';
function cloudState(){return {events:events,vehicles:vehicleList,people:peopleList,logs:[],lastUpdated:Date.now(),baseRevision:cloudRevision,deletedIds:pendingDeletedIds.slice(),dirtyEventIds:Array.from(dirtyEventIds||[]),saveToken:(crypto.randomUUID?crypto.randomUUID():'tok_'+Date.now()+'_'+Math.random().toString(36).slice(2))}}
function setCloudStatus(t){const el=document.getElementById('cloudStatus');if(el)el.textContent=t}
function persistLocal(){localStorage.setItem('vehiclePeopleList',JSON.stringify(peopleList));localStorage.setItem('vehicleList',JSON.stringify(vehicleList));localStorage.setItem('vehicleScheduleExact',JSON.stringify(events));localStorage.setItem('vehicleCloudLastUpdated',String(cloudLastUpdated||0));localStorage.setItem('vehicleCloudRevision',String(cloudRevision||0));localStorage.setItem('vehiclePendingDeletedIds',JSON.stringify(pendingDeletedIds||[]));localStorage.setItem('vehicleDirtyEventIds',JSON.stringify(Array.from(dirtyEventIds||[])))}

// GitHub Pages → GAS の共有通信。
// 読み込みは JSONP、保存は hidden form POST を使うため、CORS や iframe 内の GAS UI に依存しません。
let jsonpSeq=0;
function jsonpGet(timeout=15000){
  return new Promise((resolve,reject)=>{
    const cb='__vehicleScheduleJsonp_'+Date.now()+'_'+(++jsonpSeq);
    let attempt=0, lastErr=null;
    const run=()=>{
      attempt++;
      const script=document.createElement('script');
      let done=false, timer=null;
      const cleanup=()=>{if(script.parentNode)script.parentNode.removeChild(script);clearTimeout(timer)};
      const fail=(msg)=>{if(done)return;done=true;cleanup();lastErr=new Error(msg);if(attempt<2){run();}else{try{delete window[cb]}catch(e){window[cb]=undefined}reject(lastErr)}};
      timer=setTimeout(()=>fail('GAS読み込みタイムアウト（試行'+attempt+'）'),timeout);
      window[cb]=(data)=>{if(done)return;done=true;cleanup();try{delete window[cb]}catch(e){window[cb]=undefined}resolve(data)};
      script.onerror=()=>fail('GAS読み込みエラー（試行'+attempt+'）');
      // まずGoogle公式のJSONP例に合わせた prefix、失敗時は従来の callback で再試行。
      const param=attempt===1?'prefix':'callback';
      script.src=GAS_URL+'?api=1&'+param+'='+encodeURIComponent(cb)+'&_='+Date.now();
      document.head.appendChild(script);
    };
    run();
  });
}
function postForm(payload,timeout=20000){
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.name='vehicleSaveFrame_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    frame.style.display='none';
    const form=document.createElement('form');
    form.method='POST';form.action=GAS_URL;form.target=frame.name;form.style.display='none';
    const input=document.createElement('textarea');
    input.name='payload';input.value=JSON.stringify(payload);form.appendChild(input);
    document.body.appendChild(frame);document.body.appendChild(form);
    let done=false;
    const finish=(ok,err)=>{if(done)return;done=true;clearTimeout(timer);setTimeout(()=>{frame.remove();form.remove()},100);if(ok)resolve();else reject(err)};
    const timer=setTimeout(()=>finish(false,new Error('GAS保存タイムアウト')),timeout);
    frame.addEventListener('load',()=>finish(true),{once:true});
    try{form.submit()}catch(err){finish(false,err)}
  });
}
async function postCloud(){
  if(!GAS_URL||cloudSaving)return;
  cloudSaving=true;
  try{
    while(cloudSaveQueued){
      cloudSaveQueued=false;
      setCloudStatus('共有保存中…');
      // 送信中に別の編集が入っても、その編集を同じ送信に混ぜず、次の送信へ回す。
      const stateToSave=JSON.parse(JSON.stringify(cloudState()));
      const saveToken=stateToSave.saveToken;
      const saveVersion=localMutationVersion;
      localStorage.setItem('vehicleLastSaveToken',saveToken);
      try{
        await postForm(stateToSave,20000);
        const latest=await jsonpGet(10000);
        // 送信完了後に別の編集があった場合、古い応答で画面を巻き戻さない。
        if(localMutationVersion!==saveVersion){
          setCloudStatus('共有保存済み・最新変更を送信中…');
          continue;
        }
        if(latest&&latest.hasData&&String(latest.saveToken||'')===String(saveToken)){
          cloudLastSaveToken=saveToken;
          applyCloudState(latest);
          pendingDeletedIds=[];
          dirtyEventIds.clear();
          persistLocal();
          render();
          setCloudStatus('共有保存・同期済み');
        }else if(latest&&latest.hasData){
          // 他端末の更新でトークンが変わっていても、こちらの編集を勝手に消さない。
          // 最新共有状態は、未送信のローカル変更が残っている場合は取り込まず次回送信へ回す。
          if(localMutationVersion===saveVersion){
            const latestById=new Map((latest.events||[]).map(e=>[String(e.id),e]));
            const stillDirty=new Set(Array.from(dirtyEventIds||[]).map(String));
            events=events.map(local=>{
              const id=String(local.id);
              if(stillDirty.has(id))return local;
              return latestById.get(id)||local;
            });
            (latest.events||[]).forEach(remote=>{const id=String(remote.id);if(!events.some(e=>String(e.id)===id)&&!stillDirty.has(id))events.push(remote)});
            cloudRevision=Number(latest.revision||cloudRevision);cloudLastUpdated=Number(latest.lastUpdated||cloudLastUpdated);
            persistLocal();render();
          }
          setCloudStatus('共有データ更新を確認しました');
        }else{
          setCloudStatus('共有保存確認失敗');
        }
      }catch(err){
        console.warn('共有保存に失敗',err);
        setCloudStatus('共有保存失敗');
      }
    }
  }finally{
    cloudSaving=false;
    // 保存完了直前に編集が入った場合も取りこぼさない。
    if(cloudSaveQueued)postCloud();
  }
}
function saveLocalAndCloud(){
  localMutationVersion++;
  cloudSaveQueued=true;
  persistLocal();
  postCloud();
}
function fetchCloudStateOnce(){return jsonpGet(15000)}
function forceCloudReload(){cloudLoading=false;loadCloud()}

function applyCloudState(d){
  if(!d||!d.hasData)return;
  events=Array.isArray(d.events)?d.events:[];
  peopleList=Array.isArray(d.people)&&d.people.length?d.people:peopleList;
  vehicleList=Array.isArray(d.vehicles)&&d.vehicles.length?d.vehicles:vehicleList;
  cloudLastUpdated=Number(d.lastUpdated||0);cloudRevision=Number(d.revision||0);if(d.saveToken)cloudLastSaveToken=String(d.saveToken);
  syncMaster();rebuildChecks();
}
async function loadCloud(){
  if(!GAS_URL||cloudLoading||cloudSaving||cloudSaveQueued)return;
  cloudLoading=true;setCloudStatus('共有読込中…');
  try{
    const d=await fetchCloudStateOnce();
    if(d&&d.hasData){
      const dirty=new Set(Array.from(dirtyEventIds||[]).map(String));
      const remoteById=new Map((d.events||[]).map(e=>[String(e.id),e]));
      const merged=events.map(local=>dirty.has(String(local.id))?local:(remoteById.get(String(local.id))||local));
      (d.events||[]).forEach(remote=>{const id=String(remote.id);if(!events.some(e=>String(e.id)===id)&&!dirty.has(id))merged.push(remote)});
      events=merged;peopleList=Array.isArray(d.people)&&d.people.length?d.people:peopleList;vehicleList=Array.isArray(d.vehicles)&&d.vehicles.length?d.vehicles:vehicleList;cloudLastUpdated=Number(d.lastUpdated||0);cloudRevision=Number(d.revision||0);if(d.saveToken)cloudLastSaveToken=String(d.saveToken);syncMaster();rebuildChecks();persistLocal();render();setCloudStatus('共有同期済み')}
    else if(d){setCloudStatus('共有データなし');if(events.length||peopleList.length||vehicleList.length)postCloud()}
    else setCloudStatus('共有接続エラー');
  }catch(err){console.warn('共有読み込みに失敗',err);setCloudStatus('共有接続エラー')}
  finally{cloudLoading=false}
}
function persist(){localMutationVersion++;cloudSaveQueued=true;persistLocal();postCloud()}
function closeCloudDiag(){const el=document.getElementById('cloudDiag');if(el)el.classList.remove('open')}
function openCloudDiag(){const el=document.getElementById('cloudDiag');if(el){el.classList.add('open');runCloudDiag()}}
async function runCloudDiag(){const out=document.getElementById('cloudDiagText');if(!out)return;out.textContent='GASから最新データを確認しています…';const started=Date.now();try{const d=await fetchCloudStateOnce();if(!d){out.textContent='【接続失敗】\nGASからデータを取得できませんでした。\n\nURL: '+GAS_URL;return}const latest=Array.isArray(d.events)?d.events:[];const localCount=Array.isArray(events)?events.length:0;const newest=latest.slice(-5).map(e=>`${e.date||''} ${e.start||''} ${e.site||''} [${e.kind||''}]`).join('\n');out.textContent='【GAS接続：OK】\n取得時間: '+(Date.now()-started)+'ms\nrevision: '+(d.revision||0)+'\n最終更新: '+(d.lastUpdated?new Date(Number(d.lastUpdated)).toLocaleString():'なし')+'\n予定件数(GAS): '+latest.length+'\n予定件数(端末): '+localCount+'\n車両数: '+(Array.isArray(d.vehicles)?d.vehicles.length:0)+'\n人員数: '+(Array.isArray(d.people)?d.people.length:0)+'\nsaveToken: '+(d.saveToken||'なし')+'\n\nGAS側の最新5件:\n'+(newest||'（予定なし）')}catch(err){out.textContent='【接続失敗】\n'+String(err&&err.message||err)+'\n\n確認：GAS Webアプリは「自分として実行」＋「全員」で公開してください。\n\n※今回の通信はGASの画面を開くのではなく、データAPI（JSONP）だけを呼び出しています。'}}
function openSettings(){document.getElementById('settings').classList.add('open');manageTab('people')}
function closeSettings(){document.getElementById('settings').classList.remove('open');rebuildChecks();render()}
function manageTab(m){document.getElementById('tabPeople').classList.toggle('on',m==='people');document.getElementById('tabVehicles').classList.toggle('on',m==='vehicles');let h='';if(m==='people'){h='<h3>人員の増減・名前変更</h3>';peopleList.forEach((n,i)=>h+=`<div class="manage-row people"><input id="pn${i}" value="${E(n)}"><button onclick="renamePerson(${i})">変更</button><button onclick="removePerson(${i})">削除</button></div>`);h+='<div class="manage-add"><input id="newPerson" placeholder="新しい人員名"><button onclick="addPerson()">＋ 人員追加</button></div>'}else{h='<h3>車両の増減・詳細変更</h3>';vehicleList.forEach((v,i)=>h+=`<div class="manage-row"><input id="vn${i}" value="${E(v.id)}"><input id="vd${i}" value="${E(v.detail)}"><input id="vm${i}" value="${E(v.memo||'')}" placeholder="詳細・メモ"><button onclick="updateVehicle(${i})">変更</button><button onclick="removeVehicle(${i})">削除</button></div>`);h+='<div class="manage-add"><input id="newVehicleId" placeholder="車両番号 008"><input id="newVehicleDetail" placeholder="2t"><input id="newVehicleMemo" placeholder="詳細・メモ"><button onclick="addVehicle()">＋ 車両追加</button></div>'}document.getElementById('manageBody').innerHTML=h}
function addPerson(){let n=document.getElementById('newPerson').value.trim();if(!n)return alert('人員名を入力してください');if(peopleList.includes(n))return alert('同じ名前があります');peopleList.push(n);syncMaster();persist();manageTab('people');rebuildChecks();render()}
function renamePerson(i){let old=peopleList[i],n=document.getElementById('pn'+i).value.trim();if(!n)return alert('名前を入力してください');if(n!==old&&peopleList.includes(n))return alert('同じ名前があります');events.forEach(e=>{e.people=(e.people||[]).map(x=>x===old?n:x);e.updatedAt=Date.now();dirtyEventIds.add(String(e.id))});peopleList[i]=n;syncMaster();persist();manageTab('people');rebuildChecks();render()}
function removePerson(i){let n=peopleList[i];if(!confirm(n+' を削除しますか？'))return;events.forEach(e=>{e.people=(e.people||[]).filter(x=>x!==n);e.updatedAt=Date.now();dirtyEventIds.add(String(e.id))});peopleList.splice(i,1);syncMaster();persist();manageTab('people');rebuildChecks();render()}
function addVehicle(){let id=document.getElementById('newVehicleId').value.trim(),detail=document.getElementById('newVehicleDetail').value.trim()||'2t',memo=document.getElementById('newVehicleMemo').value.trim();if(!id)return alert('車両番号を入力してください');if(vehicleList.some(v=>v.id===id))return alert('同じ車両番号があります');vehicleList.push({id,detail,memo});syncMaster();persist();manageTab('vehicles');rebuildChecks();render()}
function updateVehicle(i){let old=vehicleList[i].id,id=document.getElementById('vn'+i).value.trim(),detail=document.getElementById('vd'+i).value.trim()||'2t',memo=document.getElementById('vm'+i).value.trim();if(!id)return alert('車両番号を入力してください');if(id!==old&&vehicleList.some(v=>v.id===id))return alert('同じ車両番号があります');events.forEach(e=>{e.vehicles=(e.vehicles||[]).map(x=>x===old?id:x);if(e.vehicle===old)e.vehicle=id;e.updatedAt=Date.now();dirtyEventIds.add(String(e.id))});vehicleList[i]={id,detail,memo};syncMaster();persist();manageTab('vehicles');rebuildChecks();render()}
function removeVehicle(i){let v=vehicleList[i];if(!confirm(v.id+' を削除しますか？'))return;events.forEach(e=>{e.vehicles=(e.vehicles||[]).filter(x=>x!==v.id);if(e.vehicle===v.id)e.vehicle='';e.updatedAt=Date.now();dirtyEventIds.add(String(e.id))});vehicleList.splice(i,1);syncMaster();persist();manageTab('vehicles');rebuildChecks();render()}
syncMaster();rebuildChecks();render();if(cloudSaveQueued)postCloud();else loadCloud();clearInterval(cloudTimer);cloudTimer=setInterval(()=>{if(!cloudSaving&&!cloudLoading&&!cloudSaveQueued)loadCloud()},7000);

// productivity features
function setSearch(v){searchText=String(v||'').trim().toLowerCase();render()}
function setKindFilter(v){kindFilter=v||'all';render()}
function clearFilters(){searchText='';kindFilter='all';const a=document.getElementById('searchBox'),b=document.getElementById('filterKind');if(a)a.value='';if(b)b.value='all';render()}
function filteredEvents(){return events.filter(e=>{if(kindFilter!=='all'&&e.kind!==kindFilter)return false;if(!searchText)return true;const hay=[e.site,e.work,e.start,e.end,...(e.vehicles||[]),...(e.people||[])].join(' ').toLowerCase();return hay.includes(searchText)})}
function duplicateEvent(){if(!eid)return;const e=events.find(x=>String(x.id)===String(eid));if(!e)return;const copy=JSON.parse(JSON.stringify(e));copy.id=Date.now()+Math.floor(Math.random()*1000);copy.updatedAt=Date.now();copy.date=K(cur);copy.endDate=e.endDate||e.date;events.push(copy);dirtyEventIds.add(String(copy.id));eid=copy.id;setFormValues('m',copy);setFormValues('',copy);document.getElementById('mftitle').textContent='予定の複製';document.getElementById('ftitle').textContent='予定の複製';saveLocalAndCloud();render()}
function dragStartEvent(id){dragEventId=id}
function dropEvent(date){if(!dragEventId)return;const e=events.find(x=>String(x.id)===String(dragEventId));if(!e)return;const old=new Date(e.date+'T00:00'),nd=new Date(date+'T00:00');const delta=Math.round((nd-old)/86400000);if(delta===0){dragEventId=null;return}e.date=date;e.updatedAt=Date.now();dirtyEventIds.add(String(e.id));if(e.endDate){const ed=new Date(e.endDate+'T00:00');ed.setDate(ed.getDate()+delta);e.endDate=K(ed)}saveLocalAndCloud();dragEventId=null;render()}
function openInstallHelp(){document.getElementById('installHelp').classList.add('open')}
function closeInstallHelp(){document.getElementById('installHelp').classList.remove('open')}
async function enableNotifications(){if(!('Notification' in window)){alert('このブラウザは通知に対応していません。');return}try{const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem('vehicleNotifications','1');alert('予定通知を有効にしました。アプリを開いている間、開始前の予定をお知らせします。');checkReminders()}else alert('通知は許可されませんでした。')}catch(e){alert('通知設定を完了できませんでした。')}}
function checkReminders(){if(localStorage.getItem('vehicleNotifications')!=='1'||!('Notification' in window)||Notification.permission!=='granted')return;const now=Date.now();events.forEach(e=>{if(e.kind==='off')return;const start=DT(e.date,e.start).getTime();const diff=start-now;if(diff>0&&diff<=30*60*1000){const key=String(e.id)+'_'+e.date+'_'+e.start;if(!notifiedKeys.has(key)){notifiedKeys.add(key);new Notification('予定のお知らせ',{body:(e.site||'現場未設定')+' '+e.start+'〜'+e.end+(e.work?'｜'+e.work:'')})}}})}
setInterval(checkReminders,60000);setTimeout(checkReminders,3000);

// PWA: service worker + install button
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const b = document.getElementById('installBtn');
  if (b) b.style.display = '';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const b = document.getElementById('installBtn');
  if (b) b.style.display = 'none';
});
async function installApp(){
  if (deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch(e){}
    deferredInstallPrompt = null;
    const b = document.getElementById('installBtn');
    if (b) b.style.display = 'none';
    return;
  }
  alert('iPhone/iPad：共有ボタン →「ホーム画面に追加」\nAndroid：ブラウザの「アプリをインストール」または「ホーム画面に追加」から登録してください。');
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=54').catch(err => console.warn('PWA登録失敗', err));
  });
}

