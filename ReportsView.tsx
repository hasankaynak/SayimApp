import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  ToastAndroid
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

interface ReportsViewProps {
  isDark: boolean;
  isConnected: boolean | null;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  onBackToMenu: () => void;
  formatPrice: (price: number) => string;
}

export default function ReportsView({
  isDark,
  isConnected,
  dbRef,
  API_URL,
  onBackToMenu,
  formatPrice
}: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<'gelis' | 'fatura' | 'satis'>('gelis');
  const [isExporting, setIsExporting] = useState(false);

  // ----------------------------------------------------
  // TAB 1: GELİŞ TARİHİNE GÖRE RAPOR STATE
  // ----------------------------------------------------
  const [gelisSearchQuery, setGelisSearchQuery] = useState('');
  const [gelisSearchResults, setGelisSearchResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [arrivals, setArrivals] = useState<any[]>([]);
  const [selectedArrival, setSelectedArrival] = useState<any>(null);
  const [salesSummary, setSalesSummary] = useState<{ totalQty: number; totalAmount: number; count: number } | null>(null);
  const [salesListSinceArrival, setSalesListSinceArrival] = useState<any[]>([]);
  const [isLoadingGelis, setIsLoadingGelis] = useState(false);
  const [isLoadingSalesSince, setIsLoadingSalesSince] = useState(false);

  // ----------------------------------------------------
  // TAB 2: FATURA RAPORU STATE
  // ----------------------------------------------------
  const [invStartDate, setInvStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [invEndDate, setInvEndDate] = useState<Date>(() => new Date());
  const [showInvStartPicker, setShowInvStartPicker] = useState(false);
  const [showInvEndPicker, setShowInvEndPicker] = useState(false);
  const [invTypeFilter, setInvTypeFilter] = useState<'ALL' | 'SATIS' | 'ALIS'>('ALL');
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  // Şube & Depo Yönetimi
  const [branches, setBranches] = useState<{ dep_no: number; dep_adi: string }[]>([]);
  const [invSelectedDepo, setInvSelectedDepo] = useState<number>(0); // 0 = Tüm Şubeler
  const [salesSelectedDepo, setSalesSelectedDepo] = useState<number>(0); // 0 = Tüm Şubeler

  // Fatura İçi Detay Modal
  const [selectedInvForModal, setSelectedInvForModal] = useState<any>(null);
  const [invDetailItems, setInvDetailItems] = useState<any[]>([]);
  const [isLoadingInvDetails, setIsLoadingInvDetails] = useState(false);
  const [showInvDetailModal, setShowInvDetailModal] = useState(false);

  // Ürünün Tüm Şubelerdeki Stok ve Satış Dağılımı (Sub-Modal)
  const [showBranchBreakdownModal, setShowBranchBreakdownModal] = useState(false);
  const [selectedItemForBranchBreakdown, setSelectedItemForBranchBreakdown] = useState<any>(null);
  const [branchBreakdownData, setBranchBreakdownData] = useState<any[]>([]);
  const [isLoadingBranchBreakdown, setIsLoadingBranchBreakdown] = useState(false);

  // ----------------------------------------------------
  // TAB 3: SATIŞ RAPORU STATE
  // ----------------------------------------------------
  const [salesStartDate, setSalesStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [salesEndDate, setSalesEndDate] = useState<Date>(() => new Date());
  const [showSalesStartPicker, setShowSalesStartPicker] = useState(false);
  const [showSalesEndPicker, setShowSalesEndPicker] = useState(false);
  const [salesSortBy, setSalesSortBy] = useState<'QTY' | 'AMOUNT'>('QTY');
  const [salesProductFilter, setSalesProductFilter] = useState('');
  const [salesReportData, setSalesReportData] = useState<any[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);

  // Satış Ürün Detay Modalı
  const [selectedSalesProdModal, setSelectedSalesProdModal] = useState<any>(null);
  const [salesProdMovements, setSalesProdMovements] = useState<any[]>([]);
  const [isLoadingSalesProdMov, setIsLoadingSalesProdMov] = useState(false);
  const [showSalesProdModal, setShowSalesProdModal] = useState(false);

  const colors = isDark ? {
    bg: '#0B1C30',
    card: '#162234',
    cardAlt: '#101F33',
    heroBg: '#213145',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: 'rgba(255,255,255,0.12)',
    primary: '#3B82F6',
    primarySoft: 'rgba(59, 130, 246, 0.15)',
    success: '#00AE78',
    successSoft: 'rgba(0, 174, 120, 0.15)',
    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    accent: '#FF6B00'
  } : {
    bg: '#F8F9FF',
    card: '#FFFFFF',
    cardAlt: '#EFF4FF',
    heroBg: '#213145',
    text: '#0B1C30',
    textMuted: '#64748B',
    border: '#E2E8F0',
    primary: '#0051D5',
    primarySoft: 'rgba(0, 81, 213, 0.10)',
    success: '#00AE78',
    successSoft: 'rgba(0, 174, 120, 0.10)',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.10)',
    warning: '#D97706',
    warningSoft: 'rgba(217, 119, 6, 0.10)',
    accent: '#FF6B00'
  };

  const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const toDMY = (d: Date | string) => {
    if (!d) return '';
    if (typeof d === 'string') {
      const parts = d.split('T')[0].split('-');
      if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
      return d;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${m}.${d.getFullYear()}`;
  };

  // Depo / Şube Listesini Çek
  useEffect(() => {
    const fetchDepolar = async () => {
      try {
        const q = `SELECT dep_no, dep_adi FROM DEPOLAR WITH (NOLOCK) ORDER BY dep_no ASC`;
        const res = await axios.post(API_URL, { query: q }, { timeout: 8000 });
        if (res.data && res.data.success && Array.isArray(res.data.data)) {
          setBranches(res.data.data);
        }
      } catch (err) {
        console.log('Depolar çekilemedi:', err);
      }
    };
    fetchDepolar();
  }, [API_URL]);

  // ----------------------------------------------------
  // TAB 1 ACTIONS: Geliş Raporu & Sonraki Satışlar
  // ----------------------------------------------------
  const searchProductsForGelis = async (text: string) => {
    setGelisSearchQuery(text);
    if (!text || text.trim().length < 2) {
      setGelisSearchResults([]);
      return;
    }
    try {
      const db = dbRef.current;
      if (db) {
        const queryClean = text.trim().toUpperCase();
        const rows: any[] = await db.getAllAsync(
          `SELECT p.*, COALESCE((SELECT SUM(miktar) FROM depo_stoklar WHERE stock_code = p.stock_code), 0) as toplam_stok 
           FROM products p 
           WHERE p.stock_code LIKE ? OR p.barcode LIKE ? OR p.name_normalized LIKE ? 
           LIMIT 15`,
          [`%${queryClean}%`, `%${queryClean}%`, `%${queryClean.toLowerCase()}%`]
        );
        setGelisSearchResults(rows || []);
      }
    } catch (e) {
      setGelisSearchResults([]);
    }
  };

  const selectProductForGelis = async (prod: any) => {
    setSelectedProduct(prod);
    setGelisSearchResults([]);
    setGelisSearchQuery(prod.stock_code);

    // Mikro'dan en güncel resmi eldeki stoğu sorgula
    try {
      const qStok = `SELECT dbo.fn_EldekiMiktar('${prod.stock_code}') as CanliStok`;
      const resStok = await axios.post(API_URL, { query: qStok }, { timeout: 6000 });
      if (resStok.data?.success && resStok.data?.data?.[0]?.CanliStok !== undefined) {
        setSelectedProduct((prev: any) => ({
          ...prev,
          toplam_stok: resStok.data.data[0].CanliStok
        }));
      }
    } catch (e) {
      // yerel sqlite yedeğindeki toplam_stok kalır
    }

    await fetchProductArrivals(prod.stock_code);
  };

  const fetchProductArrivals = async (stockCode: string) => {
    if (!isConnected) {
      ToastAndroid.show('İnternet bağlantısı yok!', ToastAndroid.SHORT);
      return;
    }
    setIsLoadingGelis(true);
    setArrivals([]);
    setSelectedArrival(null);
    setSalesSummary(null);
    setSalesListSinceArrival([]);

    try {
      const q = `
        SELECT TOP 25
          CONVERT(varchar, h.sth_tarih, 23) as GelisTarihi,
          CONVERT(varchar, h.sth_create_date, 120) as IslemZamani,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          h.sth_miktar as GelenMiktar,
          h.sth_tutar as Tutar,
          CASE 
            WHEN h.sth_miktar > 0 THEN (h.sth_tutar / h.sth_miktar) 
            ELSE 0 
          END as BirimMaliyet,
          ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = h.sth_cari_kodu), h.sth_cari_kodu) as Tedarikci,
          ISNULL(s.sto_isim, '') as UrunAdi,
          ISNULL(s.sto_birim1_ad, 'Adet') as Birim
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = h.sth_stok_kod
        WHERE h.sth_stok_kod = '${stockCode}' 
          AND h.sth_tip = 0 
          AND h.sth_cins = 0
        ORDER BY h.sth_tarih DESC, h.sth_create_date DESC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 12000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        const arrList = res.data.data;
        setArrivals(arrList);
        if (arrList.length > 0) {
          // Varsayılan olarak en son geliş tarihini seç ve satışları getir
          selectArrivalItem(arrList[0], stockCode);
        } else {
          ToastAndroid.show('Bu ürüne ait mal kabul / geliş kaydı bulunamadı.', ToastAndroid.LONG);
        }
      } else {
        ToastAndroid.show('Geliş kayıtları çekilemedi.', ToastAndroid.SHORT);
      }
    } catch (err: any) {
      ToastAndroid.show('Hata: ' + (err.response?.data?.error || err.message), ToastAndroid.SHORT);
    } finally {
      setIsLoadingGelis(false);
    }
  };

  const selectArrivalItem = async (arrival: any, stockCode?: string) => {
    setSelectedArrival(arrival);
    const code = stockCode || selectedProduct?.stock_code;
    if (!code || !arrival?.GelisTarihi) return;

    setIsLoadingSalesSince(true);
    try {
      // 1. O tarihten sonraki satış özeti
      const qSummary = `
        SELECT 
          COUNT(*) as IslemAdedi,
          ISNULL(SUM(sth_miktar), 0) as ToplamSatilanMiktar,
          ISNULL(SUM(sth_tutar), 0) as ToplamSatisTutari
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE sth_stok_kod = '${code}'
          AND sth_tip = 1 
          AND sth_cins = 0
          AND sth_tarih >= '${arrival.GelisTarihi}'
      `;
      const resSummary = await axios.post(API_URL, { query: qSummary }, { timeout: 10000 });
      if (resSummary.data && resSummary.data.data && resSummary.data.data.length > 0) {
        const s = resSummary.data.data[0];
        setSalesSummary({
          count: s.IslemAdedi || 0,
          totalQty: s.ToplamSatilanMiktar || 0,
          totalAmount: s.ToplamSatisTutari || 0
        });
      }

      // 2. O tarihten sonraki satış döküm listesi
      const qList = `
        SELECT TOP 50
          CONVERT(varchar, h.sth_tarih, 23) as SatisTarihi,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          h.sth_miktar as Miktar,
          h.sth_tutar as Tutar,
          ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = h.sth_cari_kodu), h.sth_cari_kodu) as Musteri
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        WHERE h.sth_stok_kod = '${code}'
          AND h.sth_tip = 1 
          AND h.sth_cins = 0
          AND h.sth_tarih >= '${arrival.GelisTarihi}'
        ORDER BY h.sth_tarih DESC, h.sth_create_date DESC
      `;
      const resList = await axios.post(API_URL, { query: qList }, { timeout: 10000 });
      if (resList.data && resList.data.data) {
        setSalesListSinceArrival(resList.data.data);
      }
    } catch (e: any) {
      ToastAndroid.show('Satış dökümü alınamadı.', ToastAndroid.SHORT);
    } finally {
      setIsLoadingSalesSince(false);
    }
  };

  // ----------------------------------------------------
  // TAB 2 ACTIONS: Fatura Raporu
  // ----------------------------------------------------
  const fetchInvoices = async () => {
    if (!isConnected) {
      ToastAndroid.show('İnternet bağlantısı yok!', ToastAndroid.SHORT);
      return;
    }
    setIsLoadingInvoices(true);
    setInvoices([]);

    try {
      const dStart = toYMD(invStartDate);
      const dEnd = toYMD(invEndDate);

      let tipCondition = '';
      if (invTypeFilter === 'SATIS') {
        tipCondition = 'AND h.sth_tip = 1';
      } else if (invTypeFilter === 'ALIS') {
        tipCondition = 'AND h.sth_tip = 0';
      } else {
        tipCondition = 'AND h.sth_tip IN (0, 1)';
      }

      let searchCondition = '';
      let dateCondition = `AND h.sth_tarih >= '${dStart}' AND h.sth_tarih <= '${dEnd}'`;

      if (invSearchQuery && invSearchQuery.trim().length > 0) {
        const clean = invSearchQuery.trim().replace(/'/g, "''");
        searchCondition = `AND (
          h.sth_evrakno_seri LIKE '%${clean}%' 
          OR CAST(h.sth_evrakno_sira AS VARCHAR) LIKE '%${clean}%' 
          OR h.sth_cari_kodu LIKE '%${clean}%'
          OR c.cari_unvan1 LIKE '%${clean}%'
        )`;
        // Cari veya evrak arandığında kullanıcının aradığı kaydı bulabilmesi için tarih kısıtı genişletilir
        dateCondition = '';
      }

      const q = `
        SELECT TOP 60
          CONVERT(varchar, h.sth_tarih, 23) as Tarih,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          h.sth_tip as Tip,
          CASE 
            WHEN h.sth_tip = 0 THEN 'Alış Faturası'
            WHEN h.sth_tip = 1 THEN 'Satış Faturası'
            ELSE 'Diğer'
          END as EvrakTipi,
          ISNULL(c.cari_unvan1, h.sth_cari_kodu) as CariUnvan,
          COUNT(*) as KalemSayisi,
          SUM(h.sth_miktar) as ToplamMiktar,
          SUM(h.sth_tutar) as ToplamTutar
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = h.sth_cari_kodu
        WHERE h.sth_evrakno_seri <> ''
          ${dateCondition}
          ${tipCondition}
          ${searchCondition}
        GROUP BY h.sth_tarih, h.sth_evrakno_seri, h.sth_evrakno_sira, h.sth_tip, c.cari_unvan1, h.sth_cari_kodu
        ORDER BY h.sth_tarih DESC, h.sth_evrakno_sira DESC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 14000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setInvoices(res.data.data);
        if (res.data.data.length === 0) {
          ToastAndroid.show('Seçilen kriterlere uygun fatura bulunamadı.', ToastAndroid.SHORT);
        }
      }
    } catch (e: any) {
      ToastAndroid.show('Faturalar çekilemedi: ' + (e.response?.data?.error || e.message), ToastAndroid.SHORT);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  const openInvoiceDetails = async (inv: any, targetDepo?: number) => {
    const depo = targetDepo !== undefined ? targetDepo : invSelectedDepo;
    if (inv) setSelectedInvForModal(inv);
    setShowInvDetailModal(true);
    setIsLoadingInvDetails(true);
    setInvDetailItems([]);

    const activeInv = inv || selectedInvForModal;
    if (!activeInv) {
      setIsLoadingInvDetails(false);
      return;
    }

    try {
      const depoSalesCondition = depo > 0 ? `AND sth_cikis_depo_no = ${depo}` : '';
      const stockCalcExpression = depo === 0
        ? `dbo.fn_EldekiMiktar(h.sth_stok_kod)`
        : `dbo.fn_DepodakiMiktarSonDurum(h.sth_stok_kod, ${depo})`;

      const q = `
        SELECT 
          h.sth_stok_kod as StokKodu,
          ISNULL(s.sto_isim, h.sth_stok_kod) as UrunAdi,
          h.sth_miktar as Miktar,
          ISNULL(s.sto_birim1_ad, 'Adet') as Birim,
          CASE WHEN h.sth_miktar > 0 THEN (h.sth_tutar / h.sth_miktar) ELSE 0 END as BirimFiyat,
          h.sth_tutar as Tutar,
          CASE 
            WHEN h.sth_har_doviz_cinsi = 0 THEN 'TL'
            WHEN h.sth_har_doviz_cinsi = 1 THEN 'USD'
            WHEN h.sth_har_doviz_cinsi = 2 THEN 'EUR'
            WHEN h.sth_har_doviz_cinsi = 3 THEN 'GBP'
            ELSE 'TL'
          END as Doviz,
          -- Fatura tarihinden itibaren kaç adet satılmış (şube filtresine duyarlı):
          ISNULL((
            SELECT SUM(sth_miktar) 
            FROM STOK_HAREKETLERI WITH (NOLOCK) 
            WHERE sth_stok_kod = h.sth_stok_kod 
              AND sth_tip = 1 
              AND sth_cins = 0 
              AND sth_tarih >= '${activeInv.Tarih}'
              ${depoSalesCondition}
          ), 0) as SatilanAdet,
          -- Mikro resmi fonksiyonuyla net kalan stok:
          ISNULL(${stockCalcExpression}, 0) as KalanStok
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = h.sth_stok_kod
        WHERE h.sth_evrakno_seri = '${activeInv.Seri}' 
          AND h.sth_evrakno_sira = '${activeInv.Sira}' 
          AND h.sth_tip = ${activeInv.Tip}
        ORDER BY h.sth_satirno ASC, h.sth_create_date ASC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 12000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setInvDetailItems(res.data.data);
      }
    } catch (e: any) {
      ToastAndroid.show('Fatura kalemleri çekilemedi.', ToastAndroid.SHORT);
    } finally {
      setIsLoadingInvDetails(false);
    }
  };

  // Bir ürünün diğer tüm şubelerdeki satış ve kalan stok dağılımı
  const openBranchBreakdown = async (item: any) => {
    setSelectedItemForBranchBreakdown(item);
    setShowBranchBreakdownModal(true);
    setIsLoadingBranchBreakdown(true);
    setBranchBreakdownData([]);

    try {
      const invDate = selectedInvForModal?.Tarih || '2000-01-01';
      const q = `
        SELECT 
          d.dep_no,
          d.dep_adi,
          dbo.fn_DepodakiMiktarSonDurum('${item.StokKodu}', d.dep_no) as KalanStok,
          ISNULL((
            SELECT SUM(sth_miktar) 
            FROM STOK_HAREKETLERI WITH (NOLOCK) 
            WHERE sth_stok_kod = '${item.StokKodu}' 
              AND sth_tip = 1 
              AND sth_cins = 0
              AND sth_tarih >= '${invDate}'
              AND sth_cikis_depo_no = d.dep_no
          ), 0) as SatilanAdet
        FROM DEPOLAR d WITH (NOLOCK)
        ORDER BY d.dep_no ASC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 10000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        // Yalnızca stoku veya satışı olan veya tanımlı şubeleri listele
        const allBranches = res.data.data;
        setBranchBreakdownData(allBranches);
      }
    } catch (e: any) {
      ToastAndroid.show('Şube dağılımı alınamadı.', ToastAndroid.SHORT);
    } finally {
      setIsLoadingBranchBreakdown(false);
    }
  };

  // ----------------------------------------------------
  // TAB 3 ACTIONS: İki Tarih Arası Satış Raporu
  // ----------------------------------------------------
  const fetchSalesReport = async () => {
    if (!isConnected) {
      ToastAndroid.show('İnternet bağlantısı yok!', ToastAndroid.SHORT);
      return;
    }
    setIsLoadingSales(true);
    setSalesReportData([]);

    try {
      const dStart = toYMD(salesStartDate);
      const dEnd = toYMD(salesEndDate);
      const orderColumn = salesSortBy === 'QTY' ? 'ToplamSatilan' : 'ToplamTutar';

      let prodCondition = '';
      if (salesProductFilter && salesProductFilter.trim().length > 0) {
        const clean = salesProductFilter.trim().replace(/'/g, "''");
        prodCondition = `AND (h.sth_stok_kod LIKE '%${clean}%' OR s.sto_isim LIKE '%${clean}%')`;
      }

      const depoCondition = salesSelectedDepo > 0 ? `AND h.sth_cikis_depo_no = ${salesSelectedDepo}` : '';

      const q = `
        SELECT TOP 100
          h.sth_stok_kod as StokKodu,
          ISNULL(s.sto_isim, h.sth_stok_kod) as UrunAdi,
          ISNULL(s.sto_birim1_ad, 'Adet') as Birim,
          SUM(h.sth_miktar) as ToplamSatilan,
          SUM(h.sth_tutar) as ToplamTutar,
          CASE 
            WHEN SUM(h.sth_miktar) > 0 THEN (SUM(h.sth_tutar) / SUM(h.sth_miktar)) 
            ELSE 0 
          END as OrtSatisFiyati,
          COUNT(*) as SatisSayisi
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = h.sth_stok_kod
        WHERE h.sth_tarih >= '${dStart}' 
          AND h.sth_tarih <= '${dEnd}'
          AND h.sth_tip = 1 
          AND h.sth_cins = 0
          ${depoCondition}
          ${prodCondition}
        GROUP BY h.sth_stok_kod, s.sto_isim, s.sto_birim1_ad
        ORDER BY ${orderColumn} DESC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 14000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setSalesReportData(res.data.data);
        if (res.data.data.length === 0) {
          ToastAndroid.show('Seçilen kriterlere uygun satış bulunamadı.', ToastAndroid.SHORT);
        }
      }
    } catch (e: any) {
      ToastAndroid.show('Satış raporu çekilemedi: ' + (e.response?.data?.error || e.message), ToastAndroid.SHORT);
    } finally {
      setIsLoadingSales(false);
    }
  };

  const openSalesProductTransactions = async (prod: any) => {
    setSelectedSalesProdModal(prod);
    setShowSalesProdModal(true);
    setIsLoadingSalesProdMov(true);
    setSalesProdMovements([]);

    try {
      const dStart = toYMD(salesStartDate);
      const dEnd = toYMD(salesEndDate);
      const depoCondition = salesSelectedDepo > 0 ? `AND h.sth_cikis_depo_no = ${salesSelectedDepo}` : '';

      const q = `
        SELECT TOP 50
          CONVERT(varchar, h.sth_tarih, 23) as Tarih,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          h.sth_miktar as Miktar,
          h.sth_tutar as Tutar,
          ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = h.sth_cari_kodu), h.sth_cari_kodu) as Musteri,
          ISNULL((SELECT dep_adi FROM DEPOLAR WITH (NOLOCK) WHERE dep_no = h.sth_cikis_depo_no), '') as SubeAdi
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        WHERE h.sth_stok_kod = '${prod.StokKodu}'
          AND h.sth_tarih >= '${dStart}'
          AND h.sth_tarih <= '${dEnd}'
          AND h.sth_tip = 1
          AND h.sth_cins = 0
          ${depoCondition}
        ORDER BY h.sth_tarih DESC
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 10000 });
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setSalesProdMovements(res.data.data);
      }
    } catch (e: any) {
      ToastAndroid.show('Hareketler alınamadı.', ToastAndroid.SHORT);
    } finally {
      setIsLoadingSalesProdMov(false);
    }
  };

  // ----------------------------------------------------
  // EXPORT ENGINE (EXCEL & PDF)
  // ----------------------------------------------------
  const exportExcel = async (
    fileName: string,
    sheetName: string,
    data: any[]
  ) => {
    if (!data || data.length === 0) {
      Alert.alert('Uyarı', 'Dışa aktarılacak veri bulunamadı.');
      return;
    }
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_') + '.xlsx';
      const fileUri = (FileSystem as any).documentDirectory + cleanFileName;

      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: 'base64' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Excel Raporunu Paylaş'
        });
      } else {
        Alert.alert('Bilgi', 'Dosya oluşturuldu: ' + cleanFileName);
      }
    } catch (e: any) {
      Alert.alert('Hata', 'Excel oluşturulamadı: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportPdf = async (
    title: string,
    subtitle: string,
    summaryCards: { label: string; value: string; color?: string }[],
    headers: string[],
    rows: (string | number)[][]
  ) => {
    if (!rows || rows.length === 0) {
      Alert.alert('Uyarı', 'Dışa aktarılacak veri bulunamadı.');
      return;
    }
    setIsExporting(true);
    try {
      const printDate = new Date().toLocaleString('tr-TR');
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0F172A; margin: 0; padding: 0; font-size: 11px; }
            .header { border-bottom: 2px solid #0051D5; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
            .brand { font-size: 18px; font-weight: 900; color: #0051D5; letter-spacing: -0.5px; }
            .title { font-size: 15px; font-weight: 800; color: #0F172A; margin-top: 4px; }
            .subtitle { font-size: 11px; color: #64748B; margin-top: 2px; }
            .meta { text-align: right; font-size: 10px; color: #64748B; }
            .cards { display: flex; gap: 10px; margin-bottom: 16px; }
            .card { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px; text-align: center; }
            .card-label { font-size: 9px; font-weight: 700; color: #64748B; text-transform: uppercase; margin-bottom: 4px; }
            .card-value { font-size: 14px; font-weight: 900; color: #0F172A; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
            th { background: #F1F5F9; color: #334155; font-weight: 700; text-align: left; padding: 7px 6px; border-bottom: 1.5px solid #CBD5E1; }
            td { padding: 6px 6px; border-bottom: 1px solid #E2E8F0; }
            tr:nth-child(even) { background: #FAFAFA; }
            .num { text-align: right; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
            .badge-green { background: #DCFCE7; color: #166534; }
            .badge-blue { background: #E0E7FF; color: #3730A3; }
            .footer { margin-top: 25px; border-top: 1px solid #E2E8F0; padding-top: 10px; text-align: center; font-size: 9px; color: #94A3B8; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">MD SAYIM & STOK</div>
              <div class="title">${title}</div>
              <div class="subtitle">${subtitle}</div>
            </div>
            <div class="meta">
              <div>Rapor Tarihi: ${printDate}</div>
              <div>Toplam Kayıt: ${rows.length}</div>
            </div>
          </div>

          ${summaryCards.length > 0 ? `
            <div class="cards">
              ${summaryCards.map(c => `
                <div class="card">
                  <div class="card-label">${c.label}</div>
                  <div class="card-value" style="${c.color ? `color: ${c.color};` : ''}">${c.value}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  ${r.map((cell, idx) => {
                    const isNum = typeof cell === 'number' || (typeof cell === 'string' && /^[0-9.,]+(\s?(TL|USD|EUR|GBP|Adet|MT))?$/.test(cell));
                    return `<td class="${isNum && idx > 1 ? 'num' : ''}">${cell}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Bu rapor MD Mobil Uygulaması üzerinden üretilmiştir. &bull; ${printDate}
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF Raporunu Paylaş / Yazdır'
        });
      } else {
        Alert.alert('Bilgi', 'PDF oluşturuldu.');
      }
    } catch (e: any) {
      Alert.alert('Hata', 'PDF oluşturulamadı: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* HEADER SECTION */}
      <View style={[styles.headerBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]} onPress={onBackToMenu}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Raporlama & Analiz</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Geliş tarihi, faturalar ve satış raporları</Text>
        </View>
      </View>

      {/* SEGMENTED TAB SELECTOR */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'gelis' && [styles.tabItemActive, { borderBottomColor: colors.primary }]]}
          onPress={() => setActiveTab('gelis')}
        >
          <Ionicons name="cube-outline" size={18} color={activeTab === 'gelis' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'gelis' ? colors.primary : colors.textMuted }]}>
            Geliş Tarihi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'fatura' && [styles.tabItemActive, { borderBottomColor: colors.primary }]]}
          onPress={() => {
            setActiveTab('fatura');
            if (invoices.length === 0) fetchInvoices();
          }}
        >
          <Ionicons name="receipt-outline" size={18} color={activeTab === 'fatura' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'fatura' ? colors.primary : colors.textMuted }]}>
            Faturalar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'satis' && [styles.tabItemActive, { borderBottomColor: colors.primary }]]}
          onPress={() => {
            setActiveTab('satis');
            if (salesReportData.length === 0) fetchSalesReport();
          }}
        >
          <Ionicons name="trending-up-outline" size={18} color={activeTab === 'satis' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, { color: activeTab === 'satis' ? colors.primary : colors.textMuted }]}>
            Satış Raporu
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* TAB 1: GELİŞ TARİHİNE GÖRE RAPOR (ÜRÜN BAZLI GELİŞ VE SATIŞLAR)           */}
      {/* ========================================================================= */}
      {activeTab === 'gelis' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {/* SEARCH BOX */}
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={20} color={colors.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Stok kodu, barkod veya ürün adı yazın..."
              placeholderTextColor={colors.textMuted}
              value={gelisSearchQuery}
              onChangeText={searchProductsForGelis}
              autoCapitalize="characters"
            />
            {gelisSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setGelisSearchQuery(''); setGelisSearchResults([]); }} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* AUTOCOMPLETE DROPDOWN */}
          {gelisSearchResults.length > 0 && (
            <View style={[styles.dropdownList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {gelisSearchResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                  onPress={() => selectProductForGelis(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>{item.stock_code}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
                    <Text style={{ color: colors.success, fontSize: 11, fontWeight: 'bold' }}>
                      Stok: {formatPrice(item.toplam_stok || 0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isLoadingGelis ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 13 }}>Geliş kayıtları taranıyor...</Text>
            </View>
          ) : selectedProduct ? (
            <View>
              {/* PRODUCT SUMMARY HERO CARD */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>
                      STOK KODU: {selectedProduct.stock_code}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold', marginTop: 3 }}>
                      {selectedProduct.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      Birim: {selectedProduct.unit || 'Adet'} &bull; Fiyat: {formatPrice(selectedProduct.price || 0)} {selectedProduct.currency || 'TL'}
                    </Text>
                  </View>
                  <View style={[styles.stockBadgeBox, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: 'bold' }}>ANLIK STOK</Text>
                    <Text style={{ color: colors.success, fontSize: 18, fontWeight: '900' }}>
                      {formatPrice(selectedProduct.toplam_stok || 0)}
                    </Text>
                  </View>
                </View>

                {/* EXCEL & PDF EXPORT BUTTONS FOR GELIS */}
                {selectedArrival && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                      disabled={isExporting}
                      onPress={() => {
                        const excelRows = salesListSinceArrival.map((s, idx) => ({
                          'Sıra': idx + 1,
                          'Stok Kodu': selectedProduct.stock_code,
                          'Ürün Adı': selectedProduct.name,
                          'Geliş Tarihi': toDMY(selectedArrival.GelisTarihi),
                          'Gelen Miktar': selectedArrival.GelenMiktar,
                          'Tedarikçi': selectedArrival.Tedarikci,
                          'Satış Tarihi': toDMY(s.SatisTarihi),
                          'Fatura Seri/Sıra': `${s.Seri || ''} ${s.Sira || ''}`,
                          'Satılan Miktar': s.Miktar,
                          'Satış Tutarı': s.Tutar,
                          'Müşteri': s.Musteri
                        }));
                        exportExcel(`${selectedProduct.stock_code}_Gelis_Satis_Raporu`, 'Geliş ve Satışlar', excelRows);
                      }}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>Excel İndir</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                      disabled={isExporting}
                      onPress={() => {
                        const pdfRows = salesListSinceArrival.map((s, idx) => [
                          (idx + 1).toString(),
                          toDMY(s.SatisTarihi),
                          `${s.Seri || ''} ${s.Sira || ''}`,
                          s.Musteri || '',
                          `${formatPrice(s.Miktar)} Adet`,
                          `${formatPrice(s.Tutar)} TL`
                        ]);
                        exportPdf(
                          `Geliş Tarihine Göre Satış Raporu`,
                          `${selectedProduct.stock_code} - ${selectedProduct.name}`,
                          [
                            { label: 'Geliş Tarihi', value: toDMY(selectedArrival.GelisTarihi), color: '#4F46E5' },
                            { label: 'Gelen Miktar', value: `${formatPrice(selectedArrival.GelenMiktar)} Adet` },
                            { label: 'O Tarihten Sonra Satılan', value: `${formatPrice(salesSummary?.totalQty || 0)} Adet`, color: '#DC2626' },
                            { label: 'Kalan Stok', value: `${formatPrice(selectedProduct.toplam_stok || 0)} Adet`, color: '#16A34A' }
                          ],
                          ['#', 'Satış Tarihi', 'Fatura No', 'Müşteri', 'Miktar', 'Tutar'],
                          pdfRows
                        );
                      }}
                    >
                      <Ionicons name="download-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>PDF İndir</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* GELİŞ (GİRİŞ) HAREKETLERİ LİSTESİ */}
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Mal Kabul / Geliş Tarihleri ({arrivals.length})
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
                Aşağıdaki geliş kayıtlarından birine dokunarak o tarihten sonraki satışları inceleyebilirsiniz:
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {arrivals.map((arr, idx) => {
                  const isSelected = selectedArrival && selectedArrival.GelisTarihi === arr.GelisTarihi && selectedArrival.Sira === arr.Sira;
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => selectArrivalItem(arr)}
                      style={[
                        styles.arrivalCard,
                        {
                          backgroundColor: isSelected ? colors.primarySoft : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border
                        }
                      ]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ color: isSelected ? colors.primary : colors.text, fontWeight: 'bold', fontSize: 13 }}>
                          📅 {toDMY(arr.GelisTarihi)}
                        </Text>
                        <Text style={{ color: '#888', fontSize: 10 }}>
                          {arr.Seri} {arr.Sira}
                        </Text>
                      </View>
                      <Text style={{ color: colors.success, fontSize: 14, fontWeight: '900', marginVertical: 2 }}>
                        +{formatPrice(arr.GelenMiktar)} {arr.Birim || 'Adet'}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                        Tedarikçi: {arr.Tedarikci || '-'}
                      </Text>
                      {arr.BirimMaliyet > 0 && (
                        <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                          Maliyet: {formatPrice(arr.BirimMaliyet)} TL
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* SEÇİLEN GELİŞTEN İTİBAREN SATIŞLAR ÖZET KUTUSU */}
              {selectedArrival && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="analytics-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>
                      {toDMY(selectedArrival.GelisTarihi)} Tarihinden İtibaren Satışlar
                    </Text>
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={[styles.statBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>GELEN MİKTAR</Text>
                      <Text style={[styles.statValue, { color: colors.primary }]}>
                        {formatPrice(selectedArrival.GelenMiktar)}
                      </Text>
                    </View>

                    <View style={[styles.statBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>SATILAN ADET</Text>
                      <Text style={[styles.statValue, { color: colors.danger }]}>
                        {formatPrice(salesSummary?.totalQty || 0)}
                      </Text>
                    </View>

                    <View style={[styles.statBox, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                      <Text style={[styles.statLabel, { color: colors.textMuted }]}>SATIŞ CİROSU</Text>
                      <Text style={[styles.statValue, { color: colors.success }]}>
                        {formatPrice(salesSummary?.totalAmount || 0)} TL
                      </Text>
                    </View>
                  </View>

                  {/* SATIŞ DETAY DÖKÜM LİSTESİ */}
                  <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 15 }]}>
                    Satış Evrakları & Faturaları ({salesListSinceArrival.length})
                  </Text>

                  {isLoadingSalesSince ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                  ) : salesListSinceArrival.length === 0 ? (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                        Bu geliş tarihinden itibaren hiç satış kaydı oluşmamış.
                      </Text>
                    </View>
                  ) : (
                    salesListSinceArrival.map((sale, idx) => (
                      <View key={idx} style={[styles.saleItemRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>
                              {toDMY(sale.SatisTarihi)}
                            </Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 8 }}>
                              {sale.Seri} {sale.Sira}
                            </Text>
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            Müşteri: {sale.Musteri || 'Perakende'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 14 }}>
                            -{formatPrice(sale.Miktar)} {selectedProduct.unit || 'Adet'}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                            {formatPrice(sale.Tutar)} TL
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="barcode-outline" size={54} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 12 }} />
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: 'bold', textAlign: 'center' }}>
                Ürün Stok Kodu veya Adı Girin
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                Yukarıdaki arama alanına bir ürünün stok kodunu (örneğin S.3585) yazdığınızda, o ürünün depoya giriş tarihleri ve her gelişten sonra kaç adet satıldığı detaylı olarak dökülecektir.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: FATURAYA GÖRE RAPOR (ALIŞ VE SATIŞ FATURALARI)                       */}
      {/* ========================================================================= */}
      {activeTab === 'fatura' && (
        <View style={{ flex: 1, padding: 16 }}>
          {/* FILTER CARD */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12, padding: 12 }]}>
            {/* DATE PICKERS */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                onPress={() => setShowInvStartPicker(true)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold' }}>BAŞLANGIÇ</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                  {toDMY(invStartDate)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                onPress={() => setShowInvEndPicker(true)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold' }}>BİTİŞ</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                  {toDMY(invEndDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {showInvStartPicker && (
              <DateTimePicker
                value={invStartDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowInvStartPicker(false);
                  if (date) setInvStartDate(date);
                }}
              />
            )}
            {showInvEndPicker && (
              <DateTimePicker
                value={invEndDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowInvEndPicker(false);
                  if (date) setInvEndDate(date);
                }}
              />
            )}

            {/* TYPE FILTER PILLS */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(['ALL', 'SATIS', 'ALIS'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setInvTypeFilter(type)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: invTypeFilter === type ? colors.primary : colors.cardAlt,
                      borderColor: invTypeFilter === type ? colors.primary : colors.border
                    }
                  ]}
                >
                  <Text style={{ color: invTypeFilter === type ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                    {type === 'ALL' ? 'Tümü' : type === 'SATIS' ? 'Satış Faturaları' : 'Alış Faturaları'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SEARCH & REFRESH ROW */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.filterInput, { flex: 1, backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
                placeholder="Seri, Sıra veya Cari..."
                placeholderTextColor={colors.textMuted}
                value={invSearchQuery}
                onChangeText={setInvSearchQuery}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={[styles.filterSubmitBtn, { backgroundColor: colors.primary }]} onPress={fetchInvoices}>
                <Ionicons name="search" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Getir</Text>
              </TouchableOpacity>
            </View>

            {/* EXCEL & PDF EXPORT BUTTONS */}
            {invoices.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                  disabled={isExporting}
                  onPress={() => {
                    const excelRows = invoices.map((inv, idx) => ({
                      'Sıra': idx + 1,
                      'Tarih': toDMY(inv.Tarih),
                      'Evrak Seri/Sıra': `${inv.Seri || ''} ${inv.Sira || ''}`,
                      'Fatura Türü': inv.EvrakTipi,
                      'Cari Ünvanı': inv.CariUnvan,
                      'Kalem Sayısı': inv.KalemSayisi,
                      'Toplam Miktar': inv.ToplamMiktar,
                      'Toplam Tutar': inv.ToplamTutar
                    }));
                    exportExcel(`Fatura_Raporu_${toYMD(invStartDate)}_${toYMD(invEndDate)}`, 'Faturalar', excelRows);
                  }}
                >
                  <Ionicons name="document-text-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={styles.actionBtnText}>Excel İndir ({invoices.length})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                  disabled={isExporting}
                  onPress={() => {
                    const totalMeblag = invoices.reduce((acc, i) => acc + (i.ToplamTutar || 0), 0);
                    const pdfRows = invoices.map((inv, idx) => [
                      (idx + 1).toString(),
                      toDMY(inv.Tarih),
                      `${inv.Seri || ''} ${inv.Sira || ''}`,
                      inv.EvrakTipi || '',
                      inv.CariUnvan || '',
                      `${formatPrice(inv.ToplamMiktar)}`,
                      `${formatPrice(inv.ToplamTutar)} TL`
                    ]);
                    exportPdf(
                      `Fatura Listesi Raporu`,
                      `${toDMY(invStartDate)} - ${toDMY(invEndDate)} Arası Faturalar`,
                      [
                        { label: 'Fatura Sayısı', value: `${invoices.length} Adet` },
                        { label: 'Toplam Tutar', value: `${formatPrice(totalMeblag)} TL`, color: '#4F46E5' }
                      ],
                      ['#', 'Tarih', 'Fatura No', 'Tür', 'Cari Ünvan', 'Miktar', 'Tutar'],
                      pdfRows
                    );
                  }}
                >
                  <Ionicons name="download-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={styles.actionBtnText}>PDF İndir</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* INVOICE LIST */}
          {isLoadingInvoices ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 13 }}>Faturalar yükleniyor...</Text>
            </View>
          ) : (
            <FlatList
              data={invoices}
              keyExtractor={(item, index) => `${item.Seri}_${item.Sira}_${index}`}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSatis = item.Tip === 1;
                return (
                  <TouchableOpacity
                    style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => openInvoiceDetails(item)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.badge, { backgroundColor: isSatis ? colors.successSoft : colors.primarySoft }]}>
                          <Text style={{ color: isSatis ? colors.success : colors.primary, fontSize: 10, fontWeight: '900' }}>
                            {isSatis ? 'SATIŞ' : 'ALIŞ'}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>
                          {item.Seri} {item.Sira}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {toDMY(item.Tarih)}
                      </Text>
                    </View>

                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                      {item.CariUnvan || 'Tanımsız Cari'}
                    </Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        {item.KalemSayisi} Kalem &bull; {formatPrice(item.ToplamMiktar)} Adet
                      </Text>
                      <Text style={{ color: isSatis ? colors.success : colors.primary, fontWeight: '900', fontSize: 15 }}>
                        {formatPrice(item.ToplamTutar)} TL
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={() => (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={48} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 10 }} />
                  <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                    Kriterlere uygun fatura bulunamadı. Tarih filtrelerini değiştirip 'Getir' butonuna basınız.
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: İKİ TARİH ARASI SATIŞ RAPORU (ÜRÜN BAZINDA SATIŞ ANALİZİ)          */}
      {/* ========================================================================= */}
      {activeTab === 'satis' && (
        <View style={{ flex: 1, padding: 16 }}>
          {/* FILTER CARD */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12, padding: 12 }]}>
            {/* DATE PICKERS */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                onPress={() => setShowSalesStartPicker(true)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold' }}>BAŞLANGIÇ</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                  {toDMY(salesStartDate)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                onPress={() => setShowSalesEndPicker(true)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold' }}>BİTİŞ</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                  {toDMY(salesEndDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {showSalesStartPicker && (
              <DateTimePicker
                value={salesStartDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowSalesStartPicker(false);
                  if (date) setSalesStartDate(date);
                }}
              />
            )}
            {showSalesEndPicker && (
              <DateTimePicker
                value={salesEndDate}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowSalesEndPicker(false);
                  if (date) setSalesEndDate(date);
                }}
              />
            )}

            {/* SORT & FILTER OPTIONS */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setSalesSortBy('QTY')}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: salesSortBy === 'QTY' ? colors.primary : colors.cardAlt,
                      borderColor: salesSortBy === 'QTY' ? colors.primary : colors.border
                    }
                  ]}
                >
                  <Text style={{ color: salesSortBy === 'QTY' ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                    En Çok Satan Adet
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSalesSortBy('AMOUNT')}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: salesSortBy === 'AMOUNT' ? colors.primary : colors.cardAlt,
                      borderColor: salesSortBy === 'AMOUNT' ? colors.primary : colors.border
                    }
                  ]}
                >
                  <Text style={{ color: salesSortBy === 'AMOUNT' ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                    En Yüksek Ciro
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.filterSubmitBtn, { backgroundColor: colors.primary }]} onPress={fetchSalesReport}>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Raporla</Text>
              </TouchableOpacity>
            </View>

            {/* BRANCH / WAREHOUSE FILTER PILLS */}
            <View style={{ marginBottom: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>
                ŞUBE / DEPO FİLTRESİ
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setSalesSelectedDepo(0)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: salesSelectedDepo === 0 ? colors.primary : colors.cardAlt,
                      borderColor: salesSelectedDepo === 0 ? colors.primary : colors.border,
                      paddingVertical: 6,
                      paddingHorizontal: 10
                    }
                  ]}
                >
                  <Text style={{ color: salesSelectedDepo === 0 ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                    🏢 Tüm Şubeler
                  </Text>
                </TouchableOpacity>
                {branches.map(b => (
                  <TouchableOpacity
                    key={b.dep_no}
                    onPress={() => setSalesSelectedDepo(b.dep_no)}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor: salesSelectedDepo === b.dep_no ? colors.primary : colors.cardAlt,
                        borderColor: salesSelectedDepo === b.dep_no ? colors.primary : colors.border,
                        paddingVertical: 6,
                        paddingHorizontal: 10
                      }
                    ]}
                  >
                    <Text style={{ color: salesSelectedDepo === b.dep_no ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                      {b.dep_adi}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* PRODUCT CODE/NAME SEARCH */}
            <TextInput
              style={[styles.filterInput, { backgroundColor: colors.cardAlt, borderColor: colors.border, color: colors.text }]}
              placeholder="Ürün adı veya stok kodu ile filtrele..."
              placeholderTextColor={colors.textMuted}
              value={salesProductFilter}
              onChangeText={setSalesProductFilter}
              autoCapitalize="characters"
            />

            {/* SUMMARY BAR & EXPORT BUTTONS */}
            {salesReportData.length > 0 && (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    Toplam Çeşit: <Text style={{ color: colors.text, fontWeight: 'bold' }}>{salesReportData.length}</Text>
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    Toplam Satış: <Text style={{ color: colors.danger, fontWeight: 'bold' }}>
                      {formatPrice(salesReportData.reduce((a, b) => a + (b.ToplamSatilan || 0), 0))} Adet
                    </Text>
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    Toplam Ciro: <Text style={{ color: colors.success, fontWeight: 'bold' }}>
                      {formatPrice(salesReportData.reduce((a, b) => a + (b.ToplamTutar || 0), 0))} TL
                    </Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    disabled={isExporting}
                    onPress={() => {
                      const excelRows = salesReportData.map((s, idx) => ({
                        'Sıra': idx + 1,
                        'Stok Kodu': s.StokKodu,
                        'Ürün Adı': s.UrunAdi,
                        'Birim': s.Birim,
                        'Satılan Miktar': s.ToplamSatilan,
                        'Satış Tutarı (Ciro)': s.ToplamTutar,
                        'Ortalama Fiyat': s.OrtSatisFiyati,
                        'İşlem Sayısı': s.SatisSayisi
                      }));
                      exportExcel(`Satis_Raporu_${toYMD(salesStartDate)}_${toYMD(salesEndDate)}`, 'Satışlar', excelRows);
                    }}
                  >
                    <Ionicons name="document-text-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
                    <Text style={styles.actionBtnText}>Excel İndir</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                    disabled={isExporting}
                    onPress={() => {
                      const totalQty = salesReportData.reduce((a, b) => a + (b.ToplamSatilan || 0), 0);
                      const totalAmt = salesReportData.reduce((a, b) => a + (b.ToplamTutar || 0), 0);
                      const pdfRows = salesReportData.map((s, idx) => [
                        (idx + 1).toString(),
                        s.StokKodu,
                        s.UrunAdi,
                        `${formatPrice(s.ToplamSatilan)} ${s.Birim || 'Adet'}`,
                        `${formatPrice(s.ToplamTutar)} TL`,
                        `${formatPrice(s.OrtSatisFiyati)} TL`
                      ]);
                      exportPdf(
                        `İki Tarih Arası Satış Raporu`,
                        `${toDMY(salesStartDate)} - ${toDMY(salesEndDate)} Arası En Çok Satanlar`,
                        [
                          { label: 'Satılan Ürün Çeşidi', value: `${salesReportData.length} Kalem` },
                          { label: 'Toplam Satılan Adet', value: `${formatPrice(totalQty)} Adet`, color: '#DC2626' },
                          { label: 'Toplam Satış Cirosu', value: `${formatPrice(totalAmt)} TL`, color: '#16A34A' }
                        ],
                        ['#', 'Stok Kodu', 'Ürün Adı', 'Satılan Miktar', 'Toplam Tutar', 'Ort. Fiyat'],
                        pdfRows
                      );
                    }}
                  >
                    <Ionicons name="download-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
                    <Text style={styles.actionBtnText}>PDF İndir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* SALES REPORT LIST */}
          {isLoadingSales ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 13 }}>Satış verileri analiz ediliyor...</Text>
            </View>
          ) : (
            <FlatList
              data={salesReportData}
              keyExtractor={(item) => item.StokKodu}
              showsVerticalScrollIndicator={false}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => openSalesProductTransactions(item)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={[styles.rankBadge, { backgroundColor: index < 3 ? colors.primary : colors.cardAlt }]}>
                      <Text style={{ color: index < 3 ? '#fff' : colors.textMuted, fontWeight: '900', fontSize: 12 }}>
                        #{index + 1}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 10, marginRight: 10 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: 'bold' }}>{item.StokKodu}</Text>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{item.UrunAdi}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        Ort. Fiyat: {formatPrice(item.OrtSatisFiyati)} TL &bull; {item.SatisSayisi} Fatura
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 15 }}>
                        {formatPrice(item.ToplamSatilan)} {item.Birim || 'Adet'}
                      </Text>
                      <Text style={{ color: colors.success, fontWeight: 'bold', fontSize: 13, marginTop: 2 }}>
                        {formatPrice(item.ToplamTutar)} TL
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Ionicons name="trending-up-outline" size={48} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 10 }} />
                  <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                    Seçilen tarih aralığında satış bulunamadı. Tarihleri kontrol edip 'Raporla' butonuna basınız.
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: FATURA İÇİ KALEM DETAYI                                         */}
      {/* ========================================================================= */}
      <Modal
        isVisible={showInvDetailModal}
        onBackdropPress={() => setShowInvDetailModal(false)}
        style={{ margin: 16, justifyContent: 'center' }}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <View style={[styles.badge, { backgroundColor: selectedInvForModal?.Tip === 1 ? colors.successSoft : colors.primarySoft }]}>
                  <Text style={{ color: selectedInvForModal?.Tip === 1 ? colors.success : colors.primary, fontSize: 10, fontWeight: '900' }}>
                    {selectedInvForModal?.EvrakTipi || 'Fatura'}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '900' }}>
                  {selectedInvForModal?.Seri} {selectedInvForModal?.Sira}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }} numberOfLines={2}>
                {selectedInvForModal?.CariUnvan}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Fatura Tarihi: {toDMY(selectedInvForModal?.Tarih)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowInvDetailModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ŞUBE FİLTRESİ SEÇİCİ */}
          <View style={{ marginVertical: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
              ŞUBE FİLTRESİ
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity
                onPress={() => {
                  setInvSelectedDepo(0);
                  openInvoiceDetails(null, 0);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: invSelectedDepo === 0 ? colors.primary : colors.cardAlt,
                    borderColor: invSelectedDepo === 0 ? colors.primary : colors.border,
                    paddingVertical: 5,
                    paddingHorizontal: 10
                  }
                ]}
              >
                <Text style={{ color: invSelectedDepo === 0 ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                  🏢 Tüm Şubeler (Genel)
                </Text>
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.dep_no}
                  onPress={() => {
                    setInvSelectedDepo(b.dep_no);
                    openInvoiceDetails(null, b.dep_no);
                  }}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: invSelectedDepo === b.dep_no ? colors.primary : colors.cardAlt,
                      borderColor: invSelectedDepo === b.dep_no ? colors.primary : colors.border,
                      paddingVertical: 5,
                      paddingHorizontal: 10
                    }
                  ]}
                >
                  <Text style={{ color: invSelectedDepo === b.dep_no ? '#fff' : colors.text, fontSize: 11, fontWeight: 'bold' }}>
                    {b.dep_adi}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* RAPOR AL BUTONLARI (EXCEL & PDF) */}
          <View style={{ flexDirection: 'row', gap: 10, marginVertical: 10 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981', paddingVertical: 11 }]}
              onPress={() => {
                const branchName = invSelectedDepo === 0 ? 'Tüm Şubeler' : (branches.find(b => b.dep_no === invSelectedDepo)?.dep_adi || `Şube ${invSelectedDepo}`);
                const rows = invDetailItems.map((item, idx) => ({
                  'Sıra': idx + 1,
                  'Şube': branchName,
                  'Stok Kodu': item.StokKodu,
                  'Ürün Adı': item.UrunAdi,
                  'Fatura Miktarı': item.Miktar,
                  'Faturadan İtibaren Satılan': item.SatilanAdet,
                  'Kalan Stok': item.KalanStok,
                  'Birim': item.Birim,
                  'Birim Fiyat': item.BirimFiyat,
                  'Fatura Tutarı': item.Tutar,
                  'Döviz': item.Doviz
                }));
                exportExcel(`Fatura_Rapor_${selectedInvForModal?.Seri}_${selectedInvForModal?.Sira}`, 'Fatura ve Stok Durumu', rows);
              }}
            >
              <Ionicons name="document-text-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
              <Text style={[styles.actionBtnText, { fontSize: 13 }]}>Excel Rapor Al</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#EF4444', paddingVertical: 11 }]}
              onPress={() => {
                const branchName = invSelectedDepo === 0 ? 'Tüm Şubeler' : (branches.find(b => b.dep_no === invSelectedDepo)?.dep_adi || `Şube ${invSelectedDepo}`);
                const totalSatilan = invDetailItems.reduce((acc, i) => acc + (i.SatilanAdet || 0), 0);
                const totalKalan = invDetailItems.reduce((acc, i) => acc + (i.KalanStok || 0), 0);
                const rows = invDetailItems.map((item, idx) => [
                  (idx + 1).toString(),
                  item.StokKodu,
                  item.UrunAdi,
                  `${formatPrice(item.Miktar)} ${item.Birim}`,
                  `${formatPrice(item.SatilanAdet)} Adet`,
                  `${formatPrice(item.KalanStok)} Adet`,
                  `${formatPrice(item.Tutar)} ${item.Doviz}`
                ]);
                exportPdf(
                  `Fatura Satış & Kalan Stok Raporu (${branchName})`,
                  `${selectedInvForModal?.Seri} ${selectedInvForModal?.Sira} &bull; ${selectedInvForModal?.CariUnvan} &bull; ${toDMY(selectedInvForModal?.Tarih)}`,
                  [
                    { label: 'Fatura Tutarı', value: `${formatPrice(selectedInvForModal?.ToplamTutar || 0)} TL`, color: '#4F46E5' },
                    { label: `${branchName} Satılan`, value: `${formatPrice(totalSatilan)} Adet`, color: '#DC2626' },
                    { label: `${branchName} Kalan Stok`, value: `${formatPrice(totalKalan)} Adet`, color: '#16A34A' }
                  ],
                  ['#', 'Stok Kodu', 'Ürün Adı', 'Fat. Miktar', 'Satılan Adet', 'Kalan Stok', 'Tutar'],
                  rows
                );
              }}
            >
              <Ionicons name="download-outline" size={17} color="#fff" style={{ marginRight: 6 }} />
              <Text style={[styles.actionBtnText, { fontSize: 13 }]}>PDF Rapor Al</Text>
            </TouchableOpacity>
          </View>

          {isLoadingInvDetails ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={invDetailItems}
              keyExtractor={(item, index) => `${item.StokKodu}_${index}`}
              style={{ maxHeight: 360 }}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => openBranchBreakdown(item)}
                  style={[styles.detailItemRow, { borderBottomColor: colors.border, paddingVertical: 10 }]}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '900' }}>{item.StokKodu}</Text>
                      <View style={[styles.miniBadge, { backgroundColor: colors.primarySoft, borderColor: colors.primary, paddingHorizontal: 5, paddingVertical: 1 }]}>
                        <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800' }}>Şube Dağılımı 🔍</Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>{item.UrunAdi}</Text>

                    {/* FATURA MİKTARI | SATILAN ADET | KALAN STOK ROZETLERİ */}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <View style={[styles.miniBadge, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: 'bold' }}>
                          Fatura: <Text style={{ color: colors.text }}>{formatPrice(item.Miktar)} {item.Birim}</Text>
                        </Text>
                      </View>

                      <View style={[styles.miniBadge, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
                        <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '900' }}>
                          Satılan: {formatPrice(item.SatilanAdet)}
                        </Text>
                      </View>

                      <View style={[styles.miniBadge, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                        <Text style={{ color: colors.success, fontSize: 10, fontWeight: '900' }}>
                          Kalan: {formatPrice(item.KalanStok)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={{ color: colors.success, fontWeight: '900', fontSize: 14 }}>
                      {formatPrice(item.Tutar)} {item.Doviz}
                    </Text>
                    {item.BirimFiyat > 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                        Birim: {formatPrice(item.BirimFiyat)}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: 'bold' }}>Genel Toplam:</Text>
            <Text style={{ color: colors.success, fontSize: 18, fontWeight: '900' }}>
              {formatPrice(selectedInvForModal?.ToplamTutar || 0)} TL
            </Text>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: SATIŞ RAPORUNDAN SEÇİLEN ÜRÜNÜN HAREKETLERİ                      */}
      {/* ========================================================================= */}
      <Modal
        isVisible={showSalesProdModal}
        onBackdropPress={() => setShowSalesProdModal(false)}
        style={{ margin: 16, justifyContent: 'center' }}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '900' }}>
                {selectedSalesProdModal?.StokKodu}
              </Text>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: 'bold', marginTop: 2 }}>
                {selectedSalesProdModal?.UrunAdi}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Dönem: {toDMY(salesStartDate)} - {toDMY(salesEndDate)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowSalesProdModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoadingSalesProdMov ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={salesProdMovements}
              keyExtractor={(item, index) => index.toString()}
              style={{ maxHeight: 350 }}
              renderItem={({ item }) => (
                <View style={[styles.detailItemRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 13 }}>
                      {toDMY(item.Tarih)} &bull; {item.Seri} {item.Sira}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {item.Musteri || 'Perakende'} {item.SubeAdi ? `• 🏢 ${item.SubeAdi}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.danger, fontWeight: '900', fontSize: 14 }}>
                      -{formatPrice(item.Miktar)} {selectedSalesProdModal?.Birim || 'Adet'}
                    </Text>
                    <Text style={{ color: colors.success, fontSize: 12, fontWeight: 'bold', marginTop: 1 }}>
                      {formatPrice(item.Tutar)} TL
                    </Text>
                  </View>
                </View>
              )}
            />
          )}

          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: 'bold' }}>Dönem Toplam Satışı:</Text>
            <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '900' }}>
              {formatPrice(selectedSalesProdModal?.ToplamSatilan || 0)} {selectedSalesProdModal?.Birim || 'Adet'}
            </Text>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: ÜRÜNÜN DİĞER ŞUBELERDEKİ SATIŞ VE KALAN STOK DAĞILIMI            */}
      {/* ========================================================================= */}
      <Modal
        isVisible={showBranchBreakdownModal}
        onBackdropPress={() => setShowBranchBreakdownModal(false)}
        style={{ margin: 16, justifyContent: 'center' }}
      >
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '900' }}>ŞUBE DAĞILIMI</Text>
                </View>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '900' }}>
                  {selectedItemForBranchBreakdown?.StokKodu}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: 'bold' }} numberOfLines={2}>
                {selectedItemForBranchBreakdown?.UrunAdi}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                Fatura Tarihi ({toDMY(selectedInvForModal?.Tarih)}) İtibariyle Satış & Kalan Stok
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowBranchBreakdownModal(false)} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* EXCEL & PDF EXPORT FOR BRANCH BREAKDOWN */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#10B981', paddingVertical: 8 }]}
              onPress={() => {
                const rows = branchBreakdownData.map((b, idx) => ({
                  'Sıra': idx + 1,
                  'Şube / Depo No': b.dep_no,
                  'Şube / Depo Adı': b.dep_adi,
                  'Kalan Stok': b.KalanStok,
                  'O Tarihten Beri Satılan': b.SatilanAdet
                }));
                exportExcel(
                  `Sube_Dagilimi_${selectedItemForBranchBreakdown?.StokKodu}`,
                  'Şube Dağılımı',
                  rows
                );
              }}
            >
              <Ionicons name="document-text-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
              <Text style={[styles.actionBtnText, { fontSize: 12 }]}>Excel İndir</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#EF4444', paddingVertical: 8 }]}
              onPress={() => {
                const totalKalan = branchBreakdownData.reduce((acc, i) => acc + (i.KalanStok || 0), 0);
                const totalSatilan = branchBreakdownData.reduce((acc, i) => acc + (i.SatilanAdet || 0), 0);
                const rows = branchBreakdownData.map((b, idx) => [
                  (idx + 1).toString(),
                  b.dep_adi,
                  `${formatPrice(b.KalanStok)} Adet`,
                  `${formatPrice(b.SatilanAdet)} Adet`
                ]);
                exportPdf(
                  `Ürün Şube Dağılım Raporu`,
                  `${selectedItemForBranchBreakdown?.StokKodu} - ${selectedItemForBranchBreakdown?.UrunAdi}`,
                  [
                    { label: 'Toplam Kalan Stok', value: `${formatPrice(totalKalan)} Adet`, color: '#16A34A' },
                    { label: 'Toplam Satılan', value: `${formatPrice(totalSatilan)} Adet`, color: '#DC2626' }
                  ],
                  ['#', 'Şube / Depo', 'Kalan Stok', 'Satılan Adet'],
                  rows
                );
              }}
            >
              <Ionicons name="download-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
              <Text style={[styles.actionBtnText, { fontSize: 12 }]}>PDF İndir</Text>
            </TouchableOpacity>
          </View>

          {isLoadingBranchBreakdown ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={branchBreakdownData}
              keyExtractor={(item) => item.dep_no.toString()}
              style={{ maxHeight: 330 }}
              renderItem={({ item }) => {
                const hasActivity = item.KalanStok !== 0 || item.SatilanAdet !== 0;
                return (
                  <View style={[
                    styles.detailItemRow,
                    {
                      borderBottomColor: colors.border,
                      paddingVertical: 9,
                      opacity: hasActivity ? 1 : 0.45
                    }
                  ]}>
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                        {item.dep_adi}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                        Depo No: {item.dep_no}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <View style={[styles.miniBadge, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
                        <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '900' }}>
                          Satılan: {formatPrice(item.SatilanAdet)}
                        </Text>
                      </View>

                      <View style={[styles.miniBadge, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                        <Text style={{ color: colors.success, fontSize: 10, fontWeight: '900' }}>
                          Kalan: {formatPrice(item.KalanStok)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={() => (
                <View style={{ padding: 25, alignItems: 'center' }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Şube hareketi bulunamadı.</Text>
                </View>
              )}
            />
          )}

          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>Genel Toplam:</Text>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '900' }}>
                Satılan: {formatPrice(branchBreakdownData.reduce((acc, i) => acc + (i.SatilanAdet || 0), 0))}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold' }}>Tüm Depolar Kalan:</Text>
              <Text style={{ color: colors.success, fontSize: 15, fontWeight: '900' }}>
                {formatPrice(branchBreakdownData.reduce((acc, i) => acc + (i.KalanStok || 0), 0))} Adet
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'android' ? 45 : 55
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabItemActive: {
    // borderBottomColor dynamic
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700'
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 10
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500'
  },
  dropdownList: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 15,
    maxHeight: 220
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16
  },
  stockBadgeBox: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6
  },
  arrivalCard: {
    width: 170,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    marginRight: 10
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10
  },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900'
  },
  saleItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  dateButton: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  filterInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12
  },
  filterSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    height: 42
  },
  invoiceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flex: 1
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800'
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '85%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  miniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1
  }
});
