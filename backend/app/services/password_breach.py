"""
Sızdırılmış şifre kontrolü (HaveIBeenPwned "Pwned Passwords", k-anonimlik).

Supabase'in yerleşik "leaked password protection" özelliği Pro planda; ücretsiz planda
aynı kontrol burada yapılır. Şifre ya da tam özeti ASLA gönderilmez: yalnızca SHA-1
özetinin ilk 5 karakteri gönderilir, dönen yüzlerce sonek arasında eşleşme yerelde aranır
(https://haveibeenpwned.com/API/v3#PwnedPasswords). Add-Padding başlığı yanıt boyutundan
da çıkarım yapılmasını engeller.

Servise ulaşılamazsa kayıt/şifre değişikliği engellenmez (fail-open): kontrol ek bir
güvenlik katmanıdır, erişilebilirliği düşürmemeli.
"""
import hashlib
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RANGE_URL = "https://api.pwnedpasswords.com/range/{prefix}"
BREACHED_MESSAGE = (
    "Bu şifre daha önce bir veri sızıntısında açığa çıkmış şifreler listesinde yer alıyor. "
    "Lütfen başka bir şifre seçin."
)


async def times_breached(password: str) -> Optional[int]:
    """Şifrenin sızıntılarda kaç kez görüldüğü (0 = hiç); kontrol yapılamadıysa None."""
    if not settings.PASSWORD_BREACH_CHECK:
        return None
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    try:
        async with httpx.AsyncClient(timeout=settings.PASSWORD_BREACH_TIMEOUT) as client:
            resp = await client.get(RANGE_URL.format(prefix=prefix), headers={"Add-Padding": "true"})
            resp.raise_for_status()
    except Exception as e:
        logger.warning("Sızdırılmış şifre kontrolü yapılamadı (engellenmedi): %s", type(e).__name__)
        return None
    for line in resp.text.splitlines():
        candidate, _, count = line.partition(":")
        if candidate.strip() == suffix:
            return int(count.strip() or 0)  # dolgu satırlarının sayısı 0'dır
    return 0


async def is_breached(password: str) -> bool:
    return bool(await times_breached(password))
