# Akademik değerlendirme — özet

Bu klasördeki sonuçlar `backend/scripts/eval/` altındaki betiklerle üretilir; her biri
tekrar çalıştırılabilir ve kişisel veri kullanmaz (soru bankası, kurgusal CV'ler ve
sentetik mülakat dökümleri). Ayrıntılı tablolar ilgili `.md`, ham veriler `.json`
dosyalarındadır. Ölçüm tarihi: 2026-10-11.

| Ölçüm | Betik | Sonuç dosyası |
|---|---|---|
| Embedding modeli karşılaştırması | `eval_embeddings.py` | [embeddings.md](embeddings.md) |
| LLM değerlendiricinin tutarlılığı ve geçerliliği | `eval_llm_consistency.py` | [llm_consistency.md](llm_consistency.md) |
| ATS skorunun duyarlılığı ve dayanıklılığı | `eval_ats_robustness.py` | [ats_robustness.md](ats_robustness.md) |
| Pilot çalışma (önce/sonra, SUS) | uygulama içi: `/pilot/report` | pilot sonunda CSV |

Çalıştırma (`backend/` dizininden, sanal ortam açıkken):

```bash
python -m scripts.eval.eval_embeddings
python -m scripts.eval.eval_llm_consistency --repeats 3
python -m scripts.eval.eval_ats_robustness   # EasyOCR modeli gerekir (EASYOCR_MODEL_DIR)
```

## 1. Embedding modeli: API (nemotron-3-embed-1b) ve yerel (multilingual-e5-base)

27 soruluk banka, 4 konu × 5 sorgu biçimi (20 sorgu), ilgililik = aynı konu.

| Model | Top-1 | P@5 | MRR | nDCG@10 | Medyan süre |
|---|---|---|---|---|---|
| API | 1,00 | 0,77 | 1,00 | 0,91 | 0,156 sn |
| Yerel e5 | 1,00 | 0,70 | 1,00 | 0,88 | 0,045 sn |

- İki model de her sorguda ilk sıraya doğru konudan bir soru getiriyor (Top-1 = MRR = 1).
- Fark derin sıralamada ve özellikle **CV beceri ipucu içeren sorgularda** (P@5 0,75 ve 0,50).
  CV'ye özel mülakat tam bu sorgu biçimini kullandığından yerel model, API kesintisinde
  kabul edilebilir ama CV kişiselleştirmesi için zayıf bir yedektir.
- Yerel model yaklaşık 3,5 kat hızlıdır ve kota/ağ bağımlılığı yoktur.

## 2. LLM değerlendirici: tutarlılık ve geçerlilik

Kalitesi bilinen 6 sentetik döküm (Python ve React; iyi/orta/zayıf), her biri 3 kez bağımsız puanlandı.

| Metrik | ICC(2,1) | Döküm içi SS | ±10 içinde | Spearman (kalite ~ puan) |
|---|---|---|---|---|
| Teknik | 0,966 | 3,96 | %94 | 0,956 |
| Özgüven | 0,941 | 5,57 | %94 | 0,849 |
| İletişim | 0,961 | 3,23 | %89 | 0,956 |
| Genel | 0,968 | 3,72 | %94 | 0,956 |

- Test-tekrar güvenilirliği "mükemmel" aralıkta (ICC > 0,90; Koo & Li, 2016).
- Puanlar amaçlanan kaliteyi sıralıyor: Python 18,9 → 52,5 → 90,3; React 36,1 → 67,1 → 90,0.
- En az kararlı metrik özgüven; yazılı metinden özgüven çıkarımı doğası gereği belirsizdir.
  Bu yüzden platform, video analizi varsa objektif özgüven ölçümünü tercih eder.
- Sınırlılık: kalite düzeyleri çok ayrık olduğundan hedefler arası varyans yüksektir ve
  bu ICC'yi yükseltir; gerçek aday cevapları daha yakın kalitelerde daha düşük ICC verebilir.

## 3. ATS skoru: duyarlılık, dayanıklılık, determinizm

Kurgusal 2 profilden üretilen CV'ler; her varyant tek bir özelliği değiştirir.

- **Duyarlılık:** standart dışı başlıklar yalnızca "bölüm başlıkları" kontrolünü (−13),
  sayısal başarı ve tarihlerin çıkarılması yalnızca ilgili iki kontrolü (−15) düşürdü.
- **Determinizm:** aynı dosya iki kez puanlandığında sonuç birebir aynı.
- **Dayanıklılık (OCR) ve ölçümün bulduğu hata:** ilk ölçümde taranmış CV'ler tasarım
  gereği olan "metin katmanı" cezasının (−14) üstüne **haksız yere** 10–15 puan daha kaybediyordu:

  | | Taranmış CV skoru | İçerik kontrolleri korunan |
  |---|---|---|
  | Düzeltme öncesi | 56 ve 61 | %71 ve %86 |
  | Düzeltme sonrası | 71 ve 71 | %100 ve %100 |

  Neden: OCR yıllar arasındaki tireyi düşürüyordu ("2021 – 2023" → "2021 2023") ve
  e-postadaki noktaların çevresine boşluk ekliyordu ("ad .soyad@ornek. com"). İkinci
  durumda e-posta, CV metni LLM'e gönderilmeden önce **maskelenemiyordu** (veri
  minimizasyonu açığı). Kurallar OCR çıktısına dayanıklı hale getirildi ve regresyon
  testleri eklendi (`backend/tests/test_ats_ocr.py`).

## Genel sınırlılıklar

- Derlemler küçüktür (27 soru, 6 döküm, 2 CV profili); sonuçlar yön göstericidir.
- ATS skoru gerçek bir şirketin ATS'i değildir; açıklanabilir bir uyumluluk tahminidir.
- Pilot çalışma tek gruplu önce/sonra tasarımıdır; kontrol grubu olmadan gelişimin tamamı
  platforma atfedilemez (bkz. pilot raporundaki not).
