import React from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UpdateModal } from './components/UpdateModal';
import { LoginView } from './views/LoginView';

// Views
import { SayimView } from './views/SayimView';
import { SevkView } from './views/SevkView';
import { DepoFisleriView } from './views/DepoFisleriView';
import { UrunAlisFaturalariView } from './views/UrunAlisFaturalariView';
import { FiyatGorView } from './views/FiyatGorView';
import { SiparislerView } from './views/SiparislerView';
import { SettingsView } from './views/SettingsView';

export const App: React.FC = () => {
  const { authSession, setAuthSession, activeTab, hasPerm } = useApp();

  // 1. OTURUM AÇILMAMIŞSA -> GİRİŞ EKRANI (Hızlı PIN / Şifre)
  if (!authSession) {
    return <LoginView onLoginSuccess={setAuthSession} />;
  }

  // 2. Modül İzin Kontrolü ile Görünüm Seçimi
  const renderActiveView = () => {
    switch (activeTab) {
      case 'sayim':
        if (!hasPerm('MODULE_SAYIM')) {
          return (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Bu modüle erişim yetkiniz bulunmamaktadır (MODULE_SAYIM).
            </div>
          );
        }
        return <SayimView />;
      case 'sevk':
        if (!hasPerm('MODULE_SEVK')) {
          return (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Bu modüle erişim yetkiniz bulunmamaktadır (MODULE_SEVK).
            </div>
          );
        }
        return <SevkView />;
      case 'fisler':
        return <DepoFisleriView />;
      case 'alis-faturalari':
        return <UrunAlisFaturalariView />;
      case 'fiyat-gor':
        if (!hasPerm('MODULE_FIYAT_GOR')) {
          return (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Bu modüle erişim yetkiniz bulunmamaktadır (MODULE_FIYAT_GOR).
            </div>
          );
        }
        return <FiyatGorView />;
      case 'siparisler':
        return <SiparislerView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <SayimView />;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <Header />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Dynamic Active View */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {renderActiveView()}
        </main>
      </div>

      {/* GitHub Auto-Update Modal */}
      <UpdateModal />
    </div>
  );
};
