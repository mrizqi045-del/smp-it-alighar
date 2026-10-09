// ============================================================
// Code.gs — Router utama SMP ISLAM TERPADU ALIGHAR
// ============================================================

var SPREADSHEET_ID = '1gjiu5VjIH9SyQsb2FgPHFH0wg8rNM5FpGrJ3iCpid-M';

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// ── Entry Points ────────────────────────────────────────────

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('SMP ISLAM TERPADU ALIGHAR')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = (e.parameter && e.parameter.payload) 
              ? e.parameter.payload 
              : (e.postData ? e.postData.contents : '{}');
    var payload = JSON.parse(raw);
    var res = processAction(payload);
    return respond(res);
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return respond({ ok: false, msg: 'Server error: ' + err.message });
  }
}

function handleRequest(payloadStr) {
  try {
    var payload = JSON.parse(payloadStr);
    return processAction(payload);
  } catch (err) {
    Logger.log('handleRequest error: ' + err.message);
    return { ok: false, msg: 'Server error: ' + err.message };
  }
}

function processAction(payload) {
  var action  = payload.action;
  var data    = payload.data || {};
  var token   = payload.token || null;
  var session = AuthService.getSession(token);

  // Route tanpa auth
  if (action === 'login') return AuthService.login(data);

  // Butuh auth
  if (!session) return { ok: false, msg: 'Sesi habis. Silakan login ulang.' };

  if (action === 'logout')          return AuthService.logout();
  if (action === 'gantiPassword')   return AuthService.gantiPassword(session, data);

  if (action === 'getUsers')        return UserService.getUsers(session);
  if (action === 'createUser')      return UserService.createUser(session, data);
  if (action === 'updateUser')      return UserService.updateUser(session, data);
  if (action === 'deleteUser')      return UserService.deleteUser(session, data);
  if (action === 'resetPassword')   return UserService.resetPassword(session, data);

  if (action === 'getKelas')        return KelasService.getKelas(session);
  if (action === 'createKelas')     return KelasService.createKelas(session, data);
  if (action === 'updateKelas')     return KelasService.updateKelas(session, data);
  if (action === 'deleteKelas')     return KelasService.deleteKelas(session, data);

  if (action === 'getSetting')        return SettingService.getSetting(session);
  if (action === 'updateSetting')     return SettingService.updateSetting(session, data);
  if (action === 'getKalender')       return SettingService.getKalender(session);
  if (action === 'saveKalender')      return SettingService.saveKalender(session, data);
  if (action === 'deleteKalender')    return SettingService.deleteKalender(session, data);
  if (action === 'getDaftarKota')     return SettingService.getDaftarKota(session);
  if (action === 'fetchJadwalKota')   return SettingService.fetchJadwalKota(session, data);
  if (action === 'saveSettingLokasi') return SettingService.saveSettingLokasi(session, data);

  if (action === 'getFormHariIni')  return SholatService.getFormHariIni(session);
  if (action === 'laporSholat')     return SholatService.laporSholat(session, data);
  if (action === 'getRiwayat')      return SholatService.getRiwayat(session, data);

  if (action === 'getDashboard')    return DashboardService.getDashboard(session, data);
  if (action === 'getRekapKelas')   return DashboardService.getRekapKelas(session, data);

  return { ok: false, msg: 'Action tidak dikenal: ' + action };
}
