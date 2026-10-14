import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal as RNModal,
  ToastAndroid,
  Dimensions,
  Platform,
  ScrollView,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface SiparisItem {
  TeslimTarihi: string;
  SiparisTarihi: string;
  EvrakNo: string;
  CariIsmi: string;
  CariKod: string;
  BolgeIsmi: string;
  SektorKodu: string;
  StokKodu: string;
  StokIsmi: string;
  Birim: string;
  SiparisMiktar: number;
  TeslimMiktar: number;
  KalanMiktar: number;
  Aciklama: string;
  Aciklama1: string;
  Aciklama2: string;
  SormerkKod: string;
  DepoAdi: string;
  DepoNo: number;
  KapaliFl: boolean;
  BirimFiyat: number;
  Tutar: number;
  sipGuid?: string;
  EvrakSeri?: string;
  EvrakSira?: number;
  SatirNo?: number;
  Iskonto1?: number;
  Iskonto2?: number;
  VergiPntr?: number;
  Vergi?: number;
  SaticiKod?: string;
}

export interface InvoicingItemState extends SiparisItem {
  selected: boolean;
  invoiceQty: number;
}

interface SiparislerViewProps {
  isDark: boolean;
  isConnected: boolean;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  mikroUserNo: string;
  formatPrice: (p: number) => string;
  playSound: (type: 'beep' | 'success' | 'error') => void;
  onBackToMenu: () => void;
  depos?: any[];
}

