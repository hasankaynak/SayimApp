import React, { createContext, useContext, useState, useEffect } from 'react';
import { Warehouse, ActiveTab } from '../types';
import { api } from '../services/api';
import { updateService, UpdateStatus } from '../services/updater';
import { sounds } from '../services/sound';
import { AuthSessionData } from '../views/LoginView';

interface AppContextType {
  authSession: AuthSessionData | null;
  setAuthSession: (session: AuthSessionData | null) => void;
  logout: () => void;
  hasPerm: (permCode: string) => boolean;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  warehouses: Warehouse[];
  activeWarehouse: Warehouse | null;
  setActiveWarehouse: (w: Warehouse | null) => void;
  isConnected: boolean;
  serverDetails: any;
  checkConnection: () => Promise<boolean>;
  showUpdateModal: boolean;
  setShowUpdateModal: (show: boolean) => void;
  updateStatus: UpdateStatus;
  checkForUpdates: () => Promise<void>;
  registerBarcodeHandler: (handler: (code: string) => void) => () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth Session State
  const [authSession, setAuthSessionState] = useState<AuthSessionData | null>(() => {
    try {
      const saved = localStorage.getItem('@sayimapp_auth_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('sayim');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverDetails, setServerDetails] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(updateService.getStatus());

  const setAuthSession = (session: AuthSessionData | null) => {
    setAuthSessionState(session);
    if (session) {
      localStorage.setItem('@sayimapp_auth_session', JSON.stringify(session));
      // Re-check connection and load warehouses for this user
      checkConnection();
    } else {
      localStorage.removeItem('@sayimapp_auth_session');
    }
  };

  const logout = () => {
    if (confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
      setAuthSession(null);
      sounds.playWarning();
    }
  };

  const hasPerm = (permCode: string): boolean => {
    if (!authSession) return false;
    if (authSession.user.role_code === 'ADMIN') return true;
    return authSession.permissions?.includes(permCode) ?? false;
  };

  // Barcode Handlers stack
  const barcodeHandlersRef = React.useRef<((code: string) => void)[]>([]);

  const registerBarcodeHandler = (handler: (code: string) => void) => {
    barcodeHandlersRef.current.push(handler);
    return () => {
      barcodeHandlersRef.current = barcodeHandlersRef.current.filter(h => h !== handler);
    };
  };

  // Check connection & load warehouses
  const checkConnection = async (): Promise<boolean> => {
    const res = await api.testConnection();
    setIsConnected(res.success);
    setServerDetails(res.details || null);
    if (res.success) {
      try {
        let whList = await api.getWarehouses();

        // Filter by user restrictions if any
        if (authSession?.restrictions?.allowed_depo_nos) {
          const allowedNos = authSession.restrictions.allowed_depo_nos
            .split(',')
            .map(s => Number(s.trim()))
            .filter(n => !isNaN(n));
          if (allowedNos.length > 0) {
            whList = whList.filter(w => allowedNos.includes(w.dep_no));
          }
        }

        setWarehouses(whList);
        if (whList.length > 0) {
          const savedDepoNo = localStorage.getItem('sayimapp_default_depo');
          const matched = savedDepoNo ? whList.find(w => w.dep_no === Number(savedDepoNo)) : null;
          setActiveWarehouse(matched || whList[0]);
        }
      } catch (err) {
        console.error('Failed to load warehouses:', err);
      }
    }
    return res.success;
  };

  const checkForUpdates = async () => {
    const status = await updateService.checkForUpdates();
    if (status.state === 'available') {
      setShowUpdateModal(true);
    }
  };

  useEffect(() => {
    checkConnection();

    // Subscribe to update status changes
    const unsubUpdates = updateService.subscribe((status) => {
      setUpdateStatus(status);
      if (status.state === 'available') {
        setShowUpdateModal(true);
      }
    });

    // Check updates silently after 3 seconds
    const updateTimer = setTimeout(() => {
      updateService.checkForUpdates().catch(() => {});
    }, 3000);

    return () => {
      unsubUpdates();
      clearTimeout(updateTimer);
    };
  }, [authSession]);

  // Global USB Barcode Gun Listener
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && timeDiff < 100) {
          const code = buffer.trim();
          buffer = '';
          sounds.playScanBeep();

          if (barcodeHandlersRef.current.length > 0) {
            const topHandler = barcodeHandlersRef.current[barcodeHandlersRef.current.length - 1];
            topHandler(code);
          }
          if (isInput) {
            e.preventDefault();
          }
          return;
        }
        buffer = '';
        return;
      }

      if (timeDiff > 80 && buffer.length > 0) {
        buffer = '';
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSetActiveWarehouse = (w: Warehouse | null) => {
    setActiveWarehouse(w);
    if (w) {
      localStorage.setItem('sayimapp_default_depo', w.dep_no.toString());
    }
  };

  return (
    <AppContext.Provider
      value={{
        authSession,
        setAuthSession,
        logout,
        hasPerm,
        activeTab,
        setActiveTab,
        warehouses,
        activeWarehouse,
        setActiveWarehouse: handleSetActiveWarehouse,
        isConnected,
        serverDetails,
        checkConnection,
        showUpdateModal,
        setShowUpdateModal,
        updateStatus,
        checkForUpdates,
        registerBarcodeHandler,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
