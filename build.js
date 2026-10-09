// ============================================================
// build.js — Assembles public/index.html from components
// ============================================================

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

let mainHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Replace all <?!= include('PageX'); ?> with file content
const includeRegex = /<\?!=\s*include\(['"]([^'"]+)['"]\);\s*\?>/g;
mainHtml = mainHtml.replace(includeRegex, (match, filename) => {
  const filePath = path.join(__dirname, `${filename}.html`);
  if (fs.existsSync(filePath)) {
    console.log(`Menggabungkan component: ${filename}.html`);
    return fs.readFileSync(filePath, 'utf8');
  } else {
    console.warn(`Peringatan: File ${filename}.html tidak ditemukan.`);
    return '';
  }
});

// Ganti APP_URL
mainHtml = mainHtml.replace(
  /const\s+APP_URL\s*=\s*['"][^'"]*['"];/,
  "const APP_URL = '/api';"
);

// Ganti method api() google.script.run dengan modern fetch
const oldApiRegex = /\/\/\s*──\s*API Helper: google\.script\.run[\s\S]*?async\s+api\(action,\s*data\s*=\s*\{\}\)\s*\{[\s\S]*?\},(?=\s*\n\s*showToast)/;

const newApiMethod = `// ── API Helper: Modern Fetch API ke /api ──
    async api(action, data = {}) {
      this.loading = true;
      const payload = { action, token: this.token, data };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(APP_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.token ? { 'Authorization': 'Bearer ' + this.token } : {})
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const result = await res.json();
        this.loading = false;

        if (result && !result.ok && result.msg && (result.msg.includes('Sesi habis') || result.msg.includes('Silakan login ulang'))) {
          this.doLogout();
          this.showToast(result.msg, 'err');
          return result;
        }

        return result || { ok: false, msg: 'Respon server kosong.' };
      } catch (err) {
        this.loading = false;
        const msg = (err.name === 'AbortError') 
          ? 'Koneksi timeout (30s). Silakan coba lagi.' 
          : 'Gagal terhubung ke server: ' + err.message;
        this.showToast(msg, 'err');
        return { ok: false, msg: msg };
      }
    },`;

if (oldApiRegex.test(mainHtml)) {
  mainHtml = mainHtml.replace(oldApiRegex, newApiMethod);
  console.log('API client berhasil diperbarui ke Fetch API.');
} else {
  console.warn('Regex api() tidak cocok, mencari alternatif replace...');
  // Alternatif replace jika komentar sedikit berbeda
  const altRegex = /async\s+api\(action,\s*data\s*=\s*\{\}\)\s*\{[\s\S]*?\},(?=\s*\n\s*showToast)/;
  if (altRegex.test(mainHtml)) {
    mainHtml = mainHtml.replace(altRegex, newApiMethod);
    console.log('API client berhasil diperbarui ke Fetch API via alt.');
  }
}

fs.writeFileSync(path.join(publicDir, 'index.html'), mainHtml, 'utf8');
console.log('✅ public/index.html berhasil dibuat!');
