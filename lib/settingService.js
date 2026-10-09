// ============================================================
// lib/settingService.js — Setting Sholat, Kalender, & Jadwal
// ============================================================

const db = require('./db');

const WAKTU_SHOLAT = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];

const DEFAULT_JADWAL = {
  subuh:   '03:57',
  dzuhur:  '11:19',
  ashar:   '14:25',
  maghrib: '17:23',
  isya:    '18:32'
};

async function getSettingLokasi() {
  const res = await db.query('SELECT * FROM setting_lokasi LIMIT 1');
  if (res.rows.length === 0) {
    return {
      id: 1,
      nama_kota:  'KAB. KOTAWARINGIN TIMUR (Kalimantan Tengah)',
      zona_waktu: 'WIB',
      jadwal:     DEFAULT_JADWAL
    };
  }
  const row = res.rows[0];
  return {
    id:         row.id,
    nama_kota:  row.nama_kota || 'KAB. KOTAWARINGIN TIMUR (Kalimantan Tengah)',
    zona_waktu: row.zona_waktu || 'WIB',
    jadwal:     row.jadwal || DEFAULT_JADWAL
  };
}

async function getSetting(session) {
  const result = {
    hari_sekolah: { subuh: true, dzuhur: false, ashar: false, maghrib: true, isya: true },
    hari_libur:   { subuh: true, dzuhur: true,  ashar: true,  maghrib: true, isya: true }
  };

  const res = await db.query('SELECT tipe_hari, waktu_sholat, wajib_lapor FROM setting_sholat');
  res.rows.forEach(r => {
    if (result[r.tipe_hari] && WAKTU_SHOLAT.includes(r.waktu_sholat)) {
      result[r.tipe_hari][r.waktu_sholat] = Boolean(r.wajib_lapor);
    }
  });

  result.lokasi = await getSettingLokasi();
  return { ok: true, data: result };
}

async function updateSetting(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.hari_sekolah || !data.hari_libur) {
    return { ok: false, msg: 'Data setting tidak lengkap.' };
  }

  // Upsert setting_sholat
  for (const tipe of ['hari_sekolah', 'hari_libur']) {
    for (const w of WAKTU_SHOLAT) {
      const wajib = data[tipe][w] === true || data[tipe][w] === 'true';
      await db.query(
        `INSERT INTO setting_sholat (tipe_hari, waktu_sholat, wajib_lapor)
         VALUES ($1, $2, $3)
         ON CONFLICT (tipe_hari, waktu_sholat) DO UPDATE SET wajib_lapor = EXCLUDED.wajib_lapor`,
        [tipe, w, wajib]
      );
    }
  }

  if (data.lokasi) {
    await saveSettingLokasi(session, data.lokasi);
  }

  return { ok: true, msg: 'Setting berhasil disimpan.' };
}

async function saveSettingLokasi(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }

  const namaKota = data.nama_kota || 'KAB. KOTAWARINGIN TIMUR (Kalimantan Tengah)';
  const zonaWaktu = data.zona_waktu || 'WIB';
  const jadwal = data.jadwal || DEFAULT_JADWAL;

  await db.query(
    `INSERT INTO setting_lokasi (id, nama_kota, zona_waktu, jadwal, updated_at)
     VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       nama_kota = EXCLUDED.nama_kota,
       zona_waktu = EXCLUDED.zona_waktu,
       jadwal = EXCLUDED.jadwal,
       updated_at = CURRENT_TIMESTAMP`,
    [namaKota, zonaWaktu, JSON.stringify(jadwal)]
  );

  return { ok: true, msg: 'Pengaturan lokasi berhasil disimpan.' };
}

async function getKalender(session) {
  const res = await db.query('SELECT tanggal, tipe_hari, keterangan FROM kalender_hari ORDER BY tanggal ASC');
  const data = res.rows.map(r => ({
    tanggal:    r.tanggal instanceof Date ? r.tanggal.toISOString().split('T')[0] : String(r.tanggal),
    tipe_hari:  r.tipe_hari,
    keterangan: r.keterangan || ''
  }));
  return { ok: true, data };
}

async function saveKalender(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  const startStr = data.tanggal_mulai || data.tanggal;
  const endStr   = data.tanggal_selesai || startStr;
  if (!startStr || !data.tipe_hari) {
    return { ok: false, msg: 'Tanggal dan tipe hari wajib diisi.' };
  }

  let cur = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  if (end < cur) cur = end;

  while (cur <= end) {
    const tgl = cur.toISOString().split('T')[0];
    await db.query(
      `INSERT INTO kalender_hari (tanggal, tipe_hari, keterangan)
       VALUES ($1, $2, $3)
       ON CONFLICT (tanggal) DO UPDATE SET
         tipe_hari = EXCLUDED.tipe_hari,
         keterangan = EXCLUDED.keterangan`,
      [tgl, data.tipe_hari, data.keterangan || '']
    );
    cur.setDate(cur.getDate() + 1);
  }

  return { ok: true, msg: 'Tanggal khusus berhasil disimpan.' };
}

