import XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * FORMULA INJECTION & ELECTRONIC SPREADSHEET PROTECTION
 * Excel veya CSV dosyası açıldığında formül gibi çalışan (=, +, -, @)
 * karakterlerin kötüye kullanımını engellemek için tek tırnak (') ile sanitize edilir.
 */
export function sanitizeFormulaInjection(value: any): any {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return "'" + trimmed;
  }
  return trimmed;
}

export interface SayimCartItemExport {
  barcode: string;
  stock_code: string;
  name: string;
  depo_no: number | string;
  depo_adi?: string;
  target_depo_no?: number | string | null;
  target_depo_adi?: string | null;
  is_sevk?: boolean;
  quantity: number | string;
  unit?: string;
  description?: string;
  added_at?: string;
  referans_stok?: number;
}

export interface ExportSayimOptions {
  cart: SayimCartItemExport[];
  depoAdi?: string;
  depoNo?: number | string;
  userName?: string;
  isSevk?: boolean;
}

/**
 * Sayım sepetini güvenli biçimde Excel (.xlsx) dosyasına dönüştürür ve paylaşım ekranını açar.
 */
export async function exportSayimToExcel(options: ExportSayimOptions): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const { cart, depoAdi, depoNo, userName, isSevk } = options;
    if (!cart || cart.length === 0) {
      return { success: false, error: 'Dışa aktarılacak sayım verisi bulunmuyor.' };
    }

    const titlePrefix = isSevk ? 'Depolar_Arasi_Sevk' : 'Depo_Sayimi';
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${titlePrefix}_Depo_${depoNo || '0'}_${timestampStr}.xlsx`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    // Satırları formatla ve formül enjeksiyonuna karşı temizle
    const rows = cart.map((item, index) => {
      const parsedQty = parseFloat(String(item.quantity).replace(',', '.')) || 0;
      const refStok = item.referans_stok !== undefined ? Number(item.referans_stok) : null;
      const fark = refStok !== null ? parsedQty - refStok : null;

      const baseRow: Record<string, any> = {
        'Sıra': index + 1,
        'Barkod': sanitizeFormulaInjection(item.barcode || ''),
        'Stok Kodu': sanitizeFormulaInjection(item.stock_code || ''),
        'Ürün Adı': sanitizeFormulaInjection(item.name || ''),
        'Çıkış/Kaynak Depo No': sanitizeFormulaInjection(String(item.depo_no || depoNo || '')),
        'Çıkış/Kaynak Depo Adı': sanitizeFormulaInjection(item.depo_adi || depoAdi || '')
      };

      if (isSevk) {
        baseRow['Hedef Depo No'] = sanitizeFormulaInjection(String(item.target_depo_no || ''));
        baseRow['Hedef Depo Adı'] = sanitizeFormulaInjection(item.target_depo_adi || '');
      }

      baseRow['Sayılan Miktar'] = parsedQty;
      baseRow['Birim'] = sanitizeFormulaInjection(item.unit || 'Adet');

      if (!isSevk && refStok !== null) {
        baseRow['Mevcut Sistem Stoğu'] = refStok;
        baseRow['Sayım Farkı'] = fark;
      }

      baseRow['Kayıt Zamanı'] = sanitizeFormulaInjection(item.added_at || new Date().toLocaleString('tr-TR'));
      baseRow['Sayım Yapan'] = sanitizeFormulaInjection(userName || 'Mobil Kullanıcı');
      baseRow['Satır Açıklaması'] = sanitizeFormulaInjection(item.description || '');

      return baseRow;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isSevk ? 'Sevk_Listesi' : 'Sayim_Listesi');

    // Base64 olarak binary oluştur
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

    // Cihaz önbelleğine yaz
    await FileSystem.writeAsStringAsync(filePath, wbout, { encoding: FileSystem.EncodingType.Base64 });

    // Paylaşım penceresini aç
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: isSevk ? 'Sevk Listesini Paylaş (Excel)' : 'Sayım Listesini Paylaş (Excel)',
        UTI: 'com.microsoft.excel.xlsx'
      });
    }

    return { success: true, filePath };
  } catch (err: any) {
    console.error('exportSayimToExcel error:', err);
    return { success: false, error: err.message || 'Excel dışa aktarım hatası' };
  }
}
