// ============================================================
// KelasService.gs — CRUD Kelas
// ============================================================

var KelasService = (function () {

  var SHEET_NAME = 'kelas';

  function getSheet() {
    return getSpreadsheet().getSheetByName(SHEET_NAME);
  }

  function getAllRows() {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    return data.map(function (row) {
      return {
        id:           row[0],
        nama_kelas:   String(row[1] !== undefined && row[1] !== null ? row[1] : '').trim(),
        walikelas_id: row[2] ? String(row[2]) : null,
        created_at:   row[3]
      };
    });
  }

  function findRowById(id) {
    var sheet   = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) return i + 2;
    }
    return -1;
  }

  function nextId() {
    var rows = getAllRows();
    if (rows.length === 0) return 1;
    var maxId = Math.max.apply(null, rows.map(function (r) { return Number(r.id) || 0; }));
    return maxId + 1;
  }

  // ── Public ─────────────────────────────────────────────────

  function getKelas(session) {
    var rows = getAllRows();
    // Enrich dengan nama walikelas
    var users = UserService.getAllRows();
    var userMap = {};
    users.forEach(function (u) { userMap[String(u.id)] = String(u.nama_lengkap); });

    var enriched = rows.map(function (r) {
      var tglStr = '';
      if (r.created_at) {
        try {
          tglStr = Utilities.formatDate(new Date(r.created_at), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
        } catch (e) {
          tglStr = String(r.created_at);
        }
      }
      return {
        id:              r.id,
        nama_kelas:      String(r.nama_kelas || ''),
        walikelas_id:    r.walikelas_id ? String(r.walikelas_id) : '',
        nama_walikelas:  userMap[String(r.walikelas_id)] || '-',
        created_at:      tglStr
      };
    });
    return { ok: true, data: enriched };
  }

  function createKelas(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.nama_kelas) return { ok: false, msg: 'Nama kelas wajib diisi.' };

    var namaBaru = String(data.nama_kelas).trim();

    // Cek duplikasi nama
    var rows = getAllRows();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].nama_kelas).toLowerCase() === namaBaru.toLowerCase()) {
        return { ok: false, msg: 'Nama kelas sudah ada.' };
      }
    }

    var id = nextId();
    getSheet().appendRow([id, namaBaru, data.walikelas_id ? String(data.walikelas_id) : '', new Date()]);
    return { ok: true, msg: 'Kelas berhasil dibuat.', id: id };
  }

  function updateKelas(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.id) return { ok: false, msg: 'ID kelas wajib diisi.' };

    var rowNum = findRowById(data.id);
    if (rowNum === -1) return { ok: false, msg: 'Kelas tidak ditemukan.' };

    var sheet = getSheet();
    var row   = sheet.getRange(rowNum, 1, 1, 4).getValues()[0];

    if (data.nama_kelas !== undefined && data.nama_kelas !== null) {
      row[1] = String(data.nama_kelas).trim();
    }
    if (data.walikelas_id !== undefined) {
      row[2] = data.walikelas_id ? String(data.walikelas_id) : '';
    }

    sheet.getRange(rowNum, 1, 1, 4).setValues([row]);
    return { ok: true, msg: 'Kelas berhasil diupdate.' };
  }

  function deleteKelas(session, data) {
    if (!['superadmin', 'admin'].includes(session.role)) {
      return { ok: false, msg: 'Akses ditolak.' };
    }
    if (!data.id) return { ok: false, msg: 'ID kelas wajib diisi.' };

    var rowNum = findRowById(data.id);
    if (rowNum === -1) return { ok: false, msg: 'Kelas tidak ditemukan.' };

    getSheet().deleteRow(rowNum);
    return { ok: true, msg: 'Kelas berhasil dihapus.' };
  }

  function findById(id) {
    var rows = getAllRows();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id == id) return rows[i];
    }
    return null;
  }

  return {
    getKelas:    getKelas,
    createKelas: createKelas,
    updateKelas: updateKelas,
    deleteKelas: deleteKelas,
    findById:    findById,
    getAllRows:   getAllRows
  };

})();
