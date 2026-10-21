import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, DEFAULT_API_URL } from '../services/api';
import { updateService, CURRENT_DESKTOP_VERSION, GITHUB_OWNER, GITHUB_REPO } from '../services/updater';
import { sounds } from '../services/sound';
import { 
  Settings, 
  Server, 
  ShieldCheck, 
  Volume2, 
  Sparkles, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Building2,
  HardDrive
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { 
    warehouses, 
    activeWarehouse, 
    setActiveWarehouse, 
    checkConnection, 
    serverDetails,
    updateStatus,
    checkForUpdates,
    setShowUpdateModal
  } = useApp();

  const [apiUrl, setApiUrl] = useState(api.getApiUrl());
  const [safeMode, setSafeMode] = useState(api.isSafeTestMode());
  const [soundEnabled, setSoundEnabled] = useState(sounds.isEnabled());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSaveApiUrl = async () => {
    api.setApiUrl(apiUrl);
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection();
      setTestResult(res);
      if (res.success) {
        sounds.playSuccess();
        await checkConnection();
      } else {
        sounds.playError();
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetApiUrl = () => {
    setApiUrl(DEFAULT_API_URL);
    api.setApiUrl(DEFAULT_API_URL);
  };

  const handleToggleSafeMode = (val: boolean) => {
    setSafeMode(val);
    api.setSafeTestMode(val);
  };

  const handleToggleSound = (val: boolean) => {
    setSoundEnabled(val);
    sounds.setEnabled(val);
    if (val) sounds.playScanBeep();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-y-auto select-none p-8 space-y-8">
      
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center space-x-2">
          <Settings className="w-6 h-6 text-slate-400" />
          <span>Sistem Ayarları & Entegrasyon</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Mikro ERP veritabanı bağlantısı, donanım tercihleri ve GitHub otomatik güncelleme yönetimi
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. Mikro ERP SQL Server Bağlantısı */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Mikro ERP API Endpoint</h2>
              <p className="text-[11px] text-slate-400">SQL Server sorgu sunucusu URL adresi</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Sunucu URL Adresi</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSaveApiUrl}
                  disabled={isTesting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Test Et & Kaydet</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Varsayılan: {DEFAULT_API_URL}</span>
              <button onClick={handleResetApiUrl} className="text-blue-400 hover:underline">
                Sıfırla
              </button>
            </div>

            {testResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center space-x-2 ${
                testResult.success 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {serverDetails && (
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                <div>Sunucu: <strong className="text-slate-200">{serverDetails.ServerName}</strong></div>
                <div>Veritabanı: <strong className="text-slate-200">{serverDetails.DbName}</strong></div>
                <div>Sunucu Saati: <strong className="text-slate-200">{serverDetails.ServerTime}</strong></div>
              </div>
            )}
          </div>
        </div>

        {/* 2. GitHub Otomatik Güncelleme Yönetimi */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">GitHub Otomatik Güncelleme</h2>
              <p className="text-[11px] text-slate-400">{GITHUB_OWNER}/{GITHUB_REPO} Repository</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div>
                <div className="text-[11px] text-slate-500">Mevcut Masaüstü Sürümü</div>
                <div className="text-base font-mono font-bold text-slate-200">v{CURRENT_DESKTOP_VERSION}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">En Son GitHub Sürümü</div>
                <div className="text-base font-mono font-bold text-blue-400">
                  {updateStatus.version || 'Denetlenmedi'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => checkForUpdates()}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-blue-400" />
                <span>Güncellemeleri Denetle</span>
              </button>

              <button
                onClick={() => setShowUpdateModal(true)}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
              >
                <span>Güncelleme Ekranını Aç</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Masaüstü uygulaması başlatıldığında arka planda GitHub Releases API'sini ve electron-updater'ı kontrol eder. Yeni bir sürüm yayınlandığında otomatik bildirim gösterilir.
            </p>
          </div>
        </div>

        {/* 3. Depo & Donanım Ayarları */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Varsayılan Depo Tercihi</h2>
              <p className="text-[11px] text-slate-400">Sayım ve fişlerde otomatik seçilen depo</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Varsayılan Depo</label>
            <select
              value={activeWarehouse?.dep_no || ''}
              onChange={(e) => {
                const w = warehouses.find(wh => wh.dep_no === Number(e.target.value));
                if (w) setActiveWarehouse(w);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-200 outline-none"
            >
              {warehouses.map(w => (
                <option key={w.dep_no} value={w.dep_no}>[{w.dep_no}] {w.dep_adi}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Güvenlik & Sesli Bildirimler */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Ses ve Güvenlik Koruması</h2>
              <p className="text-[11px] text-slate-400">Barkod okuma sesleri ve güvenli simülasyon</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-slate-200">Sesli Uyarılar</div>
                <div className="text-[11px] text-slate-500">Barkod okutulduğunda ses efekti çal</div>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => handleToggleSound(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-slate-200">🛡️ Güvenli Test Modu (Safe Mode)</div>
                <div className="text-[11px] text-slate-500">Mikro ERP'ye gerçek yazma yapmaz, simüle eder</div>
              </div>
              <input
                type="checkbox"
                checked={safeMode}
                onChange={(e) => handleToggleSafeMode(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 cursor-pointer"
              />
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => sounds.playScanBeep()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
              >
                Bip Test
              </button>
              <button
                onClick={() => sounds.playSuccess()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
              >
                Başarılı Ses Test
              </button>
              <button
                onClick={() => sounds.playError()}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700"
              >
                Hata Ses Test
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
