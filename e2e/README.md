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

Çıktılar (`.out/`), geçici dosyalar (`.tmp/`) ve npm önbelleği (`D:/npm-cache`) D: diskindedir.

## Kapsam

| Dosya | Akışlar |
|---|---|
| `web/auth.spec.ts` | oturumsuz yönlendirme, giriş, kayıtta aydınlatma onayı, şifremi unuttum, gizlilik |
| `web/dashboard.spec.ts` | devam bandı, mülakat listesinde yüzdesiz skor ve 60/80 bantları |
| `web/profile.spec.ts` | profil kaydı, şifre doğrulamaları ve sunucu mesajı, onam geri çekme (onay + hata) |
| `web/interview.spec.ts` | gönderim hatasında cevabın korunması, bitirme onayı, görüntülü mülakatta onam → kamera izni → başlatma sırası, izin reddi |
| `mobile/account.spec.ts` | giriş + şifremi unuttum, şifre mesajları, onam geri çekme onayı, çıkış onayı |
| `mobile/interview.spec.ts` | hazırlan (hedef rol, onam uyarısı, yazılı başlatma), devam et → mülakat odası, gönderim hatası, "şimdilik çık", silme |

## Yeni test yazarken

- Bir uç noktayı test içinde değiştirmek: `api.on('POST', '/api/v1/...', { status: 400, json: { detail: '...' } })`;
  ağ hatası için `'abort'`. Giden istekler `api.callsTo(method, path)` ile denetlenir.
- Taklit edilmeyen bir istek 404 alır ve test sonunda `[e2e] taklit edilmeyen istekler` uyarısı basılır.
- Oturum açık sayfa için `authedPage` fixture'ını kullanın.
- Mobilde Expo yığını önceki ekranları DOM'da tutar: `getByText(...).filter({ visible: true })`.
