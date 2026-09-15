import json
import logging
from datetime import datetime, timezone
from app.core.database import supabase, get_auth_client
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

async def create_interview(
    user_id: str,
    role: str,
    topic: str,
    token: str = None,
    difficulty: Optional[str] = None,
    question_pool: Optional[List[Dict[str, Any]]] = None,
) -> dict:
    """
    Supabase'de yeni bir mülakat kaydı oluşturur.

    `question_pool`: `/start` içinde interview oluşturulmadan ÖNCE
    `question_bank_service.fetch_question_pool` ile tek seferde çekilen,
    sırayla tüketilecek soru bankası adayları (bkz. bu modülün üstündeki
    genel not ve app/api/routes/interview.py). Banka boşsa/atlanmışsa boş
    liste olarak kaydedilir — mülakat tamamen LLM'in tam-üretim akışıyla
    devam eder.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    record = {
        "user_id": user_id,
        "role": role,
        "topic": topic,
        "difficulty": difficulty,
        "question_pool": question_pool or [],
        "status": "ongoing",
        "chat_history": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = client.table("interviews").insert(record).execute()
    if not result.data:
        raise RuntimeError("Failed to create interview record")

    return result.data[0]

async def save_message(interview_id: str, role: str, content: str, token: str = None) -> dict:
    """
    Mülakat mesajını anlık olarak veritabanına kaydeder.
    role: 'user' veya 'model'
    """
    # Force use of global supabase client (Service Role) to bypass RLS for interview_messages
    client = supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    record = {
        "interview_id": interview_id,
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = client.table("interview_messages").insert(record).execute()
    if not result.data:
        raise RuntimeError("Failed to save interview message")

    return result.data[0]

async def get_interview_history(interview_id: str, token: str = None) -> List[Dict[str, Any]]:
    """
    Mülakat geçmişini veritabanından zamana göre sıralı olarak getirir.
    """
    # Use global service-role client (same as save_message) for consistent RLS bypass
    client = supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    result = client.table("interview_messages")\
        .select("role, content, created_at")\
        .eq("interview_id", interview_id)\
        .order("created_at", desc=False)\
        .execute()

    return result.data or []

async def try_claim_interview_finalization(interview_id: str, token: str = None) -> bool:
    """
    Bir mülakatı nihai değerlendirme için atomik olarak "claim" etmeye çalışır:
    status'u yalnızca hâlâ 'ongoing' ise 'completed' yapar (bkz. Supabase'in
    UPDATE ... WHERE status='ongoing' şeklindeki koşullu güncellemesi).

    Bu, aynı interview_id için eş zamanlı gelen iki "final" istek (örn. çift
    tıklama, ağ retry'ı, veya /chat ile /finish'in aynı anda tetiklenmesi)
    arasındaki yarış durumunu engeller: kaybeden istek burada hemen False alır
    ve pahalı LLM değerlendirme çağrısına hiç girmeden HTTPException döner.
    Kazanan istek, gerçek puanları `finish_interview_and_evaluate` ile ayrıca
    doldurur — bu ikinci güncelleme sırasında status zaten 'completed'
    olduğundan (yeni bir enum değeri gerekmez) filtreye gerek yoktur.

    Dönüş: bu çağrı yarışı kazandıysa True, kaybettiyse (veya mülakat zaten
    tamamlanmışsa) False.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    result = (
        client.table("interviews")
        .update({"status": "completed"})
        .eq("id", interview_id)
        .eq("status", "ongoing")
        .execute()
    )
    return bool(result.data)


async def release_interview_finalization_claim(interview_id: str, token: str = None) -> None:
    """
    `try_claim_interview_finalization` ile alınan bir claim'i geri alır.

    Claim alındıktan SONRA nihai değerlendirme (LLM çağrısı) başarısız olursa
    çağrılması gerekir — aksi halde mülakat, hiçbir gerçek skor/feedback
    kaydedilmeden kalıcı olarak 'completed' durumunda takılı kalır ve bir daha
    hiçbir uç noktadan (status zaten 'completed' göründüğü için) tekrar
    denenemez. En iyi çaba (best-effort) ile status'u 'ongoing'e geri alır;
    bu geri alma da başarısız olursa orijinal hatayı maskelememek için
    yalnızca loglar, tekrar fırlatmaz.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        return
    try:
        client.table("interviews").update({"status": "ongoing"}).eq("id", interview_id).execute()
    except Exception:
        logger.exception(
            "Mülakat claim'i geri alınamadı (interview_id=%s) — 'completed' durumunda takılı kalmış olabilir.",
            interview_id,
        )


async def get_completed_confidence_map(interview_ids: List[str], token: str = None) -> Dict[str, float]:
    """
    Verilen mülakat id'leri için, video/ses analizi TAMAMLANMIŞ olanların
    objektif `confidence_pct` değerini {interview_id: confidence_pct} olarak
    döndürür. Analizi tamamlanmamış/hiç başlamamış mülakatlar sözlükte yer
    almaz — çağıran taraf bu durumda LLM'in metin-tabanlı `confidence_score`'una
    geri düşmelidir (bkz. app/services/llm_service.py:InterviewEvaluation
    docstring'i — iki farklı özgüven sinyali kasıtlı olarak ayrı tutulur).
    """
    if not interview_ids:
        return {}

    client = supabase
    if not client:
        return {}

    result = (
        client.table("interview_analytics")
        .select("interview_id, confidence_pct, analysis_status")
        .in_("interview_id", interview_ids)
        .eq("analysis_status", "completed")
        .execute()
    )
    return {
        row["interview_id"]: row["confidence_pct"]
        for row in (result.data or [])
        if row.get("confidence_pct") is not None
    }


async def finish_interview_and_evaluate(interview_id: str, evaluation_data: Dict[str, Any], token: str = None) -> dict:
    """
    Mülakatı sonlandırır ve değerlendirme puanlarını günceller.
    evaluation_data: { 'technical_score': int, 'confidence_score': int, 'vocabulary_score': int, 'feedback': str }
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    record = {
        "status": "completed",
        "technical_score": evaluation_data.get("technical_score", 0),
        "confidence_score": evaluation_data.get("confidence_score", 0),
        "vocabulary_score": evaluation_data.get("vocabulary_score", 0),
        "feedback": evaluation_data.get("feedback", ""),
    }

    result = client.table("interviews").update(record).eq("id", interview_id).execute()
    if not result.data:
        raise RuntimeError("Failed to update interview with evaluation")

    return result.data[0]

async def get_interview(interview_id: str, token: str = None) -> dict:
    """
    Mülakat bilgilerini getirir.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    result = client.table("interviews").select("*").eq("id", interview_id).execute()
    if not result.data:
        raise ValueError("Interview not found")
        
    return result.data[0]

async def get_user_interviews(user_id: str, token: str = None) -> List[Dict[str, Any]]:
    """
    Kullanıcının tüm mülakatlarını getirir.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    result = client.table("interviews").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data or []
