import os
from google import genai
from dotenv import load_dotenv

load_dotenv('.env', override=True)
if "GOOGLE_API_KEY" in os.environ:
    del os.environ["GOOGLE_API_KEY"]

client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))

try:
    for m in client.models.list():
        print(m.name)
except Exception as e:
    print("Error:", str(e))
