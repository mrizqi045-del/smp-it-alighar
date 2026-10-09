// ============================================================
// SholatService.gs — Input & Query Laporan Sholat
// ============================================================

var SholatService = (function () {

  var SHEET_NAME = 'laporan_sholat';
  var STATUS_VALID = ['sholat', 'tidak_sholat', 'haid'];

  function getSheet() {
    return getSpreadsheet().getSheetByName(SHEET_NAME);
  }

  function getAllRows() {
    var sheet   = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    return data.filter(function (r) { return r[0] !== ''; }).map(rowToObj);
  }

  function rowToObj(row) {
    var tz = SettingService.getTimezoneId();
    var tgl = '';
    try { tgl = Utilities.formatDate(new Date(row[2]), tz, 'yyyy-MM-dd'); } catch(e) { tgl = String(row[2]); }
    var dilapAt = '';
    try { if (row[5]) dilapAt = Utilities.formatDate(new Date(row[5]), tz, 'HH:mm'); } catch(e) { dilapAt = ''; }
    return {
      id:           row[0],
      siswa_id:     row[1],
      tanggal:      tgl,
      waktu_sholat: row[3],
      status:       row[4],
      dilaporkan_at: dilapAt
    };
  }

  function nextId() {
    var rows = getAllRows();
    if (rows.length === 0) return 1;
    var maxId = Math.max.apply(null, rows.map(function (r) { return Number(r.id) || 0; }));
    return maxId + 1;
  }

  function findRowByKey(siswaId, tanggalStr, waktu) {
    var sheet   = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0]) continue;
      var tgl = Utilities.formatDate(new Date(data[i][2]), 'Asia/Jakarta', 'yyyy-MM-dd');
      if (data[i][1] == siswaId && tgl === tanggalStr && data[i][3] === waktu) {
        return i + 2;
      }
    }
    return -1;
  }

  // ── Form Hari Ini ──────────────────────────────────────────

  function getFormHariIni(session) {
    if (session.role !== 'siswa') return { ok: false, msg: 'Hanya siswa yang bisa lapor sholat.' };

    var timezoneId  = SettingService.getTimezoneId();
    var now         = new Date();
    var today       = Utilities.formatDate(now, timezoneId, 'yyyy-MM-dd');
    var nowTime     = Utilities.formatDate(now, timezoneId, 'HH:mm');
    var waktuInfo   = SettingService.getWaktuWajib(today);
    var user        = UserService.findById(session.user_id);
    var isPerempuan = (user && user.jenis_kelamin === 'P') || (session && session.jenis_kelamin === 'P');
    var lokasi      = SettingService.getSettingLokasi();
    var jadwal      = SettingService.getJadwalHariIni(today);

    // Ambil laporan siswa hari ini beserta jam pelaporan
    var rows           = getAllRows();
    var laporanHariIni = {};
    rows.forEach(function (r) {
      if (String(r.siswa_id) === String(session.user_id) && r.tanggal === today) {
        var jamLapor = '';
        if (r.dilaporkan_at) {
          try {
            jamLapor = Utilities.formatDate(new Date(r.dilaporkan_at), timezoneId, 'HH:mm');
          } catch (e) {
            jamLapor = String(r.dilaporkan_at);
          }
        }
        laporanHariIni[r.waktu_sholat] = {
          status:        r.status,
          dilaporkan_at: jamLapor
        };
      }
    });

    // Susun form dengan status jendela waktu & timestamp
    var formItems = waktuInfo.waktu_wajib.map(function (waktu) {
      var lapor        = laporanHariIni[waktu];
      var windowStatus = SettingService.evaluasiWindowSholat(waktu, nowTime, jadwal);

      var terlambat = false;
      if (lapor && lapor.status === 'sholat' && lapor.dilaporkan_at && jadwal[waktu]) {
        try {
          var pM = jadwal[waktu].split(':');
          var pL = lapor.dilaporkan_at.split(':');
          var mM = parseInt(pM[0], 10) * 60 + parseInt(pM[1], 10);
          var mL = parseInt(pL[0], 10) * 60 + parseInt(pL[1], 10);
          var diff = mL - mM;
          if (diff < 0) diff += 24 * 60;
          terlambat = diff > 30;
        } catch (e) {}
      }

      return {
        waktu:         waktu,
        label:         capitalize(waktu),
        sudah_lapor:   Boolean(lapor),
        status:        lapor ? lapor.status : null,
        dilaporkan_at: lapor ? lapor.dilaporkan_at : null,
        terlambat:     terlambat,
        boleh_haid:    isPerempuan,
        can_lapor:     !lapor && windowStatus.can_lapor,
        window_status: lapor ? 'sudah_lapor' : windowStatus.status, // 'belum_mulai' | 'aktif' | 'lewat' | 'sudah_lapor'
        window_msg:    windowStatus.msg,
        jam_mulai:     windowStatus.mulai,
        jam_selesai:   windowStatus.selesai
      };
    });

    return {
      ok: true,
      data: {
        tanggal:    today,
        tipe_hari:  waktuInfo.tipe_hari,
        now_time:   nowTime,
        zona_waktu: lokasi.zona_waktu,
        nama_kota:  lokasi.nama_kota,
        jadwal:     jadwal,
        form:       formItems
      }
    };
  }

  // ── Lapor Sholat ───────────────────────────────────────────

  function laporSholat(session, data) {
    if (session.role !== 'siswa') return { ok: false, msg: 'Hanya siswa yang bisa lapor sholat.' };
    if (!data.waktu_sholat || !data.status) {
      return { ok: false, msg: 'Waktu sholat dan status wajib diisi.' };
    }

    var timezoneId = SettingService.getTimezoneId();
    var now        = new Date();
    var today      = Utilities.formatDate(now, timezoneId, 'yyyy-MM-dd');
    var nowTime    = Utilities.formatDate(now, timezoneId, 'HH:mm');
    var waktu      = String(data.waktu_sholat).toLowerCase();
    var status     = String(data.status).toLowerCase();

    // 1. Validasi waktu wajib hari ini
    var waktuInfo = SettingService.getWaktuWajib(today);
    if (!waktuInfo.waktu_wajib.includes(waktu)) {
      return { ok: false, msg: 'Waktu sholat ' + waktu + ' tidak wajib dilaporkan hari ini.' };
    }

    // 2. Validasi status
    if (!STATUS_VALID.includes(status)) {
      return { ok: false, msg: 'Status tidak valid.' };
    }

    // 3. Haid hanya untuk perempuan
    if (status === 'haid') {
      var user = UserService.findById(session.user_id);
      if (user.jenis_kelamin !== 'P') {
        return { ok: false, msg: 'Opsi haid hanya untuk siswa perempuan.' };
      }
    }

    // 4. KUNCI LAPORAN: Tidak bisa diedit kembali jika sudah lapor!
    var rowNum = findRowByKey(session.user_id, today, waktu);
    if (rowNum !== -1) {
      return { ok: false, msg: 'Laporan sholat sudah pernah dikirim dan tidak dapat diubah kembali.' };
    }

    // 5. BATAS WAKTU: Hanya bisa lapor saat waktu sholat tiba s/d waktu sholat berikutnya
    var jadwal       = SettingService.getJadwalHariIni(today);
    var windowStatus = SettingService.evaluasiWindowSholat(waktu, nowTime, jadwal);
    if (!windowStatus.can_lapor) {
      return { ok: false, msg: windowStatus.msg };
    }

    // 6. Simpan laporan baru dengan timestamp pelaporan
    var id    = nextId();
    var sheet = getSheet();
    sheet.appendRow([id, session.user_id, new Date(today + 'T00:00:00'), waktu, status, now]);
    return { ok: true, msg: 'Laporan sholat ' + capitalize(waktu) + ' berhasil disimpan.' };
  }

  // ── Riwayat Siswa (untuk siswa lihat sendiri) ──────────────

  function getRiwayat(session, data) {
    if (session.role !== 'siswa') return { ok: false, msg: 'Akses ditolak.' };

    var rows    = getAllRows();
    var minggu  = data.minggu || 0; // 0 = minggu ini, -1 = minggu lalu, dst
    var range   = getMingguRange(minggu);

    var riwayat = rows.filter(function (r) {
      return r.siswa_id == session.user_id &&
             r.tanggal >= range.start &&
             r.tanggal <= range.end;
    });

    return { ok: true, data: riwayat, range: range };
  }

  // ── Helpers ────────────────────────────────────────────────

  function getMingguRange(offsetMinggu) {
    // offsetMinggu: 0 = ini, -1 = lalu, dll
    var now    = new Date();
    var day    = now.getDay(); // 0=Minggu
    // Awal minggu = Senin
    var senin  = new Date(now);
    senin.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offsetMinggu * 7));
    var ahad   = new Date(senin);
    ahad.setDate(senin.getDate() + 6);

    return {
      start: Utilities.formatDate(senin, 'Asia/Jakarta', 'yyyy-MM-dd'),
      end:   Utilities.formatDate(ahad, 'Asia/Jakarta', 'yyyy-MM-dd')
    };
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ── Query untuk Dashboard (dipanggil DashboardService) ─────

  function getLaporanByRange(startDate, endDate, siswaIds) {
    var rows = getAllRows();
    return rows.filter(function (r) {
      return r.tanggal >= startDate &&
             r.tanggal <= endDate &&
             (!siswaIds || siswaIds.includes(String(r.siswa_id)));
    });
  }

  return {
    getFormHariIni:     getFormHariIni,
    laporSholat:        laporSholat,
    getRiwayat:         getRiwayat,
    getLaporanByRange:  getLaporanByRange,
    getMingguRange:     getMingguRange
  };

})();
