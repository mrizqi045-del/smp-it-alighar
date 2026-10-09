// ============================================================
// server.js — Local Development Runner
// ============================================================

const app = require('./api/index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Server SMP IT Alighar aktif: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
