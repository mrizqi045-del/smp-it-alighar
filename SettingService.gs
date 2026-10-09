// ============================================================
// SettingService.gs — Setting Waktu Sholat & Kalender Hari
// ============================================================

var SettingService = (function () {

  var SHEET_SETTING   = 'setting_sholat';
  var SHEET_KALENDER  = 'kalender_hari';
  var WAKTU_SHOLAT    = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

  // ── Sheet Helpers ──────────────────────────────────────────

  function getSettingSheet() {
    return getSpreadsheet().getSheetByName(SHEET_SETTING);
  }
  function getKalenderSheet() {
    return getSpreadsheet().getSheetByName(SHEET_KALENDER);
  }

  // ── Setting Sholat ─────────────────────────────────────────
  // Sheet: tipe_hari | waktu_sholat | wajib_lapor
  //   hari_sekolah | subuh    | TRUE
  //   hari_sekolah | dzuhur   | FALSE
  //   ...

  function getSetting(session) {
    var sheet   = getSettingSheet();
    var lastRow = sheet.getLastRow();
    var result  = { hari_sekolah: {}, hari_libur: {} };

    // Default semua TRUE dulu
    ['hari_sekolah', 'hari_libur'].forEach(function (tipe) {
      WAKTU_SHOLAT.forEach(function (w) {
        result[tipe][w] = true;
      });
    });

    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      data.forEach(function (row) {
        var tipe  = row[0];
        var waktu = row[1];
        var wajib = row[2] === true || row[2] === 'TRUE' || row[2] === 1;
        if (result[tipe] !== undefined && WAKTU_SHOLAT.includes(waktu)) {
          result[tipe][waktu] = wajib;
        }
      });
    }

    var lokasi = getSettingLokasi();
    result.lokasi = lokasi;

    return { ok: true, data: result };
  }

  function updateSetting(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    // data = { hari_sekolah: {subuh: true, dzuhur: false, ...}, hari_libur: {...} }
    if (!data.hari_sekolah || !data.hari_libur) {
      return { ok: false, msg: 'Data setting tidak lengkap.' };
    }

    var sheet = getSettingSheet();
    // Hapus semua data (kecuali header)
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.deleteRows(2, lastRow - 1);
    }

    // Tulis ulang
    var rows = [];
    ['hari_sekolah', 'hari_libur'].forEach(function (tipe) {
      WAKTU_SHOLAT.forEach(function (waktu) {
        var wajib = data[tipe][waktu] === true || data[tipe][waktu] === 'true';
        rows.push([tipe, waktu, wajib]);
      });
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }

    // Simpan lokasi jika disertakan
    if (data.lokasi) {
      saveSettingLokasi(session, data.lokasi);
    }

    return { ok: true, msg: 'Setting berhasil disimpan.' };
  }

  // ── Lokasi, Zona Waktu (WIB/WITA/WIT), & Jadwal Sholat Kemenag ──

  var DEFAULT_JADWAL = {
    subuh:   '03:57',
    dzuhur:  '11:19',
    ashar:   '14:25',
    maghrib: '17:23',
    isya:    '18:32'
  };

  function getTimezoneId() {
    var props = PropertiesService.getScriptProperties();
    var zona  = props.getProperty('SMP_ZONA_WAKTU') || 'WIB';
    if (zona === 'WIT')  return 'Asia/Jayapura';
    if (zona === 'WITA') return 'Asia/Makassar';
    return 'Asia/Jakarta'; // default WIB (Kalimantan Tengah / Kotawaringin Timur = WIB)
  }

  function getSettingLokasi() {
    var props    = PropertiesService.getScriptProperties();
    var kotaId   = props.getProperty('SMP_KOTA_ID')   || '2208';
    var namaKota = props.getProperty('SMP_NAMA_KOTA') || 'KAB. KOTAWARINGIN TIMUR';
    var zona     = props.getProperty('SMP_ZONA_WAKTU');
    // Kotawaringin Timur / Kalimantan Tengah adalah WIB
    if (!zona || zona === 'WITA' || kotaId === '2208') {
      zona = 'WIB';
      props.setProperty('SMP_ZONA_WAKTU', 'WIB');
    }

    var jadwalStr = props.getProperty('SMP_JADWAL_SHOLAT');
    var jadwal = DEFAULT_JADWAL;
    if (jadwalStr) {
      try { jadwal = JSON.parse(jadwalStr); } catch (e) {}
    }
    return {
      zona_waktu: zona,
      kota_id:    kotaId,
      nama_kota:  namaKota,
      jadwal:     jadwal
    };
  }

  function saveSettingLokasi(session, data) {
    if (session && !['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    var props = PropertiesService.getScriptProperties();
    // Default WIB (Kotawaringin Timur = WIB)
    var zona = data.zona_waktu || 'WIB';
    props.setProperty('SMP_ZONA_WAKTU', zona);
    if (data.kota_id)    props.setProperty('SMP_KOTA_ID', String(data.kota_id));
    if (data.nama_kota)  props.setProperty('SMP_NAMA_KOTA', String(data.nama_kota));
    if (data.jadwal) {
      props.setProperty('SMP_JADWAL_SHOLAT', JSON.stringify(data.jadwal));
    }
    return { ok: true, msg: 'Pengaturan lokasi & waktu sholat berhasil disimpan.' };
  }

  function getDaftarKota(session) {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('daftar_kota_indonesia');
    if (cached) {
      try { return { ok: true, data: JSON.parse(cached) }; } catch (e) {}
    }

    try {
      var res = UrlFetchApp.fetch('https://api.myquran.com/v2/sholat/kota/semua', { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        var json = JSON.parse(res.getContentText());
        if (json.status && json.data) {
          cache.put('daftar_kota_indonesia', JSON.stringify(json.data), 21600);
          return { ok: true, data: json.data };
        }
      }
    } catch (e) {
      Logger.log('getDaftarKota error: ' + e.message);
    }

    // Fallback kota-kota utama jika fetch gagal
    var fallback = [
      { id: "1301", lokasi: "KOTA JAKARTA" },
      { id: "1219", lokasi: "KOTA BANDUNG" },
      { id: "1433", lokasi: "KOTA SEMARANG" },
      { id: "1505", lokasi: "KOTA YOGYAKARTA" },
      { id: "1638", lokasi: "KOTA SURABAYA" },
      { id: "0228", lokasi: "KOTA MEDAN" },
      { id: "0314", lokasi: "KOTA PADANG" },
      { id: "0816", lokasi: "KOTA PALEMBANG" },
      { id: "1709", lokasi: "KOTA DENPASAR" },
      { id: "2622", lokasi: "KOTA MAKASSAR" },
      { id: "2113", lokasi: "KOTA BANJARMASIN" },
      { id: "2013", lokasi: "KOTA PONTIANAK" },
      { id: "3329", lokasi: "KOTA JAYAPURA" }
    ];
    return { ok: true, data: fallback };
  }

  function fetchJadwalKota(session, data) {
    if (!data.kota_id) return { ok: false, msg: 'ID Kota wajib diisi.' };
    var timezoneId = getTimezoneId();
    var now = new Date();
    var yyyy = Utilities.formatDate(now, timezoneId, 'yyyy');
    var mm   = Utilities.formatDate(now, timezoneId, 'MM');
    var dd   = Utilities.formatDate(now, timezoneId, 'dd');

    var url = 'https://api.myquran.com/v2/sholat/jadwal/' + data.kota_id + '/' + yyyy + '/' + mm + '/' + dd;
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() === 200) {
        var json = JSON.parse(res.getContentText());
        if (json.status && json.data && json.data.jadwal) {
          var j = json.data.jadwal;
          var extracted = {
            subuh:   j.subuh,
            dzuhur:  j.dzuhur,
            ashar:   j.ashar,
            maghrib: j.maghrib,
            isya:    j.isya
          };
          return { ok: true, data: extracted, lokasi: json.data.lokasi };
        }
      }
    } catch (e) {
      return { ok: false, msg: 'Gagal mengambil jadwal: ' + e.message };
    }
    return { ok: false, msg: 'Jadwal tidak ditemukan dari server Kemenag.' };
  }

  function getJadwalHariIni(tanggalStr) {
    var lokasi = getSettingLokasi();
    var jadwal = lokasi.jadwal || DEFAULT_JADWAL;
    return {
      subuh:   jadwal.subuh   || DEFAULT_JADWAL.subuh,
      dzuhur:  jadwal.dzuhur  || DEFAULT_JADWAL.dzuhur,
      ashar:   jadwal.ashar   || DEFAULT_JADWAL.ashar,
      maghrib: jadwal.maghrib || DEFAULT_JADWAL.maghrib,
      isya:    jadwal.isya    || DEFAULT_JADWAL.isya
    };
  }

  // Evaluasi jendela waktu pelaporan sholat
  // Aturan: waktu sholat aktif dari waktu masuknya sampai masuk waktu sholat berikutnya
  function evaluasiWindowSholat(waktu, nowTimeStr, jadwal) {
    var j = jadwal || DEFAULT_JADWAL;
    var w = waktu.toLowerCase();

    // Definisikan waktu mulai dan waktu selesai (sholat berikutnya)
    var mulai = '';
    var selesai = '';

    if (w === 'subuh') {
      mulai   = j.subuh;
      selesai = j.dzuhur;
      if (nowTimeStr < mulai) {
        return { can_lapor: false, status: 'belum_mulai', msg: 'Belum masuk waktu (Mulai ' + mulai + ')', mulai: mulai, selesai: selesai };
      } else if (nowTimeStr >= selesai) {
        return { can_lapor: false, status: 'lewat', msg: 'Waktu sholat sudah lewat (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      } else {
        return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat dibuka (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      }
    } else if (w === 'dzuhur') {
      mulai   = j.dzuhur;
      selesai = j.ashar;
      if (nowTimeStr < mulai) {
        return { can_lapor: false, status: 'belum_mulai', msg: 'Belum masuk waktu (Mulai ' + mulai + ')', mulai: mulai, selesai: selesai };
      } else if (nowTimeStr >= selesai) {
        return { can_lapor: false, status: 'lewat', msg: 'Waktu sholat sudah lewat (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      } else {
        return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat dibuka (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      }
    } else if (w === 'ashar') {
      mulai   = j.ashar;
      selesai = j.maghrib;
      if (nowTimeStr < mulai) {
        return { can_lapor: false, status: 'belum_mulai', msg: 'Belum masuk waktu (Mulai ' + mulai + ')', mulai: mulai, selesai: selesai };
      } else if (nowTimeStr >= selesai) {
        return { can_lapor: false, status: 'lewat', msg: 'Waktu sholat sudah lewat (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      } else {
        return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat dibuka (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      }
    } else if (w === 'maghrib') {
      mulai   = j.maghrib;
      selesai = j.isya;
      if (nowTimeStr < mulai) {
        return { can_lapor: false, status: 'belum_mulai', msg: 'Belum masuk waktu (Mulai ' + mulai + ')', mulai: mulai, selesai: selesai };
      } else if (nowTimeStr >= selesai) {
        return { can_lapor: false, status: 'lewat', msg: 'Waktu sholat sudah lewat (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      } else {
        return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat dibuka (Batas s/d ' + selesai + ')', mulai: mulai, selesai: selesai };
      }
    } else if (w === 'isya') {
      mulai   = j.isya;
      selesai = j.subuh; // Batas s/d subuh esok hari
      // Isya melewati tengah malam (misal 19:15 sampai 04:30)
      if (nowTimeStr >= mulai || nowTimeStr < selesai) {
        return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat dibuka (Batas s/d Subuh ' + selesai + ')', mulai: mulai, selesai: selesai };
      } else {
        return { can_lapor: false, status: 'belum_mulai', msg: 'Belum masuk waktu (Mulai ' + mulai + ')', mulai: mulai, selesai: selesai };
      }
    }

    return { can_lapor: true, status: 'aktif', msg: 'Waktu dibuka', mulai: '', selesai: '' };
  }

  // ── Kalender Hari ──────────────────────────────────────────
  // Sheet: tanggal | tipe_hari | keterangan

  function getKalender(session) {
    var sheet   = getKalenderSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, data: [] };

    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var result = data
      .filter(function (row) { return row[0] !== ''; })
      .map(function (row) {
        var tgl = row[0];
        return {
          tanggal:     Utilities.formatDate(new Date(tgl), 'Asia/Jakarta', 'yyyy-MM-dd'),
          tipe_hari:   row[1],
          keterangan:  row[2]
        };
      });

    return { ok: true, data: result };
  }

  function saveKalender(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    var startStr = data.tanggal_mulai || data.tanggal;
    var endStr   = data.tanggal_selesai || startStr;
    if (!startStr || !data.tipe_hari) {
      return { ok: false, msg: 'Tanggal dan tipe hari wajib diisi.' };
    }

    var sheet   = getKalenderSheet();
    var lastRow = sheet.getLastRow();

    var cur = new Date(startStr + 'T00:00:00');
    var end = new Date(endStr   + 'T00:00:00');
    if (end < cur) end = cur;

    // Ambil data tanggal yang sudah ada untuk update
    var existingMap = {};
    if (lastRow >= 2) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0]) {
          var t = Utilities.formatDate(new Date(rows[i][0]), 'Asia/Jakarta', 'yyyy-MM-dd');
          existingMap[t] = i + 2;
        }
      }
    }

    var newRows = [];
    while (cur <= end) {
      var tglStr = Utilities.formatDate(cur, 'Asia/Jakarta', 'yyyy-MM-dd');
      if (existingMap[tglStr]) {
        sheet.getRange(existingMap[tglStr], 2, 1, 2).setValues([[data.tipe_hari, data.keterangan || '']]);
      } else {
        newRows.push([new Date(tglStr + 'T00:00:00'), data.tipe_hari, data.keterangan || '']);
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 3).setValues(newRows);
    }

    return { ok: true, msg: 'Tanggal khusus berhasil disimpan.' };
  }

  function deleteKalender(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.tanggal) return { ok: false, msg: 'Tanggal wajib diisi.' };

    var sheet   = getKalenderSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, msg: 'Data tidak ditemukan.' };

    var tanggals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < tanggals.length; i++) {
      var existTgl = Utilities.formatDate(new Date(tanggals[i][0]), 'Asia/Jakarta', 'yyyy-MM-dd');
      if (existTgl === data.tanggal) {
        sheet.deleteRow(i + 2);
        return { ok: true, msg: 'Kalender dihapus.' };
      }
    }
    return { ok: false, msg: 'Tanggal tidak ditemukan.' };
  }

  // ── Public: Tentukan tipe hari untuk tanggal tertentu ──────

  function getTipeHari(tanggalStr) {
    // tanggalStr: 'yyyy-MM-dd'
    var sheet   = getKalenderSheet();
    var lastRow = sheet.getLastRow();

    // 1. Cek override di kalender_hari
    if (lastRow >= 2) {
      var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < data.length; i++) {
        if (!data[i][0]) continue;
        var existTgl = Utilities.formatDate(new Date(data[i][0]), 'Asia/Jakarta', 'yyyy-MM-dd');
        if (existTgl === tanggalStr) {
          return data[i][1]; // 'hari_sekolah' atau 'hari_libur'
        }
      }
    }

    // 2. Default: Sabtu (6) & Minggu (0) = libur, Senin-Jumat (1-5) = sekolah
    var date      = new Date(tanggalStr + 'T12:00:00');
    var dayOfWeek = date.getDay(); // 0=Minggu, 1=Senin, ..., 6=Sabtu
    return (dayOfWeek === 0 || dayOfWeek === 6) ? 'hari_libur' : 'hari_sekolah';
  }

  // Ambil daftar waktu yang wajib dilaporkan untuk tanggal tertentu
  function getWaktuWajib(tanggalStr) {
    var tipeHari = getTipeHari(tanggalStr);
    var settingResult = getSetting(null);
    var setting = settingResult.data;
    var wajib = [];
    var date = new Date(tanggalStr + 'T12:00:00');
    var isJumat = (date.getDay() === 5);

    WAKTU_SHOLAT.forEach(function (w) {
      if (setting[tipeHari] && setting[tipeHari][w]) {
        wajib.push(w);
      } else if (isJumat && w === 'ashar') {
        // Hari Jumat: Ashar otomatis wajib dilaporkan
        wajib.push(w);
      }
    });
    return { tipe_hari: tipeHari, waktu_wajib: wajib };
  }

  return {
    getSetting:           getSetting,
    updateSetting:        updateSetting,
    getKalender:          getKalender,
    saveKalender:         saveKalender,
    deleteKalender:       deleteKalender,
    getTipeHari:          getTipeHari,
    getWaktuWajib:        getWaktuWajib,
    getTimezoneId:        getTimezoneId,
    getSettingLokasi:      getSettingLokasi,
    saveSettingLokasi:    saveSettingLokasi,
    getDaftarKota:        getDaftarKota,
    fetchJadwalKota:      fetchJadwalKota,
    getJadwalHariIni:     getJadwalHariIni,
    evaluasiWindowSholat: evaluasiWindowSholat,
    WAKTU_SHOLAT:         WAKTU_SHOLAT
  };

})();
