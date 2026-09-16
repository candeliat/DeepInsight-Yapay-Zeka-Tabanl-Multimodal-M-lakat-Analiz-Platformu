"""
Bir kullanıcıya, e-posta adresiyle, `app_metadata.role = "admin"` atar.

`app_metadata` yalnızca service_role anahtarıyla (bu script'in kullandığı
`SUPABASE_KEY`) yazılabilir — kullanıcının kendisi `user_metadata`'nın
aksine bunu değiştiremez. Bu yüzden admin yetkisi için güvenilir alan budur
(bkz. app/api/dependencies/auth.py -> require_admin).

Çalıştırmak için (backend/ dizininden):
    python scripts/set_admin_role.py kullanici@ornek.com
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.core.database import supabase


def main():
    if len(sys.argv) != 2:
        print("Kullanım: python scripts/set_admin_role.py <email>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()

    if not supabase:
        print("HATA: Supabase client başlatılamadı (SUPABASE_URL/SUPABASE_KEY .env'de eksik).")
        sys.exit(1)

    target_user = None
    page = 1
    while True:
        response = supabase.auth.admin.list_users(page=page, per_page=200)
        users = response if isinstance(response, list) else getattr(response, "users", [])
        if not users:
            break
        for user in users:
            if (user.email or "").strip().lower() == email:
                target_user = user
                break
        if target_user or len(users) < 200:
            break
        page += 1

    if not target_user:
        print(f"HATA: '{email}' e-postasıyla kayıtlı kullanıcı bulunamadı.")
        sys.exit(1)

    current_app_metadata = dict(target_user.app_metadata or {})
    current_app_metadata["role"] = "admin"

    supabase.auth.admin.update_user_by_id(
        target_user.id,
        {"app_metadata": current_app_metadata},
    )

    print(f"Tamamlandı: {email} (id={target_user.id}) artık admin.")


if __name__ == "__main__":
    main()
