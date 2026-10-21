import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CURRENT_DESKTOP_VERSION } from '../services/updater';
import { 
  Building2, 
  Wifi, 
  WifiOff, 
  Barcode, 
  Sparkles, 
  RefreshCw, 
  Clock, 
  User,
  LogOut,
  Download
} from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    authSession,
    logout,
    warehouses, 
    activeWarehouse, 
    setActiveWarehouse, 
    isConnected, 
    checkConnection, 
    updateStatus, 
    setShowUpdateModal 
  } = useApp();

  const [time, setTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkConnection();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const hasUpdate = updateStatus.state === 'available' || updateStatus.state === 'downloaded';

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between select-none shadow-md z-20">
      {/* Sol: Logo ve Uygulama Adı */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-bold text-xl tracking-wider">
          MD
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-semibold text-slate-100 text-base leading-tight">MD Ticaret</h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
              Desktop ERP
            </span>
          </div>
          <p className="text-xs text-slate-400">Depo, Sevk, Fişler & Sayım Sistemi</p>
        </div>
      </div>

      {/* Orta: Aktif Depo Seçimi */}
      <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-inner">
        <Building2 className="w-4 h-4 text-orange-400" />
        <span className="text-xs text-slate-400 font-medium">Aktif Depo:</span>
        <select
          value={activeWarehouse?.dep_no || ''}
          onChange={(e) => {
            const selected = warehouses.find(w => w.dep_no === Number(e.target.value));
            if (selected) setActiveWarehouse(selected);
          }}
          className="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer pr-2 hover:text-white"
        >
          {warehouses.length === 0 && <option value="">Depo Yükleniyor...</option>}
          {warehouses.map((w) => (
            <option key={w.dep_no} value={w.dep_no} className="bg-slate-800 text-slate-200">
              [{w.dep_no}] {w.dep_adi}
            </option>
          ))}
        </select>
      </div>

      {/* Sağ: Giriş Yapan Kullanıcı, Durum Göstergeleri, Güncelleme & Çıkış */}
      <div className="flex items-center space-x-3">
        {/* Kullanıcı Profili */}
        {authSession && (
          <div className="flex items-center space-x-2 bg-slate-800/60 px-3 py-1 rounded-lg border border-slate-700/50">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold border border-orange-500/30">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-slate-200 leading-tight">
                {authSession.user.display_name || authSession.user.username}
              </div>
              <div className="text-[10px] text-orange-400/80 font-mono">
                {authSession.user.role_name} {authSession.user.mikro_user_no ? `(Mikro: ${authSession.user.mikro_user_no})` : ''}
              </div>
            </div>
          </div>
        )}

        {/* USB Barkod Tabancası Durumu */}
        <div className="flex items-center space-x-1.5 bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700/40" title="USB Barkod Okuyucu hazır (Otomatik dinleme devrede)">
          <Barcode className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-300 font-mono hidden md:inline">Barkod Aktif</span>
        </div>

        {/* Mikro ERP Sunucu Durumu */}
        <div 
          onClick={handleRefresh}
          className={`flex items-center space-x-2 px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
            isConnected 
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40' 
              : 'bg-rose-950/30 border-rose-500/30 text-rose-300 hover:bg-rose-900/40'
          }`}
          title="Mikro SQL Server Bağlantısı (Yenilemek için tıklayın)"
        >
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium">Mikro Bağlı</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-medium">Bağlantı Yok</span>
            </>
          )}
          <RefreshCw className={`w-3 h-3 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
        </div>

        {/* GitHub Güncelleme Butonu */}
        <button
          onClick={() => setShowUpdateModal(true)}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
            hasUpdate
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse hover:bg-amber-500/30'
              : 'bg-slate-800/60 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
          title="GitHub Güncellemelerini Görüntüle"
        >
          {hasUpdate ? (
            <>
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Yeni Sürüm ({updateStatus.version})</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              <span>v{CURRENT_DESKTOP_VERSION}</span>
            </>
          )}
        </button>

        {/* Dijital Saat */}
        <div className="flex items-center space-x-1.5 text-slate-400 bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-700/30 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{time}</span>
        </div>

        {/* Çıkış Yap Butonu */}
        {authSession && (
          <button
            onClick={logout}
            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors"
            title="Oturumu Kapat"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
