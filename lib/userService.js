// ============================================================
// lib/userService.js — User Management & RBAC
// ============================================================

const db = require('./db');
const { hashPassword } = require('./auth');

const VALID_ROLES = ['superadmin', 'admin', 'kepala_sekolah', 'walikelas', 'siswa'];

async function getUsers(session) {
  if (!['superadmin', 'admin', 'kepala_sekolah'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }

  let sql = 'SELECT id, username, role, nama_lengkap, jenis_kelamin, kelas_id, is_active, created_at FROM users ';
  const params = [];

  // Jika admin/kepsek, sembunyikan superadmin dari daftar
  if (session.role === 'admin' || session.role === 'kepala_sekolah') {
    sql += 'WHERE role != $1 ';
    params.push('superadmin');
  }

  sql += 'ORDER BY id ASC';
  const res = await db.query(sql, params);

  const safe = res.rows.map(r => ({
    id:            r.id,
    username:      r.username || '',
    role:          r.role || '',
    nama_lengkap:  r.nama_lengkap || '',
    jenis_kelamin: r.jenis_kelamin || 'L',
    kelas_id:      r.kelas_id || '',
    is_active:     Boolean(r.is_active),
    created_at:    r.created_at ? new Date(r.created_at).toISOString() : ''
  }));

  return { ok: true, data: safe };
}

async function createUser(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }

  if (!data.username || !data.password || !data.role || !data.nama_lengkap) {
    return { ok: false, msg: 'Username, password, role, dan nama wajib diisi.' };
  }
  if (!VALID_ROLES.includes(data.role)) {
    return { ok: false, msg: 'Role tidak valid.' };
  }
  // Admin tidak bisa membuat superadmin
  if (session.role === 'admin' && data.role === 'superadmin') {
    return { ok: false, msg: 'Admin tidak bisa membuat akun superadmin.' };
  }
  if (data.password.length < 6) {
    return { ok: false, msg: 'Password minimal 6 karakter.' };
  }

  const username = String(data.username).trim();
  const existRes = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  if (existRes.rows.length > 0) {
    return { ok: false, msg: 'Username sudah dipakai.' };
  }

  const passHash = hashPassword(data.password);
  const nama = String(data.nama_lengkap).trim();
  const jk = data.jenis_kelamin || 'L';
  const kelasId = data.kelas_id || null;

  const insertRes = await db.query(
    `INSERT INTO users (username, password_hash, role, nama_lengkap, jenis_kelamin, kelas_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
    [username, passHash, data.role, nama, jk, kelasId]
  );

  return { ok: true, msg: 'User berhasil dibuat.', id: insertRes.rows[0].id };
}

async function updateUser(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.id) return { ok: false, msg: 'ID user wajib diisi.' };

  const targetRes = await db.query('SELECT * FROM users WHERE id = $1', [data.id]);
  if (targetRes.rows.length === 0) return { ok: false, msg: 'User tidak ditemukan.' };
  const targetUser = targetRes.rows[0];

  // Admin tidak bisa edit superadmin
  if (session.role === 'admin' && targetUser.role === 'superadmin') {
    return { ok: false, msg: 'Admin tidak bisa mengedit akun superadmin.' };
  }

  const updates = [];
  const params = [];
  let idx = 1;

  if (data.username) {
    const newUsername = String(data.username).trim();
    if (newUsername.toLowerCase() !== targetUser.username.toLowerCase()) {
      const checkRes = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [newUsername, data.id]);
      if (checkRes.rows.length > 0) {
        return { ok: false, msg: 'Username sudah dipakai user lain.' };
      }
      updates.push(`username = $${idx++}`);
      params.push(newUsername);
    }
  }

  if (data.nama_lengkap) {
    updates.push(`nama_lengkap = $${idx++}`);
    params.push(String(data.nama_lengkap).trim());
  }

  if (data.role) {
    if (!VALID_ROLES.includes(data.role)) return { ok: false, msg: 'Role tidak valid.' };
    if (session.role === 'admin' && data.role === 'superadmin') {
      return { ok: false, msg: 'Admin tidak bisa mengubah role ke superadmin.' };
    }
    updates.push(`role = $${idx++}`);
    params.push(data.role);
  }

  if (data.jenis_kelamin) {
    updates.push(`jenis_kelamin = $${idx++}`);
    params.push(data.jenis_kelamin);
  }

  if (data.kelas_id !== undefined) {
    updates.push(`kelas_id = $${idx++}`);
    params.push(data.kelas_id || null);
  }

  if (data.is_active !== undefined) {
    updates.push(`is_active = $${idx++}`);
    params.push(Boolean(data.is_active));
  }

  if (updates.length > 0) {
    params.push(data.id);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  }

  return { ok: true, msg: 'User berhasil diupdate.' };
}

async function deleteUser(session, data) {
  if (!['superadmin', 'admin', 'kepala_sekolah'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.id) return { ok: false, msg: 'ID user wajib diisi.' };
  if (String(data.id) === String(session.user_id)) {
    return { ok: false, msg: 'Tidak bisa menghapus akun sendiri.' };
  }

  const targetRes = await db.query('SELECT * FROM users WHERE id = $1', [data.id]);
  if (targetRes.rows.length === 0) return { ok: false, msg: 'User tidak ditemukan.' };
  const targetUser = targetRes.rows[0];

  if (targetUser.role === 'superadmin') {
    return { ok: false, msg: 'Akun superadmin tidak dapat dihapus.' };
  }
  if (session.role === 'admin' && targetUser.role === 'admin') {
    return { ok: false, msg: 'Admin tidak bisa menghapus sesama admin.' };
  }

  await db.query('DELETE FROM users WHERE id = $1', [data.id]);
  return { ok: true, msg: 'User berhasil dihapus.' };
}

async function resetPassword(session, data) {
  if (!['superadmin', 'admin'].includes(session.role)) {
    return { ok: false, msg: 'Akses ditolak.' };
  }
  if (!data.id || !data.password_baru) {
    return { ok: false, msg: 'ID user dan password baru wajib diisi.' };
  }
  if (data.password_baru.length < 6) {
    return { ok: false, msg: 'Password minimal 6 karakter.' };
  }

  const targetRes = await db.query('SELECT * FROM users WHERE id = $1', [data.id]);
  if (targetRes.rows.length === 0) return { ok: false, msg: 'User tidak ditemukan.' };
  const targetUser = targetRes.rows[0];

  // Admin tidak bisa reset password superadmin
  if (session.role === 'admin' && targetUser.role === 'superadmin') {
    return { ok: false, msg: 'Admin tidak bisa mereset password superadmin.' };
  }

  const newHash = hashPassword(data.password_baru);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, data.id]);
  return { ok: true, msg: 'Password berhasil direset.' };
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetPassword
};
