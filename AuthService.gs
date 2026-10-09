// ============================================================
// AuthService.gs — Login, Logout, Session, Ganti Password
// ============================================================

var AuthService = (function () {

  var TOKEN_SECRET = 'SMP_ALIGHAR_TOKEN_SECRET_KEY_2026';
  var TOKEN_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 jam

  // ── Login ──────────────────────────────────────────────────
  function login(data) {
    if (!data.username || !data.password) {
      return { ok: false, msg: 'Username dan password wajib diisi.' };
    }

    var user = UserService.findByUsername(String(data.username).trim());
    if (!user) return { ok: false, msg: 'Username tidak ditemukan.' };
    if (!user.is_active) return { ok: false, msg: 'Akun nonaktif. Hubungi admin.' };

    if (!checkPassword(data.password, user.password_hash)) {
      return { ok: false, msg: 'Password salah.' };
    }

    var token = createSessionToken(user);

    return {
      ok: true,
      token: token,
      user: {
        id:           user.id,
        nama:         user.nama_lengkap,
        username:     user.username,
        role:         user.role,
        jenis_kelamin: user.jenis_kelamin,
        kelas_id:     user.kelas_id
      }
    };
  }

  // ── Logout ─────────────────────────────────────────────────
  function logout() {
    return { ok: true };
  }

  // ── Ganti Password ─────────────────────────────────────────
  function gantiPassword(session, data) {
    if (!data.password_lama || !data.password_baru || !data.password_konfirmasi) {
      return { ok: false, msg: 'Semua field wajib diisi.' };
    }
    if (data.password_baru !== data.password_konfirmasi) {
      return { ok: false, msg: 'Password baru dan konfirmasi tidak cocok.' };
    }
    if (data.password_baru.length < 6) {
      return { ok: false, msg: 'Password minimal 6 karakter.' };
    }

    var user = UserService.findById(session.user_id);
    if (!user) return { ok: false, msg: 'User tidak ditemukan.' };

    if (!checkPassword(data.password_lama, user.password_hash)) {
      return { ok: false, msg: 'Password lama salah.' };
    }

    var newHash = hashPassword(data.password_baru);
    UserService.updatePasswordHash(session.user_id, newHash);
    return { ok: true, msg: 'Password berhasil diubah.' };
  }

  // ── Stateless HMAC Session Tokens ──────────────────────────

  function createSessionToken(user) {
    var payload = {
      user_id:       user.id,
      username:      user.username,
      role:          user.role,
      jenis_kelamin: user.jenis_kelamin,
      kelas_id:      user.kelas_id,
      nama:          user.nama_lengkap,
      exp:           new Date().getTime() + TOKEN_EXPIRE_MS
    };
    var jsonStr = JSON.stringify(payload);
    var b64 = Utilities.base64EncodeWebSafe(jsonStr);
    var sig = computeHmac(b64, TOKEN_SECRET);
    return b64 + '.' + sig;
  }

  function getSession(token) {
    if (!token || typeof token !== 'string') return null;
    var parts = token.split('.');
    if (parts.length !== 2) return null;
    var b64 = parts[0];
    var sig = parts[1];
    if (computeHmac(b64, TOKEN_SECRET) !== sig) return null;
    try {
      var jsonStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString();
      var sess = JSON.parse(jsonStr);
      if (new Date().getTime() > sess.exp) return null;
      return sess;
    } catch (e) {
      return null;
    }
  }

  function computeHmac(data, key) {
    var bytes = Utilities.computeHmacSha256Signature(data, key);
    return bytes.map(function (b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
  }

  // ── Crypto Helpers ─────────────────────────────────────────

  function hashPassword(plaintext) {
    // GAS tidak punya bcrypt, pakai SHA-256 + salt
    // Untuk production migration ke Hostinger, ganti ke bcrypt
    var salt = generateSalt();
    var hash = computeSHA256(salt + plaintext);
    return salt + ':' + hash;
  }

  function checkPassword(plaintext, stored) {
    if (!stored || stored.indexOf(':') === -1) return false;
    var parts = stored.split(':');
    var salt  = parts[0];
    var hash  = parts[1];
    return computeSHA256(salt + plaintext) === hash;
  }

  function computeSHA256(input) {
    var bytes    = Utilities.newBlob(input).getBytes();
    var digest   = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
    return digest.map(function (b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
  }

  function generateSalt() {
    return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  }


  return {
    login:              login,
    logout:             logout,
    gantiPassword:      gantiPassword,
    getSession:         getSession,
    hashPassword:       hashPassword,
    checkPassword:      checkPassword
  };

})();
