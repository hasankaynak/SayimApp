import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ToastAndroid,
  ActivityIndicator,
  Vibration,
  Keyboard,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView } from 'expo-camera';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface FaturaItem {
  id: string;
  barcode: string;
  stock_code: string;
  name: string;
  unit: string;
  miktar: number;
  birim_fiyat: number;
  kdv_orani: number;
  kdv_pntr: number;
  tutar: number;
  kdv_tutari: number;
  toplam_tutar: number;
}

export interface FaturaCari {
  cari_kod: string;
  cari_unvan1: string;
  bakiye?: number;
}

interface AlisFaturasiViewProps {
  isDark: boolean;
  isConnected?: boolean | null;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  mikroUserNo: string;
  depos: any[];
  selectedDepo: any;
  formatPrice: (val: number) => string;
  playSound: (type: 'success' | 'error' | 'beep') => Promise<void>;
  onBackToMenu: () => void;
  openNewCardModal: (prefilledBarcode?: string, forFatura?: boolean) => void;
  faturaCart: FaturaItem[];
  setFaturaCart: React.Dispatch<React.SetStateAction<FaturaItem[]>>;
  onOpenUserSelect?: () => void;
  mikroUsersList?: any[];
}

export default function AlisFaturasiView({
  isDark,
  isConnected,
  dbRef,
  API_URL,
  mikroUserNo,
  depos,
  selectedDepo,
  formatPrice,
  playSound,
  onBackToMenu,
  openNewCardModal,
  faturaCart,
  setFaturaCart,
  onOpenUserSelect,
  mikroUsersList = []
}: AlisFaturasiViewProps) {
  const currentUserObj = mikroUsersList.find(u => String(u.KULLANICI_NO) === String(mikroUserNo));
  const currentUserName = currentUserObj ? currentUserObj.KULLANICI_ADI : `Kullanıcı ${mikroUserNo}`;

  // Evrak Header State
  const [faturaCari, setFaturaCari] = useState<FaturaCari | null>(null);
  const [evrakSeri, setEvrakSeri] = useState('ALIŞ');
  const [evrakSira, setEvrakSira] = useState('');
  const [belgeNo, setBelgeNo] = useState('');
  const [evrakTarih, setEvrakTarih] = useState(() => new Date().toISOString().split('T')[0]);
  const [faturaDepo, setFaturaDepo] = useState<any>(selectedDepo || (depos && depos[0]) || null);
  const [showDepoPicker, setShowDepoPicker] = useState(false);

  // Arama & Barkod State
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isCameraScanned, setIsCameraScanned] = useState(false);
  const laserAnim = useRef(new Animated.Value(0)).current;

  // Kalem Ekleme Modalı State
  const [selectedProductForAdd, setSelectedProductForAdd] = useState<any>(null);
  const [showItemAddModal, setShowItemAddModal] = useState(false);
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [itemVat, setItemVat] = useState<number>(20);

  // Cari Seçim Modalı State
  const [showCariModal, setShowCariModal] = useState(false);
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [cariResults, setCariResults] = useState<FaturaCari[]>([]);
  const [isSearchingCari, setIsSearchingCari] = useState(false);

  // Fatura Kaydetme State
  const [isSavingFatura, setIsSavingFatura] = useState(false);

  // Lazer animasyonu
  useEffect(() => {
    if (cameraActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(laserAnim, { toValue: 0, duration: 1500, easing: Easing.linear, useNativeDriver: true })
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [cameraActive]);

  // İlk yüklemede sıradaki evrak numarasını ve kayıtlı cariyi çek
  useEffect(() => {
    fetchNextSira(evrakSeri);
    AsyncStorage.getItem('fatura_saved_cari').then(str => {
      if (str) {
        try { setFaturaCari(JSON.parse(str)); } catch (e) {}
      }
    });
  }, []);

  const fetchNextSira = async (seri: string) => {
    try {
      const cleanSeri = (seri || 'ALIŞ').replace(/'/g, "''");
      const q = `SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS next_sira FROM STOK_HAREKETLERI WITH (NOLOCK) WHERE sth_evrakno_seri = '${cleanSeri}' AND sth_evraktip = 3`;
      const res = await axios.post(API_URL, { query: q }, { timeout: 8000 });
      const next = res.data?.data?.[0]?.next_sira;
      if (next) {
        setEvrakSira(next.toString());
      }
    } catch (e) {}
  };

  // Cari arama
  const handleCariSearch = async (text: string) => {
    setCariSearchQuery(text);
    if (text.trim().length < 2) {
      setCariResults([]);
      return;
    }
    setIsSearchingCari(true);
    try {
      const uText = text.trim().toLocaleUpperCase('tr-TR').replace(/'/g, "''");
      const q = `
        SELECT TOP 25 
          cari_kod, 
          cari_unvan1, 
          (SELECT ISNULL(SUM(CASE WHEN cha_tip = 0 THEN cha_meblag ELSE -cha_meblag END), 0) 
           FROM CARI_HESAP_HAREKETLERI WITH (NOLOCK) 
           WHERE cha_kod = cari_kod) AS bakiye 
        FROM CARI_HESAPLAR WITH (NOLOCK) 
        WHERE cari_unvan1 LIKE '%${uText}%' OR cari_kod LIKE '%${uText}%'
        ORDER BY cari_unvan1;
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 12000 });
      if (res.data?.success && res.data?.data) {
        setCariResults(res.data.data);
      }
    } catch (e) {
    } finally {
      setIsSearchingCari(false);
    }
  };

  const selectCari = (item: FaturaCari) => {
    setFaturaCari(item);
    AsyncStorage.setItem('fatura_saved_cari', JSON.stringify(item)).catch(() => {});
    setShowCariModal(false);
    setCariSearchQuery('');
    setCariResults([]);
    ToastAndroid.show(`Tedarikçi Seçildi: ${item.cari_unvan1}`, ToastAndroid.SHORT);
  };

  // Ürün Arama & Barkod Okuma
  const handleProductSearch = async (text: string) => {
    setSearchInput(text);
    const clean = text.trim();
    if (clean.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const db = dbRef.current;
      if (!db) return;
      const uText = clean.toUpperCase();
      const sql = `
        SELECT * FROM products 
        WHERE barcode = ? OR UPPER(stock_code) LIKE ? OR name_normalized LIKE ? 
        LIMIT 15;
      `;
      const rows = await db.getAllAsync(sql, [clean, `%${uText}%`, `%${clean.toLowerCase()}%`]);
      setSearchResults(rows || []);
    } catch (e) {}
  };

  // Barkod Okutulduğunda (Kamera veya Enter ile)
  const processScannedBarcode = async (barcode: string) => {
    const clean = barcode.trim();
    if (!clean) return;
    Vibration.vibrate(80);

    try {
      const db = dbRef.current;
      let foundProduct: any = null;

      if (db) {
        foundProduct = await db.getFirstAsync('SELECT * FROM products WHERE barcode = ?', [clean]);
      }

      // SQLite'ta bulunamazsa Mikro ERP'ye sor
      if (!foundProduct) {
        try {
          const q = `
            SELECT TOP 1 
              bt.bar_kodu AS barcode,
              s.sto_kod AS stock_code,
              s.sto_isim AS name,
              ISNULL(sf.sfiyat_fiyati, 0) AS price,
              s.sto_birim1_ad AS unit
            FROM BARKOD_TANIMLARI bt WITH (NOLOCK)
            INNER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = bt.bar_stokkodu
            LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sf WITH (NOLOCK) ON sf.sfiyat_stokkod = s.sto_kod AND sf.sfiyat_listesirano = 1
            WHERE bt.bar_kodu = '${clean.replace(/'/g, "''")}';
          `;
          const res = await axios.post(API_URL, { query: q }, { timeout: 8000 });
          if (res.data?.data?.[0]) {
            foundProduct = res.data.data[0];
            // SQLite'a da yazalım
            if (db) {
              await db.runAsync(
                'INSERT OR REPLACE INTO products (barcode, stock_code, name, price, currency, unit, name_normalized, lastup_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [foundProduct.barcode, foundProduct.stock_code, foundProduct.name, foundProduct.price || 0, 'TL', foundProduct.unit || 'ADET', (foundProduct.name || '').toLowerCase(), '']
              );
            }
          }
        } catch (e) {}
      }

      if (foundProduct) {
        playSound('success');
        openItemAddModal(foundProduct);
      } else {
        playSound('error');
        // Ürün bulunamadı: Yeni kart açma teklif et!
        Alert.alert(
          'Ürün Bulunamadı!',
          `'${clean}' barkodlu ürün Mikro ERP sisteminde kayıtlı değil.\n\nBu ürün için şimdi yeni stok kartı açıp faturaya eklemek ister misiniz?`,
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: '✨ Yeni Kart Aç & Ekle',
              onPress: () => {
                openNewCardModal(clean, true);
              }
            }
          ]
        );
      }
    } catch (err: any) {
      Alert.alert('Hata', err.message || 'Ürün arama hatası');
    }
  };

  const openItemAddModal = (prod: any) => {
    setSelectedProductForAdd(prod);
    setItemQty('1');
    setItemPrice(prod.price ? prod.price.toString() : '');
    setItemVat(20);
    setShowItemAddModal(true);
    setSearchInput('');
    setSearchResults([]);
  };

  // Kalemi faturaya ekle
  const handleAddItemToCart = () => {
    if (!selectedProductForAdd) return;

    const qty = parseFloat(itemQty.replace(',', '.')) || 0;
    const price = parseFloat(itemPrice.replace(',', '.')) || 0;

    if (qty <= 0) {
      Alert.alert('Eksik Bilgi', 'Lütfen geçerli bir miktar girin.');
      return;
    }

    const vatMap: Record<number, number> = { 20: 5, 10: 4, 1: 1 };
    const vatPntr = vatMap[itemVat] || 5;

    const tutar = Math.round(qty * price * 100) / 100;
    const kdvTutari = Math.round(tutar * (itemVat / 100) * 100) / 100;
    const toplamTutar = Math.round((tutar + kdvTutari) * 100) / 100;

    const existingIdx = faturaCart.findIndex(i => i.stock_code === selectedProductForAdd.stock_code);

    if (existingIdx >= 0) {
      Alert.alert(
        'Ürün Zaten Faturada Mevcut',
        `Bu ürün faturada ${faturaCart[existingIdx].miktar} adet olarak ekli. Ne yapmak istersiniz?`,
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Miktarın Üzerine Ekle',
            onPress: () => {
              const updatedCart = [...faturaCart];
              const newQty = updatedCart[existingIdx].miktar + qty;
              const newTutar = Math.round(newQty * price * 100) / 100;
              const newKdv = Math.round(newTutar * (itemVat / 100) * 100) / 100;
              updatedCart[existingIdx] = {
                ...updatedCart[existingIdx],
                miktar: newQty,
                birim_fiyat: price,
                kdv_orani: itemVat,
                kdv_pntr: vatPntr,
                tutar: newTutar,
                kdv_tutari: newKdv,
                toplam_tutar: Math.round((newTutar + newKdv) * 100) / 100
              };
              setFaturaCart(updatedCart);
              AsyncStorage.setItem('fatura_cart', JSON.stringify(updatedCart)).catch(() => {});
              setShowItemAddModal(false);
              ToastAndroid.show('Miktar güncellendi!', ToastAndroid.SHORT);
              playSound('success');
            }
          },
          {
            text: 'Ayrı Satır Olarak Ekle',
            onPress: () => {
              const newItem: FaturaItem = {
                id: Date.now().toString() + Math.random().toString().slice(-4),
                barcode: selectedProductForAdd.barcode || '',
                stock_code: selectedProductForAdd.stock_code,
                name: selectedProductForAdd.name,
                unit: selectedProductForAdd.unit || 'ADET',
                miktar: qty,
                birim_fiyat: price,
                kdv_orani: itemVat,
                kdv_pntr: vatPntr,
                tutar: tutar,
                kdv_tutari: kdvTutari,
                toplam_tutar: toplamTutar
              };
              const updated = [newItem, ...faturaCart];
              setFaturaCart(updated);
              AsyncStorage.setItem('fatura_cart', JSON.stringify(updated)).catch(() => {});
              setShowItemAddModal(false);
              ToastAndroid.show('Faturaya eklendi!', ToastAndroid.SHORT);
              playSound('success');
            }
          }
        ]
      );
      return;
    }

    const newItem: FaturaItem = {
      id: Date.now().toString(),
      barcode: selectedProductForAdd.barcode || '',
      stock_code: selectedProductForAdd.stock_code,
      name: selectedProductForAdd.name,
      unit: selectedProductForAdd.unit || 'ADET',
      miktar: qty,
      birim_fiyat: price,
      kdv_orani: itemVat,
      kdv_pntr: vatPntr,
      tutar: tutar,
      kdv_tutari: kdvTutari,
      toplam_tutar: toplamTutar
    };

    const updated = [newItem, ...faturaCart];
    setFaturaCart(updated);
    AsyncStorage.setItem('fatura_cart', JSON.stringify(updated)).catch(() => {});
    setShowItemAddModal(false);
    ToastAndroid.show('Faturaya eklendi!', ToastAndroid.SHORT);
    playSound('success');
  };

  // Sepetten kalem silme
  const removeItemFromCart = (id: string) => {
    Alert.alert('Kalemi Sil', 'Bu ürünü faturadan çıkarmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          const updated = faturaCart.filter(i => i.id !== id);
          setFaturaCart(updated);
          AsyncStorage.setItem('fatura_cart', JSON.stringify(updated)).catch(() => {});
        }
      }
    ]);
  };

  // Miktar artır / azalt
  const changeItemQty = (id: string, delta: number) => {
    const updated = faturaCart.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.miktar + delta);
        const tutar = Math.round(newQty * item.birim_fiyat * 100) / 100;
        const kdvTutari = Math.round(tutar * (item.kdv_orani / 100) * 100) / 100;
        return {
          ...item,
          miktar: newQty,
          tutar: tutar,
          kdv_tutari: kdvTutari,
          toplam_tutar: Math.round((tutar + kdvTutari) * 100) / 100
        };
      }
      return item;
    });
    setFaturaCart(updated);
    AsyncStorage.setItem('fatura_cart', JSON.stringify(updated)).catch(() => {});
  };

  // Toplam Hesapları
  const araToplam = faturaCart.reduce((sum, i) => sum + (i.tutar || 0), 0);
  const kdvToplam = faturaCart.reduce((sum, i) => sum + (i.kdv_tutari || 0), 0);
  const genelToplam = faturaCart.reduce((sum, i) => sum + (i.toplam_tutar || 0), 0);
  const toplamAdet = faturaCart.reduce((sum, i) => sum + (i.miktar || 0), 0);

  // Faturayı Mikro ERP'ye Kaydet
  const handleSaveInvoice = async () => {
    if (!faturaCari) {
      Alert.alert('Tedarikçi Eksik', 'Lütfen faturayı kaydetmeden önce Tedarikçi (Cari) seçin.');
      setShowCariModal(true);
      return;
    }
    if (faturaCart.length === 0) {
      Alert.alert('Fatura Boş', 'Faturaya henüz hiçbir ürün eklenmedi.');
      return;
    }

    const depoNo = faturaDepo?.depo_no || selectedDepo?.depo_no || '1';
    const userNum = parseInt(mikroUserNo, 10) || 7;
    const cleanSeri = (evrakSeri || 'ALIŞ').trim().toUpperCase().replace(/'/g, "''");
    const cleanBelgeNo = (belgeNo || '').trim().toUpperCase().replace(/'/g, "''");
    const userSira = parseInt(evrakSira) || 0;
    const cleanCariKod = faturaCari.cari_kod.replace(/'/g, "''");
    const cleanTarih = evrakTarih || new Date().toISOString().split('T')[0];

    Alert.alert(
      'Faturayı Kaydet',
      `Tedarikçi: ${faturaCari.cari_unvan1}\n` +
      `Seri / Sıra: ${cleanSeri}-${userSira > 0 ? userSira : 'OTOMATİK'}\n` +
      `Giriş Deposu: ${faturaDepo?.depo_adi || 'Merkez'}\n` +
      `Kalem Sayısı: ${faturaCart.length} kalem (${toplamAdet} adet)\n` +
      `Genel Toplam: ${formatPrice(genelToplam)} TL\n` +
      `Kayıt Yapan Kullanıcı: ${currentUserName} (ID: ${userNum})\n\n` +
      `Fatura Mikro ERP'ye kaydedilsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '✅ Kaydet & Aktar',
          onPress: async () => {
            setIsSavingFatura(true);
            try {
              const itemsSql = faturaCart.map((item, idx) => `
                INSERT INTO STOK_HAREKETLERI (
                  sth_Guid, sth_DBCno, sth_create_date, sth_create_user, sth_lastup_date, sth_lastup_user,
                  sth_fileid, sth_MainProgramNo, sth_VersionNo, sth_MenuNo, sth_Hash,
                  sth_tarih, sth_tip, sth_cins, sth_evraktip, sth_evrakno_seri, sth_evrakno_sira,
                  sth_satirno, sth_belge_no, sth_belge_tarih, sth_cari_kodu, sth_stok_kod,
                  sth_giris_depo_no, sth_cikis_depo_no, sth_miktar, sth_miktar2, sth_birim_pntr,
                  sth_birimfiyat, sth_tutar, sth_vergi_pntr, sth_vergi, sth_fat_uid,
                  sth_firmano, sth_subeno, sth_stok_srm_merkezi, sth_proje_kodu, sth_normal_iade
                ) VALUES (
                  NEWID(), 0, @Now, ${userNum}, @Now, ${userNum},
                  16, 21, '17.05d', '62205', '0',
                  @Tarih, 0, 0, 3, '${cleanSeri}', @NextSira,
                  ${idx + 1}, '${cleanBelgeNo}', @Tarih, '${cleanCariKod}', '${item.stock_code.replace(/'/g, "''")}',
                  ${depoNo}, ${depoNo}, ${item.miktar}, ${item.miktar}, 1,
                  ${item.birim_fiyat}, ${item.tutar}, ${item.kdv_pntr}, ${item.kdv_tutari}, @FatGuid,
                  0, 0, '', '', 0
                );
              `).join('\n');

              const saveQ = `
                BEGIN TRANSACTION;
                BEGIN TRY
                  DECLARE @FatGuid UNIQUEIDENTIFIER = NEWID();
                  DECLARE @Now DATETIME = GETDATE();
                  DECLARE @Tarih DATETIME = '${cleanTarih}';
                  DECLARE @NextSira INT = ${userSira};
                  
                  IF (@NextSira <= 0)
                  BEGIN
                    SELECT @NextSira = ISNULL(MAX(sth_evrakno_sira), 0) + 1 
                    FROM STOK_HAREKETLERI WITH (UPDLOCK) 
                    WHERE sth_evrakno_seri = '${cleanSeri}' AND sth_evraktip = 3;
                  END

                  -- 1. STOK HAREKETLERİ (KALEMLER)
                  ${itemsSql}

                  -- 2. CARİ HESAP HAREKETLERİ (FATURA BAŞLIĞI)
                  INSERT INTO CARI_HESAP_HAREKETLERI (
                    cha_Guid, cha_DBCno, cha_create_date, cha_create_user, cha_lastup_date, cha_lastup_user,
                    cha_fileid, cha_MainProgramNo, cha_VersionNo, cha_MenuNo, cha_Hash,
                    cha_tarihi, cha_tip, cha_cinsi, cha_evrak_tip, cha_evrakno_seri, cha_evrakno_sira,
                    cha_satir_no, cha_belge_no, cha_belge_tarih, cha_kod, cha_ciro_cari_kodu,
                    cha_meblag, cha_aratoplam,
                    cha_firmano, cha_subeno, cha_srmrkkodu, cha_projekodu
                  ) VALUES (
                    @FatGuid, 0, @Now, ${userNum}, @Now, ${userNum},
                    51, 21, '17.05d', '62205', '0',
                    @Tarih, 1, 6, 0, '${cleanSeri}', @NextSira,
                    0, '${cleanBelgeNo}', @Tarih, '${cleanCariKod}', '${cleanCariKod}',
                    ${genelToplam.toFixed(2)}, ${araToplam.toFixed(2)},
                    0, 0, '', ''
                  );

                  COMMIT TRANSACTION;
                  SELECT 1 AS success, @NextSira AS saved_sira, 'FATURA BASARIYLA MIKROYA ISLENDI' AS message;
                END TRY
                BEGIN CATCH
                  ROLLBACK TRANSACTION;
                  SELECT 0 AS success, ERROR_MESSAGE() AS error_message;
                END CATCH
              `;

              const res = await axios.post(API_URL, { query: saveQ }, { timeout: 25000 });
              const resultObj = res.data?.data?.[0];

              if (!resultObj?.success) {
                throw new Error(resultObj?.error_message || 'Mikro faturayı kaydederken hata oluştu.');
              }

              const savedSiraNumber = resultObj.saved_sira || userSira;

              // SQLite Yerel Yedek
              const db = dbRef.current;
              if (db) {
                try {
                  await db.runAsync(`
                    INSERT INTO fatura_backups (
                      backup_date, cari_kod, cari_unvan, evrak_seri, evrak_sira, belge_no, depo_no,
                      item_count, ara_toplam, kdv_toplam, genel_toplam, cart_data, mikro_sent
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                  `, [
                    new Date().toLocaleString('tr-TR'),
                    cleanCariKod,
                    faturaCari.cari_unvan1,
                    cleanSeri,
                    savedSiraNumber,
                    cleanBelgeNo,
                    depoNo.toString(),
                    faturaCart.length,
                    araToplam,
                    kdvToplam,
                    genelToplam,
                    JSON.stringify(faturaCart)
                  ]);
                } catch (e) {}
              }

              // Fatura başarıyla bitti, sepeti temizle
              setFaturaCart([]);
              await AsyncStorage.removeItem('fatura_cart');
              setBelgeNo('');
              fetchNextSira(cleanSeri);

              playSound('success');
              Alert.alert(
                '🎉 Fatura Kaydedildi!',
                `Alış Faturası Mikro ERP'ye başarıyla kaydedildi.\n\n` +
                `Evrak: ${cleanSeri}-${savedSiraNumber}\n` +
                `Tedarikçi: ${faturaCari.cari_unvan1}\n` +
                `Kayıt Yapan: ${currentUserName} (ID: ${userNum})\n` +
                `Toplam: ${formatPrice(genelToplam)} TL`,
                [
                  { text: 'Yeni Fatura Gir', onPress: () => {} },
                  { text: 'Ana Menüye Dön', onPress: onBackToMenu }
                ]
              );
            } catch (err: any) {
              playSound('error');
              Alert.alert('Kayıt Başarısız', err.response?.data?.error || err.message || 'Bilinmeyen hata.');
            } finally {
              setIsSavingFatura(false);
            }
          }
        }
      ]
    );
  };

  const colors = {
    bg: isDark ? '#0B1C30' : '#F8F9FF',
    card: isDark ? '#132840' : '#FFFFFF',
    cardLow: isDark ? '#1A3350' : '#F1F5F9',
    text: isDark ? '#FFFFFF' : '#0F172A',
    textMuted: isDark ? '#8A9AB5' : '#64748B',
    border: isDark ? '#1F3B5C' : '#E2E8F0',
    primary: '#10B981', // Alış Faturası için canlı zümrüt yeşili
    primarySoft: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
    orange: '#FF6B00',
    orangeSoft: isDark ? 'rgba(255, 107, 0, 0.15)' : 'rgba(255, 107, 0, 0.1)',
    blue: '#3B82F6',
    danger: '#EF4444',
    dangerSoft: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* 1. TOP HEADER BAR */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 45,
        paddingBottom: 12,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderColor: colors.border
      }}>
        <TouchableOpacity
          onPress={onBackToMenu}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Menü</Text>
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="receipt" size={18} color={colors.primary} />
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 }}>ALIŞ FATURASI</Text>
          </View>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>Mal Kabul & Canlı Stok Girişi</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {faturaCart.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Sepeti Boşalt', 'Tüm fatura kalemleri silinsin mi?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Temizle', style: 'destructive', onPress: () => { setFaturaCart([]); AsyncStorage.removeItem('fatura_cart'); } }
                ]);
              }}
              style={{ padding: 6, borderRadius: 10, backgroundColor: colors.dangerSoft }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={onOpenUserSelect}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: isDark ? 'rgba(0,174,120,0.15)' : '#E6F7F2',
              borderWidth: 1,
              borderColor: '#00AE78',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Ionicons name="person-circle-outline" size={16} color="#00AE78" />
            <Text style={{ color: '#00AE78', fontSize: 11, fontWeight: '800' }}>
              {currentUserName} ({mikroUserNo})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setCameraActive(!cameraActive);
              setIsCameraScanned(false);
            }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: cameraActive ? colors.orange : colors.cardLow,
              borderWidth: 1,
              borderColor: cameraActive ? colors.orange : colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Ionicons name="barcode-outline" size={18} color={cameraActive ? '#fff' : colors.text} />
            <Text style={{ color: cameraActive ? '#fff' : colors.text, fontSize: 11, fontWeight: '800' }}>
              {cameraActive ? 'Kapat' : 'Kamera'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KAMERA BARKOD TARAYICI */}
      {cameraActive && (
        <View style={{ height: 210, backgroundColor: '#000', overflow: 'hidden', position: 'relative' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'qr']
            }}
            onBarcodeScanned={isCameraScanned ? undefined : ({ data }) => {
              setIsCameraScanned(true);
              processScannedBarcode(data);
              setTimeout(() => setIsCameraScanned(false), 2000);
            }}
          />
          {/* Lazer Çizgisi */}
          <Animated.View
            style={{
              position: 'absolute',
              left: '10%',
              right: '10%',
              height: 2,
              backgroundColor: '#10B981',
              shadowColor: '#10B981',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 6,
              elevation: 8,
              top: laserAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 190] })
            }}
          />
          <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Barkodu kameraya yaklaştırın</Text>
          </View>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
      >
        {/* 2. TEDARİKÇİ (CARİ) SEÇİM KARTI */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setShowCariModal(true)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 14,
            borderWidth: 1.5,
            borderColor: faturaCari ? colors.primary : colors.orange,
            marginBottom: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: faturaCari ? 8 : 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: faturaCari ? colors.primarySoft : colors.orangeSoft,
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Ionicons name="business" size={20} color={faturaCari ? colors.primary : colors.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 }}>TEDARİKÇİ (CARİ) HESAP *</Text>
                <Text style={{ fontSize: 14, fontWeight: '900', color: faturaCari ? colors.text : colors.orange }} numberOfLines={1}>
                  {faturaCari ? faturaCari.cari_unvan1 : 'Lütfen Tedarikçi Seçin (Tıklayın)'}
                </Text>
              </View>
            </View>

            <View style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: faturaCari ? colors.cardLow : colors.orange,
              alignItems: 'center'
            }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: faturaCari ? colors.text : '#fff' }}>
                {faturaCari ? 'Değiştir' : 'Seç'}
              </Text>
            </View>
          </View>

          {faturaCari && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '700' }}>Kod: {faturaCari.cari_kod}</Text>
              <Text style={{ fontSize: 12, fontWeight: '800', color: (faturaCari.bakiye || 0) < 0 ? colors.primary : ((faturaCari.bakiye || 0) > 0 ? colors.danger : colors.textMuted) }}>
                Bakiye: {formatPrice(Math.abs(faturaCari.bakiye || 0))} TL {(faturaCari.bakiye || 0) < 0 ? '(Alacaklı)' : ((faturaCari.bakiye || 0) > 0 ? '(Borçlu)' : '')}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 3. EVRAK BİLGİLERİ (Seri, Sıra, Belge No, Depo) */}
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          marginBottom: 10
        }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {/* Evrak Seri */}
            <View style={{ width: 85 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, marginBottom: 4 }}>SERİ</Text>
              <TextInput
                style={{
                  height: 40,
                  backgroundColor: colors.cardLow,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: '800',
                  textAlign: 'center',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                value={evrakSeri}
                onChangeText={(t) => {
                  setEvrakSeri(t.toUpperCase());
                  fetchNextSira(t.toUpperCase());
                }}
                autoCapitalize="characters"
              />
            </View>

            {/* Evrak Sıra No */}
            <View style={{ width: 95 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, marginBottom: 4 }}>SIRA NO</Text>
              <TextInput
                style={{
                  height: 40,
                  backgroundColor: colors.cardLow,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: '800',
                  textAlign: 'center',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                value={evrakSira}
                onChangeText={setEvrakSira}
                keyboardType="numeric"
                placeholder="Oto"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Belge No (Matbu / e-Fatura No) */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, marginBottom: 4 }}>BELGE NO (FATURA NO)</Text>
              <TextInput
                style={{
                  height: 40,
                  backgroundColor: colors.cardLow,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: '700',
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                placeholder="Örn: GIB2026..."
                placeholderTextColor={colors.textMuted}
                value={belgeNo}
                onChangeText={setBelgeNo}
                autoCapitalize="characters"
              />
            </View>
          </View>

          {/* Depo Seçimi */}
          <TouchableOpacity
            onPress={() => setShowDepoPicker(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.cardLow,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="home-outline" size={16} color={colors.primary} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>Giriş Deposu:</Text>
              <Text style={{ fontSize: 12, fontWeight: '900', color: colors.text }}>
                {faturaDepo ? `${faturaDepo.depo_no} - ${faturaDepo.depo_adi}` : 'Depo Seçin'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 4. HIZLI ARAMA & YENİ KART BUTONU */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <View style={{
            flex: 1,
            height: 46,
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}
              placeholder="Barkod okutun veya ürün arayın..."
              placeholderTextColor={colors.textMuted}
              value={searchInput}
              onChangeText={handleProductSearch}
              onSubmitEditing={() => processScannedBarcode(searchInput)}
              returnKeyType="search"
            />
            {searchInput.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchInput(''); setSearchResults([]); }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* YENİ KART AÇ KISAYOLU */}
          <TouchableOpacity
            onPress={() => openNewCardModal(searchInput, true)}
            style={{
              paddingHorizontal: 14,
              height: 46,
              borderRadius: 14,
              backgroundColor: colors.orange,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              shadowColor: colors.orange,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4
            }}
          >
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>Yeni Kart</Text>
          </TouchableOpacity>
        </View>

        {/* ARAMA SONUÇLARI LİSTESİ (Varsa) */}
        {searchResults.length > 0 && (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            padding: 8,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, marginBottom: 6, paddingHorizontal: 6 }}>
              Arama Sonuçları ({searchResults.length})
            </Text>
            {searchResults.map((item, idx) => (
              <TouchableOpacity
                key={item.barcode || item.stock_code || idx}
                onPress={() => openItemAddModal(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderBottomWidth: idx === searchResults.length - 1 ? 0 : 1,
                  borderColor: colors.border
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{item.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>{item.stock_code} • {item.barcode}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.primary }}>{formatPrice(item.price || 0)} TL</Text>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>{item.unit || 'ADET'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* 5. FATURA KALEMLERİ LİSTESİ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: colors.text, letterSpacing: -0.2 }}>
            FATURA KALEMLERİ ({faturaCart.length})
          </Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
            Toplam: {toplamAdet} {faturaCart[0]?.unit || 'Adet'}
          </Text>
        </View>

        {faturaCart.length === 0 ? (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 30,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            marginTop: 10
          }}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Ionicons name="cart-outline" size={32} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 }}>Fatura Henüz Boş</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 }}>
              Ürün eklemek için barkod okutun veya arayın.{'\n'}
              Sistemde olmayan ürünler için anında <Text style={{ color: colors.orange, fontWeight: '800' }}>Yeni Kart Aç</Text> butonunu kullanabilirsiniz.
            </Text>
          </View>
        ) : (
          faturaCart.map((item, index) => (
            <View
              key={item.id || index}
              style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 8
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <View style={{ backgroundColor: colors.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: colors.primary }}>#{index + 1}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, flex: 1 }} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '600' }}>
                    {item.stock_code} • {item.barcode}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => removeItemFromCart(item.id)}
                  style={{ padding: 6, borderRadius: 8, backgroundColor: colors.dangerSoft }}
                >
                  <Ionicons name="trash" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>

              {/* Fiyat ve Adet Satırı */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 8,
                borderTopWidth: 1,
                borderColor: colors.border,
                marginTop: 4
              }}>
                {/* Stepper (+ / -) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardLow, borderRadius: 10, padding: 2, borderWidth: 1, borderColor: colors.border }}>
                  <TouchableOpacity
                    onPress={() => changeItemQty(item.id, -1)}
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="remove" size={16} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.text, paddingHorizontal: 10 }}>
                    {item.miktar} <Text style={{ fontSize: 9, color: colors.textMuted }}>{item.unit}</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => changeItemQty(item.id, 1)}
                    style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="add" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Fiyat Bilgileri */}
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>
                    {formatPrice(item.birim_fiyat)} TL x {item.miktar} (+%{item.kdv_orani} KDV)
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary }}>
                    {formatPrice(item.toplam_tutar)} TL
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* 6. ALT SABİT FATURA ÖZETİ & KAYDET BUTONU */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.card,
        borderTopWidth: 1.5,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 22,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 15
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted }}>
              {faturaCart.length} Kalem • {toplamAdet} Adet
            </Text>
            <Text style={{ fontSize: 10, color: colors.textMuted }}>
              Ara: {formatPrice(araToplam)} TL | KDV: {formatPrice(kdvToplam)} TL
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 }}>GENEL TOPLAM</Text>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.primary }}>
              {formatPrice(genelToplam)} TL
            </Text>
          </View>
        </View>

        <TouchableOpacity
          disabled={isSavingFatura || faturaCart.length === 0}
          onPress={handleSaveInvoice}
          style={{
            height: 50,
            borderRadius: 16,
            backgroundColor: faturaCart.length === 0 ? colors.border : colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: faturaCart.length === 0 ? 0 : 0.3,
            shadowRadius: 8,
            elevation: faturaCart.length === 0 ? 0 : 5
          }}
        >
          {isSavingFatura ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>Mikro ERP'ye Aktarılıyor...</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>FATURAYI MİKRO ERP'YE KAYDET</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* KALEM DETAYI & EKLEME MODALI */}
      <Modal
        isVisible={showItemAddModal}
        onBackdropPress={() => setShowItemAddModal(false)}
        style={{ justifyContent: 'center', margin: 16 }}
        avoidKeyboard={true}
      >
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>FATURAYA KALEM EKLE</Text>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.text }} numberOfLines={2}>
                {selectedProductForAdd?.name}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                {selectedProductForAdd?.stock_code} • {selectedProductForAdd?.barcode}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowItemAddModal(false)}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Miktar */}
          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, marginBottom: 4, marginTop: 6 }}>
            MİKTAR ({selectedProductForAdd?.unit || 'ADET'}) *
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => {
                const current = parseFloat(itemQty.replace(',', '.')) || 1;
                setItemQty(Math.max(1, current - 1).toString());
              }}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.cardLow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="remove" size={20} color={colors.text} />
            </TouchableOpacity>

            <TextInput
              style={{
                flex: 1,
                height: 44,
                backgroundColor: colors.cardLow,
                borderRadius: 12,
                color: colors.text,
                fontSize: 18,
                fontWeight: '900',
                textAlign: 'center',
                borderWidth: 1,
                borderColor: colors.border
              }}
              value={itemQty}
              onChangeText={setItemQty}
              keyboardType="numeric"
            />

            <TouchableOpacity
              onPress={() => {
                const current = parseFloat(itemQty.replace(',', '.')) || 1;
                setItemQty((current + 1).toString());
              }}
              style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.cardLow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="add" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Alış Birim Fiyatı */}
          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, marginBottom: 4 }}>
            ALIŞ BİRİM FİYATI (KDV HARİÇ TL) *
          </Text>
          <View style={{
            height: 46,
            backgroundColor: colors.cardLow,
            borderRadius: 12,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12
          }}>
            <Ionicons name="cash-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' }}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={itemPrice}
              onChangeText={setItemPrice}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted }}>TL</Text>
          </View>

          {/* KDV Oranı */}
          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted, marginBottom: 6 }}>
            KDV ORANI
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[1, 10, 20].map((vat) => (
              <TouchableOpacity
                key={vat}
                onPress={() => setItemVat(vat)}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: itemVat === vat ? colors.primary : colors.border,
                  backgroundColor: itemVat === vat ? colors.primarySoft : colors.cardLow,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '900', color: itemVat === vat ? colors.primary : colors.text }}>
                  %{vat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Canlı Hesap Özeti */}
          {(() => {
            const q = parseFloat(itemQty.replace(',', '.')) || 0;
            const p = parseFloat(itemPrice.replace(',', '.')) || 0;
            const tut = q * p;
            const kdv = tut * (itemVat / 100);
            const top = tut + kdv;
            return (
              <View style={{ backgroundColor: colors.cardLow, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>Ara Toplam:</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>{formatPrice(tut)} TL</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>KDV Tutarı (%{itemVat}):</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>{formatPrice(kdv)} TL</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: colors.text }}>Satır Toplamı:</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary }}>{formatPrice(top)} TL</Text>
                </View>
              </View>
            );
          })()}

          {/* Ekle Butonu */}
          <TouchableOpacity
            onPress={handleAddItemToCart}
            style={{
              height: 48,
              borderRadius: 14,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4
            }}
          >
            <Ionicons name="cart" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>FATURAYA EKLE</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* TEDARİKÇİ (CARİ) SEÇİM MODALI */}
      <Modal
        isVisible={showCariModal}
        onBackdropPress={() => setShowCariModal(false)}
        style={{ justifyContent: 'center', margin: 16 }}
        avoidKeyboard={true}
      >
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 24,
          padding: 18,
          maxHeight: '85%',
          borderWidth: 1,
          borderColor: colors.border
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text }}>Tedarikçi Seçin</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>Mikro ERP Cari Hesaplar</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCariModal(false)}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Arama Input */}
          <View style={{
            height: 44,
            backgroundColor: colors.cardLow,
            borderRadius: 12,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 10
          }}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }}
              placeholder="Firma Adı veya Cari Kod Ara..."
              placeholderTextColor={colors.textMuted}
              value={cariSearchQuery}
              onChangeText={handleCariSearch}
              autoCapitalize="characters"
              autoFocus={true}
            />
            {isSearchingCari && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          <FlatList
            data={cariResults}
            keyExtractor={(item) => item.cari_kod}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => selectCari(item)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: colors.cardLow,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{item.cari_unvan1}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>{item.cari_kod}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: (item.bakiye || 0) < 0 ? colors.primary : ((item.bakiye || 0) > 0 ? colors.danger : colors.textMuted) }}>
                    {formatPrice(Math.abs(item.bakiye || 0))} TL {(item.bakiye || 0) < 0 ? '(Alacaklı)' : ((item.bakiye || 0) > 0 ? '(Borçlu)' : '')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Ionicons name="business-outline" size={38} color={colors.textMuted} style={{ opacity: 0.5, marginBottom: 8 }} />
                <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
                  {cariSearchQuery.length < 2 ? 'Aramak istediğiniz firmanın adını veya cari kodunu yazın.' : 'Aramanızla eşleşen cari bulunamadı.'}
                </Text>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* DEPO SEÇİM MODALI */}
      <Modal
        isVisible={showDepoPicker}
        onBackdropPress={() => setShowDepoPicker(false)}
        style={{ justifyContent: 'center', margin: 20 }}
      >
        <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 12 }}>Giriş Deposunu Seçin</Text>
          {depos.map((d) => (
            <TouchableOpacity
              key={d.depo_no}
              onPress={() => {
                setFaturaDepo(d);
                setShowDepoPicker(false);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: faturaDepo?.depo_no === d.depo_no ? colors.primarySoft : colors.cardLow,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: faturaDepo?.depo_no === d.depo_no ? colors.primary : colors.border
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                {d.depo_no} - {d.depo_adi}
              </Text>
              {faturaDepo?.depo_no === d.depo_no && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}
