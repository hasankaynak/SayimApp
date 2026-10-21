import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ActiveTab } from '../types';
import { 
  ClipboardList, 
  Truck, 
  FileSpreadsheet, 
  Receipt, 
  Tag, 
  ShoppingBag, 
  Settings,
  ChevronRight,
  Database
} from 'lucide-react';

interface NavItem {
  id: ActiveTab;
  title: string;
  subtitle: string;
  code: string;
  icon: React.ComponentType<{ className?: string }>;
  hotkey: string;
  color: string;
}

const navItems: NavItem[] = [
  {
    id: 'sayim',
    title: 'Depo Sayımı',
    subtitle: 'El Terminali / Barkod Sayım',
    code: '012800',
    icon: ClipboardList,
    hotkey: 'Ctrl+1',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'sevk',
    title: 'Depolar Arası Sevk',
    subtitle: 'İki Depo Arası Transfer',
    code: '012500',
    icon: Truck,
    hotkey: 'Ctrl+2',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'fisler',
    title: 'Depo Fişleri',
    subtitle: 'Giriş, Çıkış & Virman',
    code: '012160/250',
    icon: FileSpreadsheet,
    hotkey: 'Ctrl+3',
    color: 'from-violet-500 to-purple-600',
  },
  {
    id: 'alis-faturalari',
    title: 'Ürün Alış Faturaları',
    subtitle: 'Gelen Faturalar & Fiyatlar',
    code: 'STH-03/00',
    icon: Receipt,
    hotkey: 'Ctrl+4',
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'fiyat-gor',
    title: 'Fiyat Gör & Stok Detay',
    subtitle: 'Hızlı Fiyat & Envanter Sorgu',
    code: 'FİYAT-GÖR',
    icon: Tag,
    hotkey: 'Ctrl+5',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'siparisler',
    title: 'Siparişler & Cari',
    subtitle: 'Bekleyen Sipariş Listesi',
    code: '031110',
    icon: ShoppingBag,
    hotkey: 'Ctrl+6',
    color: 'from-rose-500 to-pink-600',
  },
  {
    id: 'settings',
    title: 'Sistem Ayarları',
    subtitle: 'API, Donanım & Güncelleme',
    code: 'AYARLAR',
    icon: Settings,
    hotkey: 'Ctrl+7',
    color: 'from-slate-500 to-slate-700',
  },
];

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  // Keyboard shortcut listeners (Ctrl + 1-7)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const keyNum = parseInt(e.key, 10);
        if (keyNum >= 1 && keyNum <= navItems.length) {
          e.preventDefault();
          setActiveTab(navItems[keyNum - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
      {/* Üst: Menü Başlığı & Nav Listesi */}
      <div className="py-4">
        <div className="px-4 mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Modüller & İşlemler
          </span>
          <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
            Ctrl+1..7
          </span>
        </div>

        <nav className="space-y-1.5 px-3">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left relative ${
                  isActive
                    ? 'bg-slate-800/90 text-white shadow-md border border-slate-700/80'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-500" />
                )}

                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      isActive
                        ? `bg-gradient-to-tr ${item.color} text-white shadow-md`
                        : 'bg-slate-800 text-slate-400 group-hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="text-sm font-medium leading-tight truncate">{item.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{item.subtitle}</div>
                  </div>
                </div>

                <div className="flex flex-col items-end ml-2 shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1 py-0.5 rounded">
                    {item.hotkey}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Alt: Mikro Kullanıcı ve Entegrasyon Kartı */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/50">
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
            <Database className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-200 truncate">Mikro Entegre</div>
            <div className="text-[11px] text-slate-400 truncate">Kullanıcı: 1 - YÖNETİCİ</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
