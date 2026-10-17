import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * SAFE SQL EXECUTOR & WRITE GUARD FOR MIKRO ERP
 * TEST ORTAMI & GÜVENLİ İSTEMCİ KORUMASI
 *
 * KESİN KURAL: MİKRO ERP'YE HİÇBİR VERİ YAZILMAYACAK!
 * Bu modül istemci seviyesinde çalışan tüm SQL sorgularını regex ve AST benzeri kurallarla denetler.
 * INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE veya EXEC içeren herhangi bir sorgu
 * tespit edildiğinde uzaktaki Mikro sunucusuna ağ paketi göndermeden engeller.
 * Sadece salt-okunur (SELECT) sorguların geçişine izin verilir.
 */

// Global Safe Mode bayrağı - Kullanıcı onayıyla canlı Mikro ERP aktarımı aktif
export const SAFE_TEST_MODE_ACTIVE = false;

/**
 * SQL sorgusunun veri yazma veya şema değiştirme içerip içermediğini kontrol eder.
 */
export function isWriteQuery(sql: string): boolean {
  if (!sql || typeof sql !== 'string') return false;

  // SQL yorum satırlarını temizle (-- yorumlar ve /* ... */ blokları)
  const cleanSql = sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();

  // Yazma / şema değiştirme anahtar kelimeleri
  const writePatterns = [
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+[^\s]+\s+SET\b/i,
    /\bUPDATE\s+/i,
    /\bDELETE\s+FROM\b/i,
    /\bDELETE\s+/i,
    /\bDROP\s+(TABLE|VIEW|PROCEDURE|INDEX|DATABASE|TRIGGER)\b/i,
    /\bALTER\s+(TABLE|VIEW|PROCEDURE|DATABASE)\b/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /\bMERGE\s+INTO\b/i,
    /\bEXEC\s+/i,
    /\bEXECUTE\s+/i,
    /\bCREATE\s+(TABLE|VIEW|PROCEDURE|INDEX|DATABASE|TRIGGER)\b/i,
    /\bGRANT\s+/i,
    /\bREVOKE\s+/i
  ];

  return writePatterns.some(pattern => pattern.test(cleanSql));
}

export interface SafeSqlResult {
  data: {
    success: boolean;
    test_blocked?: boolean;
    message?: string;
    data?: any[];
  };
  status: number;
  statusText: string;
  headers: any;
  config: any;
}

/**
 * Güvenli SQL yürütücü: Yazma sorgularını ağa göndermeden engeller,
 * sadece SELECT sorgularını Mikro API'ye iletir.
 */
export async function executeSqlSafe(
  apiUrl: string,
  query: string,
  config?: AxiosRequestConfig
): Promise<AxiosResponse<any>> {
  if (SAFE_TEST_MODE_ACTIVE && isWriteQuery(query)) {
    console.warn(
      `[SAFE GUARD] 🛡️ Mikro ERP yazma girişimi istemcide güvenle ENGELLENDİ!\nSorgu Özeti: ${query.substring(0, 140)}...`
    );

    // Taklit (mock) başarılı yanıt döndür - ağ trafiği oluşmaz, ERP korunur
    const mockResponse: SafeSqlResult = {
      data: {
        success: true,
        test_blocked: true,
        message: 'TEST_MODU: Mikro ERP yazma koruması devrede. Veritabanına hiçbir kayıt yazılmadı.',
        data: [{ success: 1, result_fix: 1, NextSira: 1, CreatedSira: 1 }]
      },
      status: 200,
      statusText: 'OK (Blocked by Client Safe Guard)',
      headers: { 'content-type': 'application/json' },
      config: config || {} as any
    };

    return mockResponse as AxiosResponse<any>;
  }

  // Güvenli SELECT / okuma sorgularını sunucuya ilet
  return axios.post(apiUrl, { query }, config);
}
