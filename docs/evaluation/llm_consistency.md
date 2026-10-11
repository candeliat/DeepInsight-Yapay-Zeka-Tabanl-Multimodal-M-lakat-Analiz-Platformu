# LLM değerlendiricinin tutarlılığı ve geçerliliği

6 sentetik döküm (2 konu × iyi/orta/zayıf) × 3 bağımsız puanlama · başarısız çağrı: 0

| Metrik | ICC(2,1) | Döküm içi ort. SS | ±5 içinde | ±10 içinde | Spearman (kalite ~ puan) |
|---|---|---|---|---|---|
| Teknik | 0.966 | 3.96 | 0.83 | 0.94 | 0.956 |
| Özgüven | 0.941 | 5.57 | 0.61 | 0.94 | 0.849 |
| İletişim | 0.961 | 3.23 | 0.83 | 0.89 | 0.956 |
| Genel ort. | 0.968 | 3.72 | 0.78 | 0.94 | 0.956 |

## Kalite sıralaması (zayıf → orta → iyi, genel ortalama)

- Python: 18.9 → 52.5 → 90.3 — sıralama korunuyor
- React: 36.1 → 67.1 → 90.0 — sıralama korunuyor

Yorum: ICC > 0,75 iyi, > 0,90 mükemmel güvenilirlik kabul edilir (Koo & Li, 2016). Dökümler sentetiktir; gerçek aday cevaplarındaki belirsizlik daha yüksek varyans üretebilir.
