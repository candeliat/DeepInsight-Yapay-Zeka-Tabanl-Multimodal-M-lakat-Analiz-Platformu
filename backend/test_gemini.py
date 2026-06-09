import asyncio
from google import genai
from google.genai import types
from app.core.config import settings
import sys

async def main():
    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        print("Genai client ok")
        
        # Test with a dummy file if needed, but we just want to see if the imports and method exist
        part = types.Part.from_bytes(data=b"dummy", mime_type="audio/m4a")
        print(f"Part type created: {part}")
        
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
