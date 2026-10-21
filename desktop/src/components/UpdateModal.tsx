import React from 'react';
import { useApp } from '../context/AppContext';
import { updateService, CURRENT_DESKTOP_VERSION } from '../services/updater';
import { 
  Sparkles, 
  X, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  RefreshCw,
  Clock,
  Check
} from 'lucide-react';

export const UpdateModal: React.FC = () => {
  const { showUpdateModal, setShowUpdateModal, updateStatus, checkForUpdates } = useApp();

  if (!showUpdateModal) return null;

  const isDownloading = updateStatus.state === 'downloading';
  const isDownloaded = updateStatus.state === 'downloaded';
  const isAvailable = updateStatus.state === 'available';
  const isChecking = updateStatus.state === 'checking';
  const isNotAvailable = updateStatus.state === 'not-available';
  const isError = updateStatus.state === 'error';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">GitHub Sürüm & Güncelleme</h2>
              <p className="text-xs text-slate-400">MD Ticaret Depo & Sayım Masaüstü</p>
            </div>
          </div>
          <button
            onClick={() => setShowUpdateModal(false)}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          
          {/* Version Comparison Card */}
          <div className="grid grid-cols-2 gap-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/50">
            <div>
              <div className="text-xs text-slate-400 mb-1">Mevcut Sürüm</div>
              <div className="text-lg font-mono font-bold text-slate-200">
                v{CURRENT_DESKTOP_VERSION}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">En Son GitHub Sürümü</div>
              <div className="text-lg font-mono font-bold text-blue-400 flex items-center space-x-2">
                <span>{updateStatus.version || 'Kontrol Ediliyor...'}</span>
                {isNotAvailable && (
                  <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Güncel
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Durum Bildirimleri */}
          {isChecking && (
            <div className="flex items-center space-x-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
              <div className="text-sm">GitHub üzerinden son sürümler kontrol ediliyor...</div>
            </div>
          )}

          {isNotAvailable && (
            <div className="flex items-center space-x-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                En güncel sürümü kullanıyorsunuz (v{CURRENT_DESKTOP_VERSION}). Yeni bir güncelleme bulunmuyor.
              </div>
            </div>
          )}

          {isError && (
            <div className="flex items-start space-x-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold mb-1">Güncelleme Denetimi Başarısız:</div>
                <div className="text-xs opacity-90">{updateStatus.error}</div>
              </div>
            </div>
          )}

          {/* İndirme İlerlemesi */}
          {isDownloading && (
            <div className="space-y-2 p-4 rounded-xl bg-slate-800/80 border border-blue-500/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Güncelleme İndiriliyor...</span>
                <span className="text-blue-400 font-mono font-bold">{updateStatus.percent || 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${updateStatus.percent || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                İndirme tamamlandığında uygulama tek tıkla güncellenecektir.
              </p>
            </div>
          )}

          {/* İndirildi Hazır Bildirimi */}
          {isDownloaded && (
            <div className="flex items-center space-x-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                Güncelleme başarıyla indirildi. Yüklemek için uygulamayı şimdi yeniden başlatabilirsiniz.
              </div>
            </div>
          )}

          {/* Sürüm Notları (Changelog) */}
          {updateStatus.releaseNotes && (
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Sürüm Notları & Yenilikler:</span>
              </div>
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {updateStatus.releaseNotes}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-850 flex items-center justify-between">
          <button
            onClick={() => checkForUpdates()}
            disabled={isChecking || isDownloading}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>Tekrar Denetle</span>
          </button>

          <div className="flex items-center space-x-3">
            {updateStatus.downloadUrl && (
              <button
                onClick={() => updateService.openExternal(updateStatus.downloadUrl!)}
                className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
              >
                <span>GitHub Sayfası</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            {isDownloaded ? (
              <button
                onClick={() => updateService.installUpdate()}
                className="flex items-center space-x-2 text-xs font-semibold text-white px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/30"
              >
                <Check className="w-4 h-4" />
                <span>Yeniden Başlat & Güncelle</span>
              </button>
            ) : isAvailable ? (
              <button
                onClick={() => updateService.downloadUpdate()}
                disabled={isDownloading}
                className="flex items-center space-x-2 text-xs font-semibold text-white px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Güncellemeyi İndir</span>
              </button>
            ) : (
              <button
                onClick={() => setShowUpdateModal(false)}
                className="text-xs font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
              >
                Kapat
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
