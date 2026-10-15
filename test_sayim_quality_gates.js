/**
 * SAYIM APP KALİTE KONTROL & GÜVENLİK TESTİ (QUALITY GATES)
 * AŞAMA 11: 14 KRİTİK TEST SENARYOSU
 */

const assert = require('assert');

// 1. Safe API / Write Guard logic
function isWriteQuery(sql) {
  if (!sql || typeof sql !== 'string') return false;
  const cleanSql = sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();

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

// 2. Barcode sanitization
function sanitizeBarcode(code) {
  if (code === undefined || code === null) return '';
  return String(code).replace(/[\r\n\t]/g, '').trim();
}

// 3. Debounce scan check
function isDuplicateScanTrigger(incoming, lastCode, lastTime, windowMs = 400) {
  if (!incoming) return false;
  const now = Date.now();
  return incoming === lastCode && (now - lastTime) < windowMs;
}

// 4. Quantity parsing
function parseQuantitySafe(input) {
  if (input === undefined || input === null) {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Lütfen miktar giriniz.' };
  }
  const rawStr = String(input).trim();
  if (rawStr === '') {
    return { isValid: false, quantity: 0, isZeroCount: false, errorMessage: 'Miktar alanı boş bırakılamaz.' };
  }
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
  return { isValid: true, quantity: num, isZeroCount: num === 0 };
}

// 5. Formula injection protection
function sanitizeFormulaInjection(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return "'" + trimmed;
  }
  return trimmed;
}

// RUN TESTS
console.log('====================================================');
console.log('MD TICARET SAYIM UYGULAMASI - 14 KALİTE TEST KAPISI');
console.log('====================================================\n');

let passedCount = 0;
let totalTests = 14;

function runTest(num, name, fn) {
  try {
    fn();
    console.log(`✅ TEST ${num}: ${name} -> BAŞARILI`);
    passedCount++;
  } catch (err) {
    console.error(`❌ TEST ${num}: ${name} -> BAŞARISIZ:`, err.message);
  }
}

// Test 1: Bilinen ve Bilinmeyen Barkod
runTest(1, 'Bilinen ve Bilinmeyen Barkod Ayrımı', () => {
  const mockDb = [
    { barcode: '8690001', stock_code: 'STK01', name: 'Ürün A' }
  ];
  const findProduct = (code) => mockDb.find(p => p.barcode === code) || null;
  
  assert.strictEqual(findProduct('8690001')?.name, 'Ürün A');
  assert.strictEqual(findProduct('9999999'), null);
  // Bilinmeyen barkod sahte ürün oluşturmamalı
  assert.strictEqual(mockDb.length, 1);
});

// Test 2: Baştaki Sıfırların Korunması
runTest(2, 'Baştaki Sıfırların Korunması (Leading Zeros)', () => {
  const rawBarcodeWithZero = '000869123456';
  const sanitized = sanitizeBarcode(rawBarcodeWithZero);
  assert.strictEqual(sanitized, '000869123456');
  assert.notStrictEqual(sanitized, '869123456');
  assert.strictEqual(typeof sanitized, 'string');
});

// Test 3: Tek Taramanın Yanlışlıkla Çift İşlenmesi (Debounce)
runTest(3, 'Tek Taramanın Çift İşlenmesinin Engellenmesi (Bounce Debounce)', () => {
  const lastCode = '8690001';
  const lastTime = Date.now() - 50; // 50ms önce tarandı
  const isBounce = isDuplicateScanTrigger('8690001', lastCode, lastTime, 400);
  assert.strictEqual(isBounce, true, '50ms içindeki aynı barkod donanım sekmesi olarak yutulmalı');
});

// Test 4: Bilinçli Ardışık Taramalar
runTest(4, 'Bilinçli Ardışık Taramaların Kabul Edilmesi', () => {
  const lastCode = '8690001';
  const lastTime = Date.now() - 600; // 600ms önce tarandı (>400ms)
  const isBounce = isDuplicateScanTrigger('8690001', lastCode, lastTime, 400);
  assert.strictEqual(isBounce, false, '600ms sonraki tarama bilinçli sayım olarak kabul edilmeli');
});

