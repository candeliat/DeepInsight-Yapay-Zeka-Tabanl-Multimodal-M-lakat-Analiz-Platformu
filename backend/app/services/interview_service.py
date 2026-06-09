import json
from datetime import datetime, timezone
from app.core.database import supabase, get_auth_client
from typing import List, Dict, Any, Optional

async def create_interview(user_id: str, role: str, topic: str, token: str = None) -> dict:
    """
    Supabase'de yeni bir mülakat kaydı oluşturur.
    """
    client = get_auth_client(token) if token else supabase
    if not client:
        raise RuntimeError("Supabase client is not initialized")

    record = {
        "user_id": user_id,
        "role": role,
        "topic": topic,
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
