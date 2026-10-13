# ATS skorunun duyarlılığı ve dayanıklılığı

Kurgusal profillerden üretilen CV'ler; her varyant yalnızca bir özelliği değiştirir.

| CV | Varyant | Skor | Fark | Değişen kontroller | OCR metin benzerliği | İçerik kontrolleri korunan |
|---|---|---|---|---|---|---|
| CV1 | Özgün (metin PDF) | 92 | — | — | — | — |
| CV1 | Taranmış (OCR) | 77 | -15 | text_layer -10, file_size -5 | 0.872 | 100% |
| CV1 | Standart dışı başlıklar | 75 | -17 | sections -17 | — | — |
| CV1 | Sayısız ve tarihsiz | 85 | -7 | dates -5, quantified -2 | — | — |
| CV1 | Fotoğraflı | 89 | -3 | formatting -3 | — | — |
| CV1 | Beyaz yazıyla gizli anahtar kelime | 87 | -5 | hidden_text -5 | — | — |
| CV2 | Özgün (metin PDF) | 92 | — | — | — | — |
| CV2 | Taranmış (OCR) | 77 | -15 | text_layer -10, file_size -5 | 0.636 | 100% |
| CV2 | Standart dışı başlıklar | 75 | -17 | sections -17 | — | — |
| CV2 | Sayısız ve tarihsiz | 85 | -7 | dates -5, quantified -2 | — | — |
| CV2 | Fotoğraflı | 89 | -3 | formatting -3 | — | — |
| CV2 | Beyaz yazıyla gizli anahtar kelime | 87 | -5 | hidden_text -5 | — | — |

Determinizm: aynı dosya iki kez puanlandı — tüm CV’lerde birebir aynı sonuç.

Not: Taranmış varyantta 'text_layer' kontrolünün düşmesi tasarım gereğidir (birçok ATS görüntü CV'yi okuyamaz); taranmış PDF 2,5 MB'ı aştığında 'file_size' da düşer (Greenhouse bu boyutu ayrıştırmaz). 'İçerik kontrolleri korunan' yalnızca içeriğe bağlı kontrolleri sayar: contact, sections, length, dates, quantified, acronyms.
