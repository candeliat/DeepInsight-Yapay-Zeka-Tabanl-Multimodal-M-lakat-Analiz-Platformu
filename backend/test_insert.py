import asyncio
from app.core.database import supabase
from datetime import datetime, timezone
import uuid

async def main():
    if supabase:
        record = {
            "interview_id": str(uuid.uuid4()),
            "role": "model",
            "content": "Test mesajı",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            res = supabase.table('interview_messages').insert(record).execute()
            print("Basarili")
        except Exception as e:
            print("Hata:", e)
    else:
        print("No supabase client")

if __name__ == "__main__":
    asyncio.run(main())
