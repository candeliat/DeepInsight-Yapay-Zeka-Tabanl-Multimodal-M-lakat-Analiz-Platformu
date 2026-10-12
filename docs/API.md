# API uç noktaları

Bu dosya `python -m scripts.generate_api_doc` ile koddan üretilir; elle düzenlemeyin.
Etkileşimli belge: backend çalışırken `/docs` (Swagger) ve `/redoc`.

Yetki sütunu: *Giriş* = geçerli oturum; *Kurum: …* = o kurumdaki rol (platform admini her kuruma erişir);
kaynak sahipliği (ör. kendi mülakatın, kendi CV'n) ayrıca servis katmanında doğrulanır.

## Account (KVKK)

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| DELETE | `/api/v1/account` | Giriş | Hesabı ve tüm kişisel veriyi kalıcı olarak siler (geri alınamaz). |
| GET | `/api/v1/account/consents/{consent_type}` | Giriş | Onam durumu ve onam metni (ör. video_analysis). |
| PUT | `/api/v1/account/consents/{consent_type}` | Giriş | Onam verir ya da geri çeker. Video onamı geri çekilirse video analizi sonuçları silinir. |
| GET | `/api/v1/account/export` | Giriş | KVKK md. 11: hakkımda işlenen tüm verileri JSON olarak indir. |

## Analytics

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/v1/analytics/analyze/{interview_id}` | Giriş | Video veya ses dosyası yükleyerek AI analiz pipeline'ını arka planda başlatır. |
| GET | `/api/v1/analytics/results/{interview_id}` | Giriş | Tamamlanmış analiz sonuçlarını getirir. |
| GET | `/api/v1/analytics/status/{interview_id}` | Giriş | Belirli bir mülakatın analiz durumunu sorgular. |

## Assignments

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/assignments/me` | Giriş | Öğrencinin öğrenci olduğu tüm kurumlardaki ödevleri, kendi durumu ve skoruyla. |

## Authentication

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/v1/auth/change-password` | Giriş | Oturum açıkken şifre değiştirme; mevcut şifre doğrulanır. |
| POST | `/api/v1/auth/forgot-password` | Herkese açık | Şifre sıfırlama e-postası gönderir. Hesap var olsun olmasın aynı yanıtı döner |
| POST | `/api/v1/auth/login` | Herkese açık | Login endpoint expecting a JSON body (for mobile/web clients). |
| POST | `/api/v1/auth/refresh` | Herkese açık | Supabase refresh token kullanarak yeni bir access token döndürür. |
| POST | `/api/v1/auth/register` | Herkese açık | Register a new user using Supabase Authentication. |
| POST | `/api/v1/auth/reset-password` | Herkese açık | E-postadaki bağlantının verdiği kurtarma token'ıyla yeni şifre belirler. |

## CV

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/cv` | Giriş |  |
| POST | `/api/v1/cv` | Giriş |  |
| DELETE | `/api/v1/cv/consent` | Giriş | Rızayı geri çeker; yüklenmiş tüm CV'ler de silinir. |
| GET | `/api/v1/cv/consent` | Giriş |  |
| POST | `/api/v1/cv/consent` | Giriş |  |
| DELETE | `/api/v1/cv/{cv_id}` | Giriş |  |
| GET | `/api/v1/cv/{cv_id}` | Giriş |  |
| GET | `/api/v1/cv/{cv_id}/analysis` | Giriş |  |
| POST | `/api/v1/cv/{cv_id}/analyze` | Giriş | ATS skoru (her zaman) + LLM profil çıkarma/öneriler (best-effort) üretir. |

## Diğer

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/` | Herkese açık | Health check or root endpoint. |

## Interview

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/v1/interview/chat/stream` | Giriş | Adayın cevabını kaydeder ve sıradaki soruyu (sunucu taraflı soru sayacıyla) |
| GET | `/api/v1/interview/me` | Giriş | Giriş yapmış kullanıcının geçmiş tüm mülakatlarının özetini liste halinde döndür. |
| POST | `/api/v1/interview/start` | Giriş | Kullanıcının belirlediği rol ve konuya göre yeni bir mülakat oturumu başlatır. |
| POST | `/api/v1/interview/transcribe` | Giriş | Kullanıcıdan gelen ses kaydını alır ve LLM servisi üzerinden metne çevirir. |
| DELETE | `/api/v1/interview/{interview_id}` | Giriş | Yarıda kalmış (tamamlanmamış) kendi mülakatını siler. Tamamlanmış mülakatlar |
| GET | `/api/v1/interview/{interview_id}` | Giriş | Belirli bir mülakatın tüm detaylarını döndür. |
| POST | `/api/v1/interview/{interview_id}/finish` | Giriş | Adayın mülakatı MAX_INTERVIEW_QUESTIONS'a ulaşılmadan erken bitirmek |

## Jobs

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/jobs` | Giriş |  |
| POST | `/api/v1/jobs` | Giriş | İlan metnini kaydeder ve gereksinimlerini (beceriler, deneyim) çıkarır. |
| DELETE | `/api/v1/jobs/{job_id}` | Giriş |  |
| GET | `/api/v1/jobs/{job_id}` | Giriş |  |
| GET | `/api/v1/jobs/{job_id}/match` | Giriş |  |
| POST | `/api/v1/jobs/{job_id}/match` | Giriş | İlanı kullanıcının bir CV'siyle eşleştirir: skor, eksik beceriler ve öğrenme yol haritası. |

## Organizations

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/v1/organizations` | Platform admini | Yeni kurum oluşturur (yalnızca platform admini). `admin_email` verilirse |
| GET | `/api/v1/organizations/invites/me` | Giriş |  |
| POST | `/api/v1/organizations/invites/{invite_id}/{decision}` | Giriş | Daveti kabul ya da reddeder. Kuruma üyelik yalnızca kullanıcının kendi kabulüyle olur. |
| POST | `/api/v1/organizations/join` | Giriş |  |
| GET | `/api/v1/organizations/me` | Giriş |  |
| GET | `/api/v1/organizations/{org_id}` | Kurum: org_admin |  |
| PATCH | `/api/v1/organizations/{org_id}` | Kurum: org_admin |  |
| GET | `/api/v1/organizations/{org_id}/assignments` | Kurum: org_admin, instructor |  |
| POST | `/api/v1/organizations/{org_id}/assignments` | Kurum: org_admin, instructor |  |
| DELETE | `/api/v1/organizations/{org_id}/assignments/{assignment_id}` | Kurum: org_admin, instructor |  |
| GET | `/api/v1/organizations/{org_id}/assignments/{assignment_id}/export.csv` | Kurum: org_admin, instructor |  |
| GET | `/api/v1/organizations/{org_id}/assignments/{assignment_id}/students` | Kurum: org_admin, instructor |  |
| GET | `/api/v1/organizations/{org_id}/export/members.csv` | Kurum: org_admin, instructor | Üye listesi CSV'si — skor sütunu yalnızca paylaşım rızası veren öğrenciler için dolu. |
| GET | `/api/v1/organizations/{org_id}/groups` | Kurum: org_admin, instructor |  |
| POST | `/api/v1/organizations/{org_id}/groups` | Kurum: org_admin, instructor |  |
| DELETE | `/api/v1/organizations/{org_id}/groups/{group_id}` | Kurum: org_admin, instructor |  |
| POST | `/api/v1/organizations/{org_id}/invite-code/rotate` | Kurum: org_admin | Eski davet kodunu geçersiz kılıp yenisini üretir. |
| GET | `/api/v1/organizations/{org_id}/invites` | Kurum: org_admin, instructor |  |
| POST | `/api/v1/organizations/{org_id}/invites` | Kurum: org_admin, instructor | CSV'den gelen e-postaları bekleyen davet olarak kaydeder. Kişi kuruma ancak |
| DELETE | `/api/v1/organizations/{org_id}/invites/{invite_id}` | Kurum: org_admin, instructor |  |
| PUT | `/api/v1/organizations/{org_id}/me/sharing` | Kurum: org_admin, instructor, candidate | Öğrenci kendi ilerlemesini bu kurumun eğitmenleriyle paylaşıp paylaşmamayı seçer. |
| GET | `/api/v1/organizations/{org_id}/members` | Kurum: org_admin, instructor | Üyeler + kurum bağlamındaki katılımları. Skor yalnızca öğrenci paylaşım rızası verdiyse döner. |
| DELETE | `/api/v1/organizations/{org_id}/members/{user_id}` | Kurum: org_admin |  |
| PATCH | `/api/v1/organizations/{org_id}/members/{user_id}` | Kurum: org_admin |  |
| PUT | `/api/v1/organizations/{org_id}/members/{user_id}/group` | Kurum: org_admin, instructor |  |
| GET | `/api/v1/organizations/{org_id}/members/{user_id}/progress` | Kurum: org_admin, instructor | Bir öğrencinin kurum içindeki ilerlemesi — yalnızca öğrenci paylaşım rızası verdiyse. |
| GET | `/api/v1/organizations/{org_id}/overview` | Kurum: org_admin, instructor | Kurum (ya da bir grubu) geneli katılım ve (en az 3 öğrenci katkı verdiyse) toplu skor istatistikleri. |
| GET | `/api/v1/organizations/{org_id}/questions` | Kurum: org_admin, instructor |  |
| POST | `/api/v1/organizations/{org_id}/questions` | Kurum: org_admin, instructor |  |
| DELETE | `/api/v1/organizations/{org_id}/questions/{question_id}` | Kurum: org_admin, instructor |  |
| PATCH | `/api/v1/organizations/{org_id}/questions/{question_id}` | Kurum: org_admin, instructor |  |

## Pilot

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/pilot/me` | Giriş |  |
| PUT | `/api/v1/pilot/me/consent` | Giriş | Araştırma onamı verir ya da geri çeker (geri çekilirse anket yanıtları silinir). |
| GET | `/api/v1/pilot/report` | Platform admini | Kimliksiz pilot raporu (yalnızca platform yöneticisi). |
| GET | `/api/v1/pilot/report.csv` | Platform admini |  |
| POST | `/api/v1/pilot/surveys/post-interview` | Giriş |  |
| POST | `/api/v1/pilot/surveys/sus` | Giriş |  |

## Progress

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/progress/me` | Giriş | Tamamlanmış mülakatlardan zaman serisi, eğilim, konu bazında performans ve öneriler. |
| GET | `/api/v1/progress/me/report.pdf` | Giriş | Gelişim raporunun PDF'i (2 sayfa: özet + eğilim grafiği + öneriler, konu tablosu + geçmiş). |

## Question Bank Admin

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/question-bank/candidates` | Platform admini |  |
| POST | `/api/v1/question-bank/candidates/generate` | Platform admini | En çok görülen boşluklar için LLM'den birer soru ÖNERİSİ üretir — |
| POST | `/api/v1/question-bank/candidates/{candidate_id}/approve` | Platform admini |  |
| POST | `/api/v1/question-bank/candidates/{candidate_id}/reject` | Platform admini |  |
| GET | `/api/v1/question-bank/gaps` | Platform admini |  |
| GET | `/api/v1/question-bank/questions` | Platform admini |  |
| POST | `/api/v1/question-bank/questions` | Platform admini |  |
| DELETE | `/api/v1/question-bank/questions/{question_id}` | Platform admini |  |
| PATCH | `/api/v1/question-bank/questions/{question_id}` | Platform admini |  |

## Users

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| GET | `/api/v1/users/me` | Giriş | Get the currently logged-in user profile. |
| PATCH | `/api/v1/users/me` | Giriş | Ad, soyad ve hedef pozisyonu günceller (hedef pozisyon mülakat kurulumunda rolü önceden doldurur). |
