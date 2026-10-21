import React from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { UpdateModal } from './components/UpdateModal';

// Views
import { SayimView } from './views/SayimView';
import { SevkView } from './views/SevkView';
import { DepoFisleriView } from './views/DepoFisleriView';
import { UrunAlisFaturalariView } from './views/UrunAlisFaturalariView';
import { FiyatGorView } from './views/FiyatGorView';
import { SiparislerView } from './views/SiparislerView';
import { SettingsView } from './views/SettingsView';

export const App: React.FC = () => {
  const { activeTab } = useApp();

  const renderActiveView = () => {
    switch (activeTab) {
      case 'sayim':
        return <SayimView />;
      case 'sevk':
        return <SevkView />;
      case 'fisler':
        return <DepoFisleriView />;
      case 'alis-faturalari':
        return <UrunAlisFaturalariView />;
      case 'fiyat-gor':
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
