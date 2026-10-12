import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Vibration,
  Animated,
  Easing,
  TextInput,
  FlatList,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  useColorScheme,
  Image,
  ToastAndroid
} from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SQLite from 'expo-sqlite';
import axios from 'axios';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import Modal from 'react-native-modal';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import XLSX from 'xlsx';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReportsView from './ReportsView';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const MIKRO_SQL_QUERY = `
  SELECT 
    bt.bar_kodu AS barcode,
    s.sto_kod AS stock_code,
    s.sto_isim AS name,
    ISNULL(sf.sfiyat_fiyati, 0) AS price,
    CASE 
      WHEN ISNULL(sf.sfiyat_doviz, 0) = 0 THEN 'TL'
      WHEN sf.sfiyat_doviz = 1 THEN 'USD'
      WHEN sf.sfiyat_doviz = 2 THEN 'EUR'
      WHEN sf.sfiyat_doviz = 3 THEN 'GBP'
      ELSE 'TL'
    END AS currency,
    s.sto_birim1_ad AS unit,
    ISNULL(CONVERT(varchar, (
      SELECT TOP 1 '%' + CAST(CAST(isk_isk1_yuzde AS INT) AS VARCHAR)
      FROM STOK_CARI_ISKONTO_TANIMLARI WITH (NOLOCK)
      WHERE isk_stok_kod = sfl.sfiyat_iskontokod
      ORDER BY CASE WHEN isk_cari_kod = '50' THEN 0 ELSE 1 END, isk_isk1_yuzde ASC
    )), '') AS iskonto_orani,
    ISNULL(CONVERT(varchar, (SELECT TOP 1 sfiyat_lastup_date FROM STOK_SATIS_FIYAT_LISTELERI WITH (NOLOCK) WHERE sfiyat_stokkod = s.sto_kod AND sfiyat_listesirano = 1 ORDER BY sfiyat_lastup_date DESC), 104), '') AS lastup_date
  FROM BARKOD_TANIMLARI bt WITH (NOLOCK)
  INNER JOIN STOKLAR s WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod
  LEFT OUTER JOIN STOK_SATIS_FIYATLARI_F1_D0_VIEW sf WITH (NOLOCK) ON s.sto_kod = sf.sfiyat_stokkod
  LEFT OUTER JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = 1
`;

