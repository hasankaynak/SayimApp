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
  ToastAndroid,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Modal from 'react-native-modal';
import axios from 'axios';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type FisType = 'cikis' | 'giris' | 'virman' | 'gecmis';

interface DepoFisleriViewProps {
  isDark: boolean;
  isConnected: boolean;
  dbRef: React.MutableRefObject<any>;
  API_URL: string;
  mikroUserNo: string;
  depos: any[];
  selectedDepo: any;
  formatPrice: (p: number) => string;
  playSound: (type: 'beep' | 'success' | 'error') => void;
  onBackToMenu: () => void;
  onOpenUserSelect?: () => void;
  mikroUsersList?: any[];
}

export interface FisCartItem {
  id: string;
  barcode: string;
  stock_code: string;
  name: string;
  unit: string;
  miktar: number;
  current_stok?: number;
  description?: string;
}

export interface VirmanPairItem {
  id: string;
  // Kaynak (Çıkış)
  source_barcode: string;
  source_stock_code: string;
  source_name: string;
  source_unit: string;
  source_current_stok?: number;
  // Hedef (Giriş)
  target_barcode: string;
  target_stock_code: string;
  target_name: string;
  target_unit: string;
  target_current_stok?: number;
  // Miktar & Açıklama
  miktar: number;
  description: string;
}

