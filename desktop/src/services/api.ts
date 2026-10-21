import { Product, Warehouse, DepoStokItem, InvoiceItem, OrderItem } from '../types';

export const DEFAULT_API_URL = 'http://185.136.205.19:3000/execute-sql';

class ApiService {
  private apiUrl: string = DEFAULT_API_URL;
  private safeTestMode: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sayimapp_api_url');
      if (saved) this.apiUrl = saved;
      const safe = localStorage.getItem('sayimapp_safe_mode');
      if (safe !== null) this.safeTestMode = safe === 'true';
    }
  }

  public getApiUrl(): string {
    return this.apiUrl;
  }

  public setApiUrl(url: string) {
    this.apiUrl = url.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem('sayimapp_api_url', this.apiUrl);
    }
  }

  public isSafeTestMode(): boolean {
    return this.safeTestMode;
  }

  public setSafeTestMode(active: boolean) {
    this.safeTestMode = active;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sayimapp_safe_mode', active ? 'true' : 'false');
    }
  }

  public async executeSql<T = any>(sql: string): Promise<T[]> {
    if (this.safeTestMode && this.isWriteQuery(sql)) {
      console.warn('[SAFE TEST MODE] Write query simulated:', sql.slice(0, 100));
      return [{ success: 1, CreatedSira: 1, simulated: true }] as any;
    }

    // 1. Try IPC bridge in Electron main process
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.executeSql) {
      try {
        const res = await electronAPI.executeSql(this.apiUrl, sql);
        if (res && res.success && Array.isArray(res.data)) {
          return res.data;
        } else if (res && !res.success) {
          console.warn('[api.ts] IPC executeSql returned error:', res.error);
        }
      } catch (ipcErr: any) {
        console.warn('[api.ts] IPC call failed, falling back to direct fetch:', ipcErr.message);
      }
    }

    // 2. Direct fetch fallback
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const resData = await response.json();
      if (resData && resData.success && Array.isArray(resData.data)) {
        return resData.data;
      } else if (resData && Array.isArray(resData)) {
        return resData;
      } else if (resData?.data && Array.isArray(resData.data)) {
        return resData.data;
      } else if (resData?.error) {
        throw new Error(resData.error);
      }
      return [];
    } catch (fetchErr: any) {
      console.error('[api.ts] Query error:', fetchErr.message);
      throw fetchErr;
    }
  }

  private isWriteQuery(sql: string): boolean {
    const clean = sql.replace(/--.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
    const writePatterns = [
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+/i,
      /\bDELETE\s+/i,
      /\bDROP\s+/i,
      /\bALTER\s+/i,
      /\bTRUNCATE\s+/i,
    ];
    return writePatterns.some(p => p.test(clean));
  }

  public async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const q = `
        SELECT 
          @@SERVERNAME as ServerName, 
          DB_NAME() as DbName, 
          CONVERT(varchar, GETDATE(), 120) as ServerTime
      `;
      const rows = await this.executeSql(q);
      if (rows && rows.length > 0) {
        return { success: true, message: 'Bağlantı Başarılı', details: rows[0] };
      }
      return { success: false, message: 'Sunucudan yanıt alınamadı.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Bağlantı hatası' };
    }
  }

  public async getWarehouses(): Promise<Warehouse[]> {
    const q = `
      SELECT dep_no, dep_adi, ISNULL(dep_kilitli, 0) as dep_kilitli
      FROM DEPOLAR WITH (NOLOCK)
      WHERE ISNULL(dep_kilitli, 0) = 0
      ORDER BY dep_no
    `;
    const list = await this.executeSql<Warehouse>(q);
    if (list && list.length > 0) return list;

    // Fallback if empty
    return [
      { dep_no: 1, dep_adi: 'Merkez depo' },
      { dep_no: 2, dep_adi: 'TASKINKOY MAGAZA' },
      { dep_no: 3, dep_adi: 'BAĞLANTILI ÜRÜNLER DEPOSU' },
    ];
  }

  public async getInitialProducts(limit = 50): Promise<Product[]> {
    const q = `
      SELECT TOP ${limit}
        s.sto_kod,
        s.sto_isim,
        s.sto_kisa_ismi,
        s.sto_birim1_ad,
        ISNULL(s.sto_perakende_vergi, 0) as sto_perakende_vergi,
        ISNULL(s.sto_toptan_vergi, 0) as sto_toptan_vergi,
        ISNULL(bt.bar_kodu, '') as bar_kodu,
        ISNULL(sfl.sfiyat_fiyati, 0) as fiyat,
        ISNULL(sfl2.sfiyat_fiyati, 0) as fiyat_toptan,
        ROUND(ISNULL(sfl.sfiyat_fiyati, 0) * (1 + ISNULL(s.sto_perakende_vergi, 0) / 100.0), 2) as kdv_dahil_fiyat,
        ISNULL(CONVERT(varchar, sfl.sfiyat_lastup_date, 104), '') as lastup_date
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod AND bt.bar_iptal = 0
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = 1
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl2 WITH (NOLOCK) ON s.sto_kod = sfl2.sfiyat_stokkod AND sfl2.sfiyat_listesirano = 2
      WHERE s.sto_iptal = 0
      ORDER BY s.sto_kod ASC
    `;
    return this.executeSql<Product>(q);
  }

  public async searchProducts(query: string, limit = 50): Promise<Product[]> {
    const clean = query.trim().replace(/'/g, "''");
    if (!clean) return this.getInitialProducts(limit);

    const isBarcode = /^\d{5,18}$/.test(clean);
    let condition = '';

    if (isBarcode) {
      condition = `(bt.bar_kodu = '${clean}' OR s.sto_kod = '${clean}')`;
    } else {
      const words = clean.split(/\s+/).filter(Boolean);
      const parts = words.map(w => `(s.sto_isim LIKE '%${w}%' OR s.sto_kod LIKE '%${w}%' OR bt.bar_kodu LIKE '%${w}%')`);
      condition = parts.join(' AND ');
    }

    const q = `
      SELECT TOP ${limit}
        s.sto_kod,
        s.sto_isim,
        s.sto_kisa_ismi,
        s.sto_birim1_ad,
        ISNULL(s.sto_perakende_vergi, 0) as sto_perakende_vergi,
        ISNULL(s.sto_toptan_vergi, 0) as sto_toptan_vergi,
        ISNULL(bt.bar_kodu, '') as bar_kodu,
        ISNULL(sfl.sfiyat_fiyati, 0) as fiyat,
        ISNULL(sfl2.sfiyat_fiyati, 0) as fiyat_toptan,
        ROUND(ISNULL(sfl.sfiyat_fiyati, 0) * (1 + ISNULL(s.sto_perakende_vergi, 0) / 100.0), 2) as kdv_dahil_fiyat,
        ISNULL(CONVERT(varchar, sfl.sfiyat_lastup_date, 104), '') as lastup_date
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod AND bt.bar_iptal = 0
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = 1
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl2 WITH (NOLOCK) ON s.sto_kod = sfl2.sfiyat_stokkod AND sfl2.sfiyat_listesirano = 2
      WHERE s.sto_iptal = 0 AND (${condition})
      ORDER BY s.sto_isim
    `;

    return this.executeSql<Product>(q);
  }

  public async getProductByBarcode(barcode: string): Promise<Product | null> {
    const clean = barcode.trim().replace(/'/g, "''");
    if (!clean) return null;

    const q = `
      SELECT TOP 1
        s.sto_kod,
        s.sto_isim,
        s.sto_kisa_ismi,
        s.sto_birim1_ad,
        ISNULL(s.sto_perakende_vergi, 0) as sto_perakende_vergi,
        ISNULL(s.sto_toptan_vergi, 0) as sto_toptan_vergi,
        ISNULL(bt.bar_kodu, '${clean}') as bar_kodu,
        ISNULL(sfl.sfiyat_fiyati, 0) as fiyat,
        ISNULL(sfl2.sfiyat_fiyati, 0) as fiyat_toptan,
        ROUND(ISNULL(sfl.sfiyat_fiyati, 0) * (1 + ISNULL(s.sto_perakende_vergi, 0) / 100.0), 2) as kdv_dahil_fiyat,
        ISNULL(CONVERT(varchar, sfl.sfiyat_lastup_date, 104), '') as lastup_date
      FROM STOKLAR s WITH (NOLOCK)
      LEFT JOIN BARKOD_TANIMLARI bt WITH (NOLOCK) ON bt.bar_stokkodu = s.sto_kod AND bt.bar_iptal = 0
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl WITH (NOLOCK) ON s.sto_kod = sfl.sfiyat_stokkod AND sfl.sfiyat_listesirano = 1
      LEFT JOIN STOK_SATIS_FIYAT_LISTELERI sfl2 WITH (NOLOCK) ON s.sto_kod = sfl2.sfiyat_stokkod AND sfl2.sfiyat_listesirano = 2
      WHERE s.sto_iptal = 0 AND (bt.bar_kodu = '${clean}' OR s.sto_kod = '${clean}')
    `;

    const rows = await this.executeSql<Product>(q);
    return rows.length > 0 ? rows[0] : null;
  }

  public async getDepoStock(stockCode: string): Promise<DepoStokItem[]> {
    const clean = stockCode.trim().replace(/'/g, "''");
    const q = `
      SELECT 
        d.dep_no as DepoNo,
        d.dep_adi as DepoAdi,
        ISNULL(
          SUM(
            CASE 
              WHEN h.sth_giris_depo_no = d.dep_no AND h.sth_tip = 0 THEN h.sth_miktar
              WHEN h.sth_cikis_depo_no = d.dep_no AND h.sth_tip = 1 THEN -h.sth_miktar
              WHEN h.sth_giris_depo_no = d.dep_no AND h.sth_tip = 2 THEN h.sth_miktar
              WHEN h.sth_cikis_depo_no = d.dep_no AND h.sth_tip = 2 THEN -h.sth_miktar
              ELSE 0 
            END
          ), 0
        ) as Miktar
      FROM DEPOLAR d WITH (NOLOCK)
      LEFT JOIN STOK_HAREKETLERI h WITH (NOLOCK) 
        ON (h.sth_giris_depo_no = d.dep_no OR h.sth_cikis_depo_no = d.dep_no) 
        AND h.sth_stok_kod = '${clean}'
        AND h.sth_iptal = 0
      WHERE ISNULL(d.dep_kilitli, 0) = 0
      GROUP BY d.dep_no, d.dep_adi
      ORDER BY d.dep_no
    `;
    return this.executeSql<DepoStokItem>(q);
  }

  public async getSingleWarehouseStock(stockCode: string, depoNo: number): Promise<number> {
    const clean = stockCode.trim().replace(/'/g, "''");
    const q = `
      SELECT 
        ISNULL(
          SUM(
            CASE 
              WHEN h.sth_giris_depo_no = ${depoNo} AND h.sth_tip = 0 THEN h.sth_miktar
              WHEN h.sth_cikis_depo_no = ${depoNo} AND h.sth_tip = 1 THEN -h.sth_miktar
              WHEN h.sth_giris_depo_no = ${depoNo} AND h.sth_tip = 2 THEN h.sth_miktar
              WHEN h.sth_cikis_depo_no = ${depoNo} AND h.sth_tip = 2 THEN -h.sth_miktar
              ELSE 0 
            END
          ), 0
        ) as Miktar
      FROM STOK_HAREKETLERI h WITH (NOLOCK)
      WHERE h.sth_stok_kod = '${clean}'
        AND (h.sth_giris_depo_no = ${depoNo} OR h.sth_cikis_depo_no = ${depoNo})
        AND h.sth_iptal = 0
    `;
    const rows = await this.executeSql<{ Miktar: number }>(q);
    return rows.length > 0 ? Number(rows[0].Miktar) : 0;
  }

  public async getInvoices(stockCode: string): Promise<InvoiceItem[]> {
    const clean = stockCode.trim().replace(/'/g, "''");
    const q = `
      SELECT 
        CONVERT(varchar, h.sth_tarih, 23) as Tarih,
        ISNULL(h.sth_evrakno_seri, '') as EvrakSeri,
        h.sth_evrakno_sira as EvrakSira,
        ISNULL(h.sth_belge_no, '') as BelgeNo,
        ISNULL(h.sth_miktar, 0) as Miktar,
        ISNULL(h.sth_birimfiyat, CASE WHEN h.sth_miktar > 0 THEN (h.sth_tutar / h.sth_miktar) ELSE 0 END) as BirimFiyat,
        ISNULL(h.sth_tutar, 0) as Tutar,
        ISNULL(h.sth_iskonto1, 0) as Iskonto1,
        ISNULL(h.sth_iskonto2, 0) as Iskonto2,
        (ISNULL(h.sth_tutar, 0) - ISNULL(h.sth_iskonto1, 0) - ISNULL(h.sth_iskonto2, 0)) as NetTutar,
        CASE 
          WHEN ISNULL(h.sth_har_doviz_cinsi, 0) = 0 THEN 'TL'
          WHEN h.sth_har_doviz_cinsi = 1 THEN 'USD'
          WHEN h.sth_har_doviz_cinsi = 2 THEN 'EUR'
          WHEN h.sth_har_doviz_cinsi = 3 THEN 'GBP'
          ELSE 'TL'
        END as DovizCinsi,
        h.sth_giris_depo_no as DepoNo,
        ISNULL((SELECT dep_adi FROM DEPOLAR WITH (NOLOCK) WHERE dep_no = h.sth_giris_depo_no), '') as DepoAdi,
        ISNULL(h.sth_cari_kodu, '') as CariKodu,
        ISNULL((SELECT cari_unvan1 FROM CARI_HESAPLAR WITH (NOLOCK) WHERE cari_kod = h.sth_cari_kodu), h.sth_cari_kodu) as CariUnvan
      FROM STOK_HAREKETLERI h WITH (NOLOCK)
      WHERE h.sth_stok_kod = '${clean}'
        AND h.sth_evraktip = 3 
        AND h.sth_tip = 0
        AND h.sth_iptal = 0
      ORDER BY h.sth_tarih DESC, h.sth_create_date DESC
    `;
    return this.executeSql<InvoiceItem>(q);
  }

  public async getNextSira(evrakTip: number, evrakSeri: string): Promise<number> {
    const cleanSeri = (evrakSeri || '').trim().replace(/'/g, "''");
    const q = `
      SELECT ISNULL(MAX(sth_evrakno_sira), 0) + 1 AS NextSira
      FROM STOK_HAREKETLERI WITH (NOLOCK)
      WHERE sth_evraktip = ${evrakTip}
        AND sth_evrakno_seri = '${cleanSeri}'
    `;
    const rows = await this.executeSql<{ NextSira: number }>(q);
    return rows.length > 0 ? rows[0].NextSira : 1;
  }

  public async getOrders(status: 'all' | 'bekleyen' | 'tamamlanan' = 'all', limit = 100): Promise<OrderItem[]> {
    let condition = '1=1';
    if (status === 'bekleyen') {
      condition = 's.sip_kalan_miktar > 0';
    } else if (status === 'tamamlanan') {
      condition = 's.sip_kalan_miktar <= 0';
    }

    const q = `
      SELECT TOP ${limit}
        CONVERT(varchar, s.sip_tarih, 23) as sip_tarih,
        ISNULL(s.sip_evrakno_seri, '') as sip_evrakno_seri,
        s.sip_evrakno_sira,
        s.sip_stok_kod,
        ISNULL(stk.sto_isim, '') as sip_stok_isim,
        ISNULL(s.sip_miktar, 0) as sip_miktar,
        ISNULL(s.sip_teslim_miktar, 0) as sip_teslim_miktar,
        ISNULL(s.sip_kalan_miktar, 0) as sip_kalan_miktar,
        ISNULL(s.sip_b_fiyat, 0) as sip_b_fiyat,
        ISNULL(s.sip_tutar, 0) as sip_tutar,
        ISNULL(s.sip_musteri_kod, '') as sip_musteri_kod,
        ISNULL(c.cari_unvan1, s.sip_musteri_kod) as sip_musteri_unvan,
        s.sip_depono,
        ISNULL((SELECT dep_adi FROM DEPOLAR WITH (NOLOCK) WHERE dep_no = s.sip_depono), '') as sip_depo_adi
      FROM SIPARISLER s WITH (NOLOCK)
      LEFT JOIN STOKLAR stk WITH (NOLOCK) ON stk.sto_kod = s.sip_stok_kod
      LEFT JOIN CARI_HESAPLAR c WITH (NOLOCK) ON c.cari_kod = s.sip_musteri_kod
      WHERE s.sip_tip = 0 AND (${condition})
      ORDER BY s.sip_tarih DESC, s.sip_evrakno_sira DESC
    `;
    return this.executeSql<OrderItem>(q);
  }
}

export const api = new ApiService();
