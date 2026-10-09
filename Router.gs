// ============================================================
// Router.gs — Middleware: session inject ke setiap request
// ============================================================
// Override doPost di Code.gs agar inject session otomatis
// Taruh file ini SEBELUM Code.gs dalam urutan load GAS

// Tambahkan fungsi ini di Code.gs.doPost() — session resolve:

function resolveSession(payload) {
  var token = payload.token || null;
  if (!token) return null;
  return AuthService.getSession(token);
}

// Fungsi helper: cek apakah role punya akses
function requireRole(session, allowedRoles) {
  if (!session) return { ok: false, msg: 'Belum login.' };
  if (!allowedRoles.includes(session.role)) return { ok: false, msg: 'Akses ditolak.' };
  return null;
}
