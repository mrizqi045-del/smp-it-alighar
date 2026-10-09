// ============================================================
// lib/db.js — Neon PostgreSQL Database Connection
// ============================================================

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('Peringatan: DATABASE_URL belum disetel di environment variables.');
    }
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  return await p.query(text, params);
}

module.exports = {
  getPool,
  query
};