export default function SiparislerView({
  isDark,
  isConnected,
  dbRef,
  API_URL,
  mikroUserNo,
  formatPrice,
  playSound,
  onBackToMenu,
  depos = [],
}: SiparislerViewProps) {
  // --- CAMERA & SCANNER ---
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');

  // --- STATE: LOADING & DATA ---
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<SiparisItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // --- VIEW MODE ---
  // 'satirlar': Birebir Mikro 038003 satır listesi
  // 'cariler': Müşteri bazında gruplu görünüm
  // 'urunler': Ürün bazında konsolide toplama listesi
  const [viewMode, setViewMode] = useState<'satirlar' | 'cariler' | 'urunler'>('satirlar');
  const [expandedCariler, setExpandedCariler] = useState<{ [cariKod: string]: boolean }>({});
  const [expandedUrunler, setExpandedUrunler] = useState<{ [stokKodu: string]: boolean }>({});

  // --- FILTER MODAL & CRITERIA ---
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'acik' | 'kapali' | 'hepsi'>('acik');
  const [dateField, setDateField] = useState<'teslim' | 'siparis'>('teslim');

  // Tarih aralığı: Varsayılan son 30 gün
  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const defaultEndDate = new Date();
  const [startDate, setStartDate] = useState<Date>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date>(defaultEndDate);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Cari, SOM, Bölge, Depo Filtreleri
  const [selectedSom, setSelectedSom] = useState<string>('TÜMÜ');
  const [selectedBolge, setSelectedBolge] = useState<string>('TÜMÜ');
  const [selectedDepoNo, setSelectedDepoNo] = useState<number | 'TUMU'>('TUMU');
  const [somList, setSomList] = useState<string[]>([]);
  const [bolgeList, setBolgeList] = useState<string[]>([]);
  const [depoList, setDepoList] = useState<Array<{ dep_no: number; dep_adi: string }>>([]);

  // Detay Modalı
  const [selectedOrder, setSelectedOrder] = useState<SiparisItem | null>(null);

  // --- FATURALAŞTIRMA (INVOICING) STATE ---
  const [invoicingModalVisible, setInvoicingModalVisible] = useState(false);
  const [invoicingTargetCari, setInvoicingTargetCari] = useState<{ cariKod: string; cariIsmi: string } | null>(null);
  const [invoicingItems, setInvoicingItems] = useState<InvoicingItemState[]>([]);
  const [invoiceSeri, setInvoiceSeri] = useState('SF');
  const [invoiceSira, setInvoiceSira] = useState<number>(0);
  const [invoiceDepoNo, setInvoiceDepoNo] = useState<number>(1);
  const [isFetchingCounter, setIsFetchingCounter] = useState(false);
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  // --- THEME COLORS ---
  const theme = useMemo(() => ({
    bg: isDark ? '#0F172A' : '#F8FAFC',
    card: isDark ? '#1E293B' : '#FFFFFF',
    cardAlt: isDark ? '#162235' : '#F1F5F9',
    cardBorder: isDark ? '#334155' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    primary: '#0284C7', // Sky Blue theme for Orders
    primaryLight: isDark ? 'rgba(2, 132, 199, 0.15)' : 'rgba(2, 132, 199, 0.1)',
    primaryBorder: isDark ? 'rgba(2, 132, 199, 0.3)' : 'rgba(2, 132, 199, 0.25)',
    success: '#10B981',
    successLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
    warning: '#F59E0B',
    warningLight: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
    danger: '#EF4444',
    purple: '#8B5CF6',
    purpleLight: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)',
  }), [isDark]);

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    fetchFilterOptions();
    fetchOrders();
  }, []);

  // SOM ve Bölge listelerini çek
  const fetchFilterOptions = async () => {
    if (!isConnected) return;
    try {
      const qSom = `SELECT DISTINCT ISNULL(NULLIF(sip_stok_sormerk, ''), ISNULL(NULLIF(sip_cari_sormerk, ''), ISNULL(sip_satici_kod, ''))) as Sormerk FROM SIPARISLER WITH (NOLOCK) WHERE sip_tip = 0 AND ISNULL(sip_stok_sormerk, '') <> '' ORDER BY Sormerk`;
      const qBolge = `SELECT DISTINCT cari_bolge_kodu as Bolge FROM CARI_HESAPLAR WITH (NOLOCK) WHERE ISNULL(cari_bolge_kodu, '') <> '' ORDER BY Bolge`;
      const qDepo = `SELECT dep_no, dep_adi FROM DEPOLAR WITH (NOLOCK) ORDER BY dep_no`;

      const [resSom, resBolge, resDepo] = await Promise.all([
        axios.post(API_URL, { query: qSom }, { timeout: 8000 }),
        axios.post(API_URL, { query: qBolge }, { timeout: 8000 }),
        axios.post(API_URL, { query: qDepo }, { timeout: 8000 }),
      ]);

      if (resSom.data?.data) {
        const list = resSom.data.data.map((r: any) => String(r.Sormerk).trim()).filter(Boolean);
        setSomList(list);
      }
      if (resBolge.data?.data) {
        const list = resBolge.data.data.map((r: any) => String(r.Bolge).trim()).filter(Boolean);
        setBolgeList(list);
      }
      if (resDepo.data?.data && Array.isArray(resDepo.data.data)) {
        setDepoList(resDepo.data.data);
      }
    } catch (e) {
      console.log('Error fetching filter options:', e);
    }
  };

  // Siparişleri Mikro ERP'den çek
  const fetchOrders = async (
    customStatus = statusFilter,
    customDateField = dateField,
    customStart = startDate,
    customEnd = endDate,
    customSom = selectedSom,
    customBolge = selectedBolge,
    customDepo = selectedDepoNo
  ) => {
    if (!isConnected) {
      Alert.alert('Çevrimdışı', 'Siparişleri görüntülemek için internet bağlantısı gereklidir.');
      return;
    }

    setLoading(true);
    try {
      const sDateStr = `${customStart.getFullYear()}-${(customStart.getMonth() + 1).toString().padStart(2, '0')}-${customStart.getDate().toString().padStart(2, '0')}`;
      const eDateStr = `${customEnd.getFullYear()}-${(customEnd.getMonth() + 1).toString().padStart(2, '0')}-${customEnd.getDate().toString().padStart(2, '0')}`;

      const targetCol = customDateField === 'teslim' ? 'sip_teslim_tarih' : 'sip_tarih';

      let whereConditions = `sip_tip = 0 AND ${targetCol} >= '${sDateStr} 00:00:00' AND ${targetCol} <= '${eDateStr} 23:59:59'`;

      if (customStatus === 'acik') {
        whereConditions += ` AND (sip_miktar - sip_teslim_miktar) > 0 AND sip_kapat_fl = 0`;
      } else if (customStatus === 'kapali') {
        whereConditions += ` AND ((sip_miktar - sip_teslim_miktar) <= 0 OR sip_kapat_fl = 1)`;
      }

      if (customSom !== 'TÜMÜ') {
        whereConditions += ` AND ISNULL(NULLIF(sip_stok_sormerk, ''), ISNULL(NULLIF(sip_cari_sormerk, ''), ISNULL(sip_satici_kod, ''))) = '${customSom.replace(/'/g, "''")}'`;
      }

      if (customBolge !== 'TÜMÜ') {
        whereConditions += ` AND c.cari_bolge_kodu = '${customBolge.replace(/'/g, "''")}'`;
      }

      if (customDepo !== 'TUMU') {
        whereConditions += ` AND sip_depono = ${customDepo}`;
      }

      const q = `
        SELECT 
          CAST(sip_Guid AS VARCHAR(40)) as sipGuid,
          ISNULL(sip_evrakno_seri, '') as EvrakSeri,
          ISNULL(sip_evrakno_sira, 0) as EvrakSira,
          ISNULL(sip_satirno, 0) as SatirNo,
          CONVERT(varchar, sip_teslim_tarih, 104) as TeslimTarihi,
          CONVERT(varchar, sip_tarih, 104) as SiparisTarihi,
          ISNULL(sip_evrakno_seri, '') + '-' + CAST(sip_evrakno_sira AS VARCHAR) as EvrakNo,
          ISNULL(c.cari_unvan1, 'Tanımsız Cari') as CariIsmi,
          ISNULL(c.cari_kod, '') as CariKod,
          ISNULL(c.cari_bolge_kodu, '') as BolgeIsmi,
          ISNULL(c.cari_sektor_kodu, '') as SektorKodu,
          ISNULL(s.sto_kod, sip_stok_kod) as StokKodu,
          ISNULL(s.sto_isim, 'İsimsiz Stok') as StokIsmi,
          ISNULL(s.sto_birim1_ad, 'ADET') as Birim,
          ISNULL(sip_miktar, 0) as SiparisMiktar,
          ISNULL(sip_teslim_miktar, 0) as TeslimMiktar,
          ISNULL(sip_miktar - sip_teslim_miktar, 0) as KalanMiktar,
          ISNULL(sip_aciklama, '') as Aciklama1,
          ISNULL(sip_aciklama2, '') as Aciklama2,
          RTRIM(LTRIM(ISNULL(sip_aciklama, '') + CASE WHEN ISNULL(sip_aciklama2, '') <> '' THEN ' ' + sip_aciklama2 ELSE '' END)) as Aciklama,
          ISNULL(NULLIF(sip_stok_sormerk, ''), ISNULL(NULLIF(sip_cari_sormerk, ''), ISNULL(sip_satici_kod, ''))) as SormerkKod,
          ISNULL(sip_satici_kod, '') as SaticiKod,
          ISNULL(sip_iskonto_1, 0) as Iskonto1,
          ISNULL(sip_iskonto_2, 0) as Iskonto2,
          ISNULL(sip_vergi_pntr, 0) as VergiPntr,
          ISNULL(sip_vergi, 0) as Vergi,
          ISNULL(d.dep_adi, 'Depo ' + CAST(sip_depono AS VARCHAR)) as DepoAdi,
          ISNULL(sip_depono, 0) as DepoNo,
          sip_kapat_fl as KapaliFl,
          ISNULL(sip_b_fiyat, 0) as BirimFiyat,
          ISNULL(sip_tutar, 0) as Tutar
        FROM SIPARISLER WITH (NOLOCK)
        LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = sip_musteri_kod
        LEFT JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = sip_stok_kod
        LEFT JOIN DEPOLAR d WITH (NOLOCK) ON d.dep_no = sip_depono
        WHERE ${whereConditions}
        ORDER BY ${targetCol} DESC, sip_evrakno_sira DESC
      `;

      const res = await axios.post(API_URL, { query: q }, { timeout: 20000 });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setOrders(res.data.data);
      } else {
        setOrders([]);
      }
    } catch (error: any) {
      console.log('Error querying SIPARISLER:', error);
      Alert.alert('Bağlantı Hatası', 'Siparişler sorgulanırken hata oluştu:\n' + (error.message || error));
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  // --- SEARCH FILTERING (Normalized Turkish) ---
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç').trim();

    return orders.filter(item => {
      const matchStok = item.StokKodu.toLowerCase().includes(q) || item.StokIsmi.toLowerCase().includes(q);
      const matchCari = item.CariIsmi.toLowerCase().includes(q) || item.CariKod.toLowerCase().includes(q);
      const matchEvrak = item.EvrakNo.toLowerCase().includes(q);
      const matchAciklama = item.Aciklama.toLowerCase().includes(q);
      const matchSom = item.SormerkKod.toLowerCase().includes(q);
      const matchBolge = item.BolgeIsmi.toLowerCase().includes(q) || item.SektorKodu.toLowerCase().includes(q);
      return matchStok || matchCari || matchEvrak || matchAciklama || matchSom || matchBolge;
    });
  }, [orders, searchQuery]);

  // --- STATS / KPIS ---
  const stats = useMemo(() => {
    let totalItems = filteredOrders.length;
    let totalSiparisMiktar = 0;
    let totalKalanMiktar = 0;
    let totalTutar = 0;
    const carilerSet = new Set<string>();

    filteredOrders.forEach(o => {
      totalSiparisMiktar += Number(o.SiparisMiktar || 0);
      totalKalanMiktar += Number(o.KalanMiktar || 0);
      totalTutar += Number(o.Tutar || 0);
      if (o.CariKod) carilerSet.add(o.CariKod);
    });

    return {
      totalItems,
      totalSiparisMiktar,
      totalKalanMiktar,
      totalTutar,
      totalCariler: carilerSet.size,
    };
  }, [filteredOrders]);

  // --- GROUP BY CARI ---
  const groupedByCari = useMemo(() => {
    const map = new Map<string, { cariIsmi: string; cariKod: string; bolge: string; sektor: string; items: SiparisItem[]; totalKalan: number; totalSiparis: number }>();

    filteredOrders.forEach(item => {
      const key = item.CariKod || item.CariIsmi;
      if (!map.has(key)) {
        map.set(key, {
          cariIsmi: item.CariIsmi,
          cariKod: item.CariKod,
          bolge: item.BolgeIsmi,
          sektor: item.SektorKodu,
          items: [],
          totalKalan: 0,
          totalSiparis: 0,
        });
      }
      const entry = map.get(key)!;
      entry.items.push(item);
      entry.totalKalan += Number(item.KalanMiktar || 0);
      entry.totalSiparis += Number(item.SiparisMiktar || 0);
    });

    return Array.from(map.values()).sort((a, b) => b.totalKalan - a.totalKalan);
  }, [filteredOrders]);

  // --- GROUP BY URUN (PICKING LIST) ---
  const groupedByUrun = useMemo(() => {
    const map = new Map<string, { stokKodu: string; stokIsmi: string; birim: string; items: SiparisItem[]; totalKalan: number; totalSiparis: number }>();

    filteredOrders.forEach(item => {
      const key = item.StokKodu;
      if (!map.has(key)) {
        map.set(key, {
          stokKodu: item.StokKodu,
          stokIsmi: item.StokIsmi,
          birim: item.Birim,
          items: [],
          totalKalan: 0,
          totalSiparis: 0,
        });
      }
      const entry = map.get(key)!;
      entry.items.push(item);
      entry.totalKalan += Number(item.KalanMiktar || 0);
      entry.totalSiparis += Number(item.SiparisMiktar || 0);
    });

    return Array.from(map.values()).sort((a, b) => b.totalKalan - a.totalKalan);
  }, [filteredOrders]);

  // --- BARCODE SCAN HANDLER ---
  const handleBarcodeScanned = async (data: string) => {
    if (!data) return;
    playSound('beep');
    setIsCameraActive(false);
    setScannedBarcode(data);

    // İlk olarak local SQLite'dan stok kodunu bul
    try {
      if (dbRef.current) {
        const localProd: any = await dbRef.current.getFirstAsync(
          'SELECT stock_code FROM products WHERE barcode = ?',
          [data]
        );
        if (localProd && localProd.stock_code) {
          setSearchQuery(localProd.stock_code);
          ToastAndroid.show(`Ürün bulundu: ${localProd.stock_code}`, ToastAndroid.SHORT);
          return;
        }
      }
    } catch (e) {}

    // Bulunamadıysa direkt barkodu arama kutusuna yaz
    setSearchQuery(data);
  };

  // --- EXPORT TO EXCEL ---
  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) {
      Alert.alert('Bilgi', 'Dışa aktarılacak sipariş kaydı bulunmuyor.');
      return;
    }

    try {
      const rows = filteredOrders.map(item => ({
        'Teslim Tarihi': item.TeslimTarihi,
        'Sipariş Tarihi': item.SiparisTarihi,
        'Evrak No': item.EvrakNo,
        'Cari İsmi': item.CariIsmi,
        'Cari Kodu': item.CariKod,
        'Bölge': item.BolgeIsmi,
        'Sektör': item.SektorKodu,
        'Stok Kodu': item.StokKodu,
        'Stok İsmi': item.StokIsmi,
        'Sipariş Miktar': item.SiparisMiktar,
        'Kalan Miktar': item.KalanMiktar,
        'Birim': item.Birim,
        'Açıklama 1': item.Aciklama1,
        'Açıklama 2': item.Aciklama2,
        'Açıklama': item.Aciklama,
        'SOM': item.SormerkKod,
        'Depo': item.DepoAdi,
        'Birim Fiyat': item.BirimFiyat,
        'Tutar': item.Tutar,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Alinan_Siparisler_038003');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      const fileName = `Alinan_Siparisler_${Date.now()}.xlsx`;
      const fileUri = (FileSystem as any).documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Başarılı', `Dosya kaydedildi: ${fileName}`);
      }
    } catch (error: any) {
      Alert.alert('Hata', 'Excel dosyası oluşturulurken hata oluştu:\n' + error.message);
    }
  };

  // --- WHATSAPP / TEXT SHARE ---
  const handleShareSummary = async () => {
    if (filteredOrders.length === 0) return;

    let text = `📦 *MD TİCARET - ALINAN SİPARİŞLER (038003)*\n`;
    text += `🕒 *Tarih:* ${new Date().toLocaleDateString('tr-TR')}\n`;
    text += `📊 *Toplam Kalem:* ${stats.totalItems} | *Kalan Miktar:* ${stats.totalKalanMiktar.toLocaleString('tr-TR')}\n`;
    text += `👥 *Müşteri Sayısı:* ${stats.totalCariler}\n`;
    text += `--------------------------------\n\n`;

    if (viewMode === 'cariler') {
      groupedByCari.slice(0, 15).forEach((c, idx) => {
        text += `👤 *${c.cariIsmi}* (${c.items.length} Kalem - ${c.totalKalan} Kalan)\n`;
        c.items.forEach(it => {
          text += `  • ${it.StokIsmi} -> ${it.KalanMiktar} ${it.Birim} ${it.Aciklama ? `[${it.Aciklama}]` : ''}\n`;
        });
        text += `\n`;
      });
    } else {
      groupedByUrun.slice(0, 20).forEach((u, idx) => {
        text += `🏷 *${u.stokIsmi}*\n`;
        text += `  Toplam Kalan: *${u.totalKalan} ${u.birim}*\n`;
        u.items.forEach(it => {
          text += `  - ${it.CariIsmi}: ${it.KalanMiktar} ${it.Birim}\n`;
        });
        text += `\n`;
      });
    }

    try {
      await Share.share({ message: text });
    } catch (e) {}
  };

  // =========================================================================
  // --- FATURALAŞTIRMA (INVOICING) HANDLERS ---
  // =========================================================================

  // Sayaç / Son Fatura Numarasını Sorgula
  const fetchNextInvoiceNo = async (seri: string) => {
    const cleanSeri = (seri || '').trim();
    if (!cleanSeri) return;
    setIsFetchingCounter(true);
    try {
      const q = `
        SELECT ISNULL(MAX(sira), 0) + 1 AS NextSira FROM (
          SELECT MAX(sth_evrakno_sira) AS sira FROM STOK_HAREKETLERI WITH (NOLOCK) WHERE sth_evrakno_seri = '${cleanSeri.replace(/'/g, "''")}' AND sth_evraktip = 4
          UNION ALL
          SELECT MAX(cha_evrakno_sira) AS sira FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK) WHERE cha_evrakno_seri = '${cleanSeri.replace(/'/g, "''")}' AND cha_evrak_tip = 63
        ) t
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 8000 });
      if (res.data?.success && res.data.data?.[0]?.NextSira) {
        setInvoiceSira(Number(res.data.data[0].NextSira));
      }
    } catch (e) {
      console.log('Error fetching next invoice no:', e);
    } finally {
      setIsFetchingCounter(false);
    }
  };

  // Müşteri Bazlı Faturalaştırma Modalı Aç
  const handleOpenInvoicingModalForCari = async (group: typeof groupedByCari[0]) => {
    const pendingItems = group.items.filter(it => Number(it.KalanMiktar) > 0);
    if (pendingItems.length === 0) {
      Alert.alert('Bilgi', 'Bu müşterinin bekleyen/açık sipariş kalemi bulunmuyor.');
      return;
    }

    setInvoicingTargetCari({ cariKod: group.cariKod, cariIsmi: group.cariIsmi });
    setInvoicingItems(
      pendingItems.map(it => ({
        ...it,
        selected: true,
        invoiceQty: Number(it.KalanMiktar),
      }))
    );

    // Çıkış deposu varsayılanı
    const defaultDepo = pendingItems[0]?.DepoNo || (depos && depos[0]?.dep_no) || 1;
    setInvoiceDepoNo(defaultDepo);

    // Kaydedilmiş son seri harfi
    try {
      const savedSeri = await AsyncStorage.getItem('sayimapp_last_invoice_seri');
      const seriToUse = savedSeri || invoiceSeri || 'SF';
      setInvoiceSeri(seriToUse);
      fetchNextInvoiceNo(seriToUse);
    } catch (e) {
      fetchNextInvoiceNo(invoiceSeri || 'SF');
    }

    setInvoicingModalVisible(true);
  };

  // Tekil Sipariş Kalemi İçin Faturalaştırma Modalı Aç
  const handleOpenInvoicingModalForSingleItem = async (item: SiparisItem) => {
    if (Number(item.KalanMiktar) <= 0) {
      Alert.alert('Bilgi', 'Bu sipariş kalemi zaten tamamen teslim edilmiş veya kapatılmış.');
      return;
    }

    setInvoicingTargetCari({ cariKod: item.CariKod, cariIsmi: item.CariIsmi });
    setInvoicingItems([
      {
        ...item,
        selected: true,
        invoiceQty: Number(item.KalanMiktar),
      },
    ]);

    setInvoiceDepoNo(item.DepoNo || (depos && depos[0]?.dep_no) || 1);

    try {
      const savedSeri = await AsyncStorage.getItem('sayimapp_last_invoice_seri');
      const seriToUse = savedSeri || invoiceSeri || 'SF';
      setInvoiceSeri(seriToUse);
      fetchNextInvoiceNo(seriToUse);
    } catch (e) {
      fetchNextInvoiceNo(invoiceSeri || 'SF');
    }

    if (selectedOrder) setSelectedOrder(null);
    setInvoicingModalVisible(true);
  };

  // Fatura Kalemi Miktarını Değiştir
  const handleUpdateInvoiceItemQty = (index: number, newQtyStr: string) => {
    setInvoicingItems(prev => {
      const copy = [...prev];
      const it = copy[index];
      if (!it) return prev;
      const cleanVal = newQtyStr.replace(',', '.').replace(/[^0-9.]/g, '');
      const numVal = parseFloat(cleanVal) || 0;
      const maxQty = Number(it.KalanMiktar) || 1;
      copy[index] = {
        ...it,
        invoiceQty: Math.max(0, Math.min(numVal, maxQty)),
      };
      return copy;
    });
  };

  // Fatura Kalemi Seçimini Değiştir
  const handleToggleInvoiceItemSelect = (index: number) => {
    setInvoicingItems(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], selected: !copy[index].selected };
      }
      return copy;
    });
  };

  // Tüm Kalemleri Seç / Kaldır
  const handleToggleSelectAllInvoiceItems = () => {
    const allSelected = invoicingItems.every(it => it.selected);
    setInvoicingItems(prev => prev.map(it => ({ ...it, selected: !allSelected })));
  };

  // Mikro ERP'ye Faturayı Kaydet
  const handleExecuteInvoice = async () => {
    const selectedItems = invoicingItems.filter(it => it.selected && Number(it.invoiceQty) > 0);
    if (selectedItems.length === 0) {
      Alert.alert('Eksik Seçim', 'Lütfen faturalaştırılacak en az bir ürün kalemi seçin.');
      return;
    }
    if (!invoiceSeri.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen fatura seri harfini giriniz (örn: SF).');
      return;
    }
    if (!invoiceSira || invoiceSira <= 0) {
      Alert.alert('Eksik Bilgi', 'Geçerli bir fatura sayaç numarası alınamadı. Lütfen sayacı yenileyin.');
      return;
    }

    const cleanSeri = invoiceSeri.toUpperCase().trim();
    const sira = invoiceSira;

    Alert.alert(
      'Fatura Onayı',
      `${invoicingTargetCari?.cariIsmi} carisine ${cleanSeri}-${sira} nolu Toptan Satış Faturası kesilecek ve ${selectedItems.length} sipariş kalemi güncellenecektir.\n\nOnaylıyor musunuz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Evet, Faturayı Kes',
          onPress: async () => {
            setIsSubmittingInvoice(true);
            try {
              await AsyncStorage.setItem('sayimapp_last_invoice_seri', cleanSeri);

              const userNum = parseInt(mikroUserNo, 10) || 1;
              const cariKod = (invoicingTargetCari?.cariKod || '').replace(/'/g, "''");
              const depoNo = invoiceDepoNo;

              // Toplam tutarlar
              let totalBrut = 0;
              let totalIskonto = 0;
              let totalKdv = 0;
              let totalNet = 0;

              selectedItems.forEach(it => {
                const qty = Number(it.invoiceQty);
                const bFiyat = Number(it.BirimFiyat) || 0;
                const brut = qty * bFiyat;
                const iskOran = Number(it.SiparisMiktar) > 0 ? (Number(it.Iskonto1) / (Number(it.SiparisMiktar) * bFiyat || 1)) : 0;
                const isk = brut * iskOran;
                const netSatir = brut - isk;
                const kdvPntr = Number(it.VergiPntr) || 4;
                const kdvRate = kdvPntr === 5 ? 0.20 : 0.16;
                const kdv = netSatir * kdvRate;

                totalBrut += brut;
                totalIskonto += isk;
                totalKdv += kdv;
                totalNet += (netSatir + kdv);
              });

              const todayStr = new Date().toISOString().split('T')[0];

              let sql = `
                BEGIN TRANSACTION;
                DECLARE @Now datetime = GETDATE();
                DECLARE @Tarih datetime = '${todayStr}';
                DECLARE @FatGuid UNIQUEIDENTIFIER = NEWID();

                -- 1. CARI HESAP HAREKETI (Fatura - cha_evrak_tip = 63, cha_cinsi = 6)
                INSERT INTO CARI_HESAP_HAREKETLERI (
                  cha_Guid, cha_DBCno, cha_SpecRecNo, cha_iptal, cha_fileid, cha_hidden, cha_kilitli, cha_degisti, cha_CheckSum,
                  cha_create_user, cha_create_date, cha_lastup_user, cha_lastup_date,
                  cha_special1, cha_special2, cha_special3, cha_MainProgramNo, cha_VersionNo, cha_MenuNo,
                  cha_firmano, cha_subeno, cha_evrak_tip, cha_evrakno_seri, cha_evrakno_sira, cha_satir_no,
                  cha_tarihi, cha_tip, cha_cinsi, cha_normal_Iade, cha_tpoz, cha_ticaret_turu, cha_belge_no, cha_belge_tarih,
                  cha_aciklama, cha_satici_kodu, cha_cari_cins, cha_kod, cha_ciro_cari_kodu, cha_d_cins, cha_d_kur, cha_altd_kur,
                  cha_grupno, cha_srmrkkodu, cha_meblag, cha_aratoplam, cha_vade,
                  cha_ft_iskonto1, cha_ft_iskonto2, cha_kdv_toplam
                ) VALUES (
                  @FatGuid, 0, 0, 0, 51, 0, 0, 0, 0,
                  ${userNum}, @Now, ${userNum}, @Now,
                  'MOBIL', '', '', 21, '17.05d', '61190',
                  0, 0, 63, '${cleanSeri.replace(/'/g, "''")}', ${sira}, 0,
                  @Tarih, 0, 6, 0, 0, 0, '', @Tarih,
                  'Mobil Sipariş Faturalaştırma', '${(selectedItems[0]?.SaticiKod || '').replace(/'/g, "''")}', 0, '${cariKod}', '${cariKod}', 0, 1, 49.25,
                  0, '${(selectedItems[0]?.SormerkKod || '').replace(/'/g, "''")}', ${totalNet.toFixed(2)}, ${totalBrut.toFixed(2)}, 0,
                  ${totalIskonto.toFixed(2)}, 0, ${totalKdv.toFixed(2)}
                );
              `;

              selectedItems.forEach((it, idx) => {
                const qty = Number(it.invoiceQty);
                const bFiyat = Number(it.BirimFiyat) || 0;
                const brut = qty * bFiyat;
                const sKod = (it.StokKodu || '').replace(/'/g, "''");
                const sipGuidStr = it.sipGuid || '';

                sql += `
                  -- 2. STOK HAREKETI (Satır ${idx + 1} - sth_evraktip = 4, sth_tip = 1 Çıkış)
                  INSERT INTO STOK_HAREKETLERI (
                    sth_Guid, sth_DBCno, sth_SpecRECno, sth_iptal, sth_fileid, sth_hidden, sth_kilitli, sth_degisti, sth_checksum,
                    sth_create_user, sth_create_date, sth_lastup_user, sth_lastup_date,
                    sth_special1, sth_special2, sth_special3, sth_MainProgramNo, sth_VersionNo, sth_MenuNo,
                    sth_firmano, sth_subeno, sth_tarih, sth_tip, sth_cins, sth_normal_iade, sth_evraktip,
                    sth_evrakno_seri, sth_evrakno_sira, sth_satirno, sth_belge_no, sth_belge_tarih, sth_stok_kod,
                    sth_miktar, sth_miktar2, sth_birim_pntr, sth_birimfiyat, sth_tutar,
                    sth_giris_depo_no, sth_cikis_depo_no, sth_malkbl_sevk_tarihi,
                    sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_cari_kodu, sth_plasiyer_kodu,
                    sth_sip_uid, sth_fat_uid, sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru, sth_stok_doviz_cinsi, sth_stok_doviz_kuru
                  ) VALUES (
                    NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
                    ${userNum}, @Now, ${userNum}, @Now,
                    'MOBIL', '', '', 21, '17.05d', '61190',
                    0, 0, @Tarih, 1, 0, 0, 4,
                    '${cleanSeri.replace(/'/g, "''")}', ${sira}, ${idx}, '', @Tarih, '${sKod}',
                    ${qty}, ${qty}, 1, ${bFiyat.toFixed(4)}, ${brut.toFixed(2)},
                    ${depoNo}, ${depoNo}, @Tarih,
                    '${(it.SormerkKod || '').replace(/'/g, "''")}', '${(it.SormerkKod || '').replace(/'/g, "''")}', '${cariKod}', '${(it.SaticiKod || '').replace(/'/g, "''")}',
                    ${sipGuidStr ? `'${sipGuidStr}'` : '00000000-0000-0000-0000-000000000000'}, @FatGuid, 0, 1, 49.25, 0, 1
                  );
                `;

                if (sipGuidStr) {
                  sql += `
                    -- 3. SIPARIS TESLIMAT GUNCELLEMESI
                    UPDATE SIPARISLER 
                    SET sip_teslim_miktar = ISNULL(sip_teslim_miktar, 0) + ${qty},
                        sip_kapat_fl = CASE WHEN ISNULL(sip_miktar, 0) <= (ISNULL(sip_teslim_miktar, 0) + ${qty}) THEN 1 ELSE 0 END,
                        sip_lastup_user = ${userNum},
                        sip_lastup_date = @Now
                    WHERE sip_Guid = '${sipGuidStr}';
                  `;
                }
              });

              sql += `
                COMMIT TRANSACTION;
                SELECT 1 AS success_result;
              `;

              const res = await axios.post(API_URL, { query: sql }, { timeout: 25000 });
              if (res.data?.success) {
                playSound('success');
                setInvoicingModalVisible(false);
                Alert.alert(
                  'Fatura Oluşturuldu! 🎉',
                  `${cleanSeri}-${sira} nolu Toptan Satış Faturası Mikro ERP sistemine başarıyla kaydedildi ve sipariş teslim miktarları güncellendi.`
                );
                fetchOrders();
              } else {
                playSound('error');
                Alert.alert('Hata', 'Fatura kaydedilirken hata oluştu:\n' + (res.data?.error || JSON.stringify(res.data)));
              }
            } catch (err: any) {
              playSound('error');
              Alert.alert('İşlem Başarısız', 'Fatura oluşturulurken hata oluştu:\n' + (err.response?.data?.error || err.message));
            } finally {
              setIsSubmittingInvoice(false);
            }
          }
        }
      ]
    );
  };

  // --- RENDER ORDER ITEM (SATIR BAZLI) ---
  const renderOrderItem = ({ item }: { item: SiparisItem }) => {
    const isPending = Number(item.KalanMiktar) > 0;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedOrder(item)}
        style={[styles.orderCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      >
        {/* Card Header: Cari İsmi & Teslim Tarihi */}
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <Text style={[styles.cariName, { color: theme.text }]} numberOfLines={1}>
              {item.CariIsmi}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              {Boolean(item.BolgeIsmi) && (
                <View style={[styles.regionChip, { backgroundColor: theme.cardAlt }]}>
                  <Ionicons name="location-outline" size={10} color={theme.textMuted} />
                  <Text style={[styles.regionChipText, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.BolgeIsmi} {item.SektorKodu ? `• ${item.SektorKodu}` : ''}
                  </Text>
                </View>
              )}
              {Boolean(item.SormerkKod) && (
                <View style={[styles.somChip, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name="person-outline" size={10} color={theme.primary} />
                  <Text style={[styles.somChipText, { color: theme.primary }]}>
                    {item.SormerkKod}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <View style={[styles.dateBadge, { backgroundColor: theme.cardAlt }]}>
              <Ionicons name="calendar-outline" size={11} color={theme.textMuted} />
              <Text style={[styles.dateBadgeText, { color: theme.textMuted }]}>
                {item.TeslimTarihi}
              </Text>
            </View>
            <Text style={[styles.evrakText, { color: theme.textMuted }]}>{item.EvrakNo}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.cardDivider, { backgroundColor: theme.cardBorder }]} />

        {/* Card Body: Stok Bilgileri */}
        <View style={styles.cardBodyRow}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <Text style={[styles.stockCode, { color: theme.primary }]}>{item.StokKodu}</Text>
            <Text style={[styles.stockName, { color: theme.text }]} numberOfLines={2}>
              {item.StokIsmi}
            </Text>
          </View>

          {/* Miktar Rozeti */}
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            {isPending ? (
              <View style={[styles.qtyBadge, { backgroundColor: theme.warningLight, borderColor: theme.warning }]}>
                <Text style={[styles.qtyLabel, { color: theme.warning }]}>Kalan</Text>
                <Text style={[styles.qtyValue, { color: theme.warning }]}>
                  {Number(item.KalanMiktar).toLocaleString('tr-TR')} {item.Birim}
                </Text>
                <Text style={[styles.qtySub, { color: theme.textMuted }]}>
                  Toplam: {Number(item.SiparisMiktar).toLocaleString('tr-TR')}
                </Text>
              </View>
            ) : (
              <View style={[styles.qtyBadge, { backgroundColor: theme.successLight, borderColor: theme.success }]}>
                <Ionicons name="checkmark-circle" size={12} color={theme.success} />
                <Text style={[styles.qtyLabel, { color: theme.success }]}>Teslim Edildi</Text>
                <Text style={[styles.qtySub, { color: theme.textMuted }]}>
                  {Number(item.SiparisMiktar).toLocaleString('tr-TR')} {item.Birim}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Açıklama Satırı (Mikro 038003 Açıklama 1 / Açıklama 2) */}
        {Boolean(item.Aciklama) ? (
          <View style={[styles.cardNoteRow, { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF', borderColor: isDark ? 'rgba(139, 92, 246, 0.35)' : '#DDD6FE' }]}>
            <Ionicons name="chatbox-ellipses" size={13} color="#8B5CF6" style={{ marginTop: 1 }} />
            <Text style={[styles.cardNoteLabel, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>Açıklama:</Text>
            <Text style={[styles.cardNoteText, { color: isDark ? '#EDE9FE' : '#4C1D95' }]} numberOfLines={2}>
              {item.Aciklama}
            </Text>
          </View>
        ) : (
          <View style={[styles.cardNoteRowEmpty, { backgroundColor: theme.cardAlt }]}>
            <Ionicons name="chatbox-outline" size={11} color={theme.textMuted} style={{ marginTop: 1 }} />
            <Text style={[styles.cardNoteLabelEmpty, { color: theme.textMuted }]}>Açıklama:</Text>
            <Text style={[styles.cardNoteTextEmpty, { color: theme.textMuted }]}>
              Belirtilmemiş
            </Text>
          </View>
        )}

        {/* Card Footer: Fiyat, Depo & Detay İpucu */}
        <View style={styles.cardFooterRow}>
          <Text style={[styles.depoNameText, { color: theme.textMuted }]} numberOfLines={1}>
            🏢 {item.DepoAdi}
          </Text>
          {Number(item.Tutar) > 0 && (
            <Text style={[styles.tutarText, { color: theme.text }]}>
              {formatPrice(Number(item.Tutar))} TL
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // --- RENDER CARI GROUP ITEM ---
  const renderCariGroupItem = ({ item }: { item: typeof groupedByCari[0] }) => {
    const isExpanded = Boolean(expandedCariler[item.cariKod]);

    return (
      <View style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setExpandedCariler(prev => ({ ...prev, [item.cariKod]: !prev[item.cariKod] }));
          }}
          style={styles.groupHeader}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.groupTitle, { color: theme.text }]} numberOfLines={1}>
              {item.cariIsmi}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Text style={{ fontSize: 11, color: theme.textMuted }}>{item.cariKod}</Text>
              {Boolean(item.bolge) && (
                <Text style={{ fontSize: 11, color: theme.textMuted }}>• {item.bolge}</Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {item.totalKalan > 0 && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleOpenInvoicingModalForCari(item)}
                style={[styles.invoiceCariBtn, { backgroundColor: '#10B981' }]}
              >
                <Ionicons name="receipt" size={13} color="#fff" />
                <Text style={styles.invoiceCariBtnText}>Faturalaştır</Text>
              </TouchableOpacity>
            )}
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.groupQtyBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.groupQtyBadgeText, { color: theme.primary }]}>
                  {item.items.length} Kalem
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.warning, marginTop: 2 }}>
                {item.totalKalan.toLocaleString('tr-TR')} Kalan
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textMuted}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
            {item.items.map((subItem, sIdx) => (
              <TouchableOpacity
                key={sIdx}
                onPress={() => setSelectedOrder(subItem)}
                style={[
                  styles.subItemRow,
                  { borderBottomColor: theme.cardBorder, borderBottomWidth: sIdx === item.items.length - 1 ? 0 : 1 },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text style={[styles.subItemCode, { color: theme.primary }]}>{subItem.StokKodu}</Text>
                  <Text style={[styles.subItemName, { color: theme.text }]} numberOfLines={1}>
                    {subItem.StokIsmi}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="chatbox-ellipses-outline" size={11} color={subItem.Aciklama ? '#8B5CF6' : theme.textMuted} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: subItem.Aciklama ? (isDark ? '#DDD6FE' : '#6D28D9') : theme.textMuted,
                        fontWeight: subItem.Aciklama ? '700' : '400',
                        fontStyle: subItem.Aciklama ? 'normal' : 'italic',
                      }}
                      numberOfLines={1}
                    >
                      Açıklama: {subItem.Aciklama || 'Belirtilmemiş'}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: Number(subItem.KalanMiktar) > 0 ? theme.warning : theme.success }}>
                    {subItem.KalanMiktar} {subItem.Birim}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>Teslim: {subItem.TeslimTarihi}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // --- RENDER URUN GROUP ITEM (PICKING LIST) ---
  const renderUrunGroupItem = ({ item }: { item: typeof groupedByUrun[0] }) => {
    const isExpanded = Boolean(expandedUrunler[item.stokKodu]);

    return (
      <View style={[styles.groupCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setExpandedUrunler(prev => ({ ...prev, [item.stokKodu]: !prev[item.stokKodu] }));
          }}
          style={styles.groupHeader}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.subItemCode, { color: theme.primary }]}>{item.stokKodu}</Text>
            <Text style={[styles.groupTitle, { color: theme.text }]} numberOfLines={2}>
              {item.stokIsmi}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.groupQtyBadge, { backgroundColor: theme.warningLight, borderColor: theme.warning, borderWidth: 1 }]}>
                <Text style={[styles.groupQtyBadgeText, { color: theme.warning }]}>
                  {item.totalKalan.toLocaleString('tr-TR')} {item.birim}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                {item.items.length} Müşteri
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textMuted}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.cardBorder }}>
            {item.items.map((subItem, sIdx) => (
              <TouchableOpacity
                key={sIdx}
                onPress={() => setSelectedOrder(subItem)}
                style={[
                  styles.subItemRow,
                  { borderBottomColor: theme.cardBorder, borderBottomWidth: sIdx === item.items.length - 1 ? 0 : 1 },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Text style={[styles.subItemName, { color: theme.text }]} numberOfLines={1}>
                    {subItem.CariIsmi}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>{subItem.BolgeIsmi || 'Bölge Belirtilmemiş'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="chatbox-ellipses-outline" size={11} color={subItem.Aciklama ? '#8B5CF6' : theme.textMuted} />
                      <Text
                        style={{
                          fontSize: 11,
                          color: subItem.Aciklama ? (isDark ? '#DDD6FE' : '#6D28D9') : theme.textMuted,
                          fontWeight: subItem.Aciklama ? '700' : '400',
                          fontStyle: subItem.Aciklama ? 'normal' : 'italic',
                        }}
                        numberOfLines={1}
                      >
                        Açıklama: {subItem.Aciklama || 'Belirtilmemiş'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: theme.warning }}>
                    {subItem.KalanMiktar} {subItem.Birim}
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.textMuted }}>Teslim: {subItem.TeslimTarihi}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ========================================================================= */}
      {/* 1. TOP HEADER APP BAR                                                     */}
      {/* ========================================================================= */}
      <View style={[styles.headerBar, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <TouchableOpacity onPress={onBackToMenu} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                ALINAN SİPARİŞLER
              </Text>
              <View style={[styles.menuNoBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.menuNoText, { color: theme.primary }]}>038003</Text>
              </View>
            </View>
            <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
              {statusFilter === 'acik' ? 'Açık Siparişler' : statusFilter === 'kapali' ? 'Kapalı Siparişler' : 'Tüm Siparişler'} • {dateField === 'teslim' ? 'Teslim Tarihi' : 'Sipariş Tarihi'}
            </Text>
          </View>
        </View>

        {/* Action Buttons: Refresh, Camera, Filter, Export */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchOrders()}
            style={[styles.headerIconBtn, { backgroundColor: theme.cardAlt }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={theme.primary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              if (!permission?.granted) {
                const res = await requestPermission();
                if (!res.granted) {
                  Alert.alert('İzin Gerekli', 'Barkod taramak için kamera izni vermeniz gerekir.');
                  return;
                }
              }
              setIsCameraActive(true);
            }}
            style={[styles.headerIconBtn, { backgroundColor: theme.cardAlt }]}
          >
            <Ionicons name="barcode-outline" size={18} color={theme.text} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowFilterModal(true)}
            style={[styles.headerIconBtn, { backgroundColor: theme.primaryLight }]}
          >
            <Ionicons name="filter" size={18} color={theme.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleExportExcel}
            style={[styles.headerIconBtn, { backgroundColor: theme.cardAlt }]}
          >
            <Ionicons name="share-social-outline" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 2. SEARCH BAR & STATUS QUICK SELECT                                       */}
      {/* ========================================================================= */}
      <View style={[styles.searchSection, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
          <Ionicons name="search" size={18} color={theme.textMuted} style={{ marginLeft: 10, marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Cari, Stok Kodu, İsim veya Açıklama ara..."
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 6, marginRight: 4 }}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Filter Status Chips */}
        <View style={styles.quickStatusRow}>
          <TouchableOpacity
            onPress={() => {
              setStatusFilter('acik');
              fetchOrders('acik');
            }}
            style={[
              styles.quickChip,
              statusFilter === 'acik'
                ? { backgroundColor: theme.warningLight, borderColor: theme.warning }
                : { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons
              name="time"
              size={13}
              color={statusFilter === 'acik' ? theme.warning : theme.textMuted}
            />
            <Text
              style={[
                styles.quickChipText,
                { color: statusFilter === 'acik' ? theme.warning : theme.textMuted, fontWeight: statusFilter === 'acik' ? '800' : '600' },
              ]}
            >
              Açık Siparişler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setStatusFilter('kapali');
              fetchOrders('kapali');
            }}
            style={[
              styles.quickChip,
              statusFilter === 'kapali'
                ? { backgroundColor: theme.successLight, borderColor: theme.success }
                : { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons
              name="checkmark-done"
              size={13}
              color={statusFilter === 'kapali' ? theme.success : theme.textMuted}
            />
            <Text
              style={[
                styles.quickChipText,
                { color: statusFilter === 'kapali' ? theme.success : theme.textMuted, fontWeight: statusFilter === 'kapali' ? '800' : '600' },
              ]}
            >
              Kapalı / Teslim
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setStatusFilter('hepsi');
              fetchOrders('hepsi');
            }}
            style={[
              styles.quickChip,
              statusFilter === 'hepsi'
                ? { backgroundColor: theme.primaryLight, borderColor: theme.primary }
                : { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons
              name="layers"
              size={13}
              color={statusFilter === 'hepsi' ? theme.primary : theme.textMuted}
            />
            <Text
              style={[
                styles.quickChipText,
                { color: statusFilter === 'hepsi' ? theme.primary : theme.textMuted, fontWeight: statusFilter === 'hepsi' ? '800' : '600' },
              ]}
            >
              Tümü
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 3. KPI / SUMMARY STATS BAR                                                */}
      {/* ========================================================================= */}
      <View style={[styles.statsRow, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <View style={styles.statBox}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Kalem</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{stats.totalItems}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Bekleyen</Text>
          <Text style={[styles.statValue, { color: theme.warning }]}>
            {stats.totalKalanMiktar.toLocaleString('tr-TR')}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Müşteri</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>{stats.totalCariler}</Text>
        </View>
        {stats.totalTutar > 0 && (
          <View style={styles.statBox}>
            <Text style={[styles.statLabel, { color: theme.textMuted }]}>Tutar</Text>
            <Text style={[styles.statValue, { color: theme.success }]}>
              {formatPrice(stats.totalTutar)}
            </Text>
          </View>
        )}
      </View>

      {/* ========================================================================= */}
      {/* 4. VIEW MODE TABS (Satır Listesi | Müşteri Bazlı | Ürün Toplama)          */}
      {/* ========================================================================= */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.card, borderBottomColor: theme.cardBorder }]}>
        <TouchableOpacity
          onPress={() => setViewMode('satirlar')}
          style={[styles.tabButton, viewMode === 'satirlar' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Ionicons
            name="list-outline"
            size={16}
            color={viewMode === 'satirlar' ? theme.primary : theme.textMuted}
          />
          <Text style={[styles.tabButtonText, { color: viewMode === 'satirlar' ? theme.primary : theme.textMuted, fontWeight: viewMode === 'satirlar' ? '800' : '600' }]}>
            Sipariş Satırları
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMode('cariler')}
          style={[styles.tabButton, viewMode === 'cariler' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Ionicons
            name="people-outline"
            size={16}
            color={viewMode === 'cariler' ? theme.primary : theme.textMuted}
          />
          <Text style={[styles.tabButtonText, { color: viewMode === 'cariler' ? theme.primary : theme.textMuted, fontWeight: viewMode === 'cariler' ? '800' : '600' }]}>
            Müşteri Bazlı ({groupedByCari.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setViewMode('urunler')}
          style={[styles.tabButton, viewMode === 'urunler' && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
        >
          <Ionicons
            name="cube-outline"
            size={16}
            color={viewMode === 'urunler' ? theme.primary : theme.textMuted}
          />
          <Text style={[styles.tabButtonText, { color: viewMode === 'urunler' ? theme.primary : theme.textMuted, fontWeight: viewMode === 'urunler' ? '800' : '600' }]}>
            Toplama Listesi ({groupedByUrun.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ========================================================================= */}
      {/* 5. MAIN CONTENT LIST                                                      */}
      {/* ========================================================================= */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Mikro ERP Alınan Siparişler (038003) sorgulanıyor...
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={54} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Sipariş Bulunamadı</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Seçili filtrelere uygun alınan sipariş kaydı bulunmuyor.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setStatusFilter('hepsi');
              fetchOrders('hepsi');
            }}
            style={[styles.resetFilterBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Tüm Siparişleri Göster</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'satirlar' ? (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, index) => `${item.EvrakNo}_${item.StokKodu}_${index}`}
          renderItem={renderOrderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        />
      ) : viewMode === 'cariler' ? (
        <FlatList
          data={groupedByCari}
          keyExtractor={(item) => item.cariKod || item.cariIsmi}
          renderItem={renderCariGroupItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={groupedByUrun}
          keyExtractor={(item) => item.stokKodu}
          renderItem={renderUrunGroupItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========================================================================= */}
      {/* 6. FILTER MODAL (DETAYLI FİLTRELEME)                                      */}
      {/* ========================================================================= */}
      <RNModal
        visible={showFilterModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="filter" size={20} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Sipariş Filtreleri</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close-circle" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Tarih Tipi Seçimi */}
              <Text style={[styles.filterGroupTitle, { color: theme.text }]}>Tarih Kriteri</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setDateField('teslim')}
                  style={[
                    styles.filterChoiceBtn,
                    dateField === 'teslim' ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder },
                  ]}
                >
                  <Text style={[styles.filterChoiceText, { color: dateField === 'teslim' ? '#fff' : theme.text }]}>
                    Teslim Tarihi
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDateField('siparis')}
                  style={[
                    styles.filterChoiceBtn,
                    dateField === 'siparis' ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder },
                  ]}
                >
                  <Text style={[styles.filterChoiceText, { color: dateField === 'siparis' ? '#fff' : theme.text }]}>
                    Sipariş Tarihi
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Tarih Seçiciler */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => setShowStartDatePicker(true)}
                  style={[styles.datePickerBtn, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}
                >
                  <Text style={[styles.datePickerLabel, { color: theme.textMuted }]}>Başlangıç</Text>
                  <Text style={[styles.datePickerValue, { color: theme.text }]}>
                    {startDate.toLocaleDateString('tr-TR')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowEndDatePicker(true)}
                  style={[styles.datePickerBtn, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}
                >
                  <Text style={[styles.datePickerLabel, { color: theme.textMuted }]}>Bitiş</Text>
                  <Text style={[styles.datePickerValue, { color: theme.text }]}>
                    {endDate.toLocaleDateString('tr-TR')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Hızlı Tarih Butonları */}
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    setStartDate(today);
                    setEndDate(today);
                  }}
                  style={[styles.quickDateChip, { backgroundColor: theme.cardAlt }]}
                >
                  <Text style={{ fontSize: 11, color: theme.text, fontWeight: '700' }}>Bugün</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const end = new Date();
                    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  style={[styles.quickDateChip, { backgroundColor: theme.cardAlt }]}
                >
                  <Text style={{ fontSize: 11, color: theme.text, fontWeight: '700' }}>Son 7 Gün</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const end = new Date();
                    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  style={[styles.quickDateChip, { backgroundColor: theme.cardAlt }]}
                >
                  <Text style={{ fontSize: 11, color: theme.text, fontWeight: '700' }}>Son 30 Gün</Text>
                </TouchableOpacity>
              </View>

              {/* Sorumluluk Merkezi (SOM / Plasiyer) */}
              {somList.length > 0 && (
                <>
                  <Text style={[styles.filterGroupTitle, { color: theme.text }]}>Sorumluluk Merkezi (SOM)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => setSelectedSom('TÜMÜ')}
                        style={[
                          styles.filterChipItem,
                          selectedSom === 'TÜMÜ' ? { backgroundColor: theme.primary } : { backgroundColor: theme.cardAlt },
                        ]}
                      >
                        <Text style={{ fontSize: 11, color: selectedSom === 'TÜMÜ' ? '#fff' : theme.text, fontWeight: '700' }}>
                          Tümü
                        </Text>
                      </TouchableOpacity>
                      {somList.map((som, sIdx) => (
                        <TouchableOpacity
                          key={sIdx}
                          onPress={() => setSelectedSom(som)}
                          style={[
                            styles.filterChipItem,
                            selectedSom === som ? { backgroundColor: theme.primary } : { backgroundColor: theme.cardAlt },
                          ]}
                        >
                          <Text style={{ fontSize: 11, color: selectedSom === som ? '#fff' : theme.text, fontWeight: '700' }}>
                            {som}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Bölge Filtresi */}
              {bolgeList.length > 0 && (
                <>
                  <Text style={[styles.filterGroupTitle, { color: theme.text }]}>Bölge</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => setSelectedBolge('TÜMÜ')}
                        style={[
                          styles.filterChipItem,
                          selectedBolge === 'TÜMÜ' ? { backgroundColor: theme.primary } : { backgroundColor: theme.cardAlt },
                        ]}
                      >
                        <Text style={{ fontSize: 11, color: selectedBolge === 'TÜMÜ' ? '#fff' : theme.text, fontWeight: '700' }}>
                          Tümü
                        </Text>
                      </TouchableOpacity>
                      {bolgeList.map((b, bIdx) => (
                        <TouchableOpacity
                          key={bIdx}
                          onPress={() => setSelectedBolge(b)}
                          style={[
                            styles.filterChipItem,
                            selectedBolge === b ? { backgroundColor: theme.primary } : { backgroundColor: theme.cardAlt },
                          ]}
                        >
                          <Text style={{ fontSize: 11, color: selectedBolge === b ? '#fff' : theme.text, fontWeight: '700' }}>
                            {b}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}
            </ScrollView>

            {/* Modal Bottom Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedSom('TÜMÜ');
                  setSelectedBolge('TÜMÜ');
                  setSelectedDepoNo('TUMU');
                  setStartDate(defaultStartDate);
                  setEndDate(defaultEndDate);
                  setStatusFilter('acik');
                  setDateField('teslim');
                }}
                style={[styles.modalResetBtn, { borderColor: theme.cardBorder }]}
              >
                <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 13 }}>Sıfırla</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowFilterModal(false);
                  fetchOrders(statusFilter, dateField, startDate, endDate, selectedSom, selectedBolge, selectedDepoNo);
                }}
                style={[styles.modalApplyBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Filtreleri Uygula</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShowStartDatePicker(false);
            if (selected) setStartDate(selected);
          }}
        />
      )}
      {showEndDatePicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShowEndDatePicker(false);
            if (selected) setEndDate(selected);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 7. ORDER DETAIL MODAL                                                     */}
      {/* ========================================================================= */}
      <RNModal
        visible={Boolean(selectedOrder)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.detailModalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {selectedOrder && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.detailEvrakText, { color: theme.primary }]}>
                      Evrak: {selectedOrder.EvrakNo}
                    </Text>
                    <Text style={[styles.detailCariTitle, { color: theme.text }]} numberOfLines={1}>
                      {selectedOrder.CariIsmi}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedOrder(null)}>
                    <Ionicons name="close-circle" size={24} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  {/* Stok Bilgisi */}
                  <View style={[styles.detailSectionBox, { backgroundColor: theme.cardAlt }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>
                      {selectedOrder.StokKodu}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text, marginTop: 2 }}>
                      {selectedOrder.StokIsmi}
                    </Text>
                    <View style={{ marginTop: 8, gap: 4, borderTopWidth: 0.5, borderTopColor: theme.cardBorder, paddingTop: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                        <Ionicons name="chatbox-ellipses" size={13} color="#8B5CF6" style={{ marginTop: 2 }} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#8B5CF6' }}>Açıklama 1:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selectedOrder.Aciklama1 ? theme.text : theme.textMuted, flex: 1 }}>
                          {selectedOrder.Aciklama1 || 'Belirtilmemiş'}
                        </Text>
                      </View>
                      {Boolean(selectedOrder.Aciklama2) && (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                          <Ionicons name="chatbox-ellipses-outline" size={13} color="#8B5CF6" style={{ marginTop: 2 }} />
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#8B5CF6' }}>Açıklama 2:</Text>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text, flex: 1 }}>
                            {selectedOrder.Aciklama2}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Miktar Özeti */}
                  <View style={styles.detailGridRow}>
                    <View style={[styles.detailGridBox, { backgroundColor: theme.cardAlt }]}>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>Sipariş Miktarı</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.text, marginTop: 2 }}>
                        {selectedOrder.SiparisMiktar} {selectedOrder.Birim}
                      </Text>
                    </View>
                    <View style={[styles.detailGridBox, { backgroundColor: theme.cardAlt }]}>
                      <Text style={{ fontSize: 10, color: theme.textMuted }}>Teslim Edilen</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.success, marginTop: 2 }}>
                        {selectedOrder.TeslimMiktar} {selectedOrder.Birim}
                      </Text>
                    </View>
                    <View style={[styles.detailGridBox, { backgroundColor: theme.warningLight }]}>
                      <Text style={{ fontSize: 10, color: theme.warning, fontWeight: '700' }}>Kalan Miktar</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: theme.warning, marginTop: 2 }}>
                        {selectedOrder.KalanMiktar} {selectedOrder.Birim}
                      </Text>
                    </View>
                  </View>

                  {/* Detay Parametreleri */}
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>Teslim Tarihi:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{selectedOrder.TeslimTarihi}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>Sipariş Tarihi:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{selectedOrder.SiparisTarihi}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>Sorumluluk Merkezi:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{selectedOrder.SormerkKod || '-'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>Bölge / Sektör:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
                        {selectedOrder.BolgeIsmi || '-'} {selectedOrder.SektorKodu ? `(${selectedOrder.SektorKodu})` : ''}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 12, color: theme.textMuted }}>Depo:</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{selectedOrder.DepoAdi}</Text>
                    </View>
                    {Number(selectedOrder.BirimFiyat) > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>Birim Fiyat:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{formatPrice(selectedOrder.BirimFiyat)} TL</Text>
                      </View>
                    )}
                    {Number(selectedOrder.Tutar) > 0 && (
                      <View style={styles.detailRow}>
                        <Text style={{ fontSize: 12, color: theme.textMuted }}>Toplam Tutar:</Text>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: theme.success }}>{formatPrice(selectedOrder.Tutar)} TL</Text>
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Action Buttons: Kapat & Faturalaştır */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedOrder(null)}
                    style={[styles.modalCloseBtn, { flex: 1, backgroundColor: theme.cardAlt, borderWidth: 1, borderColor: theme.cardBorder }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>Kapat</Text>
                  </TouchableOpacity>

                  {Number(selectedOrder.KalanMiktar) > 0 && (
                    <TouchableOpacity
                      onPress={() => handleOpenInvoicingModalForSingleItem(selectedOrder)}
                      style={[styles.modalCloseBtn, { flex: 2, backgroundColor: '#10B981', flexDirection: 'row', gap: 6 }]}
                    >
                      <Ionicons name="receipt" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Faturalaştır</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </RNModal>

      {/* ========================================================================= */}
      {/* 8. CAMERA FULLSCREEN MODAL                                                */}
      {/* ========================================================================= */}
      <RNModal visible={isCameraActive} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            enableTorch={torchEnabled}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
            onBarcodeScanned={({ data }) => handleBarcodeScanned(data)}
          />

          {/* Viewfinder Target Box */}
          <View style={styles.cameraOverlay}>
            <View style={styles.viewfinderBox}>
              <View style={[styles.cornerEdge, styles.topLeft]} />
              <View style={[styles.cornerEdge, styles.topRight]} />
              <View style={[styles.cornerEdge, styles.bottomLeft]} />
              <View style={[styles.cornerEdge, styles.bottomRight]} />
            </View>
            <Text style={styles.cameraHelpText}>Siparişli ürün barkodunu kutu içine hizalayın</Text>
          </View>

          {/* Camera Controls */}
          <View style={styles.cameraControlsRow}>
            <TouchableOpacity
              onPress={() => setTorchEnabled(prev => !prev)}
              style={styles.cameraActionBtn}
            >
              <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsCameraActive(false)}
              style={[styles.cameraActionBtn, { backgroundColor: '#EF4444' }]}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      {/* ========================================================================= */}
      {/* 9. FATURALAŞTIRMA (INVOICING) FULL MODAL                                 */}
      {/* ========================================================================= */}
      <RNModal
        visible={invoicingModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingInvoice) setInvoicingModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.invoiceModalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="receipt" size={20} color="#10B981" />
                  <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                    Satış Faturası Kes
                  </Text>
                  <View style={[styles.menuNoBadge, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[styles.menuNoText, { color: theme.primary }]}>061190</Text>
                  </View>
                </View>
                <Text style={[styles.invoiceTargetCariText, { color: theme.primary }]} numberOfLines={1}>
                  {invoicingTargetCari?.cariIsmi} ({invoicingTargetCari?.cariKod})
                </Text>
              </View>
              <TouchableOpacity
                disabled={isSubmittingInvoice}
                onPress={() => setInvoicingModalVisible(false)}
              >
                <Ionicons name="close-circle" size={26} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* SERİ, SIRA (SAYAÇ), DEPO SEÇİMİ PANELİ */}
              <View style={[styles.invoiceConfigCard, { backgroundColor: theme.cardAlt, borderColor: theme.cardBorder }]}>
                {/* Seri Harfi ve Sayaç Sıra No */}
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Fatura Seri</Text>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder }]}
                      value={invoiceSeri}
                      onChangeText={(txt) => {
                        const up = txt.toUpperCase();
                        setInvoiceSeri(up);
                        fetchNextInvoiceNo(up);
                      }}
                      autoCapitalize="characters"
                      placeholder="Seri (SF)"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>

                  <View style={{ flex: 1.5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Sayaç Sıra No</Text>
                      <TouchableOpacity
                        onPress={() => fetchNextInvoiceNo(invoiceSeri)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                      >
                        {isFetchingCounter ? (
                          <ActivityIndicator size="small" color={theme.primary} />
                        ) : (
                          <>
                            <Ionicons name="refresh" size={12} color={theme.primary} />
                            <Text style={{ fontSize: 10.5, color: theme.primary, fontWeight: '700' }}>Sayacı Getir</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[styles.fieldInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.cardBorder, fontWeight: '800' }]}
                      value={invoiceSira ? String(invoiceSira) : ''}
                      onChangeText={(txt) => {
                        const clean = txt.replace(/[^0-9]/g, '');
                        setInvoiceSira(parseInt(clean, 10) || 0);
                      }}
                      keyboardType="numeric"
                      placeholder="Sıra No"
                      placeholderTextColor={theme.textMuted}
                    />
                  </View>
                </View>

                {/* Çıkış Deposu Seçimi */}
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                    Çıkış Deposu (Malların Düşeceği Depo)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(depoList.length > 0 ? depoList : (depos && depos.length > 0 ? depos : [{ dep_no: 1, dep_adi: 'Merkez' }])).map((d: any) => {
                        const isSel = invoiceDepoNo === d.dep_no;
                        return (
                          <TouchableOpacity
                            key={d.dep_no}
                            onPress={() => setInvoiceDepoNo(d.dep_no)}
                            style={[
                              styles.depoSelectChip,
                              isSel
                                ? { backgroundColor: theme.primary, borderColor: theme.primary }
                                : { backgroundColor: theme.card, borderColor: theme.cardBorder },
                            ]}
                          >
                            <Ionicons
                              name="business-outline"
                              size={12}
                              color={isSel ? '#fff' : theme.textMuted}
                            />
                            <Text style={[styles.depoSelectChipText, { color: isSel ? '#fff' : theme.text }]}>
                              {d.dep_no} - {d.dep_adi}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>

              {/* ÜRÜN KALEMLERİ LİSTESİ */}
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text }}>
                    Faturalaştırılacak Ürünler ({invoicingItems.filter(it => it.selected).length}/{invoicingItems.length})
                  </Text>
                  <TouchableOpacity onPress={handleToggleSelectAllInvoiceItems}>
                    <Text style={{ fontSize: 11, color: theme.primary, fontWeight: '700' }}>
                      {invoicingItems.every(it => it.selected) ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {invoicingItems.map((item, idx) => {
                  return (
                    <View
                      key={`${item.StokKodu}_${idx}`}
                      style={[
                        styles.invoiceItemCard,
                        {
                          backgroundColor: item.selected ? (isDark ? '#1E293B' : '#FFFFFF') : (isDark ? '#16202E' : '#F8FAFC'),
                          borderColor: item.selected ? theme.primary : theme.cardBorder,
                          opacity: item.selected ? 1 : 0.6,
                        },
                      ]}
                    >
                      {/* Checkbox and Stock info */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleToggleInvoiceItemSelect(idx)}
                          style={{ marginTop: 2 }}
                        >
                          <Ionicons
                            name={item.selected ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={item.selected ? theme.primary : theme.textMuted}
                          />
                        </TouchableOpacity>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.subItemCode, { color: theme.primary }]}>{item.StokKodu}</Text>
                            <Text style={{ fontSize: 10, color: theme.textMuted }}>Kalan: {item.KalanMiktar} {item.Birim}</Text>
                          </View>
                          <Text style={[styles.subItemName, { color: theme.text }]} numberOfLines={2}>
                            {item.StokIsmi}
                          </Text>

                          {Boolean(item.Aciklama) && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Ionicons name="chatbox-ellipses-outline" size={11} color="#8B5CF6" />
                              <Text style={{ fontSize: 10.5, color: isDark ? '#C4B5FD' : '#7C3AED', fontWeight: '700' }} numberOfLines={1}>
                                {item.Aciklama}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Quantity Stepper & Price Calculation */}
                      {item.selected && (
                        <View style={[styles.invoiceItemQtyRow, { borderTopColor: theme.cardBorder }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>Fatura Adedi:</Text>
                            <TouchableOpacity
                              onPress={() => {
                                const current = Number(item.invoiceQty) || 0;
                                if (current > 1) handleUpdateInvoiceItemQty(idx, String(current - 1));
                              }}
                              style={[styles.stepperBtn, { backgroundColor: theme.cardAlt }]}
                            >
                              <Ionicons name="remove" size={14} color={theme.text} />
                            </TouchableOpacity>

                            <TextInput
                              style={[styles.stepperInput, { backgroundColor: theme.cardAlt, color: theme.text, borderColor: theme.cardBorder }]}
                              value={String(item.invoiceQty)}
                              onChangeText={(val) => handleUpdateInvoiceItemQty(idx, val)}
                              keyboardType="numeric"
                              selectTextOnFocus
                            />

                            <TouchableOpacity
                              onPress={() => {
                                const current = Number(item.invoiceQty) || 0;
                                const max = Number(item.KalanMiktar) || 1;
                                if (current < max) handleUpdateInvoiceItemQty(idx, String(current + 1));
                              }}
                              style={[styles.stepperBtn, { backgroundColor: theme.cardAlt }]}
                            >
                              <Ionicons name="add" size={14} color={theme.text} />
                            </TouchableOpacity>
                            <Text style={{ fontSize: 11, color: theme.textMuted }}>{item.Birim}</Text>
                          </View>

                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text }}>
                              {formatPrice(Number(item.invoiceQty) * Number(item.BirimFiyat || 0))} TL
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* MODAL FOOTER: TOPLAMLAR & FATURAYI ONAYLA BUTONU */}
            <View style={[styles.invoiceModalFooter, { borderTopColor: theme.cardBorder }]}>
              <View style={styles.invoiceFooterTotals}>
                <View>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>Toplam Fatura Tutarı</Text>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: theme.success, marginTop: 1 }}>
                    {formatPrice(
                      invoicingItems
                        .filter(it => it.selected)
                        .reduce((sum, it) => sum + (Number(it.invoiceQty) * Number(it.BirimFiyat || 0)), 0)
                    )} TL
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>Seçili Miktar</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
                    {invoicingItems
                      .filter(it => it.selected)
                      .reduce((sum, it) => sum + Number(it.invoiceQty), 0)}{' '}
                    ADET
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  disabled={isSubmittingInvoice}
                  onPress={() => setInvoicingModalVisible(false)}
                  style={[styles.invoiceCancelBtn, { borderColor: theme.cardBorder }]}
                >
                  <Text style={{ color: theme.textMuted, fontWeight: '700', fontSize: 13 }}>Vazgeç</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={isSubmittingInvoice}
                  onPress={handleExecuteInvoice}
                  style={[
                    styles.invoiceSubmitBtn,
                    { backgroundColor: '#10B981', opacity: isSubmittingInvoice ? 0.7 : 1 },
                  ]}
                >
                  {isSubmittingInvoice ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                        Faturayı Kes ve Onayla
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </RNModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingTop: Platform.OS === 'android' ? 42 : 52,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  menuNoBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  menuNoText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  headerIconBtn: {
    width: 35,
    height: 35,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search Section
  searchSection: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    paddingVertical: 0,
  },
  quickStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  quickChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  quickChipText: {
    fontSize: 10.5,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  statBox: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 13.5,
    fontWeight: '900',
    marginTop: 1,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  tabButtonText: {
    fontSize: 11,
  },

  // Order Card (Satır Görünümü)
  orderCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cariName: {
    fontSize: 13,
    fontWeight: '800',
  },
  regionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  regionChipText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  somChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  somChipText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  evrakText: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    marginVertical: 8,
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockCode: {
    fontSize: 11,
    fontWeight: '800',
  },
  stockName: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
    lineHeight: 16,
  },
  noteBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  noteBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  qtyBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 70,
  },
  qtyLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  qtyValue: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
  },
  qtySub: {
    fontSize: 8.5,
    fontWeight: '600',
  },
  cardNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardNoteLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardNoteText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
  },
  cardNoteRowEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardNoteLabelEmpty: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardNoteTextEmpty: {
    fontSize: 10.5,
    fontStyle: 'italic',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  depoNameText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tutarText: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Grouped Cards (Cari & Urun)
  groupCard: {
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  groupQtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  groupQtyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subItemCode: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  subItemName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  resetFilterBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },

  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  filterGroupTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 4,
  },
  filterChoiceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterChoiceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  datePickerBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  datePickerLabel: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  datePickerValue: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  filterChipItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalResetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalApplyBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },

  // Detail Modal
  detailModalCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  detailEvrakText: {
    fontSize: 11,
    fontWeight: '800',
  },
  detailCariTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  detailSectionBox: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  detailGridRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  detailGridBox: {
    flex: 1,
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  modalCloseBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },

  // Camera Overlay
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderBox: {
    width: 250,
    height: 180,
    position: 'relative',
  },
  cornerEdge: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#0284C7',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  cameraHelpText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cameraControlsRow: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  cameraActionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Invoicing Button on Group Card
  invoiceCariBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  invoiceCariBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Invoicing Modal
  invoiceModalCard: {
    width: '94%',
    maxHeight: '88%',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  invoiceTargetCariText: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  invoiceConfigCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  depoSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  depoSelectChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  invoiceItemCard: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  invoiceItemQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    width: 48,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 0,
  },
  invoiceModalFooter: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 8,
  },
  invoiceFooterTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invoiceCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceSubmitBtn: {
    flex: 2.2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
