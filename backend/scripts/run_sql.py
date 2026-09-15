"""
Supabase Management API üzerinden rastgele SQL (DDL dahil) çalıştırır — bir
migration için artık SQL Editor'e elle girip yapıştırmaya gerek yok.
supabase-py (REST/PostgREST) client'ı DDL çalıştıramadığından (bkz.
sql/*.sql dosyalarının üstündeki notlar), bu script Management API'nin
"Run a query" uç noktasını kullanır:
  POST https://api.supabase.com/v1/projects/{ref}/database/query

Gerekli ortam değişkenleri (.env):
  SUPABASE_ACCESS_TOKEN — "Database: Read-write" izinli, yalnızca bu projeye
    scope'lanmış bir Personal Access Token
    (https://supabase.com/dashboard/account/tokens). DB şifresinden
    TAMAMEN AYRI bir kimlik bilgisidir, asla commit'lenmemelidir.
  SUPABASE_PROJECT_REF  — proje referansı (SUPABASE_URL'in alt alan adı,
    örn. https://pmiatclyqtquyffcfegi.supabase.co -> pmiatclyqtquyffcfegi)

Kullanım (backend/ dizininden):
  python scripts/run_sql.py sql/003_question_families.sql
  python scripts/run_sql.py --sql "select count(*) from question_bank;"
"""
import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BACKEND_DIR / ".env", override=True)

MANAGEMENT_API_BASE = "https://api.supabase.com/v1"


def run_sql(query: str) -> None:
    token = os.getenv("SUPABASE_ACCESS_TOKEN")
    project_ref = os.getenv("SUPABASE_PROJECT_REF")
    if not token or not project_ref:
        print("HATA: SUPABASE_ACCESS_TOKEN ve/veya SUPABASE_PROJECT_REF .env'de eksik.")
        sys.exit(1)

    url = f"{MANAGEMENT_API_BASE}/projects/{project_ref}/database/query"
    response = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"query": query},
        timeout=60,
    )

    if response.status_code >= 400:
        print(f"HATA: HTTP {response.status_code}")
        print(response.text)
        sys.exit(1)

    print(f"OK (HTTP {response.status_code})")
    try:
        data = response.json()
        if data:
            print(data)
    except ValueError:
        pass


def main():
    parser = argparse.ArgumentParser(description="Supabase Management API ile SQL çalıştırır.")
    parser.add_argument("file", nargs="?", help="Çalıştırılacak .sql dosyasının yolu")
    parser.add_argument("--sql", help="Doğrudan çalıştırılacak SQL metni (dosya yerine)")
    args = parser.parse_args()

    if args.sql:
        query = args.sql
    elif args.file:
        query = Path(args.file).read_text(encoding="utf-8")
    else:
        parser.error("Ya bir .sql dosya yolu ya da --sql vermelisiniz.")
        return

    print(f"Çalıştırılıyor ({len(query)} karakter)...")
    run_sql(query)


if __name__ == "__main__":
    main()
