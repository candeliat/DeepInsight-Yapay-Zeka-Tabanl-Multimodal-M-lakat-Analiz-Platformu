import asyncio
import os
import numpy as np
import soundfile as sf
import time
from app.services.analytics import run_full_analysis
from app.core.database import supabase

import uuid

async def test_analytics():
    print("1. Creating dummy audio file (2 seconds of noise)...")
    sample_rate = 16000
    duration = 2
    audio_data = np.random.uniform(-1, 1, sample_rate * duration)
    test_file = "test_mock_audio.wav"
    sf.write(test_file, audio_data, sample_rate)
    
    interview_id = str(uuid.uuid4())
    print(f"2. Simulating backend background task for interview {interview_id}...")
    
    # Supabase'e sahte bir mülakat kaydı ekleyelim (Foreign Key constraint'i geçmek için)
    try:
        supabase.table("interviews").insert({
            "id": interview_id,
            "user_id": "00000000-0000-0000-0000-000000000000", # Varsayılan/Dummy UUID
            "role": "Test Role",
            "topic": "Test Topic",
            "status": "completed",
            "chat_history": []
        }).execute()
        print("   -> Dummy interview created in DB.")
    except Exception as e:
        print(f"   -> Failed to create dummy interview: {e}. If it's a constraint issue, test might fail.")
    
    # We will run the analysis directly.
    # Note: run_full_analysis is a synchronous function, so we don't need await.
    run_full_analysis(test_file, interview_id, "audio")
    
    print("3. Analysis complete. Querying Supabase for results...")
    result = supabase.table("interview_analytics").select("*").eq("interview_id", interview_id).execute()
    
    if result.data:
        print("\n=== AI ANALYTICS RESULTS ===")
        for key, value in result.data[0].items():
            print(f"{key}: {value}")
        print("============================")
    else:
        print("ERROR: No results found in database!")
        
    # Cleanup
    if os.path.exists(test_file):
        os.remove(test_file)
        
if __name__ == "__main__":
    asyncio.run(test_analytics())
