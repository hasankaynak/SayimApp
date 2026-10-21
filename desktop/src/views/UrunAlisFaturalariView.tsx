import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product, InvoiceItem, DepoStokItem } from '../types';
import { api } from '../services/api';
import { sounds } from '../services/sound';
import { exportToExcel } from '../services/excel';
import { 
  Receipt, 
  Barcode, 
  Search, 
  Building2, 
  Calendar, 
  RefreshCw, 
  FileDown, 
  TrendingUp, 
  Package, 
  DollarSign,
  Filter
} from 'lucide-react';

export const UrunAlisFaturalariView: React.FC = () => {
  const { registerBarcodeHandler } = useApp();

  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [depoStocks, setDepoStocks] = useState<DepoStokItem[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [isLoadingStocks, setIsLoadingStocks] = useState(false);
  const [filterCari, setFilterCari] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | '30d' | '90d' | '365d'>('all');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search products
  useEffect(() => {
    if (!searchInput.trim() || searchInput.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await api.searchProducts(searchInput, 10);
        setSearchResults(results);
        setShowDropdown(true);
      } catch {
        // error
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load product data (Invoices and warehouse stocks)
  const handleSelectProduct = async (product: Product) => {
    setSelectedProduct(product);
    setShowDropdown(false);
    setSearchInput(product.sto_kod);
    sounds.playSuccess();

    // Fetch invoices
    setIsLoadingInvoices(true);
    try {
      const invList = await api.getInvoices(product.sto_kod);
      setInvoices(invList);
    } catch (err: any) {
      sounds.playError();
      alert(`Faturalar alınamadı: ${err.message}`);
    } finally {
      setIsLoadingInvoices(false);
    }

    // Fetch warehouse stocks
    refreshDepoStocks(product.sto_kod);
  };

  const refreshDepoStocks = async (stockCode?: string) => {
    const code = stockCode || selectedProduct?.sto_kod;
    if (!code) return;
    setIsLoadingStocks(true);
    try {
      const stocks = await api.getDepoStock(code);
      setDepoStocks(stocks);
    } catch {
      // error
    } finally {
      setIsLoadingStocks(false);
    }
  };

  // Barcode Gun listener
  const handleBarcodeLookup = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;

    let prod = await api.getProductByBarcode(clean);
    if (!prod) {
      const list = await api.searchProducts(clean, 1);
      if (list.length > 0) prod = list[0];
    }

    if (prod) {
      handleSelectProduct(prod);
    } else {
      sounds.playError();
      alert(`Ürün bulunamadı: ${clean}`);
    }
  };

  useEffect(() => {
    const unregister = registerBarcodeHandler((code) => {
      handleBarcodeLookup(code);
    });
    return unregister;
  }, []);

  // Filter invoices by date & cari
  const filteredInvoices = invoices.filter(inv => {
    if (filterCari) {
      const q = filterCari.toLowerCase();
      const matchCari = (inv.CariUnvan && inv.CariUnvan.toLowerCase().includes(q)) ||
                        (inv.CariKodu && inv.CariKodu.toLowerCase().includes(q)) ||
                        (inv.BelgeNo && inv.BelgeNo.toLowerCase().includes(q));
      if (!matchCari) return false;
    }

    if (dateFilter !== 'all' && inv.Tarih) {
      const invDate = new Date(inv.Tarih).getTime();
      const now = Date.now();
      const days = dateFilter === '30d' ? 30 : dateFilter === '90d' ? 90 : 365;
      if (now - invDate > days * 24 * 60 * 60 * 1000) return false;
    }

    return true;
  });

  // KPI Calculations
  const totalReceivedQty = filteredInvoices.reduce((acc, curr) => acc + curr.Miktar, 0);
  const totalInvoiceAmount = filteredInvoices.reduce((acc, curr) => acc + curr.NetTutar, 0);
  const avgCost = totalReceivedQty > 0 ? totalInvoiceAmount / totalReceivedQty : 0;
  const lastPurchase = filteredInvoices.length > 0 ? filteredInvoices[0] : null;
  const totalDepoStock = depoStocks.reduce((acc, curr) => acc + curr.Miktar, 0);

  // Excel Export
  const handleExportExcel = () => {
    if (!selectedProduct || filteredInvoices.length === 0) return;
    const exportData = filteredInvoices.map((inv, idx) => ({
      Sıra: idx + 1,
      Tarih: inv.Tarih,
      'Evrak Seri/Sıra': `${inv.EvrakSeri}-${inv.EvrakSira}`,
      'Belge / Fatura No': inv.BelgeNo,
      'Cari Kod': inv.CariKodu,
      'Tedarikçi (Cari Ünvan)': inv.CariUnvan,
      'Alış Miktarı': inv.Miktar,
      'Birim Fiyat': inv.BirimFiyat,
      'Net Tutar': inv.NetTutar,
      'Döviz': inv.DovizCinsi,
      'Giriş Deposu': `[${inv.DepoNo}] ${inv.DepoAdi}`,
    }));
    exportToExcel(exportData, `Alis_Faturalari_${selectedProduct.sto_kod}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      
      {/* Top Search & Filter Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* Live Product Search with Auto-Complete */}
          <div className="relative flex-1 max-w-xl">
            <div className="relative">
              <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchResults.length > 0) {
                      handleSelectProduct(searchResults[0]);
                    } else {
                      handleBarcodeLookup(searchInput);
                    }
                  }
                }}
                placeholder="Ürün adı, barkod veya stok kodu ile arayın..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-11 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
                autoFocus
              />
            </div>

            {/* Dropdown Results */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl z-30 max-h-72 overflow-y-auto divide-y divide-slate-800">
                {searchResults.map((p) => (
                  <div
                    key={p.sto_kod}
                    onClick={() => handleSelectProduct(p)}
                    className="p-3 hover:bg-slate-800/80 cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-amber-400 font-mono">{p.sto_kod}</div>
                      <div className="text-sm font-medium text-slate-200">{p.sto_isim}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{p.bar_kodu || 'Barkodsuz'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-400">{p.fiyat?.toFixed(2)} ₺</div>
                      <div className="text-[11px] text-slate-500">Satış Fiyatı</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date & Cari Filter Row */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 px-1">Filtre:</span>
              {(['all', '30d', '90d', '365d'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setDateFilter(period)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    dateFilter === period
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {period === 'all' ? 'Tümü' : period === '30d' ? 'Son 30 Gün' : period === '90d' ? 'Son 90 Gün' : '1 Yıl'}
                </button>
              ))}
            </div>

            <div className="relative w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={filterCari}
                onChange={(e) => setFilterCari(e.target.value)}
                placeholder="Tedarikçi / Belge ara..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={handleExportExcel}
              disabled={!selectedProduct || filteredInvoices.length === 0}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-40"
            >
              <FileDown className="w-4 h-4 text-emerald-400" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Selected Product Card Banner */}
        {selectedProduct && (
          <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold border border-amber-500/20">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-white">{selectedProduct.sto_isim}</span>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                    {selectedProduct.sto_kod}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono flex items-center space-x-3 mt-0.5">
                  <span>Barkod: {selectedProduct.bar_kodu || '-'}</span>
                  <span>•</span>
                  <span>Birim: {selectedProduct.sto_birim1_ad || 'ADET'}</span>
                  <span>•</span>
                  <span>Perakende KDV: %{selectedProduct.sto_perakende_vergi || 0}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-6 text-right">
              <div>
                <div className="text-[11px] text-slate-400">Satış Fiyatı (KDV Hariç)</div>
                <div className="text-sm font-bold font-mono text-slate-200">
                  {selectedProduct.fiyat?.toFixed(2)} ₺
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">KDV Dahil Satış</div>
                <div className="text-sm font-bold font-mono text-emerald-400">
                  {selectedProduct.kdv_dahil_fiyat?.toFixed(2)} ₺
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPI Stats Cards */}
      {selectedProduct && (
        <div className="px-6 py-2.5 bg-slate-900/60 border-b border-slate-800/80 grid grid-cols-4 gap-4">
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Toplam Gelen Miktar</div>
            <div className="text-base font-bold font-mono text-blue-400">
              {totalReceivedQty.toLocaleString('tr-TR')} {selectedProduct.sto_birim1_ad || 'ADET'}
            </div>
          </div>
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Ortalama Alış Maliyeti</div>
            <div className="text-base font-bold font-mono text-emerald-400">
              {avgCost.toFixed(2)} ₺
            </div>
          </div>
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Son Alış Fiyatı & Tarihi</div>
            <div className="text-base font-bold font-mono text-amber-400">
              {lastPurchase ? `${lastPurchase.BirimFiyat.toFixed(2)} ₺ (${lastPurchase.Tarih})` : '-'}
            </div>
          </div>
          <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="text-[11px] text-slate-400 font-medium">Tüm Depolardaki Toplam Stok</div>
            <div className="text-base font-bold font-mono text-purple-400">
              {totalDepoStock.toLocaleString('tr-TR')} {selectedProduct.sto_birim1_ad || 'ADET'}
            </div>
          </div>
        </div>
      )}

      {/* Main Content: Split Pane (Left: Invoices, Right: Warehouse Stock Balances) */}
      <div className="flex-1 p-6 overflow-hidden flex space-x-5">
        
        {/* Sol Panel: Alış Faturaları Tablosu */}
        <div className="flex-1 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-inner">
          <div className="p-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Alış Faturaları Geçmişi ({filteredInvoices.length})
              </span>
            </div>
            {isLoadingInvoices && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 sticky top-0 z-10 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Tarih</th>
                  <th className="py-2.5 px-3">Evrak No</th>
                  <th className="py-2.5 px-3">Belge No</th>
                  <th className="py-2.5 px-4">Tedarikçi (Cari Ünvan)</th>
                  <th className="py-2.5 px-3 text-right">Miktar</th>
                  <th className="py-2.5 px-3 text-right">Birim Fiyat</th>
                  <th className="py-2.5 px-3 text-right">Net Tutar</th>
                  <th className="py-2.5 px-3 text-center">Depo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {!selectedProduct ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-slate-500 font-sans">
                      <Search className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                      <p className="text-sm">Lütfen incelenecek bir ürün arayın veya barkodunu okutun.</p>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-500 font-sans">
                      <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                      <p className="text-sm">Bu ürüne ait alış faturası kaydı bulunamadı.</p>
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3 text-slate-300 font-bold">{inv.Tarih}</td>
                      <td className="py-2.5 px-3 text-blue-400 font-bold">{inv.EvrakSeri}-{inv.EvrakSira}</td>
                      <td className="py-2.5 px-3 text-slate-400">{inv.BelgeNo || '-'}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-200 max-w-xs truncate" title={inv.CariUnvan}>
                        {inv.CariUnvan || inv.CariKodu || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                        {inv.Miktar.toLocaleString('tr-TR')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {inv.BirimFiyat.toFixed(2)} ₺
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                        {inv.NetTutar.toFixed(2)} ₺
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                          [{inv.DepoNo}] {inv.DepoAdi}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sağ Panel: Güncel Depo Stokları */}
        <div className="w-80 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-inner shrink-0">
          <div className="p-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Depo Stokları (Sağda Güncelle)
              </span>
            </div>
            <button
              onClick={() => refreshDepoStocks()}
              disabled={isLoadingStocks || !selectedProduct}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
              title="Stokları Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStocks ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
            {!selectedProduct ? (
              <div className="py-12 text-center text-xs text-slate-500 font-sans">
                Ürün seçilmedi
              </div>
            ) : depoStocks.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-sans">
                Stok kaydı bulunamadı
              </div>
            ) : (
              depoStocks.map((ds) => (
                <div 
                  key={ds.DepoNo}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-semibold text-slate-200 truncate">{ds.DepoAdi}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Depo No: {ds.DepoNo}</div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold font-mono ${ds.Miktar > 0 ? 'text-emerald-400' : ds.Miktar < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {ds.Miktar.toLocaleString('tr-TR')}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1">{selectedProduct.sto_birim1_ad || 'ADET'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
