// ============================================================
// api/index.js — Vercel Serverless Function & Express Router
// ============================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const auth = require('../lib/auth');
const userService = require('../lib/userService');
const kelasService = require('../lib/kelasService');
const settingService = require('../lib/settingService');
const sholatService = require('../lib/sholatService');
const dashboardService = require('../lib/dashboardService');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'SMP ISLAM TERPADU ALIGHAR', timestamp: new Date().toISOString() });
});

// Central Action Dispatcher
app.post(['/api', '/api/index'], async (req, res) => {
  try {
    const payload = req.body || {};
    const action  = payload.action;
    const data    = payload.data || {};
    let token     = payload.token || payload._token || null;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    const session = auth.getSession(token);

    // Route tanpa auth
    if (action === 'login') {
      const result = await auth.login(data);
      return res.json(result);
    }

    // Butuh auth
    if (!session) {
      return res.json({ ok: false, msg: 'Sesi habis. Silakan login ulang.' });
    }

    let result;
    switch (action) {
      case 'logout':
        result = auth.logout();
        break;
      case 'gantiPassword':
        result = await auth.gantiPassword(session, data);
        break;
      case 'getUsers':
        result = await userService.getUsers(session);
        break;
      case 'createUser':
        result = await userService.createUser(session, data);
        break;
      case 'updateUser':
        result = await userService.updateUser(session, data);
        break;
      case 'deleteUser':
        result = await userService.deleteUser(session, data);
        break;
      case 'resetPassword':
        result = await userService.resetPassword(session, data);
        break;
      case 'getKelas':
        result = await kelasService.getKelas(session);
        break;
      case 'createKelas':
        result = await kelasService.createKelas(session, data);
        break;
      case 'updateKelas':
        result = await kelasService.updateKelas(session, data);
        break;
      case 'deleteKelas':
        result = await kelasService.deleteKelas(session, data);
        break;
      case 'getSetting':
        result = await settingService.getSetting(session);
        break;
      case 'updateSetting':
        result = await settingService.updateSetting(session, data);
        break;
      case 'getKalender':
        result = await settingService.getKalender(session);
        break;
      case 'saveKalender':
        result = await settingService.saveKalender(session, data);
        break;
      case 'deleteKalender':
        result = await settingService.deleteKalender(session, data);
        break;
      case 'getDaftarKota':
        result = await settingService.getDaftarKota(session);
        break;
      case 'fetchJadwalKota':
        result = await settingService.fetchJadwalKota(session, data);
        break;
      case 'saveSettingLokasi':
        result = await settingService.saveSettingLokasi(session, data);
        break;
      case 'getFormHariIni':
        result = await sholatService.getFormHariIni(session);
        break;
      case 'laporSholat':
        result = await sholatService.laporSholat(session, data);
        break;
      case 'getRiwayat':
        result = await sholatService.getRiwayat(session, data);
        break;
      case 'getDashboard':
        result = await dashboardService.getDashboard(session, data);
        break;
      case 'getRekapKelas':
        result = await dashboardService.getRekapKelas(session, data);
        break;
      default:
        result = { ok: false, msg: 'Action tidak dikenal: ' + action };
    }

    return res.json(result);
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ ok: false, msg: 'Server error: ' + err.message });
  }
});

// Fallback routing untuk Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
