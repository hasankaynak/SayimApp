import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  Dimensions,
  Vibration,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { sanitizeBarcode, isDuplicateScanTrigger } from './sayimUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface InvoiceItem {
  guid: string;
  FaturaTarihi: string;
  FaturaTarihiTR: string;
  Seri: string;
  Sira: number;
  BelgeNo: string;
  NormalIade: number; // 0: Normal Alış, 1: İade
  Miktar: number;
  BirimFiyat: number;
  Tutar: number;
  Iskonto1: number;
  Iskonto2: number;
  NetTutar: number;
  DovizCinsi: string;
  DepoNo: number;
  DepoAdi: string;
  CariKodu: string;
  CariUnvan: string;
}

export interface DepoStokItem {
  DepoNo: number | string;
  DepoAdi: string;
  Miktar: number;
}

interface UrunAlisFaturalariViewProps {
  isDark: boolean;
  isConnected: boolean;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  API_BASE_URL: string;
  formatPrice: (p: number) => string;
  playSound: (type: 'beep' | 'success' | 'error' | 'order') => void;
  onBackToMenu: () => void;
  initialProduct?: any;
}

export default function UrunAlisFaturalariView({
  isDark,
  isConnected,
  dbRef,
  API_URL,
  API_BASE_URL,
  formatPrice,
  playSound,
  onBackToMenu,
  initialProduct,
}: UrunAlisFaturalariViewProps) {
  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub.remove();
  }, []);

  const isTablet = windowWidth >= 768;
  const isSmallScreen = windowWidth < 380;

  // Search & Product State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(initialProduct || null);

  // Camera & Laser State
  const [cameraActive, setCameraActive] = useState(false);
  const [torch, setTorch] = useState(false);
  const lastScanCodeRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);
  const laserAnim = useRef(new Animated.Value(0)).current;

  // Invoices & Depo Stock State
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [depoStoklar, setDepoStoklar] = useState<DepoStokItem[]>([]);
  const [isLoadingDepoStok, setIsLoadingDepoStok] = useState(false);

  // In-list Filter & Date Filter
  const [invoiceFilterQuery, setInvoiceFilterQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | '30d' | '90d' | '365d'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'alis' | 'iade'>('all');

  // Laser loop animation
  useEffect(() => {
    if (cameraActive) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(laserAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [cameraActive]);

  // When initialProduct changes or passed
  useEffect(() => {
    if (initialProduct && initialProduct.stock_code) {
      loadProductData(initialProduct);
    }
  }, [initialProduct]);

  // Normalize Turkish text for search
  const normalize = (text: string) => {
    if (!text) return '';
    return String(text)
      .replace(/İ/g, 'i')
      .replace(/I/g, 'ı')
      .replace(/Ş/g, 'ş')
      .replace(/Ğ/g, 'ğ')
      .replace(/Ü/g, 'ü')
      .replace(/Ö/g, 'ö')
      .replace(/Ç/g, 'ç')
      .toLowerCase();
  };

  // Search product in SQLite & Live Mikro fallback
  const handleProductSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text || text.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setShowSearchResults(true);
    setIsSearching(true);
    const clean = text.trim();
    const nQuery = normalize(clean);
    const uText = clean.toUpperCase();

    try {
      const db = dbRef.current;
      let results: any[] = [];

      if (db) {
        const words = nQuery.split(' ').filter(w => w.length > 0);
        if (words.length > 1) {
          let sql = 'SELECT * FROM products WHERE ';
          const conditions = words.map(() => '(name_normalized LIKE ? OR UPPER(stock_code) LIKE ? OR barcode LIKE ?)');
          sql += conditions.join(' AND ') + ' LIMIT 20';
          const params: string[] = [];
          words.forEach(w => params.push(`%${w}%`, `%${w.toUpperCase()}%`, `%${w}%`));
          results = await db.getAllAsync(sql, params);
        } else {
          const sql = 'SELECT * FROM products WHERE name_normalized LIKE ? OR UPPER(stock_code) LIKE ? OR barcode LIKE ? LIMIT 20';
          results = await db.getAllAsync(sql, [`%${nQuery}%`, `%${uText}%`, `%${clean}%`]);
        }
      }

      // SQLite'ta hiç bulunamazsa canlı Mikro'ya sor
      if ((!results || results.length === 0) && isConnected) {
        try {
          const qLive = `
            SELECT TOP 15
              ISNULL(NULLIF(bt.bar_kodu, ''), s.sto_kod) as barcode,
              s.sto_kod as stock_code,
              s.sto_isim as name,
              ISNULL(sf.sfiyat_fiyati, 0) as price,
              s.sto_birim1_ad as unit
            FROM STOKLAR s WITH (NOLOCK)
            LEFT OUTER JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod AND bt.bar_iptal = 0
            LEFT OUTER JOIN STOK_SATIS_FIYAT_LISTELERI sf WITH (NOLOCK) ON sf.sfiyat_stokkod = s.sto_kod AND sf.sfiyat_listesirano = 1
            WHERE (s.sto_isim LIKE '%${clean.replace(/'/g, "''")}%' OR s.sto_kod LIKE '%${clean.replace(/'/g, "''")}%' OR bt.bar_kodu LIKE '%${clean.replace(/'/g, "''")}%')
              AND s.sto_iptal = 0
          `;
          const resL = await axios.post(API_URL, { query: qLive }, { timeout: 6000 });
          if (resL.data?.data && resL.data.data.length > 0) {
            results = resL.data.data;
          }
        } catch (e) {}
      }

      setSearchResults(results || []);
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Camera Barcode Scanned Handler
  const handleBarCodeScanned = async ({ data }: any) => {
    const cleanBarcode = sanitizeBarcode(data);
    if (!cleanBarcode) return;

    if (isDuplicateScanTrigger(cleanBarcode, lastScanCodeRef.current, lastScanTimeRef.current, 500)) {
      return;
    }
    lastScanCodeRef.current = cleanBarcode;
    lastScanTimeRef.current = Date.now();

    Vibration.vibrate(80);
    setCameraActive(false);

    try {
      const db = dbRef.current;
      let found: any = null;

      if (db) {
        found = await db.getFirstAsync(
          'SELECT * FROM products WHERE barcode = ? OR UPPER(stock_code) = ?',
          [cleanBarcode, cleanBarcode.toUpperCase()]
        );
      }

      // SQLite'ta yoksa canlı Mikro'ya sor
      if (!found && isConnected) {
        try {
          const q = `
            SELECT TOP 1
              ISNULL(NULLIF(bt.bar_kodu, ''), s.sto_kod) as barcode,
              s.sto_kod as stock_code,
              s.sto_isim as name,
              ISNULL(sf.sfiyat_fiyati, 0) as price,
              s.sto_birim1_ad as unit
            FROM STOKLAR s WITH (NOLOCK)
            LEFT OUTER JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod AND bt.bar_iptal = 0
            LEFT OUTER JOIN STOK_SATIS_FIYAT_LISTELERI sf WITH (NOLOCK) ON sf.sfiyat_stokkod = s.sto_kod AND sf.sfiyat_listesirano = 1
            WHERE (bt.bar_kodu = '${cleanBarcode.replace(/'/g, "''")}' OR UPPER(s.sto_kod) = '${cleanBarcode.toUpperCase().replace(/'/g, "''")}')
              AND s.sto_iptal = 0
          `;
          const resL = await axios.post(API_URL, { query: q }, { timeout: 6000 });
          if (resL.data?.data && resL.data.data.length > 0) {
            found = resL.data.data[0];
          }
        } catch (e) {}
      }

      if (found) {
        playSound('success');
        loadProductData(found);
      } else {
        playSound('error');
        Alert.alert('Ürün Bulunamadı', `Okutulan barkod (${cleanBarcode}) sistemde kayıtlı değil.`);
      }
    } catch (e) {
      playSound('error');
    }
  };

  // Select Product and Load Invoices + Stock
  const loadProductData = async (product: any) => {
    setSelectedProduct(product);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);

    const sku = product.stock_code;
    if (!sku) return;

    fetchInvoices(sku);
    fetchDepoStock(sku);
  };

  // Fetch purchase invoices for product
  const fetchInvoices = async (stockCode: string) => {
    setIsLoadingInvoices(true);
    setInvoices([]);
    try {
      const q = `
        SELECT 
          h.sth_Guid as guid,
          CONVERT(varchar, h.sth_tarih, 23) as FaturaTarihi,
          CONVERT(varchar, h.sth_tarih, 104) as FaturaTarihiTR,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          ISNULL(h.sth_belge_no, '') as BelgeNo,
          ISNULL(h.sth_normal_iade, 0) as NormalIade,
          ISNULL(h.sth_miktar, 0) as Miktar,
          ISNULL(h.sth_birimfiyat, CASE WHEN h.sth_miktar > 0 THEN (h.sth_tutar / h.sth_miktar) ELSE 0 END) as BirimFiyat,
          ISNULL(h.sth_tutar, 0) as Tutar,
          ISNULL(h.sth_iskonto1, 0) as Iskonto1,
          ISNULL(h.sth_iskonto2, 0) as Iskonto2,
          (ISNULL(h.sth_tutar, 0) - ISNULL(h.sth_iskonto1, 0) - ISNULL(h.sth_iskonto2, 0)) as NetTutar,
          CASE 
            WHEN ISNULL(h.sth_har_doviz_cinsi, 0) = 0 THEN 'TL'
            WHEN h.sth_har_doviz_cinsi = 1 THEN 'USD'
            WHEN h.sth_har_doviz_cinsi = 2 THEN 'EUR'
            WHEN h.sth_har_doviz_cinsi = 3 THEN 'GBP'
            ELSE 'TL'
          END as DovizCinsi,
          h.sth_giris_depo_no as DepoNo,
          ISNULL((SELECT dep_adi FROM DEPOLAR WITH (NOLOCK) WHERE dep_no = h.sth_giris_depo_no), '') as DepoAdi,
          h.sth_cari_kodu as CariKodu,
          ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = h.sth_cari_kodu), h.sth_cari_kodu) as CariUnvan
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        WHERE h.sth_stok_kod = '${stockCode.replace(/'/g, "''")}'
          AND h.sth_evraktip = 3 
          AND h.sth_tip = 0
        ORDER BY h.sth_tarih DESC, h.sth_create_date DESC
      `;

      const res = await axios.post(API_URL, { query: q }, { timeout: 15000 });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setInvoices(res.data.data);
      } else {
        setInvoices([]);
      }
    } catch (err: any) {
      Alert.alert('Fatura Çekme Hatası', err.message || 'Alış faturaları alınamadı.');
      setInvoices([]);
    } finally {
      setIsLoadingInvoices(false);
    }
  };

  // Fetch current warehouse stocks for product
  const fetchDepoStock = async (stockCode: string) => {
    setIsLoadingDepoStok(true);
    setDepoStoklar([]);
    try {
      // 1. Önce SQLite'tan hızlı oku
      const db = dbRef.current;
      if (db) {
        const localStocks: any[] = await db.getAllAsync(
          'SELECT depo_no as DepoNo, depo_adi as DepoAdi, miktar as Miktar FROM depo_stoklar WHERE stock_code = ? ORDER BY depo_no',
          [stockCode]
        );
        if (localStocks && localStocks.length > 0) {
          setDepoStoklar(localStocks);
        }
      }

      // 2. Canlı Mikro ERP'den güncel depoyu çek
      if (isConnected) {
        const response = await axios.get(
          `${API_BASE_URL}/depo-stok/${encodeURIComponent(stockCode)}`,
          { timeout: 10000 }
        );
        if (response.data?.success && Array.isArray(response.data.depolar)) {
          setDepoStoklar(response.data.depolar);
        }
      }
    } catch (e) {
    } finally {
      setIsLoadingDepoStok(false);
    }
  };

  // Calculate total current stock across all warehouses
  const totalCurrentStock = useMemo(() => {
    return depoStoklar.reduce((sum, item) => sum + (Number(item.Miktar) || 0), 0);
  }, [depoStoklar]);

  // Filtered invoices according to date, type, and text query
  const filteredInvoices = useMemo(() => {
    let list = invoices;

    // Type filter (All, Normal Alış, İade)
    if (typeFilter === 'alis') {
      list = list.filter(inv => inv.NormalIade === 0);
    } else if (typeFilter === 'iade') {
      list = list.filter(inv => inv.NormalIade === 1);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let days = 30;
      if (dateFilter === '90d') days = 90;
      if (dateFilter === '365d') days = 365;

      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      list = list.filter(inv => {
        const invDate = new Date(inv.FaturaTarihi);
        return invDate >= cutoff;
      });
    }

    // In-list text query (Cari, Evrak No, Belge No)
    if (invoiceFilterQuery.trim().length > 0) {
      const q = normalize(invoiceFilterQuery.trim());
      list = list.filter(inv => {
        return (
          normalize(inv.CariUnvan || '').includes(q) ||
          normalize(inv.CariKodu || '').includes(q) ||
          normalize(`${inv.Seri}-${inv.Sira}`).includes(q) ||
          normalize(inv.BelgeNo || '').includes(q) ||
          normalize(inv.DepoAdi || '').includes(q)
        );
      });
    }

    return list;
  }, [invoices, typeFilter, dateFilter, invoiceFilterQuery]);

  // KPI calculations on filtered invoices
  const summaryKpis = useMemo(() => {
    const totalQty = filteredInvoices.reduce((acc, inv) => acc + (inv.NormalIade === 1 ? -inv.Miktar : inv.Miktar), 0);
    const totalNet = filteredInvoices.reduce((acc, inv) => acc + (inv.NormalIade === 1 ? -inv.NetTutar : inv.NetTutar), 0);
    const lastInvoice = filteredInvoices[0] || null;
    const avgPrice = totalQty > 0 ? totalNet / totalQty : 0;

    return {
      totalQty,
      totalNet,
      invoiceCount: filteredInvoices.length,
      lastPrice: lastInvoice ? lastInvoice.BirimFiyat : 0,
      lastCurrency: lastInvoice ? lastInvoice.DovizCinsi : 'TL',
      lastDate: lastInvoice ? lastInvoice.FaturaTarihiTR : '-',
      lastSupplier: lastInvoice ? lastInvoice.CariUnvan : '-',
      avgPrice,
    };
  }, [filteredInvoices]);

  // Dynamic Theme Colors
  const colors = {
    bg: isDark ? '#0B1C30' : '#F4F6FB',
    card: isDark ? '#14273E' : '#FFFFFF',
    cardBorder: isDark ? '#223854' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textMuted: isDark ? '#8A9AB5' : '#64748B',
    primary: '#0051D5',
    secondary: '#FF6B00',
    success: '#00AE78',
    danger: '#EF4444',
    badgeBg: isDark ? 'rgba(0, 174, 120, 0.15)' : '#E6F7F2',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* 1. TOP HEADER NAVIGATION BAR */}
      <View style={[styles.topHeader, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <View style={styles.topHeaderLeft}>
          <TouchableOpacity onPress={onBackToMenu} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>
              Ürün Alış Faturaları
            </Text>
            <Text style={[styles.topSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
              Alış Geçmişi, Gelen Fiyat & Güncel Stoklar
            </Text>
          </View>
        </View>

        <View style={styles.topHeaderRight}>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: cameraActive ? colors.secondary : isDark ? '#1E3550' : '#E2E8F0' }]}
            onPress={() => setCameraActive(!cameraActive)}
            activeOpacity={0.8}
          >
            <Ionicons name={cameraActive ? 'close' : 'barcode-outline'} size={20} color={cameraActive ? '#fff' : colors.text} />
          </TouchableOpacity>

          {selectedProduct && (
            <TouchableOpacity
              style={[styles.headerIconBtn, { backgroundColor: isDark ? '#1E3550' : '#E2E8F0', marginLeft: 8 }]}
              onPress={() => {
                if (selectedProduct.stock_code) {
                  fetchInvoices(selectedProduct.stock_code);
                  fetchDepoStock(selectedProduct.stock_code);
                  playSound('beep');
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={19} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2. CAMERA SCANNER VIEW (WITH LASER & RETICLE) */}
      {cameraActive && (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={handleBarCodeScanned}
            enableTorch={torch}
          />

          <View style={styles.reticleContainer}>
            <View style={[styles.reticleCorner, { top: 6, left: 6, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 }]} />
            <View style={[styles.reticleCorner, { top: 6, right: 6, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 }]} />
            <View style={[styles.reticleCorner, { bottom: 6, left: 6, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 }]} />
            <View style={[styles.reticleCorner, { bottom: 6, right: 6, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 }]} />
          </View>

          <Animated.View
            style={[
              styles.laserLine,
              {
                transform: [
                  {
                    translateY: laserAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [15, SCREEN_HEIGHT * 0.22]
                    })
                  }
                ]
              }
            ]}
          />

          <View style={styles.viewfinderTopBadge}>
            <View style={[styles.pulseDot, { backgroundColor: colors.secondary }]} />
            <Text style={styles.viewfinderBadgeText}>Barkod Taranıyor • Kamerayı Koda Yaklaştırın</Text>
          </View>

          <TouchableOpacity
            style={[styles.flashBtn, torch && styles.flashBtnActive]}
            onPress={() => setTorch(!torch)}
          >
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color={torch ? '#fff' : colors.secondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* 3. PRODUCT SEARCH BAR */}
      <View style={[styles.searchBarWrapper, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <View style={[styles.searchBar, { backgroundColor: isDark ? '#1C334D' : '#F1F5F9', borderColor: colors.cardBorder }]}>
          <Ionicons name="search" size={20} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Ürün adı, stok kodu veya barkod ile ara..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleProductSearch}
            autoCapitalize="characters"
          />
          {isSearching && <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />}
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setShowSearchResults(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* SEARCH AUTOCOMPLETE RESULTS DROPDOWN */}
        {showSearchResults && searchResults.length > 0 && (
          <View style={[styles.searchResultsDropdown, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.barcode || item.stock_code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultRow, { borderBottomColor: colors.cardBorder }]}
                  onPress={() => loadProductData(item)}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.searchResultName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.searchResultSku, { color: colors.textMuted }]}>
                      Kod: {item.stock_code} {item.barcode && item.barcode !== item.stock_code ? `• Barkod: ${item.barcode}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isSmallScreen ? 10 : 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 4. SELECTED PRODUCT CARD & SAĞDA GÜNCEL STOKLAR */}
        {selectedProduct ? (
          <View style={[styles.productDetailCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.productSplitLayout, isTablet && styles.productSplitLayoutTablet]}>
              {/* SOL: ÜRÜN TANIMI VE FİYAT */}
              <View style={styles.productLeftInfo}>
                <View style={styles.badgeRow}>
                  <View style={[styles.codeBadge, { backgroundColor: isDark ? 'rgba(0, 81, 213, 0.18)' : '#EFF6FF' }]}>
                    <Text style={[styles.codeBadgeText, { color: colors.primary }]}>{selectedProduct.stock_code}</Text>
                  </View>
                  {selectedProduct.unit && (
                    <View style={[styles.unitBadge, { backgroundColor: isDark ? '#1E3550' : '#E2E8F0' }]}>
                      <Text style={[styles.unitBadgeText, { color: colors.textMuted }]}>{selectedProduct.unit}</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.productTitle, { color: colors.text }]}>
                  {selectedProduct.name}
                </Text>

                {selectedProduct.barcode && selectedProduct.barcode !== selectedProduct.stock_code && (
                  <Text style={[styles.productBarcodeText, { color: colors.textMuted }]}>
                    Barkod: {selectedProduct.barcode}
                  </Text>
                )}

                {selectedProduct.price > 0 && (
                  <View style={styles.productPriceRow}>
                    <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>Satış Fiyatı:</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text, marginLeft: 6 }}>
                      {formatPrice(selectedProduct.price)} {selectedProduct.currency || 'TL'}
                    </Text>
                  </View>
                )}
              </View>

              {/* SAĞDA GÜNCEL STOKLAR (KULLANICI TALEBİ) */}
              <View style={[styles.productRightStock, { backgroundColor: isDark ? '#102236' : '#F8FAFC', borderColor: colors.cardBorder }]}>
                <View style={styles.stockHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="layers" size={17} color={colors.success} />
                    <Text style={[styles.stockHeaderTitle, { color: colors.text }]}>GÜNCEL STOK</Text>
                  </View>
                  {isLoadingDepoStok ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <TouchableOpacity onPress={() => fetchDepoStock(selectedProduct.stock_code)}>
                      <Ionicons name="refresh" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* TOPLAM STOK ROZETİ */}
                <View style={[styles.totalStockPill, { backgroundColor: colors.badgeBg, borderColor: colors.success }]}>
                  <Text style={[styles.totalStockPillLabel, { color: colors.success }]}>Toplam:</Text>
                  <Text style={[styles.totalStockPillVal, { color: colors.success }]}>
                    {formatPrice(totalCurrentStock)} {selectedProduct.unit || 'ADET'}
                  </Text>
                </View>

                {/* DEPO BAZINDA DAĞILIM */}
                <View style={styles.depoStockList}>
                  {depoStoklar.length === 0 ? (
                    <Text style={[styles.emptyDepoText, { color: colors.textMuted }]}>
                      {isLoadingDepoStok ? 'Stoklar yükleniyor...' : 'Depolarda stok kaydı yok'}
                    </Text>
                  ) : (
                    depoStoklar.map((item, idx) => {
                      const qty = Number(item.Miktar) || 0;
                      return (
                        <View key={`${item.DepoNo}-${idx}`} style={styles.depoRow}>
                          <Text style={[styles.depoName, { color: colors.text }]} numberOfLines={1}>
                            {item.DepoAdi || `Depo ${item.DepoNo}`}
                          </Text>
                          <Text
                            style={[
                              styles.depoQty,
                              { color: qty > 0 ? (isDark ? '#34D399' : '#059669') : colors.textMuted, fontWeight: qty > 0 ? '800' : '500' }
                            ]}
                          >
                            {formatPrice(qty)}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : (
          /* ÜRÜN SEÇİLMEDİĞİ DURUM */
          <View style={[styles.noProductCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.noProductIconBox, { backgroundColor: isDark ? 'rgba(0, 81, 213, 0.15)' : '#EFF6FF' }]}>
              <Ionicons name="barcode-outline" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.noProductTitle, { color: colors.text }]}>Lütfen Bir Ürün Seçin veya Okutun</Text>
            <Text style={[styles.noProductSub, { color: colors.textMuted }]}>
              Yukarıdaki arama çubuğundan ürün arayabilir veya barkod okutarak alış faturası geçmişini ve güncel depo stoklarını görüntüleyebilirsiniz.
            </Text>
            <TouchableOpacity
              style={[styles.quickScanBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCameraActive(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={18} color="#fff" />
              <Text style={styles.quickScanBtnText}>Barkod Tara</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 5. ÖZET KPI KARTLARI */}
        {selectedProduct && invoices.length > 0 && (
          <View style={styles.kpiContainer}>
            <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Toplam Gelen</Text>
              <Text style={[styles.kpiVal, { color: colors.success }]}>
                {formatPrice(summaryKpis.totalQty)} {selectedProduct.unit || 'Adet'}
              </Text>
              <Text style={[styles.kpiSub, { color: colors.textMuted }]}>{summaryKpis.invoiceCount} Faturada</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Son Alış Fiyatı</Text>
              <Text style={[styles.kpiVal, { color: colors.secondary }]}>
                {formatPrice(summaryKpis.lastPrice)} {summaryKpis.lastCurrency}
              </Text>
              <Text style={[styles.kpiSub, { color: colors.textMuted }]} numberOfLines={1}>
                {summaryKpis.lastDate}
              </Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Ortalama Maliyet</Text>
              <Text style={[styles.kpiVal, { color: colors.primary }]}>
                {formatPrice(summaryKpis.avgPrice)} {summaryKpis.lastCurrency}
              </Text>
              <Text style={[styles.kpiSub, { color: colors.textMuted }]}>Net Birim</Text>
            </View>
          </View>
        )}

        {/* 6. ALIŞ FATURALARI LİSTESİ BAŞLIK & FİLTRELER */}
        {selectedProduct && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.listHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt" size={20} color={colors.secondary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Alış Faturaları ({filteredInvoices.length})
                </Text>
              </View>

              {/* TÜR FİLTRESİ (TÜMÜ / ALIŞ / İADE) */}
              <View style={styles.filterPillGroup}>
                <TouchableOpacity
                  onPress={() => setTypeFilter('all')}
                  style={[styles.filterPill, typeFilter === 'all' && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.filterPillText, typeFilter === 'all' && { color: '#fff' }]}>Tümü</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTypeFilter('alis')}
                  style={[styles.filterPill, typeFilter === 'alis' && { backgroundColor: colors.success }]}
                >
                  <Text style={[styles.filterPillText, typeFilter === 'alis' && { color: '#fff' }]}>Alış</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTypeFilter('iade')}
                  style={[styles.filterPill, typeFilter === 'iade' && { backgroundColor: colors.danger }]}
                >
                  <Text style={[styles.filterPillText, typeFilter === 'iade' && { color: '#fff' }]}>İade</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* LİSTE İÇİ ARAMA KUTUSU */}
            <View style={[styles.inListSearchBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Ionicons name="filter" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.inListSearchInput, { color: colors.text }]}
                placeholder="Fatura listesinde tedarikçi veya evrak ara..."
                placeholderTextColor={colors.textMuted}
                value={invoiceFilterQuery}
                onChangeText={setInvoiceFilterQuery}
              />
              {invoiceFilterQuery.length > 0 && (
                <TouchableOpacity onPress={() => setInvoiceFilterQuery('')}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* YÜKLENİYOR VE BOŞ DURUMU */}
            {isLoadingInvoices ? (
              <View style={[styles.loadingBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <ActivityIndicator size="large" color={colors.secondary} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Alış faturaları Mikro ERP'den getiriliyor...</Text>
              </View>
            ) : filteredInvoices.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Ionicons name="document-text-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Alış Faturası Bulunamadı</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {invoices.length === 0
                    ? 'Bu ürün için Mikro ERP sisteminde kayıtlı alış faturası hareketi bulunmamaktadır.'
                    : 'Uygulanan filtrelere uygun fatura kaydı bulunamadı.'}
                </Text>
              </View>
            ) : (
              /* FATURA KARTLARI */
              filteredInvoices.map((inv, idx) => {
                const isIade = inv.NormalIade === 1;
                return (
                  <View
                    key={inv.guid || `${inv.Seri}-${inv.Sira}-${idx}`}
                    style={[
                      styles.invoiceCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: isIade ? 'rgba(239, 68, 68, 0.4)' : colors.cardBorder,
                      }
                    ]}
                  >
                    {/* KART ÜST BAŞLIK: EVRAK NO, TARİH, TÜR ETİKETİ */}
                    <View style={styles.invoiceCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View
                          style={[
                            styles.typeBadge,
                            { backgroundColor: isIade ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 174, 120, 0.15)' }
                          ]}
                        >
                          <Text style={[styles.typeBadgeText, { color: isIade ? colors.danger : colors.success }]}>
                            {isIade ? 'ALIŞ İADESİ' : 'ALIŞ FATURASI'}
                          </Text>
                        </View>
                        <Text style={[styles.invoiceEvrakNo, { color: colors.text }]}>
                          {inv.Seri ? `${inv.Seri}-${inv.Sira}` : `#${inv.Sira}`}
                        </Text>
                        {inv.BelgeNo ? (
                          <Text style={[styles.invoiceBelgeNo, { color: colors.textMuted }]}>
                            (Belge: {inv.BelgeNo})
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.invoiceDatePill}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.invoiceDateText, { color: colors.textMuted }]}>
                          {inv.FaturaTarihiTR}
                        </Text>
                      </View>
                    </View>

                    {/* TEDARİKÇİ VE DEPO BİLGİSİ */}
                    <View style={styles.invoiceSupplierRow}>
                      <Ionicons name="business" size={15} color={colors.primary} style={{ marginTop: 2, marginRight: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.supplierName, { color: colors.text }]} numberOfLines={2}>
                          {inv.CariUnvan || 'Tanımsız Tedarikçi'}
                        </Text>
                        <Text style={[styles.supplierCode, { color: colors.textMuted }]}>
                          Cari Kod: {inv.CariKodu || '-'} {inv.DepoAdi ? `• Giriş: ${inv.DepoAdi} (${inv.DepoNo})` : ''}
                        </Text>
                      </View>
                    </View>

                    {/* SAĞ VE SOL VURGULU RAKAMLAR: KAÇ ADET GELDİ? NE KADARA GELDİ? */}
                    <View style={[styles.invoiceMetricsBox, { backgroundColor: isDark ? '#102236' : '#F8FAFC', borderColor: colors.cardBorder }]}>
                      {/* GELEN ADET */}
                      <View style={styles.metricItem}>
                        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Gelen Adet:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <Text style={[styles.qtyHighlight, { color: isIade ? colors.danger : colors.success }]}>
                            {isIade ? `-${inv.Miktar}` : `+${inv.Miktar}`}
                          </Text>
                          <Text style={[styles.qtyUnit, { color: colors.textMuted }]}>{selectedProduct.unit || 'ADET'}</Text>
                        </View>
                      </View>

                      {/* BİRİM ALIŞ FİYATI */}
                      <View style={[styles.metricItem, { borderLeftWidth: 1, borderLeftColor: colors.cardBorder, paddingLeft: 12 }]}>
                        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Birim Alış:</Text>
                        <Text style={[styles.priceHighlight, { color: colors.secondary }]}>
                          {formatPrice(inv.BirimFiyat)} {inv.DovizCinsi}
                        </Text>
                      </View>

                      {/* NET TOPLAM TUTAR */}
                      <View style={[styles.metricItem, { borderLeftWidth: 1, borderLeftColor: colors.cardBorder, paddingLeft: 12 }]}>
                        <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Net Tutar:</Text>
                        <Text style={[styles.totalHighlight, { color: colors.text }]}>
                          {formatPrice(inv.NetTutar)} {inv.DovizCinsi}
                        </Text>
                        {(inv.Iskonto1 > 0 || inv.Iskonto2 > 0) && (
                          <Text style={{ fontSize: 9, color: colors.danger, fontWeight: '700' }}>
                            İsk: {formatPrice(inv.Iskonto1 + inv.Iskonto2)} {inv.DovizCinsi}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Camera Viewfinder Styles
  cameraBox: {
    height: 200,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  reticleContainer: {
    ...StyleSheet.absoluteFillObject,
    margin: 30,
    borderColor: 'transparent',
  },
  reticleCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FF6B00',
  },
  laserLine: {
    height: 2,
    backgroundColor: '#FF6B00',
    width: '90%',
    alignSelf: 'center',
    shadowColor: '#FF6B00',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  viewfinderTopBadge: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  viewfinderBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  flashBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashBtnActive: {
    backgroundColor: '#FF6B00',
  },
  // Search bar
  searchBarWrapper: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    zIndex: 100,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 4,
  },
  searchResultsDropdown: {
    position: 'absolute',
    top: 54,
    left: 14,
    right: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchResultName: {
    fontSize: 13,
    fontWeight: '700',
  },
  searchResultSku: {
    fontSize: 11,
    marginTop: 2,
  },
  // Product Detail Card with Right Stock
  productDetailCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  productSplitLayout: {
    flexDirection: 'column',
    gap: 12,
  },
  productSplitLayoutTablet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  productLeftInfo: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  codeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  unitBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  productBarcodeText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  // Sağda Güncel Stoklar Kutusu
  productRightStock: {
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    minWidth: 180,
  },
  stockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stockHeaderTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  totalStockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  totalStockPillLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  totalStockPillVal: {
    fontSize: 13,
    fontWeight: '900',
  },
  depoStockList: {
    gap: 4,
  },
  depoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  depoName: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  depoQty: {
    fontSize: 11,
  },
  emptyDepoText: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },
  // No Product Placeholder
  noProductCard: {
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProductIconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  noProductTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  noProductSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 320,
  },
  quickScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  quickScanBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  // KPI Cards
  kpiContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  kpiVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  kpiSub: {
    fontSize: 9,
    marginTop: 2,
    fontWeight: '600',
  },
  // List Header and Filters
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  filterPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(100, 116, 139, 0.15)',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  inListSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    borderWidth: 1,
    marginBottom: 10,
  },
  inListSearchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 2,
  },
  // Invoice Card
  invoiceCard: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  invoiceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  invoiceEvrakNo: {
    fontSize: 13,
    fontWeight: '800',
  },
  invoiceBelgeNo: {
    fontSize: 10,
  },
  invoiceDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  invoiceDateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  invoiceSupplierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  supplierName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  supplierCode: {
    fontSize: 10,
    marginTop: 2,
  },
  // Highlighted Metrics (Kaç adet gelmiş, ne kadara gelmiş)
  invoiceMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  qtyHighlight: {
    fontSize: 15,
    fontWeight: '900',
  },
  qtyUnit: {
    fontSize: 10,
    fontWeight: '700',
  },
  priceHighlight: {
    fontSize: 13,
    fontWeight: '900',
  },
  totalHighlight: {
    fontSize: 12,
    fontWeight: '800',
  },
  // Loading & Empty States
  loadingBox: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '800',
  },
  emptySub: {
    marginTop: 4,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
  },
});
