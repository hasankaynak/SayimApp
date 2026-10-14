import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const AUTH_LOGIN_URL = 'https://mehmetdogrultd.com/ekatalog/panel_9x7q2w3e/api/mobil-auth-api.php?action=mobile_login';

export interface AuthSessionData {
  user: {
    user_id: number;
    username: string;
    display_name: string;
    role_id: number;
    role_code: string;
    role_name: string;
    mikro_user_no: number;
    mikro_user_name: string;
    pin_code?: string;
  };
  permissions: string[];
  restrictions: {
    allowed_mikro_users: string;
    denied_mikro_users: string;
    allowed_depo_nos: string;
    can_view_costs: boolean;
    can_view_all_customers: boolean;
    allowed_stok_groups?: string;
    allowed_cari_groups?: string;
  };
}

interface LoginViewProps {
  isDark: boolean;
  onLoginSuccess: (session: AuthSessionData) => void;
}

export default function LoginView({ isDark, onLoginSuccess }: LoginViewProps) {
  const [tab, setTab] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const colors = {
    bg: isDark ? '#0B1C30' : '#F8F9FF',
    card: isDark ? '#14253D' : '#FFFFFF',
    text: isDark ? '#F1F5F9' : '#0F172A',
    textMuted: isDark ? '#8A9AB5' : '#64748B',
    border: isDark ? '#213550' : '#E2E8F0',
    primary: '#FF6B00',
    accent: '#0051D5',
    errorBg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    errorBorder: '#FCA5A5',
    errorText: '#EF4444'
  };

  const handlePinPress = (digit: string) => {
    if (isLoading) return;
    setErrorMessage(null);
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        submitLogin({ pin_code: newPin });
      }
    }
  };

  const handlePinDelete = () => {
    if (isLoading) return;
    setErrorMessage(null);
    setPin(prev => prev.slice(0, -1));
  };

  const submitLogin = async (payload: { pin_code?: string; username?: string; password?: string }) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(AUTH_LOGIN_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.data && response.data.success) {
        const session: AuthSessionData = response.data;
        await AsyncStorage.setItem('@sayimapp_auth_session', JSON.stringify(session));
        onLoginSuccess(session);
      } else {
        const err = response.data?.error || response.data?.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol ediniz.';
        setErrorMessage(err);
        setPin('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const msg = error.response?.data?.error || error.response?.data?.message || 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol ediniz.';
      setErrorMessage(msg);
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (!username.trim()) {
      setErrorMessage('Lütfen kullanıcı adınızı giriniz.');
      return;
    }
    if (!password) {
      setErrorMessage('Lütfen şifrenizi giriniz.');
      return;
    }
    submitLogin({ username: username.trim(), password });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo & Başlık */}
          <View style={styles.headerBox}>
            <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="barcode-outline" size={36} color="#FFFFFF" />
            </View>
            <Text style={[styles.brandTitle, { color: colors.text }]}>MD TİCARET</Text>
            <Text style={[styles.brandSubtitle, { color: colors.primary }]}>
              Mobil Sayım & Saha ERP
            </Text>
            <Text style={[styles.brandCaption, { color: colors.textMuted }]}>
              Yetkili personel girişi yapınız
            </Text>
          </View>

          {/* Sekme Seçici (Hızlı PIN / Şifre) */}
          <View style={[styles.tabSelectorBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { setTab('pin'); setErrorMessage(null); }}
              style={[
                styles.tabBtn,
                tab === 'pin' && { backgroundColor: colors.primary }
              ]}
            >
              <Ionicons
                name="keypad-outline"
                size={16}
                color={tab === 'pin' ? '#FFFFFF' : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, { color: tab === 'pin' ? '#FFFFFF' : colors.textMuted }]}>
                Hızlı PIN Kodu
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { setTab('password'); setErrorMessage(null); }}
              style={[
                styles.tabBtn,
                tab === 'password' && { backgroundColor: colors.primary }
              ]}
            >
              <Ionicons
                name="person-outline"
                size={16}
                color={tab === 'password' ? '#FFFFFF' : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, { color: tab === 'password' ? '#FFFFFF' : colors.textMuted }]}>
                Kullanıcı & Şifre
              </Text>
            </TouchableOpacity>
          </View>

          {/* Hata Bildirimi */}
          {errorMessage && (
            <View style={[styles.errorCard, { backgroundColor: colors.errorBg, borderColor: colors.errorBorder }]}>
              <Ionicons name="alert-circle" size={18} color={colors.errorText} />
              <Text style={[styles.errorCardText, { color: colors.errorText }]}>
                {errorMessage}
              </Text>
            </View>
          )}

          {/* TAB 1: HIZLI PIN */}
          {tab === 'pin' && (
            <View style={[styles.pinContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.pinInstruction, { color: colors.textMuted }]}>
                4 Haneli Güvenlik PIN Kodunuzu Giriniz
              </Text>

              {/* PIN Noktaları */}
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map(idx => {
                  const isFilled = pin.length > idx;
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.pinDot,
                        { borderColor: colors.primary },
                        isFilled && { backgroundColor: colors.primary }
                      ]}
                    />
                  );
                })}
              </View>

              {isLoading && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginLeft: 8 }}>
                    Doğrulanıyor...
                  </Text>
                </View>
              )}

              {/* Tuş Takımı */}
              <View style={styles.keypadGrid}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <TouchableOpacity
                    key={num}
                    activeOpacity={0.7}
                    onPress={() => handlePinPress(num)}
                    disabled={isLoading}
                    style={[styles.keypadKey, { backgroundColor: isDark ? '#1C2F4D' : '#F1F5F9' }]}
                  >
                    <Text style={[styles.keypadNum, { color: colors.text }]}>{num}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setPin('')}
                  disabled={isLoading}
                  style={[styles.keypadKey, { backgroundColor: 'transparent' }]}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700' }}>TEMİZLE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handlePinPress('0')}
                  disabled={isLoading}
                  style={[styles.keypadKey, { backgroundColor: isDark ? '#1C2F4D' : '#F1F5F9' }]}
                >
                  <Text style={[styles.keypadNum, { color: colors.text }]}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handlePinDelete}
                  disabled={isLoading}
                  style={[styles.keypadKey, { backgroundColor: 'transparent' }]}
                >
                  <Ionicons name="backspace-outline" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* TAB 2: KULLANICI ADI & ŞİFRE */}
          {tab === 'password' && (
            <View style={[styles.formContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Kullanıcı Adı</Text>
                <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: isDark ? '#1C2F4D' : '#F8FAFC' }]}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: colors.text }]}
                    placeholder="Kullanıcı adınızı yazınız"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.text }]}>Şifre</Text>
                <View style={[styles.inputBox, { borderColor: colors.border, backgroundColor: isDark ? '#1C2F4D' : '#F8FAFC' }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { color: colors.text }]}
                    placeholder="Şifrenizi yazınız"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(p => !p)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handlePasswordSubmit}
                disabled={isLoading}
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>GİRİŞ YAP</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Alt Bilgi */}
          <View style={styles.footerBox}>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              Rol ve yetkiler e-katalog admin panelinden yönetilir.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: 24
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1
  },
  brandSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2
  },
  brandCaption: {
    fontSize: 12,
    marginTop: 4
  },
  tabSelectorBox: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700'
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14
  },
  errorCardText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600'
  },
  pinContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center'
  },
  pinInstruction: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 18,
    textAlign: 'center'
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 280,
    rowGap: 12
  },
  keypadKey: {
    width: 76,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  keypadNum: {
    fontSize: 22,
    fontWeight: '800'
  },
  formContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20
  },
  formGroup: {
    marginBottom: 16
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600'
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    marginTop: 8
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  footerBox: {
    alignItems: 'center',
    marginTop: 20
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center'
  }
});
