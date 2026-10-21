import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { CountItem, Product } from '../types';
import { api } from '../services/api';
import { sounds } from '../services/sound';
import { exportToExcel } from '../services/excel';
import { 
  Barcode, 
  Search, 
  Plus, 
  Trash2, 
  FileDown, 
  CheckCircle, 
  AlertTriangle, 
  ArrowUpDown,
  RefreshCw,
  PlusCircle,
  MinusCircle
} from 'lucide-react';

export const SayimView: React.FC = () => {
  const { activeWarehouse, registerBarcodeHandler } = useApp();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [items, setItems] = useState<CountItem[]>(() => {
    const saved = localStorage.getItem('sayimapp_desktop_count_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [filterText, setFilterText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [evrakSeri, setEvrakSeri] = useState('SY');
  const [evrakSira, setEvrakSira] = useState<number>(1);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('sayimapp_desktop_count_items', JSON.stringify(items));
  }, [items]);

  // Fetch next sequence for 012800
  const fetchNextSira = async () => {
    try {
      const next = await api.getNextSira(128, evrakSeri);
      setEvrakSira(next);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchNextSira();
  }, [evrakSeri]);

  // Handle scanned or entered barcode
  const handleProcessBarcode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setIsLoading(true);
    try {
      // 1. Check if already in list
      const existingIndex = items.findIndex(
        i => i.barcode === code || i.stock_code.toUpperCase() === code.toUpperCase()
      );

      if (existingIndex >= 0) {
        // Increment quantity
        const updated = [...items];
        updated[existingIndex].counted_quantity += 1;
        updated[existingIndex].difference = 
          updated[existingIndex].counted_quantity - updated[existingIndex].current_stock;
        updated[existingIndex].total_price = 
          updated[existingIndex].counted_quantity * updated[existingIndex].price;
        setItems(updated);
        sounds.playScanBeep();
      } else {
        // Query Mikro ERP
        let product: Product | null = await api.getProductByBarcode(code);
        if (!product) {
          const list = await api.searchProducts(code, 1);
          if (list.length > 0) product = list[0];
        }

        if (product) {
          const depoNo = activeWarehouse?.dep_no || 1;
          const currentStock = await api.getSingleWarehouseStock(product.sto_kod, depoNo);

          const newItem: CountItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            stock_code: product.sto_kod,
            stock_name: product.sto_isim,
            barcode: product.bar_kodu || code,
            counted_quantity: 1,
            current_stock: currentStock,
            difference: 1 - currentStock,
            unit: product.sto_birim1_ad || 'ADET',
            price: product.fiyat || 0,
            total_price: product.fiyat || 0,
            timestamp: new Date().toLocaleTimeString('tr-TR'),
          };

          setItems(prev => [newItem, ...prev]);
          sounds.playSuccess();
        } else {
          sounds.playError();
          alert(`Ürün bulunamadı: ${code}`);
        }
      }
    } catch (err: any) {
      sounds.playError();
      alert(`Sorgu hatası: ${err.message}`);
    } finally {
      setIsLoading(false);
      setBarcodeInput('');
      barcodeInputRef.current?.focus();
    }
  };

  // Register global barcode gun handler
  useEffect(() => {
    const unregister = registerBarcodeHandler((code) => {
      handleProcessBarcode(code);
    });
    return unregister;
  }, [items, activeWarehouse]);

  // Quantity helpers
  const handleUpdateQuantity = (id: string, delta: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          const newQty = Math.max(0, item.counted_quantity + delta);
          return {
            ...item,
            counted_quantity: newQty,
            difference: newQty - item.current_stock,
            total_price: newQty * item.price,
          };
        }
        return item;
      })
    );
  };

  const handleSetExactQuantity = (id: string, val: string) => {
    const qty = parseFloat(val) || 0;
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            counted_quantity: qty,
            difference: qty - item.current_stock,
            total_price: qty * item.price,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    if (confirm('Tüm sayım listesini temizlemek istediğinizden emin misiniz?')) {
      setItems([]);
      localStorage.removeItem('sayimapp_desktop_count_items');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = items.map((i, idx) => ({
      Sıra: idx + 1,
      'Stok Kodu': i.stock_code,
      'Stok Adı': i.stock_name,
      Barkod: i.barcode || '',
      Birim: i.unit,
      'Depo Stok': i.current_stock,
      'Sayılan Miktar': i.counted_quantity,
      Fark: i.difference,
      'Birim Fiyat': i.price,
      'Toplam Tutar': i.total_price,
      Zaman: i.timestamp,
    }));
    exportToExcel(exportData, `Depo_${activeWarehouse?.dep_no || 1}_Sayim_${new Date().toISOString().slice(0, 10)}`);
  };

  // Kesinleştir (Finalize stock count into Mikro ERP)
  const handleFinalizeCount = async () => {
    if (items.length === 0) {
      alert('Sayım listesi boş.');
      return;
    }
    if (!confirm(`${items.length} kalem sayım Mikro ERP'ye kesinleştirilmek üzere kaydedilecek. Onaylıyor musunuz?`)) {
      return;
    }

    setIsFinalizing(true);
    try {
      const depoNo = activeWarehouse?.dep_no || 1;
      const targetSeri = (evrakSeri || 'SY').trim().replace(/'/g, "''");
      const userNum = 1;

      let sql = `
        BEGIN TRANSACTION;
        DECLARE @Tarih DATETIME = CAST(CONVERT(VARCHAR(10), GETDATE(), 120) AS DATETIME);
        DECLARE @SiraNo INT = ${evrakSira};
      `;

      items.forEach((item, index) => {
        const sKod = item.stock_code.replace(/'/g, "''");
        const miktar = item.counted_quantity;
        const bFiyat = item.price || 0;
        const tutar = miktar * bFiyat;

        sql += `
          INSERT INTO STOK_HAREKETLERI (
            sth_Guid, sth_DBCno, sth_SpecRECno, sth_iptal, sth_fileid, sth_hidden, sth_kilitli, sth_degisti, sth_checksum,
            sth_create_user, sth_create_date, sth_lastup_user, sth_lastup_date,
            sth_special1, sth_special2, sth_special3, sth_MainProgramNo, sth_VersionNo, sth_MenuNo,
            sth_MikroSpecial1, sth_MikroSpecial2, sth_MikroSpecial3, sth_ExternalProgramType, sth_ExternalProgramId, sth_Hash,
            sth_firmano, sth_subeno, sth_tarih, sth_tip, sth_cins, sth_normal_iade, sth_evraktip, sth_evrakno_seri,
            sth_evrakno_sira, sth_satirno, sth_belge_no, sth_belge_tarih, sth_stok_kod,
            sth_miktar, sth_miktar2, sth_birim_pntr, sth_birimfiyat, sth_tutar,
            sth_giris_depo_no, sth_cikis_depo_no, sth_malkbl_sevk_tarihi,
            sth_aciklama
          ) VALUES (
            NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
            ${userNum}, GETDATE(), ${userNum}, GETDATE(),
            '', '', '', 21, '17.05d', '12800',
            '', '', '', 0, '', 0,
            0, 0, @Tarih, 0, 0, 0, 128, '${targetSeri}',
            @SiraNo, ${index}, '', @Tarih, '${sKod}',
            ${miktar}, ${miktar}, 1, ${bFiyat}, ${tutar},
            ${depoNo}, 0, @Tarih,
            'Masaüstü Depo Sayımı (012800)'
          );
        `;
      });

      sql += `
        COMMIT TRANSACTION;
        SELECT 1 AS success, @SiraNo AS CreatedSira;
      `;

      await api.executeSql(sql);
      sounds.playSuccess();
      alert(`Sayım başarıyla kesinleştirildi!\nEvrak No: ${targetSeri}-${evrakSira}\nToplam Kalem: ${items.length}`);
      setItems([]);
      fetchNextSira();
    } catch (err: any) {
      sounds.playError();
      alert(`Kesinleştirme Hatası: ${err.message}`);
    } finally {
      setIsFinalizing(false);
    }
  };

  // Filtered items
  const filteredItems = items.filter(i => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      i.stock_name.toLowerCase().includes(q) ||
      i.stock_code.toLowerCase().includes(q) ||
      (i.barcode && i.barcode.toLowerCase().includes(q))
    );
  });

  // Calculation Stats
  const totalCounted = items.reduce((acc, curr) => acc + curr.counted_quantity, 0);
  const totalDifference = items.reduce((acc, curr) => acc + curr.difference, 0);
  const totalAmount = items.reduce((acc, curr) => acc + curr.total_price, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      
      {/* Top Action Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        
        {/* Left: Barcode Scanner Input */}
        <div className="flex items-center space-x-3 flex-1 max-w-xl">
          <div className="relative flex-1">
            <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleProcessBarcode(barcodeInput);
                }
              }}
              placeholder="Barkod okutun veya stok kodu girip Enter'a basın..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
              autoFocus
            />
          </div>
          <button
            onClick={() => handleProcessBarcode(barcodeInput)}
            disabled={isLoading || !barcodeInput.trim()}
            className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-md disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Ekle</span>
          </button>
        </div>

        {/* Right: Evrak Seri & Sıra, Kesinleştir, Excel */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
            <span className="text-xs text-slate-400 font-medium">Seri:</span>
            <input
              type="text"
              value={evrakSeri}
              onChange={(e) => setEvrakSeri(e.target.value.toUpperCase())}
              className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-center text-white outline-none"
            />
            <span className="text-xs text-slate-400 font-medium">Sıra:</span>
            <input
              type="number"
              value={evrakSira}
              onChange={(e) => setEvrakSira(Number(e.target.value))}
              className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-center text-white outline-none"
            />
          </div>

          <button
            onClick={handleExportExcel}
            disabled={items.length === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors disabled:opacity-40"
            title="Excel Tablosuna Aktar"
          >
            <FileDown className="w-4 h-4 text-emerald-400" />
            <span>Excel</span>
          </button>

          <button
            onClick={handleClearAll}
            disabled={items.length === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors disabled:opacity-40"
            title="Listeyi Temizle"
          >
            <Trash2 className="w-4 h-4" />
            <span>Temizle</span>
          </button>

          <button
            onClick={handleFinalizeCount}
            disabled={items.length === 0 || isFinalizing}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-40"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isFinalizing ? 'Kesinleştiriliyor...' : 'Sayımı Kesinleştir'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800/80 grid grid-cols-4 gap-4">
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Toplam Kalem</div>
          <div className="text-lg font-bold font-mono text-white">{items.length} Kalem</div>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Sayılan Toplam Adet</div>
          <div className="text-lg font-bold font-mono text-blue-400">{totalCounted.toLocaleString('tr-TR')}</div>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Toplam Sayım Farkı</div>
          <div className={`text-lg font-bold font-mono ${totalDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalDifference > 0 ? `+${totalDifference}` : totalDifference}
          </div>
        </div>
        <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Tahmini Toplam Değer</div>
          <div className="text-lg font-bold font-mono text-amber-400">
            {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
          </div>
        </div>
      </div>

      {/* Table & List View */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Table Filter Input */}
        <div className="mb-3 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Liste içinde ara..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="text-xs text-slate-400">
            Depo: <span className="font-semibold text-slate-200">{activeWarehouse?.dep_adi || 'Seçilmedi'}</span> [{activeWarehouse?.dep_no || '-'}]
          </div>
        </div>

        {/* Scrollable Data Table */}
        <div className="flex-1 bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-inner">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 sticky top-0 z-10 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-4">Stok Kodu</th>
                  <th className="py-3 px-4">Ürün Adı</th>
                  <th className="py-3 px-3">Barkod</th>
                  <th className="py-3 px-3 text-right">Depo Stok</th>
                  <th className="py-3 px-4 text-center w-36">Sayılan Miktar</th>
                  <th className="py-3 px-3 text-right">Fark</th>
                  <th className="py-3 px-3 text-right">Birim Fiyat</th>
                  <th className="py-3 px-3 text-right">Toplam Tutar</th>
                  <th className="py-3 px-3 text-center w-16">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-500 font-sans">
                      <Barcode className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                      <p className="text-sm">Henüz ürün okutulmadı.</p>
                      <p className="text-xs text-slate-600 mt-1">Barkod okutarak veya yukarıdaki alana stok kodu girerek sayıma başlayın.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const diff = item.difference;
                    return (
                      <tr 
                        key={item.id} 
                        className="hover:bg-slate-800/50 transition-colors group"
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500 font-sans">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold text-blue-400 font-mono">{item.stock_code}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-200 max-w-xs truncate" title={item.stock_name}>
                          {item.stock_name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{item.barcode || '-'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-300 font-bold">
                          {item.current_stock} <span className="text-[10px] text-slate-500 font-normal">{item.unit}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={item.counted_quantity}
                              onChange={(e) => handleSetExactQuantity(item.id, e.target.value)}
                              className="w-14 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-center font-bold text-white text-xs outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold">
                          <span className={diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {item.price.toFixed(2)} ₺
                        </td>
                        <td className="py-2.5 px-3 text-right text-amber-300 font-bold">
                          {item.total_price.toFixed(2)} ₺
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Kalemi Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
