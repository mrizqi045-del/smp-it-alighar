// ============================================================
// lib/dashboardService.js — Rekap & Statistik Dashboard
// ============================================================

const db = require('./db');
const settingService = require('./settingService');
const sholatService = require('./sholatService');

async function getWaktuWajibPerHariRange(startDate, endDate) {
  const map = {};
  const cur = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate   + 'T12:00:00');
  while (cur <= end) {
    const tgl = cur.toISOString().split('T')[0];
    const info = await settingService.getWaktuWajib(tgl);
    map[tgl] = info.waktu_wajib;
    cur.setDate(cur.getDate() + 1);
  }
  return map;
}

function cekTerlambat(waktu, jamLapor, jadwal) {
  if (!jamLapor || !jadwal || !jadwal[waktu]) return false;
  try {
    const pMulai = jadwal[waktu].split(':');
    const pLapor = jamLapor.split(':');
    const mMulai = parseInt(pMulai[0], 10) * 60 + parseInt(pMulai[1], 10);
    const mLapor = parseInt(pLapor[0], 10) * 60 + parseInt(pLapor[1], 10);
    let diff = mLapor - mMulai;
    if (diff < 0) diff += 24 * 60;
    return diff > 30;
  } catch (e) {
    return false;
  }
}

function hitungRekapSiswa(laporan, waktuWajibPerHari, siswaId, startDate, endDate, jadwal) {
  const laporanSiswa = {};
  laporan.forEach(r => {
    if (String(r.siswa_id) === String(siswaId)) {
      laporanSiswa[`${r.tanggal}_${r.waktu_sholat}`] = {
        status: r.status,
        jam:    r.dilaporkan_at || ''
      };
    }
  });

  const detail         = [];
  let totalSholat    = 0;
  let totalTepat     = 0;
  let totalTerlambat = 0;
  let totalTidak     = 0;
  let totalHaid      = 0;
  let totalWajib     = 0;

  const cur = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate   + 'T12:00:00');

  while (cur <= end) {
    const tgl = cur.toISOString().split('T')[0];
    const wajib = waktuWajibPerHari[tgl] || [];
    const hariDetail = { tanggal: tgl, waktu: {} };

    wajib.forEach(w => {
      const key       = `${tgl}_${w}`;
      const entry     = laporanSiswa[key];
      const status    = entry ? entry.status : 'belum';
      const jam       = entry ? entry.jam    : null;
      const terlambat = (status === 'sholat') && cekTerlambat(w, jam, jadwal);

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
      } else if (status === 'tidak_sholat') {
        totalTidak++;
      } else if (status === 'haid') {
        totalHaid++;
      }
    });

    detail.push(hariDetail);
    cur.setDate(cur.getDate() + 1);
  }

  const denominator = Math.max(totalWajib - totalHaid, 1);
  const persen = totalWajib > 0 ? Math.round((totalSholat / denominator) * 100) : 0;

  return {
    total_wajib:     totalWajib,
    total_sholat:    totalSholat,
    total_tepat:     totalTepat,
    total_terlambat: totalTerlambat,
    total_tidak:     totalTidak,
    total_haid:      totalHaid,
    total_belum:     totalWajib - totalSholat - totalTidak - totalHaid,
    persen:          persen,
    detail:          detail
  };
}

