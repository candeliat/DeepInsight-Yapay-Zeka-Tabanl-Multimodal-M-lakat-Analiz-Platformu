import asyncio
import json
from app.core.database import supabase

async def main():
    if supabase:
        res = supabase.table('interview_messages').select('*').limit(1).execute()
        print(json.dumps(res.data, indent=2))
    else:
        print("No supabase client")

if __name__ == "__main__":
    asyncio.run(main())