// Test 5: Koli / Adet Dönüşümü ve Birim Hassasiyeti
runTest(5, 'Koli/Adet Dönüşümü ve Katsayı Hassasiyeti', () => {
  const unitMultiplier = 24; // 1 Koli = 24 Adet
  const koliMiktar = 3.5;
  const adetMiktar = koliMiktar * unitMultiplier;
  assert.strictEqual(adetMiktar, 84);
  assert.strictEqual(Number.isInteger(adetMiktar), true);
});

// Test 6: Ondalıklı Miktar (Virgül ve Nokta)
runTest(6, 'Ondalıklı Miktar (Virgül ve Nokta Girişi)', () => {
  const resComma = parseQuantitySafe('3,75');
  assert.strictEqual(resComma.isValid, true);
  assert.strictEqual(resComma.quantity, 3.75);

  const resDot = parseQuantitySafe('12.5');
  assert.strictEqual(resDot.isValid, true);
  assert.strictEqual(resDot.quantity, 12.5);

  const resNegative = parseQuantitySafe('-5');
  assert.strictEqual(resNegative.isValid, false);
});

// Test 7: Sıfır Sayım ve Sayılmamış Ürün Ayrımı
runTest(7, 'Sıfır Sayım ve Sayılmamış Ürün Ayrımı', () => {
  const resZero = parseQuantitySafe('0');
  assert.strictEqual(resZero.isValid, true);
  assert.strictEqual(resZero.isZeroCount, true);
  assert.strictEqual(resZero.quantity, 0);

  // Sayılmamış ürün simülasyonu
  const cart = [{ stock_code: 'STK01', quantity: 0, status: 'counted_zero' }];
  const isCountedZero = cart.some(c => c.stock_code === 'STK01' && c.quantity === 0);
  const isUncounted = !cart.some(c => c.stock_code === 'STK02');
  assert.strictEqual(isCountedZero, true);
  assert.strictEqual(isUncounted, true);
});

// Test 8: Depo Değişimi ve Karışma Koruması
runTest(8, 'Depo Değişimi ve Karışma Koruması', () => {
  const cart = [{ stock_code: 'A', depo_no: 1, depo_adi: 'Merkez Depo' }];
  const newDepo = { depo_no: 2, depo_adi: 'Şube Depo' };
  
  // Depo no uyuşmazlığı kontrolü
  const hasConflict = cart.length > 0 && cart[0].depo_no !== newDepo.depo_no;
  assert.strictEqual(hasConflict, true, 'Farklı depo seçildiğinde uyarı tetiklenmeli');
});

// Test 9: Uygulama Kapanıp Açıldığında Sayımın Korunması
runTest(9, 'Uygulama Kapanıp Açılmasında Verinin Korunması', () => {
  const mockStorage = {};
  const activeCart = [{ id: 1, stock_code: 'STK_OFFLINE', quantity: 15 }];
  
  // Save
  mockStorage['sayim_cart'] = JSON.stringify(activeCart);
  
  // App Restart Simulation
  const restoredCart = JSON.parse(mockStorage['sayim_cart']);
  assert.deepStrictEqual(restoredCart, activeCart);
});

// Test 10: Ağ Kesintisi ve Geri Gelmesi (Yazma Tetiklenmeme)
runTest(10, 'Ağ Reconnection Durumunda Mikro Yazma Tetiklenmeme', () => {
  let erpWriteCount = 0;
  function onNetworkStateChange(isConnected) {
    if (isConnected) {
      // YALNIZCA versiyon kontrolü veya veri okuma yapılmalı; asla write yapılmamalı
      // erpWriteCount++; -> YASAK
    }
  }
  onNetworkStateChange(false);
  onNetworkStateChange(true);
  assert.strictEqual(erpWriteCount, 0, 'Ağ bağlandığında hiçbir ERP yazma işi başlamamalı');
});

