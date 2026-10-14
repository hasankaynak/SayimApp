import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';

interface FiyatDegisiklikViewProps {
  isDark: boolean;
  isConnected: boolean;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  mikroUserNo: string;
  formatPrice: (p: number) => string;
  playSound: (type: 'beep' | 'success' | 'error') => void;
  onBackToMenu: () => void;
  onOpenUserSelect?: () => void;
  mikroUsersList?: any[];
}

interface PriceChangeItem {
  stock_code: string;
  name: string;
  barcode: string;
  unit: string;
  fiyat_no: number;
  fiyat_adi: string;
  eski_fiyat: number;
  yeni_fiyat: number;
  doviz: number;
}

export default function FiyatDegisiklikView({
  isDark,
  isConnected,
  dbRef,
  API_URL,
  mikroUserNo,
  formatPrice,
  playSound,
  onBackToMenu,
  onOpenUserSelect,
  mikroUsersList = [],
}: FiyatDegisiklikViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const isScanningRef = useRef(false);

  // Fiş başlık alanları
  const [evrakSeri, setEvrakSeri] = useState('');
  const [selectedFiyatNo, setSelectedFiyatNo] = useState(1);
  const fiyatListeleri = [
    { no: 1, name: 'SATIŞ FİYATI' },
    { no: 2, name: 'TOPTAN SATIŞ' },
    { no: 3, name: 'USD SATIŞ' },
  ];

  // Arama & Seçili Ürün
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [newPriceInput, setNewPriceInput] = useState('');

  // Fiş Sepeti
  const [cartItems, setCartItems] = useState<PriceChangeItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const colors = {
    bg: isDark ? '#0B1C30' : '#F4F6FB',
    card: isDark ? '#14273E' : '#FFFFFF',
    text: isDark ? '#F1F5F9' : '#0F172A',
    textMuted: isDark ? '#8A9AB5' : '#64748B',
    border: isDark ? '#223854' : '#E2E8F0',
    primary: '#FF6B00',
    success: '#00AE78',
    danger: '#EF4444',
    accent: '#3B82F6',
  };

  // Aktif kullanıcı adı bul
  const currentUserObj = mikroUsersList.find(u => String(u.KULLANICI_NO) === String(mikroUserNo));
  const currentUserName = currentUserObj ? currentUserObj.KULLANICI_ADI : `Kullanıcı ${mikroUserNo}`;

  // Ürün Arama (Yerel SQLite + Gerekirse Canlı Mikro)
  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text || text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const q = text.trim();
      const db = dbRef.current;
      let localMatches: any[] = [];

      if (db) {
        try {
          localMatches = await db.getAllAsync(
            `SELECT barcode, stock_code, name, price, unit FROM products 
             WHERE barcode = ? OR stock_code LIKE ? OR name LIKE ? 
             LIMIT 20`,
            [q, `%${q}%`, `%${q}%`]
          );
        } catch (e) {
          console.log('Local search error:', e);
        }
      }

      if (localMatches.length > 0) {
        setSearchResults(localMatches);
      } else if (isConnected) {
        // Canlı Mikro Araması
        const sql = `
          SELECT TOP 15 
            ISNULL(bt.bar_kodu, '') as barcode,
            s.sto_kod as stock_code,
            s.sto_isim as name,
            s.sto_birim1_ad as unit,
            ISNULL(sfl.sfiyat_fiyati, 0) as price
          FROM STOKLAR s WITH (NOLOCK)
          LEFT OUTER JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON s.sto_kod = bt.bar_stokkodu
          LEFT OUTER JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) 
            ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = ${selectedFiyatNo}
          WHERE s.sto_kod LIKE '%${q.replace(/'/g, "''")}%' 
             OR s.sto_isim LIKE '%${q.replace(/'/g, "''")}%' 
             OR bt.bar_kodu = '${q.replace(/'/g, "''")}'
        `;
        const res = await axios.post(API_URL, { query: sql }, { timeout: 8000 });
        if (res.data?.success && res.data?.data) {
          setSearchResults(res.data.data);
        }
      }
    } catch (err) {
      console.log('Arama hatası:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Ürün Seçildiğinde Fiyat Bilgisini Çek
  const handleSelectProduct = async (item: any) => {
    setSearchResults([]);
    setSearchQuery('');
    setSelectedProduct(item);

    // Canlı Mikro'dan o fiyat listesindeki güncel fiyatı çek
    let currentPrice = item.price || 0;
    if (isConnected) {
      try {
        const q = `
          SELECT TOP 1 sfiyat_fiyati 
          FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK)
          WHERE sfiyat_stokkod = '${item.stock_code.replace(/'/g, "''")}' 
            AND sfiyat_listesirano = ${selectedFiyatNo}
        `;
        const res = await axios.post(API_URL, { query: q }, { timeout: 5000 });
        if (res.data?.data && res.data.data.length > 0) {
          currentPrice = Number(res.data.data[0].sfiyat_fiyati) || 0;
        }
      } catch (e) {
        console.log('Güncel fiyat çekme hatası:', e);
      }
    }

    const updated = { ...item, price: currentPrice };
    setSelectedProduct(updated);
    setNewPriceInput(currentPrice > 0 ? String(currentPrice) : '');
  };

  // Barkod Okutulduğunda
  const onBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    playSound('beep');

    setIsCameraActive(false);

    const scannedBarcode = data.trim();
    setSearchQuery(scannedBarcode);

    // Ürünü bul
    const db = dbRef.current;
    let foundItem: any = null;

    if (db) {
      try {
        const res = await db.getAllAsync(
          `SELECT barcode, stock_code, name, price, unit FROM products WHERE barcode = ? LIMIT 1`,
          [scannedBarcode]
        );
        if (res && res.length > 0) foundItem = res[0];
      } catch (e) {}
    }

    if (!foundItem && isConnected) {
      try {
        const sql = `
          SELECT TOP 1 
            ISNULL(bt.bar_kodu, '${scannedBarcode}') as barcode,
            s.sto_kod as stock_code,
            s.sto_isim as name,
            s.sto_birim1_ad as unit,
            ISNULL(sfl.sfiyat_fiyati, 0) as price
          FROM BARKOD_TANIMLARI bt WITH (NOLOCK)
          INNER JOIN STOKLAR s WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod
          LEFT OUTER JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) 
            ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = ${selectedFiyatNo}
          WHERE bt.bar_kodu = '${scannedBarcode.replace(/'/g, "''")}'
        `;
        const res = await axios.post(API_URL, { query: sql }, { timeout: 6000 });
        if (res.data?.data && res.data.data.length > 0) {
          foundItem = res.data.data[0];
        }
      } catch (e) {}
    }

    if (foundItem) {
      handleSelectProduct(foundItem);
      playSound('success');
    } else {
      playSound('error');
      Alert.alert('Ürün Bulunamadı', `Okutulan barkoda (${scannedBarcode}) ait stok bulunamadı.`);
    }

    setTimeout(() => {
      isScanningRef.current = false;
    }, 1200);
  };

  // Hızlı Yüzde Değiştirici
  const applyPercentage = (percent: number) => {
    if (!selectedProduct) return;
    const oldPrice = Number(selectedProduct.price) || 0;
    if (oldPrice <= 0) return;
    const calculated = oldPrice * (1 + percent / 100);
    setNewPriceInput(calculated.toFixed(2));
  };

  // Sepete / Fişe Ekle
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const newPrice = parseFloat(newPriceInput.replace(',', '.'));

    if (isNaN(newPrice) || newPrice < 0) {
      Alert.alert('Geçersiz Fiyat', 'Lütfen geçerli bir yeni fiyat girin.');
      return;
    }

    const currentFiyatAdi = fiyatListeleri.find(f => f.no === selectedFiyatNo)?.name || `Fiyat ${selectedFiyatNo}`;

    // Listede zaten varsa güncelle, yoksa ekle
    setCartItems(prev => {
      const idx = prev.findIndex(
        p => p.stock_code === selectedProduct.stock_code && p.fiyat_no === selectedFiyatNo
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          yeni_fiyat: newPrice,
        };
        return copy;
      }
      return [
        ...prev,
        {
          stock_code: selectedProduct.stock_code,
          name: selectedProduct.name,
          barcode: selectedProduct.barcode || '',
          unit: selectedProduct.unit || 'ADET',
          fiyat_no: selectedFiyatNo,
          fiyat_adi: currentFiyatAdi,
          eski_fiyat: Number(selectedProduct.price) || 0,
          yeni_fiyat: newPrice,
          doviz: 0,
        },
      ];
    });

    playSound('success');
    ToastAndroid.show(`${selectedProduct.name} fiş listesine eklendi!`, ToastAndroid.SHORT);
    setSelectedProduct(null);
    setNewPriceInput('');
  };

  // Fişten Satır Sil
  const handleRemoveFromCart = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  // Fişi Mikro ERP'ye Gönder (Menü 031200)
  const handleSubmitFiyatFisi = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Uyarı', 'Fişe eklenmiş herhangi bir ürün bulunmuyor.');
      return;
    }

    const userNum = parseInt(mikroUserNo, 10) || 7;

    Alert.alert(
      'Fiyat Değişiklik Fişi Onayı',
      `Seri: "${evrakSeri}"\nKalem Sayısı: ${cartItems.length}\nKayıt Yapan Kullanıcı: ${currentUserName} (ID: ${userNum})\n\nBu fiyat değişikliği Mikro ERP'ye aktarılsın mı?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: '✅ Evet, Aktar',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // 1. Sıradaki evrak sıra no al
              const seqSql = `
                SELECT ISNULL(MAX(fid_evrak_sira_no), 0) + 1 AS NextSira 
                FROM STOK_FIYAT_DEGISIKLIKLERI WITH (NOLOCK) 
                WHERE fid_evrak_seri_no = '${evrakSeri.replace(/'/g, "''")}'
              `;
              const seqRes = await axios.post(API_URL, { query: seqSql }, { timeout: 8000 });
              const nextSira = seqRes.data?.data?.[0]?.NextSira || 1;

              // 2. Atomik Transaction SQL Hazırla
              let sql = `
                BEGIN TRANSACTION;
                DECLARE @Now datetime = GETDATE();
                DECLARE @Tarih datetime = CAST(CONVERT(varchar, GETDATE(), 112) AS datetime);
                DECLARE @NextSira int = ${nextSira};
              `;

              cartItems.forEach((item, idx) => {
                const sKod = item.stock_code.replace(/'/g, "''");
                // STOK_FIYAT_DEGISIKLIKLERI Insert
                sql += `
                  INSERT INTO STOK_FIYAT_DEGISIKLIKLERI (
                    fid_Guid, fid_DBCno, fid_SpecRecNo, fid_iptal, fid_fileid, fid_hidden, fid_kilitli, fid_degisti, fid_checksum,
                    fid_create_user, fid_create_date, fid_lastup_user, fid_lastup_date,
                    fid_special1, fid_special2, fid_special3,
                    fid_MainProgramNo, fid_VersionNo, fid_MenuNo,
                    fid_MikroSpecial1, fid_MikroSpecial2, fid_MikroSpecial3,
                    fid_ExternalProgramType, fid_ExternalProgramId, fid_Hash,
                    fid_evrak_satir_no, fid_evrak_seri_no, fid_evrak_sira_no, fid_evrak_tarih,
                    fid_belge_no, fid_belge_tarih, fid_stok_kod, fid_tarih, fid_saat,
                    fid_fiyat_deg_neden, fid_fiyat_no, fid_eskifiy_tutar, fid_eskifiy_doviz,
                    fid_eskifiy_iskonto, fid_eskifiy_opno, fid_yenifiy_tutar, fid_yenifiy_doviz,
                    fid_yenifiy_iskonto, fid_yenifiy_opno, fid_yapildi_fl, fid_eski_karorani,
                    fid_yeni_karorani, fid_depo_no, fid_prof_uid, fid_birim_pntr
                  ) VALUES (
                    NEWID(), 0, 0, 0, 17, 0, 0, 0, 0,
                    ${userNum}, @Now, ${userNum}, @Now,
                    '', '', '',
                    21, '17.05d', '31200',
                    '', '', '',
                    0, '', 0,
                    ${idx}, '${evrakSeri.replace(/'/g, "''")}', @NextSira, @Tarih,
                    '', @Tarih, '${sKod}', @Tarih, DATEPART(hour, @Now),
                    0, ${item.fiyat_no}, ${item.eski_fiyat}, 0,
                    '', 0, ${item.yeni_fiyat}, 0,
                    '', 0, 1, 0,
                    0, 0, '00000000-0000-0000-0000-000000000000', 1
                  );

                  -- STOK_SATIS_FIYAT_LISTELERI Güncelle veya Ekle
                  IF EXISTS (SELECT 1 FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK) WHERE sfiyat_stokkod = '${sKod}' AND sfiyat_listesirano = ${item.fiyat_no})
                  BEGIN
                    UPDATE STOK_SATIS_FIYAT_LISTELERI
                    SET sfiyat_fiyati = ${item.yeni_fiyat},
                        sfiyat_lastup_user = ${userNum},
                        sfiyat_lastup_date = @Now,
                        sfiyat_MenuNo = '31200'
                    WHERE sfiyat_stokkod = '${sKod}' AND sfiyat_listesirano = ${item.fiyat_no};
                  END
                  ELSE
                  BEGIN
                    INSERT INTO STOK_SATIS_FIYAT_LISTELERI (
                      sfiyat_Guid, sfiyat_DBCno, sfiyat_create_date, sfiyat_create_user,
                      sfiyat_lastup_date, sfiyat_lastup_user, sfiyat_fileid, sfiyat_MainProgramNo, sfiyat_VersionNo, sfiyat_MenuNo,
                      sfiyat_stokkod, sfiyat_listesirano, sfiyat_deposirano, sfiyat_odemeplan,
                      sfiyat_birim_pntr, sfiyat_fiyati, sfiyat_doviz, sfiyat_degisti
                    ) VALUES (
                      NEWID(), 0, @Now, ${userNum},
                      @Now, ${userNum}, 228, 21, '17.05d', '31200',
                      '${sKod}', ${item.fiyat_no}, 0, 0,
                      1, ${item.yeni_fiyat}, 0, 0
                    );
                  END
                `;
              });

              sql += `
                COMMIT TRANSACTION;
                SELECT @NextSira AS inserted_sira;
              `;

              const transRes = await axios.post(API_URL, { query: sql }, { timeout: 20000 });

              if (transRes.data?.success) {
                // 3. Yerel SQLite Güncellemesi (Fiyat Gör'de anında yeni fiyat çıksın)
                const db = dbRef.current;
                if (db) {
                  try {
                    for (const it of cartItems) {
                      if (it.fiyat_no === 1) {
                        await db.runAsync(
                          `UPDATE products SET price = ? WHERE stock_code = ?`,
                          [it.yeni_fiyat, it.stock_code]
                        );
                      }
                    }
                  } catch (sqErr) {
                    console.log('SQLite update error:', sqErr);
                  }
                }

                playSound('success');
                Alert.alert(
                  '✅ Başarılı!',
                  `Fiyat Değişiklik Fişi Mikro'ya aktarıldı!\n\nEvrak Seri: "${evrakSeri}"\nEvrak Sıra: ${nextSira}\nKullanıcı: ${currentUserName}\nKalem Sayısı: ${cartItems.length}`
                );
                setCartItems([]);
              } else {
                throw new Error(transRes.data?.error || 'Mikro aktarımı başarısız oldu.');
              }
            } catch (err: any) {
              playSound('error');
              Alert.alert('Aktarım Hatası', err.response?.data?.error || err.message || 'Bilinmeyen hata');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.bg }]}
    >
      {/* HEADER */}
      <View style={[styles.headerBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={onBackToMenu}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>FİYAT DEĞİŞİKLİĞİ</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Mikro Menü 031200 Fiş Girişi</Text>
        </View>

        {/* AKTİF KULLANICI ROZETİ */}
        <TouchableOpacity
          onPress={onOpenUserSelect}
          style={[styles.userBadge, { backgroundColor: isDark ? 'rgba(0,174,120,0.15)' : '#E6F7F2' }]}
        >
          <Ionicons name="person-circle" size={18} color={colors.success} />
          <Text style={[styles.userBadgeText, { color: colors.success }]}>
            {currentUserName} ({mikroUserNo})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* SERİ VE FİYAT LİSTESİ SEÇİCİ */}
        <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={[styles.panelTitle, { color: colors.text }]}>Fiş Ayarları</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>Seri:</Text>
              <TextInput
                style={[
                  styles.seriInput,
                  {
                    backgroundColor: isDark ? '#1C334D' : '#F1F5F9',
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={evrakSeri}
                onChangeText={setEvrakSeri}
                placeholder="Boş"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={4}
              />
            </View>
          </View>

          {/* FİYAT LİSTELERİ SEÇİM CHIPS */}
          <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700', marginBottom: 6 }}>
            HEDEF FİYAT LİSTESİ:
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {fiyatListeleri.map(f => {
              const isSelected = selectedFiyatNo === f.no;
              return (
                <TouchableOpacity
                  key={f.no}
                  onPress={() => setSelectedFiyatNo(f.no)}
                  style={[
                    styles.fiyatChip,
                    {
                      backgroundColor: isSelected ? colors.primary : isDark ? '#1C334D' : '#F1F5F9',
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isSelected ? '#fff' : colors.text,
                    }}
                  >
                    {f.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ÜRÜN ARAMA & BARKOD OKUTMA BAR */}
        <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: isDark ? '#1C334D' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Barkod / Stok Kodu / İsim Ara..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="characters"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
              onPress={async () => {
                if (!permission?.granted) {
                  const res = await requestPermission();
                  if (!res.granted) {
                    Alert.alert('Kamera İzni Gerekli', 'Barkod taramak için kamera izni vermelisiniz.');
                    return;
                  }
                }
                setIsCameraActive(true);
              }}
            >
              <Ionicons name="camera" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Arama Sonuç Listesi */}
          {isSearching && (
            <View style={{ padding: 12, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          )}

          {searchResults.length > 0 && (
            <View style={[styles.resultsContainer, { borderColor: colors.border }]}>
              {searchResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSelectProduct(item)}
                  style={[styles.resultItem, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      Kod: {item.stock_code} {item.barcode ? `• Barkod: ${item.barcode}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 15 }}>
                    {formatPrice(Number(item.price) || 0)} ₺
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* SEÇİLİ ÜRÜN KARTI VE FİYAT GÜNCELLEME ALANI */}
        {selectedProduct && (
          <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                  {selectedProduct.name}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                  Kod: {selectedProduct.stock_code} • {selectedProduct.unit || 'ADET'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                <Ionicons name="close-circle" size={24} color={colors.danger} />
              </TouchableOpacity>
            </View>

            {/* ESKİ FİYAT VE YENİ FİYAT GİRİŞİ */}
            <View style={styles.priceRowContainer}>
              <View style={styles.priceCol}>
                <Text style={styles.priceLabel}>MEVCUT FİYAT</Text>
                <Text style={[styles.priceValueOld, { color: colors.textMuted }]}>
                  {formatPrice(Number(selectedProduct.price) || 0)} ₺
                </Text>
              </View>

              <Ionicons name="arrow-forward" size={24} color={colors.primary} style={{ alignSelf: 'center', marginTop: 12 }} />

              <View style={styles.priceCol}>
                <Text style={[styles.priceLabel, { color: colors.primary }]}>YENİ FİYAT (₺)</Text>
                <TextInput
                  style={[
                    styles.newPriceInput,
                    {
                      backgroundColor: isDark ? '#1C334D' : '#F1F5F9',
                      color: colors.text,
                      borderColor: colors.primary,
                    },
                  ]}
                  value={newPriceInput}
                  onChangeText={setNewPriceInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  autoFocus={true}
                />
              </View>
            </View>

            {/* FARK VE ORAN BİLGİSİ */}
            {(() => {
              const oldP = Number(selectedProduct.price) || 0;
              const newP = parseFloat(newPriceInput.replace(',', '.')) || 0;
              const diff = newP - oldP;
              const pct = oldP > 0 ? ((diff / oldP) * 100).toFixed(1) : '100';

              if (newP > 0 && diff !== 0) {
                const isInc = diff > 0;
                return (
                  <View
                    style={[
                      styles.diffBadge,
                      {
                        backgroundColor: isInc ? 'rgba(0,174,120,0.12)' : 'rgba(239,68,68,0.12)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={isInc ? 'trending-up' : 'trending-down'}
                      size={16}
                      color={isInc ? colors.success : colors.danger}
                    />
                    <Text
                      style={{
                        color: isInc ? colors.success : colors.danger,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {isInc ? `+${formatPrice(diff)} ₺ (+${pct}%) Artış` : `${formatPrice(diff)} ₺ (${pct}%) İndirim`}
                    </Text>
                  </View>
                );
              }
              return null;
            })()}

            {/* HIZLI YÜZDE BUTONLARI */}
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 6 }}>
                HIZLI ORAN UYGULA:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[-10, -5, 5, 10, 15, 20, 25, 30].map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => applyPercentage(p)}
                    style={[
                      styles.pctBtn,
                      {
                        backgroundColor: p > 0 ? 'rgba(0,174,120,0.1)' : 'rgba(239,68,68,0.1)',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: p > 0 ? colors.success : colors.danger }}>
                      {p > 0 ? `+${p}%` : `${p}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* SEPETE EKLE BUTONU */}
            <TouchableOpacity
              onPress={handleAddToCart}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addBtnText}>Fiş Listesine Ekle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* FİŞ LİSTESİ / SEPET */}
        <View style={[styles.panelCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 30 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="list" size={18} color={colors.primary} />
              <Text style={[styles.panelTitle, { color: colors.text }]}>
                Fiyat Değişiklik Listesi ({cartItems.length})
              </Text>
            </View>

            {cartItems.length > 0 && (
              <TouchableOpacity onPress={() => setCartItems([])}>
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Temizle</Text>
              </TouchableOpacity>
            )}
          </View>

          {cartItems.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="pricetag-outline" size={44} color={colors.textMuted} style={{ opacity: 0.5 }} />
              <Text style={{ color: colors.textMuted, marginTop: 8, fontSize: 13, textAlign: 'center' }}>
                Henüz fişe eklenmiş ürün yok.{'\n'}Yukarıdan barkod okutarak veya arayarak ürün ekleyin.
              </Text>
            </View>
          ) : (
            <View>
              {cartItems.map((item, idx) => {
                const diff = item.yeni_fiyat - item.eski_fiyat;
                const isInc = diff >= 0;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.cartItemRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14 }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {item.stock_code} • {item.fiyat_adi}
                      </Text>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                          {formatPrice(item.eski_fiyat)} ₺
                        </Text>
                        <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>
                          {formatPrice(item.yeni_fiyat)} ₺
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isInc ? colors.success : colors.danger,
                          }}
                        >
                          ({isInc ? '+' : ''}{formatPrice(diff)} ₺)
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleRemoveFromCart(idx)}
                      style={styles.cartRemoveBtn}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* GÖNDER BUTONU */}
              <TouchableOpacity
                onPress={handleSubmitFiyatFisi}
                disabled={isSubmitting}
                style={[
                  styles.submitBtn,
                  { backgroundColor: colors.success, opacity: isSubmitting ? 0.7 : 1 },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={22} color="#fff" />
                    <Text style={styles.submitBtnText}>
                      Fişi Mikro'ya Aktar (Menü 031200)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* KAMERA BARKOD OKUYUCU MODAL */}
      <RNModal visible={isCameraActive} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            enableTorch={torchEnabled}
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
            }}
          />

          {/* Kamera Arayüzü */}
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity
                style={styles.cameraCloseBtn}
                onPress={() => setIsCameraActive(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>

              <Text style={styles.cameraTitle}>Fiyat Değişikliği Barkod Tara</Text>

              <TouchableOpacity
                style={styles.cameraTorchBtn}
                onPress={() => setTorchEnabled(prev => !prev)}
              >
                <Ionicons
                  name={torchEnabled ? 'flash' : 'flash-off'}
                  size={24}
                  color={torchEnabled ? '#FFD700' : '#fff'}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.scannerTargetBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>

            <Text style={styles.cameraHint}>Barkodu kutu içine hizalayın</Text>
          </View>
        </View>
      </RNModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBackBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  userBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  panelCard: {
    marginHorizontal: 14,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  seriInput: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 55,
    textAlign: 'center',
  },
  fiyatChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  cameraBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsContainer: {
    marginTop: 10,
    borderTopWidth: 1,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  priceRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  priceCol: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8A9AB5',
    marginBottom: 4,
  },
  priceValueOld: {
    fontSize: 20,
    fontWeight: '800',
    paddingVertical: 8,
  },
  newPriceInput: {
    fontSize: 20,
    fontWeight: '800',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlign: 'center',
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  pctBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cartRemoveBtn: {
    padding: 8,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraTorchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scannerTargetBox: {
    width: 260,
    height: 180,
    alignSelf: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#00AE78',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  cameraHint: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
});
