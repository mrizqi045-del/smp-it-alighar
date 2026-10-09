// ============================================================
// UserService.gs — CRUD User
// ============================================================

var UserService = (function () {

  var SHEET_NAME = 'users';
  var COLS = {
    id:            1,
    username:      2,
    password_hash: 3,
    role:          4,
    nama_lengkap:  5,
    jenis_kelamin: 6,
    kelas_id:      7,
    is_active:     8,
    created_at:    9
  };
  var VALID_ROLES = ['superadmin', 'admin', 'kepala_sekolah', 'walikelas', 'siswa'];

  // ── Sheet Helper ───────────────────────────────────────────

  function getSheet() {
    return getSpreadsheet().getSheetByName(SHEET_NAME);
  }

  function getAllRows() {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    return data.map(function (row) { return rowToObj(row); });
  }

  function rowToObj(row) {
    return {
      id:            row[0],
      username:      row[1],
      password_hash: row[2],
      role:          row[3],
      nama_lengkap:  row[4],
      jenis_kelamin: row[5],
      kelas_id:      row[6] || null,
      is_active:     row[7] === true || row[7] === 'TRUE' || row[7] === 1,
      created_at:    row[8]
    };
  }

  function findRowById(id) {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] == id) return i + 2; // 1-indexed row
    }
    return -1;
  }

  function nextId() {
    var rows = getAllRows();
    if (rows.length === 0) return 1;
    var maxId = Math.max.apply(null, rows.map(function (r) { return Number(r.id) || 0; }));
    return maxId + 1;
  }

  // ── Public: Find ───────────────────────────────────────────

  function findByUsername(username) {
    var target = String(username).trim();
    var rows = getAllRows();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].username).trim() === target) return rows[i];
    }
    return null;
  }

  function findById(id) {
    var rows = getAllRows();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id)) return rows[i];
    }
    return null;
  }

  // ── Public: Get Users (role-aware) ─────────────────────────

  function getUsers(session) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    var rows = getAllRows();
    // Hilangkan password_hash dari response, format Date ke string agar serializable
    var safe = rows.map(function (r) {
      var tglStr = '';
      if (r.created_at) {
        try {
          tglStr = Utilities.formatDate(new Date(r.created_at), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
        } catch (e) {
          tglStr = String(r.created_at);
        }
      }
      return {
        id:            r.id,
        username:      String(r.username !== undefined && r.username !== null ? r.username : ''),
        role:          String(r.role || ''),
        nama_lengkap:  String(r.nama_lengkap || ''),
        jenis_kelamin: String(r.jenis_kelamin || 'L'),
        kelas_id:      r.kelas_id ? String(r.kelas_id) : '',
        is_active:     Boolean(r.is_active),
        created_at:    tglStr
      };
    });
    return { ok: true, data: safe };
  }

  // ── Public: Create User ────────────────────────────────────

  function createUser(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }

    // Validasi
    if (!data.username || !data.password || !data.role || !data.nama_lengkap) {
      return { ok: false, msg: 'Username, password, role, dan nama wajib diisi.' };
    }
    if (!VALID_ROLES.includes(data.role)) {
      return { ok: false, msg: 'Role tidak valid.' };
    }
    // Admin tidak bisa buat superadmin
    if (session.role === 'admin' && data.role === 'superadmin') {
      return { ok: false, msg: 'Admin tidak bisa membuat superadmin.' };
    }
    if (findByUsername(data.username.trim())) {
      return { ok: false, msg: 'Username sudah dipakai.' };
    }
    if (data.password.length < 6) {
      return { ok: false, msg: 'Password minimal 6 karakter.' };
    }

    var id          = nextId();
    var passHash    = AuthService.hashPassword(data.password);
    var now         = new Date();
    var kelasId     = data.kelas_id || '';
    var jenisKelamin = data.jenis_kelamin || 'L';

    var sheet = getSheet();
    sheet.appendRow([
      id,
      data.username.trim(),
      passHash,
      data.role,
      data.nama_lengkap.trim(),
      jenisKelamin,
      kelasId,
      true,
      now
    ]);

    return { ok: true, msg: 'User berhasil dibuat.', id: id };
  }

  // ── Public: Update User ────────────────────────────────────

  function updateUser(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.id) return { ok: false, msg: 'ID user wajib diisi.' };

    var rowNum = findRowById(data.id);
    if (rowNum === -1) return { ok: false, msg: 'User tidak ditemukan.' };

    var sheet = getSheet();
    var row   = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
    var user  = rowToObj(row);

    // Admin tidak bisa edit superadmin
    if (session.role === 'admin' && user.role === 'superadmin') {
      return { ok: false, msg: 'Admin tidak bisa mengedit superadmin.' };
    }

    // Update field yang dikirim
    if (data.username) {
      var newUsername = data.username.trim();
      if (newUsername !== user.username) {
        var exist = findByUsername(newUsername);
        if (exist && exist.id != data.id) {
          return { ok: false, msg: 'ID / Username sudah dipakai user lain.' };
        }
        row[COLS.username - 1] = newUsername;
      }
    }
    if (data.nama_lengkap)  row[COLS.nama_lengkap - 1]  = data.nama_lengkap.trim();
    if (data.role)          row[COLS.role - 1]           = data.role;
    if (data.jenis_kelamin) row[COLS.jenis_kelamin - 1]  = data.jenis_kelamin;
    if (data.kelas_id !== undefined) row[COLS.kelas_id - 1] = data.kelas_id || '';
    if (data.is_active !== undefined) row[COLS.is_active - 1] = data.is_active;

    sheet.getRange(rowNum, 1, 1, 9).setValues([row]);
    return { ok: true, msg: 'User berhasil diupdate.' };
  }

  // ── Public: Delete User ────────────────────────────────────

  function deleteUser(session, data) {
    if (!['superadmin', 'admin', 'kepala_sekolah'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.id) return { ok: false, msg: 'ID user wajib diisi.' };
    if (String(data.id) === String(session.user_id)) {
      return { ok: false, msg: 'Tidak bisa menghapus akun sendiri.' };
    }

    var rowNum = findRowById(data.id);
    if (rowNum === -1) return { ok: false, msg: 'User tidak ditemukan.' };

    var sheet = getSheet();
    var user  = rowToObj(sheet.getRange(rowNum, 1, 1, 9).getValues()[0]);

    if (user.role === 'superadmin') {
      return { ok: false, msg: 'Superadmin tidak dapat dihapus.' };
    }
    if (session.role === 'admin' && user.role === 'admin') {
      return { ok: false, msg: 'Admin tidak bisa menghapus sesama admin.' };
    }

    sheet.deleteRow(rowNum);
    return { ok: true, msg: 'User berhasil dihapus.' };
  }

  // ── Public: Reset Password ─────────────────────────────────

  function resetPassword(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.id || !data.password_baru) {
      return { ok: false, msg: 'ID user dan password baru wajib diisi.' };
    }
    if (data.password_baru.length < 6) {
      return { ok: false, msg: 'Password minimal 6 karakter.' };
    }

    var rowNum = findRowById(data.id);
    if (rowNum === -1) return { ok: false, msg: 'User tidak ditemukan.' };

    // Admin tidak bisa reset password superadmin
    var targetUser = rowToObj(getSheet().getRange(rowNum, 1, 1, 9).getValues()[0]);
    if (session.role === 'admin' && targetUser.role === 'superadmin') {
      return { ok: false, msg: 'Admin tidak bisa mereset password superadmin.' };
    }

    var newHash = AuthService.hashPassword(data.password_baru);
    getSheet().getRange(rowNum, COLS.password_hash).setValue(newHash);
    return { ok: true, msg: 'Password berhasil direset.' };
  }

  // ── Public: Update Password Hash (dari ganti password sendiri) ──

  function updatePasswordHash(userId, newHash) {
    var rowNum = findRowById(userId);
    if (rowNum === -1) return;
    getSheet().getRange(rowNum, COLS.password_hash).setValue(newHash);
  }

  return {
    findByUsername:     findByUsername,
    findById:           findById,
    getUsers:           getUsers,
    createUser:         createUser,
    updateUser:         updateUser,
    deleteUser:         deleteUser,
    resetPassword:      resetPassword,
    updatePasswordHash: updatePasswordHash,
    getAllRows:         getAllRows
  };

})();
