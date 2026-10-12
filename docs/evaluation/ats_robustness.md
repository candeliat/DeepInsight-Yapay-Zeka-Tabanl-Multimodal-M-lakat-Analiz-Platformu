# ATS skorunun duyarlılığı ve dayanıklılığı

Kurgusal profillerden üretilen CV'ler; her varyant yalnızca bir özelliği değiştirir.

| CV | Varyant | Skor | Fark | Değişen kontroller | OCR metin benzerliği | İçerik kontrolleri korunan |
|---|---|---|---|---|---|---|
| CV1 | Özgün (metin PDF) | 85 | — | — | — | — |
| CV1 | Taranmış (OCR) | 71 | -14 | text_layer -14 | 0.872 | 100% |
| CV1 | Standart dışı başlıklar | 72 | -13 | sections -13 | — | — |
| CV1 | Sayısız ve tarihsiz | 70 | -15 | dates -10, quantified -5 | — | — |
| CV2 | Özgün (metin PDF) | 85 | — | — | — | — |
| CV2 | Taranmış (OCR) | 71 | -14 | text_layer -14 | 0.636 | 100% |
| CV2 | Standart dışı başlıklar | 72 | -13 | sections -13 | — | — |
| CV2 | Sayısız ve tarihsiz | 70 | -15 | dates -10, quantified -5 | — | — |

Determinizm: aynı dosya iki kez puanlandı — tüm CV’lerde birebir aynı sonuç.

Not: Taranmış varyantta 'text_layer' kontrolünün düşmesi tasarım gereğidir (birçok ATS görüntü CV'yi okuyamaz).
