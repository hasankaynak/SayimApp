import React, { createContext, useContext, useState, useEffect } from 'react';
import { Warehouse, ActiveTab } from '../types';
import { api } from '../services/api';
import { updateService, UpdateStatus } from '../services/updater';
import { sounds } from '../services/sound';

interface AppContextType {
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('sayim');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeWarehouse, setActiveWarehouse] = useState<Warehouse | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverDetails, setServerDetails] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(updateService.getStatus());

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
        const whList = await api.getWarehouses();
        setWarehouses(whList);
        if (whList.length > 0 && !activeWarehouse) {
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

    // Check updates silently after 2 seconds
    const updateTimer = setTimeout(() => {
      updateService.checkForUpdates().catch(() => {});
    }, 2000);

    return () => {
      unsubUpdates();
      clearTimeout(updateTimer);
    };
  }, []);

  // Global USB Barcode Gun Listener (Fast Keyboard Input Detector)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if inside a text input or textarea AND user is typing slowly
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Handle Enter (Barcode guns send Enter after scanning string)
      if (e.key === 'Enter') {
        if (buffer.length >= 3 && timeDiff < 100) {
          // It was a fast barcode scan!
          const code = buffer.trim();
          buffer = '';
          sounds.playScanBeep();

          // Dispatch to active handler
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

      // If keys come with > 80ms gap, it is likely human typing, clear buffer
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

  // Save selected warehouse
  const handleSetActiveWarehouse = (w: Warehouse | null) => {
    setActiveWarehouse(w);
    if (w) {
      localStorage.setItem('sayimapp_default_depo', w.dep_no.toString());
    }
  };

  return (
    <AppContext.Provider
      value={{
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
