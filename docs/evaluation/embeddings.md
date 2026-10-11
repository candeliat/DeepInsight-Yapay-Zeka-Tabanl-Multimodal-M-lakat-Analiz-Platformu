# Embedding modeli karşılaştırması (soru bankası retrieval'i)

Derlem: 27 soru · Sorgu: 20 (4 konu × 5 sorgu biçimi) · İlgililik: aynı konu.

| Model | Top-1 | P@5 | MRR | nDCG@10 | Medyan süre (sn) | Hata |
|---|---|---|---|---|---|---|
| nvidia/nemotron-3-embed-1b (API) | 1.00 | 0.77 | 1.00 | 0.91 | 0.156 | 0/20 |
| intfloat/multilingual-e5-base (yerel) | 1.00 | 0.70 | 1.00 | 0.88 | 0.045 | 0/20 |

## Sorgu biçimine göre P@5

| Sorgu biçimi | nvidia/nemotron-3-embed-1b (API) | intfloat/multilingual-e5-base (yerel) |
|---|---|---|
| beceri | 0.75 | 0.50 |
| ingilizce | 0.80 | 0.65 |
| kisa | 0.75 | 0.80 |
| uretim_sablonu | 0.80 | 0.75 |
| yeniden_ifade | 0.75 | 0.80 |

Notlar: P@5'in üst sınırı konudaki soru sayısına bağlıdır (Makine Öğrenmesi'nde 3 soru → en fazla 0,60); bu yüzden nDCG@10 birincil metrik olarak okunmalıdır. Derlem küçüktür (konu başına 3-11 soru); sonuçlar yön göstericidir, genellenebilir değildir.
