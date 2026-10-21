import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product, DepoStokItem, InvoiceItem } from '../types';
import { api } from '../services/api';
import { sounds } from '../services/sound';
import { 
  Tag, 
  Barcode, 
  Search, 
  Building2, 
  Receipt, 
  RefreshCw,
  History,
  Package,
  Layers
} from 'lucide-react';

export const FiyatGorView: React.FC = () => {
  const { registerBarcodeHandler } = useApp();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [depoStocks, setDepoStocks] = useState<DepoStokItem[]>([]);
  const [lastInvoice, setLastInvoice] = useState<InvoiceItem | null>(null);
  const [history, setHistory] = useState<Product[]>([]);
  const [initialProducts, setInitialProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Load initial catalog on mount
  useEffect(() => {
    const loadInit = async () => {
      try {
        const list = await api.getInitialProducts(15);
        setInitialProducts(list);
        if (list.length > 0 && !product) {
          // Select first product by default so data is immediately visible!
          handleSelectProduct(list[0]);
        }
      } catch (err) {
        console.error('Initial products error:', err);
      }
    };
    loadInit();
  }, []);

  const handleSelectProduct = async (prod: Product) => {
    setProduct(prod);
    setHistory(prev => [prod, ...prev.filter(p => p.sto_kod !== prod.sto_kod)].slice(0, 10));

    try {
      const [stocks, invoices] = await Promise.all([
        api.getDepoStock(prod.sto_kod),
        api.getInvoices(prod.sto_kod),
      ]);
      setDepoStocks(stocks);
      setLastInvoice(invoices.length > 0 ? invoices[0] : null);
    } catch {
      // error
    }
  };

  const handleLookup = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    setIsLoading(true);
    try {
      let prod = await api.getProductByBarcode(code);
      if (!prod) {
        const list = await api.searchProducts(code, 1);
        if (list.length > 0) prod = list[0];
      }

      if (prod) {
        sounds.playSuccess();
        await handleSelectProduct(prod);
      } else {
        sounds.playError();
        alert(`Ürün bulunamadı: ${code}`);
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
      handleLookup(code);
    });
    return unregister;
  }, []);

  const totalStock = depoStocks.reduce((acc, curr) => acc + curr.Miktar, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      
      {/* Top Barcode Input */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center space-x-3">
        <div className="relative flex-1 max-w-2xl">
          <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLookup(barcodeInput);
              }
            }}
            placeholder="Fiyatını görmek istediğiniz ürünün barkodunu okutun veya stok kodu yazın..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            autoFocus
          />
        </div>
        <button
          onClick={() => handleLookup(barcodeInput)}
          disabled={isLoading || !barcodeInput.trim()}
          className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-colors shadow-md disabled:opacity-50"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>Sorgula</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        
        {!product ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-slate-500">
            <Tag className="w-20 h-20 mb-4 opacity-20 text-cyan-400" />
            <h2 className="text-xl font-bold text-slate-300">Fiyat & Stok Kartı Sorgulama</h2>
            <p className="text-xs text-slate-500 mt-2 max-w-md">
              Barkod tabancası ile bir barkod okutun veya yukarıdaki arama kutusuna stok kodunu girin.
            </p>
          </div>
        ) : (
          <>
            {/* Büyük Fiyat & Bilgi Kartı */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-6">
                
                {/* Sol: Ürün Adı ve Kodları */}
                <div className="space-y-3 flex-1 min-w-[280px]">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-xs font-bold">
                    <span>{product.sto_kod}</span>
                  </div>
                  <h1 className="text-2xl font-bold text-white leading-tight">
                    {product.sto_isim}
                  </h1>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-mono">
                    <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
                      Barkod: <strong className="text-slate-200">{product.bar_kodu || '-'}</strong>
                    </span>
                    <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
                      Birim: <strong className="text-slate-200">{product.sto_birim1_ad || 'ADET'}</strong>
                    </span>
                    <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
                      KDV: <strong className="text-slate-200">%{product.sto_perakende_vergi || 0}</strong>
                    </span>
                  </div>
                </div>

                {/* Sağ: Büyük Fiyat Ekranı */}
                <div className="flex items-center space-x-4 bg-slate-950 p-4 rounded-2xl border border-slate-800 shadow-inner">
                  <div className="text-right">
                    <div className="text-xs uppercase font-bold text-slate-400">Satış Fiyatı (KDV Dahil)</div>
                    <div className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight">
                      {product.kdv_dahil_fiyat?.toFixed(2)} ₺
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      KDV Hariç: {product.fiyat?.toFixed(2)} ₺
                    </div>
                  </div>

                  <div className="border-l border-slate-800 pl-4 text-right">
                    <div className="text-xs uppercase font-bold text-slate-400">Toptan Fiyat</div>
                    <div className="text-2xl font-extrabold font-mono text-blue-400 tracking-tight">
                      {product.fiyat_toptan ? `${product.fiyat_toptan.toFixed(2)} ₺` : '-'}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Liste 2
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Orta: Depo Stokları & Son Alış Kartları */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Depo Envanteri */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Depo Envanter Durumu</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    Toplam: {totalStock.toLocaleString('tr-TR')} {product.sto_birim1_ad || 'ADET'}
                  </span>
                </div>

                <div className="space-y-2 flex-1 max-h-60 overflow-y-auto pr-1">
                  {depoStocks.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">Stok kaydı bulunamadı</div>
                  ) : (
                    depoStocks.map((ds) => (
                      <div
                        key={ds.DepoNo}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-xs font-semibold text-slate-200">{ds.DepoAdi}</span>
                          <span className="text-[10px] text-slate-500 font-mono ml-2">Depo: {ds.DepoNo}</span>
                        </div>
                        <span className={`text-sm font-bold font-mono ${ds.Miktar > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {ds.Miktar.toLocaleString('tr-TR')} {product.sto_birim1_ad || 'ADET'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Son Alış Bilgisi */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center space-x-2">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Son Alış Bilgileri</h3>
                  </div>
                  {lastInvoice && (
                    <span className="text-xs font-mono text-slate-400">
                      {lastInvoice.Tarih}
                    </span>
                  )}
                </div>

                {lastInvoice ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-around">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="text-[11px] text-slate-400">Tedarikçi (Cari)</div>
                      <div className="text-sm font-semibold text-slate-200 truncate mt-0.5">
                        {lastInvoice.CariUnvan || lastInvoice.CariKodu}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Son Alış Fiyatı</div>
                        <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
                          {lastInvoice.BirimFiyat.toFixed(2)} {lastInvoice.DovizCinsi}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                        <div className="text-[11px] text-slate-400">Gelen Miktar</div>
                        <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
                          {lastInvoice.Miktar.toLocaleString('tr-TR')} {product.sto_birim1_ad || 'ADET'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                    Alış faturası bulunamadı.
                  </div>
                )}
              </div>

            </div>
          </>
        )}

        {/* Hızlı Katalog / Ürün Listesi */}
        {initialProducts.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 mb-2">
              <Package className="w-3.5 h-3.5 text-cyan-400" />
              <span>Mikro Stok Listesinden Hızlı Seçim (İlk {initialProducts.length} Ürün)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {initialProducts.map((p) => (
                <button
                  key={p.sto_kod}
                  onClick={() => handleSelectProduct(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors flex items-center space-x-2 ${
                    product?.sto_kod === p.sto_kod
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                >
                  <span className="font-mono">{p.sto_kod}</span>
                  <span className="truncate max-w-[140px]">{p.sto_isim}</span>
                  <span className="text-emerald-400 font-mono font-bold">{p.fiyat?.toFixed(2)} ₺</span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
