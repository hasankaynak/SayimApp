import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
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
      webSecurity: false,
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

  // Native Node Fetch SQL Executor (completely reliable, no external dependencies, zero CORS)
  ipcMain.handle('api:execute-sql', async (_event, { url, query }: { url: string; query: string }) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(35000),
      });

      if (!response.ok) {
        throw new Error(`HTTP Hata: ${response.status} ${response.statusText}`);
      }

      const resData: any = await response.json();
      return { success: true, data: resData?.data || resData || [] };
    } catch (err: any) {
      console.error('[Main IPC] SQL execution error:', err.message);
      return {
        success: false,
        error: err.message || 'SQL sorgusu yürütülemedi',
      };
    }
  });

  // Native Auth Login proxy via native fetch
  ipcMain.handle('api:auth-login', async (_event, payload: any) => {
    try {
      const response = await fetch(AUTH_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const resData = await response.json();
      return resData;
    } catch (err: any) {
      console.error('[Main IPC] Auth error:', err.message);
      return {
        success: false,
        error: err.message || 'Giriş sunucusuna bağlanılamadı',
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