async function getDashboard(session, params = {}) {
  const minggu = parseInt(params.minggu, 10) || 0;
  const range  = sholatService.getMingguRange(minggu);
  const role   = session.role;
  const lokasi = await settingService.getSettingLokasi();
  const jadwal = lokasi.jadwal || settingService.DEFAULT_JADWAL;

  // 1. SISWA
  if (role === 'siswa') {
    const laporan = await sholatService.getLaporanByRange(range.start, range.end, [session.user_id]);
    const waktuWajibPerHari = await getWaktuWajibPerHariRange(range.start, range.end);
    const rekap = hitungRekapSiswa(laporan, waktuWajibPerHari, session.user_id, range.start, range.end, jadwal);
    return { ok: true, data: { role: 'siswa', range: range, minggu: minggu, rekap: rekap } };
  }

  // 2. WALIKELAS
  if (role === 'walikelas') {
    const kelasRes = await db.query(
      'SELECT id, nama_kelas FROM kelas WHERE walikelas_id = $1 LIMIT 1',
      [String(session.user_id)]
    );
    if (kelasRes.rows.length === 0) {
      return { ok: true, data: { role: 'walikelas', range: range, minggu: minggu, kelas: null, rekap: null, msg: 'Anda belum ditugaskan sebagai wali kelas.' } };
    }
    const kelas = kelasRes.rows[0];
    const rekapKelas = await getRekapKelasInternal(kelas.id, range.start, range.end, jadwal);
    return { ok: true, data: { role: 'walikelas', range: range, minggu: minggu, kelas: kelas, rekap: rekapKelas } };
  }

  // 3. ADMIN / KEPALA SEKOLAH / SUPERADMIN
  if (['admin', 'superadmin', 'kepala_sekolah'].includes(role)) {
    const kelasListRes = await db.query('SELECT id, nama_kelas FROM kelas ORDER BY id ASC');
    const kelasList = kelasListRes.rows;

    let selectedKelasId = params.kelas_id || (kelasList[0] ? kelasList[0].id : null);
    let rekapDetail = null;

    if (selectedKelasId) {
      rekapDetail = await getRekapKelasInternal(selectedKelasId, range.start, range.end, jadwal);
    }

    const rekapPerKelas = await Promise.all(
      kelasList.map(async k => {
        const rk = await getRekapKelasInternal(k.id, range.start, range.end, jadwal);
        return {
          id:              k.id,
          nama_kelas:      k.nama_kelas,
          total_siswa:     rk.summary.total_siswa,
          persen:          rk.summary.persen,
          total_sholat:    rk.summary.total_sholat,
          total_tepat:     rk.summary.total_tepat,
          total_terlambat: rk.summary.total_terlambat,
          total_tidak:     rk.summary.total_tidak,
          total_haid:      rk.summary.total_haid
        };
      })
    );

    return {
      ok: true,
      data: {
        role:            role,
        range:           range,
        minggu:          minggu,
        kelas_list:      kelasList,
        selected_kelas:  selectedKelasId,
        rekap_kelas:     rekapPerKelas,
        rekap_detail:    rekapDetail
      }
    };
  }

  return { ok: false, msg: 'Role tidak dikenal.' };
}

async function getRekapKelas(session, params = {}) {
  if (!['superadmin', 'admin', 'kepala_sekolah', 'walikelas'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  const minggu = parseInt(params.minggu, 10) || 0;
  const range  = sholatService.getMingguRange(minggu);
  const lokasi = await settingService.getSettingLokasi();
  const jadwal = lokasi.jadwal || settingService.DEFAULT_JADWAL;

  let kelasId = params.kelas_id;
  if (session.role === 'walikelas') {
    const kRes = await db.query('SELECT id FROM kelas WHERE walikelas_id = $1 LIMIT 1', [String(session.user_id)]);
    if (kRes.rows.length === 0) return { ok: false, msg: 'Anda belum ditugaskan sebagai wali kelas.' };
    kelasId = kRes.rows[0].id;
  }

  if (!kelasId) return { ok: false, msg: 'Kelas ID wajib ditentukan.' };

  const res = await getRekapKelasInternal(kelasId, range.start, range.end, jadwal);
  return { ok: true, data: res, range: range, minggu: minggu };
}

async function getRekapKelasInternal(kelasId, startDate, endDate, jadwal) {
  const kRes = await db.query('SELECT id, nama_kelas FROM kelas WHERE id = $1 LIMIT 1', [kelasId]);
  const kelas = kRes.rows[0] || null;

  // Cari siswa di kelas ini (cocokkan id atau nama kelas)
  let siswaRes;
  if (kelas) {
    siswaRes = await db.query(
      `SELECT id, nama_lengkap, jenis_kelamin FROM users
       WHERE role = 'siswa' AND is_active = TRUE AND (kelas_id = $1 OR kelas_id = $2)
       ORDER BY nama_lengkap ASC`,
      [String(kelasId), kelas.nama_kelas]
    );
  } else {
    siswaRes = await db.query(
      `SELECT id, nama_lengkap, jenis_kelamin FROM users
       WHERE role = 'siswa' AND is_active = TRUE AND kelas_id = $1
       ORDER BY nama_lengkap ASC`,
      [String(kelasId)]
    );
  }

  const siswaList = siswaRes.rows;
  const siswaIds = siswaList.map(s => String(s.id));
  const laporan = await sholatService.getLaporanByRange(startDate, endDate, siswaIds);
  const waktuWajibPerHari = await getWaktuWajibPerHariRange(startDate, endDate);

  const siswaRekap = siswaList.map(siswa => ({
    id:            siswa.id,
    nama:          siswa.nama_lengkap,
    jenis_kelamin: siswa.jenis_kelamin,
    rekap:         hitungRekapSiswa(laporan, waktuWajibPerHari, siswa.id, startDate, endDate, jadwal)
  }));

  let totalSholat = 0, totalTepat = 0, totalTerlambat = 0, totalTidak = 0, totalHaid = 0, totalWajib = 0;
  siswaRekap.forEach(s => {
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

module.exports = {
  getDashboard,
  getRekapKelas
};
