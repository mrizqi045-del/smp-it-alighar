// ============================================================
// lib/sholatService.js — Input & Query Laporan Sholat
// ============================================================

const db = require('./db');
const settingService = require('./settingService');

const STATUS_VALID = ['sholat', 'tidak_sholat', 'haid'];

function getWibNow() {
  const now = new Date();
  // Tanggal YYYY-MM-DD format di Asia/Jakarta
  const tgl = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit' });
  return { dateStr: tgl, timeStr: time, rawDate: now };
}

function getMingguRange(offsetMinggu = 0) {
  const { dateStr } = getWibNow();
  const parts = dateStr.split('-');
  const now = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);

  const day = now.getDay(); // 0=Minggu, 1=Senin
  const senin = new Date(now);
  senin.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offsetMinggu * 7));

  const ahad = new Date(senin);
  ahad.setDate(senin.getDate() + 6);

  return {
    start: senin.toISOString().split('T')[0],
    end:   ahad.toISOString().split('T')[0]
  };
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function getFormHariIni(session) {
  if (session.role !== 'siswa') {
    return { ok: false, msg: 'Hanya siswa yang bisa lapor sholat.' };
  }

  const { dateStr: today, timeStr: nowTime } = getWibNow();
  const waktuInfo = await settingService.getWaktuWajib(today);
  const lokasi = await settingService.getSettingLokasi();
  const jadwal = lokasi.jadwal || settingService.DEFAULT_JADWAL;

  const userRes = await db.query('SELECT jenis_kelamin FROM users WHERE id = $1', [session.user_id]);
  const isPerempuan = (userRes.rows[0] && userRes.rows[0].jenis_kelamin === 'P') || session.jenis_kelamin === 'P';

  const lapRes = await db.query(
    'SELECT * FROM laporan_sholat WHERE siswa_id = $1 AND tanggal = $2',
    [session.user_id, today]
  );

  const laporanHariIni = {};
  lapRes.rows.forEach(r => {
    let jamLapor = '';
    if (r.dilaporkan_at) {
      jamLapor = new Date(r.dilaporkan_at).toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    laporanHariIni[r.waktu_sholat] = {
      status:        r.status,
      dilaporkan_at: jamLapor
    };
  });

  const formItems = waktuInfo.waktu_wajib.map(waktu => {
    const lapor = laporanHariIni[waktu];
    const windowStatus = settingService.evaluasiWindowSholat(waktu, nowTime, jadwal);

    let terlambat = false;
    if (lapor && lapor.status === 'sholat' && lapor.dilaporkan_at && jadwal[waktu]) {
      try {
        const pM = jadwal[waktu].split(':');
        const pL = lapor.dilaporkan_at.split(':');
        const mM = parseInt(pM[0], 10) * 60 + parseInt(pM[1], 10);
        const mL = parseInt(pL[0], 10) * 60 + parseInt(pL[1], 10);
        let diff = mL - mM;
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
      window_status: lapor ? 'sudah_lapor' : windowStatus.status,
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

async function laporSholat(session, data) {
  if (session.role !== 'siswa') {
    return { ok: false, msg: 'Hanya siswa yang bisa lapor sholat.' };
  }
  if (!data.waktu_sholat || !data.status) {
    return { ok: false, msg: 'Waktu sholat dan status wajib diisi.' };
  }

  const { dateStr: today, timeStr: nowTime, rawDate: now } = getWibNow();
  const waktu  = String(data.waktu_sholat).toLowerCase();
  const status = String(data.status).toLowerCase();

  // 1. Validasi wajib hari ini
  const waktuInfo = await settingService.getWaktuWajib(today);
  if (!waktuInfo.waktu_wajib.includes(waktu)) {
    return { ok: false, msg: `Waktu sholat ${waktu} tidak wajib dilaporkan hari ini.` };
  }

  // 2. Validasi status
  if (!STATUS_VALID.includes(status)) {
    return { ok: false, msg: 'Status tidak valid.' };
  }

  // 3. Haid perempuan
  if (status === 'haid') {
    const userRes = await db.query('SELECT jenis_kelamin FROM users WHERE id = $1', [session.user_id]);
    if (!userRes.rows[0] || userRes.rows[0].jenis_kelamin !== 'P') {
      return { ok: false, msg: 'Opsi haid hanya untuk siswa perempuan.' };
    }
  }

  // 4. KUNCI LAPORAN
  const existRes = await db.query(
    'SELECT id FROM laporan_sholat WHERE siswa_id = $1 AND tanggal = $2 AND waktu_sholat = $3',
    [session.user_id, today, waktu]
  );
  if (existRes.rows.length > 0) {
    return { ok: false, msg: 'Laporan sholat sudah pernah dikirim dan tidak dapat diubah kembali.' };
  }

  // 5. Window waktu
  const lokasi = await settingService.getSettingLokasi();
  const jadwal = lokasi.jadwal || settingService.DEFAULT_JADWAL;
  const windowStatus = settingService.evaluasiWindowSholat(waktu, nowTime, jadwal);
  if (!windowStatus.can_lapor) {
    return { ok: false, msg: windowStatus.msg };
  }

  // 6. Simpan
  await db.query(
    `INSERT INTO laporan_sholat (siswa_id, tanggal, waktu_sholat, status, dilaporkan_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.user_id, today, waktu, status, now]
  );

  return { ok: true, msg: `Laporan sholat ${capitalize(waktu)} berhasil disimpan.` };
}

async function getRiwayat(session, data) {
  if (session.role !== 'siswa') return { ok: false, msg: 'Akses ditolak.' };

  const minggu = parseInt(data.minggu, 10) || 0;
  const range = getMingguRange(minggu);

  const res = await db.query(
    `SELECT id, siswa_id, TO_CHAR(tanggal, 'YYYY-MM-DD') as tanggal, waktu_sholat, status, dilaporkan_at
     FROM laporan_sholat
     WHERE siswa_id = $1 AND tanggal >= $2 AND tanggal <= $3
     ORDER BY tanggal ASC, id ASC`,
    [session.user_id, range.start, range.end]
  );

  const riwayat = res.rows.map(r => ({
    id:            r.id,
    siswa_id:      r.siswa_id,
    tanggal:       r.tanggal,
    waktu_sholat:  r.waktu_sholat,
    status:        r.status,
    dilaporkan_at: r.dilaporkan_at ? new Date(r.dilaporkan_at).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }) : ''
  }));

  return { ok: true, data: riwayat, range: range };
}

async function getLaporanByRange(startDate, endDate, siswaIds = null) {
  let sql = `
    SELECT id, siswa_id, TO_CHAR(tanggal, 'YYYY-MM-DD') as tanggal, waktu_sholat, status, dilaporkan_at
    FROM laporan_sholat
    WHERE tanggal >= $1 AND tanggal <= $2
  `;
  const params = [startDate, endDate];

  if (siswaIds && siswaIds.length > 0) {
    sql += ` AND siswa_id = ANY($3::int[])`;
    params.push(siswaIds.map(Number));
  }

  sql += ' ORDER BY tanggal ASC, id ASC';
  const res = await db.query(sql, params);

  return res.rows.map(r => ({
    id:            r.id,
    siswa_id:      r.siswa_id,
    tanggal:       r.tanggal,
    waktu_sholat:  r.waktu_sholat,
    status:        r.status,
    dilaporkan_at: r.dilaporkan_at ? new Date(r.dilaporkan_at).toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }) : ''
  }));
}

module.exports = {
  getWibNow,
  getMingguRange,
  getFormHariIni,
  laporSholat,
  getRiwayat,
  getLaporanByRange
};