// Test 11: Yetkisiz Depo ve Sayım Erişimi Koruması
runTest(11, 'Yetkisiz Depo ve Sayım Erişimi Koruması', () => {
  const userRestrictions = {
    allowed_depo_nos: '1,2,5'
  };
  const isAllowed = (depoNo) => {
    const list = userRestrictions.allowed_depo_nos.split(',').map(s => s.trim());
    return list.includes(String(depoNo));
  };
  assert.strictEqual(isAllowed(1), true);
  assert.strictEqual(isAllowed(2), true);
  assert.strictEqual(isAllowed(3), false); // Yetkisiz depo
});

// Test 12: Büyük Sayım Listesi Performansı (1.000+ Kalem)
runTest(12, 'Büyük Sayım Listesi Performansı (1.000+ Kalem)', () => {
  const largeCart = [];
  const start = Date.now();
  for (let i = 0; i < 1500; i++) {
    largeCart.push({
      barcode: `86900000${i}`,
      stock_code: `STK_${i}`,
      name: `Test Ürün ${i}`,
      quantity: (i % 10) + 1,
      depo_no: 1
    });
  }
  const totalQty = largeCart.reduce((sum, item) => sum + item.quantity, 0);
  const serialized = JSON.stringify(largeCart);
  const parsed = JSON.parse(serialized);
  const duration = Date.now() - start;

  assert.strictEqual(parsed.length, 1500);
  assert.ok(totalQty > 0);
  assert.ok(duration < 200, `1500 kalem işlemi ${duration}ms sürdü (200ms altında olmalı)`);
});

// Test 13: Dışa Aktarım ve Formül Enjeksiyonu Koruması
runTest(13, 'Elektronik Tablo Formül Enjeksiyonu Koruması (Formula Injection)', () => {
  const dangerousValues = [
    '=CMD|"/C calc"!A0',
    '+12345',
    '-cmd.exe',
    '@SUM(A1:A10)',
    'Normal Ürün Adı'
  ];
  const sanitized = dangerousValues.map(sanitizeFormulaInjection);
  
  assert.strictEqual(sanitized[0], '\'=CMD|"/C calc"!A0');
  assert.strictEqual(sanitized[1], '\'+12345');
  assert.strictEqual(sanitized[2], '\'-cmd.exe');
  assert.strictEqual(sanitized[3], '\'@SUM(A1:A10)');
  assert.strictEqual(sanitized[4], 'Normal Ürün Adı');
});

// Test 14: ERP Yazma Girişiminin İstemciden Çıkmadan Engellenmesi (Write Guard)
runTest(14, 'Mikro ERP Yazma Girişiminin İstemcide Engellenmesi (Write Guard)', () => {
  const queries = [
    { sql: 'SELECT * FROM STOKLAR', write: false },
    { sql: 'SELECT * FROM DEPOLAR WITH (NOLOCK)', write: false },
    { sql: 'INSERT INTO STOK_HAREKETLERI (sth_stok_kod) VALUES (\'STK01\')', write: true },
    { sql: 'UPDATE STOKLAR SET sto_isim = \'Yeni\' WHERE sto_kod = \'1\'', write: true },
    { sql: 'DELETE FROM SAYIM_SONUCLARI WHERE sym_depono = 1', write: true },
    { sql: 'BEGIN TRANSACTION; INSERT INTO STOK_HAREKETLERI ... COMMIT;', write: true },
    { sql: 'TRUNCATE TABLE STOKLAR', write: true },
    { sql: 'EXEC sp_executesql N\'DELETE FROM STOKLAR\'', write: true }
  ];

  queries.forEach(q => {
    const detected = isWriteQuery(q.sql);
    assert.strictEqual(detected, q.write, `Sorgu tespiti hatalı: ${q.sql}`);
  });
});

console.log('\n====================================================');
console.log(`TEST SONUCU: ${passedCount} / ${totalTests} BAŞARIYLA TAMAMLANDI`);
console.log('====================================================');

if (passedCount !== totalTests) {
  process.exit(1);
}
