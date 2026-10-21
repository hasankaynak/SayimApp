import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import axios from 'axios';
import { setupAutoUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;

const AUTH_LOGIN_URL = 'https://mehmetdogrultd.com/ekatalog/panel_9x7q2w3e/api/mobil-auth-api.php?action=mobile_login';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'MD Ticaret - Depo, Sevk ve Sayım Yönetimi',
    frame: true,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow local HTTP queries to 185.136.205.19
      allowRunningInsecureContent: true,
    },
  });

  // Load URL
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window Controls IPC
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  ipcMain.on('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url);
  });

  // Native Node SQL Executor (immune to browser CORS or Mixed Content restrictions)
  ipcMain.handle('api:execute-sql', async (_event, { url, query }: { url: string; query: string }) => {
    try {
      const response = await axios.post(
        url,
        { query },
        { headers: { 'Content-Type': 'application/json' }, timeout: 35000 }
      );
      return { success: true, data: response.data?.data || response.data || [] };
    } catch (err: any) {
      console.error('[Main] SQL execution error:', err.message);
      return {
        success: false,
        error: err.response?.data?.error || err.response?.data?.message || err.message,
      };
    }
  });

  // Native Auth Login proxy
  ipcMain.handle('api:auth-login', async (_event, payload: any) => {
    try {
      const response = await axios.post(AUTH_LOGIN_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return response.data;
    } catch (err: any) {
      console.error('[Main] Auth error:', err.message);
      return {
        success: false,
        error: err.response?.data?.error || err.response?.data?.message || err.message,
      };
    }
  });

  // Setup GitHub auto updater
  setupAutoUpdater(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
