export interface Product {
  sto_kod: string;
  sto_isim: string;
  sto_kisa_ismi?: string;
  sto_birim1_ad?: string;
  sto_perakende_vergi?: number;
  sto_toptan_vergi?: number;
  bar_kodu?: string;
  fiyat?: number;
  fiyat_toptan?: number;
  kdv_dahil_fiyat?: number;
  lastup_date?: string;
  total_stock?: number;
  depo_stoklar?: Record<number, number>;
}

export interface BarcodeDefinition {
  bar_kodu: string;
  bar_stokkodu: string;
  bar_birimpntr?: number;
}

export interface Warehouse {
  dep_no: number;
  dep_adi: string;
  dep_kilitli?: boolean;
}

export interface DepoStokItem {
  DepoNo: number;
  DepoAdi: string;
  Miktar: number;
}

export interface CountItem {
  id: string;
  stock_code: string;
  stock_name: string;
  barcode?: string;
  counted_quantity: number;
  current_stock: number;
  difference: number;
  unit: string;
  price: number;
  total_price: number;
  timestamp: string;
  notes?: string;
}

export interface TransferItem {
  id: string;
  stock_code: string;
  stock_name: string;
  barcode?: string;
  miktar: number;
  source_stock: number;
  target_stock: number;
  unit: string;
  price: number;
  tutar: number;
  description?: string;
}

export interface DepoFisItem {
  id: string;
  stock_code: string;
  stock_name: string;
  barcode?: string;
  miktar: number;
  current_stock: number;
  unit: string;
  price: number;
  tutar: number;
  description?: string;
}

export interface InvoiceItem {
  Tarih: string;
  EvrakSeri: string;
  EvrakSira: number;
  BelgeNo: string;
  Miktar: number;
  BirimFiyat: number;
  Tutar: number;
  Iskonto1?: number;
  Iskonto2?: number;
  NetTutar: number;
  DovizCinsi: string;
  DepoNo: number;
  DepoAdi: string;
  CariKodu: string;
  CariUnvan: string;
}

export interface OrderItem {
  sip_Guid?: string;
  sip_tarih: string;
  sip_evrakno_seri: string;
  sip_evrakno_sira: number;
  sip_stok_kod: string;
  sip_stok_isim?: string;
  sip_miktar: number;
  sip_teslim_miktar: number;
  sip_kalan_miktar: number;
  sip_b_fiyat: number;
  sip_tutar: number;
  sip_musteri_kod: string;
  sip_musteri_unvan?: string;
  sip_depono: number;
  sip_depo_adi?: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export type ActiveTab = 'sayim' | 'sevk' | 'fisler' | 'alis-faturalari' | 'fiyat-gor' | 'siparisler' | 'settings';
