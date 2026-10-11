# Mimari

DeepInsight üç istemci-sunucu bileşeninden oluşan bir monorepodur. Tüm iş mantığı ve
yetki kontrolü backend'dedir; istemciler veritabanına doğrudan erişmez.

```mermaid
flowchart LR
    subgraph İstemciler
        W[Dashboard<br/>Next.js 16 · React]
        M[Mobil<br/>Expo · React Native]
    end
    subgraph Backend[Backend · FastAPI]
        R[Route katmanı<br/>kimlik + rol + sahiplik]
        S[Servisler<br/>mülakat · CV · ilan · gelişim · kurum · pilot · KVKK]
        A[Analiz hattı<br/>Whisper · DeepFace · MediaPipe · librosa]
        E[Yerel modeller<br/>e5 embedding · EasyOCR]
    end
    subgraph Supabase
        AU[Auth]
        DB[(Postgres + pgvector<br/>RLS açık, politika yok)]
        ST[(Storage<br/>özel cvs bucket)]
    end
    L[LLM sağlayıcısı<br/>OpenAI-uyumlu API]

    W -- HTTPS + Bearer JWT --> R
    M -- HTTPS + Bearer JWT --> R
    R --> S
    S --> A
    S --> E
    R -- token doğrulama --> AU
    S -- service_role --> DB
    S -- service_role --> ST
    S -- soru üretimi · değerlendirme · embedding --> L
```

## Bileşenler

| Bileşen | Teknoloji | Sorumluluk |
|---|---|---|
| `backend/` | FastAPI, Pydantic, supabase-py | API, yetki, iş kuralları, LLM ve analiz hattı |
| `dashboard/` | Next.js (App Router), Tailwind, Recharts, Zustand | Aday, eğitmen ve kurum yöneticisi web arayüzü |
| `mobile/` | Expo, React Native, Zustand | Aday mobil uygulaması (kamera/ses ile mülakat) |
| Supabase | Postgres + pgvector, Auth, Storage | Kalıcı veri, kimlik, CV dosyaları |

## Modüller (fazlar)

| Faz | Modül | Ana servis(ler) | Arayüz |
|---|---|---|---|
| Çekirdek | Yazılı/sesli/görüntülü mülakat, RAG soru bankası | `interview_service`, `question_bank_service`, `llm_service`, `analytics` | `/chat/text`, `/chat`, `/interviews` |
| 0 | Çok kiracılı yapı (kurum, üyelik, denetim kaydı, kota) | `organization_service` | `/organizations` |
| 1 | CV yükleme, OCR, ATS uyumluluk skoru, CV'ye özel mülakat | `cv_text_service`, `ats_service`, `cv_analysis_service` | `/cv` |
| 2 | İlan gereksinim çıkarımı, uyum skoru, yol haritası | `job_service`, `skill_matching` | `/jobs` |
| 3 | Gelişim analizi, öneriler, PDF rapor | `progress_service`, `progress_report` | `/progress` |
| 4A | Kurum paneli, rızaya bağlı öğrenci görünümü | `org_insights_service` | `/organizations/[id]` |
| 4B | Ödev atama | `assignment_service` | kurum paneli, `/assignments` |
| 4C | Gruplar, toplu davet, rubrik, CSV dışa aktarma | `org_group_service`, `org_export_service` | kurum paneli |
| 5 | Pilot çalışma, KVKK veri hakları, akademik ölçümler | `pilot_service`, `account_service`, `scripts/eval/` | `/pilot`, `/pilot/report`, Profil |

## Veri modeli (özet)

```mermaid
erDiagram
    organizations ||--o{ memberships : "üyeler"
    organizations ||--o{ org_groups : "gruplar"
    organizations ||--o{ org_invites : "bekleyen davetler"
    organizations ||--o{ assignments : "ödevler"
    organizations ||--o{ question_bank : "kurum soruları (org_id null = global)"
    org_groups ||--o{ memberships : "group_id"
    org_groups ||--o{ assignments : "hedef grup"
    interviews ||--o{ interview_messages : "döküm"
    interviews ||--o| interview_analytics : "video/ses analizi"
    interviews ||--o{ survey_responses : "mülakat anketi"
    cvs ||--o{ cv_analyses : "profil + ATS"
    cvs ||--o{ job_matches : ""
    job_postings ||--o{ job_matches : ""
    interviews }o--o| cvs : "cv_id"
    interviews }o--o| job_postings : "job_id"
    interviews }o--o| assignments : "assignment_id"
    interviews }o--o| organizations : "org_id (kurum bağlamı)"
```

