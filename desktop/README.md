# MD Ticaret - Masaüstü Depo, Sevk ve Sayım Sistemi (Windows Desktop)

Bu uygulama, **MD Ticaret Depo & Sayım** sisteminin Windows masaüstü için optimize edilmiş, tam ekran ve geniş ekran (widescreen) ergonomisine sahip, USB barkod okuyucu tabancalarıyla tam uyumlu ve **GitHub üzerinden otomatik güncelleme alan** masaüstü sürümüdür.

---

## 🚀 Özellikler

1. **GitHub Otomatik Güncelleme**:
   - `electron-updater` ve entegre GitHub Releases API (`https://api.github.com/repos/hasankaynak/SayimApp/releases/latest`) üzerinden yeni sürümleri arka planda denetler.
   - Yeni sürüm çıktığında üst barda ve ayarlarda bildirim gösterir, tek tıkla güncelleme indirir ve yeniden başlatır.

2. **USB Barkod Tabancası Uyumluluğu**:
   - Küresel klavye yakalama sistemi sayesinde herhangi bir giriş kutusuna odaklanmadan barkod tabancasıyla okutulan ürünleri anında algılar, sesli onay verir ve ilgili listeye ekler.

3. **Mikro ERP Modül Desteği**:
   - **Depo Sayımı (012800)**: Barkod okutma, mevcut depo stoğu ve sayım farkı hesaplama, Excel aktarımı, Mikro ERP'ye sayımı kesinleştirme.
   - **Depolar Arası Sevk (012500)**: İki depo arası transfer, tek tıkla depo değiştirme (swap), evrak seri/sıra yönetimi, Mikro ERP'ye kayıt.
   - **Depo Fişleri**: Depo Çıkış Fişi (012160), Depo Giriş Fişi (012250) ve Depolar Arası Virman Fişi (012810).
   - **Ürün Alış Faturaları**: Barkod/stok kodu ile anında geçmiş alış faturalarını listeleme, birim fiyat, net tutar, tedarikçi ünvanı ve sağ panelde tüm depoların anlık stok durumları.
   - **Fiyat Gör & Stok Kartı**: Büyük KDV dahil/hariç satış fiyatı, toptan fiyat, depo bazlı stok dağılımı ve son alış faturası fiyatı.
   - **Siparişler & Cari (031110)**: Bekleyen ve tamamlanan müşteri siparişlerini listeleme, filtreleme ve Excel'e aktarma.
   - **Sistem Ayarları**: Mikro ERP SQL Server API endpoint ayarı, güvenli test modu (Safe Mode), ses ayarları.

---

## ⌨️ Kısayol Tuşları

- `Ctrl + 1`: Depo Sayımı
- `Ctrl + 2`: Depolar Arası Sevk
- `Ctrl + 3`: Depo Fişleri
- `Ctrl + 4`: Ürün Alış Faturaları
- `Ctrl + 5`: Fiyat Gör & Stok Kartı
- `Ctrl + 6`: Siparişler & Cari
- `Ctrl + 7`: Sistem Ayarları

---

## 🛠️ Geliştirme ve Çalıştırma

Masaüstü dizinine girin:
```bash
cd desktop
```

Geliştirme modunda başlatma:
```bash
npm run dev
```

Web ve Electron derlemesi:
```bash
npm run build:web
```

Windows Taşınabilir (Portable .exe) derleme:
```bash
npm run dist:portable
```

Windows Kurulum Paketi (Setup .exe + latest.yml) derleme:
```bash
npm run dist
```
Çıktılar `desktop/release/` dizinine kaydedilir.
