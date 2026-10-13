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
const CURRENT_VERSION = '1.0.20';
const CURRENT_VERSION_CODE = 20;

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
  const laserAnim = useRef(new Animated.Value(0)).current;
  const [lastSyncTime, setLastSyncTime] = useState<string>('10:45');
  const [menuSearchInput, setMenuSearchInput] = useState('');

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
  const [countDescription, setCountDescription] = useState('');
  const [showDescModal, setShowDescModal] = useState(false);
  const [editingItemForDesc, setEditingItemForDesc] = useState<any>(null);
  const [editDescInput, setEditDescInput] = useState('');
  const [cartSearchQuery, setCartSearchQuery] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [sayimBackups, setSayimBackups] = useState<any[]>([]);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
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
    if (cameraActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(laserAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      laserAnim.setValue(0);
    }
  }, [cameraActive]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => { setIsConnected(state.isConnected); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadUserName = async () => {
      try {
        const savedSync = await AsyncStorage.getItem('autoSync');
        if (savedSync !== null) setAutoSync(savedSync === 'true');

        const savedSyncTime = await AsyncStorage.getItem('lastSyncTime');
        if (savedSyncTime) setLastSyncTime(savedSyncTime);

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
          flags: 268435457,
          type: 'application/vnd.android.package-archive',
        });
      } else {
        throw new Error('İndirme dosyası alınamadı.');
      }
    } catch (error: any) {
      setIsDownloading(false);
      Alert.alert(
        'Yükleme Başlatılamadı',
        `Güncelleme indirildi ancak kurulum başlatılamadı:\n${error.message || error}\n\nLütfen ayarlardan 'Bilinmeyen uygulamaları yükle' iznini kontrol edin.`
      );
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
        const backups: any[] = await db.getAllAsync('SELECT * FROM sayim_backups ORDER BY id DESC LIMIT 20');
        if (backups) setSayimBackups(backups);
      } catch (e) {}

      try {
        const recentsStr = await AsyncStorage.getItem('recent_scanned_products');
        if (recentsStr) setRecentProducts(JSON.parse(recentsStr));
      } catch (e) {}

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
    } finally {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setLastSyncTime(timeStr);
      AsyncStorage.setItem('lastSyncTime', timeStr);
      setIsSyncing(false);
    }
  };

  const addRecentProduct = (item: any, qty?: number, desc?: string) => {
    if (!item || !item.stock_code || item.stock_code === '---' || item.name === 'Ürün Bulunamadı') return;
    setRecentProducts(prev => {
      const filtered = prev.filter(p => p.stock_code !== item.stock_code);
      const newEntry = {
        stock_code: item.stock_code,
        barcode: item.barcode || '',
        name: item.name || '',
        quantity: qty !== undefined ? qty : (item.quantity || 1),
        unit: item.unit || 'Adet',
        description: desc !== undefined ? desc : (item.description || ''),
        depo_adi: selectedDepo ? selectedDepo.depo_adi : (item.depo_adi || '01 - Merkez Depo'),
        date: new Date().toLocaleDateString('tr-TR')
      };
      const updated = [newEntry, ...filtered].slice(0, 10);
      AsyncStorage.setItem('recent_scanned_products', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
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
        addRecentProduct(result);
        setSearchQuery('');
        setSearchResults([]);
        if (result.stock_code && result.stock_code !== '---') fetchDepoStok(result.stock_code);
        setCountInput('1');
        setCountDescription('');
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
    addRecentProduct(item);
    setScanned(true);
    setWasScannedByCamera(false);
    setDepoStoklar([]);
    setShowDepoStok(false);
    setCountInput('1');
    setCountDescription('');
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
    await AsyncStorage.setItem('selected_depo_no', String(depo.depo_no));
    setShowDepoModal(false);
    setDepoSearchQuery('');
    ToastAndroid.show(`Aktif depo seçildi: ${depo.depo_adi}`, ToastAndroid.SHORT);
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
        { text: "Üzerine Ekle", onPress: () => { 
            newCart[existingIndex].quantity += quantity; 
            if (countDescription.trim()) {
              newCart[existingIndex].description = newCart[existingIndex].description 
                ? `${newCart[existingIndex].description}; ${countDescription.trim()}`
                : countDescription.trim();
            }
            saveCartToStorage(newCart); 
            addRecentProduct(product, newCart[existingIndex].quantity, newCart[existingIndex].description);
            ToastAndroid.show("Eklendi!", ToastAndroid.SHORT); 
            setCountInput('1'); 
            setCountDescription('');
            setProduct(null); 
            setScanned(false); 
            if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } 
          } 
        },
        { text: "Yeniden Yaz (Ez)", onPress: () => { 
            newCart[existingIndex].quantity = quantity; 
            if (countDescription.trim()) {
              newCart[existingIndex].description = countDescription.trim();
            }
            saveCartToStorage(newCart); 
            addRecentProduct(product, quantity, newCart[existingIndex].description);
            ToastAndroid.show("Güncellendi!", ToastAndroid.SHORT); 
            setCountInput('1'); 
            setCountDescription('');
            setProduct(null); 
            setScanned(false); 
            if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } 
          } 
        }
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
        description: countDescription.trim(),
        added_at: new Date().toISOString() 
      });
      saveCartToStorage(newCart);
      addRecentProduct(product, quantity, countDescription.trim());
      ToastAndroid.show("Sepete eklendi!", ToastAndroid.SHORT);
      setCountInput('1');
      setCountDescription('');
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
        const excelData = activeCart.map((item, index) => ({ 
          'Sıra': index + 1, 
          'Barkod': item.barcode, 
          'Stok Kodu': item.stock_code, 
          'Ürün Adı': item.name, 
          'Depo No': item.depo_no, 
          'Depo Adı': item.depo_adi, 
          'Sayım Adedi': item.quantity, 
          'Açıklama / Not': item.description || '',
          'Sayan Kişi': userName, 
          'Tarih': new Date(item.added_at).toLocaleString('tr-TR') 
        }));
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
              'MOBIL', '${(item.description || '').replace(/'/g, "''").substring(0, 50)}', '',
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

  const renderDepoModal = () => (
    <Modal
      isVisible={showDepoModal}
      onBackdropPress={() => {
        setShowDepoModal(false);
        setDepoSearchQuery('');
      }}
      style={styles.modal}
      avoidKeyboard={true}
    >
      <View style={[styles.modalContent, { maxHeight: '75%' }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Depo Seçimi</Text>
          <TouchableOpacity
            onPress={() => {
              setShowDepoModal(false);
              setDepoSearchQuery('');
            }}
          >
            <Ionicons name="close" size={28} color="#8a9ab5" />
          </TouchableOpacity>
        </View>

        <TextInput
          style={{
            height: 50,
            paddingHorizontal: 15,
            borderRadius: 12,
            marginBottom: 15,
            backgroundColor: isDark ? '#333' : '#F1F5F9',
            color: isDark ? '#fff' : '#000',
            fontSize: 16,
          }}
          placeholder="Depo ara..."
          placeholderTextColor="#8a9ab5"
          value={depoSearchQuery}
          onChangeText={(t) => setDepoSearchQuery(t.toLocaleUpperCase('tr-TR'))}
          autoCapitalize="characters"
        />

        <FlatList
          data={depos.filter(
            (d) =>
              (d.depo_adi?.toLowerCase() || '').includes(depoSearchQuery.toLowerCase()) ||
              String(d.depo_no).includes(depoSearchQuery)
          )}
          keyExtractor={(d) => String(d.depo_no)}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => selectDepoAndSave(item)}
              style={{
                paddingVertical: 15,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderColor: isDark ? '#333' : '#eee',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255, 107, 0, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 15,
                }}
              >
                <Text style={{ color: '#FF6B00', fontWeight: 'bold' }}>{item.depo_no}</Text>
              </View>
              <Text
                style={{
                  color: isDark ? '#fff' : '#000',
                  fontSize: 16,
                  flex: 1,
                  fontWeight: '500',
                }}
              >
                {item.depo_adi}
              </Text>
              {String(selectedDepo?.depo_no) === String(item.depo_no) && (
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          )}
          style={{ maxHeight: 400 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#8a9ab5', fontSize: 14 }}>Depo bulunamadı</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );

  if (appMode === 'menu') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: styles.colors.bg }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

        {/* TOP FIXED APP BAR */}
        <View style={styles.menuHeaderBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <Image
              source={require('./assets/icon.png')}
              style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.menuHeaderTitle} numberOfLines={1}>
                MD TİCARET - SAYIM & STOK
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View style={[styles.pulseBadge, { backgroundColor: isConnected ? 'rgba(0,174,120,0.12)' : 'rgba(239,68,68,0.12)' }]}>
                  <View style={[styles.pulseDot, { backgroundColor: isConnected ? '#00AE78' : '#EF4444' }]} />
                  <Text style={[styles.pulseBadgeText, { color: isConnected ? '#00AE78' : '#EF4444' }]}>
                    Mikro ERP: {isConnected ? 'Çevrimiçi' : 'Çevrimdışı'}
                  </Text>
                </View>
                <Text style={styles.menuHeaderSubText}>• Sayım Paneli</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => !isSyncing && handleSync(false)}
              disabled={isSyncing}
              style={styles.headerSyncBtn}
            >
              <Animated.View style={isSyncing ? { transform: [{ rotate: spin }] } : undefined}>
                <Ionicons name="sync" size={16} color={styles.colors.secondary} />
              </Animated.View>
              <Text style={styles.headerSyncText}>Son Senk: {lastSyncTime}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                if (dbRef.current) {
                  const backups = await dbRef.current.getAllAsync('SELECT * FROM sayim_backups ORDER BY id DESC');
                  setSayimBackups(backups || []);
                }
                setShowSettingsModal(true);
              }}
              style={styles.headerIconBtn}
            >
              <Ionicons name="settings-outline" size={19} color={styles.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowUserSelectModal(true)}
              style={styles.headerUserBtn}
            >
              <Ionicons name="person" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* SCROLLABLE MAIN CONTENT */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HERO TACTICAL BANNER CARD (#213145) */}
          <View style={styles.heroCard}>
            {/* Ambient Radial Blur Glows */}
            <View style={styles.heroGlow1} pointerEvents="none" />
            <View style={styles.heroGlow2} pointerEvents="none" />

            {/* Warehouse Selector Row */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.heroDepoRow, { zIndex: 10, elevation: 10 }]}
              onPress={() => {
                setDepoSearchQuery('');
                setShowDepoModal(true);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <View style={styles.heroWarehouseIconBox}>
                  <Ionicons name="business" size={18} color="#FF6B00" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.heroDepoLabel}>AKTİF DEPO</Text>
                  <Text style={styles.heroDepoName} numberOfLines={1}>
                    {selectedDepo ? selectedDepo.depo_adi : '01 - Merkez Depo'}
                  </Text>
                </View>
              </View>
              <View style={styles.heroSwitchBtn} pointerEvents="none">
                <Text style={styles.heroSwitchBtnText}>Değiştir</Text>
                <Ionicons name="chevron-down" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            {/* Live Telemetry KPI Metrics */}
            <View style={styles.heroKpiRow}>
              <View style={styles.heroKpiChip}>
                <View>
                  <Text style={styles.heroKpiLabel}>Kayıtlı Stok</Text>
                  <Text style={styles.heroKpiValue}>
                    {totalProducts > 0 ? totalProducts.toLocaleString('tr-TR') : '60.420'}
                  </Text>
                </View>
                <View style={[styles.heroKpiDot, { backgroundColor: '#00AE78' }]} />
              </View>

              <View style={styles.heroKpiChip}>
                <View>
                  <Text style={styles.heroKpiLabel}>Bekleyen Sayım</Text>
                  <Text style={[styles.heroKpiValue, { color: '#FF6B00' }]}>
                    {activeCart.length > 0 ? `${activeCart.length} Kalem` : `${sayimBackups.length} Görev`}
                  </Text>
                </View>
                <View style={[styles.heroKpiDot, { backgroundColor: '#FF6B00' }]} />
              </View>
            </View>

            {/* Integrated Fast Search & Barcode Input */}
            <View style={styles.heroSearchRow}>
              <Ionicons name="search" size={18} color="#8a9ab5" style={{ marginLeft: 12, marginRight: 8 }} />
              <TextInput
                style={styles.heroSearchInput}
                placeholder="Barkod / Ürün Kodu ile hızlı ara..."
                placeholderTextColor="#8a9ab5"
                value={menuSearchInput}
                onChangeText={setMenuSearchInput}
                onSubmitEditing={() => {
                  if (menuSearchInput.trim().length > 0) {
                    const text = menuSearchInput.trim();
                    setMenuSearchInput('');
                    setAppMode('fiyatgor');
                    handleSearch(text);
                  }
                }}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.heroCameraBtn}
                onPress={() => {
                  setMenuSearchInput('');
                  setAppMode('fiyatgor');
                  setCameraActive(true);
                  setScanned(false);
                }}
              >
                <Ionicons name="barcode-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* OPERATIONAL SECTION HEADER */}
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.accentBar} />
              <Text style={styles.sectionTitle}>OPERASYONEL İŞLEMLER</Text>
            </View>
            <View style={styles.moduleCountBadge}>
              <Text style={styles.moduleCountText}>4 Modül Aktif</Text>
            </View>
          </View>

          {/* 2x2 OPERATIONAL GRID (Tactile Touch Cards) */}
          <View style={styles.gridContainer}>
            {/* CARD 1: FİYAT GÖR & STOK BİLGİ */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => !isSyncing && setAppMode('fiyatgor')}
              disabled={isSyncing}
              style={styles.tactileCard}
            >
              <View style={styles.tactileCardTop}>
                <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255, 107, 0, 0.12)' }]}>
                  <Ionicons name="pricetag" size={22} color="#FF6B00" />
                </View>
                <View style={styles.tagPill}>
                  <Text style={[styles.tagPillText, { color: '#FF6B00' }]}>Seri / Lot / Barkod</Text>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.tactileCardTitle}>FİYAT GÖR & STOK BİLGİ</Text>
                <Text style={styles.tactileCardSub} numberOfLines={1}>Fiyat, İskonto, Şube Stokları ve Hareketler</Text>
              </View>
            </TouchableOpacity>

            {/* CARD 2: DEPO SAYIM */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { if (!isSyncing) { setAppMode('sayim'); setShowDepoModal(true); } }}
              disabled={isSyncing}
              style={styles.tactileCard}
            >
              <View style={styles.tactileCardTop}>
                <View style={[styles.actionIconBox, { backgroundColor: 'rgba(0, 81, 213, 0.12)' }]}>
                  <Ionicons name="checkbox" size={22} color="#0051D5" />
                </View>
                <View style={[styles.tagPill, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <View style={[styles.pulseDotSmall, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.tagPillText, { color: '#EF4444' }]}>
                    {activeCart.length > 0 ? `${activeCart.length} Sepette` : `${sayimBackups.length} Aktif Görev`}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.tactileCardTitle}>DEPO SAYIM</Text>
                <Text style={styles.tactileCardSub} numberOfLines={1}>Reyon ve Raf Sayımı, Sayım Fişi Oluşturma</Text>
              </View>
            </TouchableOpacity>

            {/* CARD 3: DEPOLAR ARASI SEVK */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { if (!isSyncing) { setAppMode('sevk'); setShowSevkSourceModal(true); } }}
              disabled={isSyncing}
              style={styles.tactileCard}
            >
              <View style={styles.tactileCardTop}>
                <View style={[styles.actionIconBox, { backgroundColor: 'rgba(0, 174, 120, 0.12)' }]}>
                  <Ionicons name="swap-horizontal" size={22} color="#00AE78" />
                </View>
                <View style={[styles.tagPill, { backgroundColor: 'rgba(0, 174, 120, 0.12)' }]}>
                  <Text style={[styles.tagPillText, { color: '#00AE78' }]}>Transfer Fişi</Text>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.tactileCardTitle}>DEPOLAR ARASI SEVK</Text>
                <Text style={styles.tactileCardSub} numberOfLines={1}>Depo Nakil ve Transfer Fişi Takibi</Text>
              </View>
            </TouchableOpacity>

            {/* CARD 4: CARİ HESAPLAR & EKSTRE */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { if (!isSyncing) { setAppMode('cari'); setCariSearchQuery(''); setCariResults([]); } }}
              disabled={isSyncing}
              style={styles.tactileCard}
            >
              <View style={styles.tactileCardTop}>
                <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}>
                  <Ionicons name="wallet-outline" size={22} color={styles.colors.text} />
                </View>
                <Ionicons name="arrow-forward" size={18} color={styles.colors.textMuted} />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={styles.tactileCardTitle}>CARİ HESAPLAR & EKSTRE</Text>
                <Text style={styles.tactileCardSub} numberOfLines={1}>Müşteri/Tedarikçi Borç-Alacak, Fatura Detayı</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* CARD 5 (Full Width Hero): RAPORLAR & ANALİZ */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => !isSyncing && setAppMode('raporlar')}
            disabled={isSyncing}
            style={styles.reportHeroCard}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <View style={styles.reportIconBox}>
                <Ionicons name="stats-chart" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.reportHeroTitle}>RAPORLAR & ANALİZ</Text>
                  <View style={styles.reportTrendBadge}>
                    <Ionicons name="trending-up" size={12} color="#00AE78" />
                    <Text style={styles.reportTrendText}>+12.4%</Text>
                  </View>
                </View>
                <Text style={styles.reportHeroSub} numberOfLines={1}>
                  Geliş Tarihli Satış Hızı, Faturalar, Şube Dağılımı
                </Text>
              </View>
            </View>

            {/* Sparkline & Explore Pill */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.sparklineContainer}>
                <View style={[styles.sparklineBar, { height: 10, opacity: 0.4 }]} />
                <View style={[styles.sparklineBar, { height: 14, opacity: 0.5 }]} />
                <View style={[styles.sparklineBar, { height: 22, opacity: 0.7 }]} />
                <View style={[styles.sparklineBar, { height: 18, opacity: 0.6 }]} />
                <View style={[styles.sparklineBar, { height: 26, opacity: 0.85 }]} />
                <View style={[styles.sparklineBar, { height: 30, backgroundColor: '#FF6B00', opacity: 1 }]} />
              </View>
              <View style={styles.reportActionBtn}>
                <Text style={styles.reportActionBtnText}>İncele</Text>
                <Ionicons name="chevron-forward" size={14} color={styles.colors.secondary} />
              </View>
            </View>
          </TouchableOpacity>

          {/* RECENT SCANS SHELF (Son İşlem Yapılan Kalemler) */}
          <View style={styles.recentShelfCard}>
            <View style={styles.recentShelfHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time-outline" size={18} color={styles.colors.textMuted} />
                <Text style={styles.recentShelfTitle}>Son İşlem Yapılan Kalemler</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(true);
                }}
              >
                <Text style={styles.recentShelfAllText}>Tümünü Gör</Text>
              </TouchableOpacity>
            </View>

            {(() => {
              const displayRecentItems: any[] = [];

              // 1. First priority: Items from activeCart (currently counted)
              if (activeCart && activeCart.length > 0) {
                activeCart.forEach(item => {
                  if (displayRecentItems.length < 4 && !displayRecentItems.some(d => d.stock_code === item.stock_code)) {
                    displayRecentItems.push({
                      id: `cart_${item.stock_code}`,
                      stock_code: item.stock_code,
                      name: item.name,
                      barcode: item.barcode,
                      quantity: item.quantity,
                      unit: item.unit || 'Adet',
                      badge: 'Sepette',
                      badgeColor: '#FF6B00',
                      description: item.description,
                      icon: 'cart-outline',
                      iconColor: '#FF6B00',
                      itemRef: item
                    });
                  }
                });
              }

              // 2. Second priority: Items from recent scanned/searched products
              if (displayRecentItems.length < 4 && recentProducts && recentProducts.length > 0) {
                recentProducts.forEach(item => {
                  if (displayRecentItems.length < 4 && !displayRecentItems.some(d => d.stock_code === item.stock_code)) {
                    displayRecentItems.push({
                      id: `recent_${item.stock_code}`,
                      stock_code: item.stock_code,
                      name: item.name,
                      barcode: item.barcode,
                      quantity: item.quantity || 1,
                      unit: item.unit || 'Adet',
                      badge: item.depo_adi || '01 - Depo',
                      badgeColor: '#00AE78',
                      description: item.description,
                      icon: 'cube-outline',
                      iconColor: '#00AE78',
                      itemRef: item
                    });
                  }
                });
              }

              // 3. Third priority: Items from saved sayim backups
              if (displayRecentItems.length < 4 && sayimBackups && sayimBackups.length > 0) {
                for (const b of sayimBackups) {
                  try {
                    const cd = JSON.parse(b.cart_data);
                    if (Array.isArray(cd)) {
                      for (const item of cd) {
                        if (displayRecentItems.length < 4 && !displayRecentItems.some(d => d.stock_code === item.stock_code)) {
                          displayRecentItems.push({
                            id: `backup_${b.id}_${item.stock_code}`,
                            stock_code: item.stock_code,
                            name: item.name,
                            barcode: item.barcode,
                            quantity: item.quantity,
                            unit: item.unit || 'Adet',
                            badge: b.backup_date ? b.backup_date.split(' ')[0] : 'Sayım',
                            badgeColor: '#0051D5',
                            description: item.description,
                            icon: 'checkmark-done-circle-outline',
                            iconColor: '#0051D5',
                            itemRef: item
                          });
                        }
                      }
                    }
                  } catch (e) {}
                  if (displayRecentItems.length >= 4) break;
                }
              }

              if (displayRecentItems.length > 0) {
                return displayRecentItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id || idx}
                    style={styles.recentItemRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setAppMode('fiyatgor');
                      handleSearch(item.stock_code || item.barcode || item.name);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <View style={[styles.recentItemIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                        <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.recentItemCode}>{item.stock_code}</Text>
                          <View style={[styles.recentRackBadge, { backgroundColor: item.badgeColor ? `${item.badgeColor}22` : undefined }]}>
                            <Text style={[styles.recentRackText, { color: item.badgeColor || '#00AE78' }]}>{item.badge}</Text>
                          </View>
                        </View>
                        <Text style={styles.recentItemName} numberOfLines={1}>{item.name}</Text>
                        {!!item.description && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Ionicons name="chatbubble-ellipses" size={11} color="#FF6B00" />
                            <Text style={{ fontSize: 11, color: '#FF6B00', fontWeight: '700' }} numberOfLines={1}>
                              {item.description}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <Text style={styles.recentItemQty}>{item.quantity}</Text>
                      <Text style={styles.recentItemUnit}>{item.unit || 'Adet'}</Text>
                    </View>
                  </TouchableOpacity>
                ));
              }

              return (
                <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cube-outline" size={32} color={styles.colors.textMuted} style={{ marginBottom: 8, opacity: 0.6 }} />
                  <Text style={{ color: styles.colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                    Henüz işlem yapılmış ürün bulunmuyor
                  </Text>
                  <Text style={{ color: styles.colors.textMuted, fontSize: 11, marginTop: 4, textAlign: 'center', opacity: 0.8 }}>
                    Barkod okuttuğunuz veya sayım yaptığınız gerçek stoklar burada listelenecektir.
                  </Text>
                </View>
              );
            })()}
          </View>
        </ScrollView>

        {/* FIXED BOTTOM NAVIGATION & APP STATUS BAR */}
        <View style={styles.fixedBottomNavContainer}>
          <View style={styles.bottomNavTabsRow}>
            <TouchableOpacity
              style={styles.bottomNavTab}
              onPress={() => { setAppMode('sayim'); setShowDepoModal(true); }}
            >
              <Ionicons name="barcode-outline" size={22} color={styles.colors.textMuted} />
              <Text style={styles.bottomNavLabel}>Sayım</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomNavTab}
              onPress={() => setAppMode('fiyatgor')}
            >
              <Ionicons name="cube-outline" size={22} color={styles.colors.textMuted} />
              <Text style={styles.bottomNavLabel}>Stoklar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomNavTab}
              onPress={() => setAppMode('raporlar')}
            >
              <Ionicons name="document-text-outline" size={22} color={styles.colors.textMuted} />
              <Text style={styles.bottomNavLabel}>Evraklar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomNavTab}
              onPress={() => setAppMode('raporlar')}
            >
              <Ionicons name="stats-chart-outline" size={22} color={styles.colors.textMuted} />
              <Text style={styles.bottomNavLabel}>Rapor</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomNavTab}
              onPress={() => { setAppMode('sevk'); setShowSevkSourceModal(true); }}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color={styles.colors.textMuted} />
              <Text style={styles.bottomNavLabel}>Transfer</Text>
            </TouchableOpacity>
          </View>

          {/* System Version & Update Strip */}
          <View style={styles.bottomSystemStrip}>
            <Text style={styles.bottomSystemText}>MD Ticaret Mobil Sistemleri • v{CURRENT_VERSION}</Text>
            <TouchableOpacity
              style={styles.bottomUpdateBtn}
              onPress={() => checkForUpdates(false)}
            >
              <Ionicons name="cloud-download-outline" size={13} color="#FF6B00" />
              <Text style={styles.bottomUpdateBtnText}>Güncellemeleri Denetle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* MODALS: Ayarlar Modal & User Select Modal */}
        <Modal isVisible={showSettingsModal} onBackdropPress={() => setShowSettingsModal(false)} style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ayarlar</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={26} color={styles.colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: styles.colors.border }}>
              <Text style={{ color: styles.colors.text, fontSize: 15, fontWeight: '600' }}>Açılışta Otomatik Senkronizasyon</Text>
              <TouchableOpacity onPress={async () => { const newVal = !autoSync; setAutoSync(newVal); await AsyncStorage.setItem('autoSync', newVal ? 'true' : 'false'); }}>
                <Ionicons name={autoSync ? 'toggle' : 'toggle-outline'} size={38} color={autoSync ? '#00AE78' : '#ccc'} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: styles.colors.border }}>
              <Text style={{ color: styles.colors.text, fontSize: 15, fontWeight: '600' }}>Karanlık Tema (Dark Mode)</Text>
              <TouchableOpacity onPress={() => setManualTheme(prev => prev === 'dark' ? 'light' : 'dark')}>
                <Ionicons name={isDark ? 'toggle' : 'toggle-outline'} size={38} color={isDark ? '#00AE78' : '#ccc'} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: styles.colors.border }}>
              <Text style={{ color: styles.colors.text, fontSize: 15, fontWeight: '600' }}>Mikro Kullanıcı Numarası</Text>
              <TouchableOpacity onPress={() => { setShowSettingsModal(false); setTimeout(() => setShowUserSelectModal(true), 400); }} style={{ backgroundColor: '#00AE78', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Ayarla: {mikroUserNo}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: styles.colors.border }}>
              <View>
                <Text style={{ color: styles.colors.text, fontSize: 15, fontWeight: '600' }}>Uygulama Güncellemesi</Text>
                <Text style={{ color: styles.colors.textMuted, fontSize: 12, marginTop: 2 }}>Mevcut Sürüm: v{CURRENT_VERSION}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowSettingsModal(false);
                  setTimeout(() => checkForUpdates(false), 400);
                }}
                style={{ backgroundColor: styles.colors.secondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>KONTROL ET</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 18 }}>
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: styles.colors.text, marginBottom: 8 }}>Son Gönderilen Sayım Yedekleri</Text>
              {sayimBackups.length === 0 ? (
                <Text style={{ color: styles.colors.textMuted, fontStyle: 'italic', fontSize: 13 }}>Henüz yedeklenmiş bir sayım yok.</Text>
              ) : (
                <FlatList data={sayimBackups} keyExtractor={item => String(item.id)} renderItem={({ item }) => (
                  <View style={{ borderBottomWidth: 1, borderColor: styles.colors.borderLight, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ color: styles.colors.text, fontWeight: 'bold', fontSize: 13 }}>{item.backup_date}</Text>
                      <Text style={{ color: styles.colors.textMuted, fontSize: 12, marginTop: 1 }}>Toplam: {item.item_count} ürün</Text>
                      <Text style={{ color: '#FF6B00', fontSize: 11, fontWeight: 'bold', marginTop: 1 }} numberOfLines={1}>{(() => {
                        try {
                          const cd = JSON.parse(item.cart_data);
                          const isSevk = cd.length > 0 && cd[0].is_sevk;
                          const nameStr = isSevk ? `Çıkış: ${cd[0].depo_adi} ➔ Giriş: ${cd[0].target_depo_adi}` : (cd.length > 0 ? cd[0].depo_adi : '');
                          return nameStr + (item.mikro_evrak_no ? ` • MOB ${item.mikro_evrak_no}` : '');
                        } catch (e) { return ''; }
                      })()}</Text>
                      {item.mikro_sent === 1 && <Text style={{ color: '#00AE78', fontSize: 10, marginTop: 1, fontWeight: 'bold' }}>✓ Mikro'ya Gönderildi</Text>}
                    </View>
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
                    }} style={{ backgroundColor: styles.colors.cardLow, borderWidth: 1, borderColor: styles.colors.border, padding: 8, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' }}>
                      <Text style={{ color: styles.colors.text, fontSize: 11, fontWeight: 'bold' }}>DÜZENLE</Text>
                    </TouchableOpacity>
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
                <Ionicons name="close-circle" size={30} color="#EF4444" />
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
                }} style={{ paddingVertical: 14, borderBottomWidth: 1, borderColor: styles.colors.borderLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: styles.colors.text, fontSize: 15, fontWeight: '700' }}>{item.KULLANICI_ADI} (ID: {item.KULLANICI_NO})</Text>
                  {mikroUserNo === item.KULLANICI_NO.toString() && <Ionicons name="checkmark-circle" size={22} color="#00AE78" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>

        {renderDepoModal()}
      </SafeAreaView>
    );
  }

  if (appMode === 'raporlar') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0B1C30' : '#F8F9FF' }}>
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

        {/* SCREEN TOP HEADER BAR */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={[styles.headerBtn, { flexDirection: 'row', width: 'auto', paddingHorizontal: 12, gap: 4 }]}
            onPress={() => { setAppMode('menu'); setIsShowingCart(false); setCameraActive(false); }}
          >
            <Ionicons name="chevron-back" size={18} color={styles.colors.text} />
            <Text style={{ color: styles.colors.text, fontSize: 13, fontWeight: '700' }}>Menü</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {appMode === 'sayim' && (
              <TouchableOpacity onPress={() => setShowDepoModal(true)} style={{ alignItems: 'center' }}>
                <Text style={styles.headerTitle}>DEPO SAYIM İŞLEMİ</Text>
                <Text style={[styles.headerSubtitle, { color: '#00AE78', fontWeight: '700' }]} numberOfLines={1}>
                  #{editingEvrakNo ? `SYM-${editingEvrakNo}` : 'SYM-2026-089'} • {selectedDepo?.depo_adi || 'Depo Seç'}
                </Text>
              </TouchableOpacity>
            )}
            {appMode === 'sevk' && (
              <TouchableOpacity onPress={() => setShowSevkSourceModal(true)} style={{ alignItems: 'center' }}>
                <Text style={[styles.headerTitle, { color: '#FF6B00' }]}>DEPOLAR ARASI TRANSFER</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {sevkSourceDepo ? sevkSourceDepo.depo_adi : 'Çıkış'} ➔ {sevkTargetDepo ? sevkTargetDepo.depo_adi : 'Giriş'}
                </Text>
              </TouchableOpacity>
            )}
            {appMode === 'fiyatgor' && (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerTitle}>FİYAT GÖR & STOK</Text>
                <Text style={styles.headerSubtitle}>2D Optik Lazer Barkod Arama</Text>
              </View>
            )}
            {appMode === 'cari' && (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerTitle}>CARİ HESAPLAR & DEFTER</Text>
                <Text style={styles.headerSubtitle}>Müşteri / Tedarikçi Ekstre</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {appMode === 'fiyatgor' && (
              <View style={[styles.pulseBadge, { backgroundColor: 'rgba(0,174,120,0.12)' }]}>
                <View style={[styles.pulseDot, { backgroundColor: '#00AE78' }]} />
                <Text style={[styles.pulseBadgeText, { color: '#00AE78' }]}>Optik 2D</Text>
              </View>
            )}

            {(appMode === 'sayim' || appMode === 'sevk') && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => { setIsShowingCart(true); setCameraActive(false); }}
              >
                <Ionicons name="cart-outline" size={22} color={styles.colors.secondary} />
                {activeCart.length > 0 && (
                  <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#FF6B00', borderRadius: 9, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{activeCart.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.headerBtn, cameraActive && styles.headerBtnActive]}
              onPress={() => {
                setCameraActive(!cameraActive);
                if (!cameraActive) {
                  setScanned(false);
                  setProduct(null);
                  setIsShowingCart(false);
                }
              }}
            >
              <Ionicons
                name={cameraActive ? "barcode" : "barcode-outline"}
                size={22}
                color={cameraActive ? "#fff" : styles.colors.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* TACTICAL VIEWFINDER WITH RETICLE & LASER */}
        {cameraActive && (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              enableTorch={torch}
            />

            {/* Viewfinder reticle corner brackets */}
            <View style={styles.reticleContainer}>
              <View style={[styles.reticleCorner, { top: 6, left: 6, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 }]} />
              <View style={[styles.reticleCorner, { top: 6, right: 6, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 }]} />
              <View style={[styles.reticleCorner, { bottom: 6, left: 6, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 }]} />
              <View style={[styles.reticleCorner, { bottom: 6, right: 6, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 }]} />
            </View>

            {/* Animated Laser Scanning Line */}
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

            {/* Top Viewfinder Status Badge */}
            <View style={styles.viewfinderTopBadge}>
              <View style={[styles.pulseDot, { backgroundColor: '#FF6B00' }]} />
              <Text style={styles.viewfinderBadgeText}>Lazer Aktif • 1D/2D Kod Algılanıyor</Text>
            </View>

            {/* Bottom Viewfinder Status Badge */}
            <View style={styles.viewfinderBottomBadge}>
              <Text style={styles.viewfinderSubText}>Odak: Otomatik (1080p 60fps)</Text>
              <Text style={[styles.viewfinderSubText, { color: '#FF6B00', fontWeight: 'bold' }]}>FPS: 60</Text>
            </View>

            <TouchableOpacity style={[styles.flashBtn, torch && styles.flashBtnActive]} onPress={() => setTorch(!torch)}>
              <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={20} color={torch ? "#fff" : "#FF6B00"} />
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
              <View style={{ paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: isDark ? '#333' : '#E2E8F0' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: isDark ? '#fff' : '#000', fontWeight: 'bold', fontSize: 14 }}>{item.name}</Text>
                    <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{appMode === 'sevk' ? `Çıkış: ${item.depo_adi} -> Giriş: ${item.target_depo_adi}` : `Depo: ${item.depo_adi}`}</Text>
                  </View>
                  <TextInput
                    style={{ color: appMode === 'sevk' ? '#FF6B00' : '#10B981', fontSize: 17, fontWeight: 'bold', marginRight: 10, minWidth: 50, textAlign: 'center', backgroundColor: isDark ? '#333' : '#eee', borderRadius: 8, padding: 6 }}
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
                  <TouchableOpacity onPress={() => saveCartToStorage(activeCart.filter(c => c.stock_code !== item.stock_code))} style={{ padding: 4 }}>
                    <Ionicons name='trash' size={22} color='#EF4444' />
                  </TouchableOpacity>
                </View>

                {/* AÇIKLAMA / NOT ROZETİ VE DÜZENLEME BUTONU */}
                <View style={{ marginTop: 6, paddingTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  {item.description ? (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingItemForDesc(item);
                        setEditDescInput(item.description || '');
                        setShowDescModal(true);
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255, 107, 0, 0.15)' : 'rgba(255, 107, 0, 0.10)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FF6B00' }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={13} color="#FF6B00" style={{ marginRight: 5 }} />
                      <Text style={{ color: '#FF6B00', fontSize: 11, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                        {item.description}
                      </Text>
                      <Ionicons name="create-outline" size={13} color="#FF6B00" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingItemForDesc(item);
                        setEditDescInput('');
                        setShowDescModal(true);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
                    >
                      <Ionicons name="add-circle-outline" size={14} color="#3B82F6" />
                      <Text style={{ fontSize: 11, color: '#3B82F6', fontWeight: '700' }}>
                        + Not / Açıklama Ekle (Örn: 3 adeti arızalı)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
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
              <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* HIZLI BARKOD OKUT KARTI */}
                <TouchableOpacity
                  style={{
                    backgroundColor: isDark ? '#1C2738' : '#FFFFFF',
                    borderRadius: 18,
                    padding: 16,
                    marginHorizontal: 16,
                    marginTop: 14,
                    borderWidth: 1.5,
                    borderColor: '#FF6B00',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    shadowColor: '#FF6B00',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 4
                  }}
                  activeOpacity={0.8}
                  onPress={() => {
                    setCameraActive(true);
                    setScanned(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255, 107, 0, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barcode-outline" size={26} color="#FF6B00" />
                    </View>
                    <View>
                      <Text style={{ color: isDark ? '#fff' : '#0B132B', fontSize: 15, fontWeight: '900' }}>HIZLI BARKOD OKUT</Text>
                      <Text style={{ color: '#8a9ab5', fontSize: 11, fontWeight: '600', marginTop: 2 }}>2D Optik Lazer Kamera ile Tara</Text>
                    </View>
                  </View>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FF6B00', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="scan" size={17} color="#fff" />
                  </View>
                </TouchableOpacity>

                {/* SON İNCELENEN ÜRÜNLER LİSTESİ */}
                {recentProducts && recentProducts.length > 0 ? (
                  <View style={{ marginHorizontal: 16, marginTop: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="time-outline" size={16} color="#8a9ab5" />
                        <Text style={{ color: isDark ? '#fff' : '#0B132B', fontSize: 13, fontWeight: '800' }}>SON İNCELENEN ÜRÜNLER</Text>
                      </View>
                      <Text style={{ color: '#8a9ab5', fontSize: 11, fontWeight: '700' }}>{recentProducts.length} Ürün</Text>
                    </View>
                    {recentProducts.slice(0, 5).map((rp, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={{
                          backgroundColor: isDark ? '#162032' : '#FFFFFF',
                          borderRadius: 14,
                          padding: 12,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: isDark ? '#2E3E55' : '#E2E8F0',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        activeOpacity={0.7}
                        onPress={() => {
                          handleSearch(rp.stock_code || rp.barcode);
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{rp.name}</Text>
                          <Text style={{ color: '#8a9ab5', fontSize: 11, marginTop: 2 }}>{rp.stock_code} {rp.barcode ? `• ${rp.barcode}` : ''}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#FF6B00" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.idleState, { marginTop: 30 }]}>
                    <Ionicons name="barcode-outline" size={60} color="rgba(255, 107, 0, 0.3)" />
                    <Text style={styles.idleText}>Barkod taramak için yukarıdaki</Text>
                    <Text style={styles.idleText}>veya sağ üstteki butona dokunun.</Text>
                  </View>
                )}
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

        <Modal
          isVisible={!!product}
          onBackdropPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }}
          onBackButtonPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }}
          style={styles.modal}
          backdropOpacity={0.7}
          avoidKeyboard={true}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalContent, { padding: 18, maxHeight: '92%', minHeight: '60%' }]}>
              {/* MODAL TOP BAR: BADGES & CLOSE */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={styles.productBadgesRow}>
                  {!!product?.iskonto_orani && (
                    <View style={styles.productBadgeEmerald}>
                      <Ionicons name="pricetag" size={12} color="#00AE78" />
                      <Text style={{ color: '#00AE78', fontSize: 11, fontWeight: '800' }}>
                        İSK: %{product.iskonto_orani.replace(/^%/, '')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.productBadgeDate}>
                    <Ionicons name="calendar-outline" size={12} color={styles.colors.textMuted} />
                    <Text style={{ color: styles.colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                      {product?.lastup_date || 'Güncel'}
                    </Text>
                  </View>
                  <View style={styles.productBadgeUnit}>
                    <Text style={{ color: styles.colors.secondary, fontSize: 11, fontWeight: '800' }}>
                      {product?.unit || 'Adet'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => { Keyboard.dismiss(); setProduct(null); setScanned(false); if (wasScannedByCamera) { setCameraActive(true); setWasScannedByCamera(false); } }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={28} color="#EF4444" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {product && (
                  <View style={styles.infoContainer}>
                    {/* PRODUCT TITLE & EDIT BUTTON */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.nameText, { textAlign: 'left', marginBottom: 2, fontSize: 18 }]}>
                          {product.name}
                        </Text>
                        <Text style={{ color: styles.colors.textMuted, fontSize: 11, fontWeight: '600' }}>
                          Stok Kodu: {product.stock_code}
                        </Text>
                      </View>
                      {product.stock_code && product.stock_code !== '---' && (
                        <TouchableOpacity
                          onPress={openEditNameModal}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 12,
                            backgroundColor: styles.colors.secondarySoft,
                            borderWidth: 1.5,
                            borderColor: styles.colors.secondary,
                            flexShrink: 0
                          }}
                        >
                          <Ionicons name="pencil" size={16} color={styles.colors.secondary} />
                          <Text style={{ color: styles.colors.secondary, fontSize: 13, fontWeight: '800' }}>İsmi Düzenle</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* MASSIVE PRICE BOX (When not in pure Sayım) */}
                    {appMode !== 'sayim' && (
                      <View style={[styles.massivePriceBox, { backgroundColor: isDark ? '#162032' : '#F8FAFC', borderColor: '#00AE78', borderWidth: 1.5, padding: 16 }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Ionicons name="pricetag" size={13} color="#00AE78" />
                            <Text style={{ color: styles.colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                              Satış Fiyatı (Peşin)
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                            <Text style={[styles.massivePriceText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{formatPrice(product.price)}</Text>
                            <Text style={{ color: '#00AE78', fontSize: 20, fontWeight: '900' }}>{product.currency}</Text>
                          </View>
                          {!!product?.iskonto_orani && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: 'rgba(0, 174, 120, 0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' }}>
                              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>
                                %{product.iskonto_orani.replace(/^%/, '')} İsk. Net:
                              </Text>
                              <Text style={{ color: isDark ? '#38BDF8' : '#0284C7', fontSize: 14, fontWeight: '900' }}>
                                {formatPrice((parseFloat(product.price) || 0) * (1 - (parseFloat(product.iskonto_orani.replace(/^%/, '')) || 0) / 100))} {product.currency}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 8 }}>
                          <View style={styles.kdvBadge}>
                            <Text style={styles.kdvBadgeText}>KDV DAHİL</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              ToastAndroid.show(`Fiyat kopyalandı: ${formatPrice(product.price)} ${product.currency}`, ToastAndroid.SHORT);
                            }}
                            style={{ padding: 6, backgroundColor: isDark ? '#2E3E55' : '#E2E8F0', borderRadius: 8 }}
                          >
                            <Ionicons name="copy-outline" size={15} color={styles.colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* 2X2 MONOSPACE TECHNICAL METADATA GRID */}
                    <View style={styles.metaGrid2x2}>
                      <View style={styles.metaBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={styles.metaLabel}>BARKOD NO</Text>
                          <TouchableOpacity
                            onPress={() => {
                              ToastAndroid.show(`Barkod: ${product.barcode}`, ToastAndroid.SHORT);
                            }}
                          >
                            <Ionicons name="copy-outline" size={14} color={styles.colors.secondary} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.metaValue} numberOfLines={1}>{product.barcode}</Text>
                      </View>

                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>STOK KODU</Text>
                        <Text style={styles.metaValue} numberOfLines={1}>{product.stock_code}</Text>
                      </View>

                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>BİRİM / KDV</Text>
                        <Text style={styles.metaValue}>{product.unit || 'Adet'} • %20 KDV</Text>
                      </View>

                      <View style={styles.metaBox}>
                        <Text style={styles.metaLabel}>AKTİF DEPO</Text>
                        <Text style={[styles.metaValue, { color: '#00AE78' }]} numberOfLines={1}>
                          {selectedDepo ? selectedDepo.depo_adi : '01 - Merkez Depo'}
                        </Text>
                      </View>
                    </View>

                    {/* NOT FOUND NOTIFICATION */}
                    {product.name === 'Ürün Bulunamadı' && (
                      <View style={{ marginTop: 10, gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.modalSubmit, { backgroundColor: '#EF4444' }]}
                          onPress={() => setReportModalVisible(true)}
                        >
                          <Text style={styles.modalSubmitText}>EKSİK OLARAK BİLDİR</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={[styles.modalSubmit, { backgroundColor: '#00AE78' }]}
                          onPress={() => setShowBarkodIsleModal(true)}
                        >
                          <Text style={styles.modalSubmitText}>BARKOD İŞLE (EŞLEŞTİR)</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* SAYIM & SEVK: ERGONOMIC QUANTITY STEPPER (62x62) */}
                    {product.name !== 'Ürün Bulunamadı' && (appMode === 'sayim' || appMode === 'sevk') && (
                      <View style={{ marginTop: 6, marginBottom: 12 }}>
                        {/* Difference Callout Banner */}
                        <View style={styles.diffBanner}>
                          <View style={styles.diffBannerRow}>
                            <Text style={{ color: styles.colors.textMuted, fontSize: 11, fontWeight: '700' }}>Mevcut Sistem Stoğu:</Text>
                            <Text style={{ color: styles.colors.text, fontSize: 12, fontWeight: '800' }}>
                              {formatPrice(depoStoklar.find((d: any) => selectedDepo && String(d.DepoNo).trim().padStart(2, '0') === String(selectedDepo.depo_no).trim().padStart(2, '0'))?.Miktar || 0)} {product.unit || 'Adet'}
                            </Text>
                          </View>
                          <View style={styles.diffBannerRow}>
                            <Text style={{ color: '#FF6B00', fontSize: 11, fontWeight: '800' }}>Sayım Sonrası Fark:</Text>
                            <Text style={{ color: '#FF6B00', fontSize: 12, fontWeight: '900' }}>
                              {formatPrice((parseFloat(countInput) || 0) - (depoStoklar.find((d: any) => selectedDepo && String(d.DepoNo).trim().padStart(2, '0') === String(selectedDepo.depo_no).trim().padStart(2, '0'))?.Miktar || 0))} {product.unit || 'Adet'}
                            </Text>
                          </View>
                        </View>

                        {/* Stepper Controls */}
                        <View style={styles.stepperRow}>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => setCountInput(prev => String(Math.max(1, (parseInt(prev) || 1) - 1)))}
                          >
                            <Ionicons name="remove" size={28} color={styles.colors.text} />
                          </TouchableOpacity>

                          <View style={styles.stepperInputBox}>
                            <TextInput
                              style={styles.stepperInput}
                              keyboardType="numeric"
                              value={countInput}
                              onChangeText={setCountInput}
                              autoFocus={false}
                              selectTextOnFocus={true}
                            />
                            <TouchableOpacity
                              style={styles.resetQtyBtn}
                              onPress={() => setCountInput('1')}
                            >
                              <Ionicons name="backspace-outline" size={20} color={styles.colors.textMuted} />
                            </TouchableOpacity>
                          </View>

                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => setCountInput(prev => String((parseInt(prev) || 0) + 1))}
                          >
                            <Ionicons name="add" size={28} color={styles.colors.text} />
                          </TouchableOpacity>
                        </View>

                        {/* Quick Add Pills */}
                        <View style={styles.quickPillsRow}>
                          {[1, 5, 10, 25, 50].map(delta => (
                            <TouchableOpacity
                              key={delta}
                              style={styles.quickPillBtn}
                              onPress={() => setCountInput(prev => String((parseInt(prev) || 0) + delta))}
                            >
                              <Text style={styles.quickPillText}>+{delta}</Text>
                            </TouchableOpacity>
                          ))}
                          <TouchableOpacity
                            style={[styles.quickPillBtn, { backgroundColor: styles.colors.secondarySoft }]}
                            onPress={() => setCountInput(prev => String((parseInt(prev) || 0) + 24))}
                          >
                            <Text style={[styles.quickPillText, { color: styles.colors.secondary }]}>x24</Text>
                          </TouchableOpacity>
                        </View>

                        {/* SAYIM NOTU / AÇIKLAMA GİRİŞİ (VURGULANMIŞ ALAN) */}
                        <View style={[styles.descInputContainer, { borderWidth: 1.5, borderColor: '#FF6B00', borderRadius: 16, padding: 12, backgroundColor: isDark ? 'rgba(255, 107, 0, 0.08)' : 'rgba(255, 107, 0, 0.05)', marginTop: 10, marginBottom: 12 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="chatbubble-ellipses" size={17} color="#FF6B00" />
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FF6B00' }}>
                                Sayım Notu / Açıklama (Arızalı, Hasarlı vb.)
                              </Text>
                            </View>
                            {countDescription.length > 0 && (
                              <TouchableOpacity onPress={() => setCountDescription('')} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 }}>
                                <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: 'bold' }}>Temizle</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          <TextInput
                            style={[styles.descInputField, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1', color: styles.colors.text, height: 44, fontSize: 13, paddingHorizontal: 12, borderRadius: 10 }]}
                            placeholder="Örn: 20 adet sayıldı, 3 adeti arızalı / ambalaj ezik..."
                            placeholderTextColor={styles.colors.textMuted}
                            value={countDescription}
                            onChangeText={setCountDescription}
                          />

                          {/* Hızlı Açıklama Etiketleri */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
                            {[
                              '⚠️ 1 Adet Arızalı',
                              '⚠️ 2 Adet Arızalı',
                              '⚠️ 3 Adet Arızalı',
                              '📦 Kutu Hasarlı',
                              '🔍 Eksik Parça',
                              '🏷️ Etiketsiz',
                              '✨ Teşhir Ürünü'
                            ].map((tag, tIdx) => (
                              <TouchableOpacity
                                key={tIdx}
                                style={[styles.quickTagBtn, { backgroundColor: isDark ? '#334155' : '#ffffff', borderColor: '#FF6B00', borderWidth: 1 }]}
                                onPress={() => {
                                  setCountDescription(prev => prev ? `${prev}, ${tag}` : tag);
                                }}
                              >
                                <Text style={[styles.quickTagText, { color: isDark ? '#fff' : '#1e293b' }]}>{tag}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>

                        {/* Giant Emerald Commit Button */}
                        <TouchableOpacity
                          style={styles.commitCountBtn}
                          onPress={handleAddToCart}
                        >
                          <Ionicons name="checkmark-circle" size={24} color="#fff" />
                          <Text style={styles.commitCountBtnText}>
                            {appMode === 'sevk' ? 'TRANSFERE EKLE' : 'SEPETE EKLE / SAYIMA DAHİL ET'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* FİYAT GÖR MODUNDA SAYIMA DAHİL ETME KISAYOLU */}
                    {product.name !== 'Ürün Bulunamadı' && appMode === 'fiyatgor' && (
                      <TouchableOpacity
                        style={[styles.modalSubmit, { backgroundColor: '#FF6B00', marginTop: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }]}
                        onPress={() => {
                          setAppMode('sayim');
                        }}
                      >
                        <Ionicons name="barcode-outline" size={20} color="#fff" />
                        <Text style={styles.modalSubmitText}>BU ÜRÜNÜ SAYIMA DAHİL ET (ADET & NOT GİRİŞİ)</Text>
                      </TouchableOpacity>
                    )}

                    {/* WAREHOUSE STOCK BREAKDOWN ACCORDION */}
                    {product.name !== 'Ürün Bulunamadı' && (
                      <View style={styles.depoStokContainer}>
                        <View style={styles.depoStokHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="business" size={16} color={styles.colors.secondary} />
                            <Text style={styles.depoStokTitle}>ŞUBE & DEPO STOKLARI</Text>
                          </View>
                          {isLoadingDepoStok ? (
                            <ActivityIndicator size="small" color={styles.colors.secondary} />
                          ) : (
                            <Text style={{ color: '#00AE78', fontSize: 11, fontWeight: '800' }}>
                              Toplam: {formatPrice(depoStoklar.reduce((sum: number, d: any) => sum + (d.Miktar || 0), 0))} {product.unit || 'Adet'}
                            </Text>
                          )}
                        </View>

                        {!isLoadingDepoStok && depoStoklar.length === 0 && (
                          <View style={styles.depoStokEmpty}>
                            <Ionicons name="information-circle-outline" size={18} color={styles.colors.textMuted} />
                            <Text style={styles.depoStokEmptyText}>Bu üründe kayıtlı stok bulunmuyor.</Text>
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
                      </View>
                    )}

                    {/* TACTICAL ACTION BUTTONS */}
                    {product.name !== 'Ürün Bulunamadı' && (
                      <View style={{ gap: 8, marginTop: 4 }}>
                        <TouchableOpacity
                          style={[styles.modalSubmit, { backgroundColor: '#FF6B00', height: 48, flexDirection: 'row', gap: 8, padding: 0 }]}
                          onPress={() => { setHkCariFiltre(''); setDateStart(null); setDateEnd(null); fetchStokHareketleri(product.stock_code, false); }}
                        >
                          <Ionicons name="time-outline" size={20} color="#fff" />
                          <Text style={[styles.modalSubmitText, { fontSize: 13 }]}>Stok Hareketleri (Son 50 İşlem)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.modalSubmit, { backgroundColor: styles.colors.cardLow, borderWidth: 1, borderColor: styles.colors.border, height: 44, flexDirection: 'row', gap: 8, padding: 0 }]}
                          onPress={() => setReportModalVisible(true)}
                        >
                          <Ionicons name="alert-circle-outline" size={18} color={styles.colors.textMuted} />
                          <Text style={[styles.modalSubmitText, { color: styles.colors.text, fontSize: 12 }]}>Eksik / Hasarlı Barkod Bildir</Text>
                        </TouchableOpacity>
                      </View>
                    )}

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

      {renderDepoModal()}

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

      {/* SEPET ÜRÜN AÇIKLAMA / NOT DÜZENLEME MODAL */}
      <Modal
        isVisible={showDescModal}
        onBackdropPress={() => { setShowDescModal(false); setEditingItemForDesc(null); }}
        backdropOpacity={0.7}
        avoidKeyboard={true}
        style={styles.modal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="chatbubble-ellipses" size={22} color="#FF6B00" />
                <Text style={styles.modalTitle}>Sayım Notu / Açıklama</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowDescModal(false); setEditingItemForDesc(null); }}>
                <Ionicons name="close-circle" size={28} color="#8a9ab5" />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 14 }}>
              <Text style={{ color: '#8a9ab5', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                ÜRÜN: <Text style={{ color: isDark ? '#fff' : '#000' }}>{editingItemForDesc?.name}</Text>
              </Text>
              <Text style={{ color: '#8a9ab5', fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                STOK KODU: <Text style={{ color: isDark ? '#fff' : '#000' }}>{editingItemForDesc?.stock_code}</Text>
              </Text>
            </View>

            <TextInput
              style={[styles.modalInput, { height: 90, marginBottom: 8, fontSize: 14 }]}
              placeholder="Örn: 20 adet sayıldı, 3 adeti arızalı / ambalaj yırtık..."
              placeholderTextColor="#8a9ab5"
              multiline
              maxLength={100}
              value={editDescInput}
              onChangeText={setEditDescInput}
              autoFocus={true}
            />

            {/* Hızlı Açıklama Etiketleri */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 16 }}>
              {[
                '⚠️ 1 Adet Arızalı',
                '⚠️ 2 Adet Arızalı',
                '⚠️ 3 Adet Arızalı',
                '📦 Kutu Hasarlı',
                '🔍 Eksik Parça',
                '🏷️ Etiketsiz',
                '✨ Teşhir Ürünü'
              ].map((tag, tIdx) => (
                <TouchableOpacity
                  key={tIdx}
                  style={[styles.quickTagBtn, { backgroundColor: isDark ? '#333' : '#f1f5f9', borderColor: isDark ? '#444' : '#cbd5e1' }]}
                  onPress={() => {
                    setEditDescInput(prev => prev ? `${prev}, ${tag}` : tag);
                  }}
                >
                  <Text style={[styles.quickTagText, { color: isDark ? '#fff' : '#1e293b' }]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {editDescInput.length > 0 && (
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: '#EF4444' }]}
                  onPress={() => {
                    if (editingItemForDesc) {
                      const updated = activeCart.map(c => c.stock_code === editingItemForDesc.stock_code ? { ...c, description: '' } : c);
                      saveCartToStorage(updated);
                    }
                    setShowDescModal(false);
                    setEditingItemForDesc(null);
                  }}
                >
                  <Text style={styles.buttonText}>NOTU SİL</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1, backgroundColor: '#64748B' }]}
                onPress={() => { setShowDescModal(false); setEditingItemForDesc(null); }}
              >
                <Text style={styles.buttonText}>VAZGEÇ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { flex: 1.5, backgroundColor: '#10B981' }]}
                onPress={() => {
                  if (editingItemForDesc) {
                    const updated = activeCart.map(c => c.stock_code === editingItemForDesc.stock_code ? { ...c, description: editDescInput.trim() } : c);
                    saveCartToStorage(updated);
                  }
                  setShowDescModal(false);
                  setEditingItemForDesc(null);
                }}
              >
                <Text style={[styles.buttonText, { color: '#fff' }]}>KAYDET</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* STICKY FLOATING CART DOCK */}
      {(appMode === 'sayim' || appMode === 'sevk') && activeCart.length > 0 && !isShowingCart && (
        <View style={styles.floatingCartBar}>
          <View style={styles.floatingCartLeft}>
            <View style={styles.floatingCartIconBox}>
              <Ionicons name="cart" size={20} color="#fff" />
            </View>
            <View>
              <Text style={styles.floatingCartSub}>Aktif Sepet</Text>
              <Text style={styles.floatingCartTitle}>
                {activeCart.length} Kalem • {activeCart.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0)} Adet
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.floatingCartBtn}
            onPress={() => { setIsShowingCart(true); setCameraActive(false); }}
          >
            <Text style={styles.floatingCartBtnText}>SEPETİ GÖR & ONAYLA</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean) => {
  const colors = isDark ? {
    bg: '#0B1C30',
    card: '#162234',
    cardLow: '#101F33',
    cardHigh: '#1F334E',
    heroBg: '#213145',
    heroText: '#EAF1FF',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: 'rgba(255,255,255,0.12)',
    borderLight: 'rgba(255,255,255,0.06)',
    primary: '#FF6B00',
    primarySoft: 'rgba(255, 107, 0, 0.15)',
    secondary: '#3B82F6',
    secondarySoft: 'rgba(59, 130, 246, 0.15)',
    tertiary: '#00AE78',
    tertiarySoft: 'rgba(0, 174, 120, 0.15)',
    success: '#00AE78',
    successSoft: 'rgba(0, 174, 120, 0.15)',
    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.15)'
  } : {
    bg: '#F8F9FF',
    card: '#FFFFFF',
    cardLow: '#EFF4FF',
    cardHigh: '#DCE9FF',
    heroBg: '#213145',
    heroText: '#EAF1FF',
    text: '#0B1C30',
    textMuted: '#64748B',
    border: '#E2E8F0',
    borderLight: '#EFF4FF',
    primary: '#FF6B00',
    primarySoft: 'rgba(255, 107, 0, 0.10)',
    secondary: '#0051D5',
    secondarySoft: 'rgba(0, 81, 213, 0.10)',
    tertiary: '#00AE78',
    tertiarySoft: 'rgba(0, 174, 120, 0.10)',
    success: '#00AE78',
    successSoft: 'rgba(0, 174, 120, 0.10)',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.10)',
    warning: '#D97706',
    warningSoft: 'rgba(217, 119, 6, 0.10)'
  };

  const sheet = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
    userNameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.bg },
    userNameTitle: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 24, marginBottom: 8, letterSpacing: -0.5 },
    userNameSubtitle: { color: colors.textMuted, fontSize: 15, marginBottom: 36, fontWeight: '500' },
    userNameInput: { width: '100%', backgroundColor: colors.card, borderRadius: 16, padding: 18, fontSize: 18, color: colors.text, borderWidth: 1.5, borderColor: colors.border, marginBottom: 24, textAlign: 'center', fontWeight: '600' },
    userNameButton: { backgroundColor: colors.primary, paddingHorizontal: 36, paddingVertical: 16, borderRadius: 16, width: '100%', alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
    userNameButtonText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },

    // MENU HEADER
    menuHeaderBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingTop: Platform.OS === 'android' ? 42 : 52,
      backgroundColor: isDark ? 'rgba(22, 34, 52, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      zIndex: 50
    },
    menuHeaderTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: -0.2
    },
    pulseBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 12,
      gap: 5
    },
    pulseDot: {
      width: 7,
      height: 7,
      borderRadius: 4
    },
    pulseDotSmall: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    pulseBadgeText: {
      fontSize: 10,
      fontWeight: '700'
    },
    menuHeaderSubText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600'
    },
    headerSyncBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardLow,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
      gap: 5
    },
    headerSyncText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '700'
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.cardLow,
      alignItems: 'center',
      justifyContent: 'center'
    },
    headerUserBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4
    },

    // HERO CARD (#213145)
    heroCard: {
      backgroundColor: colors.heroBg,
      borderRadius: 20,
      padding: 16,
      position: 'relative',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
      marginBottom: 16
    },
    heroGlow1: {
      position: 'absolute',
      right: -20,
      top: -20,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(255, 107, 0, 0.15)'
    },
    heroGlow2: {
      position: 'absolute',
      left: -20,
      bottom: -20,
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(0, 81, 213, 0.15)'
    },
    heroDepoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative',
      zIndex: 10,
      elevation: 10,
      marginBottom: 12
    },
    heroWarehouseIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: 'rgba(255, 107, 0, 0.15)',
      alignItems: 'center',
      justifyContent: 'center'
    },
    heroDepoLabel: {
      color: 'rgba(234, 241, 255, 0.65)',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase'
    },
    heroDepoName: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800',
      marginTop: 1
    },
    heroSwitchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      gap: 4
    },
    heroSwitchBtnText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700'
    },
    heroKpiRow: {
      flexDirection: 'row',
      gap: 8,
      position: 'relative',
      zIndex: 2,
      marginBottom: 12
    },
    heroKpiChip: {
      flex: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    heroKpiLabel: {
      color: 'rgba(234, 241, 255, 0.65)',
      fontSize: 10,
      fontWeight: '600'
    },
    heroKpiValue: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.3,
      marginTop: 2
    },
    heroKpiDot: {
      width: 7,
      height: 7,
      borderRadius: 4
    },
    heroSearchRow: {
      position: 'relative',
      zIndex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      borderRadius: 12,
      height: 48,
      overflow: 'hidden'
    },
    heroSearchInput: {
      flex: 1,
      fontSize: 13,
      color: '#0B1C30',
      fontWeight: '500',
      height: '100%'
    },
    heroCameraBtn: {
      width: 44,
      height: 40,
      marginRight: 4,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center'
    },

    // SECTION HEADERS
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      marginBottom: 10
    },
    accentBar: {
      width: 4,
      height: 16,
      borderRadius: 2,
      backgroundColor: colors.primary
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.5
    },
    moduleCountBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: colors.cardLow
    },
    moduleCountText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700'
    },

    // 2X2 OPERATIONAL GRID
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 12
    },
    tactileCard: {
      width: '48.5%',
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
      justifyContent: 'space-between',
      minHeight: 124
    },
    tactileCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    actionIconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center'
    },
    tagPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: colors.cardLow,
      gap: 4
    },
    tagPillText: {
      fontSize: 9,
      fontWeight: '800'
    },
    tactileCardTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: -0.2
    },
    tactileCardSub: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
      lineHeight: 15
    },

    // CARD 5: RAPORLAR HERO
    reportHeroCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12
    },
    reportIconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.secondary,
      alignItems: 'center',
      justifyContent: 'center'
    },
    reportHeroTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: -0.2
    },
    reportTrendBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: 'rgba(0, 174, 120, 0.12)',
      gap: 2
    },
    reportTrendText: {
      color: '#00AE78',
      fontSize: 10,
      fontWeight: '800'
    },
    reportHeroSub: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2
    },
    sparklineContainer: {
      height: 32,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 3,
      paddingHorizontal: 2
    },
    sparklineBar: {
      width: 6,
      backgroundColor: colors.secondary,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2
    },
    reportActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardLow,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
      gap: 3
    },
    reportActionBtnText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '700'
    },

    // RECENT SHELF
    recentShelfCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
      marginBottom: 16
    },
    recentShelfHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10
    },
    recentShelfTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800'
    },
    recentShelfAllText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '700'
    },
    recentItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      borderRadius: 12,
      backgroundColor: colors.cardLow,
      marginTop: 8
    },
    recentItemIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border
    },
    recentItemCode: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '800'
    },
    recentRackBadge: {
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
    },
    recentRackText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700'
    },
    recentItemName: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2
    },
    recentItemQty: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '900'
    },
    recentItemUnit: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600'
    },

    // FIXED BOTTOM NAVIGATION
    fixedBottomNavContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? 'rgba(16, 31, 51, 0.97)' : 'rgba(255, 255, 255, 0.97)',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      zIndex: 60
    },
    bottomNavTabsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      height: 54,
      paddingHorizontal: 8
    },
    bottomNavTab: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 54
    },
    bottomNavLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
      marginTop: 2
    },
    bottomSystemStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
      borderTopWidth: 1,
      borderTopColor: colors.borderLight
    },
    bottomSystemText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '500'
    },
    bottomUpdateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: colors.primarySoft,
      gap: 4
    },
    bottomUpdateBtnText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '700'
    },

    // VIEWFINDER AND CAMERA
    cameraBox: {
      height: SCREEN_HEIGHT * 0.28,
      overflow: 'hidden',
      position: 'relative',
      marginHorizontal: 16,
      marginTop: 10,
      marginBottom: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: '#000'
    },
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    reticleContainer: {
      ...StyleSheet.absoluteFillObject,
      margin: 16,
      pointerEvents: 'none'
    },
    reticleCorner: {
      position: 'absolute',
      width: 24,
      height: 24,
      borderColor: colors.primary
    },
    laserLine: {
      position: 'absolute',
      left: 20,
      right: 20,
      height: 2.5,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 8,
      elevation: 6
    },
    viewfinderTopBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(33, 49, 69, 0.85)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 6,
      zIndex: 10
    },
    viewfinderBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '700'
    },
    viewfinderBottomBadge: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(33, 49, 69, 0.85)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 8,
      zIndex: 10
    },
    viewfinderSubText: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 10,
      fontWeight: '600'
    },
    flashBtn: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(33, 49, 69, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      zIndex: 100
    },
    flashBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    targetFrame: { width: 260, height: 130, borderWidth: 2, borderColor: colors.primary, borderRadius: 16, backgroundColor: colors.primarySoft, borderStyle: 'dashed' },

    // SCREENS COMMON HEADER BAR
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      paddingTop: Platform.OS === 'android' ? 42 : 52,
      backgroundColor: colors.card,
      zIndex: 1000,
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    },
    headerBtn: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.cardLow,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border
    },
    headerBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    headerCenter: { alignItems: 'center', flex: 1 },
    headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    headerSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 2, fontWeight: '500' },
    syncBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, paddingVertical: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.primarySoft },
    syncBannerText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

    // RESULT PANEL & SEARCH
    resultPanel: {
      flex: 1,
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 16,
      marginTop: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border
    },
    searchContainer: {
      flexDirection: 'row',
      backgroundColor: colors.cardLow,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      alignItems: 'center',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border
    },
    searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
    clearSearch: { position: 'absolute', right: 46, zIndex: 10, padding: 5 },
    micSearch: { position: 'absolute', right: 12, zIndex: 10, padding: 5 },
    searchResultsList: { flex: 1 },
    searchResultItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border
    },
    searchResultName: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 3 },
    searchResultDetail: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
    infoContainer: { paddingBottom: 24 },

    // STITCH PRODUCT CARD COMPONENTS
    productBadgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10
    },
    productBadgeEmerald: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 174, 120, 0.12)',
      gap: 3
    },
    productBadgeDate: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.cardLow,
      gap: 3
    },
    productBadgeUnit: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.secondarySoft
    },
    massivePriceBox: {
      backgroundColor: colors.cardLow,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border
    },
    massivePriceText: {
      color: colors.primary,
      fontSize: 38,
      fontWeight: '900',
      letterSpacing: -1
    },
    kdvBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.secondarySoft
    },
    kdvBadgeText: {
      color: colors.secondary,
      fontSize: 10,
      fontWeight: '800'
    },
    metaGrid2x2: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14
    },
    metaBox: {
      width: '48.5%',
      backgroundColor: colors.cardLow,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border
    },
    metaLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase'
    },
    metaValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
      marginTop: 2
    },

    // DIFFERENCE CALLOUT BANNER (Sayım/Sevk)
    diffBanner: {
      backgroundColor: colors.cardLow,
      borderRadius: 12,
      padding: 10,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4
    },
    diffBannerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },

    // ERGONOMIC QUANTITY STEPPER (62x62)
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 12
    },
    stepperBtn: {
      width: 60,
      height: 60,
      borderRadius: 16,
      backgroundColor: colors.cardLow,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border
    },
    stepperInputBox: {
      flex: 1,
      height: 60,
      backgroundColor: colors.cardLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative'
    },
    stepperInput: {
      width: '100%',
      textAlign: 'center',
      fontSize: 28,
      fontWeight: '900',
      color: colors.text
    },
    resetQtyBtn: {
      position: 'absolute',
      right: 10,
      padding: 6
    },
    quickPillsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
      marginBottom: 14
    },
    quickPillBtn: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.cardLow,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border
    },
    quickPillText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '800'
    },
    commitCountBtn: {
      width: '100%',
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.tertiary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: colors.tertiary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 6
    },
    commitCountBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0.3
    },

    // STICKY FLOATING CART DOCK
    floatingCartBar: {
      position: 'absolute',
      bottom: 12,
      left: 14,
      right: 14,
      height: 60,
      borderRadius: 18,
      backgroundColor: colors.heroBg,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 12,
      zIndex: 100
    },
    floatingCartLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0
    },
    floatingCartIconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center'
    },
    floatingCartSub: {
      color: 'rgba(234, 241, 255, 0.65)',
      fontSize: 9,
      fontWeight: '700',
      textTransform: 'uppercase'
    },
    floatingCartTitle: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800'
    },
    floatingCartBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      gap: 6
    },
    floatingCartBtnText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.3
    },

    // OTHER BUTTONS & MODALS
    priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 10 },
    priceText: { color: colors.primary, fontSize: 44, fontWeight: '900', letterSpacing: -1.5 },
    currencyText: { color: colors.primary, fontSize: 18, fontWeight: '800' },
    nameText: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 18, lineHeight: 24 },
    codesRow: { flexDirection: 'row', backgroundColor: colors.cardLow, borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
    codeItem: { flex: 1, alignItems: 'center' },
    codeLabel: { color: colors.textMuted, fontSize: 9, letterSpacing: 0.8, marginBottom: 6, fontWeight: '800' },
    codeValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
    nextButton: { backgroundColor: colors.primary, padding: 16, borderRadius: 16, alignItems: 'center' },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
    nextButtonSmall: { flex: 1, backgroundColor: colors.cardLow, padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    reportButton: { flex: 1.2, backgroundColor: colors.primary, padding: 16, borderRadius: 16, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    reportedButton: { backgroundColor: '#334155', borderColor: '#334155', opacity: 0.7, shadowOpacity: 0 },
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center', letterSpacing: 0.5 },
    buttonTextYeni: { color: colors.text, fontWeight: '800', fontSize: 12, textAlign: 'center', letterSpacing: 0.5 },
    idleState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    idleText: { color: colors.textMuted, fontSize: 14, fontWeight: '600', marginTop: 6 },
    footer: { backgroundColor: colors.card, paddingBottom: 20, alignItems: 'center' },
    statsContainer: { backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, marginBottom: 12 },
    statsText: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    footerBrand: { color: colors.primary, opacity: 0.5, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    modal: { justifyContent: 'center', margin: 16 },
    modalContent: { backgroundColor: colors.card, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
    modalLabel: { color: colors.primary, fontSize: 13, fontWeight: '800', marginBottom: 16 },
    modalInput: { backgroundColor: colors.cardLow, borderRadius: 14, padding: 14, color: colors.text, height: 100, textAlignVertical: 'top', marginBottom: 20, fontSize: 14, borderWidth: 1, borderColor: colors.border },
    modalSubmit: { padding: 16, borderRadius: 16, alignItems: 'center', backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    modalSubmitText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
    modalBtn: { padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    stokBadge: { backgroundColor: colors.successSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 8, minWidth: 50, alignItems: 'center', borderWidth: 1, borderColor: colors.successSoft },
    stokBadgeText: { color: colors.success, fontSize: 12, fontWeight: '900' },
    stokBadgeTextZero: { color: colors.danger },
    depoStokContainer: { backgroundColor: colors.cardLow, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    depoStokHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    depoStokTitle: { color: colors.secondary, fontSize: 12, fontWeight: '900', letterSpacing: 0.8, marginLeft: 8 },
    depoStokEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
    depoStokEmptyText: { color: colors.textMuted, fontSize: 13, marginLeft: 6, fontWeight: '600' },
    depoStokItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    depoStokLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    depoStokNo: { backgroundColor: colors.card, color: colors.secondary, fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 10, borderWidth: 1, borderColor: colors.border },
    depoStokAdi: { color: colors.text, fontSize: 13, flex: 1, fontWeight: '600' },
    depoStokRight: { alignItems: 'flex-end', minWidth: 70 },
    depoStokMiktar: { color: colors.success, fontSize: 15, fontWeight: '900' },
    depoStokMiktarNegatif: { color: colors.danger },
    depoStokBirim: { color: colors.textMuted, fontSize: 9, marginTop: 1, fontWeight: '700' },
    depoStokToplam: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    depoStokToplamLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    depoStokToplamValue: { color: colors.success, fontSize: 16, fontWeight: '900' },
    noInternetWarning: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warningSoft, borderRadius: 14, padding: 14, marginBottom: 16 },
    noInternetText: { color: colors.warning, fontSize: 13, fontWeight: '700', marginLeft: 8 },
    descInputContainer: { marginTop: 12, marginBottom: 8 },
    descInputField: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, borderWidth: 1 },
    quickTagBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
    quickTagText: { fontSize: 11, fontWeight: '700' }
  });

  return { ...sheet, colors };
};
