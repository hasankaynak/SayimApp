import { contextBridge, ipcRenderer } from 'electron';

export interface IElectronAPI {
  getVersion: () => Promise<string>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  executeSql: (url: string, query: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  authLogin: (payload: any) => Promise<any>;
  checkForUpdates: () => Promise<{ success: boolean; result?: any; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  onUpdaterStatus: (callback: (data: any) => void) => () => void;
  openExternal: (url: string) => void;
}

const api: IElectronAPI = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  executeSql: (url: string, query: string) => ipcRenderer.invoke('api:execute-sql', { url, query }),
  authLogin: (payload: any) => ipcRenderer.invoke('api:auth-login', payload),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('updater:status', subscription);
    return () => {
      ipcRenderer.removeListener('updater:status', subscription);
    };
  },
  openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url),
};

contextBridge.exposeInMainWorld('electronAPI', api);
