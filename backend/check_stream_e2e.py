"""
`/interview/chat/stream` SSE endpoint'ini gerçek çalışan bir sunucuya karşı
manuel doğrulamak için. Önce sunucuyu başlatın:
    python -m uvicorn app.main:app --port 8123
Sonra: `python check_stream_e2e.py`
"""
import sys
import time
import json
import httpx

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:8123/api/v1"
EMAIL = f"deepinsight.stream.tester.{int(time.time())}@example.com"
PASSWORD = "TestSifre!2026"

client = httpx.Client(timeout=90)

print("=== Kayıt + Giriş ===")
client.post(f"{BASE}/auth/register", json={"email": EMAIL, "password": PASSWORD})
r = client.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

print("=== Mülakat başlat ===")
r = client.post(f"{BASE}/interview/start", json={"role": "Backend Developer", "topic": "Python"}, headers=headers)
interview_id = r.json()["interview_id"]
print("İLK SORU:", r.json()["first_message"])

print("\n=== /chat/stream ile cevap gönder (canlı akış) ===")
with client.stream(
    "POST", f"{BASE}/interview/chat/stream",
    json={"interview_id": interview_id, "message": "GIL, aynı anda sadece bir thread'in Python bytecode çalıştırmasına izin veren bir kilit mekanizmasıdır."},
    headers=headers,
) as resp:
    print("status:", resp.status_code, "content-type:", resp.headers.get("content-type"))
    event_type, data_lines = None, []
    for raw_line in resp.iter_lines():
        if raw_line.startswith("event:"):
            event_type = raw_line[len("event:"):].strip()
        elif raw_line.startswith("data:"):
            data = json.loads(raw_line[len("data:"):].strip())
            if event_type == "chunk":
                print(data, end="", flush=True)
            elif event_type == "done":
                print("\n\n[DONE event]:", json.dumps(data, ensure_ascii=False))
            elif event_type == "error":
                print("\n\n[ERROR event]:", json.dumps(data, ensure_ascii=False))

print("\n=== TAMAMLANDI ===")
