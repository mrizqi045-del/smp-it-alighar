// ============================================================
// InitDb.gs — Setup struktur Sheets & seed superadmin
// ============================================================
// Jalankan fungsi initDatabase() SEKALI dari Apps Script Editor
// sebelum deploy sebagai Web App.

function initDatabase() {
  var ss = getSpreadsheet();
  Logger.log('Mulai inisialisasi database...');

  createSheetIfNotExists(ss, 'users', [
    'id', 'username', 'password_hash', 'role', 'nama_lengkap',
    'jenis_kelamin', 'kelas_id', 'is_active', 'created_at'
  ]);

  createSheetIfNotExists(ss, 'kelas', [
    'id', 'nama_kelas', 'walikelas_id', 'created_at'
  ]);

  createSheetIfNotExists(ss, 'laporan_sholat', [
    'id', 'siswa_id', 'tanggal', 'waktu_sholat', 'status', 'dilaporkan_at'
  ]);

  createSheetIfNotExists(ss, 'setting_sholat', [
    'tipe_hari', 'waktu_sholat', 'wajib_lapor'
  ]);

  createSheetIfNotExists(ss, 'kalender_hari', [
    'tanggal', 'tipe_hari', 'keterangan'
  ]);

  seedDefaultSetting(ss);
  seedSuperadmin(ss);

  Logger.log('Inisialisasi selesai!');
  SpreadsheetApp.getUi().alert('Database berhasil diinisialisasi!\nSuperadmin: admin / password123\nGanti password setelah login pertama!');
}

function createSheetIfNotExists(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // Format header
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1a73e8')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    Logger.log('Sheet ' + name + ' dibuat.');
  } else {
    Logger.log('Sheet ' + name + ' sudah ada, dilewati.');
  }
  return sheet;
}

function seedDefaultSetting(ss) {
  var sheet = ss.getSheetByName('setting_sholat');
  if (sheet.getLastRow() >= 2) {
    Logger.log('Setting sholat sudah ada, dilewati.');
    return;
  }

  var waktuList = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];
  var rows = [];

  // Hari sekolah: default dzuhur & ashar tidak wajib
  waktuList.forEach(function (w) {
    var wajib = !(w === 'dzuhur' || w === 'ashar'); // sekolah: dzuhur & ashar tidak wajib
    rows.push(['hari_sekolah', w, wajib]);
  });
  // Hari libur: semua wajib
  waktuList.forEach(function (w) {
    rows.push(['hari_libur', w, true]);
  });

  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  Logger.log('Setting sholat default ditambahkan.');
}

function seedSuperadmin(ss) {
  var sheet = ss.getSheetByName('users');
  if (sheet.getLastRow() >= 2) {
    Logger.log('Users sudah ada, superadmin tidak ditambahkan ulang.');
    return;
  }

  var passHash = AuthService.hashPassword('password123');
  sheet.appendRow([
    1,                    // id
    'admin',              // username
    passHash,             // password_hash
    'superadmin',         // role
    'Super Administrator', // nama_lengkap
    'L',                  // jenis_kelamin
    '',                   // kelas_id
    true,                 // is_active
    new Date()            // created_at
  ]);
  Logger.log('Superadmin dibuat: username=admin, password=password123');
}
