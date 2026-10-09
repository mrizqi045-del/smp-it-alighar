// ============================================================
// DashboardService.gs — Rekap & Agregasi Data Sholat
// ============================================================

var DashboardService = (function () {

  var ROLES_SEMUA = ['superadmin', 'admin', 'kepala_sekolah'];

  // ── Dashboard Utama ────────────────────────────────────────
  // Dipanggil saat user login — return data sesuai role

  function getDashboard(session, data) {
    var minggu = (data && data.minggu !== undefined) ? Number(data.minggu) : 0;

    if (session.role === 'siswa') {
      return getDashboardSiswa(session, minggu);
    } else if (session.role === 'walikelas') {
      return getDashboardWalikelas(session, minggu);
    } else if (ROLES_SEMUA.includes(session.role)) {
      return getDashboardAdmin(session, minggu);
    }
    return { ok: false, msg: 'Role tidak dikenal.' };
  }

  // ── Dashboard Siswa ────────────────────────────────────────

  function getDashboardSiswa(session, offsetMinggu) {
    var range    = SholatService.getMingguRange(offsetMinggu);
    var laporan  = SholatService.getLaporanByRange(range.start, range.end, [String(session.user_id)]);
    var rekap    = hitungRekap(laporan, range.start, range.end, session.user_id);

    return {
      ok:    true,
      role:  'siswa',
      range: range,
      rekap: rekap
    };
  }

  // ── Dashboard Walikelas ────────────────────────────────────

  function getDashboardWalikelas(session, offsetMinggu) {
    var kelasId = session.kelas_id;
    // Fallback: jika kelas_id tidak ada di session, cari kelas yang diampu walikelas ini
    if (!kelasId) {
      var semuaKelas = KelasService.getAllRows();
      for (var i = 0; i < semuaKelas.length; i++) {
        if (String(semuaKelas[i].walikelas_id) === String(session.user_id)) {
          kelasId = semuaKelas[i].id;
          break;
        }
      }
    }

    if (!kelasId) {
      return { ok: false, msg: 'Wali kelas belum di-assign ke kelas manapun.' };
    }

    var range  = SholatService.getMingguRange(offsetMinggu);
    var result = getRekapSatuKelas(kelasId, range.start, range.end);

    return {
      ok:       true,
      role:     'walikelas',
      range:    range,
      kelas:    result.kelas,
      siswa:    result.siswa,
      summary:  result.summary
    };
  }

  // ── Dashboard Admin / Kepsek / Superadmin ─────────────────

  function getDashboardAdmin(session, offsetMinggu) {
    var range       = SholatService.getMingguRange(offsetMinggu);
    var semuaKelas  = KelasService.getAllRows();
    var hasil       = [];

    semuaKelas.forEach(function (kelas) {
      var r = getRekapSatuKelas(kelas.id, range.start, range.end);
      hasil.push({
        kelas:   r.kelas,
        summary: r.summary
      });
    });

    return {
      ok:     true,
      role:   session.role,
      range:  range,
      kelas:  hasil
    };
  }

  // ── Rekap Per Kelas ────────────────────────────────────────

  function getRekapKelas(session, data) {
    if (!data.kelas_id) return { ok: false, msg: 'kelas_id wajib diisi.' };

    var minggu = (data.minggu !== undefined) ? Number(data.minggu) : 0;
    var range  = SholatService.getMingguRange(minggu);
    var result = getRekapSatuKelas(data.kelas_id, range.start, range.end);

    return { ok: true, range: range, kelas: result.kelas, siswa: result.siswa, summary: result.summary };
  }

  // ── Core: Rekap Satu Kelas ─────────────────────────────────

  function getRekapSatuKelas(kelasId, startDate, endDate) {
    var kelas     = KelasService.findById(kelasId);
    // Jika tidak ketemu by id, coba cari by nama_kelas
    if (!kelas) {
      var semuaK = KelasService.getAllRows();
      for (var ki = 0; ki < semuaK.length; ki++) {
        if (String(semuaK[ki].nama_kelas) === String(kelasId)) {
          kelas = semuaK[ki];
          break;
        }
      }
    }

    var users     = UserService.getAllRows();
    var siswaList = users.filter(function (u) {
      if (u.role !== 'siswa' || !u.is_active) return false;
      // Cocokkan kelas_id baik dengan ID maupun nama kelas
      var matchId   = String(u.kelas_id) === String(kelasId);
      var matchNama = kelas && (String(u.kelas_id) === String(kelas.nama_kelas));
      var matchKid  = kelas && (String(u.kelas_id) === String(kelas.id));
      return matchId || matchNama || matchKid;
    });

    var siswaIds  = siswaList.map(function (s) { return String(s.id); });
    var laporan   = SholatService.getLaporanByRange(startDate, endDate, siswaIds);

    // Ambil waktu wajib per hari dalam range
    var waktuWajibPerHari = getWaktuWajibPerHariRange(startDate, endDate);

    var siswaRekap = siswaList.map(function (siswa) {
      return {
        id:            siswa.id,
        nama:          siswa.nama_lengkap,
        jenis_kelamin: siswa.jenis_kelamin,
        rekap:         hitungRekapSiswa(laporan, waktuWajibPerHari, siswa.id, startDate, endDate)
      };
    });

    // Summary kelas
    var totalSholat = 0, totalTepat = 0, totalTerlambat = 0, totalTidak = 0, totalHaid = 0, totalWajib = 0;
    siswaRekap.forEach(function (s) {
      totalSholat    += s.rekap.total_sholat;
      totalTepat     += s.rekap.total_tepat;
      totalTerlambat += s.rekap.total_terlambat;
      totalTidak     += s.rekap.total_tidak;
      totalHaid      += s.rekap.total_haid;
      totalWajib     += s.rekap.total_wajib;
    });

    return {
      kelas:   { id: kelas ? kelas.id : kelasId, nama_kelas: kelas ? kelas.nama_kelas : '?' },
      siswa:   siswaRekap,
      summary: {
        total_siswa:     siswaList.length,
        total_sholat:    totalSholat,
        total_tepat:     totalTepat,
        total_terlambat: totalTerlambat,
        total_tidak:     totalTidak,
        total_haid:      totalHaid,
        total_wajib:     totalWajib,
        persen:          totalWajib > 0 ? Math.round((totalSholat / Math.max(totalWajib - totalHaid, 1)) * 100) : 0
      }
    };
  }

  // ── Rekap Per Siswa (untuk dashboard siswa sendiri) ────────

  function hitungRekap(laporan, startDate, endDate, siswaId) {
    var waktuWajibPerHari = getWaktuWajibPerHariRange(startDate, endDate);
    return hitungRekapSiswa(laporan, waktuWajibPerHari, siswaId, startDate, endDate);
  }

  function hitungRekapSiswa(laporan, waktuWajibPerHari, siswaId, startDate, endDate) {
    // Index laporan siswa ini: key → { status, jam }
    // dilaporkan_at sudah berformat HH:mm dari SholatService.rowToObj
    var timezoneId   = SettingService.getTimezoneId();
    var lokasi       = SettingService.getSettingLokasi();
    var jadwal       = lokasi.jadwal || {};

    var laporanSiswa = {};
    laporan.forEach(function (r) {
      if (String(r.siswa_id) === String(siswaId)) {
        laporanSiswa[r.tanggal + '_' + r.waktu_sholat] = {
          status: r.status,
          jam:    r.dilaporkan_at || ''
        };
      }
    });

    var detail         = [];
    var totalSholat    = 0;
    var totalTepat     = 0;
    var totalTerlambat = 0;
    var totalTidak     = 0;
    var totalHaid      = 0;
    var totalWajib     = 0;

    // Helper cek terlambat (> 30 menit dari jam masuk waktu sholat)
    function cekTerlambat(waktu, jamLapor) {
      if (!jamLapor || !jadwal || !jadwal[waktu]) return false;
      try {
        var pMulai = jadwal[waktu].split(':');
        var pLapor = jamLapor.split(':');
        var mMulai = parseInt(pMulai[0], 10) * 60 + parseInt(pMulai[1], 10);
        var mLapor = parseInt(pLapor[0], 10) * 60 + parseInt(pLapor[1], 10);
        var diff = mLapor - mMulai;
        if (diff < 0) diff += 24 * 60; // lintas tengah malam (Isya)
        return diff > 30;
      } catch (e) {
        return false;
      }
    }

    // Iterasi tiap hari dalam range
    var cur = new Date(startDate + 'T00:00:00');
    var end = new Date(endDate   + 'T00:00:00');

    while (cur <= end) {
      var tgl    = Utilities.formatDate(cur, timezoneId, 'yyyy-MM-dd');
      var wajib  = waktuWajibPerHari[tgl] || [];
      var hariDetail = { tanggal: tgl, waktu: {} };

      wajib.forEach(function (w) {
        var key       = tgl + '_' + w;
        var entry     = laporanSiswa[key];
        var status    = entry ? entry.status : 'belum';
        var jam       = entry ? entry.jam    : null;
        var terlambat = (status === 'sholat') && cekTerlambat(w, jam);

        hariDetail.waktu[w] = { 
          status:    status, 
          jam:       jam, 
          terlambat: terlambat 
        };
        totalWajib++;
        if (status === 'sholat') {
          totalSholat++;
          if (terlambat) totalTerlambat++;
          else           totalTepat++;
        }
        else if (status === 'tidak_sholat') totalTidak++;
        else if (status === 'haid')         totalHaid++;
        else if (status === 'belum')        totalTidak++;
      });

      detail.push(hariDetail);
      cur.setDate(cur.getDate() + 1);
    }

    return {
      detail:          detail,
      total_sholat:    totalSholat,
      total_tepat:     totalTepat,
      total_terlambat: totalTerlambat,
      total_tidak:     totalTidak,
      total_haid:      totalHaid,
      total_wajib:     totalWajib,
      persen:          totalWajib > 0 ? Math.round((totalSholat / Math.max(totalWajib - totalHaid, 1)) * 100) : 0
    };
  }

  // ── Cache waktu wajib per hari dalam range ─────────────────

  function getWaktuWajibPerHariRange(startDate, endDate) {
    var map = {};
    var cur = new Date(startDate + 'T00:00:00');
    var end = new Date(endDate   + 'T00:00:00');
    while (cur <= end) {
      var tgl  = Utilities.formatDate(cur, 'Asia/Jakarta', 'yyyy-MM-dd');
      var info = SettingService.getWaktuWajib(tgl);
      map[tgl] = info.waktu_wajib;
      cur.setDate(cur.getDate() + 1);
    }
    return map;
  }

  return {
    getDashboard:  getDashboard,
    getRekapKelas: getRekapKelas
  };

})();
