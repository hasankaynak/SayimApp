/**
 * SAYIM & BARKOD DOĞRULAMA YARDIMCILARI (DATA INTEGRITY & VALIDATION)
 *
 * Kurallar:
 * 1. Barkod başındaki sıfırlar asla kırpılmaz / string olarak korunur.
 * 2. Donanım tarayıcılarından gelen \r, \n, \t sonlandırıcılar temizlenir.
 * 3. Hızlı donanım sekmeleri (debounce) engellenir ancak kullanıcının bilinçli ardışık taraması kabul edilir.
 * 4. Virgül / nokta ayrımı doğru yapılır (Türkçe klavye desteği).
 * 5. Sayımda negatif miktar engellenir.
 * 6. Sıfır (0) sayımı ile sayılmamış ürün açıkça ayırt edilir.
 */

export interface QuantityValidationResult {
  isValid: boolean;
  quantity: number;
  isZeroCount: boolean;
  errorMessage?: string;
}

/**
 * Kullanıcı miktar girişini güvenli biçimde parse eder ve doğrular.
 */
export function parseQuantitySafe(input: string | number | undefined | null): QuantityValidationResult {
  if (input === undefined || input === null) {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Lütfen miktar giriniz.' };
  }

  const rawStr = String(input).trim();
  if (rawStr === '') {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Miktar alanı boş bırakılamaz.' };
  }

  // Türkçe virgül (,) ve standart nokta (.) desteği
  const normalizedStr = rawStr.replace(',', '.');
  const num = parseFloat(normalizedStr);

  if (isNaN(num)) {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Geçersiz sayı formatı.' };
  }

  if (num < 0) {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Sayım miktarı negatif olamaz.' };
  }

  if (num > 999999) {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Miktar çok yüksek (Maksimum: 999.999).' };
  }

  const isZero = num === 0;
  return {
    isValid: true,
    quantity: num,
    isZeroCount: isZero
  };
}

/**
 * Barkodu temizler, baştaki sıfırları kesinlikle korur, \r, \n, \t karakterlerini ayıklar.
 */
export function sanitizeBarcode(code: any): string {
  if (code === undefined || code === null) return '';
  return String(code).replace(/[\r\n\t]/g, '').trim();
}

/**
 * Donanım tarayıcısının (lazer/kamera) aynı barkodu milisaniyeler içinde çift tetiklemesini engeller.
 * Bilinçli ardışık taramalar (400ms sonrası) kabul edilir.
 */
export function isDuplicateScanTrigger(
  incomingBarcode: string,
  lastBarcode: string,
  lastScanTimeMs: number,
  debounceWindowMs: number = 400
): boolean {
  if (!incomingBarcode) return false;
  const now = Date.now();
  const timeDiff = now - lastScanTimeMs;
  return incomingBarcode === lastBarcode && timeDiff < debounceWindowMs;
}
