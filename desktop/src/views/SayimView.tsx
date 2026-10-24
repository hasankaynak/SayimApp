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
  ArrowUpDown,
  RefreshCw,
  Package,
  X
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

  // Product Catalog Modal
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);

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

  // Catalog search debouncer
  useEffect(() => {
    if (!showCatalogModal) return;
    const timer = setTimeout(async () => {
      setIsSearchingCatalog(true);
      try {
        const res = await api.searchProducts(catalogSearch, 30);
        setCatalogResults(res);
      } catch (err) {
        console.error('Catalog search err:', err);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [catalogSearch, showCatalogModal]);

  // Add product to count list
  const addProductToCount = async (product: Product) => {
    const depoNo = activeWarehouse?.dep_no || 1;
    const existingIndex = items.findIndex(i => i.stock_code.toUpperCase() === product.sto_kod.toUpperCase());

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].counted_quantity += 1;
      updated[existingIndex].difference = 
        updated[existingIndex].counted_quantity - updated[existingIndex].current_stock;
      updated[existingIndex].total_price = 
        updated[existingIndex].counted_quantity * updated[existingIndex].price;
      setItems(updated);
      sounds.playScanBeep();
    } else {
      const currentStock = await api.getSingleWarehouseStock(product.sto_kod, depoNo);

      const newItem: CountItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        stock_code: product.sto_kod,
        stock_name: product.sto_isim,
        barcode: product.bar_kodu || '',
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
    }
  };

  // Handle scanned or entered barcode
  const handleProcessBarcode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setIsLoading(true);
    try {
      const existingIndex = items.findIndex(
        i => i.barcode === code || i.stock_code.toUpperCase() === code.toUpperCase()
      );

      if (existingIndex >= 0) {
        const updated = [...items];
        updated[existingIndex].counted_quantity += 1;
        updated[existingIndex].difference = 
          updated[existingIndex].counted_quantity - updated[existingIndex].current_stock;
        updated[existingIndex].total_price = 
          updated[existingIndex].counted_quantity * updated[existingIndex].price;
        setItems(updated);
        sounds.playScanBeep();
      } else {
        let product: Product | null = await api.getProductByBarcode(code);
        if (!product) {
          const list = await api.searchProducts(code, 1);
          if (list.length > 0) product = list[0];
        }

        if (product) {
          await addProductToCount(product);
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

  useEffect(() => {
    const unregister = registerBarcodeHandler((code) => {
      handleProcessBarcode(code);
    });
    return unregister;
  }, [items, activeWarehouse]);

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

  const handleFinalizeCount = async () => {
    const validItems = items.filter(i => i && i.stock_code && i.stock_code.trim() !== '' && i.counted_quantity > 0);
    if (validItems.length === 0) {
      alert('Sayım listesinde geçerli miktara sahip ürün bulunamadı.');
      return;
    }
    if (!confirm(`${validItems.length} kalem sayım Mikro ERP'ye kesinleştirilmek üzere kaydedilecek. Onaylıyor musunuz?`)) {
      return;
    }

    setIsFinalizing(true);
    try {
      const depoNo = activeWarehouse?.dep_no || 1;
      const targetSeri = (evrakSeri || 'SY').trim().replace(/'/g, "''");
      const userNum = 1;

      let sql = `
        BEGIN TRANSACTION;
        DECLARE @Now DATETIME = GETDATE();
        DECLARE @Tarih DATETIME = CAST(CONVERT(VARCHAR(10), GETDATE(), 120) AS DATETIME);
        DECLARE @SiraNo INT = ${evrakSira};
      `;

      validItems.forEach((item, index) => {
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
            sth_isk_mas1, sth_isk_mas2, sth_isk_mas3, sth_isk_mas4, sth_isk_mas5, sth_isk_mas6, sth_isk_mas7, sth_isk_mas8, sth_isk_mas9, sth_isk_mas10,
            sth_sat_iskmas1, sth_sat_iskmas2, sth_sat_iskmas3, sth_sat_iskmas4, sth_sat_iskmas5, sth_sat_iskmas6, sth_sat_iskmas7, sth_sat_iskmas8, sth_sat_iskmas9, sth_sat_iskmas10,
            sth_pos_satis, sth_promosyon_fl, sth_cari_cinsi, sth_cari_kodu, sth_cari_grup_no, sth_isemri_gider_kodu, sth_plasiyer_kodu,
            sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru, sth_stok_doviz_cinsi, sth_stok_doviz_kuru,
            sth_miktar, sth_miktar2, sth_birim_pntr, sth_birimfiyat, sth_tutar,
            sth_iskonto1, sth_iskonto2, sth_iskonto3, sth_iskonto4, sth_iskonto5, sth_iskonto6,
            sth_masraf1, sth_masraf2, sth_masraf3, sth_masraf4,
            sth_vergi_pntr, sth_vergi, sth_masraf_vergi_pntr, sth_masraf_vergi, sth_netagirlik,
            sth_odeme_op, sth_aciklama, sth_sip_uid, sth_fat_uid,
            sth_giris_depo_no, sth_cikis_depo_no, sth_malkbl_sevk_tarihi,
            sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_fis_tarihi, sth_fis_sirano, sth_vergisiz_fl,
            sth_maliyet_ana, sth_maliyet_alternatif, sth_maliyet_orjinal, sth_adres_no,
            sth_parti_kodu, sth_lot_no, sth_kons_uid, sth_proje_kodu, sth_exim_kodu,
            sth_otv_pntr, sth_otv_vergi, sth_brutagirlik, sth_disticaret_turu, sth_otvtutari, sth_otvvergisiz_fl,
            sth_oiv_pntr, sth_oiv_vergi, sth_oivvergisiz_fl, sth_fiyat_liste_no, sth_oivtutari, sth_Tevkifat_turu,
            sth_nakliyedeposu, sth_nakliyedurumu, sth_yetkili_uid, sth_taxfree_fl, sth_ilave_edilecek_kdv, sth_ismerkezi_kodu,
            sth_HareketGrupKodu1, sth_HareketGrupKodu2, sth_HareketGrupKodu3,
            sth_Olcu1, sth_Olcu2, sth_Olcu3, sth_Olcu4, sth_Olcu5,
            sth_FormulMiktarNo, sth_FormulMiktar, sth_eirs_senaryo, sth_eirs_tipi, sth_teslim_tarihi, sth_matbu_fl,
            sth_satis_fiyat_doviz_cinsi, sth_satis_fiyat_doviz_kuru, sth_eticaret_kanal_kodu, sth_bagli_ithalat_kodu,
            sth_tevkifat_sifirlandi_fl
          ) VALUES (
            NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
            ${userNum}, @Now, ${userNum}, @Now,
            '', '', '', 21, '17.05d', '12800',
            '', '', '', 0, '', 0,
            0, 0, @Tarih, 0, 0, 0, 128, '${targetSeri}',
            @SiraNo, ${index}, '', @Tarih, '${sKod}',
            0, 1, 1, 1, 1, 1, 1, 1, 1, 1,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, '', 0, '', '',
            0, 1, 1, 0, 1,
            ${miktar}, ${miktar}, 1, ${bFiyat}, ${tutar},
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0, 0,
            0, '', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            ${depoNo}, 0, @Tarih,
            '', '', '1899-12-30', 0, 0,
            ${tutar}, 0, 0, 1,
            '', 0, '00000000-0000-0000-0000-000000000000', '', '',
            0, 0, 0, 0, 0, 0,
            0, 0, 0, 1, 0, 0,
            0, 0, '00000000-0000-0000-0000-000000000000', 0, 0, '',
            '', '', '',
            0, 0, 0, 0, 0,
            0, 0, 0, 0, @Tarih, 0,
            0, 1, '', '',
            0
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

  const filteredItems = items.filter(i => {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    return (
      i.stock_name.toLowerCase().includes(q) ||
      i.stock_code.toLowerCase().includes(q) ||
      (i.barcode && i.barcode.toLowerCase().includes(q))
    );
  });

  const totalCounted = items.reduce((acc, curr) => acc + curr.counted_quantity, 0);
  const totalDifference = items.reduce((acc, curr) => acc + curr.difference, 0);
  const totalAmount = items.reduce((acc, curr) => acc + curr.total_price, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      
      {/* Top Action Bar */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        
        {/* Left: Barcode Scanner Input & Catalog Search Trigger */}
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
          
          <button
            onClick={() => setShowCatalogModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
            title="Mikro Stok Kataloğundan Ürün Ara & Ekle"
          >
            <Search className="w-4 h-4 text-orange-400" />
            <span>Katalog</span>
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
                      <p className="text-xs text-slate-600 mt-1">Barkod tabancası ile okutun veya yukarıdaki "Katalog" butonundan arayarak ekleyin.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const diff = item.difference;
                    return (
                      <tr key={item.id} className="hover:bg-slate-800/50 transition-colors group">
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

      {/* Catalog Search Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-white text-sm">Mikro ERP Stok Kataloğundan Ürün Ekle</h3>
              </div>
              <button
                onClick={() => setShowCatalogModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800 bg-slate-900/60">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Ürün adı, barkod veya stok kodu yazarak arayın..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2">
              {isSearchingCatalog ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
                  <span>Ürünler aranıyor...</span>
                </div>
              ) : catalogResults.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Sonuç bulunamadı
                </div>
              ) : (
                catalogResults.map((p) => (
                  <div
                    key={p.sto_kod}
                    className="p-3 hover:bg-slate-800/60 rounded-xl transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-blue-400">{p.sto_kod}</span>
                        {p.bar_kodu && (
                          <span className="font-mono text-[10px] text-slate-500">({p.bar_kodu})</span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-200 truncate mt-0.5">{p.sto_isim}</div>
                      <div className="text-[11px] text-emerald-400 font-mono mt-0.5">{p.fiyat?.toFixed(2)} ₺</div>
                    </div>
                    <button
                      onClick={() => {
                        addProductToCount(p);
                        setShowCatalogModal(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors shrink-0 shadow"
                    >
                      Sayım Listesine Ekle
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
