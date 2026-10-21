import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

export function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    win.webContents.send('updater:status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    win.webContents.send('updater:status', {
      status: 'not-available',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    win.webContents.send('updater:status', {
      status: 'error',
      message: err == null ? 'Bilinmeyen hata' : (err.stack || err).toString(),
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    win.webContents.send('updater:status', {
      status: 'downloading',
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
    });
  });

  // Renderer IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });
}
