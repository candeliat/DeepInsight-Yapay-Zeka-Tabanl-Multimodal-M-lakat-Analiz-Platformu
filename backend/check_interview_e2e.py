"""
Gerçek çalışan backend'e (Supabase + gerçek LLM dahil) karşı tam uçtan uca
mülakat akışı testi: kayıt -> giriş -> /start -> 5x /chat -> nihai
değerlendirme -> kalıcılık kontrolü -> temel girdi doğrulama sağlamlığı.

Önce sunucuyu başlatın: `python -m uvicorn app.main:app --port 8123`
Sonra: `python check_interview_e2e.py`

Gerçek Supabase kaydı ve gerçek LLM çağrısı yapar (kota/kredi harcar) —
pytest'e dahil değildir, elle çalıştırılır.
"""
import sys
import httpx
import time
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:8123/api/v1"
EMAIL = f"deepinsight.tester.{int(time.time())}@example.com"
PASSWORD = "TestSifre!2026"

client = httpx.Client(timeout=90)

print(f"=== 1) Kayıt: {EMAIL} ===")
r = client.post(f"{BASE}/auth/register", json={"email": EMAIL, "password": PASSWORD, "first_name": "Test", "last_name": "User"})
print(r.status_code, r.text[:300])

print("\n=== 2) Giriş ===")
r = client.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
print(r.status_code)
if r.status_code != 200:
    print("GİRİŞ BAŞARISIZ, DURDURULUYOR:", r.text)
    raise SystemExit(1)
token_data = r.json()
token = token_data["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print("access_token alındı (uzunluk:", len(token), ")")

print("\n=== 3) Mülakat başlat ===")
r = client.post(f"{BASE}/interview/start", json={"role": "Backend Developer", "topic": "Python"}, headers=headers)
print(r.status_code, r.text[:500])
if r.status_code != 200:
    raise SystemExit(1)
start_data = r.json()
interview_id = start_data["interview_id"]
print("interview_id:", interview_id)
print("İLK SORU:", start_data["first_message"])

answers = [
    "GIL, aynı anda sadece bir thread'in Python bytecode çalıştırmasına izin veren bir kilit mekanizmasıdır, bu yüzden CPU-bound işlerde thread'ler paralel çalışamaz.",
    "List comprehension, bir listeyi tek satırda döngü ve koşulla oluşturmamızı sağlar, örneğin [x*2 for x in range(10) if x % 2 == 0].",
    "Generator'lar yield kullanarak değerleri tek tek üretir, tüm listeyi hafızada tutmaz, bu yüzden büyük veri setlerinde daha bellek dostudur.",
    "Decorator, bir fonksiyonu sarmalayıp davranışını değiştiren fonksiyondur, @staticmethod ve @property örnek olarak verilebilir.",
    "Context manager, with ifadesiyle kullanılan, kaynak açma/kapama işlemlerini otomatikleştiren yapıdır, örneğin dosya işlemlerinde with open() kullanırız.",
]

for i, answer in enumerate(answers, start=1):
    print(f"\n=== 4.{i}) /chat - cevap {i} gönderiliyor ===")
    r = client.post(f"{BASE}/interview/chat", json={"interview_id": interview_id, "message": answer}, headers=headers)
    print(r.status_code)
    if r.status_code != 200:
        print("HATA:", r.text)
        break
    data = r.json()
    print("interview_complete:", data["interview_complete"])
    print("response:", data["response"][:300])
    if data["interview_complete"]:
        print("EVALUATION:", json.dumps(data["evaluation"], ensure_ascii=False, indent=2))
        break

print("\n=== 5) Kalıcılık kontrolü: GET /interview/{id} ===")
r = client.get(f"{BASE}/interview/{interview_id}", headers=headers)
print(r.status_code)
detail = r.json()
print("status:", detail.get("status"))
print("technical_score:", detail.get("technical_score"))
print("confidence_score:", detail.get("confidence_score"))
print("vocabulary_score:", detail.get("vocabulary_score"))
print("mesaj sayısı:", len(detail.get("messages", [])))

print("\n=== 6) Ekstra sağlamlık testi: mesaj boyutu/injection reddi ===")
r = client.post(f"{BASE}/interview/start", json={"role": "a" * 200, "topic": "test"}, headers=headers)
print("cok uzun role ->", r.status_code, "(422 beklenir)")

r = client.post(f"{BASE}/interview/chat", json={"interview_id": interview_id, "message": ""}, headers=headers)
print("bos mesaj (tamamlanmis mulakata) ->", r.status_code, "(400 veya 422 beklenir)")

print("\n=== TAMAMLANDI ===")
