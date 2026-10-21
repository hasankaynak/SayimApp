import React, { useState, useEffect } from 'react';
import { OrderItem } from '../types';
import { api } from '../services/api';
import { exportToExcel } from '../services/excel';
import { 
  ShoppingBag, 
  Search, 
  RefreshCw, 
  FileDown, 
  Clock, 
  CheckCircle,
  Calendar,
  Building2
} from 'lucide-react';

export const SiparislerView: React.FC = () => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'bekleyen' | 'tamamlanan'>('bekleyen');
  const [searchText, setSearchText] = useState('');

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const data = await api.getOrders(statusFilter, 150);
      setOrders(data);
    } catch (err: any) {
      alert(`Siparişler alınamadı: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const filteredOrders = orders.filter(o => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      (o.sip_musteri_unvan && o.sip_musteri_unvan.toLowerCase().includes(q)) ||
      (o.sip_stok_isim && o.sip_stok_isim.toLowerCase().includes(q)) ||
      (o.sip_stok_kod && o.sip_stok_kod.toLowerCase().includes(q)) ||
      `${o.sip_evrakno_seri}-${o.sip_evrakno_sira}`.toLowerCase().includes(q)
    );
  });

  const handleExportExcel = () => {
    const exportData = filteredOrders.map((o, idx) => ({
      Sıra: idx + 1,
      Tarih: o.sip_tarih,
      'Evrak No': `${o.sip_evrakno_seri}-${o.sip_evrakno_sira}`,
      'Müşteri / Cari': o.sip_musteri_unvan || o.sip_musteri_kod,
      'Stok Kodu': o.sip_stok_kod,
      'Ürün Adı': o.sip_stok_isim || '',
      'Sipariş Miktarı': o.sip_miktar,
      'Teslim Miktar': o.sip_teslim_miktar,
      'Kalan Miktar': o.sip_kalan_miktar,
      'Birim Fiyat': o.sip_b_fiyat,
      'Toplam Tutar': o.sip_tutar,
      Depo: `[${o.sip_depono}] ${o.sip_depo_adi || ''}`,
    }));
    exportToExcel(exportData, `Siparisler_${statusFilter}_${new Date().toISOString().slice(0, 10)}`);
  };

  const totalPendingQty = filteredOrders.reduce((acc, curr) => acc + curr.sip_kalan_miktar, 0);
  const totalAmount = filteredOrders.reduce((acc, curr) => acc + curr.sip_tutar, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      
      {/* Top Filter Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        
        {/* Status Filter Buttons */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setStatusFilter('bekleyen')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === 'bekleyen'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bekleyen Siparişler
          </button>
          <button
            onClick={() => setStatusFilter('tamamlanan')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === 'tamamlanan'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tamamlananlar
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tüm Siparişler
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center space-x-3 flex-1 max-w-lg justify-end">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Cari, evrak veya stok ara..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <button
            onClick={fetchOrders}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredOrders.length === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-40"
          >
            <FileDown className="w-4 h-4 text-emerald-400" />
            <span>Excel</span>
          </button>
        </div>

      </div>

      {/* KPI Stats Bar */}
      <div className="px-6 py-2.5 bg-slate-900/60 border-b border-slate-800/80 grid grid-cols-3 gap-4">
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Toplam Sipariş Kalemi</div>
          <div className="text-base font-bold font-mono text-white">{filteredOrders.length} Kalem</div>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Bekleyen Kalan Adet</div>
          <div className="text-base font-bold font-mono text-rose-400">{totalPendingQty.toLocaleString('tr-TR')}</div>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Toplam Sipariş Tutarı</div>
          <div className="text-base font-bold font-mono text-amber-400">
            {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <div className="flex-1 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-inner">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 sticky top-0 z-10 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">Evrak No</th>
                  <th className="py-2.5 px-4">Müşteri (Cari Ünvan)</th>
                  <th className="py-2.5 px-3">Stok Kodu</th>
                  <th className="py-2.5 px-4">Ürün Adı</th>
                  <th className="py-2.5 px-3 text-right">Sipariş</th>
                  <th className="py-2.5 px-3 text-right">Teslim</th>
                  <th className="py-2.5 px-3 text-right">Kalan</th>
                  <th className="py-2.5 px-3 text-right">Birim Fiyat</th>
                  <th className="py-2.5 px-3 text-right">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-500 font-sans">
                      <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                      <p className="text-sm">Sipariş kaydı bulunamadı.</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-300 font-bold">{o.sip_tarih}</td>
                      <td className="py-2.5 px-3 text-blue-400 font-bold">{o.sip_evrakno_seri}-{o.sip_evrakno_sira}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-200 max-w-xs truncate" title={o.sip_musteri_unvan}>
                        {o.sip_musteri_unvan || o.sip_musteri_kod}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-rose-400">{o.sip_stok_kod}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-200 max-w-xs truncate" title={o.sip_stok_isim}>
                        {o.sip_stok_isim || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{o.sip_miktar}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{o.sip_teslim_miktar}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-400">{o.sip_kalan_miktar}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{o.sip_b_fiyat.toFixed(2)} ₺</td>
                      <td className="py-2.5 px-3 text-right text-amber-300 font-bold">{o.sip_tutar.toFixed(2)} ₺</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
};
