import asyncio
import os
import sys

# Yolu ekle ki app modülünü bulabilsin
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.core.database import supabase

def check_errors():
    try:
        result = supabase.table("interview_analytics").select("interview_id, error_message, updated_at").eq("analysis_status", "failed").order("updated_at", desc=True).limit(5).execute()
        if result.data:
            print("Son Başarısız Analiz Hataları:")
            for row in result.data:
                print(f"- Mülakat ID: {row['interview_id']}")
                print(f"  Hata: {row['error_message']}")
        else:
            print("Başarısız analiz kaydı bulunamadı.")
    except Exception as e:
        print(f"Hata: {e}")

if __name__ == "__main__":
    check_errors()