Kullanıcıya ait tablolar (`interviews`, `cvs`, `job_postings`, `user_consents`,
`survey_responses`, `memberships`) `user_id` ile Supabase Auth kullanıcısına bağlanır.
Şema `backend/sql/001…015` migration'larıyla kurulur (Supabase SQL Editor ya da MCP
`apply_migration`); her dosyanın başında amacı ve çalıştırma notu vardır.

## Temel akışlar

### Mülakat başlatma (RAG + kişiselleştirme)

```mermaid
sequenceDiagram
    participant C as İstemci
    participant R as /interview/start
    participant Q as question_bank_service
    participant L as LLM
    participant D as Postgres
    C->>R: rol, konu, zorluk (+cv_id, job_id, org_id, assignment_id)
    R->>D: ödev / kurum üyeliği / kota / CV ve ilan sahipliği
    R->>Q: sorgu metni (+ CV/ilan becerileri)
    Q->>L: sorgu embedding'i (hata olursa yerel e5)
    Q->>D: match_questions RPC (pgvector, kurum + global)
    Q-->>R: soru havuzu (maruz kalma cezası + aile zinciri)
    R->>D: interviews kaydı (question_pool)
    R->>L: ilk soru (bankadan teslim ya da üretim)
    R-->>C: interview_id + ilk mesaj
```

Mülakat sonu sunucu tarafındaki soru sayacıyla belirlenir (LLM'in "bitirdim" demesine
güvenilmez); nihai değerlendirme atomik "claim" ile tek kez yapılır.

### CV analizi

PDF/DOCX/görsel → metin katmanı (PyMuPDF) ya da OCR (EasyOCR) → kural tabanlı ATS skoru
(8 kontrol, 100 puan, açıklamalı) → iletişim bilgisi maskelenip LLM ile yapılandırılmış profil
→ deterministik kıdem tahmini. CV metni LLM'e "talimat değil veri" olarak, açı parantezleri
temizlenmiş biçimde verilir.

### Kurum görünürlüğü

Eğitmen yalnızca kurum bağlamında yapılmış mülakatları görür. Öğrenci bazında skor için
öğrencinin `share_progress` rızası gerekir; rıza yokken bile toplu istatistik ancak en az
3 farklı öğrenci katkı verdiyse (`MIN_COHORT`) gösterilir. Grup görünümünde aynı kural
daraltılmış veriye ayrıca uygulanır.

## Tasarım kararları

- **Deterministik ve açıklanabilir skorlar:** ATS, ilan uyumu, gelişim önerileri ve rubrik
  hesapları kurallarla yapılır; LLM yalnızca metin üretimi (soru, özet, yol haritası) ve
  mülakat değerlendirmesi için kullanılır ve LLM çökerse koddan bir yedek üretilir.
- **Yetki backend'de:** veritabanı erişimi service_role ile yapılır (RLS açık, politika yok =
  istemciler doğrudan erişemez). Her route kimlik, kurum rolü (`require_org_role`) ve kaynak
  sahipliğini doğrular. Bkz. [SECURITY_AND_KVKK.md](SECURITY_AND_KVKK.md).
- **Supabase istemcisi iş parçacığından çağrılmaz:** paylaşılan HTTP/2 istemcisi eşzamanlı
  iş parçacıklarında bağlantıyı koparıyor; yalnızca CPU işleri (PDF, OCR, yerel embedding)
  `asyncio.to_thread` ile çalışır. Kimlik doğrulama dependency'si de bu yüzden `async`.
- **Kota:** kurum bağlamındaki mülakatlar aylık kotaya tabidir (LLM maliyet kontrolü).

## Test ve ölçüm

- `backend/tests/`: 306 birim/entegrasyon testi (Supabase ve LLM mock'lu), sahiplik ve
  tenant izolasyonu regresyon testleri dahil. `pytest tests -q`
- `dashboard`: `npx tsc --noEmit`, `npx eslint src`
- `backend/scripts/eval/`: akademik ölçümler, bkz. [evaluation/README.md](evaluation/README.md)
