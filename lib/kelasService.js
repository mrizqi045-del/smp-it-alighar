// ============================================================
// lib/kelasService.js — Kelas Management
// ============================================================

const db = require('./db');

async function getKelas(session) {
  const kelasRes = await db.query('SELECT * FROM kelas ORDER BY id ASC');
  const userRes  = await db.query('SELECT id, nama_lengkap FROM users WHERE role = $1', ['walikelas']);

  const userMap = {};
  userRes.rows.forEach(u => { userMap[String(u.id)] = u.nama_lengkap; });

  const enriched = kelasRes.rows.map(r => ({
    id:             r.id,
    nama_kelas:     r.nama_kelas || '',
    walikelas_id:   r.walikelas_id ? String(r.walikelas_id) : '',
    nama_walikelas: userMap[String(r.walikelas_id)] || '-',
    created_at:     r.created_at ? new Date(r.created_at).toISOString() : ''
  }));

  return { ok: true, data: enriched };
}

async function createKelas(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.nama_kelas) return { ok: false, msg: 'Nama kelas wajib diisi.' };

  const nama = String(data.nama_kelas).trim();
  const existRes = await db.query('SELECT id FROM kelas WHERE LOWER(nama_kelas) = LOWER($1)', [nama]);
  if (existRes.rows.length > 0) {
    return { ok: false, msg: 'Nama kelas sudah ada.' };
  }

  const walikelasId = data.walikelas_id ? String(data.walikelas_id) : null;
  const insertRes = await db.query(
    'INSERT INTO kelas (nama_kelas, walikelas_id) VALUES ($1, $2) RETURNING id',
    [nama, walikelasId]
  );

  return { ok: true, msg: 'Kelas berhasil dibuat.', id: insertRes.rows[0].id };
}

async function updateKelas(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.id) return { ok: false, msg: 'ID kelas wajib diisi.' };

  const targetRes = await db.query('SELECT * FROM kelas WHERE id = $1', [data.id]);
  if (targetRes.rows.length === 0) return { ok: false, msg: 'Kelas tidak ditemukan.' };

  const nama = data.nama_kelas ? String(data.nama_kelas).trim() : null;
  if (nama) {
    const existRes = await db.query('SELECT id FROM kelas WHERE LOWER(nama_kelas) = LOWER($1) AND id != $2', [nama, data.id]);
    if (existRes.rows.length > 0) {
      return { ok: false, msg: 'Nama kelas sudah dipakai kelas lain.' };
    }
  }

  const walikelasId = data.walikelas_id !== undefined ? (data.walikelas_id ? String(data.walikelas_id) : null) : targetRes.rows[0].walikelas_id;
  const namaKelasFinal = nama || targetRes.rows[0].nama_kelas;

  await db.query('UPDATE kelas SET nama_kelas = $1, walikelas_id = $2 WHERE id = $3', [namaKelasFinal, walikelasId, data.id]);
  return { ok: true, msg: 'Kelas berhasil diupdate.' };
}

async function deleteKelas(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.id) return { ok: false, msg: 'ID kelas wajib diisi.' };

  // Cek apakah ada siswa yang menggunakan kelas ini
  const siswaRes = await db.query('SELECT id FROM users WHERE kelas_id = $1 LIMIT 1', [String(data.id)]);
  if (siswaRes.rows.length > 0) {
    return { ok: false, msg: 'Tidak bisa menghapus kelas yang masih memiliki siswa.' };
  }

  await db.query('DELETE FROM kelas WHERE id = $1', [data.id]);
  return { ok: true, msg: 'Kelas berhasil dihapus.' };
}

module.exports = {
  getKelas,
  createKelas,
  updateKelas,
  deleteKelas
};
