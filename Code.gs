// 車両人員予定表：v47修正版 共有バックエンド
// v47のスプレッドシート形式を維持しつつ、保存を「差分パッチ＋競合確認」に変更。
const SPREADSHEET_ID='1KYmKn-zGJyLdrut_pjQ_QFVWH6BCIR_wNu910Hf2i80';
const SHEET_NAME='予定表データ';
const LEGACY_SHEET_NAME='予定データ';
const CHUNK_SIZE=45000;
const CACHE_KEY='vehicle_schedule_state_v47fix1';
const CACHE_TTL=21600;

function doGet(e){const p=(e&&e.parameter)||{};const cb=p.prefix||p.callback||'';try{if(p.api==='1'){const forceFresh=String(p.nocache||'')==='1';const state=readState_(forceFresh);return cb?jsonp_(cb,state):json_(state);}if(p.health==='1')return json_({ok:true,spreadsheet:'connected'});return HtmlService.createHtmlOutputFromFile('index').setTitle('車両人員予定表').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);}catch(err){const out={ok:false,hasData:false,error:String(err&&err.message||err)};return cb?jsonp_(cb,out):json_(out);}}
function doPost(e){try{let raw=e&&e.parameter&&e.parameter.payload?e.parameter.payload:'';if(!raw&&e&&e.postData&&e.postData.contents)raw=e.postData.contents;if(!raw)return json_({ok:false,error:'payloadがありません'});const data=JSON.parse(raw);if(data.action==='patch')return json_(applyPatch_(data));if(data.action&&data.action!=='save')return json_({ok:false,error:'未対応のactionです'});return json_(writeLegacyState_(data));}catch(err){return json_({ok:false,error:String(err&&err.message||err)});}}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function jsonp_(callback,obj){if(!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback))return ContentService.createTextOutput('invalid callback');return ContentService.createTextOutput(callback+'('+JSON.stringify(obj)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);}
function defaultState_(){return {events:[],vehicles:[],people:[],logs:[],lastUpdated:0,revision:0,hasData:false,saveToken:'',masterUpdatedAt:0,deleted:{}};}
function getSpreadsheet_(){return SpreadsheetApp.openById(SPREADSHEET_ID);}
function getSheet_(){const ss=getSpreadsheet_();let sh=ss.getSheetByName(SHEET_NAME);if(!sh)sh=ss.insertSheet(SHEET_NAME);return sh;}
function readRaw_(sh){const lastRow=sh.getLastRow();if(!lastRow)return '';return sh.getRange(1,1,lastRow,1).getDisplayValues().map(r=>r[0]).join('');}
function readState_(forceFresh){
  if(!forceFresh){try{const cached=CacheService.getScriptCache().get(CACHE_KEY);if(cached){const c=normalize_(JSON.parse(cached));c.hasData=!!(c.events.length||c.vehicles.length||c.people.length);return c;}}catch(err){}}
  const ss=getSpreadsheet_(),sh=getSheet_();let raw=readRaw_(sh);
  if(!raw){const old=ss.getSheetByName(LEGACY_SHEET_NAME);if(old)raw=readRaw_(old);}
  if(!raw)return defaultState_();
  try{const state=normalize_(JSON.parse(raw));state.hasData=!!(state.events.length||state.vehicles.length||state.people.length);cacheState_(state);return state;}catch(err){return defaultState_();}
}
function normalize_(d){
  const s=d||{};
  const vehicles=Array.isArray(s.vehicles)?s.vehicles.map(v=>Array.isArray(v)?{id:String(v[0]||''),detail:String(v[1]||'2t'),memo:''}:{id:String(v&&v.id||''),detail:String(v&&v.detail||'2t'),memo:String(v&&v.memo||'')}).filter(v=>v.id):[];
  const people=Array.isArray(s.people)?s.people.map(p=>Array.isArray(p)?String(p[0]||''):String(p||'')).filter(Boolean):[];
  const events=Array.isArray(s.events)?s.events.map(e=>{const x=Object.assign({},e||{});if(!Array.isArray(x.vehicles))x.vehicles=x.vehicle?[x.vehicle]:[];if(!Array.isArray(x.people))x.people=x.person?[x.person]:[];x.vehicles=x.vehicles.map(String);x.people=x.people.map(String);if(!x.kind&&x.status)x.kind=x.status==='確定'?'confirmed':'plan';if(x.kind==='work')x.kind='confirmed';if(!x.kind)x.kind='plan';if(!x.start)x.start='08:00';if(!x.end)x.end='16:00';if(!x.endDate)x.endDate=x.date||'';x.updatedAt=Number(x.updatedAt||0);x.updatedBy=String(x.updatedBy||'');return x;}):[];
  const deleted={};Object.keys(s.deleted||{}).forEach(id=>{const v=s.deleted[id];deleted[String(id)]={updatedAt:Number(v&&v.updatedAt||0),deletedBy:String(v&&v.deletedBy||'')};});
  return {events,vehicles,people,logs:Array.isArray(s.logs)?s.logs:[],lastUpdated:Number(s.lastUpdated||0),revision:Number(s.revision||0),hasData:false,saveToken:String(s.saveToken||''),masterUpdatedAt:Number(s.masterUpdatedAt||0),deleted};
}
function writeRaw_(state){const raw=JSON.stringify(state),sh=getSheet_();sh.getRange(1,1,Math.max(sh.getMaxRows(),1),1).clearContent();const rows=[];for(let i=0;i<raw.length;i+=CHUNK_SIZE)rows.push([raw.slice(i,i+CHUNK_SIZE)]);sh.getRange(1,1,rows.length,1).setValues(rows);sh.setFrozenRows(0);cacheState_(state);}
function cacheState_(state){try{const raw=JSON.stringify(state||defaultState_());if(raw.length<=90000)CacheService.getScriptCache().put(CACHE_KEY,raw,CACHE_TTL);}catch(err){}}
function applyPatch_(data){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    // 競合判定中は必ずSpreadsheetを再読込。CacheServiceの古い状態は使わない。
    const current=readState_(true),now=Date.now(),acceptedIds=[],conflicts=[],deletedIds=[];
    const byId=new Map(current.events.map(e=>[String(e.id),e]));
    const changes=Array.isArray(data.changes)?data.changes:[];
    changes.forEach(raw=>{
      const e=normalize_({events:[raw]}).events[0],id=String(e.id),cur=byId.get(id),base=Number(raw&&raw.baseUpdatedAt!=null?raw.baseUpdatedAt:e.updatedAt||0),tomb=current.deleted[id];
      if(cur&&Number(cur.updatedAt||0)>base){conflicts.push({id,type:'update',reason:'event_updated',server:cur});return;}
      if(tomb&&Number(tomb.updatedAt||0)>base){conflicts.push({id,type:'update',reason:'event_deleted',serverDelete:tomb});return;}
      e.updatedAt=Math.max(now,Number(cur&&cur.updatedAt||0)+1);e.updatedBy=String(data.clientId||'');byId.set(id,e);delete current.deleted[id];acceptedIds.push(id);
    });
    const dels=Array.isArray(data.deletes)?data.deletes:[];
    dels.forEach(raw=>{
      const id=String(raw&&raw.id||''),cur=byId.get(id),tomb=current.deleted[id],base=Number(raw&&raw.baseUpdatedAt||0);
      if(!id)return;
      if(cur&&Number(cur.updatedAt||0)>base){conflicts.push({id,type:'delete',reason:'event_updated',server:cur});return;}
      if(tomb&&Number(tomb.updatedAt||0)>base){conflicts.push({id,type:'delete',reason:'already_deleted',serverDelete:tomb});return;}
      const stamp=Math.max(now,Number(cur&&cur.updatedAt||0)+1,Number(tomb&&tomb.updatedAt||0)+1);byId.delete(id);current.deleted[id]={updatedAt:stamp,deletedBy:String(data.clientId||'')};deletedIds.push(id);
    });
    let masterAccepted=false;
    if(data.masterChanged){const baseMaster=Number(data.baseMasterUpdatedAt||0);if(Number(current.masterUpdatedAt||0)>baseMaster){conflicts.push({type:'master',reason:'master_updated',serverMasterUpdatedAt:current.masterUpdatedAt});}else{if(Array.isArray(data.vehicles))current.vehicles=data.vehicles.map(v=>({id:String(v&&v.id||''),detail:String(v&&v.detail||'2t'),memo:String(v&&v.memo||'')})).filter(v=>v.id);if(Array.isArray(data.people))current.people=data.people.map(String).filter(Boolean);current.masterUpdatedAt=Math.max(now,Number(current.masterUpdatedAt||0)+1);masterAccepted=true;}}
    current.events=[...byId.values()];current.lastUpdated=now;current.revision=Number(current.revision||0)+1;current.hasData=!!(current.events.length||current.vehicles.length||current.people.length);current.saveToken=String(data.clientId||'')+'_'+String(current.revision);
    writeRaw_(current);
    return {ok:true,hasData:true,lastUpdated:current.lastUpdated,revision:current.revision,saveToken:current.saveToken,eventCount:current.events.length,vehicleCount:current.vehicles.length,peopleCount:current.people.length,acceptedIds,deletedIds,masterAccepted,conflicts,state:current};
  }finally{lock.releaseLock();}
}
function writeLegacyState_(data){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{const current=readState_(true),now=Date.now(),incoming=Array.isArray(data.events)?data.events.map(normalizeEventLegacy_):[],deleted=new Set((Array.isArray(data.deletedIds)?data.deletedIds:[]).map(String)),map=new Map(current.events.map(e=>[String(e.id),e]));incoming.forEach(e=>{if(!deleted.has(String(e.id)))map.set(String(e.id),e);});deleted.forEach(id=>{map.delete(id);current.deleted[id]={updatedAt:now,deletedBy:String(data.clientId||'legacy')};});current.events=[...map.values()];if(Array.isArray(data.vehicles)&&data.vehicles.length)current.vehicles=data.vehicles;if(Array.isArray(data.people)&&data.people.length)current.people=data.people;current.lastUpdated=now;current.revision=Number(current.revision||0)+1;current.hasData=!!(current.events.length||current.vehicles.length||current.people.length);current.saveToken=String(data.saveToken||'');writeRaw_(current);return {ok:true,hasData:true,lastUpdated:current.lastUpdated,revision:current.revision,saveToken:current.saveToken,eventCount:current.events.length,vehicleCount:current.vehicles.length,peopleCount:current.people.length};}finally{lock.releaseLock();}
}
function normalizeEventLegacy_(e){const x=Object.assign({},e||{});if(!Array.isArray(x.vehicles))x.vehicles=x.vehicle?[x.vehicle]:[];if(!Array.isArray(x.people))x.people=x.person?[x.person]:[];if(x.kind==='work')x.kind='confirmed';if(!x.endDate)x.endDate=x.date||'';return x;}
function getSharedState(){return readState_(false);}
function saveSharedState(data){try{return data&&data.action==='patch'?applyPatch_(data):writeLegacyState_(data||{});}catch(err){return {ok:false,error:String(err&&err.message||err)};}}
