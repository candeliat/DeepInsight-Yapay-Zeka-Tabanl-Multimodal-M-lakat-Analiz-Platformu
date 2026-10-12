# Uçtan uca testler (Playwright)

Web paneli (Next.js, :3002) ve mobil uygulamanın web sürümü (Expo, :8081, telefon görünümü)
için kullanıcı akışı testleri.

**Backend taklit edilir** (`fixtures/api.ts`): testler gerçek hesap, şifre, LLM ya da
veritabanı kullanmaz; her çalıştırmada aynı sonucu verir ve hiçbir veri oluşturmaz.
Yalnızca ön yüz sunucuları gerekir. Açık değillerse Playwright kendisi başlatır.

```bash
cd e2e
npm install          # tarayıcı indirmez; kurulu Chrome kullanılır
npm test             # hepsi
npm run test:web     # yalnızca web
npm run test:mobile  # yalnızca mobil
npm run test:headed  # tarayıcıyı görerek
npm run report       # son HTML raporu
```

CI: `.github/workflows/e2e.yml` her PR'da ve `main`'e her gönderimde tür denetimi + bu testleri çalıştırır; hata olursa rapor artefakt olarak eklenir.

Çıktılar (`.out/`), geçici dosyalar (`.tmp/`) ve npm önbelleği (`D:/npm-cache`) D: diskindedir.

## Kapsam

| Dosya | Akışlar |
|---|---|
| `web/auth.spec.ts` | oturumsuz yönlendirme, giriş, kayıtta aydınlatma onayı, şifremi unuttum, gizlilik |
| `web/dashboard.spec.ts` | devam bandı, mülakat listesinde yüzdesiz skor ve 60/80 bantları |
| `web/profile.spec.ts` | profil kaydı, şifre doğrulamaları ve sunucu mesajı, onam geri çekme (onay + hata) |
| `web/interview.spec.ts` | gönderim hatasında cevabın korunması, bitirme onayı, görüntülü mülakatta onam → kamera izni → başlatma sırası, izin reddi |
| `web/cv.spec.ts` | CV rızası, yükleme + otomatik analiz (skor, kontroller, profil), tür/boyut doğrulaması, sınır mesajı, silme ve rızayı geri çekme |
| `web/jobs.spec.ts` | ilan ekleme doğrulaması, CV ile eşleştirme (skor, beceri durumları, yol haritası), kayıtlı eşleştirme, hata, silme |
| `web/organizations.spec.ts` | davet kabul/ret, davet koduyla katılma, paylaşım izni, Ödevlerim, ödevden mülakat, kurum paneli (≥3 öğrenci kuralı, kod yenileme, ödev atama, toplu davet), yetkisiz erişim |
| `mobile/account.spec.ts` | giriş + şifremi unuttum, şifre mesajları, onam geri çekme onayı, çıkış onayı |
| `mobile/career.spec.ts` | CV yükleme (dosya seçici) ve analiz, CV silme/rıza, ilan ekleme, eşleştirme ve yol haritası, kurum daveti/kodu/paylaşım, ödevler |
| `mobile/interview.spec.ts` | hazırlan (hedef rol, onam uyarısı, yazılı başlatma), devam et → mülakat odası, gönderim hatası, "şimdilik çık", silme |

## Yeni test yazarken

- Bir uç noktayı test içinde değiştirmek: `api.on('POST', '/api/v1/...', { status: 400, json: { detail: '...' } })`;
  ağ hatası için `'abort'`. Giden istekler `api.callsTo(method, path)` ile denetlenir.
- Taklit edilmeyen bir istek 404 alır ve test sonunda `[e2e] taklit edilmeyen istekler` uyarısı basılır.
- Oturum açık sayfa için `authedPage` fixture'ını kullanın.
- CV/ilan/kurum/ödev örnek verisi için `api.seedCareer()`; durum `api.career` üzerinden değiştirilebilir (varsayılan: boş, CV rızası yok).
- Mobilde Expo yığını önceki ekranları DOM'da tutar: `getByText(...).filter({ visible: true })`.
