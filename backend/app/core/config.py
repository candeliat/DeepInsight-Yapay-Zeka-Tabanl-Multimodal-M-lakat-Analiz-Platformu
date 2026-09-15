import os
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)


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
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "small")
    TEMP_UPLOAD_DIR: str = os.getenv("TEMP_UPLOAD_DIR", str(Path(__file__).resolve().parent.parent.parent / "temp_uploads"))
    ANALYSIS_FPS: int = int(os.getenv("ANALYSIS_FPS", "1"))

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
    masked_key = settings.LLM_API_KEY[:5] + "..." + settings.LLM_API_KEY[-3:]
    logger.info("LLM API Key yüklendi (base_url=%s). (%s, uzunluk: %d)", settings.LLM_BASE_URL, masked_key, len(settings.LLM_API_KEY))
else:
    logger.warning("LLM_API_KEY eksik veya .env dosyası okunamadı! LLM mülakat motoru çalışmayacak.")