async function deleteKalender(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.tanggal) return { ok: false, msg: 'Tanggal wajib diisi.' };

  await db.query('DELETE FROM kalender_hari WHERE tanggal = $1', [data.tanggal]);
  return { ok: true, msg: 'Kalender dihapus.' };
}

async function getTipeHari(tanggalStr) {
  const res = await db.query('SELECT tipe_hari FROM kalender_hari WHERE tanggal = $1 LIMIT 1', [tanggalStr]);
  if (res.rows.length > 0) {
    return res.rows[0].tipe_hari;
  }
  const d = new Date(tanggalStr + 'T12:00:00');
  const day = d.getDay(); // 0=Minggu, 6=Sabtu
  return (day === 0 || day === 6) ? 'hari_libur' : 'hari_sekolah';
}

async function getWaktuWajib(tanggalStr) {
  const tipeHari = await getTipeHari(tanggalStr);
  const settingRes = await getSetting(null);
  const setting = settingRes.data;
  const wajib = [];

  const d = new Date(tanggalStr + 'T12:00:00');
  const isJumat = (d.getDay() === 5);

  WAKTU_SHOLAT.forEach(w => {
    if (setting[tipeHari] && setting[tipeHari][w]) {
      wajib.push(w);
    } else if (isJumat && w === 'ashar') {
      // Hari Jumat: Ashar otomatis wajib dilaporkan
      wajib.push(w);
    }
  });

  return { tipe_hari: tipeHari, waktu_wajib: wajib };
}

async function getJadwalHariIni(tanggalStr) {
  const lokasi = await getSettingLokasi();
  return lokasi.jadwal || DEFAULT_JADWAL;
}

function evaluasiWindowSholat(waktu, nowTime, jadwal) {
  if (!jadwal || !jadwal[waktu]) {
    return { can_lapor: true, status: 'aktif', msg: 'Waktu sholat aktif.', mulai: '00:00', selesai: '23:59' };
  }

  function toMinutes(t) {
    if (!t) return 0;
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  const nextWaktuMap = {
    subuh:   'dzuhur',
    dzuhur:  'ashar',
    ashar:   'maghrib',
    maghrib: 'isya',
    isya:    'subuh'
  };

  const jamMulai   = jadwal[waktu];
  const jamSelesai = jadwal[nextWaktuMap[waktu]] || '23:59';

  const mNow   = toMinutes(nowTime);
  const mMulai = toMinutes(jamMulai);
  const mNext  = toMinutes(jamSelesai);

  let aktif = false;
  if (waktu === 'isya') {
    // Isya melintasi tengah malam hingga Subuh
    aktif = (mNow >= mMulai) || (mNow < mNext);
  } else {
    aktif = (mNow >= mMulai && mNow < mNext);
  }

  if (mNow < mMulai && waktu !== 'isya') {
    return {
      can_lapor: false,
      status:    'belum_mulai',
      msg:       `Waktu belum masuk. Dimulai pukul ${jamMulai}.`,
      mulai:     jamMulai,
      selesai:   jamSelesai
    };
  }

  if (!aktif) {
    return {
      can_lapor: false,
      status:    'lewat',
      msg:       `Waktu sholat sudah berakhir (pukul ${jamSelesai}).`,
      mulai:     jamMulai,
      selesai:   jamSelesai
    };
  }

  return {
    can_lapor: true,
    status:    'aktif',
    msg:       `Waktu aktif (${jamMulai} - ${jamSelesai}).`,
    mulai:     jamMulai,
    selesai:   jamSelesai
  };
}

async function getDaftarKota(session) {
  return { ok: true, data: [{ id: '1', nama: 'KAB. KOTAWARINGIN TIMUR' }] };
}

async function fetchJadwalKota(session, data) {
  const lokasi = await getSettingLokasi();
  return { ok: true, data: lokasi.jadwal || DEFAULT_JADWAL };
}

module.exports = {
  WAKTU_SHOLAT,
  DEFAULT_JADWAL,
  getSettingLokasi,
  saveSettingLokasi,
  getSetting,
  updateSetting,
  getKalender,
  saveKalender,
  deleteKalender,
  getTipeHari,
  getWaktuWajib,
  getJadwalHariIni,
  evaluasiWindowSholat,
  getDaftarKota,
  fetchJadwalKota
};
