import os
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
# override=False: ortamda tanımlı değişken (sunucu/CI) .env'den önceliklidir.
load_dotenv(dotenv_path=env_path, override=False)


class Settings:
    """
    Centralized configuration management for the application.
    Reads from environment variables.
    """
    # Mülakat LLM motoru için OpenAI-uyumlu herhangi bir sağlayıcı (OpenRouter,
    # NVIDIA build.nvidia.com, vb.) kullanılabilir — base_url + model isimleri
    # sağlayıcıya göre değişir (bkz. llm_service.py FREE_MODELS).
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    # Şifre sıfırlama e-postasındaki bağlantının açacağı web sayfası. Supabase panelinde
    # Auth -> URL Configuration -> Redirect URLs listesine eklenmiş olmalı.
    PASSWORD_RESET_REDIRECT: str = os.getenv("PASSWORD_RESET_REDIRECT", "http://localhost:3002/reset-password")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "small")
    TEMP_UPLOAD_DIR: str = os.getenv("TEMP_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp_uploads"))
    ANALYSIS_FPS: int = int(os.getenv("ANALYSIS_FPS", "1"))
    # Aynı anda çalışan video analizi sayısı (her biri GB'larca bellek kullanır) ve sırada
    # bekleyebilecek en fazla iş; fazlası 503 ile reddedilir (bkz. analysis_queue).
    ANALYSIS_MAX_CONCURRENCY: int = int(os.getenv("ANALYSIS_MAX_CONCURRENCY", "1"))
    ANALYSIS_MAX_QUEUE: int = int(os.getenv("ANALYSIS_MAX_QUEUE", "20"))
    # Kareler bu genişliğe küçültülür ve en fazla bu kadar kare tutulur: uzun videoda bellek sabit kalır.
    ANALYSIS_FRAME_WIDTH: int = int(os.getenv("ANALYSIS_FRAME_WIDTH", "640"))
    ANALYSIS_MAX_FRAMES: int = int(os.getenv("ANALYSIS_MAX_FRAMES", "300"))

    # --- LLM Mülakat Motoru ---
    MAX_INTERVIEW_QUESTIONS: int = int(os.getenv("MAX_INTERVIEW_QUESTIONS", "5"))
    LLM_REQUEST_TIMEOUT: float = float(os.getenv("LLM_REQUEST_TIMEOUT", "60"))
    # LLM_REQUEST_TIMEOUT httpx'in bağlantı/okuma (idle) timeout'udur — bir
    # "reasoning" modeli sürekli küçük reasoning_content parçaları göndermeye
    # devam ettiği sürece bu ASLA tetiklenmez (bağlantı hiç boşta kalmaz),
    # dolayısıyla tek bir model denemesi dakikalarca sürebilir. Bu ayrı ayar,
    # tek bir model denemesi için TOPLAM (duvar saati) süre sınırıdır — hem
    # streaming hem non-streaming çağrılarda kullanılır (bkz. llm_service.py).
    # Aşılırsa o deneme başarısız sayılıp sıradaki fallback modele geçilir.
    LLM_ATTEMPT_MAX_DURATION: float = float(os.getenv("LLM_ATTEMPT_MAX_DURATION", "30"))
    # Yapılandırılmış (JSON) çağrılar — mülakat değerlendirmesi, CV profili, ilan
    # gereksinimleri — uzun rubrik/metinle daha çok reasoning yapıyor: canlı ölçümde
    # gpt-oss-20b değerlendirmesi 18-27 sn sürdü, 30 sn sınırı ikinci modeli de kesiyordu.
    LLM_JSON_ATTEMPT_MAX_DURATION: float = float(os.getenv("LLM_JSON_ATTEMPT_MAX_DURATION", "60"))
    # Bir "sonraki soru" yanıtı bu karakter sayısını aşarsa reddedilir — normal
    # bir mülakat sorusu (+ kısa değerlendirme cümlesi) birkaç yüz karakteri
    # geçmez; canlı testte gözlemlendiği üzere bazı reasoning modelleri
    # max_tokens dolduğunda iç muhakemesini (binlerce karakter, çoğunlukla
    # İngilizce) content alanına sızdırıyor — bu eşik o durumu tespit edip
    # reddeder (bkz. llm_service.py._validate_response_length).
    LLM_MAX_RESPONSE_CHARS: int = int(os.getenv("LLM_MAX_RESPONSE_CHARS", "700"))
    # Varsayılan olarak KAPALI: yanlışlıkla ücretli model çağrısı yapıp maliyet oluşmasını engeller.
    # Açmak için .env dosyasına ENABLE_PAID_MODEL_FALLBACK=true ekleyin.
    ENABLE_PAID_MODEL_FALLBACK: bool = os.getenv("ENABLE_PAID_MODEL_FALLBACK", "false").lower() == "true"
    # Devre kesici: üst üste bu kadar sağlık hatası (zaman aşımı/429/5xx/404) veren model
    # LLM_BREAKER_COOLDOWN saniye zincirin sonuna alınır; tekrarında süre ikiye katlanır.
    LLM_BREAKER_THRESHOLD: int = int(os.getenv("LLM_BREAKER_THRESHOLD", "2"))
    LLM_BREAKER_COOLDOWN: float = float(os.getenv("LLM_BREAKER_COOLDOWN", "120"))
    LLM_BREAKER_MAX_COOLDOWN: float = float(os.getenv("LLM_BREAKER_MAX_COOLDOWN", "900"))
    # Her LLM denemesi llm_usage tablosuna yazılır (sql/019); kapatmak için false.
    LLM_USAGE_PERSIST: bool = os.getenv("LLM_USAGE_PERSIST", "true").lower() == "true"
    # Kullanıcı başına istek sınırı: yapay zekâ/OCR/Whisper/video analizi yapan uç noktalar
    # (bkz. app/core/rate_limit.py). 0 = o pencere için sınır yok.
    RATE_LIMIT_AI_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_AI_PER_MINUTE", "20"))
    RATE_LIMIT_AI_PER_HOUR: int = int(os.getenv("RATE_LIMIT_AI_PER_HOUR", "200"))
    # Kayıt ve şifre değişikliğinde HaveIBeenPwned k-anonimlik kontrolü (bkz. password_breach).
    PASSWORD_BREACH_CHECK: bool = os.getenv("PASSWORD_BREACH_CHECK", "true").lower() == "true"
    PASSWORD_BREACH_TIMEOUT: float = float(os.getenv("PASSWORD_BREACH_TIMEOUT", "3"))

    # --- Soru Bankası / RAG ---
    # `nvidia/nemotron-3-embed-1b` — build.nvidia.com kataloğunda canlı istekle
    # doğrulanmış tek embedding modeli (bkz. backend/check_embedding_live.py;
    # aynı anahtarla denenen diğer modellerin çoğu 404/410 veriyor — bkz.
    # llm_service.py FREE_MODELS yorumundaki "sadece çalışanlar" prensibi).
    QUESTION_BANK_EMBEDDING_MODEL: str = os.getenv("QUESTION_BANK_EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b")
    # Bu benzerlik skorunun ALTINDAKİ eşleşmeler kullanılmaz — banka o rol/konu
    # için henüz yeterince dolu değilse LLM'in tam-üretim akışına (get_next_question)
    # sessizce düşülür (bkz. question_bank_service.py).
    #
    # NOT: 0.35 gibi "sezgisel" bir değer değil — `nvidia/nemotron-3-embed-1b`
    # asimetrik (query vs passage) embedding ürettiği için mutlak cosine
    # similarity değerleri, aynı-tipte (passage-passage) karşılaştırmadan çok
    # daha DÜŞÜK bir aralıkta kalıyor (bkz. backend/check_embedding_live.py'deki
    # sanity check 0.77 idi ama gerçek query→passage retrieval'de gerçek eşleşmeler
    # bile 0.18-0.39 bandında). 0.22, ~20 soruluk seed setiyle canlı ölçülerek
    # kalibre edildi: gerçek eşleşmeleri (Python 0.26, React 0.39, JS 0.30) geçirip
    # alakasız alanları (ör. "Uzay Mühendisi" 0.16) elerken, ML gibi az örnekli
    # konularda temkinli davranıp (0.21 -> eşik altı) tam-üretime düşmeyi tercih
    # ediyor — yanlış konudan soru göstermektense generation'a düşmek daha güvenli.
    # Banka büyüdükçe (her konu için daha fazla/çeşitli soru) içi-benzerlik artar,
    # bu değer zamanla artırılabilir.
    QUESTION_BANK_MIN_SIMILARITY: float = float(os.getenv("QUESTION_BANK_MIN_SIMILARITY", "0.22"))
    # Exposure control: sık seçilmiş sorular benzerlik sıralamasında hafifçe
    # cezalandırılır (adjusted = similarity - PENALTY * log1p(times_served)) —
    # amaç, banka küçükken bile aynı popüler sorunun her mülakatta tekrar
    # tekrar seçilmesini engellemek (bkz. CAT sistemlerindeki "item exposure
    # control" prensibi, proje notları).
    QUESTION_BANK_EXPOSURE_PENALTY: float = float(os.getenv("QUESTION_BANK_EXPOSURE_PENALTY", "0.03"))
    # Yeniden sıralama için gerekenden fazla aday çekilir (size * bu çarpan,
    # en fazla 30) — yoksa exposure penalty'nin seçebileceği bir "ikinci en
    # iyi" aday havuzu olmaz.
    QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER: int = int(os.getenv("QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER", "4"))

settings = Settings()

if settings.LLM_API_KEY:
    # Anahtarın hiçbir parçası loga yazılmaz.
    logger.info("LLM API anahtarı yüklendi (base_url=%s, uzunluk=%d).", settings.LLM_BASE_URL, len(settings.LLM_API_KEY))
else:
    logger.warning("LLM_API_KEY eksik veya .env dosyası okunamadı! LLM mülakat motoru çalışmayacak.")
