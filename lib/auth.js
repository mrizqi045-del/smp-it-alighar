// ============================================================
// lib/auth.js — Authentication, JWT Session, & Passwords
// ============================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'SMP_IT_ALIGHAR_SECRET_KEY_2026';

function hashPassword(plainPassword) {
  return bcrypt.hashSync(plainPassword, 10);
}

function checkPassword(plainPassword, storedHash) {
  if (!storedHash || !plainPassword) return false;
  // Jika hash diawali $2a$ / $2b$, gunakan bcrypt
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    return bcrypt.compareSync(plainPassword, storedHash);
  }
  // Fallback jika plain text (misal saat migrasi awal)
  return plainPassword === storedHash;
}

function createSessionToken(user) {
  const payload = {
    user_id:       user.id,
    username:      user.username,
    nama:          user.nama_lengkap,
    role:          user.role,
    jenis_kelamin: user.jenis_kelamin,
    kelas_id:      user.kelas_id
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function getSession(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function login(data) {
  if (!data.username || !data.password) {
    return { ok: false, msg: 'Username dan password wajib diisi.' };
  }

  const username = String(data.username).trim();
  const res = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [username]);
  if (res.rows.length === 0) {
    return { ok: false, msg: 'Username tidak ditemukan.' };
  }

  const user = res.rows[0];
  if (!user.is_active) {
    return { ok: false, msg: 'Akun nonaktif. Hubungi admin.' };
  }

  if (!checkPassword(data.password, user.password_hash)) {
    return { ok: false, msg: 'Password salah.' };
  }

  // Jika password masih plain text, upgrade ke bcrypt secara otomatis
  if (!user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$')) {
    const newHash = hashPassword(data.password);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  }

  const token = createSessionToken(user);
  return {
    ok: true,
    token: token,
    user: {
      id:            user.id,
      nama:          user.nama_lengkap,
      username:      user.username,
      role:          user.role,
      jenis_kelamin: user.jenis_kelamin,
      kelas_id:      user.kelas_id
    }
  };
}

function logout() {
  return { ok: true };
}

async function gantiPassword(session, data) {
  if (!data.password_lama || !data.password_baru || !data.password_konfirmasi) {
    return { ok: false, msg: 'Semua field wajib diisi.' };
  }
  if (data.password_baru !== data.password_konfirmasi) {
    return { ok: false, msg: 'Password baru dan konfirmasi tidak cocok.' };
  }
  if (data.password_baru.length < 6) {
    return { ok: false, msg: 'Password minimal 6 karakter.' };
  }

  const res = await db.query('SELECT * FROM users WHERE id = $1', [session.user_id]);
  if (res.rows.length === 0) {
    return { ok: false, msg: 'User tidak ditemukan.' };
  }

  const user = res.rows[0];
  if (!checkPassword(data.password_lama, user.password_hash)) {
    return { ok: false, msg: 'Password lama salah.' };
  }

  const newHash = hashPassword(data.password_baru);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, session.user_id]);
  return { ok: true, msg: 'Password berhasil diubah.' };
}

module.exports = {
  hashPassword,
  checkPassword,
  createSessionToken,
  getSession,
  login,
  logout,
  gantiPassword
};
