import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { sounds } from '../services/sound';
import { 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  LogIn, 
  Barcode, 
  Delete,
  ShieldCheck
} from 'lucide-react';

export const AUTH_LOGIN_URL = 'https://mehmetdogrultd.com/ekatalog/panel_9x7q2w3e/api/mobil-auth-api.php?action=mobile_login';

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
  onLoginSuccess: (session: AuthSessionData) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [tab, setTab] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keyboard PIN typing support (Desktop keyboard / Numpad)
  useEffect(() => {
    if (tab !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key >= '0' && e.key <= '9') {
        handlePinPress(e.key);
      } else if (e.key === 'Backspace') {
        handlePinDelete();
      } else if (e.key === 'Escape') {
        setPin('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tab, pin, isLoading]);

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
      let data: any = null;
      const electronAPI = (window as any).electronAPI;

      // Try IPC native login if in electron, otherwise direct axios
      if (electronAPI?.authLogin) {
        data = await electronAPI.authLogin(payload);
      } else {
        const response = await axios.post(AUTH_LOGIN_URL, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });
        data = response.data;
      }

      if (data && data.success) {
        const session: AuthSessionData = data;
        localStorage.setItem('@sayimapp_auth_session', JSON.stringify(session));
        sounds.playSuccess();
        onLoginSuccess(session);
      } else {
        sounds.playError();
        const err = data?.error || data?.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol ediniz.';
        setErrorMessage(err);
        setPin('');
      }
    } catch (error: any) {
      sounds.playError();
      const msg = error.response?.data?.error || error.response?.data?.message || 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol ediniz.';
      setErrorMessage(msg);
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden font-sans">
      
      {/* Background Decorative Gradient Orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl z-10 flex flex-col items-center">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-xl shadow-orange-500/20 mb-3">
            <Barcode className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-wide">MD TİCARET</h1>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-widest mt-0.5">
            Masaüstü Sayım & Saha ERP
          </p>
          <p className="text-xs text-slate-400 mt-1">Yetkili personel girişi yapınız</p>
        </div>

        {/* Tab Selector (PIN / Password) */}
        <div className="w-full flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => { setTab('pin'); setErrorMessage(null); setPin(''); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 ${
              tab === 'pin'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Hızlı PIN Kodu</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('password'); setErrorMessage(null); }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 ${
              tab === 'password'
                ? 'bg-orange-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Kullanıcı & Şifre</span>
          </button>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="w-full mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: PIN KODU */}
        {tab === 'pin' && (
          <div className="w-full flex flex-col items-center">
            <p className="text-xs text-slate-400 mb-3 font-medium">
              4 Haneli Güvenlik PIN Kodunuzu Giriniz
            </p>

            {/* PIN Dots */}
            <div className="flex space-x-4 mb-6">
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = pin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                      isFilled
                        ? 'bg-orange-500 border-orange-500 scale-110 shadow-lg shadow-orange-500/40'
                        : 'border-slate-600 bg-transparent'
                    }`}
                  />
                );
              })}
            </div>

            {isLoading && (
              <div className="text-xs text-orange-400 font-semibold mb-3 flex items-center space-x-2 animate-pulse">
                <span>Doğrulanıyor...</span>
              </div>
            )}

            {/* Numeric Keypad Grid */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinPress(digit)}
                  disabled={isLoading}
                  className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white font-mono font-bold text-xl transition-all border border-slate-700/60 shadow-md flex items-center justify-center disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                disabled={isLoading || pin.length === 0}
                className="h-14 rounded-2xl text-[11px] font-bold text-slate-400 hover:text-white transition-colors flex items-center justify-center disabled:opacity-30"
              >
                TEMİZLE
              </button>
              <button
                type="button"
                onClick={() => handlePinPress('0')}
                disabled={isLoading}
                className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-white font-mono font-bold text-xl transition-all border border-slate-700/60 shadow-md flex items-center justify-center disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinDelete}
                disabled={isLoading || pin.length === 0}
                className="h-14 rounded-2xl text-slate-400 hover:text-rose-400 transition-colors flex items-center justify-center disabled:opacity-30"
                title="Geri Sil"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-[11px] text-slate-500 mt-4">Klavyeden rakam tuşları ile de girebilirsiniz</p>
          </div>
        )}

        {/* TAB 2: KULLANICI ADI & ŞİFRE */}
        {tab === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Kullanıcı Adı</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı adınızı yazınız"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Şifre</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifrenizi yazınız"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <span>Giriş Yapılıyor...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>GİRİŞ YAP</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer info */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center w-full">
          <div className="text-[11px] text-slate-500 flex items-center justify-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Rol ve yetkiler e-katalog admin panelinden yönetilir.</span>
          </div>
        </div>

      </div>

    </div>
  );
};