export default function DepoFisleriView({
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
  onOpenUserSelect,
  mikroUsersList = [],
}: DepoFisleriViewProps) {
  // Aktif Sekme (012160 Çıkış, 012250 Giriş, 012810 Virman, Geçmiş)
  const [activeTab, setActiveTab] = useState<FisType>('cikis');

  // Depo Seçimi
  const [activeDepo, setActiveDepo] = useState<any>(selectedDepo || (depos && depos[0]) || { depo_no: 1, depo_adi: 'Merkez Depo' });
  const [showDepoModal, setShowDepoModal] = useState(false);
  const [depoSearch, setDepoSearch] = useState('');

  // Evrak Başlık Bilgileri
  const [evrakSeri, setEvrakSeri] = useState('RG');
  const [evrakSira, setEvrakSira] = useState('');
  const [evrakTarih, setEvrakTarih] = useState(() => new Date().toISOString().split('T')[0]);
  const [genelAciklama, setGenelAciklama] = useState('');
  const [isLoadingSeq, setIsLoadingSeq] = useState(false);

  // Kamera & Tarama State
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Ürün Arama & Ekleme State (Çıkış & Giriş için)
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [inputMiktar, setInputMiktar] = useState('1');
  const [itemAciklama, setItemAciklama] = useState('');

  // Sepet / Kalem Listesi (Çıkış & Giriş)
  const [cartItems, setCartItems] = useState<FisCartItem[]>([]);

  // Virman State (Kaynak & Hedef)
  const [virmanPairs, setVirmanPairs] = useState<VirmanPairItem[]>([]);
  const [virmanSourceProduct, setVirmanSourceProduct] = useState<any>(null);
  const [virmanTargetProduct, setVirmanTargetProduct] = useState<any>(null);
  const [virmanMiktar, setVirmanMiktar] = useState('1');
  const [virmanAciklama, setVirmanAciklama] = useState('Barkod / Kod Değişimi');
  const [virmanSelectingSide, setVirmanSelectingSide] = useState<'source' | 'target'>('source');

  // Geçmiş Fişler State
  const [recentFisler, setRecentFisler] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [selectedEvrakDetail, setSelectedEvrakDetail] = useState<any[]>([]);
  const [showEvrakDetailModal, setShowEvrakDetailModal] = useState(false);
  const [detailEvrakTitle, setDetailEvrakTitle] = useState('');

  // Kaydetme Durumu
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Kullanıcı adı
  const currentUserObj = mikroUsersList.find(u => String(u.KULLANICI_NO) === String(mikroUserNo));
  const currentUserName = currentUserObj ? currentUserObj.KULLANICI_ADI : `Kullanıcı ${mikroUserNo}`;

  // Sekme değiştiğinde sayaç no ve seriyi ayarla
  useEffect(() => {
    if (activeTab === 'cikis') {
      setEvrakSeri('RG');
      fetchNextSira(12160, 'RG');
    } else if (activeTab === 'giris') {
      setEvrakSeri('1');
      fetchNextSira(12250, '1');
    } else if (activeTab === 'virman') {
      setEvrakSeri('');
      fetchNextSira(12810, '');
    } else if (activeTab === 'gecmis') {
      fetchRecentFisler();
    }
  }, [activeTab]);

  // Mikro'dan bir sonraki sayaç sırasını çek
  const fetchNextSira = async (menuNo: number, seri: string) => {
    if (!isConnected) return;
    setIsLoadingSeq(true);
    try {
      const q = `
        SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS NextSira
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE sth_MenuNo = ${menuNo} AND sth_evrakno_seri = '${seri.replace(/'/g, "''")}';
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 7000 });
      if (res.data?.data?.[0]?.NextSira) {
        setEvrakSira(String(res.data.data[0].NextSira));
      }
    } catch (e) {
      console.log('Sıra no çekilemedi:', e);
    } finally {
      setIsLoadingSeq(false);
    }
  };

  // Ürünün seçili depodaki canlı stok miktarını getir
  const fetchProductDepoStok = async (stockCode: string, depoNo: number): Promise<number> => {
    try {
      if (isConnected) {
        const q = `
          SELECT ISNULL(SUM(CASE WHEN sth_tip = 0 THEN sth_miktar ELSE -sth_miktar END), 0) as StokMiktar
          FROM STOK_HAREKETLERI WITH (NOLOCK)
          WHERE sth_stok_kod = '${stockCode.replace(/'/g, "''")}' 
            AND (sth_giris_depo_no = ${depoNo} OR sth_cikis_depo_no = ${depoNo});
        `;
        const res = await axios.post(API_URL, { query: q }, { timeout: 7000 });
        if (res.data?.data?.[0]?.StokMiktar !== undefined) {
          return parseFloat(res.data.data[0].StokMiktar) || 0;
        }
      }
      const db = dbRef.current;
      if (db) {
        const local = await db.getAllAsync(
          'SELECT miktar FROM depo_stoklar WHERE stock_code = ? AND depo_no = ?',
          [stockCode, depoNo]
        );
        if (local && local.length > 0) return parseFloat(local[0].miktar) || 0;
      }
    } catch (e) {}
    return 0;
  };

  // Barkod okuma veya arama tetiklendiğinde ürün bulma
  const handleSearchProduct = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) return;
    setIsSearching(true);
    setSearchResults([]);

    try {
      const db = dbRef.current;
      let localItems: any[] = [];
      if (db) {
        localItems = await db.getAllAsync(
          `SELECT stock_code, name, barcode, unit, price FROM products 
           WHERE barcode = ? OR UPPER(stock_code) = ? OR name_normalized LIKE ? LIMIT 20`,
          [clean, clean.toUpperCase(), `%${clean.toLowerCase()}%`]
        );
      }

      if (localItems.length === 1 && (localItems[0].barcode === clean || localItems[0].stock_code === clean.toUpperCase())) {
        // Tam eşleşme: doğrudan seç
        await handleSelectFoundProduct(localItems[0]);
      } else if (localItems.length > 0) {
        setSearchResults(localItems);
      } else if (isConnected) {
        // Sunucuda canlı ara
        const q = `
          SELECT TOP 20 s.sto_kod as stock_code, s.sto_isim as name, bt.bar_kodu as barcode, s.sto_birim1_ad as unit, 0 as price
          FROM STOKLAR s WITH (NOLOCK)
          LEFT JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod
          WHERE bt.bar_kodu = '${clean.replace(/'/g, "''")}' 
             OR s.sto_kod LIKE '${clean.replace(/'/g, "''")}%' 
             OR s.sto_isim LIKE '%${clean.replace(/'/g, "''")}%';
        `;
        const res = await axios.post(API_URL, { query: q }, { timeout: 8000 });
        if (res.data?.data?.length === 1) {
          await handleSelectFoundProduct(res.data.data[0]);
        } else if (res.data?.data?.length > 0) {
          setSearchResults(res.data.data);
        } else {
          playSound('error');
          ToastAndroid.show('Ürün bulunamadı!', ToastAndroid.SHORT);
        }
      } else {
        playSound('error');
        ToastAndroid.show('Ürün bulunamadı!', ToastAndroid.SHORT);
      }
    } catch (e) {
      playSound('error');
    } finally {
      setIsSearching(false);
    }
  };

  // Bulunan ürünü seçme
  const handleSelectFoundProduct = async (item: any) => {
    const currentDepoNo = activeDepo?.depo_no || 1;
    const stokQty = await fetchProductDepoStok(item.stock_code, currentDepoNo);
    const enriched = { ...item, current_stok: stokQty };

    if (activeTab === 'virman') {
      if (virmanSelectingSide === 'source') {
        setVirmanSourceProduct(enriched);
        playSound('beep');
      } else {
        setVirmanTargetProduct(enriched);
        playSound('beep');
      }
    } else {
      setSelectedProduct(enriched);
      setInputMiktar('1');
      playSound('beep');
    }
    setSearchResults([]);
    setSearchInput('');
  };

  // Kamera barkod okuduğunda
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isCameraActive) return;
    setIsCameraActive(false);
    handleSearchProduct(data);
  };

  // Çıkış veya Giriş sepetine kalem ekle
  const handleAddCartItem = () => {
    if (!selectedProduct) {
      Alert.alert('Ürün Seçilmedi', 'Lütfen önce barkod okutun veya ürün arayın.');
      return;
    }
    const miktarNum = parseFloat(inputMiktar.replace(',', '.')) || 0;
    if (miktarNum <= 0) {
      Alert.alert('Hatalı Miktar', 'Lütfen sıfırdan büyük bir miktar girin.');
      return;
    }

    if (activeTab === 'cikis' && selectedProduct.current_stok !== undefined && miktarNum > selectedProduct.current_stok) {
      Alert.alert(
        'Depo Stok Uyarısı',
        `Seçili depoda (${activeDepo?.depo_adi || activeDepo?.depo_no}) mevcut stok: ${selectedProduct.current_stok} ${selectedProduct.unit || 'ADET'}.\n\nGirilen çıkış miktarı (${miktarNum}) mevcut stoktan fazladır. Devam etmek istiyor musunuz?`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Yine de Ekle',
            onPress: () => commitAddItem(miktarNum),
          },
        ]
      );
      return;
    }

    commitAddItem(miktarNum);
  };

  const commitAddItem = (miktarNum: number) => {
    const existingIndex = cartItems.findIndex(c => c.stock_code === selectedProduct.stock_code);
    if (existingIndex >= 0) {
      const updated = [...cartItems];
      updated[existingIndex].miktar += miktarNum;
      if (itemAciklama) updated[existingIndex].description = itemAciklama;
      setCartItems(updated);
    } else {
      setCartItems([
        ...cartItems,
        {
          id: `${selectedProduct.stock_code}_${Date.now()}`,
          barcode: selectedProduct.barcode || '',
          stock_code: selectedProduct.stock_code,
          name: selectedProduct.name,
          unit: selectedProduct.unit || 'ADET',
          miktar: miktarNum,
          current_stok: selectedProduct.current_stok,
          description: itemAciklama,
        },
      ]);
    }
    playSound('success');
    setSelectedProduct(null);
    setInputMiktar('1');
    setItemAciklama('');
  };

  // Virman Çifti Ekle
  const handleAddVirmanPair = () => {
    if (!virmanSourceProduct) {
      Alert.alert('Kaynak Ürün Eksik', 'Lütfen çıkış yapılacak (stoğu düşecek) kaynak ürünü seçin.');
      return;
    }
    if (!virmanTargetProduct) {
      Alert.alert('Hedef Ürün Eksik', 'Lütfen giriş yapılacak (stoğu artacak) hedef ürünü seçin.');
      return;
    }
    if (virmanSourceProduct.stock_code === virmanTargetProduct.stock_code) {
      Alert.alert('Aynı Ürün Seçildi', 'Kaynak ürün ve hedef ürün aynı olamaz! Lütfen farklı iki stok seçin.');
      return;
    }
    const miktarNum = parseFloat(virmanMiktar.replace(',', '.')) || 0;
    if (miktarNum <= 0) {
      Alert.alert('Hatalı Miktar', 'Lütfen sıfırdan büyük bir virman miktarı girin.');
      return;
    }

    setVirmanPairs([
      ...virmanPairs,
      {
        id: `virman_${Date.now()}`,
        source_barcode: virmanSourceProduct.barcode || '',
        source_stock_code: virmanSourceProduct.stock_code,
        source_name: virmanSourceProduct.name,
        source_unit: virmanSourceProduct.unit || 'ADET',
        source_current_stok: virmanSourceProduct.current_stok,
        target_barcode: virmanTargetProduct.barcode || '',
        target_stock_code: virmanTargetProduct.stock_code,
        target_name: virmanTargetProduct.name,
        target_unit: virmanTargetProduct.unit || 'ADET',
        target_current_stok: virmanTargetProduct.current_stok,
        miktar: miktarNum,
        description: virmanAciklama.trim(),
      },
    ]);
    playSound('success');
    setVirmanSourceProduct(null);
    setVirmanTargetProduct(null);
    setVirmanMiktar('1');
  };

  // MİKRO ERP'YE FİŞ KAYDETME MOTORU (TRANSACTION)
  const handleSubmitFisToMikro = async () => {
    if (!isConnected) {
      Alert.alert('Bağlantı Yok', 'Mikro ERP fişi oluşturmak için internet bağlantısı gereklidir.');
      return;
    }
    const depoNo = activeDepo?.depo_no || 1;
    const userNum = parseInt(mikroUserNo, 10) || 7;
    const targetSeri = evrakSeri.trim();
    const cleanTarih = evrakTarih.replace(/-/g, ''); // YYYYMMDD

    // 1. Sayım Çıkışı (012160) veya Sayım Girişi (012250)
    if (activeTab === 'cikis' || activeTab === 'giris') {
      if (cartItems.length === 0) {
        Alert.alert('Fiş Boş', 'Lütfen en az bir ürün ekleyin.');
        return;
      }

      setIsSubmitting(true);
      try {
        const isCikis = activeTab === 'cikis';
        const menuNo = isCikis ? 12160 : 12250;
        const tipVal = isCikis ? 1 : 0; // 1 = Çıkış, 0 = Giriş
        const cinsVal = 10; // Sayım Fişi Cinsi
        const evrakTipVal = isCikis ? 0 : 12;

        // Sıra noyu tekrar canlı garantiye al
        const seqQ = `SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS NextSira FROM STOK_HAREKETLERI WITH (NOLOCK) WHERE sth_MenuNo = ${menuNo} AND sth_evrakno_seri = '${targetSeri.replace(/'/g, "''")}'`;
        const seqRes = await axios.post(API_URL, { query: seqQ });
        const finalSira = seqRes.data?.data?.[0]?.NextSira || parseInt(evrakSira, 10) || 1;

        let sql = `
          BEGIN TRANSACTION;
          DECLARE @Now datetime = GETDATE();
          DECLARE @Tarih datetime = '${cleanTarih}';
          DECLARE @SiraNo int = ${finalSira};
        `;

        cartItems.forEach((item, index) => {
          const sKod = item.stock_code.replace(/'/g, "''");
          const miktar = item.miktar;
          const aciklama = (item.description || genelAciklama || (isCikis ? 'Sayım Çıkışı' : 'Sayım Girişi')).replace(/'/g, "''");
          const cikisDepo = isCikis ? depoNo : 1;
          const girisDepo = isCikis ? 1 : depoNo;

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
              sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_proje_kodu,
              sth_fis_tarihi, sth_fis_sirano, sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru,
              sth_stok_doviz_cinsi, sth_stok_doviz_kuru, sth_aciklama
            ) VALUES (
              NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
              ${userNum}, @Now, ${userNum}, @Now,
              '', '', '', 21, '17.05d', '${menuNo}',
              '', '', '', 0, '', 0,
              0, 0, @Tarih, ${tipVal}, ${cinsVal}, 0, ${evrakTipVal}, '${targetSeri.replace(/'/g, "''")}',
              @SiraNo, ${index}, '', @Tarih, '${sKod}',
              ${miktar}, ${miktar}, 1, 0, 0,
              ${girisDepo}, ${cikisDepo}, @Tarih,
              '', '', '',
              '1899-12-30', 0, 0, 1, 50,
              0, 1, '${aciklama}'
            );
          `;
        });

        sql += `
          COMMIT TRANSACTION;
          SELECT 1 AS success, @SiraNo AS CreatedSira;
        `;

        const saveRes = await axios.post(API_URL, { query: sql }, { timeout: 25000 });
        if (saveRes.data?.data) {
          playSound('success');
          const fisAdi = isCikis ? 'Sayım Çıkışı Depo Fişi (012160)' : 'Sayım Girişi Depo Fişi (012250)';
          Alert.alert(
            'İşlem Başarılı',
            `Mikro ERP'de ${fisAdi} başarıyla oluşturuldu!\n\nEvrak No: ${targetSeri}-${finalSira}\nDepo: ${activeDepo?.depo_adi || depoNo}\nToplam Kalem: ${cartItems.length}`,
            [{ text: 'Tamam' }]
          );
          setCartItems([]);
          setGenelAciklama('');
          fetchNextSira(menuNo, targetSeri);
        } else {
          throw new Error(saveRes.data?.error || 'Kayıt yanıtı doğrulanamadı.');
        }
      } catch (err: any) {
        playSound('error');
        Alert.alert('Mikro Kayıt Hatası', err.response?.data?.error || err.message || 'Bilinmeyen bir hata oluştu.');
      } finally {
        setIsSubmitting(false);
      }
    }

    // 2. Stok Virman Fişi (012810) - Çift Satırlı Kayıt
    else if (activeTab === 'virman') {
      if (virmanPairs.length === 0) {
        Alert.alert('Virman Listesi Boş', 'Lütfen en az bir adet virman eşleştirmesi ekleyin.');
        return;
      }

      setIsSubmitting(true);
      try {
        const menuNo = 12810;
        const seqQ = `SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS NextSira FROM STOK_HAREKETLERI WITH (NOLOCK) WHERE sth_MenuNo = ${menuNo} AND sth_evrakno_seri = '${targetSeri.replace(/'/g, "''")}'`;
        const seqRes = await axios.post(API_URL, { query: seqQ });
        const finalSira = seqRes.data?.data?.[0]?.NextSira || parseInt(evrakSira, 10) || 1;

        let sql = `
          BEGIN TRANSACTION;
          DECLARE @Now datetime = GETDATE();
          DECLARE @Tarih datetime = '${cleanTarih}';
          DECLARE @SiraNo int = ${finalSira};
        `;

        virmanPairs.forEach((pair, pairIdx) => {
          const srcKod = pair.source_stock_code.replace(/'/g, "''");
          const trgKod = pair.target_stock_code.replace(/'/g, "''");
          const miktar = pair.miktar;
          const lineAciklama = (pair.description || genelAciklama || 'Stok Virman Fişi').replace(/'/g, "''");
          const satirCikis = pairIdx * 2;
          const satirGiris = pairIdx * 2 + 1;

          // Satır 1: Kaynak Ürün Çıkışı (sth_tip = 1, sth_cins = 3, sth_evraktip = 6)
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
              sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_proje_kodu,
              sth_fis_tarihi, sth_fis_sirano, sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru,
              sth_stok_doviz_cinsi, sth_stok_doviz_kuru, sth_aciklama
            ) VALUES (
              NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
              ${userNum}, @Now, ${userNum}, @Now,
              '', '', '', 21, '17.05d', '12810',
              '', '', '', 0, '', 0,
              0, 0, @Tarih, 1, 3, 0, 6, '${targetSeri.replace(/'/g, "''")}',
              @SiraNo, ${satirCikis}, '', @Tarih, '${srcKod}',
              ${miktar}, ${miktar}, 1, 0, 0,
              ${depoNo}, ${depoNo}, @Tarih,
              '', '', '',
              '1899-12-30', 0, 0, 1, 50,
              0, 1, '${lineAciklama}'
            );

            -- Satır 2: Hedef Ürün Girişi (sth_tip = 0, sth_cins = 3, sth_evraktip = 6)
            INSERT INTO STOK_HAREKETLERI (
              sth_Guid, sth_DBCno, sth_SpecRECno, sth_iptal, sth_fileid, sth_hidden, sth_kilitli, sth_degisti, sth_checksum,
              sth_create_user, sth_create_date, sth_lastup_user, sth_lastup_date,
              sth_special1, sth_special2, sth_special3, sth_MainProgramNo, sth_VersionNo, sth_MenuNo,
              sth_MikroSpecial1, sth_MikroSpecial2, sth_MikroSpecial3, sth_ExternalProgramType, sth_ExternalProgramId, sth_Hash,
              sth_firmano, sth_subeno, sth_tarih, sth_tip, sth_cins, sth_normal_iade, sth_evraktip, sth_evrakno_seri,
              sth_evrakno_sira, sth_satirno, sth_belge_no, sth_belge_tarih, sth_stok_kod,
              sth_miktar, sth_miktar2, sth_birim_pntr, sth_birimfiyat, sth_tutar,
              sth_giris_depo_no, sth_cikis_depo_no, sth_malkbl_sevk_tarihi,
              sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_proje_kodu,
              sth_fis_tarihi, sth_fis_sirano, sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru,
              sth_stok_doviz_cinsi, sth_stok_doviz_kuru, sth_aciklama
            ) VALUES (
              NEWID(), 0, 0, 0, 16, 0, 0, 0, 0,
              ${userNum}, @Now, ${userNum}, @Now,
              '', '', '', 21, '17.05d', '12810',
              '', '', '', 0, '', 0,
              0, 0, @Tarih, 0, 3, 0, 6, '${targetSeri.replace(/'/g, "''")}',
              @SiraNo, ${satirGiris}, '', @Tarih, '${trgKod}',
              ${miktar}, ${miktar}, 1, 0, 0,
              ${depoNo}, ${depoNo}, @Tarih,
              '', '', '',
              '1899-12-30', 0, 0, 1, 50,
              0, 1, '${lineAciklama}'
            );
          `;
        });

        sql += `
          COMMIT TRANSACTION;
          SELECT 1 AS success, @SiraNo AS CreatedSira;
        `;

        const saveRes = await axios.post(API_URL, { query: sql }, { timeout: 25000 });
        if (saveRes.data?.data) {
          playSound('success');
          Alert.alert(
            'İşlem Başarılı',
            `Mikro ERP'de Stok Virman Fişi (012810) başarıyla oluşturuldu!\n\nEvrak No: ${targetSeri ? targetSeri + '-' : ''}${finalSira}\nDepo: ${activeDepo?.depo_adi || depoNo}\nToplam Virman Çifti: ${virmanPairs.length}`,
            [{ text: 'Tamam' }]
          );
          setVirmanPairs([]);
          setGenelAciklama('');
          fetchNextSira(menuNo, targetSeri);
        } else {
          throw new Error(saveRes.data?.error || 'Virman kayıt yanıtı doğrulanamadı.');
        }
      } catch (err: any) {
        playSound('error');
        Alert.alert('Mikro Virman Hatası', err.response?.data?.error || err.message || 'Bilinmeyen bir hata oluştu.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Son Fişleri Çekme (Geçmiş)
  const fetchRecentFisler = async () => {
    if (!isConnected) return;
    setIsLoadingRecent(true);
    try {
      const q = `
        SELECT TOP 25
          sth_evrakno_seri as Seri,
          sth_evrakno_sira as Sira,
          CONVERT(varchar, sth_tarih, 23) as Tarih,
          sth_MenuNo as MenuNo,
          COUNT(*) as KalemSayisi,
          SUM(sth_miktar) as ToplamMiktar,
          MAX(sth_cikis_depo_no) as DepoNo,
          ISNULL((SELECT depo_adi FROM DEPOLAR WHERE depo_no = MAX(sth_cikis_depo_no)), 'Depo ' + CAST(MAX(sth_cikis_depo_no) as varchar)) as DepoAdi,
          MAX(sth_aciklama) as Aciklama
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE sth_MenuNo IN (12160, 12250, 12810, '12160', '12250', '12810')
        GROUP BY sth_evrakno_seri, sth_evrakno_sira, sth_tarih, sth_MenuNo
        ORDER BY Tarih DESC, Sira DESC;
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 10000 });
      if (res.data?.data) {
        setRecentFisler(res.data.data);
      }
    } catch (e) {
      console.log('Geçmiş fişler çekilemedi:', e);
    } finally {
      setIsLoadingRecent(false);
    }
  };

  // Belirli bir fişin satır detayını çekme
  const fetchEvrakDetail = async (item: any) => {
    try {
      const q = `
        SELECT 
          sth_satirno as SatirNo,
          sth_tip as Tip,
          sth_stok_kod as StokKodu,
          ISNULL((SELECT sto_isim FROM STOKLAR WHERE sto_kod = sth_stok_kod), 'Bilinmeyen Ürün') as UrunAdi,
          sth_miktar as Miktar,
          sth_aciklama as Aciklama
        FROM STOK_HAREKETLERI WITH (NOLOCK)
        WHERE sth_MenuNo = '${item.MenuNo}' 
          AND sth_evrakno_seri = '${(item.Seri || '').replace(/'/g, "''")}' 
          AND sth_evrakno_sira = ${item.Sira}
        ORDER BY sth_satirno ASC;
      `;
      const res = await axios.post(API_URL, { query: q }, { timeout: 10000 });
      if (res.data?.data) {
        setSelectedEvrakDetail(res.data.data);
        setDetailEvrakTitle(`${item.MenuNo === '12160' ? 'Sayım Çıkışı' : item.MenuNo === '12250' ? 'Sayım Girişi' : 'Stok Virman'} (${item.Seri ? item.Seri + '-' : ''}${item.Sira})`);
        setShowEvrakDetailModal(true);
      }
    } catch (e) {
      ToastAndroid.show('Evrak detayı alınamadı.', ToastAndroid.SHORT);
    }
  };

  // Renk ve Tema Paleti
  const themeColors = {
    bg: isDark ? '#0B1326' : '#F9F9FF',
    card: isDark ? '#141F36' : '#FFFFFF',
    cardLow: isDark ? '#1C2B4A' : '#F1F4F9',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    text: isDark ? '#F1F5F9' : '#0F172A',
    textMuted: isDark ? '#8A9AB5' : '#64748B',
    cikisColor: '#EF4444',
    girisColor: '#10B981',
    virmanColor: '#3B82F6',
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      {/* 1. TOP BAR (STITCH INDUSTRIAL HEADER) */}
      <View style={[styles.topBar, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBackToMenu}>
          <Ionicons name="arrow-back" size={22} color={themeColors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.liveDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
            <Text style={[styles.topBarTitle, { color: themeColors.text }]}>STOK & DEPO FİŞLERİ</Text>
          </View>
          <Text style={[styles.topBarSub, { color: themeColors.textMuted }]}>
            {activeTab === 'cikis' ? 'Sayım Çıkışı Depo Fişi (012160)'
             : activeTab === 'giris' ? 'Sayım Girişi Depo Fişi (012250)'
             : activeTab === 'virman' ? 'Stok Virman Fişi (012810)'
             : 'Mikro Canlı Evrak Geçmişi'}
          </Text>
        </View>

        {/* Depo Seçim Rozeti */}
        <TouchableOpacity
          style={[styles.depoPill, { backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}
          onPress={() => setShowDepoModal(true)}
        >
          <Ionicons name="business" size={14} color="#FF6B00" />
          <Text style={[styles.depoPillText, { color: themeColors.text }]} numberOfLines={1}>
            {activeDepo?.depo_adi || `Depo ${activeDepo?.depo_no || 1}`}
          </Text>
          <Ionicons name="chevron-down" size={12} color={themeColors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* 2. SEGMENTED TABS (012160 Çıkış / 012250 Giriş / 012810 Virman / Geçmiş) */}
      <View style={[styles.tabBar, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'cikis' && [styles.activeTabItem, { borderBottomColor: themeColors.cikisColor }],
          ]}
          onPress={() => setActiveTab('cikis')}
        >
          <Ionicons
            name="log-out-outline"
            size={18}
            color={activeTab === 'cikis' ? themeColors.cikisColor : themeColors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.textMuted },
              activeTab === 'cikis' && styles.activeTabText,
            ]}
          >
            Sayım Çıkışı (012160)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'giris' && [styles.activeTabItem, { borderBottomColor: themeColors.girisColor }],
          ]}
          onPress={() => setActiveTab('giris')}
        >
          <Ionicons
            name="log-in-outline"
            size={18}
            color={activeTab === 'giris' ? themeColors.girisColor : themeColors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'giris' ? themeColors.girisColor : themeColors.textMuted },
              activeTab === 'giris' && styles.activeTabText,
            ]}
          >
            Sayım Girişi (012250)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'virman' && [styles.activeTabItem, { borderBottomColor: themeColors.virmanColor }],
          ]}
          onPress={() => setActiveTab('virman')}
        >
          <Ionicons
            name="swap-horizontal"
            size={18}
            color={activeTab === 'virman' ? themeColors.virmanColor : themeColors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'virman' ? themeColors.virmanColor : themeColors.textMuted },
              activeTab === 'virman' && styles.activeTabText,
            ]}
          >
            Stok Virman (012810)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'gecmis' && [styles.activeTabItem, { borderBottomColor: '#FF6B00' }],
          ]}
          onPress={() => setActiveTab('gecmis')}
        >
          <Ionicons
            name="time-outline"
            size={18}
            color={activeTab === 'gecmis' ? '#FF6B00' : themeColors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'gecmis' ? '#FF6B00' : themeColors.textMuted },
              activeTab === 'gecmis' && styles.activeTabText,
            ]}
          >
            Geçmiş
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. ANA İÇERİK ALANI */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* A. SAYIM ÇIKIŞI VEYA GİRİŞİ PANELİ */}
        {(activeTab === 'cikis' || activeTab === 'giris') && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Evrak Üst Bilgi Kartı */}
            <View style={[styles.headerCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={styles.headerCardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>EVRAK SERİ & SIRA</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <TextInput
                      style={[styles.seriInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
                      value={evrakSeri}
                      onChangeText={t => {
                        const val = t.toUpperCase();
                        setEvrakSeri(val);
                        fetchNextSira(activeTab === 'cikis' ? 12160 : 12250, val);
                      }}
                      placeholder="Seri"
                      placeholderTextColor={themeColors.textMuted}
                      autoCapitalize="characters"
                      maxLength={4}
                    />
                    <TextInput
                      style={[styles.siraInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
                      value={evrakSira}
                      onChangeText={setEvrakSira}
                      placeholder="Sıra No"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                    {isLoadingSeq && <ActivityIndicator size="small" color="#FF6B00" />}
                  </View>
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>İŞLEM TARİHİ</Text>
                  <TextInput
                    style={[styles.dateInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border, marginTop: 4 }]}
                    value={evrakTarih}
                    onChangeText={setEvrakTarih}
                    placeholder="YYYY-AA-GG"
                    placeholderTextColor={themeColors.textMuted}
                  />
                </View>
              </View>

              {/* Fiş Açıklaması */}
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>FİŞ AÇIKLAMASI</Text>
                <TextInput
                  style={[styles.descInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
                  placeholder={activeTab === 'cikis' ? 'Örn: Sayım Eksiği, Fire, Kırık Mal' : 'Örn: Sayım Fazlası, Devir'}
                  placeholderTextColor={themeColors.textMuted}
                  value={genelAciklama}
                  onChangeText={setGenelAciklama}
                />
                {/* Hızlı Açıklama Çipleri */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(activeTab === 'cikis'
                    ? ['SAYIM EKSİĞİ', 'FİRE / HASAR', 'KIRIK MAL', 'HURDA ÇIKIŞI']
                    : ['SAYIM FAZLASI', 'DEVİR GİRİŞİ', 'BULUNAN MAL', 'DEPO DÜZENLEME']
                  ).map((chip, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setGenelAciklama(chip)}
                      style={[styles.chipBtn, { backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}
                    >
                      <Text style={[styles.chipBtnText, { color: themeColors.textMuted }]}>{chip}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Ürün Arama & Barkod Okutma Kutusu */}
            <View style={[styles.searchBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.searchInputWrapper, { backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}>
                  <Ionicons name="search" size={18} color={themeColors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder="Barkod / Stok Kodu / İsim yazın..."
                    placeholderTextColor={themeColors.textMuted}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    onSubmitEditing={() => handleSearchProduct(searchInput)}
                    autoCapitalize="characters"
                  />
                  {searchInput.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchInput('')}>
                      <Ionicons name="close-circle" size={18} color={themeColors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Kamera Aç Butonu */}
                <TouchableOpacity
                  style={[styles.camBtn, { backgroundColor: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor }]}
                  onPress={() => setIsCameraActive(!isCameraActive)}
                >
                  <Ionicons name={isCameraActive ? 'close' : 'barcode-outline'} size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Kamera Önizleme */}
              {isCameraActive && (
                <View style={styles.camContainer}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    enableTorch={torchEnabled}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a', 'upc_e'],
                    }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                  <View style={styles.camOverlay}>
                    <View style={styles.camScanWindow} />
                    <Text style={styles.camScanText}>Barkodu pencereye hizalayın</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.camTorchBtn}
                    onPress={() => setTorchEnabled(!torchEnabled)}
                  >
                    <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Arama Sonuçları Listesi */}
              {isSearching && (
                <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#FF6B00" />
                  <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 4 }}>Aranıyor...</Text>
                </View>
              )}

              {searchResults.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}>
                  {searchResults.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
                      onPress={() => handleSelectFoundProduct(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultCode, { color: themeColors.text }]}>{item.stock_code}</Text>
                        <Text style={[styles.resultName, { color: themeColors.textMuted }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontSize: 11, color: '#FF6B00' }}>Barkod: {item.barcode || 'Yok'}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Seçili Ürün Kartı & Miktar Girişi */}
              {selectedProduct && (
                <View style={[styles.selectedProductBox, { backgroundColor: themeColors.cardLow, borderColor: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.selectedProductCode, { color: themeColors.text }]}>{selectedProduct.stock_code}</Text>
                      <Text style={[styles.selectedProductName, { color: themeColors.textMuted }]} numberOfLines={2}>{selectedProduct.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: '#FF6B00', fontWeight: '700' }}>Barkod: {selectedProduct.barcode || '-'}</Text>
                        <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>Mevcut Depo Stoğu: {selectedProduct.current_stok ?? 0} {selectedProduct.unit || 'ADET'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedProduct(null)}>
                      <Ionicons name="close-circle" size={22} color={themeColors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Adet Seçim Barı */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>MİKTAR:</Text>
                    <TextInput
                      style={[styles.qtyInput, { backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border }]}
                      keyboardType="numeric"
                      value={inputMiktar}
                      onChangeText={setInputMiktar}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.textMuted }}>{selectedProduct.unit || 'ADET'}</Text>

                    {/* Hızlı Çipler */}
                    {['+1', '+5', '+10'].map((plus, pIdx) => (
                      <TouchableOpacity
                        key={pIdx}
                        style={[styles.plusChip, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                        onPress={() => {
                          const curr = parseFloat(inputMiktar) || 0;
                          const add = parseInt(plus.replace('+', ''), 10);
                          setInputMiktar(String(curr + add));
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>{plus}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Kaleme Özel Açıklama */}
                  <TextInput
                    style={[styles.itemDescInput, { backgroundColor: themeColors.card, color: themeColors.text, borderColor: themeColors.border, marginTop: 8 }]}
                    placeholder="Kalem açıklaması (isteğe bağlı)..."
                    placeholderTextColor={themeColors.textMuted}
                    value={itemAciklama}
                    onChangeText={setItemAciklama}
                  />

                  {/* Sepete Ekle Butonu */}
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor }]}
                    onPress={handleAddCartItem}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.addBtnText}>
                      {activeTab === 'cikis' ? 'ÇIKIŞ LİSTESİNE EKLE' : 'GİRİŞ LİSTESİNE EKLE'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Eklenen Kalemler Listesi */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                  {activeTab === 'cikis' ? 'ÇIKILACAK KALEMLER' : 'GİRİLECEK KALEMLER'} ({cartItems.length})
                </Text>
                {cartItems.length > 0 && (
                  <TouchableOpacity onPress={() => setCartItems([])}>
                    <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>Listeyi Temizle</Text>
                  </TouchableOpacity>
                )}
              </View>

              {cartItems.length === 0 ? (
                <View style={[styles.emptyCartBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  <Ionicons name="cube-outline" size={32} color={themeColors.textMuted} />
                  <Text style={[styles.emptyCartText, { color: themeColors.textMuted }]}>
                    Henüz ürün eklenmedi. Yukarıdaki barkod okuyucu veya arama ile ürün ekleyebilirsiniz.
                  </Text>
                </View>
              ) : (
                cartItems.map((item, idx) => (
                  <View key={item.id || idx} style={[styles.cartItemRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cartItemCode, { color: themeColors.text }]}>{item.stock_code}</Text>
                      <Text style={[styles.cartItemName, { color: themeColors.textMuted }]} numberOfLines={1}>{item.name}</Text>
                      {item.description ? (
                        <Text style={{ fontSize: 11, color: '#FF6B00', marginTop: 2 }}>Not: {item.description}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                      <Text style={[styles.cartItemQty, { color: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor }]}>
                        {activeTab === 'cikis' ? '-' : '+'}{item.miktar} {item.unit}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setCartItems(cartItems.filter((_, i) => i !== idx))}
                        style={{ marginTop: 4, padding: 4 }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* MİKRO ERP'YE KAYDET BUTONU */}
            {cartItems.length > 0 && (
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: activeTab === 'cikis' ? themeColors.cikisColor : themeColors.girisColor }]}
                onPress={handleSubmitFisToMikro}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.submitBtnText}>
                      {activeTab === 'cikis'
                        ? `MİKRO ERP'YE KAYDET (012160 ÇIKIŞ FİŞİ)`
                        : `MİKRO ERP'YE KAYDET (012250 GİRİŞ FİŞİ)`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* B. STOK VİRMAN FİŞİ (012810) - ÇİFT SATIRLI EŞLEŞTİRME */}
        {activeTab === 'virman' && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12, paddingBottom: 110 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Virman Üst Bilgi Kartı */}
            <View style={[styles.headerCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={styles.headerCardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>VİRMAN SERİ & SIRA</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <TextInput
                      style={[styles.seriInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
                      value={evrakSeri}
                      onChangeText={t => {
                        const val = t.toUpperCase();
                        setEvrakSeri(val);
                        fetchNextSira(12810, val);
                      }}
                      placeholder="Seri"
                      placeholderTextColor={themeColors.textMuted}
                      autoCapitalize="characters"
                      maxLength={4}
                    />
                    <TextInput
                      style={[styles.siraInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
                      value={evrakSira}
                      onChangeText={setEvrakSira}
                      placeholder="Sıra No"
                      placeholderTextColor={themeColors.textMuted}
                      keyboardType="numeric"
                    />
                    {isLoadingSeq && <ActivityIndicator size="small" color="#FF6B00" />}
                  </View>
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>İŞLEM TARİHİ</Text>
                  <TextInput
                    style={[styles.dateInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border, marginTop: 4 }]}
                    value={evrakTarih}
                    onChangeText={setEvrakTarih}
                    placeholder="YYYY-AA-GG"
                    placeholderTextColor={themeColors.textMuted}
                  />
                </View>
              </View>

              {/* Virman Depo Bilgi Notu */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                <Ionicons name="information-circle" size={16} color="#3B82F6" />
                <Text style={{ fontSize: 11, color: '#3B82F6', flex: 1, fontWeight: '600' }}>
                  Stok Virmanı <Text style={{ fontWeight: '800' }}>{activeDepo?.depo_adi || 'Merkez Depo'}</Text> içerisinde bir üründen düşülüp diğer ürüne aktarılmasıdır.
                </Text>
              </View>
            </View>

            {/* VİRMAN EŞLEŞTİRME KARTI (KAYNAK ➔ HEDEF) */}
            <View style={[styles.virmanBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionHeading, { color: themeColors.text, marginBottom: 8 }]}>VİRMAN EŞLEŞTİRME</Text>

              {/* 1. KAYNAK ÜRÜN (STOĞU DÜŞECEK ÜRÜN) */}
              <View style={[styles.virmanSlot, { backgroundColor: themeColors.cardLow, borderColor: '#EF4444' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="remove-circle" size={16} color="#EF4444" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>KAYNAK ÜRÜN (ÇIKIŞ YAPILACAK)</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setVirmanSelectingSide('source');
                      setIsCameraActive(true);
                    }}
                    style={[styles.slotCamBtn, { backgroundColor: '#EF4444' }]}
                  >
                    <Ionicons name="barcode-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>TARA</Text>
                  </TouchableOpacity>
                </View>

                {virmanSourceProduct ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.resultCode, { color: themeColors.text }]}>{virmanSourceProduct.stock_code}</Text>
                    <Text style={[styles.resultName, { color: themeColors.textMuted }]} numberOfLines={1}>{virmanSourceProduct.name}</Text>
                    <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700', marginTop: 2 }}>
                      Mevcut Stok: {virmanSourceProduct.current_stok ?? 0} {virmanSourceProduct.unit}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectPromptBtn}
                    onPress={() => {
                      setVirmanSelectingSide('source');
                      // Focus arama input
                    }}
                  >
                    <Text style={{ fontSize: 12, color: themeColors.textMuted }}>Barkod okutun veya arama kutusunu kullanın</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* DÖNÜŞTÜRME OKU */}
              <View style={{ alignItems: 'center', marginVertical: 6 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="arrow-down" size={20} color="#fff" />
                </View>
              </View>

              {/* 2. HEDEF ÜRÜN (STOĞA EKLENECEK ÜRÜN) */}
              <View style={[styles.virmanSlot, { backgroundColor: themeColors.cardLow, borderColor: '#10B981' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="add-circle" size={16} color="#10B981" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#10B981' }}>HEDEF ÜRÜN (GİRİŞ YAPILACAK)</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setVirmanSelectingSide('target');
                      setIsCameraActive(true);
                    }}
                    style={[styles.slotCamBtn, { backgroundColor: '#10B981' }]}
                  >
                    <Ionicons name="barcode-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>TARA</Text>
                  </TouchableOpacity>
                </View>

                {virmanTargetProduct ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.resultCode, { color: themeColors.text }]}>{virmanTargetProduct.stock_code}</Text>
                    <Text style={[styles.resultName, { color: themeColors.textMuted }]} numberOfLines={1}>{virmanTargetProduct.name}</Text>
                    <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700', marginTop: 2 }}>
                      Mevcut Stok: {virmanTargetProduct.current_stok ?? 0} {virmanTargetProduct.unit}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectPromptBtn}
                    onPress={() => {
                      setVirmanSelectingSide('target');
                    }}
                  >
                    <Text style={{ fontSize: 12, color: themeColors.textMuted }}>Barkod okutun veya arama kutusunu kullanın</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Arama Alanı (Virman için) */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <View style={[styles.searchInputWrapper, { flex: 1, backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}>
                  <Ionicons name="search" size={16} color={themeColors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder={`${virmanSelectingSide === 'source' ? 'Kaynak' : 'Hedef'} ürün ara...`}
                    placeholderTextColor={themeColors.textMuted}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    onSubmitEditing={() => handleSearchProduct(searchInput)}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <TouchableOpacity
                    style={[styles.sideToggleBtn, virmanSelectingSide === 'source' && { backgroundColor: '#EF4444' }]}
                    onPress={() => setVirmanSelectingSide('source')}
                  >
                    <Text style={{ color: virmanSelectingSide === 'source' ? '#fff' : themeColors.textMuted, fontSize: 11, fontWeight: '700' }}>Kaynak</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sideToggleBtn, virmanSelectingSide === 'target' && { backgroundColor: '#10B981' }]}
                    onPress={() => setVirmanSelectingSide('target')}
                  >
                    <Text style={{ color: virmanSelectingSide === 'target' ? '#fff' : themeColors.textMuted, fontSize: 11, fontWeight: '700' }}>Hedef</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Kamera Önizleme (Virman) */}
              {isCameraActive && (
                <View style={[styles.camContainer, { marginTop: 10 }]}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    enableTorch={torchEnabled}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a', 'upc_e'],
                    }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                  <View style={styles.camOverlay}>
                    <View style={styles.camScanWindow} />
                    <Text style={styles.camScanText}>
                      {virmanSelectingSide === 'source' ? 'Kaynak Ürün Barkodunu Hizalayın' : 'Hedef Ürün Barkodunu Hizalayın'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.camTorchBtn}
                    onPress={() => setTorchEnabled(!torchEnabled)}
                  >
                    <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Arama Sonuçları */}
              {searchResults.length > 0 && (
                <View style={[styles.resultsList, { backgroundColor: themeColors.cardLow, borderColor: themeColors.border }]}>
                  {searchResults.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
                      onPress={() => handleSelectFoundProduct(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.resultCode, { color: themeColors.text }]}>{item.stock_code}</Text>
                        <Text style={[styles.resultName, { color: themeColors.textMuted }]} numberOfLines={1}>{item.name}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: virmanSelectingSide === 'source' ? '#EF4444' : '#10B981' }}>
                        {virmanSelectingSide === 'source' ? 'KAYNAK SEÇ' : 'HEDEF SEÇ'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Miktar & Açıklama */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ width: 110 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>VİRMAN MİKTARI</Text>
                  <TextInput
                    style={[styles.qtyInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border, marginTop: 4, width: '100%' }]}
                    keyboardType="numeric"
                    value={virmanMiktar}
                    onChangeText={setVirmanMiktar}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.miniLabel, { color: themeColors.textMuted }]}>VİRMAN AÇIKLAMASI</Text>
                  <TextInput
                    style={[styles.descInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border, marginTop: 4 }]}
                    value={virmanAciklama}
                    onChangeText={setVirmanAciklama}
                    placeholder="Açıklama yazın..."
                    placeholderTextColor={themeColors.textMuted}
                  />
                </View>
              </View>

              {/* Virman Çiftini Ekle Butonu */}
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: themeColors.virmanColor, marginTop: 12 }]}
                onPress={handleAddVirmanPair}
              >
                <Ionicons name="link" size={18} color="#fff" />
                <Text style={styles.addBtnText}>VİRMAN EŞLEŞTİRMESİNİ EKLE</Text>
              </TouchableOpacity>
            </View>

            {/* Eklenen Virman Listesi */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                  VİRMAN LİSTESİ ({virmanPairs.length} Çift)
                </Text>
                {virmanPairs.length > 0 && (
                  <TouchableOpacity onPress={() => setVirmanPairs([])}>
                    <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '700' }}>Temizle</Text>
                  </TouchableOpacity>
                )}
              </View>

              {virmanPairs.length === 0 ? (
                <View style={[styles.emptyCartBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  <Ionicons name="swap-horizontal" size={32} color={themeColors.textMuted} />
                  <Text style={[styles.emptyCartText, { color: themeColors.textMuted }]}>
                    Henüz virman eşleştirmesi eklenmedi. Kaynak ve hedef stokları belirleyip listeye ekleyin.
                  </Text>
                </View>
              ) : (
                virmanPairs.map((pair, idx) => (
                  <View key={pair.id || idx} style={[styles.virmanPairCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                    <View style={{ flex: 1 }}>
                      {/* Çıkış Satırı */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="remove-circle" size={16} color="#EF4444" />
                        <Text style={[styles.cartItemCode, { color: '#EF4444' }]}>{pair.source_stock_code}</Text>
                        <Text style={[styles.cartItemName, { color: themeColors.textMuted, flex: 1 }]} numberOfLines={1}>{pair.source_name}</Text>
                      </View>
                      {/* Dönüşüm İbaresi */}
                      <View style={{ paddingLeft: 22, marginVertical: 3 }}>
                        <Text style={{ fontSize: 11, color: '#3B82F6', fontWeight: '800' }}>
                          ➔ {pair.miktar} {pair.source_unit} aktarılıyor ➔
                        </Text>
                      </View>
                      {/* Giriş Satırı */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="add-circle" size={16} color="#10B981" />
                        <Text style={[styles.cartItemCode, { color: '#10B981' }]}>{pair.target_stock_code}</Text>
                        <Text style={[styles.cartItemName, { color: themeColors.textMuted, flex: 1 }]} numberOfLines={1}>{pair.target_name}</Text>
                      </View>
                      {pair.description ? (
                        <Text style={{ fontSize: 10, color: themeColors.textMuted, marginTop: 4, fontStyle: 'italic' }}>
                          Not: {pair.description}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      onPress={() => setVirmanPairs(virmanPairs.filter((_, i) => i !== idx))}
                      style={{ padding: 6, justifyContent: 'center' }}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* MİKRO ERP'YE VİRMAN KAYDET BUTONU */}
            {virmanPairs.length > 0 && (
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: themeColors.virmanColor }]}
                onPress={handleSubmitFisToMikro}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.submitBtnText}>
                      MİKRO ERP'YE KAYDET (012810 VİRMAN FİŞİ)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* C. GEÇMİŞ FİŞLER PANELİ */}
        {activeTab === 'gecmis' && (
          <View style={{ flex: 1, padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>SON MİKRO DEPO FİŞLERİ</Text>
              <TouchableOpacity onPress={fetchRecentFisler} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="refresh" size={16} color="#FF6B00" />
                <Text style={{ fontSize: 12, color: '#FF6B00', fontWeight: '700' }}>Yenile</Text>
              </TouchableOpacity>
            </View>

            {isLoadingRecent ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF6B00" />
                <Text style={{ color: themeColors.textMuted, marginTop: 8, fontSize: 13 }}>Fişler yükleniyor...</Text>
              </View>
            ) : (
              <FlatList
                data={recentFisler}
                keyExtractor={(item, index) => `${item.MenuNo}_${item.Seri}_${item.Sira}_${index}`}
                contentContainerStyle={{ paddingBottom: 110 }}
                renderItem={({ item }) => {
                  const isCikis = item.MenuNo === '12160' || item.MenuNo === 12160;
                  const isGiris = item.MenuNo === '12250' || item.MenuNo === 12250;
                  const isVirman = item.MenuNo === '12810' || item.MenuNo === 12810;
                  const fisTitle = isCikis ? 'Sayım Çıkışı (012160)' : isGiris ? 'Sayım Girişi (012250)' : 'Stok Virman (012810)';
                  const fisColor = isCikis ? themeColors.cikisColor : isGiris ? themeColors.girisColor : themeColors.virmanColor;

                  return (
                    <TouchableOpacity
                      style={[styles.recentCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                      onPress={() => fetchEvrakDetail(item)}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.badgeIcon, { backgroundColor: `${fisColor}22` }]}>
                            <Ionicons
                              name={isCikis ? 'log-out-outline' : isGiris ? 'log-in-outline' : 'swap-horizontal'}
                              size={16}
                              color={fisColor}
                            />
                          </View>
                          <Text style={[styles.recentCardTitle, { color: fisColor }]}>{fisTitle}</Text>
                        </View>
                        <Text style={[styles.recentDate, { color: themeColors.textMuted }]}>{item.Tarih}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <Text style={[styles.evrakNoText, { color: themeColors.text }]}>
                          Evrak No: <Text style={{ fontWeight: '900' }}>{item.Seri ? item.Seri + '-' : ''}{item.Sira}</Text>
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }}>
                          {item.KalemSayisi} Kalem • {item.ToplamMiktar} Adet
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>{item.DepoAdi || `Depo ${item.DepoNo}`}</Text>
                        {item.Aciklama ? (
                          <Text style={{ fontSize: 11, color: '#FF6B00', maxWidth: '60%' }} numberOfLines={1}>
                            {item.Aciklama}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* 4. DEPO SEÇİM MODALI */}
      <Modal
        isVisible={showDepoModal}
        onBackdropPress={() => setShowDepoModal(false)}
        style={styles.modal}
      >
        <View style={[styles.modalContent, { backgroundColor: themeColors.card, maxHeight: '75%' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>İşlem Yapılacak Depo</Text>
            <TouchableOpacity onPress={() => setShowDepoModal(false)}>
              <Ionicons name="close" size={24} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.modalSearchInput, { backgroundColor: themeColors.cardLow, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="Depo adı veya no ile ara..."
            placeholderTextColor={themeColors.textMuted}
            value={depoSearch}
            onChangeText={setDepoSearch}
          />

          <FlatList
            data={(depos || []).filter(d =>
              d.depo_adi?.toLowerCase().includes(depoSearch.toLowerCase()) ||
              String(d.depo_no).includes(depoSearch)
            )}
            keyExtractor={item => String(item.depo_no)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.depoOptionRow,
                  { borderBottomColor: themeColors.border },
                  activeDepo?.depo_no === item.depo_no && { backgroundColor: 'rgba(255, 107, 0, 0.1)' },
                ]}
                onPress={() => {
                  setActiveDepo(item);
                  setShowDepoModal(false);
                  setDepoSearch('');
                  // Eğer sepette ürün varsa stoğunu yeniden çekebilir
                }}
              >
                <View>
                  <Text style={[styles.depoOptionTitle, { color: themeColors.text }]}>{item.depo_adi}</Text>
                  <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Depo Kodu: {item.depo_no}</Text>
                </View>
                {activeDepo?.depo_no === item.depo_no && (
                  <Ionicons name="checkmark-circle" size={20} color="#FF6B00" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* 5. EVRAK SATIR DETAYI MODALI */}
      <Modal
        isVisible={showEvrakDetailModal}
        onBackdropPress={() => setShowEvrakDetailModal(false)}
        style={styles.modal}
      >
        <View style={[styles.modalContent, { backgroundColor: themeColors.card, maxHeight: '80%' }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>{detailEvrakTitle}</Text>
              <Text style={{ fontSize: 12, color: themeColors.textMuted }}>Mikro ERP Satır Detayı</Text>
            </View>
            <TouchableOpacity onPress={() => setShowEvrakDetailModal(false)}>
              <Ionicons name="close" size={24} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={selectedEvrakDetail}
            keyExtractor={(item, idx) => String(idx)}
            renderItem={({ item }) => (
              <View style={[styles.detailItemRow, { borderBottomColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cartItemCode, { color: themeColors.text }]}>{item.StokKodu}</Text>
                  <Text style={[styles.cartItemName, { color: themeColors.textMuted }]} numberOfLines={2}>{item.UrunAdi}</Text>
                  {item.Aciklama ? (
                    <Text style={{ fontSize: 11, color: '#FF6B00', marginTop: 2 }}>{item.Aciklama}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: item.Tip === 1 ? '#EF4444' : '#10B981' }}>
                    {item.Tip === 1 ? 'ÇIKIŞ' : 'GİRİŞ'} : {item.Miktar}
                  </Text>
                  <Text style={{ fontSize: 10, color: themeColors.textMuted }}>Satır: {item.SatirNo}</Text>
                </View>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, borderRadius: 8 },
  topBarTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  topBarSub: { fontSize: 11, fontWeight: '600' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  depoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 130,
  },
  depoPillText: { fontSize: 11, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabItem: {},
  tabText: { fontSize: 11, fontWeight: '600' },
  activeTabText: { fontWeight: '800' },
  headerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  headerCardRow: { flexDirection: 'row', alignItems: 'center' },
  miniLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  seriInput: {
    width: 60,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
  },
  siraInput: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontWeight: '800',
    fontSize: 13,
  },
  dateInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontWeight: '700',
    fontSize: 13,
  },
  descInput: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    marginTop: 4,
  },
  chipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipBtnText: { fontSize: 10, fontWeight: '700' },
  searchBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '600' },
  camBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camContainer: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    position: 'relative',
  },
  camOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camScanWindow: {
    width: 220,
    height: 90,
    borderWidth: 2,
    borderColor: '#FF6B00',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  camScanText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8 },
  camTorchBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 20,
  },
  resultsList: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
  },
  resultCode: { fontSize: 13, fontWeight: '800' },
  resultName: { fontSize: 12 },
  selectedProductBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 10,
  },
  selectedProductCode: { fontSize: 14, fontWeight: '900' },
  selectedProductName: { fontSize: 12, marginTop: 2 },
  qtyInput: {
    width: 70,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 15,
  },
  plusChip: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemDescInput: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  addBtn: {
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  sectionHeading: { fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  emptyCartBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyCartText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  cartItemCode: { fontSize: 13, fontWeight: '800' },
  cartItemName: { fontSize: 12 },
  cartItemQty: { fontSize: 14, fontWeight: '900' },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  virmanBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  virmanSlot: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  slotCamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectPromptBtn: { paddingVertical: 12, alignItems: 'center' },
  sideToggleBtn: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  virmanPairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  recentCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  badgeIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentCardTitle: { fontSize: 13, fontWeight: '800' },
  recentDate: { fontSize: 11 },
  evrakNoText: { fontSize: 13 },
  modal: { margin: 0, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalSearchInput: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 10,
  },
  depoOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  depoOptionTitle: { fontSize: 14, fontWeight: '700' },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
