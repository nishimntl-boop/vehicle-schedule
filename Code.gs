// 車両人員予定表：Google Apps Script 共有バックエンド v27
// スタンドアロンのApps Scriptでも動作するよう、対象スプレッドシートをIDで固定しています。

const SPREADSHEET_ID = '1KYmKn-zGJyLdrut_pjQ_QFVWH6BCIR_wNu910Hf2i80';
const SHEET_NAME = '予定表データ';
const LEGACY_SHEET_NAME = '予定データ';
const CHUNK_SIZE = 45000;

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.bridge === '1') {
      return HtmlService.createHtmlOutputFromFile('bridge')
        .setTitle('共有通信')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    if (e && e.parameter && e.parameter.api === '1') {
      const state = readState_();
      if (e.parameter.callback) return jsonp_(e.parameter.callback, state);
      return json_(state);
    }
    if (e && e.parameter && e.parameter.health === '1') {
      return json_({ok:true, spreadsheet:'connected'});
    }
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('車両人員予定表')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('<pre>起動エラー: ' +
      String(err && err.message || err).replace(/</g, '&lt;') +
      '</pre>');
  }
}

function doPost(e) {
  try {
    let raw = '';
    if (e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
    if (!raw && e && e.postData && e.postData.contents) raw = e.postData.contents;
    if (!raw) return json_({ok:false, error:'payloadがありません'});

    const data = JSON.parse(raw);
    if (data.action && data.action !== 'save') {
      return json_({ok:false, error:'未対応のactionです'});
    }
    return json_(writeState_(data));
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)});
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, obj) {
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput('invalid callback');
  }
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function defaultState_() {
  return {
    events: [],
    vehicles: [],
    people: [],
    logs: [],
    lastUpdated: 0,
    revision: 0,
    hasData: false,
    saveToken: ''
  };
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

function readRaw_(sh) {
  const lastRow = sh.getLastRow();
  if (!lastRow) return '';
  return sh.getRange(1, 1, lastRow, 1).getDisplayValues().map(r => r[0]).join('');
}

function readState_() {
  const ss = getSpreadsheet_();
  const sh = getSheet_();
  let raw = readRaw_(sh);

  // 新しい保存先が空なら、旧「予定データ」シートから読み込む。
  if (!raw) {
    const old = ss.getSheetByName(LEGACY_SHEET_NAME);
    if (old) raw = readRaw_(old);
  }

  if (!raw) return defaultState_();

  try {
    const d = JSON.parse(raw);
    const state = normalize_(d);
    state.hasData = !!(state.events.length || state.vehicles.length || state.people.length);
    return state;
  } catch (err) {
    return defaultState_();
  }
}

function normalize_(d) {
  const state = d || {};
  const vehicles = Array.isArray(state.vehicles) ? state.vehicles.map(v => {
    if (Array.isArray(v)) return {id:String(v[0] || ''), detail:String(v[1] || '2t'), memo:''};
    return {id:String(v && v.id || ''), detail:String(v && v.detail || '2t'), memo:String(v && v.memo || '')};
  }).filter(v => v.id) : [];

  const people = Array.isArray(state.people) ? state.people.map(p => {
    if (Array.isArray(p)) return String(p[0] || '');
    return String(p || '');
  }).filter(Boolean) : [];

  const events = Array.isArray(state.events) ? state.events.map(e => {
    const x = Object.assign({}, e || {});
    if (!Array.isArray(x.vehicles)) x.vehicles = x.vehicle ? [x.vehicle] : [];
    if (!Array.isArray(x.people)) x.people = x.person ? [x.person] : [];
    if (!x.vehicle) x.vehicle = x.vehicles[0] || '';
    if (!x.person) x.person = x.people[0] || '';
    if (!x.kind && x.status) x.kind = x.status === '確定' ? 'confirmed' : 'plan';
    if (x.kind === 'work') x.kind = 'confirmed';
    if (!x.start) x.start = '08:00';
    if (!x.end) x.end = '16:00';
    if (!x.endDate) x.endDate = x.date || '';
    return x;
  }) : [];

  return {
    events,
    vehicles,
    people,
    logs: Array.isArray(state.logs) ? state.logs : [],
    lastUpdated: Number(state.lastUpdated || 0),
    revision: Number(state.revision || 0),
    hasData: false,
    saveToken: String(state.saveToken || '')
  };
}

function writeState_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const current = readState_();
    const now = Date.now();
    const incomingEvents = Array.isArray(data.events) ? data.events : [];
    const deleted = new Set((Array.isArray(data.deletedIds) ? data.deletedIds : []).map(String));
    const incomingById = new Map(incomingEvents.map(e => [String(e.id), e]));
    const currentIds = new Set(current.events.map(e => String(e.id)));
    const mergedEvents = [];

    current.events.forEach(e => {
      const id = String(e.id);
      if (deleted.has(id)) return;
      mergedEvents.push(incomingById.has(id) ? incomingById.get(id) : e);
    });

    incomingEvents.forEach(e => {
      const id = String(e.id);
      if (!currentIds.has(id) && !deleted.has(id)) mergedEvents.push(e);
    });

    const next = {
      events: mergedEvents,
      vehicles: Array.isArray(data.vehicles) && data.vehicles.length ? data.vehicles : current.vehicles,
      people: Array.isArray(data.people) && data.people.length ? data.people : current.people,
      logs: Array.isArray(data.logs) ? data.logs : current.logs,
      lastUpdated: now,
      revision: Number(current.revision || 0) + 1,
      hasData: true,
      saveToken: String(data.saveToken || '')
    };

    const raw = JSON.stringify(next);
    const sh = getSheet_();
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), 1).clearContent();
    const rows = [];
    for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
      rows.push([raw.slice(i, i + CHUNK_SIZE)]);
    }
    sh.getRange(1, 1, rows.length, 1).setValues(rows);
    sh.setFrozenRows(0);

    return {ok:true, lastUpdated:next.lastUpdated, revision:next.revision, hasData:true, saveToken:next.saveToken, eventCount:next.events.length, vehicleCount:next.vehicles.length, peopleCount:next.people.length};
  } finally {
    lock.releaseLock();
  }
}


function bridgeGetState() {
  return readState_();
}

function bridgeSaveState(data) {
  try {
    return writeState_(data || {});
  } catch (err) {
    return {ok:false, error:String(err && err.message || err)};
  }
}