const API_URL = 'http://185.136.205.19:3000/execute-sql';
const API_BASE_URL = 'http://185.136.205.19:3000';
const TELEGRAM_TOKEN = '8377448589:AAGYVYByRojC4xckPPcF4Zpiw78bjuVf7Cc';
const TELEGRAM_CHAT_ID = '-1003647632224';
const GITHUB_OWNER = 'hasankaynak';
const GITHUB_REPO = 'SayimApp';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const GITHUB_RAW_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/version.json`;
const FALLBACK_UPDATE_URL = 'http://185.136.205.19:3000/updates/version.json';
const CURRENT_VERSION = '1.0.12';
const CURRENT_VERSION_CODE = 12;

const parseVersion = (v: string): number[] => {
  const clean = (v || '').replace(/^v/i, '').trim();
  return clean.split('.').map(p => parseInt(p, 10) || 0);
};

const isNewerVersion = (latest: string, current: string): boolean => {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  const len = Math.max(l.length, c.length, 3);
  for (let i = 0; i < len; i++) {
    const lVal = l[i] || 0;
    const cVal = c[i] || 0;
    if (lVal > cVal) return true;
    if (lVal < cVal) return false;
  }
  return false;
};

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
};

const normalizeText = (text: string) => {
  return text.replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ş/g, 'ş').replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç').toLowerCase();
};

export default function App() {
  const colorScheme = useColorScheme();
  const [manualTheme, setManualTheme] = useState<'system' | 'dark' | 'light'>('system');
  const isDark = manualTheme === 'system' ? colorScheme === 'dark' : manualTheme === 'dark';
  const styles = getStyles(isDark);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [isListening, setIsListening] = useState(false);

  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (event.results[0]?.transcript) {
      const ts = event.results[0].transcript;
      setSearchQuery(ts);
      handleSearch(ts);
    }
  });

  const handleSpeechStart = async () => {
    if (isListening) { ExpoSpeechRecognitionModule.stop(); return; }
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) { Alert.alert("Hata", "Sesli arama için izin gereklidir."); return; }
    ExpoSpeechRecognitionModule.start({ lang: "tr-TR", continuous: false, interimResults: true });
  };

  const [product, setProduct] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [torch, setTorch] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [isAlreadyReported, setIsAlreadyReported] = useState(false);
  const [depoStoklar, setDepoStoklar] = useState<any[]>([]);
  const [isLoadingDepoStok, setIsLoadingDepoStok] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [showDepoStok, setShowDepoStok] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [hasInitialSync, setHasInitialSync] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [userNameInput, setUserNameInput] = useState('');
  const [showUserNameModal, setShowUserNameModal] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const dbRef = useRef<any>(null);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // --- SAYIM ADDITIONS ---
  const [appMode, setAppMode] = useState<'menu' | 'fiyatgor' | 'sayim' | 'sevk' | 'cari' | 'raporlar'>('menu');
  const [depos, setDepos] = useState<any[]>([]);
  const [selectedDepo, setSelectedDepo] = useState<any>(null);
  const [showDepoModal, setShowDepoModal] = useState(false);
  
  // SEVK STATE
  const [sevkSourceDepo, setSevkSourceDepo] = useState<any>(null);
  const [sevkTargetDepo, setSevkTargetDepo] = useState<any>(null);
  const [showSevkSourceModal, setShowSevkSourceModal] = useState(false);
  const [showSevkTargetModal, setShowSevkTargetModal] = useState(false);

  // BARKOD ISLE
  const [showBarkodIsleModal, setShowBarkodIsleModal] = useState(false);
  const [barkodIsleSearchQuery, setBarkodIsleSearchQuery] = useState('');
  const [barkodIsleResults, setBarkodIsleResults] = useState<any[]>([]);
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [showTargetSearch, setShowTargetSearch] = useState(false);
  const [isProcessingBarkod, setIsProcessingBarkod] = useState(false);

  const [beepSound, setBeepSound] = useState<Audio.Sound | null>(null);

  async function playSound(type: 'success' | 'error' | 'beep') {
    try {
      const file = type === 'success' ? require('./assets/success.wav') 
                 : type === 'error' ? require('./assets/error.wav') 
                 : require('./assets/beep.mp3');
      const { sound } = await Audio.Sound.createAsync(file);
      setBeepSound(sound);
      await sound.playAsync();
    } catch(e) {}
  }

  useEffect(() => {
    return beepSound ? () => { beepSound.unloadAsync(); } : undefined;
  }, [beepSound]);
  const [wasScannedByCamera, setWasScannedByCamera] = useState(false);

  // MIKRO KULLANICI STATE
  const [mikroUserNo, setMikroUserNo] = useState<string>('7');
  const [showUserSelectModal, setShowUserSelectModal] = useState(false);
  const [mikroUsersList, setMikroUsersList] = useState<any[]>([]);

  // EVRAK ARAMA
  const [faturaSearchQuery, setFaturaSearchQuery] = useState('');

  const [activeCart, setActiveCart] = useState<any[]>([]);
  const [isShowingCart, setIsShowingCart] = useState(false);
  const [countInput, setCountInput] = useState('1');
  const [cartSearchQuery, setCartSearchQuery] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sayimBackups, setSayimBackups] = useState<any[]>([]);
  const [depoSearchQuery, setDepoSearchQuery] = useState('');
  const [editingBackupId, setEditingBackupId] = useState<number | null>(null);
  const [editingEvrakNo, setEditingEvrakNo] = useState<number | null>(null);
  const [stokHareketleri, setStokHareketleri] = useState<any[]>([]);
  const [showStokHareketleri, setShowStokHareketleri] = useState(false);
  const [isLoadingHareketler, setIsLoadingHareketler] = useState(false);
  const [hkCariFiltre, setHkCariFiltre] = useState('');
  
  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [showStartDate, setShowStartDate] = useState(false);
  const [dateEnd, setDateEnd] = useState<Date | null>(null);
  const [showEndDate, setShowEndDate] = useState(false);

  // Fatura Detayı State
  const [faturaDetayi, setFaturaDetayi] = useState<any[]>([]);
  const [showFaturaModal, setShowFaturaModal] = useState(false);
  const [isLoadingFatura, setIsLoadingFatura] = useState(false);
  const [selectedEvrak, setSelectedEvrak] = useState<any>(null);

  // CARI İŞLEMLER
  const [cariSearchQuery, setCariSearchQuery] = useState('');
  const [cariResults, setCariResults] = useState<any[]>([]);
  const [selectedCari, setSelectedCari] = useState<any>(null);
  const [cariHareketler, setCariHareketler] = useState<any[]>([]);
  const [isLoadingCariHar, setIsLoadingCariHar] = useState(false);
  const [showCariModal, setShowCariModal] = useState(false);
  const [cariProductSearchQuery, setCariProductSearchQuery] = useState('');
  const [cariProductInvoices, setCariProductInvoices] = useState<any[]>([]);
  const [isLoadingCariProdInv, setIsLoadingCariProdInv] = useState(false);
  // -------------------------

  // ÜRÜN İSMİ DÜZENLEME STATE
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(Animated.timing(rotateAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true })).start();
    } else { rotateAnim.setValue(0); }
  }, [isSyncing]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => { setIsConnected(state.isConnected); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadUserName = async () => {
      try {
        const savedSync = await AsyncStorage.getItem('autoSync');
        if (savedSync !== null) setAutoSync(savedSync === 'true');

        const savedName = await AsyncStorage.getItem('userName');
        if (savedName) {
          setUserName(savedName);
          setIsAppReady(true);
        } else {
          setShowUserNameModal(true);
        }
      } catch (error) { setShowUserNameModal(true); }
    };
    loadUserName();
  }, []);

  const saveUserName = async () => {
    if (userNameInput.trim().length < 2) { Alert.alert('Hata', 'Lütfen en az 2 karakter girin.'); return; }
    try {
      await AsyncStorage.setItem('userName', userNameInput.trim());
      setUserName(userNameInput.trim());
      setShowUserNameModal(false);
      setIsAppReady(true);
    } catch (error) { Alert.alert('Hata', 'Kullanıcı adı kaydedilemedi.'); }
  };

  const openEditNameModal = () => {
    if (!product || !product.stock_code || product.stock_code === '---') return;
    setEditNameInput(product.name || '');
    setEditNameModalVisible(true);
  };

  const handleUpdateProductName = async () => {
    const trimmed = editNameInput.trim();
    if (!trimmed) {
      Alert.alert('Uyarı', 'Ürün adı boş olamaz.');
      return;
    }
    if (!product || !product.stock_code || product.stock_code === '---') {
      Alert.alert('Hata', 'Geçerli bir ürün seçilmedi.');
      return;
    }

    setIsUpdatingName(true);
    try {
      const escapedName = trimmed.replace(/'/g, "''");
      const escapedCode = product.stock_code.replace(/'/g, "''");
      const q = `UPDATE STOKLAR SET sto_isim = '${escapedName}', sto_lastup_date = GETDATE() WHERE sto_kod = '${escapedCode}'; SELECT 1 AS result_fix;`;
      
      const response = await axios.post(API_URL, { query: q }, { timeout: 15000 });
      if (!response.data?.success && response.data?.error) {
        throw new Error(response.data.error);
      }

      const db = dbRef.current;
      if (db) {
        await db.runAsync(
          'UPDATE products SET name = ?, name_normalized = ? WHERE stock_code = ?',
          [trimmed, normalizeText(trimmed), product.stock_code]
        );
      }

      setProduct((prev: any) => prev ? { ...prev, name: trimmed, name_normalized: normalizeText(trimmed) } : null);
      setSearchResults((prev: any[]) => prev.map(p => p.stock_code === product.stock_code ? { ...p, name: trimmed, name_normalized: normalizeText(trimmed) } : p));
      setActiveCart((prev: any[]) => {
        const updated = prev.map(item => item.stock_code === product.stock_code ? { ...item, name: trimmed } : item);
        saveCartToStorage(updated);
        return updated;
      });

      setEditNameModalVisible(false);
      Alert.alert('Başarılı', 'Ürün ismi Mikro ve telefonda güncellendi.');
    } catch (err: any) {
      Alert.alert('Güncelleme Hatası', err.response?.data?.error || err.message || 'İsim güncellenemedi.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  useEffect(() => {
    if (isAppReady && isConnected && !hasInitialSync && autoSync) {
      setHasInitialSync(true);
      handleSync(true);
    }
  }, [isAppReady, isConnected, autoSync, hasInitialSync]);

  const spin = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const handleUpdateDownload = async (url: string) => {
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      const fileUri = (FileSystem as any).documentDirectory + 'SayimApp.apk';

      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (delErr) {}

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {},
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            setDownloadProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
          }
        }
      );
      const result = await downloadResumable.downloadAsync();
      if (result && result.uri) {
        setIsDownloading(false);
        const contentUri = await FileSystem.getContentUriAsync(result.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: 'application/vnd.android.package-archive',
        });
      } else {
        throw new Error('İndirme dosyası alınamadı.');
      }
    } catch (error: any) {
      setIsDownloading(false);
      Alert.alert('İndirme Hatası', `Güncelleme dosyası indirilemedi:\n${error.message || error}`);
    }
  };

  const checkForUpdates = async (silent: boolean = false) => {
    try {
      let updateFound = false;
      let newVersionStr = '';
      let downloadUrl = '';
      let releaseNotes = '';

      // 1. GitHub Releases API kontrolü
      try {
        const ghResponse = await axios.get(GITHUB_RELEASES_API, {
          timeout: 7000,
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache'
          }
        });
        if (ghResponse.data && ghResponse.data.tag_name) {
          const remoteTag = ghResponse.data.tag_name.replace(/^v/i, '').trim();
          if (isNewerVersion(remoteTag, CURRENT_VERSION)) {
            updateFound = true;
            newVersionStr = remoteTag;
            releaseNotes = ghResponse.data.body || 'GitHub üzerinden yeni sürüm yayınlandı.';
            const apkAsset = Array.isArray(ghResponse.data.assets)
              ? ghResponse.data.assets.find((a: any) => a.name && a.name.toLowerCase().endsWith('.apk'))
              : null;
            downloadUrl = apkAsset?.browser_download_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/SayimApp.apk`;
          }
        }
      } catch (ghErr) {
        // GitHub API limiti veya 404 olursa version.json'a geç
      }

      // 2. GitHub Raw version.json kontrolü
      if (!updateFound) {
        try {
          const rawResponse = await axios.get(`${GITHUB_RAW_VERSION_URL}?_t=${Date.now()}`, {
            timeout: 7000,
            headers: { 'Cache-Control': 'no-cache' }
          });
          const serverVersion = rawResponse.data;
          if (serverVersion) {
            const hasNewerCode = Boolean(serverVersion.versionCode && serverVersion.versionCode > CURRENT_VERSION_CODE);
            const hasNewerVer = Boolean(serverVersion.version && isNewerVersion(serverVersion.version, CURRENT_VERSION));
            if (hasNewerCode || hasNewerVer) {
              updateFound = true;
              newVersionStr = serverVersion.version || `v${serverVersion.versionCode}`;
              downloadUrl = serverVersion.url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/SayimApp.apk`;
              releaseNotes = serverVersion.releaseNotes || 'Yeni sürüm yayınlandı.';
            }
          }
        } catch (rawErr) {
          // 3. Fallback yerel sunucu kontrolü
          try {
            const localResponse = await axios.get(`${FALLBACK_UPDATE_URL}?_t=${Date.now()}`, { timeout: 4000 });
            const sVer = localResponse.data;
            if (sVer && sVer.versionCode > CURRENT_VERSION_CODE) {
              updateFound = true;
              newVersionStr = sVer.version || `v${sVer.versionCode}`;
              downloadUrl = sVer.url;
              releaseNotes = sVer.releaseNotes || '';
            }
          } catch (e) {}
        }
      }

      if (updateFound && downloadUrl) {
        Alert.alert(
          '🚀 Güncelleme Mevcut!',
          `Yeni versiyon: ${newVersionStr}\n\n${releaseNotes}`,
          [
            { text: 'Daha Sonra', style: 'cancel' },
            { text: 'Şimdi Güncelle', onPress: () => handleUpdateDownload(downloadUrl) }
          ]
        );
      } else if (!silent) {
        Alert.alert('Uygulama Güncel', `Mevcut versiyonunuz (${CURRENT_VERSION}) en güncel sürümdür.`);
      }
    } catch (error) {
      if (!silent) {
        Alert.alert('Bilgi', 'Güncelleme kontrolü sırasında bağlantı sağlanamadı.');
      }
    }
  };

  useEffect(() => {
    const checkUpdate = async () => {
      const netState = await NetInfo.fetch();
      if (netState.isConnected) setTimeout(() => checkForUpdates(true), 2000);
    };
    checkUpdate();
  }, []);

  const fetchDepoStok = async (stokKodu: string) => {
    setIsLoadingDepoStok(true);
    setShowDepoStok(true);
    try {
      const db = dbRef.current;
      const localResult: any[] = await db.getAllAsync('SELECT depo_no as DepoNo, depo_adi as DepoAdi, miktar as Miktar FROM depo_stoklar WHERE stock_code = ? ORDER BY depo_no', [stokKodu]);
      if (localResult && localResult.length > 0) setDepoStoklar(localResult);
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        try {
          const response = await axios.get(`${API_BASE_URL}/depo-stok/${encodeURIComponent(stokKodu)}`, { timeout: 15000 });
          if (response.data?.success && response.data?.depolar) setDepoStoklar(response.data.depolar);
        } catch (apiError: any) { }
      } else if (localResult.length === 0) {
        Alert.alert('İnternet Yok', 'Depo stok bilgisi için internete bağlanın.', [{ text: 'Tamam' }]);
      }
    } catch (error: any) { setDepoStoklar([]); } finally { setIsLoadingDepoStok(false); }
  };

  const fetchStokHareketleri = async (stockCode: string, isManualRefresh = false) => {
    if (!isConnected) { ToastAndroid.show('İnternet bağlantısı yok!', ToastAndroid.SHORT); return; }
    setIsLoadingHareketler(true);
    if (!isManualRefresh) setShowStokHareketleri(true);
    setStokHareketleri([]);
    
    let extraConditions = '';
    
    if (hkCariFiltre) {
      extraConditions += ` AND ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WHERE cari_kod = sth_cari_kodu), '') LIKE '%${hkCariFiltre}%'`;
    }
    
    if (dateStart) {
      const dStart = `${dateStart.getFullYear()}-${(dateStart.getMonth() + 1).toString().padStart(2, '0')}-${dateStart.getDate().toString().padStart(2, '0')}`;
      extraConditions += ` AND sth_create_date >= '${dStart} 00:00:00'`;
    }
    
    if (dateEnd) {
      const dEnd = `${dateEnd.getFullYear()}-${(dateEnd.getMonth() + 1).toString().padStart(2, '0')}-${dateEnd.getDate().toString().padStart(2, '0')}`;
      extraConditions += ` AND sth_create_date <= '${dEnd} 23:59:59'`;
    }

    try {
      const query = `
        SELECT TOP 50
            CONVERT(varchar, sth_create_date, 104) + ' ' + CONVERT(varchar, sth_create_date, 108) as Tarih,
            sth_tip as Tip,
            ISNULL(sth_evrakno_seri, '') as EvrakSeri,
            ISNULL(sth_evrakno_sira, 0) as EvrakSira,
            sth_miktar as Miktar,
            ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WHERE cari_kod = sth_cari_kodu), '') as CariUnvan,
            ISNULL((SELECT dep_adi FROM DEPOLAR WHERE dep_no = sth_giris_depo_no), '') as GirisDepo,
            ISNULL((SELECT dep_adi FROM DEPOLAR WHERE dep_no = sth_cikis_depo_no), '') as CikisDepo
        FROM STOK_HAREKETLERI
        WHERE sth_stok_kod = '${stockCode}' ${extraConditions}
        ORDER BY sth_create_date DESC
      `;
      const response = await axios.post(API_URL, { query }, { headers: { 'Content-Type': 'application/json' } });
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setStokHareketleri(response.data.data);
      } else {
        ToastAndroid.show('Hareket bulunamadı.', ToastAndroid.SHORT);
      }
    } catch(err) {
      ToastAndroid.show('Hareketler çekilemedi.', ToastAndroid.SHORT);
    } finally {
      setIsLoadingHareketler(false);
    }
  };

  const fetchFaturaDetayi = async (seri: string, sira: number, tip: number) => {
    if (!isConnected) { ToastAndroid.show('İnternet bağlantısı yok!', ToastAndroid.SHORT); return; }
    setIsLoadingFatura(true);
    setShowFaturaModal(true);
    setFaturaDetayi([]);
    setSelectedEvrak({ seri, sira, tip });
    try {
      const query = `
        SELECT 
            ISNULL(s.sto_isim, h.sth_stok_kod) as UrunAdi,
            h.sth_miktar as Miktar,
            ISNULL(s.sto_birim1_ad, 'Adet') as Birim,
            h.sth_tutar as Tutar,
            CASE 
              WHEN h.sth_har_doviz_cinsi = 0 THEN 'TL'
              WHEN h.sth_har_doviz_cinsi = 1 THEN 'USD'
              WHEN h.sth_har_doviz_cinsi = 2 THEN 'EUR'
              WHEN h.sth_har_doviz_cinsi = 3 THEN 'GBP'
              ELSE 'TL'
            END as Doviz
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = h.sth_stok_kod
        WHERE h.sth_evrakno_seri = '${seri}' AND h.sth_evrakno_sira = '${sira}' ${tip !== -1 ? `AND h.sth_tip = ${tip}` : ''}
        ORDER BY h.sth_create_date ASC
      `;
      const response = await axios.post(API_URL, { query }, { headers: { 'Content-Type': 'application/json' } });
      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setFaturaDetayi(response.data.data);
      } else {
        ToastAndroid.show('Fatura detayına ulaşılamadı.', ToastAndroid.SHORT);
        setShowFaturaModal(false);
      }
    } catch(err) {
      ToastAndroid.show('Detaylar çekilemedi.', ToastAndroid.SHORT);
      setShowFaturaModal(false);
    } finally {
      setIsLoadingFatura(false);
    }
  };

  const updateStats = async () => {
    try {
      const db = dbRef.current;
      if (db) {
        const result: any = await db.getFirstAsync('SELECT COUNT(*) as count FROM products');
        setTotalProducts(result?.count || 0);
      }
    } catch (e) { }
  };

  useEffect(() => {
    async function initDB() {
      const db = await SQLite.openDatabaseAsync('sayim_fiyatgor_mikro_v1.db');
      dbRef.current = db;
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS products (
          barcode TEXT PRIMARY KEY NOT NULL, stock_code TEXT, name TEXT, price REAL, currency TEXT, unit TEXT, name_normalized TEXT, lastup_date TEXT, iskonto_orani TEXT
        );
        CREATE TABLE IF NOT EXISTS depo_stoklar (
          id INTEGER PRIMARY KEY AUTOINCREMENT, stock_code TEXT NOT NULL, depo_no TEXT NOT NULL, depo_adi TEXT, miktar REAL DEFAULT 0, UNIQUE(stock_code, depo_no)
        );
        CREATE INDEX IF NOT EXISTS idx_depo_stoklar_stock_code ON depo_stoklar(stock_code);
        CREATE TABLE IF NOT EXISTS sayim_backups (
          id INTEGER PRIMARY KEY AUTOINCREMENT, backup_date TEXT NOT NULL, item_count INTEGER, cart_data TEXT NOT NULL
        );
      `);
      try { await db.execAsync(`ALTER TABLE products ADD COLUMN lastup_date TEXT;`); } catch (e) {}
      try { await db.execAsync(`ALTER TABLE products ADD COLUMN iskonto_orani TEXT;`); } catch (e) {}
      try { await db.execAsync(`ALTER TABLE sayim_backups ADD COLUMN mikro_evrak_no INTEGER;`); } catch (e) {}
      try { await db.execAsync(`ALTER TABLE sayim_backups ADD COLUMN mikro_sent INTEGER DEFAULT 0;`); } catch (e) {}
      await updateStats();
      const depoRes: any[] = await db.getAllAsync('SELECT DISTINCT depo_no, depo_adi FROM depo_stoklar WHERE depo_no IS NOT NULL ORDER BY depo_no');
      setDepos(depoRes || []);
      const savedDepoNo = await AsyncStorage.getItem('selected_depo_no');
      if (savedDepoNo && depoRes) {
        setSelectedDepo(depoRes.find((d: any) => d.depo_no === savedDepoNo) || depoRes[0]);
      } else if (depoRes && depoRes.length > 0) {
        setSelectedDepo(depoRes[0]);
      }
      const cartStr = await AsyncStorage.getItem('sayim_cart');
      if (cartStr) setActiveCart(JSON.parse(cartStr));
      const savedUserNo = await AsyncStorage.getItem('mikro_user_no');
      if (savedUserNo) setMikroUserNo(savedUserNo);

      try {
        const uQ = `SELECT KULLANICI_NO, KULLANICI_ADI FROM KULLANICILAR_VIEW WITH (NOLOCK) ORDER BY KULLANICI_NO ASC`;
        const resU = await axios.post(API_URL, { query: uQ }, { timeout: 10000 });
        if(resU.data && resU.data.data) {
          setMikroUsersList(resU.data.data);
        }
      } catch(e) {}
    }
    initDB();
  }, []);

  const handleSync = async (silent: boolean = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await axios.post(API_URL, { query: MIKRO_SQL_QUERY }, { timeout: 60000 });
      const remoteProducts = response.data?.data;
      if (!remoteProducts) { if (!silent) throw new Error('Sunucudan veri çekilemedi.'); setIsSyncing(false); return; }
      const db = dbRef.current;
      if (db) {
        await db.withTransactionAsync(async () => {
          for (const item of remoteProducts) {
            await db.runAsync(
              'INSERT OR REPLACE INTO products (barcode, stock_code, name, price, currency, unit, name_normalized, lastup_date, iskonto_orani) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [item.barcode, item.stock_code, item.name, parseFloat(item.price) || 0, item.currency || 'TL', item.unit || '', normalizeText(item.name), item.lastup_date || '', item.iskonto_orani || '']
            );
          }
        });
        try {
          const depoResponse = await axios.get(`${API_BASE_URL}/tum-depo-stoklar`, { timeout: 120000 });
          const depoData = depoResponse.data?.data;
          if (depoData && depoData.length > 0) {
            await db.runAsync('DELETE FROM depo_stoklar');
            await db.withTransactionAsync(async () => {
              for (const depo of depoData) {
                await db.runAsync('INSERT OR REPLACE INTO depo_stoklar (stock_code, depo_no, depo_adi, miktar) VALUES (?, ?, ?, ?)',
                  [depo.StokKodu, depo.DepoNo, depo.DepoAdi || '', parseFloat(depo.Miktar) || 0]);
              }
            });
            await updateStats();
            const depoRes: any[] = await db.getAllAsync('SELECT DISTINCT depo_no, depo_adi FROM depo_stoklar WHERE depo_no IS NOT NULL ORDER BY depo_no');
            setDepos(depoRes || []);
            if (!silent) Alert.alert('Tamamlandı', `${remoteProducts.length} ürün ve ${depoData.length} depo stok kaydı güncellendi.`);
          } else {
            await updateStats();
            if (!silent) Alert.alert('Tamamlandı', `${remoteProducts.length} ürün güncellendi. (Depo stok bulunamadı)`);
          }
        } catch (depoError: any) {
          await updateStats();
          if (!silent) Alert.alert('Kısmi Tamamlandı', `${remoteProducts.length} ürün güncellendi.\nDepo stokları alınamadı: ${depoError.message}`);
        }
      }
    } catch (error: any) {
      if (!silent) Alert.alert('Hata', error.message || 'Sunucu hatası.');
    } finally { setIsSyncing(false); }
  };

  const handleBarCodeScanned = async ({ data }: any) => {
    if (scanned || isSyncing) return;
    setScanned(true);
    setWasScannedByCamera(true);
    Vibration.vibrate(100);
    setIsAlreadyReported(false);
    setDepoStoklar([]);
    setShowDepoStok(false);
    setCameraActive(false);

    try {
      const db = dbRef.current;
      const result: any = await db.getFirstAsync('SELECT * FROM products WHERE barcode = ?', [data]);
      if (result) {
        playSound('success');
        setProduct(result);
        setSearchQuery('');
        setSearchResults([]);
        if (result.stock_code && result.stock_code !== '---') fetchDepoStok(result.stock_code);
        setCountInput('1');
        setCountInput('1');
      } else {
        playSound('error');
        setProduct({ barcode: data, name: 'Ürün Bulunamadı', stock_code: '---', price: 0, currency: '', unit: '---' });
      }
    } catch (error) { 
      playSound('error');
      Alert.alert('Hata', 'Sorgu hatası.'); 
    }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    setShowResults(true);
    if (text.length < 2) { setSearchResults([]); return; }
    try {
      const db = dbRef.current;
      const nQuery = normalizeText(text);
      const uText = text.toUpperCase();
      const words = nQuery.split(' ').filter(w => w.length > 0);
      if (words.length > 1) {
        let sql = `SELECT p.*, COALESCE((SELECT SUM(miktar) FROM depo_stoklar WHERE stock_code = p.stock_code${appMode === 'sayim' && selectedDepo ? ` AND depo_no = '${selectedDepo.depo_no}'` : ''}), 0) as toplam_stok FROM products p WHERE `;
        const conditions = words.map(() => 'p.name_normalized LIKE ?');
        sql += conditions.join(' AND ') + ' LIMIT 20';
        const params = words.map(w => `%${w}%`);
        const results = await db.getAllAsync(sql, params);
        setSearchResults(results);
      } else {
        const sql = `SELECT p.*, COALESCE((SELECT SUM(miktar) FROM depo_stoklar WHERE stock_code = p.stock_code${appMode === 'sayim' && selectedDepo ? ` AND depo_no = '${selectedDepo.depo_no}'` : ''}), 0) as toplam_stok FROM products p WHERE p.name_normalized LIKE ? OR UPPER(p.stock_code) LIKE ? OR p.barcode LIKE ? LIMIT 20`;
        const results = await db.getAllAsync(sql, [`%${nQuery}%`, `%${uText}%`, `%${text}%`]);
        setSearchResults(results);
      }
    } catch (error) { }
  };

  const selectProduct = (item: any) => {
    setProduct(item);
    setScanned(true);
    setWasScannedByCamera(false);
    setDepoStoklar([]);
    setShowDepoStok(false);
    setCountInput('1');
    if (item.stock_code && item.stock_code !== '---') fetchDepoStok(item.stock_code);
  };

  const sendReport = async () => {
    if (!product?.barcode || isReporting) return;
    setIsReporting(true);
    try {
      const cleanNote = (reportNote || 'Not yok').trim();
      const message = `🚨 *EKSİK BARKOD BİLDİRİMİ!*\n\n🏷 *Barkod:* ${product.barcode}\n📝 *Not:* ${cleanNote}\n👤 *Bildiren:* ${userName || 'Bilinmiyor'}\n🕒 *Tarih:* ${new Date().toLocaleString('tr-TR')}\n📦 *Sürüm:* ${CURRENT_VERSION}`;
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
      Alert.alert('Başarılı', 'Bildirim iletildi.', [{ text: 'Tamam', onPress: () => { setReportModalVisible(false); setReportNote(''); setProduct(null); setScanned(false); Keyboard.dismiss(); setIsAlreadyReported(true); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } } }]);
    } catch (error: any) {
      Alert.alert('Hata', 'Bildirim gönderilmedi.');
    } finally { setIsReporting(false); }
  };

  const handleBarkodIsleSearch = async (text: string) => {
    setBarkodIsleSearchQuery(text);
    if (text.length < 2) { setBarkodIsleResults([]); return; }
    try {
      const db = dbRef.current;
      const nQuery = normalizeText(text);
      const uText = text.toUpperCase();
      const words = nQuery.split(' ').filter(w => w.length > 0);
      let sql = '';
      let results = [];
      if (words.length > 1) {
        sql = 'SELECT p.* FROM products p WHERE ';
        const conditions = words.map(() => 'p.name_normalized LIKE ?');
        sql += conditions.join(' AND ') + ' LIMIT 20';
        const params = words.map(w => `%${w}%`);
        results = await db.getAllAsync(sql, params);
      } else {
        sql = 'SELECT p.* FROM products p WHERE p.name_normalized LIKE ? OR UPPER(p.stock_code) LIKE ? LIMIT 20';
        results = await db.getAllAsync(sql, [`%${nQuery}%`, `%${uText}%`]);
      }
      setBarkodIsleResults(results);
    } catch(err) {}
  };

  const assignBarkodToStock = async (selectedStok: any) => {
    if (!product || !product.barcode) return;
    setIsProcessingBarkod(true);
    try {
      const q = `INSERT INTO BARKOD_TANIMLARI (bar_Guid, bar_create_date, bar_lastup_date, bar_kodu, bar_stokkodu, bar_birimpntr, bar_bedenpntr, bar_renkpntr) VALUES (NEWID(), GETDATE(), GETDATE(), '${product.barcode}', '${selectedStok.stock_code}', 1, 0, 0); SELECT 1 AS result_fix;`;
      await axios.post(API_URL, { query: q }, { timeout: 10000 });
      
      const db = dbRef.current;
      if (db) {
         await db.runAsync('INSERT OR REPLACE INTO products (barcode, stock_code, name, price, currency, unit, name_normalized, lastup_date, iskonto_orani) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
         [product.barcode, selectedStok.stock_code, selectedStok.name, selectedStok.price, selectedStok.currency, selectedStok.unit, selectedStok.name_normalized, (selectedStok.lastup_date || ''), (selectedStok.iskonto_orani || '')]);
      }
      setProduct({ ...selectedStok, barcode: product.barcode });
      ToastAndroid.show("Barkod başarıyla eşleştirildi!", ToastAndroid.LONG);
      setShowBarkodIsleModal(false);
      setBarkodIsleSearchQuery('');
      setBarkodIsleResults([]);
    } catch(err: any) {
      Alert.alert("Eşleştirme Hatası", "Barkod kayıt edilemedi: " + (err.response?.data?.error || err.message));
    } finally {
      setIsProcessingBarkod(false);
    }
  };

  // --- CARİ İŞLEMLER ---
  const handleCariSearch = async (text: string) => {
    setCariSearchQuery(text);
    if (text.length < 2) { setCariResults([]); return; }
    try {
      const uText = text.toLocaleUpperCase('tr-TR');
      const q = `SELECT TOP 20 cari_kod, cari_unvan1, (SELECT SUM(CASE WHEN cha_tip = 0 THEN cha_meblag ELSE -cha_meblag END) FROM CARI_HESAP_HAREKETLERI WHERE cha_kod = cari_kod) as bakiye FROM CARI_HESAPLAR WHERE cari_unvan1 LIKE '%${uText}%' OR cari_kod LIKE '%${uText}%'`;
      const response = await axios.post(API_URL, { query: q }, { timeout: 15000 });
      if (response.data?.success && response.data?.data) {
        setCariResults(response.data.data);
      }
    } catch (e) { }
  };

  const fetchCariHareketler = async (cari_kod: string) => {
    setIsLoadingCariHar(true);
    setCariHareketler([]);
    try {
      const q = `
        SELECT TOP 100 
          cha_tarihi, 
          cha_evrakno_seri, 
          cha_evrakno_sira, 
          cha_belge_no, 
          cha_meblag, 
          cha_tip, 
          cha_aciklama 
        FROM CARI_HESAP_HAREKETLERI 
        WHERE cha_kod = '${cari_kod}' 
        ORDER BY ISNULL(cha_tarihi, GETDATE()) DESC, cha_create_date DESC
      `;
      const response = await axios.post(API_URL, { query: q }, { timeout: 15000 });
      if (response.data?.success && response.data?.data) {
        setCariHareketler(response.data.data);
      }
    } catch (e) { } finally { 
      setIsLoadingCariHar(false); 
    }
  };

  const handleCariProductSearch = async (text: string) => {
    setCariProductSearchQuery(text);
    if (!text || text.trim().length < 2) {
      setCariProductInvoices([]);
      return;
    }
    if (!selectedCari?.cari_kod) return;
    
    setIsLoadingCariProdInv(true);
    try {
      const clean = text.trim().replace(/'/g, "''");
      const q = `
        SELECT TOP 50
          CONVERT(varchar, h.sth_tarih, 23) as Tarih,
          h.sth_evrakno_seri as Seri,
          h.sth_evrakno_sira as Sira,
          h.sth_tip as Tip,
          CASE 
            WHEN h.sth_tip = 0 THEN 'Alış Faturası'
            WHEN h.sth_tip = 1 THEN 'Satış Faturası'
            ELSE 'Diğer'
          END as EvrakTipi,
          h.sth_stok_kod as StokKodu,
          ISNULL(s.sto_isim, h.sth_stok_kod) as UrunAdi,
          h.sth_miktar as Miktar,
          ISNULL(s.sto_birim1_ad, 'Adet') as Birim,
          h.sth_tutar as Tutar,
          CASE 
            WHEN h.sth_har_doviz_cinsi = 0 THEN 'TL'
            WHEN h.sth_har_doviz_cinsi = 1 THEN 'USD'
            WHEN h.sth_har_doviz_cinsi = 2 THEN 'EUR'
            WHEN h.sth_har_doviz_cinsi = 3 THEN 'GBP'
            ELSE 'TL'
          END as Doviz
        FROM STOK_HAREKETLERI h WITH (NOLOCK)
        LEFT OUTER JOIN STOKLAR s WITH (NOLOCK) ON s.sto_kod = h.sth_stok_kod
        WHERE h.sth_cari_kodu = '${selectedCari.cari_kod}'
          AND (
            h.sth_stok_kod LIKE '%${clean}%' 
            OR s.sto_isim LIKE '%${clean}%'
          )
        ORDER BY h.sth_tarih DESC, h.sth_create_date DESC
      `;
      const response = await axios.post(API_URL, { query: q }, { timeout: 15000 });
      if (response.data?.success && response.data?.data) {
        setCariProductInvoices(response.data.data);
      } else {
        setCariProductInvoices([]);
      }
    } catch (e) {
      setCariProductInvoices([]);
    } finally {
      setIsLoadingCariProdInv(false);
    }
  };

  const selectCari = (cari: any) => {
    setSelectedCari(cari);
    setCariProductSearchQuery('');
    setCariProductInvoices([]);
    setShowCariModal(true);
    fetchCariHareketler(cari.cari_kod);
  };

  // --- SAYIM METHODS ---
  const selectDepoAndSave = async (depo: any) => {
    setSelectedDepo(depo);
    await AsyncStorage.setItem('selected_depo_no', depo.depo_no);
    setShowDepoModal(false);
  };
  const saveCartToStorage = async (newCart: any[]) => {
    setActiveCart([...newCart]);
    await AsyncStorage.setItem('sayim_cart', JSON.stringify(newCart));
  };
  const handleAddToCart = () => {
    if (!product || product.stock_code === '---') return;
    if (appMode === 'sayim' && !selectedDepo) { Alert.alert('Hata', 'Depo seçilmedi.'); return; }
    if (appMode === 'sevk' && (!sevkSourceDepo || !sevkTargetDepo)) { Alert.alert('Hata', 'Çıkış veya Giriş deposu seçilmedi.'); return; }

    const quantity = parseFloat(countInput);
    if (isNaN(quantity) || quantity <= 0) { Alert.alert("Hata", "Lütfen geçerli bir adet giriniz."); return; }
    
    const existingIndex = activeCart.findIndex(c => c.stock_code === product.stock_code);
    let newCart = [...activeCart];
    if (existingIndex >= 0) {
      Alert.alert("Ürün Mevcut", `Bu üründen ${newCart[existingIndex].quantity} adet eklendi. Üzerine ekleyelim mi?`, [
        { text: "İptal", style: "cancel" },
        { text: "Üzerine Ekle", onPress: () => { newCart[existingIndex].quantity += quantity; saveCartToStorage(newCart); ToastAndroid.show("Eklendi!", ToastAndroid.SHORT); setCountInput('1'); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } } },
        { text: "Yeniden Yaz (Ez)", onPress: () => { newCart[existingIndex].quantity = quantity; saveCartToStorage(newCart); ToastAndroid.show("Güncellendi!", ToastAndroid.SHORT); setCountInput('1'); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } } }
      ]);
    } else {
      const isSevk = appMode === 'sevk';
      newCart.unshift({ 
        barcode: product.barcode, 
        stock_code: product.stock_code, 
        name: product.name, 
        depo_no: isSevk ? sevkSourceDepo.depo_no : selectedDepo.depo_no, 
        depo_adi: isSevk ? sevkSourceDepo.depo_adi : selectedDepo.depo_adi, 
        target_depo_no: isSevk ? sevkTargetDepo.depo_no : null,
        target_depo_adi: isSevk ? sevkTargetDepo.depo_adi : null,
        is_sevk: isSevk,
        quantity: quantity, 
        added_at: new Date().toISOString() 
      });
      saveCartToStorage(newCart);
      ToastAndroid.show("Sepete eklendi!", ToastAndroid.SHORT);
      setCountInput('1');
      setProduct(null);
      setScanned(false);
      if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); }
    }
  };
  const generateAndSendExcel = async () => {
    if (activeCart.length === 0) return;
    try {
      const isSevk = appMode === 'sevk';
      
      const proceedToSave = async () => {
        const db = dbRef.current;
        if (db) {
          const cartDataStr = JSON.stringify(activeCart);
          const bDate = new Date().toLocaleString('tr-TR');
          
          if (editingBackupId) {
             await db.runAsync('UPDATE sayim_backups SET backup_date = ?, item_count = ?, cart_data = ?, mikro_sent = 0 WHERE id = ?', 
               [bDate, activeCart.length, cartDataStr, editingBackupId]);
          } else {
             const newEvrakNo = isSevk ? Math.floor(Math.random() * 90000) + 10000 : Math.floor(Math.random() * 900) + 100;
             await db.runAsync('INSERT INTO sayim_backups (backup_date, item_count, cart_data, mikro_evrak_no, mikro_sent) VALUES (?, ?, ?, ?, ?)', 
               [bDate, activeCart.length, cartDataStr, newEvrakNo, 0]);
          }
          
          const backups: any[] = await db.getAllAsync('SELECT id FROM sayim_backups ORDER BY id DESC');
          if (backups.length > 5) {
             const idsToDelete = backups.slice(5).map(b => b.id);
             await db.runAsync(`DELETE FROM sayim_backups WHERE id IN (${idsToDelete.join(',')})`);
          }
        }
        
        Alert.alert("Başarılı", isSevk ? "Sevk sepeti yerel olarak kaydedildi. Ayarlardan aktarabilirsiniz." : "Sayım verileri Telegram'a iletildi.", [{ text: "Uygulamaya Dön", onPress: () => { 
            saveCartToStorage([]); setIsShowingCart(false); setEditingBackupId(null); setEditingEvrakNo(null); setAppMode('menu'); 
        } }]);
      };

      if (!isSevk) {
        const wb = XLSX.utils.book_new();
        const excelData = activeCart.map((item, index) => ({ 'Sıra': index + 1, 'Barkod': item.barcode, 'Stok Kodu': item.stock_code, 'Ürün Adı': item.name, 'Depo No': item.depo_no, 'Depo Adı': item.depo_adi, 'Sayım Adedi': item.quantity, 'Sayan Kişi': userName, 'Tarih': new Date(item.added_at).toLocaleString('tr-TR') }));
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, "Sayım");
        const wbout = XLSX.write(wb, { type: 'base64', bookType: "xlsx" });
        const dateStr = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
        const depoNameSafe = selectedDepo ? selectedDepo.depo_adi.replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ]/gi, '_') : 'Depo';
        const fileName = `${depoNameSafe}-${dateStr}_Sayim.xlsx`;
        const uri = (FileSystem as any).documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(uri, wbout, { encoding: 'base64' });

        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('document', {
          uri: uri,
          name: fileName,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        } as any);

        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
          method: 'POST',
          headers: { 'Content-Type': 'multipart/form-data' },
          body: form
        });

        const resJson = await res.json();
        
        if (resJson.ok) {
          await proceedToSave();
        } else {
          Alert.alert("Hata", "Dosya Telegram'a iletilemedi: " + (resJson.description || 'Bilinmeyen Hata'));
        }
      } else {
        await proceedToSave();
      }
    } catch (e: any) {
      Alert.alert("Hata", "İşlem kaydedilemedi: " + e.message);
    }
  };

  const sendBackupToMikro = async (backupItem: any) => {
    let mikroAktarimHataMesaji = '';
    try {
      if (!backupItem.cart_data) return;
      const cartItems = JSON.parse(backupItem.cart_data);
      if (cartItems.length === 0) return;

      const d = new Date();
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const h = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      const s = d.getSeconds().toString().padStart(2, '0');
      const sqlDateTarihYaliniz = `'${y}${m}${day}'`;
      const sqlDateTime = `'${y}-${m}-${day} ${h}:${min}:${s}'`; 

      const isSevkList = cartItems[0].is_sevk;
      const evrakSeri = isSevkList ? '1' : 'MOB';
      let targetEvrakNo = backupItem.mikro_evrak_no;

      if (isSevkList) {
        try {
          const seqQ = `SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS NextSira FROM STOK_HAREKETLERI WITH (NOLOCK) WHERE sth_evrakno_seri = '${evrakSeri}' AND sth_tip = 2 AND sth_cins = 6`;
          const seqRes = await axios.post(API_URL, { query: seqQ });
          if (seqRes.data && seqRes.data.data && seqRes.data.data.length > 0) {
            targetEvrakNo = seqRes.data.data[0].NextSira;
            const db = dbRef.current;
            if(db) await db.runAsync('UPDATE sayim_backups SET mikro_evrak_no = ? WHERE id = ?', [targetEvrakNo, backupItem.id]);
          }
        } catch(e) {}
      }

      if (!targetEvrakNo) {
        targetEvrakNo = isSevkList ? Math.floor(Math.random() * 90000) + 10000 : Math.floor(Math.random() * 900) + 100;
        const db = dbRef.current;
        if(db) await db.runAsync('UPDATE sayim_backups SET mikro_evrak_no = ? WHERE id = ?', [targetEvrakNo, backupItem.id]);
      }

      const depoNoForDelete = cartItems[0].depo_no;
      let sqlQueries = '';

      if (isSevkList) {
        sqlQueries = `DELETE FROM STOK_HAREKETLERI WHERE sth_evrakno_seri = '${evrakSeri}' AND sth_evrakno_sira = ${targetEvrakNo} AND sth_cins = 6;\n`;
        sqlQueries += cartItems.map((item: any, index: number) => {
          return `INSERT INTO STOK_HAREKETLERI (sth_Guid, sth_DBCno, sth_SpecRECno, sth_iptal, sth_fileid, sth_hidden, sth_kilitli, sth_degisti, sth_checksum, sth_create_user, sth_create_date, sth_lastup_user, sth_lastup_date, sth_special1, sth_special2, sth_special3, sth_MainProgramNo, sth_VersionNo, sth_MenuNo, sth_MikroSpecial1, sth_MikroSpecial2, sth_MikroSpecial3, sth_ExternalProgramType, sth_ExternalProgramId, sth_Hash, sth_firmano, sth_subeno, sth_tarih, sth_tip, sth_cins, sth_normal_iade, sth_evraktip, sth_evrakno_seri, sth_evrakno_sira, sth_satirno, sth_belge_no, sth_belge_tarih, sth_stok_kod, sth_isk_mas1, sth_isk_mas2, sth_isk_mas3, sth_isk_mas4, sth_isk_mas5, sth_isk_mas6, sth_isk_mas7, sth_isk_mas8, sth_isk_mas9, sth_isk_mas10, sth_sat_iskmas1, sth_sat_iskmas2, sth_sat_iskmas3, sth_sat_iskmas4, sth_sat_iskmas5, sth_sat_iskmas6, sth_sat_iskmas7, sth_sat_iskmas8, sth_sat_iskmas9, sth_sat_iskmas10, sth_pos_satis, sth_promosyon_fl, sth_cari_cinsi, sth_cari_kodu, sth_cari_grup_no, sth_isemri_gider_kodu, sth_plasiyer_kodu, sth_har_doviz_cinsi, sth_har_doviz_kuru, sth_alt_doviz_kuru, sth_stok_doviz_cinsi, sth_stok_doviz_kuru, sth_miktar, sth_miktar2, sth_birim_pntr, sth_birimfiyat, sth_tutar, sth_iskonto1, sth_iskonto2, sth_iskonto3, sth_iskonto4, sth_iskonto5, sth_iskonto6, sth_masraf1, sth_masraf2, sth_masraf3, sth_masraf4, sth_vergi_pntr, sth_vergi, sth_masraf_vergi_pntr, sth_masraf_vergi, sth_netagirlik, sth_odeme_op, sth_aciklama, sth_sip_uid, sth_fat_uid, sth_giris_depo_no, sth_cikis_depo_no, sth_malkbl_sevk_tarihi, sth_cari_srm_merkezi, sth_stok_srm_merkezi, sth_fis_tarihi, sth_fis_sirano, sth_vergisiz_fl, sth_maliyet_ana, sth_maliyet_alternatif, sth_maliyet_orjinal, sth_adres_no, sth_parti_kodu, sth_lot_no, sth_kons_uid, sth_proje_kodu, sth_exim_kodu, sth_otv_pntr, sth_otv_vergi, sth_brutagirlik, sth_disticaret_turu, sth_otvtutari, sth_otvvergisiz_fl, sth_oiv_pntr, sth_oiv_vergi, sth_oivvergisiz_fl, sth_fiyat_liste_no, sth_oivtutari, sth_Tevkifat_turu, sth_nakliyedeposu, sth_nakliyedurumu, sth_yetkili_uid, sth_taxfree_fl, sth_ilave_edilecek_kdv, sth_ismerkezi_kodu, sth_HareketGrupKodu1, sth_HareketGrupKodu2, sth_HareketGrupKodu3, sth_Olcu1, sth_Olcu2, sth_Olcu3, sth_Olcu4, sth_Olcu5, sth_FormulMiktarNo, sth_FormulMiktar, sth_eirs_senaryo, sth_eirs_tipi, sth_teslim_tarihi, sth_matbu_fl, sth_satis_fiyat_doviz_cinsi, sth_satis_fiyat_doviz_kuru, sth_eticaret_kanal_kodu, sth_bagli_ithalat_kodu, sth_tevkifat_sifirlandi_fl) VALUES (NEWID(), 0, 0, 0, 16, 0, 0, 0, 0, ${parseInt(mikroUserNo) || 7}, ${sqlDateTime}, ${parseInt(mikroUserNo) || 7}, ${sqlDateTime}, '', '', '', 21, '17.05d', 12500, '', '', '', 0, '', '', 0, 0, ${sqlDateTarihYaliniz}, 2, 6, 0, 2, '${evrakSeri}', ${targetEvrakNo}, ${index}, '', ${sqlDateTarihYaliniz}, '${item.stock_code}', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', 0, '', '', 0, 1, 1, 0, 1, ${item.quantity.toString().replace(',', '.')}, ${item.quantity.toString().replace(',', '.')}, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', ${item.target_depo_no}, ${item.depo_no}, ${sqlDateTarihYaliniz}, '', '', '1899-12-30', 0, 0, 0, 0, 0, 1, '', 0, '00000000-0000-0000-0000-000000000000', '', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '00000000-0000-0000-0000-000000000000', 0, 0, '', '', '', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, ${sqlDateTarihYaliniz}, 0, 0, 0, '', '', 0);`;
        }).join('\n') + '\nSELECT 1 AS result_fix;';
      } else {
        sqlQueries = `DELETE FROM SAYIM_SONUCLARI WHERE sym_evrakno = ${targetEvrakNo} AND sym_depono = ${depoNoForDelete};\n`;
        sqlQueries += cartItems.map((item: any, index: number) => {
          return `INSERT INTO SAYIM_SONUCLARI (
              sym_Guid, sym_DBCno, sym_SpecRECno, sym_iptal, sym_fileid, sym_hidden, sym_kilitli, sym_degisti, sym_checksum,
              sym_create_user, sym_create_date, sym_lastup_user, sym_lastup_date,
              sym_special1, sym_special2, sym_special3,
              sym_tarihi, sym_depono, sym_evrakno, sym_satirno,
              sym_Stokkodu, sym_reyonkodu, sym_koridorkodu, sym_rafkodu,
              sym_miktar1, sym_miktar2, sym_miktar3, sym_miktar4, sym_miktar5,
              sym_birim_pntr, sym_barkod, sym_renkno, sym_bedenno, sym_parti_kodu, sym_lot_no, sym_serino
          ) VALUES (
              NEWID(), 0, 0, 0, 28, 0, 0, 0, 0,
              ${parseInt(mikroUserNo) || 7}, ${sqlDateTime}, ${parseInt(mikroUserNo) || 7}, ${sqlDateTime},
              'MOBIL', '', '',
              ${sqlDateTarihYaliniz}, ${item.depo_no}, ${targetEvrakNo}, ${index + 1},
              '${item.stock_code}', '0', '0', '0',
              ${item.quantity.toString().replace(',', '.')}, 0, 0, 0, 0,
              1, '', 0, 0, '', 0, ''
          );`;
        }).join('\n') + '\nSELECT 1 AS result_fix;';
      }
      
      await axios.post(API_URL, { query: sqlQueries }, { timeout: 15000 });
      
      const db = dbRef.current;
      if(db) await db.runAsync('UPDATE sayim_backups SET mikro_sent = 1 WHERE id = ?', [backupItem.id]);
      
      // Update ui list
      setSayimBackups(prev => prev.map(p => p.id === backupItem.id ? {...p, mikro_sent: 1} : p));

      ToastAndroid.show(`Mikro'ya başarıyla gönderildi! (Seri: ${evrakSeri} Sıra: ${targetEvrakNo})`, ToastAndroid.LONG);
    } catch (err: any) {
      mikroAktarimHataMesaji = err.response?.data?.error || err.message;
      Alert.alert("Mikro Aktarım Hatası", mikroAktarimHataMesaji);
    }
  };
  // -------------------------

  if (!permission) return <View style={styles.centered}><ActivityIndicator color={isDark ? "#3B82F6" : "#1E40AF"} /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <TouchableOpacity style={styles.nextButton} onPress={requestPermission}><Text style={styles.buttonText}>Kameraya İzin Ver</Text></TouchableOpacity>
      </View>
    );
  }

  if (showUserNameModal) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={styles.userNameContainer}>
          <Ionicons name="person-circle-outline" size={80} color={isDark ? "#3B82F6" : "#1E40AF"} />
          <Text style={styles.userNameTitle}>Hoş Geldiniz!</Text>
          <Text style={styles.userNameSubtitle}>Lütfen adınızı girin</Text>
          <TextInput style={styles.userNameInput} placeholder="Adınız..." placeholderTextColor="#8a9ab5" value={userNameInput} onChangeText={(t) => setUserNameInput(t.toLocaleUpperCase('tr-TR'))} autoCapitalize="characters" autoFocus />
          <TouchableOpacity style={styles.userNameButton} onPress={saveUserName}><Text style={styles.userNameButtonText}>KAYDET VE DEVAM ET</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isDownloading) {
    return (
      <View style={styles.centered}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Ionicons name="cloud-download-outline" size={80} color={isDark ? "#3B82F6" : "#1E40AF"} />
        <Text style={{ color: isDark ? '#fff' : '#1e293b', marginTop: 20, fontSize: 18, fontWeight: 'bold' }}>Güncelleme İndiriliyor...</Text>
        <Text style={{ color: '#ff6b00', marginTop: 10, fontSize: 24, fontWeight: 'bold' }}>%{(downloadProgress * 100).toFixed(0)}</Text>
        <View style={{ width: '70%', height: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 3, marginTop: 20, overflow: 'hidden' }}>
          <View style={{ width: `${downloadProgress * 100}%`, height: '100%', backgroundColor: '#ff6b00' }} />
        </View>
      </View>
    );
  }

  if (appMode === 'menu') {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        
        {/* Background Decorative Elements */}
        <View style={{ position: 'absolute', top: -100, left: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)' }} />
        <View style={{ position: 'absolute', bottom: -150, right: -50, width: 400, height: 400, borderRadius: 200, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(16, 185, 129, 0.05)' }} />
        <View style={{ position: 'absolute', top: 150, right: -80, width: 160, height: 160, borderRadius: 80, backgroundColor: isDark ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.05)' }} />

        <Image source={require('./assets/icon.png')} style={{ width: 130, height: 130, marginBottom: 20, borderRadius: 32, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }} />
        <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 26, fontWeight: '900', marginBottom: 50, letterSpacing: -0.5 }}>MD Sayım & Stok</Text>
        
        <View style={{ width: '90%' }}>
          <TouchableOpacity onPress={() => !isSyncing && setAppMode('fiyatgor')} disabled={isSyncing} 
            style={{ backgroundColor: isDark ? '#1E293B' : '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, opacity: isSyncing ? 0.5 : 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5, marginBottom: 15 }}>
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(59, 130, 246, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
               <Ionicons name="search-outline" size={28} color="#3B82F6" />
            </View>
            <View style={{flex: 1}}>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: 'bold' }}>Fiyat & Stok Bilgisi</Text>
              <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>Ürün detayları, barkod ve anlık depo stokları</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => { if (!isSyncing) { setAppMode('sayim'); setShowDepoModal(true); } }} disabled={isSyncing} 
            style={{ backgroundColor: isDark ? '#1E293B' : '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, opacity: isSyncing ? 0.5 : 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5, marginBottom: 15 }}>
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(16, 185, 129, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
               <Ionicons name="barcode-outline" size={28} color="#10B981" />
            </View>
            <View style={{flex: 1}}>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: 'bold' }}>Depo Sayım Modu</Text>
              <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>Depodaki stokları hızlı barkod ile sayın</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => { if (!isSyncing) { setAppMode('sevk'); setShowSevkSourceModal(true); } }} disabled={isSyncing} 
            style={{ backgroundColor: isDark ? '#1E293B' : '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, opacity: isSyncing ? 0.5 : 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5, marginBottom: 15 }}>
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(249, 115, 22, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
               <Ionicons name="swap-horizontal-outline" size={28} color="#F97316" />
            </View>
            <View style={{flex: 1}}>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: 'bold' }}>Depolar Arası Sevk</Text>
              <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>Farklı depolar arasında ürün transferi</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { if (!isSyncing) { setAppMode('cari'); setCariSearchQuery(''); setCariResults([]); } }} disabled={isSyncing} 
            style={{ backgroundColor: isDark ? '#1E293B' : '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, opacity: isSyncing ? 0.5 : 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5, marginBottom: 15 }}>
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(168, 85, 247, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
               <Ionicons name="people-outline" size={28} color="#A855F7" />
            </View>
            <View style={{flex: 1}}>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: 'bold' }}>Cari İşlemler</Text>
              <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>Müşteri / Tedarikçi bakiyeleri ve hareketleri</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { if (!isSyncing) { setAppMode('raporlar'); } }} disabled={isSyncing} 
            style={{ backgroundColor: isDark ? '#1E293B' : '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 24, opacity: isSyncing ? 0.5 : 1, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5 }}>
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: 'rgba(99, 102, 241, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
               <Ionicons name="bar-chart-outline" size={28} color="#6366F1" />
            </View>
            <View style={{flex: 1}}>
              <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 17, fontWeight: 'bold' }}>Raporlama & Analiz</Text>
              <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>Geliş tarihi, faturalar ve satış raporları</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => !isSyncing && handleSync(false)} disabled={isSyncing} 
          style={{ marginTop: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 }}>
          <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : undefined}><Ionicons name='sync' size={20} color={isDark ? '#cbd5e1' : '#64748b'} /></Animated.View>
          <Text style={{ color: isDark ? '#cbd5e1' : '#64748b', marginLeft: 10, fontWeight: '600' }}>Verileri Senkronize Et</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={async () => {
          if (dbRef.current) {
            const backups = await dbRef.current.getAllAsync('SELECT * FROM sayim_backups ORDER BY id DESC');
            setSayimBackups(backups || []);
          }
          setShowSettingsModal(true);
        }} style={{ position: 'absolute', top: 50, right: 30, padding: 10 }}>
          <Ionicons name="settings-outline" size={28} color={isDark ? '#fff' : '#000'} />
        </TouchableOpacity>

        <View style={{ position: 'absolute', bottom: 30, alignItems: 'center' }}>
          <Text style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', fontSize: 12, fontWeight: 'bold' }}>Design by Hasan Kaynak | v{CURRENT_VERSION}</Text>
        </View>

        <Modal isVisible={showSettingsModal} onBackdropPress={() => setShowSettingsModal(false)} style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ayarlar</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={28} color="#8a9ab5" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#eee' }}>
              <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>Açılışta Otomatik Senkronizasyon</Text>
              <TouchableOpacity onPress={async () => { const newVal = !autoSync; setAutoSync(newVal); await AsyncStorage.setItem('autoSync', newVal ? 'true' : 'false'); }}>
                <Ionicons name={autoSync ? 'toggle' : 'toggle-outline'} size={40} color={autoSync ? '#10B981' : '#ccc'} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#eee' }}>
              <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>Karanlık Tema (Dark Mode)</Text>
              <TouchableOpacity onPress={() => setManualTheme(prev => prev === 'dark' ? 'light' : 'dark')}>
                <Ionicons name={isDark ? 'toggle' : 'toggle-outline'} size={40} color={isDark ? '#10B981' : '#ccc'} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#eee' }}>
              <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>Mikro Kullanıcı Numarası</Text>
              <TouchableOpacity onPress={() => { setShowSettingsModal(false); setTimeout(() => setShowUserSelectModal(true), 400); }} style={{ backgroundColor: '#10B981', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Ayarla: {mikroUserNo}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#eee' }}>
              <View>
                <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16 }}>Uygulama Güncellemesi</Text>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Mevcut Sürüm: v{CURRENT_VERSION}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(false);
                  setTimeout(() => checkForUpdates(false), 400);
                }}
                style={{ backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>KONTROL ET</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: isDark ? '#fff' : '#000', marginBottom: 10 }}>Son Gönderilen Sayım Yedekleri</Text>
              {sayimBackups.length === 0 ? (
                <Text style={{ color: '#888', fontStyle: 'italic' }}>Henüz yedeklenmiş bir sayım yok.</Text>
              ) : (
                <FlatList data={sayimBackups} keyExtractor={item => String(item.id)} renderItem={({ item }) => (
                  <View style={{ borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold' }}>{item.backup_date}</Text>
                      <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Toplam: {item.item_count} ürün</Text>
                      <Text style={{ color: '#FF6B00', fontSize: 11, fontWeight: 'bold', marginTop: 2 }} numberOfLines={2}>{(() => {
                        try {
                          const cd = JSON.parse(item.cart_data);
                          const isSevk = cd.length > 0 && cd[0].is_sevk;
                          const nameStr = isSevk ? `Çıkış: ${cd[0].depo_adi} ➔ Giriş: ${cd[0].target_depo_adi}` : (cd.length > 0 ? cd[0].depo_adi : '');
                          return nameStr + (item.mikro_evrak_no ? ` • MOB ${item.mikro_evrak_no}` : '');
                        } catch (e) { return ''; }
                      })()}</Text>
                      {item.mikro_sent === 1 && <Text style={{ color: '#10B981', fontSize: 10, marginTop: 1, fontWeight: 'bold' }}>✓ Mikro'ya Gönderildi</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity onPress={() => {
                          Alert.alert('Düzenle', `${item.backup_date} tarihli sayım yedeğini düzenlemek istediğinize emin misiniz? Mevcut sepetiniz silinecek.`, [
                            { text: 'İptal', style: 'cancel' },
                            { text: 'Düzenle', onPress: () => {
                                try {
                                  const parsedCart = JSON.parse(item.cart_data);
                                  saveCartToStorage(parsedCart);
                                  setEditingBackupId(item.id);
                                  setEditingEvrakNo(item.mikro_evrak_no);
                                  
                                  if (parsedCart.length > 0) {
                                    const firstItem = parsedCart[0];
                                    if (firstItem.is_sevk) {
                                      setAppMode('sevk');
                                      setSevkSourceDepo({ depo_no: firstItem.depo_no, depo_adi: firstItem.depo_adi });
                                      setSevkTargetDepo({ depo_no: firstItem.target_depo_no, depo_adi: firstItem.target_depo_adi });
                                    } else {
                                      setAppMode('sayim');
                                      setSelectedDepo({ depo_no: firstItem.depo_no, depo_adi: firstItem.depo_adi });
                                    }
                                  }

                                  setShowSettingsModal(false);
                                  setIsShowingCart(true);
                                  ToastAndroid.show('Yedek sepetinize yüklendi.', ToastAndroid.SHORT);
                                } catch (e) {
                                  Alert.alert('Hata', 'Yedek okunamadı.');
                                }
                              } 
                            }
                          ]);
                      }} style={{ backgroundColor: '#64748B', padding: 8, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>DÜZENLE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )} />
              )}
            </View>

          </View>
        </Modal>

        {/* USER SELECT (KULLANICI SEÇİM) MODAL */}
        <Modal isVisible={showUserSelectModal} onBackdropPress={() => setShowUserSelectModal(false)} style={styles.modal} avoidKeyboard={true}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Aktif Kullanıcı Seçimi</Text>
              <TouchableOpacity onPress={() => setShowUserSelectModal(false)}>
                <Ionicons name="close-circle" size={32} color={isDark ? "#EF4444" : "#EF4444"} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={mikroUsersList.length > 0 ? mikroUsersList : Array.from({ length: 30 }, (_, i) => ({ KULLANICI_NO: i + 1, KULLANICI_ADI: `Kullanıcı ${i + 1}` }))}
              keyExtractor={item => String(item.KULLANICI_NO)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={async () => {
                  const uid = item.KULLANICI_NO.toString();
                  setMikroUserNo(uid);
                  await AsyncStorage.setItem('mikro_user_no', uid);
                  setShowUserSelectModal(false);
                }} style={{ paddingVertical: 15, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16, fontWeight: 'bold' }}>{item.KULLANICI_ADI} (ID: {item.KULLANICI_NO})</Text>
                  {mikroUserNo === item.KULLANICI_NO.toString() && <Ionicons name="checkmark-circle" size={24} color="#10B981" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>
      </View>
    );
  }

  if (appMode === 'raporlar') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ReportsView
          isDark={isDark}
          isConnected={isConnected}
          dbRef={dbRef}
          API_URL={API_URL}
          onBackToMenu={() => setAppMode('menu')}
          formatPrice={formatPrice}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => { setAppMode('menu'); setIsShowingCart(false); setCameraActive(false); }}>
            <Ionicons name='apps' size={24} color={isDark ? '#3B82F6' : '#1E40AF'} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {appMode === 'sayim' && selectedDepo ?
              <TouchableOpacity onPress={() => setShowDepoModal(true)} style={{ alignItems: 'center', maxWidth: '90%' }}>
                <Text style={styles.headerTitle}>SAYIM</Text>
                <Text style={[styles.headerTitle, { fontSize: 13, marginTop: -2, color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{selectedDepo.depo_adi}</Text>
              </TouchableOpacity> : null}
            {appMode === 'sevk' && sevkSourceDepo && sevkTargetDepo ?
              <TouchableOpacity onPress={() => setShowSevkSourceModal(true)} style={{ alignItems: 'center', maxWidth: '90%' }}>
                <Text style={[styles.headerTitle, { color: '#FF6B00' }]}>TRANSFER</Text>
                <Text style={[styles.headerTitle, { fontSize: 11, marginTop: -2, color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>ÇIKIŞ: {sevkSourceDepo.depo_adi}</Text>
                <Text style={[styles.headerTitle, { fontSize: 11, color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>GİRİŞ: {sevkTargetDepo.depo_adi}</Text>
              </TouchableOpacity> : null}
            {appMode === 'fiyatgor' && <Text style={styles.headerTitle}>Fiyat & Stok Bilgisi</Text>}
            {appMode === 'cari' && <Text style={styles.headerTitle}>Cari İşlemler</Text>}
            <Text style={styles.headerSubtitle}>Design by Hasan Kaynak | v{CURRENT_VERSION}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(appMode === 'sayim' || appMode === 'sevk') && (
              <TouchableOpacity style={styles.headerBtn} onPress={() => { setIsShowingCart(true); setCameraActive(false); }}>
                <Ionicons name='cart' size={24} color={isDark ? '#3B82F6' : '#1E40AF'} />
                {activeCart.length > 0 && <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: 'red', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{activeCart.length}</Text></View>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.headerBtn, cameraActive && styles.headerBtnActive]} onPress={() => { setCameraActive(!cameraActive); if (!cameraActive) { setScanned(false); setProduct(null); setIsShowingCart(false); } }}>
              <Ionicons name={cameraActive ? "barcode" : "barcode-outline"} size={24} color={cameraActive ? "#fff" : (isDark ? "#3B82F6" : "#1E40AF")} />
            </TouchableOpacity>
          </View>
        </View>

        {cameraActive && (
          <View style={styles.cameraBox}>
            <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} enableTorch={torch} />
            <View style={styles.overlay}>
              {!scanned && <View style={styles.targetFrame} />}
            </View>
            <TouchableOpacity style={[styles.flashBtn, torch && styles.flashBtnActive]} onPress={() => setTorch(!torch)}>
              <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={20} color={torch ? "#fff" : "#ff6b00"} />
            </TouchableOpacity>
          </View>
        )}

        {isSyncing && (
          <View style={styles.syncBanner}>
            <ActivityIndicator size="small" color={isDark ? "#3B82F6" : "#1E40AF"} />
            <Text style={styles.syncBannerText}>Veriler güncelleniyor...</Text>
          </View>
        )}

        {isShowingCart ? (
          <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setIsShowingCart(false)}><Ionicons name='arrow-back' size={28} color={isDark ? '#fff' : '#000'} /></TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: 'bold', marginLeft: 15, color: isDark ? '#fff' : '#000' }}>Sepetiniz ({activeCart.length} kalem)</Text>
              </View>
              {activeCart.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity onPress={() => { Alert.alert("Emin Misiniz?", "Tüm sepet silinecek olaylıyor musunuz?", [{ text: "İptal", style: "cancel" }, { text: "Evet, Sil", onPress: () => saveCartToStorage([]) }]) }} style={{ padding: 8, backgroundColor: '#EF4444', borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>TEMİZLE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TextInput
              style={{ backgroundColor: isDark ? '#333' : '#F1F5F9', color: isDark ? '#fff' : '#000', padding: 15, borderRadius: 12, marginBottom: 15 }}
              placeholder="Sepette ürün ara (Ad, Stok Kodu...)"
              placeholderTextColor="#8a9ab5"
              value={cartSearchQuery}
              onChangeText={(t) => setCartSearchQuery(t.toLocaleUpperCase('tr-TR'))}
              autoCapitalize="characters"
            />
            <FlatList data={activeCart.filter(item => item.name.toLowerCase().includes(cartSearchQuery.toLowerCase()) || item.stock_code.toLowerCase().includes(cartSearchQuery.toLowerCase()) || (item.barcode && item.barcode.includes(cartSearchQuery)))} keyExtractor={item => item.stock_code} renderItem={({ item }) => (
              <View style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: isDark ? '#333' : '#ccc', flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold' }}>{item.name}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>{appMode === 'sevk' ? `Çıkış: ${item.depo_adi} -> Giriş: ${item.target_depo_adi}` : `Depo: ${item.depo_adi}`}</Text>
                </View>
                <TextInput
                  style={{ color: appMode === 'sevk' ? '#FF6B00' : '#10B981', fontSize: 18, fontWeight: 'bold', marginRight: 15, minWidth: 50, textAlign: 'center', backgroundColor: isDark ? '#333' : '#eee', borderRadius: 8, padding: 5 }}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(val) => {
                    const num = parseFloat(val);
                    setActiveCart(prev => {
                      const updated = prev.map(c => c.stock_code === item.stock_code ? { ...c, quantity: isNaN(num) ? '' : num } : c);
                      AsyncStorage.setItem('sayim_cart', JSON.stringify(updated));
                      return updated as any[];
                    });
                  }}
                />
                <TouchableOpacity onPress={() => saveCartToStorage(activeCart.filter(c => c.stock_code !== item.stock_code))}><Ionicons name='trash' size={24} color='#EF4444' /></TouchableOpacity>
              </View>
            )} />
            <TouchableOpacity style={{ backgroundColor: appMode === 'sevk' ? '#FF6B00' : '#10B981', padding: 20, borderRadius: 20, alignItems: 'center' }} onPress={generateAndSendExcel}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>BİTİR VE KAYDET</Text>
            </TouchableOpacity>
          </View>
        ) : appMode !== 'cari' ? (
          <View style={styles.resultPanel}>
            <View style={styles.searchContainer}>
              <TextInput style={[styles.searchInput, { flex: 1, paddingRight: 40 }]} placeholder="Ad, stok kodu veya barkod ile ara..." placeholderTextColor="#8a9ab5" value={searchQuery} onChangeText={(text) => handleSearch(text.toLocaleUpperCase('tr-TR'))} autoCapitalize="characters" />
              <TouchableOpacity onPress={handleSpeechStart} style={styles.micSearch}>
                <Ionicons name={isListening ? "mic" : "mic-outline"} size={22} color={isListening ? "#EF4444" : (isDark ? "#3B82F6" : "#1E40AF")} />
              </TouchableOpacity>
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); setShowResults(true); }} style={styles.clearSearch}>
                  <Ionicons name="close-circle" size={22} color={isDark ? "#3B82F6" : "#1E40AF"} />
                </TouchableOpacity>
              )}
            </View>

            {searchResults.length > 0 && showResults ? (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.barcode}
                style={styles.searchResultsList}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.searchResultItem} onPress={() => selectProduct(item)}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={[styles.searchResultName, { fontSize: 13, flexWrap: 'wrap' }]}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        <Text style={styles.searchResultDetail}>{item.stock_code} - {formatPrice(item.price)} {item.currency}</Text>
                        {!!item.iskonto_orani && (
                          <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 0.5, borderColor: '#EF4444' }}>
                            <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: 'bold' }}>İSK: {item.iskonto_orani.replace(/^%/, '')}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.stokBadge}>
                      <Text style={[styles.stokBadgeText, (item.toplam_stok || 0) <= 0 && styles.stokBadgeTextZero]}>{formatPrice(item.toplam_stok || 0)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={isDark ? "#3B82F6" : "#1E40AF"} />
                  </TouchableOpacity>
                )}
                keyboardShouldPersistTaps="handled"
              />
            ) : (
              <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.idleState}>
                  <Ionicons name="barcode-outline" size={60} color="rgba(255, 107, 0, 0.3)" />
                  <Text style={styles.idleText}>Barkod taramak için sağ üstteki</Text>
                  <Text style={styles.idleText}>barkod butonuna basınız.</Text>
                </View>
              </ScrollView>
            )}
          </View>
        ) : null}

        {appMode === 'cari' && (
          <View style={styles.resultPanel}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#8a9ab5" style={{ marginRight: 10 }} />
              <TextInput 
                style={[styles.searchInput, { flex: 1, paddingRight: 40 }]} 
                placeholder="Cari Unvan veya Kod Ara..." 
                placeholderTextColor="#8a9ab5" 
                value={cariSearchQuery} 
                onChangeText={handleCariSearch} 
                autoCapitalize="characters" 
              />
              {cariSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setCariSearchQuery(''); setCariResults([]); }} style={styles.clearSearch}>
                  <Ionicons name="close-circle" size={22} color={isDark ? "#3B82F6" : "#1E40AF"} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={cariResults}
              keyExtractor={(item) => item.cari_kod}
              style={styles.searchResultsList}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.searchResultItem, {flexDirection:'column', alignItems:'stretch'}]} onPress={() => selectCari(item)}>
                  <View style={{ flex: 1, marginBottom: 5 }}>
                    <Text style={[styles.searchResultName, { fontSize: 14, flexWrap: 'wrap' }]}>{item.cari_unvan1}</Text>
                    <Text style={[styles.searchResultDetail, { marginTop: 4 }]}>{item.cari_kod}</Text>
                  </View>
                  <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                    <Text style={{fontSize: 12, color:'#888'}}>{(item.bakiye || 0) > 0 ? 'MÜŞTERİ BİZE BORÇLU' : ((item.bakiye || 0) < 0 ? 'FİRMA ALACAKLI' : 'KAPANMIŞ/SIFIR')}</Text>
                    <Text style={{fontWeight:'bold', fontSize: 16, color: (item.bakiye || 0) > 0 ? '#EF4444' : ((item.bakiye || 0) < 0 ? '#10B981' : '#888')}}>
                      {formatPrice(Math.abs(item.bakiye || 0))} TL
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={() => (
                <View style={{padding: 30, alignItems: 'center'}}>
                  <Ionicons name="people-outline" size={48} color="#8a9ab5" style={{marginBottom: 10, opacity: 0.5}} />
                  <Text style={{color: '#8a9ab5', textAlign: 'center'}}>Detayını görmek istediğiniz Cari'nin adını veya kodunu yazarak arayın.</Text>
                </View>
              )}
            />
          </View>
        )}

        <Modal isVisible={!!product} onBackdropPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }} onBackButtonPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }} style={styles.modal} backdropOpacity={0.7} avoidKeyboard={true}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalContent, { padding: 15, maxHeight: '95%', minHeight: '65%' }]}>
              <View style={{ alignItems: 'flex-end', marginBottom: 5 }}>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }} style={{ padding: 5 }}>
                  <Ionicons name="close-circle" size={32} color={isDark ? "#EF4444" : "#EF4444"} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {product && (
                  <View style={styles.infoContainer}>
                    <View>
                      {appMode !== 'sayim' && (
                        <View style={styles.priceRow}>
                          <Text style={styles.priceText}>{formatPrice(product.price)}</Text>
                          <Text style={styles.currencyText}> {product.currency}</Text>
                          {!!product.iskonto_orani && (
                            <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 12, alignSelf: 'center' }}>
                              <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 16 }}>
                                İSK: {product.iskonto_orani.replace(/^%/, '')}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 10, marginBottom: 15 }}>
                        <Text style={[styles.nameText, { marginBottom: 0, flex: 1 }]}>{product.name}</Text>
                        {product.stock_code && product.stock_code !== '---' && (
                          <TouchableOpacity
                            onPress={openEditNameModal}
                            style={{
                              padding: 8,
                              marginLeft: 8,
                              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 64, 175, 0.08)',
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(30, 64, 175, 0.2)',
                              alignSelf: 'center'
                            }}
                          >
                            <Ionicons name="pencil" size={18} color={isDark ? "#3B82F6" : "#1E40AF"} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <View style={styles.codesRow}>
                      <View style={styles.codeItem}>
                        <Text style={styles.codeLabel}>BARKOD</Text>
                        <Text style={styles.codeValue}>{product.barcode}</Text>
                      </View>
                      <View style={styles.codeItem}>
                        <Text style={styles.codeLabel}>STOK KODU</Text>
                        <Text style={styles.codeValue}>{product.stock_code}</Text>
                      </View>
                      <View style={styles.codeItem}>
                        <Text style={styles.codeLabel}>BİRİM</Text>
                        <Text style={styles.codeValue}>{product.unit || 'Adet'}</Text>
                      </View>
                      {!!product.iskonto_orani && (
                        <View style={styles.codeItem}>
                          <Text style={[styles.codeLabel, { color: '#EF4444' }]}>İSKONTO</Text>
                          <Text style={[styles.codeValue, { color: '#EF4444', fontWeight: '900' }]}>{product.iskonto_orani}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ marginTop: 15, alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 8, borderRadius: 10 }}>
                      <Text style={{ color: '#8a9ab5', fontSize: 11, fontWeight: 'bold' }}>SON FİYAT DEĞİŞİKLİĞİ</Text>
                      <Text style={{ color: isDark ? '#10B981' : '#059669', fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                        {product.lastup_date && product.lastup_date !== '' ? product.lastup_date : 'Bilgi Yok (veya Senkronize Edilmedi)'}
                      </Text>
                    </View>

                    {product.name === 'Ürün Bulunamadı' && (
                      <View style={{ marginTop: 20 }}>
                        <TouchableOpacity style={{ backgroundColor: '#EF4444', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 }} onPress={() => setReportModalVisible(true)}>
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>EKSİK OLARAK BİLDİR</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={{ backgroundColor: '#10B981', paddingVertical: 15, borderRadius: 12, alignItems: 'center' }} onPress={() => setShowBarkodIsleModal(true)}>
                          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>BARKOD İŞLE (EŞLEŞTİR)</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {product.name !== 'Ürün Bulunamadı' && (appMode === 'sayim' || appMode === 'sevk') ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 10 }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderRadius: 16, paddingHorizontal: 15, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                          <TouchableOpacity onPress={() => setCountInput(prev => String(Math.max(1, (parseInt(prev) || 1) - 1)))} style={{ padding: 10 }}>
                            <Ionicons name="remove-circle" size={32} color="#EF4444" />
                          </TouchableOpacity>
                          <TextInput
                            style={{ flex: 1, textAlign: 'center', fontSize: 28, fontWeight: 'bold', color: isDark ? '#fff' : '#000', paddingVertical: 15 }}
                            keyboardType="numeric"
                            value={countInput}
                            onChangeText={setCountInput}
                            autoFocus={true}
                          />
                          <TouchableOpacity onPress={() => setCountInput(prev => String((parseInt(prev) || 0) + 1))} style={{ padding: 10 }}>
                            <Ionicons name="add-circle" size={32} color="#10B981" />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={{ backgroundColor: appMode === 'sevk' ? '#FF6B00' : '#10B981', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }} onPress={() => { handleAddToCart(); }}>
                          <Ionicons name="arrow-forward-circle" size={32} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    {product.name !== 'Ürün Bulunamadı' && (
                      <TouchableOpacity style={{ backgroundColor: isDark ? '#1E293B' : '#E2E8F0', padding: 15, borderRadius: 16, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }} onPress={() => { setHkCariFiltre(''); setDateStart(null); setDateEnd(null); fetchStokHareketleri(product.stock_code, false); }}>
                        <Ionicons name="list-outline" size={24} color={isDark ? '#3B82F6' : '#2563EB'} style={{ marginRight: 10 }} />
                        <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 16 }}>STOK HAREKETLERİ GÖSTER</Text>
                      </TouchableOpacity>
                    )}

                    {showDepoStok && product.name !== 'Ürün Bulunamadı' && (
                      <View style={styles.depoStokContainer}>
                        <View style={styles.depoStokHeader}>
                          <Ionicons name="cube-outline" size={18} color="#00c853" />
                          <Text style={styles.depoStokTitle}>DEPO STOKLARI</Text>
                          {isLoadingDepoStok && <ActivityIndicator size="small" color="#00c853" style={{ marginLeft: 8 }} />}
                        </View>

                        {!isLoadingDepoStok && depoStoklar.length === 0 && (
                          <View style={styles.depoStokEmpty}>
                            <Ionicons name="information-circle-outline" size={20} color="#8a9ab5" />
                            <Text style={styles.depoStokEmptyText}>Bu üründe stok bulunmuyor</Text>
                          </View>
                        )}

                        {depoStoklar
                          .filter((depo: any) => appMode !== 'sayim' || (selectedDepo && String(depo.DepoNo).trim().padStart(2, '0') === String(selectedDepo.depo_no).trim().padStart(2, '0')))
                          .map((depo: any, index: number) => (
                            <View key={`depo-${index}`} style={styles.depoStokItem}>
                              <View style={styles.depoStokLeft}>
                                <Text style={styles.depoStokNo}>{depo.DepoNo}</Text>
                                <Text style={styles.depoStokAdi} numberOfLines={1}>{depo.DepoAdi || 'Depo'}</Text>
                              </View>
                              <View style={styles.depoStokRight}>
                                <Text style={[styles.depoStokMiktar, depo.Miktar < 0 && styles.depoStokMiktarNegatif]}>{formatPrice(depo.Miktar)}</Text>
                                <Text style={styles.depoStokBirim}>{product.unit || 'Adet'}</Text>
                              </View>
                            </View>
                          ))}

                        {appMode !== 'sayim' && depoStoklar.length > 0 && (
                          <View style={styles.depoStokToplam}>
                            <Text style={styles.depoStokToplamLabel}>TOPLAM</Text>
                            <Text style={styles.depoStokToplamValue}>
                              {formatPrice(depoStoklar.reduce((sum: number, d: any) => sum + (d.Miktar || 0), 0))} {product.unit || 'Adet'}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!isConnected && product.name !== 'Ürün Bulunamadı' && (
                      <TouchableOpacity style={styles.noInternetWarning} onPress={() => fetchDepoStok(product.stock_code)}>
                        <Ionicons name="cloud-offline-outline" size={18} color="#ffc107" />
                        <Text style={styles.noInternetText}>Depo stok için internete bağlanın</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.actionRow}></View>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {!searchQuery && !reportModalVisible && !isShowingCart && (
          <View style={styles.footer}>
            <View style={styles.statsContainer}>
              <Text style={styles.statsText}>Toplam Ürün: {totalProducts.toLocaleString('tr-TR')} adet</Text>
            </View>
            <Text style={styles.footerBrand}>Design by Hasan Kaynak | v{CURRENT_VERSION}</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <Modal isVisible={reportModalVisible} onBackdropPress={() => { Keyboard.dismiss(); setReportModalVisible(false); }} onBackButtonPress={() => { Keyboard.dismiss(); setReportModalVisible(false); }} backdropOpacity={0.7} style={styles.modal} >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Eksik Ürün Bildir</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setReportModalVisible(false); }}>
                <Ionicons name="close" size={28} color="#8a9ab5" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Barkod: {product?.barcode}</Text>
            <TextInput style={styles.modalInput} placeholder="Ürün adı veya detay yazın..." placeholderTextColor="#8a9ab5" multiline value={reportNote} onChangeText={(t) => setReportNote(t.toLocaleUpperCase('tr-TR'))} autoCapitalize="characters" autoFocus={true} />
            <TouchableOpacity style={styles.modalSubmit} onPress={sendReport} disabled={isReporting}>
              {isReporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitText}>KAYDET VE GÖNDER</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal isVisible={showDepoModal} onBackdropPress={() => setShowDepoModal(false)} style={styles.modal}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Depo Seçimi</Text>
            <TouchableOpacity onPress={() => setShowDepoModal(false)}>
              <Ionicons name="close" size={28} color="#8a9ab5" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={{ height: 50, paddingHorizontal: 15, borderRadius: 12, marginBottom: 15, backgroundColor: isDark ? '#333' : '#F1F5F9', color: isDark ? '#fff' : '#000', fontSize: 16 }}
            placeholder="Depo ara..."
            placeholderTextColor="#8a9ab5"
            value={depoSearchQuery}
            onChangeText={(t) => setDepoSearchQuery(t.toLocaleUpperCase('tr-TR'))}
            autoCapitalize="characters"
          />

          <FlatList
            data={depos.filter((d) => (d.depo_adi?.toLowerCase() || '').includes(depoSearchQuery.toLowerCase()) || String(d.depo_no).includes(depoSearchQuery))}
            keyExtractor={d => d.depo_no}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => selectDepoAndSave(item)} style={{ paddingVertical: 15, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee', flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 107, 0, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                  <Text style={{ color: '#FF6B00', fontWeight: 'bold' }}>{item.depo_no}</Text>
                </View>
                <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 16, flex: 1, fontWeight: '500' }}>{item.depo_adi}</Text>
                {selectedDepo?.depo_no === item.depo_no && <Ionicons name="checkmark-circle" size={24} color="#10B981" />}
              </TouchableOpacity>
            )}
            style={{ maxHeight: 400 }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>

      {/* SEVK SOURCE (ÇIKIŞ) MODAL */}
      <Modal isVisible={showSevkSourceModal} onBackdropPress={() => { setShowSevkSourceModal(false); if(!sevkSourceDepo) setAppMode('menu'); }} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '70%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Çıkış Deposunu Seçin</Text>
            <TouchableOpacity onPress={() => { setShowSevkSourceModal(false); if(!sevkSourceDepo) setAppMode('menu'); }}>
              <Ionicons name="close" size={28} color="#8a9ab5" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#8a9ab5" style={{ marginRight: 10 }} />
            <TextInput style={[styles.searchInput, { flex: 1 }]} placeholder="Depo Ara..." placeholderTextColor="#8a9ab5" value={depoSearchQuery} onChangeText={setDepoSearchQuery} />
          </View>
          <FlatList
            data={depos.filter(d => d.depo_adi?.toLocaleLowerCase('tr-TR').includes(depoSearchQuery.toLocaleLowerCase('tr-TR')))}
            keyExtractor={item => item.depo_no}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.searchResultItem} onPress={() => { setSevkSourceDepo(item); setShowSevkSourceModal(false); setDepoSearchQuery(''); setTimeout(() => setShowSevkTargetModal(true), 500); }}>
                <Text style={styles.searchResultName} numberOfLines={2} ellipsizeMode='tail'>{item.depo_adi}</Text>
                <Ionicons name="log-out-outline" size={24} color="#FF6B00" />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* SEVK TARGET (GİRİŞ) MODAL */}
      <Modal isVisible={showSevkTargetModal} onBackdropPress={() => { setShowSevkTargetModal(false); if(!sevkTargetDepo) { setSevkSourceDepo(null); setAppMode('menu'); } }} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '70%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Giriş Deposunu Seçin</Text>
            <TouchableOpacity onPress={() => { setShowSevkTargetModal(false); if(!sevkTargetDepo) { setSevkSourceDepo(null); setAppMode('menu'); } }}>
              <Ionicons name="close" size={28} color="#8a9ab5" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#8a9ab5" style={{ marginRight: 10 }} />
            <TextInput style={[styles.searchInput, { flex: 1 }]} placeholder="Depo Ara..." placeholderTextColor="#8a9ab5" value={depoSearchQuery} onChangeText={setDepoSearchQuery} />
          </View>
          <FlatList
            data={depos.filter(d => d.depo_adi?.toLocaleLowerCase('tr-TR').includes(depoSearchQuery.toLocaleLowerCase('tr-TR')) && d.depo_no !== sevkSourceDepo?.depo_no)}
            keyExtractor={item => item.depo_no}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.searchResultItem} onPress={() => { setSevkTargetDepo(item); setShowSevkTargetModal(false); setDepoSearchQuery(''); }}>
                <Text style={styles.searchResultName} numberOfLines={2} ellipsizeMode='tail'>{item.depo_adi}</Text>
                <Ionicons name="log-in-outline" size={24} color="#10B981" />
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* STOK HAREKETLERİ MODAL */}
      <Modal isVisible={showStokHareketleri} onBackdropPress={() => setShowStokHareketleri(false)} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '85%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Stok Hareket Ekstresi</Text>
            <TouchableOpacity onPress={() => setShowStokHareketleri(false)}>
              <Ionicons name="close" size={28} color="#8a9ab5" />
            </TouchableOpacity>
          </View>
          
          <View style={{ backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 10, borderRadius: 12, marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }} onPress={() => setShowStartDate(true)}>
                <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, marginBottom: 2, fontWeight: 'bold' }}>BAŞLANGIÇ</Text>
                <Text style={{ color: dateStart ? (isDark ? '#fff' : '#000') : '#94A3B8', fontSize: 13 }}>
                  {dateStart ? `${dateStart.getDate().toString().padStart(2, '0')}.${(dateStart.getMonth() + 1).toString().padStart(2, '0')}.${dateStart.getFullYear()}` : 'Seçiniz'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#fff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }} onPress={() => setShowEndDate(true)}>
                <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, marginBottom: 2, fontWeight: 'bold' }}>BİTİŞ</Text>
                <Text style={{ color: dateEnd ? (isDark ? '#fff' : '#000') : '#94A3B8', fontSize: 13 }}>
                  {dateEnd ? `${dateEnd.getDate().toString().padStart(2, '0')}.${(dateEnd.getMonth() + 1).toString().padStart(2, '0')}.${dateEnd.getFullYear()}` : 'Seçiniz'}
                </Text>
              </TouchableOpacity>
              
              {showStartDate && (
                <DateTimePicker
                  value={dateStart || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowStartDate(false);
                    if (selectedDate) setDateStart(selectedDate);
                  }}
                />
              )}
              {showEndDate && (
                <DateTimePicker
                  value={dateEnd || new Date()}
                  mode="date"
                  display="default"
                  onChange={(event, selectedDate) => {
                    setShowEndDate(false);
                    if (selectedDate) setDateEnd(selectedDate);
                  }}
                />
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 11, marginBottom: 4, fontWeight: 'bold' }}>CARİ ADI İLE ARA</Text>
                <TextInput style={{ backgroundColor: isDark ? '#0F172A' : '#fff', color: isDark ? '#fff' : '#000', padding: 8, borderRadius: 8, fontSize: 13, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }} placeholder="Cari Ünvanı..." placeholderTextColor="#94A3B8" value={hkCariFiltre} onChangeText={t => setHkCariFiltre(t.toLocaleUpperCase('tr-TR'))} autoCapitalize="characters" />
              </View>
              <TouchableOpacity style={{ backgroundColor: '#FF6B00', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }} onPress={() => fetchStokHareketleri(product?.stock_code || '', true)}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>FİLTRELE</Text>
              </TouchableOpacity>
              {(dateStart || dateEnd || hkCariFiltre !== '') && (
                <TouchableOpacity style={{ backgroundColor: '#EF4444', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }} onPress={() => { setHkCariFiltre(''); setDateStart(null); setDateEnd(null); }}>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
          
          {isLoadingHareketler ? (
            <ActivityIndicator size="large" color="#FF6B00" style={{ marginVertical: 30 }} />
          ) : stokHareketleri.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <Ionicons name="alert-circle-outline" size={48} color="#8a9ab5" />
              <Text style={{ color: '#8a9ab5', marginTop: 10, fontSize: 16 }}>Bu stoğa ait hareket bulunamadı.</Text>
            </View>
          ) : (
            <FlatList
              data={stokHareketleri}
              keyExtractor={(item, index) => index.toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee' }} onPress={() => fetchFaturaDetayi(item.EvrakSeri, item.EvrakSira, item.Tip)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 14 }}>{item.Tarih}</Text>
                    <Text style={{ color: ([1, 3, 5, 7, 9, 11].includes(item.Tip)) ? '#EF4444' : '#10B981', fontWeight: 'bold', fontSize: 15 }}>
                      {([1, 3, 5, 7, 9, 11].includes(item.Tip)) ? '-' : '+'}{formatPrice(item.Miktar)} {product?.unit || 'Adet'}
                    </Text>
                  </View>
                  <Text style={{ color: '#8a9ab5', fontSize: 13, marginBottom: 2 }}>{item.EvrakSeri} - {item.EvrakSira}</Text>
                  {item.CariUnvan ? <Text style={{ color: isDark ? '#ccc' : '#444', fontSize: 13 }}>Cari: {item.CariUnvan}</Text> : null}
                  {item.GirisDepo ? <Text style={{ color: '#10B981', fontSize: 12 }}>Giriş Depo: {item.GirisDepo}</Text> : null}
                  {item.CikisDepo ? <Text style={{ color: '#EF4444', fontSize: 12 }}>Çıkış Depo: {item.CikisDepo}</Text> : null}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* FATURA DETAYI MODAL */}
      <Modal isVisible={showFaturaModal} onBackdropPress={() => setShowFaturaModal(false)} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Evrak Detayı</Text>
            <TouchableOpacity onPress={() => setShowFaturaModal(false)}>
              <Ionicons name="close" size={28} color="#8a9ab5" />
            </TouchableOpacity>
          </View>
          {selectedEvrak && (
            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: 'bold', marginBottom: 15, fontSize: 14 }}>
              Evrak: {selectedEvrak.seri} - {selectedEvrak.sira}
            </Text>
          )}

          <View style={[styles.searchContainer, { marginBottom: 15 }]}>
            <Ionicons name="search" size={20} color="#8a9ab5" style={{ marginRight: 10 }} />
            <TextInput style={[styles.searchInput, { flex: 1 }]} placeholder="Fatura İçi Ürün Ara..." placeholderTextColor="#8a9ab5" value={faturaSearchQuery} onChangeText={setFaturaSearchQuery} autoCapitalize="characters" />
          </View>

          {isLoadingFatura ? (
            <ActivityIndicator size="large" color="#FF6B00" style={{ marginVertical: 30 }} />
          ) : faturaDetayi.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <Ionicons name="alert-circle-outline" size={48} color="#8a9ab5" />
              <Text style={{ color: '#8a9ab5', marginTop: 10, fontSize: 16 }}>Belge içi kalemlere ulaşılamadı.</Text>
            </View>
          ) : (
            <FlatList
              data={faturaDetayi.filter(d => (d.UrunAdi || '').toLocaleLowerCase('tr-TR').includes(faturaSearchQuery.toLocaleLowerCase('tr-TR')))}
              keyExtractor={(item, index) => index.toString()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee' }}>
                  <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 14, marginBottom: 5 }}>{item.UrunAdi}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#8a9ab5', fontSize: 13 }}>Miktar: {formatPrice(item.Miktar)} {item.Birim || 'Adet'}</Text>
                    <Text style={{ color: '#3B82F6', fontWeight: 'bold', fontSize: 14 }}>{formatPrice(item.Tutar)} {item.Doviz}</Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* BARKOD İŞLE (EŞLEŞTİR) MODAL */}
      <Modal isVisible={showBarkodIsleModal} onBackdropPress={() => setShowBarkodIsleModal(false)} backdropOpacity={0.8} avoidKeyboard={true} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Barkod Eşleştir ({product?.barcode})</Text>
            <TouchableOpacity onPress={() => setShowBarkodIsleModal(false)}>
              <Ionicons name="close-circle" size={32} color={isDark ? "#EF4444" : "#EF4444"} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#8a9ab5" style={{ marginRight: 10 }} />
            <TextInput style={[styles.searchInput, { flex: 1 }]} placeholder="Stok Kodu veya Adı ile Ara..." placeholderTextColor="#8a9ab5" value={barkodIsleSearchQuery} onChangeText={handleBarkodIsleSearch} autoCapitalize="characters" />
          </View>
          {isProcessingBarkod ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
               <ActivityIndicator size="large" color="#10B981" />
               <Text style={{ marginTop: 10, color: '#8a9ab5' }}>Eşleştiriliyor, lütfen bekleyin...</Text>
            </View>
          ) : (
            <FlatList
              data={barkodIsleResults}
              keyExtractor={(item, index) => item.stock_code + '_' + index}
              showsVerticalScrollIndicator={true}
              renderItem={({ item }) => (
                <TouchableOpacity style={{ padding: 15, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee' }} onPress={() => {
                  Alert.alert("Emin Misiniz?", `Barkod: ${product?.barcode}\nÜrün: ${item.name}\n\nBu barkodu, bu ürünle eşleştirmek istiyor musunuz?`, [
                    { text: "İptal", style: "cancel" },
                    { text: "Eşleştir", onPress: () => assignBarkodToStock(item) }
                  ]);
                }}>
                  <Text style={{ fontWeight: 'bold', color: isDark ? '#fff' : '#000', fontSize: 14 }}>{item.name}</Text>
                  <Text style={{ color: '#8a9ab5', fontSize: 12, marginTop: 4 }}>{item.stock_code} - Gösterilen Fiyat: {formatPrice(item.price)} {item.currency}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* CARİ DEFTER MODAL */}
      <Modal isVisible={showCariModal} onBackdropPress={() => setShowCariModal(false)} style={styles.modal}>
        <View style={[styles.modalContent, { maxHeight: '90%' }]}>
          <View style={styles.modalHeader}>
            <View style={{flex: 1}}>
              <Text style={[styles.modalTitle, {fontSize: 16}]} numberOfLines={2}>{selectedCari?.cari_unvan1}</Text>
              <Text style={{color: '#8a9ab5', fontSize: 13, marginTop: 2}}>{selectedCari?.cari_kod}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCariModal(false)}>
              <Ionicons name="close-circle" size={32} color={isDark ? "#EF4444" : "#EF4444"} />
            </TouchableOpacity>
          </View>

          <View style={{backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 15, borderRadius: 12, marginBottom: 12, alignItems: 'center'}}>
             <Text style={{color:'#888', fontSize: 12, fontWeight:'bold'}}>GÜNCEL BAKİYE</Text>
             <Text style={{fontSize: 24, fontWeight:'bold', marginTop: 5, color: (selectedCari?.bakiye > 0) ? '#EF4444' : ((selectedCari?.bakiye < 0) ? '#10B981' : '#888')}}>
                {formatPrice(Math.abs(selectedCari?.bakiye || 0))} TL {selectedCari?.bakiye > 0 ? '(B) - Borçlu' : (selectedCari?.bakiye < 0 ? '(A) - Alacaklı' : '')}
             </Text>
          </View>

          {/* ÜRÜN ARAMA INPUTU */}
          <View style={[styles.searchContainer, { marginBottom: 12, height: 48, paddingHorizontal: 12 }]}>
            <Ionicons name="search" size={18} color="#8a9ab5" style={{ marginRight: 8 }} />
            <TextInput 
              style={[styles.searchInput, { flex: 1, fontSize: 13 }]} 
              placeholder="Bu caride ürün ara (ad veya kod)..." 
              placeholderTextColor="#8a9ab5" 
              value={cariProductSearchQuery} 
              onChangeText={handleCariProductSearch} 
              autoCapitalize="characters" 
            />
            {cariProductSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setCariProductSearchQuery(''); setCariProductInvoices([]); }} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={20} color={isDark ? "#3B82F6" : "#1E40AF"} />
              </TouchableOpacity>
            )}
          </View>

          {cariProductSearchQuery.trim().length > 0 ? (
            isLoadingCariProdInv ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF6B00" />
                <Text style={{ color: '#8a9ab5', marginTop: 10, fontSize: 13 }}>Bu ürüne ait faturalar aranıyor...</Text>
              </View>
            ) : cariProductInvoices.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Ionicons name="alert-circle-outline" size={40} color="#8a9ab5" />
                <Text style={{ color: '#8a9ab5', marginTop: 10, fontSize: 14 }}>Bu ürüne ait fatura kaydı bulunamadı.</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#8a9ab5', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>
                  BU ÜRÜNÜN BULUNDUĞU FATURALAR ({cariProductInvoices.length})
                </Text>
                <FlatList
                  data={cariProductInvoices}
                  keyExtractor={(item, index) => `${item.Seri}_${item.Sira}_${item.StokKodu}_${index}`}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee' }} 
                      onPress={() => fetchFaturaDetayi(item.Seri, item.Sira, item.Tip)}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ backgroundColor: item.Tip === 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ color: item.Tip === 1 ? '#10B981' : '#3B82F6', fontSize: 10, fontWeight: '900' }}>
                              {item.EvrakTipi}
                            </Text>
                          </View>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 13 }}>
                            {item.Seri} {item.Sira}
                          </Text>
                        </View>
                        <Text style={{ color: '#8a9ab5', fontSize: 12 }}>
                          {item.Tarih}
                        </Text>
                      </View>

                      <Text style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: '700', fontSize: 13 }}>
                        {item.UrunAdi}
                      </Text>
                      <Text style={{ color: '#8a9ab5', fontSize: 11, marginTop: 1 }}>
                        Stok Kodu: {item.StokKodu}
                      </Text>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: 'bold' }}>
                          Miktar: <Text style={{ color: item.Tip === 1 ? '#EF4444' : '#10B981' }}>{formatPrice(item.Miktar)} {item.Birim || 'Adet'}</Text>
                        </Text>
                        <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: '900', fontSize: 13 }}>
                          {formatPrice(item.Tutar)} {item.Doviz}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )
          ) : (
            isLoadingCariHar ? (
              <ActivityIndicator size="large" color="#FF6B00" style={{marginTop:20}} />
            ) : (
              <FlatList
                data={cariHareketler}
                keyExtractor={(item, index) => index.toString()}
                showsVerticalScrollIndicator={false}
                renderItem={({item}) => (
                  <TouchableOpacity style={{paddingVertical: 12, borderBottomWidth: 1, borderColor: isDark ? '#333' : '#eee'}} onPress={() => fetchFaturaDetayi(item.cha_evrakno_seri, item.cha_evrakno_sira, -1)}>
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom: 5}}>
                      <Text style={{color: isDark ? '#fff' : '#000', fontWeight:'bold', fontSize:13}}>{item.cha_tarihi ? item.cha_tarihi.split('T')[0] : ''}</Text>
                      <Text style={{color: '#8a9ab5', fontSize: 12}}>{item.cha_evrakno_seri}{item.cha_evrakno_sira} {item.cha_belge_no ? ' / ' + item.cha_belge_no : ''}</Text>
                    </View>
                    <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                      <Text style={{color: '#8a9ab5', fontSize: 12, flex: 1, marginRight: 10}} numberOfLines={2}>{item.cha_aciklama || 'Açıklama Yok'}</Text>
                      <View style={{alignItems:'flex-end'}}>
                        <Text style={{fontWeight:'bold', fontSize: 13, color: item.cha_tip === 0 ? '#EF4444' : '#10B981'}}>
                          {formatPrice(item.cha_meblag)} TL {item.cha_tip === 0 ? '(BORÇ)' : '(ALACAK)'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={() => (
                  <View style={{padding: 20, alignItems:'center'}}>
                     <Text style={{color:'#8a9ab5'}}>Bu cariye ait hiçbir hareket bulunamadı.</Text>
                  </View>
                )}
              />
            )
          )}
        </View>
      </Modal>

      {/* Ürün İsmi Düzenleme Modal */}
      <Modal
        isVisible={editNameModalVisible}
        onBackdropPress={() => { if (!isUpdatingName) { Keyboard.dismiss(); setEditNameModalVisible(false); } }}
        onBackButtonPress={() => { if (!isUpdatingName) { Keyboard.dismiss(); setEditNameModalVisible(false); } }}
        backdropOpacity={0.7}
        avoidKeyboard={true}
        style={styles.modal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pencil" size={22} color={isDark ? "#3B82F6" : "#1E40AF"} />
                <Text style={styles.modalTitle}>İsmi Düzenle</Text>
              </View>
              <TouchableOpacity onPress={() => { if (!isUpdatingName) { Keyboard.dismiss(); setEditNameModalVisible(false); } }}>
                <Ionicons name="close-circle" size={28} color="#8a9ab5" />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 15, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 14 }}>
              <Text style={{ color: '#8a9ab5', fontSize: 12, fontWeight: '700' }}>STOK KODU: <Text style={{ color: isDark ? '#fff' : '#000' }}>{product?.stock_code}</Text></Text>
              {!!product?.barcode && <Text style={{ color: '#8a9ab5', fontSize: 12, fontWeight: '700', marginTop: 4 }}>BARKOD: <Text style={{ color: isDark ? '#fff' : '#000' }}>{product?.barcode}</Text></Text>}
            </View>

            <TextInput
              style={[styles.modalInput, { height: 95, marginBottom: 6, fontSize: 15 }]}
              placeholder="Yeni ürün adını girin..."
              placeholderTextColor="#8a9ab5"
              multiline
              maxLength={127}
              value={editNameInput}
              onChangeText={setEditNameInput}
              autoFocus={true}
              editable={!isUpdatingName}
            />
            <Text style={{ alignSelf: 'flex-end', color: '#8a9ab5', fontSize: 11, marginBottom: 18, fontWeight: '600' }}>
              {editNameInput.length} / 127
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, backgroundColor: '#64748B' }]}
                onPress={() => { Keyboard.dismiss(); setEditNameModalVisible(false); }}
                disabled={isUpdatingName}
              >
                <Text style={styles.buttonText}>VAZGEÇ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1.6, backgroundColor: '#10B981' }]}
                onPress={handleUpdateProductName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#fff' }]}>MİKRO'YA KAYDET</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => {
  const colors = isDark ? {
    bg: '#000000', card: '#111111', text: '#F8FAFC', textMuted: '#94A3B8', border: 'rgba(255,255,255,0.1)',
    primary: '#FF6B00', primarySoft: 'rgba(255, 107, 0, 0.1)', success: '#10B981', successSoft: 'rgba(16, 185, 129, 0.15)',
    danger: '#EF4444', dangerSoft: 'rgba(239, 68, 68, 0.15)', warning: '#F59E0B', warningSoft: 'rgba(245, 158, 11, 0.1)'
  } : {
    bg: '#F8FAFC', card: '#FFFFFF', text: '#000000', textMuted: '#64748B', border: 'rgba(0,0,0,0.08)',
    primary: '#FF6B00', primarySoft: 'rgba(255, 107, 0, 0.08)', success: '#059669', successSoft: 'rgba(5, 150, 105, 0.1)',
    danger: '#DC2626', dangerSoft: 'rgba(220, 38, 38, 0.1)', warning: '#D97706', warningSoft: 'rgba(217, 119, 6, 0.1)'
  };

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    userNameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.bg },
    userNameTitle: { color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 24, marginBottom: 8, letterSpacing: -1 },
    userNameSubtitle: { color: colors.textMuted, fontSize: 16, marginBottom: 40, fontWeight: '500' },
    userNameInput: { width: '100%', backgroundColor: colors.border, borderRadius: 20, padding: 20, fontSize: 20, color: colors.text, borderWidth: 1.5, borderColor: colors.primarySoft, marginBottom: 30, textAlign: 'center', fontWeight: '600' },
    userNameButton: { backgroundColor: colors.primary, paddingHorizontal: 40, paddingVertical: 18, borderRadius: 20, width: '100%', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 10 },
    userNameButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, paddingTop: Platform.OS === 'android' ? 45 : 55, backgroundColor: colors.bg, zIndex: 1000, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginHorizontal: 2 },
    headerBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
    headerCenter: { alignItems: 'center', flex: 1 },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    headerSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '500' },
    syncBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.primarySoft },
    syncBannerText: { color: colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
    cameraBox: { height: SCREEN_HEIGHT * 0.30, overflow: 'hidden', position: 'relative', margin: 15, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: '#000' },
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    flashBtn: { position: 'absolute', bottom: 15, right: 15, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, zIndex: 100 },
    flashBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    targetFrame: { width: 260, height: 140, borderWidth: 2, borderColor: colors.primary, borderRadius: 16, backgroundColor: colors.primarySoft, borderStyle: 'dashed' },
    resultPanel: { flex: 1, backgroundColor: colors.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, marginTop: 5, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20, borderTopWidth: 1, borderTopColor: colors.border },
    searchContainer: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 20, paddingHorizontal: 20, height: 56, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: colors.border },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
    clearSearch: { position: 'absolute', right: 50, zIndex: 10, padding: 5 },
    micSearch: { position: 'absolute', right: 15, zIndex: 10, padding: 5 },
    searchResultsList: { flex: 1 },
    searchResultItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    searchResultName: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
    searchResultDetail: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
    infoContainer: { paddingBottom: 30 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 12 },
    priceText: { color: colors.primary, fontSize: 56, fontWeight: '900', letterSpacing: -2, textShadowColor: colors.primarySoft, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 15 },
    currencyText: { color: colors.primary, fontSize: 22, fontWeight: '800' },
    nameText: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 25, lineHeight: 28 },
    codesRow: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 20, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
    codeItem: { flex: 1, alignItems: 'center' },
    codeLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 1, marginBottom: 8, fontWeight: '800' },
    codeValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
    nextButton: { backgroundColor: colors.primary, padding: 18, borderRadius: 20, alignItems: 'center' },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, marginTop: 10 },
    nextButtonSmall: { flex: 1, backgroundColor: isDark ? '#1E293B' : '#F1F5F9', padding: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    reportButton: { flex: 1.2, backgroundColor: colors.primary, padding: 18, borderRadius: 20, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
    reportedButton: { backgroundColor: '#334155', borderColor: '#334155', opacity: 0.7, shadowOpacity: 0 },
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center', letterSpacing: 0.5 },
    buttonTextYeni: { color: colors.text, fontWeight: '800', fontSize: 13, textAlign: 'center', letterSpacing: 0.5 },
    idleState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 50 },
    idleText: { color: colors.textMuted, fontSize: 16, fontWeight: '600', marginTop: 8 },
    footer: { backgroundColor: colors.card, paddingBottom: 25, alignItems: 'center' },
    statsContainer: { backgroundColor: colors.primarySoft, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, marginBottom: 15 },
    statsText: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
    footerBrand: { color: colors.primary, opacity: 0.5, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    modal: { justifyContent: 'center', margin: 20 },
    modalContent: { backgroundColor: colors.card, borderRadius: 32, padding: 24, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 25, elevation: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    modalLabel: { color: colors.primary, fontSize: 14, fontWeight: '800', marginBottom: 20 },
    modalInput: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 20, padding: 18, color: colors.text, height: 120, textAlignVertical: 'top', marginBottom: 24, fontSize: 16, borderWidth: 1, borderColor: colors.border },
    modalSubmit: { padding: 18, borderRadius: 20, alignItems: 'center', backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 5 },
    modalSubmitText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 },
    modalBtn: { padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    stokBadge: { backgroundColor: colors.successSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginRight: 10, minWidth: 60, alignItems: 'center', borderWidth: 1, borderColor: colors.successSoft },
    stokBadgeText: { color: colors.success, fontSize: 13, fontWeight: '900' },
    stokBadgeTextZero: { color: colors.danger },
    depoStokContainer: { backgroundColor: colors.successSoft, borderRadius: 24, padding: 20, marginBottom: 10, borderWidth: 1, borderColor: colors.successSoft },
    depoStokHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.successSoft },
    depoStokTitle: { color: colors.success, fontSize: 13, fontWeight: '900', letterSpacing: 1, marginLeft: 10 },
    depoStokEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
    depoStokEmptyText: { color: colors.textMuted, fontSize: 14, marginLeft: 8, fontWeight: '600' },
    depoStokItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    depoStokLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    depoStokNo: { backgroundColor: colors.successSoft, color: colors.success, fontSize: 11, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 12 },
    depoStokAdi: { color: colors.text, fontSize: 14, flex: 1, fontWeight: '600' },
    depoStokRight: { alignItems: 'flex-end', minWidth: 80 },
    depoStokMiktar: { color: colors.success, fontSize: 18, fontWeight: '900' },
    depoStokMiktarNegatif: { color: colors.danger },
    depoStokBirim: { color: colors.textMuted, fontSize: 10, marginTop: 2, fontWeight: '700', letterSpacing: 0.5 },
    depoStokToplam: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.successSoft },
    depoStokToplamLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    depoStokToplamValue: { color: colors.success, fontSize: 18, fontWeight: '900' },
    noInternetWarning: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningSoft, borderRadius: 16, padding: 16, marginBottom: 20 },
    noInternetText: { color: colors.warning, fontSize: 14, fontWeight: '700', marginLeft: 10 }
  });
};
