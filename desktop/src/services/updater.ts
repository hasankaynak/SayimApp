import axios from 'axios';
import { GitHubRelease } from '../types';

export const CURRENT_DESKTOP_VERSION = '1.0.0';
export const GITHUB_OWNER = 'hasankaynak';
export const GITHUB_REPO = 'SayimApp';
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
  downloadUrl?: string;
}

export function parseSemver(v: string): number[] {
  const clean = (v || '').replace(/^[vV]/, '').trim();
  return clean.split('.').map(p => parseInt(p, 10) || 0);
}

export function isNewerVersion(latest: string, current: string): boolean {
  const l = parseSemver(latest);
  const c = parseSemver(current);
  const len = Math.max(l.length, c.length, 3);
  for (let i = 0; i < len; i++) {
    const lVal = l[i] || 0;
    const cVal = c[i] || 0;
    if (lVal > cVal) return true;
    if (lVal < cVal) return false;
  }
  return false;
}

export class UpdateService {
  private listeners: ((status: UpdateStatus) => void)[] = [];
  private currentStatus: UpdateStatus = { state: 'idle' };

  constructor() {
    this.initElectronListener();
  }

  private initElectronListener() {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onUpdaterStatus) {
      (window as any).electronAPI.onUpdaterStatus((data: any) => {
        if (!data) return;
        if (data.status === 'checking') {
          this.setStatus({ state: 'checking' });
        } else if (data.status === 'available') {
          this.setStatus({
            state: 'available',
            version: data.version,
            releaseDate: data.releaseDate,
            releaseNotes: typeof data.releaseNotes === 'string' ? data.releaseNotes : undefined,
          });
        } else if (data.status === 'not-available') {
          this.setStatus({ state: 'not-available', version: data.version });
        } else if (data.status === 'downloading') {
          this.setStatus({
            state: 'downloading',
            percent: Math.round(data.percent || 0),
          });
        } else if (data.status === 'downloaded') {
          this.setStatus({ state: 'downloaded', version: data.version });
        } else if (data.status === 'error') {
          this.setStatus({ state: 'error', error: data.message });
        }
      });
    }
  }

  public subscribe(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private setStatus(status: UpdateStatus) {
    this.currentStatus = { ...this.currentStatus, ...status };
    this.listeners.forEach(fn => fn(this.currentStatus));
  }

  public getStatus(): UpdateStatus {
    return this.currentStatus;
  }

  /**
   * Check for updates both via Electron AutoUpdater and direct GitHub Releases API
   */
  public async checkForUpdates(): Promise<UpdateStatus> {
    this.setStatus({ state: 'checking', error: undefined });

    const electronAPI = (window as any).electronAPI;

    // 1. If running inside Electron, trigger electron-updater
    if (electronAPI?.checkForUpdates) {
      try {
        await electronAPI.checkForUpdates();
      } catch (err: any) {
        console.warn('[Updater] electronAPI.checkForUpdates failed, falling back to GitHub API:', err);
      }
    }

    // 2. Also check GitHub API directly to ensure instant detection & changelog details
    try {
      const res = await axios.get<GitHubRelease>(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        timeout: 10000,
      });

      const release = res.data;
      const latestTag = release.tag_name || release.name || '';
      const hasNewer = isNewerVersion(latestTag, CURRENT_DESKTOP_VERSION);

      // Find Windows executable asset if any
      const exeAsset = release.assets?.find(a => a.name.endsWith('.exe'));

      if (hasNewer) {
        const updateInfo: UpdateStatus = {
          state: 'available',
          version: latestTag,
          releaseDate: release.published_at,
          releaseNotes: release.body,
          downloadUrl: exeAsset ? exeAsset.browser_download_url : release.html_url,
        };
        this.setStatus(updateInfo);
        return updateInfo;
      } else {
        const updateInfo: UpdateStatus = {
          state: 'not-available',
          version: CURRENT_DESKTOP_VERSION,
        };
        this.setStatus(updateInfo);
        return updateInfo;
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'GitHub güncelleme kontrolü başarısız oldu.';
      const errorStatus: UpdateStatus = { state: 'error', error: errMsg };
      this.setStatus(errorStatus);
      return errorStatus;
    }
  }

  public async downloadUpdate(): Promise<void> {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.downloadUpdate) {
      this.setStatus({ state: 'downloading', percent: 0 });
      try {
        await electronAPI.downloadUpdate();
      } catch (err: any) {
        this.setStatus({ state: 'error', error: err.message });
      }
    } else if (this.currentStatus.downloadUrl) {
      // In browser or fallback mode, open download URL
      this.openExternal(this.currentStatus.downloadUrl);
    }
  }

  public installUpdate(): void {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.installUpdate) {
      electronAPI.installUpdate();
    }
  }

  public openExternal(url: string) {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(url);
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }
}

export const updateService = new UpdateService();
