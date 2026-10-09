-- ============================================================
-- SMP ISLAM TERPADU ALIGHAR - Database Schema (Neon PostgreSQL)
-- ============================================================

-- 1. Table Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    nama_lengkap VARCHAR(255) NOT NULL,
    jenis_kelamin VARCHAR(1) DEFAULT 'L',
    kelas_id VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table Kelas
CREATE TABLE IF NOT EXISTS kelas (
    id SERIAL PRIMARY KEY,
    nama_kelas VARCHAR(100) UNIQUE NOT NULL,
    walikelas_id VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Table Laporan Sholat
CREATE TABLE IF NOT EXISTS laporan_sholat (
    id SERIAL PRIMARY KEY,
    siswa_id INT NOT NULL,
    tanggal DATE NOT NULL,
    waktu_sholat VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    dilaporkan_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_laporan_siswa_tanggal_waktu UNIQUE (siswa_id, tanggal, waktu_sholat)
);

CREATE INDEX IF NOT EXISTS idx_laporan_tgl_siswa ON laporan_sholat (tanggal, siswa_id);

-- 4. Table Setting Sholat
CREATE TABLE IF NOT EXISTS setting_sholat (
    id SERIAL PRIMARY KEY,
    tipe_hari VARCHAR(50) NOT NULL,
    waktu_sholat VARCHAR(20) NOT NULL,
    wajib_lapor BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unique_tipe_waktu UNIQUE (tipe_hari, waktu_sholat)
);

-- 5. Table Setting Lokasi
CREATE TABLE IF NOT EXISTS setting_lokasi (
    id SERIAL PRIMARY KEY,
    nama_kota VARCHAR(255) DEFAULT 'KAB. KOTAWARINGIN TIMUR (Kalimantan Tengah)',
    zona_waktu VARCHAR(50) DEFAULT 'WIB',
    jadwal JSONB NOT NULL DEFAULT '{"subuh":"03:57","dzuhur":"11:19","ashar":"14:25","maghrib":"17:23","isya":"18:32"}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Table Kalender Hari
CREATE TABLE IF NOT EXISTS kalender_hari (
    id SERIAL PRIMARY KEY,
    tanggal DATE UNIQUE NOT NULL,
    tipe_hari VARCHAR(50) NOT NULL,
    keterangan TEXT
);

-- ============================================================
-- DATA AWAL (SEED DATA)
-- ============================================================

-- Default Akun Superadmin: username 'superadmin', password 'admin123'
INSERT INTO users (username, password_hash, role, nama_lengkap, jenis_kelamin, is_active)
VALUES (
    'superadmin',
    'admin123',
    'superadmin',
    'Super Admin',
    'L',
    TRUE
)
ON CONFLICT (username) DO UPDATE SET password_hash = 'admin123';

-- Default Setting Sholat Hari Sekolah (Senin-Jumat, Dzuhur & Ashar default false, Jumat otomatis wajib di backend)
INSERT INTO setting_sholat (tipe_hari, waktu_sholat, wajib_lapor) VALUES
('hari_sekolah', 'subuh', TRUE),
('hari_sekolah', 'dzuhur', FALSE),
('hari_sekolah', 'ashar', FALSE),
('hari_sekolah', 'maghrib', TRUE),
('hari_sekolah', 'isya', TRUE)
ON CONFLICT (tipe_hari, waktu_sholat) DO NOTHING;

-- Default Setting Sholat Hari Libur (Sabtu-Minggu, semua wajib)
INSERT INTO setting_sholat (tipe_hari, waktu_sholat, wajib_lapor) VALUES
('hari_libur', 'subuh', TRUE),
('hari_libur', 'dzuhur', TRUE),
('hari_libur', 'ashar', TRUE),
('hari_libur', 'maghrib', TRUE),
('hari_libur', 'isya', TRUE)
ON CONFLICT (tipe_hari, waktu_sholat) DO NOTHING;

-- Default Setting Lokasi (KAB. KOTAWARINGIN TIMUR - WIB)
INSERT INTO setting_lokasi (id, nama_kota, zona_waktu, jadwal)
VALUES (
    1,
    'KAB. KOTAWARINGIN TIMUR (Kalimantan Tengah)',
    'WIB',
    '{"subuh":"03:57","dzuhur":"11:19","ashar":"14:25","maghrib":"17:23","isya":"18:32"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    nama_kota = EXCLUDED.nama_kota,
    zona_waktu = EXCLUDED.zona_waktu,
    jadwal = EXCLUDED.jadwal;
