"""
Kullanıcı başına istek sınırı (kayan pencere, süreç içi).

LLM, OCR, Whisper ve video analizi çağıran uç noktalar hem ücretsiz model kotasını hem
makineyi tüketir; tek bir kullanıcının (ya da sızmış bir token'ın) döngüyle istek atması
herkesi yavaşlatıyordu. Sınır aşılınca 429 + Retry-After döner.

Süreç içidir: birden çok backend örneği çalıştırılırsa her örnek kendi sayacını tutar
(o durumda Redis gibi paylaşılan bir sayaca taşınmalı).
"""
import math
import threading
import time
from collections import defaultdict, deque
from typing import Callable, Deque, Dict, Optional, Sequence, Tuple

from fastapi import Depends, HTTPException, status

from app.api.dependencies.auth import get_current_user
from app.api.schemas.user import UserProfile
from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self, limits: Sequence[Tuple[int, float]], clock: Callable[[], float] = time.monotonic):
        self.limits = [(n, w) for n, w in limits if n > 0]
        self.clock = clock
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> Optional[float]:
        """İsteği sayar; sınır aşıldıysa saymaz ve kaç saniye sonra denenebileceğini döner."""
        if not self.limits:
            return None
        longest = max(w for _, w in self.limits)
        with self._lock:
            now = self.clock()
            hits = self._hits[key]
            while hits and hits[0] <= now - longest:
                hits.popleft()
            retry_after = 0.0
            for limit, window in self.limits:
                recent = [t for t in hits if t > now - window]
                if len(recent) >= limit:
                    retry_after = max(retry_after, recent[-limit] + window - now)
            if retry_after > 0:
                return retry_after
            hits.append(now)
            return None


_llm_limiter = SlidingWindowLimiter([
    (settings.RATE_LIMIT_AI_PER_MINUTE, 60.0),
    (settings.RATE_LIMIT_AI_PER_HOUR, 3600.0),
])


async def ai_rate_limit(current_user: UserProfile = Depends(get_current_user)) -> None:
    """Yapay zekâ/ağır işlem yapan uç noktalara `dependencies=[Depends(ai_rate_limit)]` ile eklenir."""
    retry_after = _llm_limiter.hit(current_user.id)
    if retry_after is not None:
        seconds = max(1, math.ceil(retry_after))
        wait = f"{seconds} saniye" if seconds < 120 else f"{math.ceil(seconds / 60)} dakika"
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Kısa sürede çok fazla istek gönderdiniz. Lütfen {wait} sonra tekrar deneyin.",
            headers={"Retry-After": str(seconds)},
        )
