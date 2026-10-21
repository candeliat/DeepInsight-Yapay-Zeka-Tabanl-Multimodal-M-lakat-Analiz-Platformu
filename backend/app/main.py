import logging
import os
import sys

# Windows'ta çıktı bir dosyaya/boruya yönlendiğinde kodlama sistem kod sayfası (cp1254) olur:
# DeepFace içe aktarılırken bastığı "⚠️" uyarısı UnicodeEncodeError fırlatıp video analizini
# düşürüyordu; Türkçe log satırları da bozuk yazılıyordu. Çıktı UTF-8'e alınır, kodlanamayan
# karakter çökme yerine değiştirilir. Linux/Docker'da zaten UTF-8 olduğundan etkisizdir.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Uygulama logları (app.*) için yapılandırma; router import'larından ÖNCE olmalı ki modüller
# yüklenirken yazılan loglar da görünsün. Önceden hiç yapılandırılmadığı için tüm
# logger.info kayıtları (LLM token kullanımı dahil) kayboluyordu. Seviye: LOG_LEVEL (varsayılan INFO).
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from app.api.routes import interview, auth, users, analytics, question_bank_admin, organizations, cv, jobs, progress, assignments, notifications, pilot, account, admin, feedback  # noqa: E402

@asynccontextmanager
async def lifespan(_app):
    import asyncio
    from app.services import analysis_queue
    # Önceki süreçte yarıda kalan analizler sonsuza kadar "işleniyor" görünmesin.
    await asyncio.to_thread(analysis_queue.recover_after_restart)
    yield


app = FastAPI(
    lifespan=lifespan,
    title="DeepInsight Backend API",
    description="Centralized Python Backend for DeepInsight built with FastAPI",
    version="1.0.0"
)

# CORS Configuration
# Allowing all origins requests as requested to support localhost:3000 (web) & expo (mobile)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "*" # Mobile için wildcard kalabilir ama web için explicit lazım
    ],
    allow_credentials=False, # True iken wildcard kullanılamaz
    allow_methods=["*"],  # Allows all HTTP methods
    allow_headers=["*"],  # Allows all headers
    # İstek sınırı aşılınca istemci ne kadar bekleyeceğini okuyabilsin (bkz. rate_limit).
    expose_headers=["Retry-After"],
)

# Include the interview router
app.include_router(interview.router, prefix="/api/v1/interview", tags=["Interview"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(question_bank_admin.router, prefix="/api/v1/question-bank", tags=["Question Bank Admin"])
app.include_router(organizations.router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(cv.router, prefix="/api/v1/cv", tags=["CV"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["Jobs"])
app.include_router(progress.router, prefix="/api/v1/progress", tags=["Progress"])
app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["Assignments"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(pilot.router, prefix="/api/v1/pilot", tags=["Pilot"])
app.include_router(account.router, prefix="/api/v1/account", tags=["Account (KVKK)"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Platform Admin"])
app.include_router(feedback.router, prefix="/api/v1/feedback", tags=["Feedback"])

@app.get("/")
def root():
    """
    Health check or root endpoint.
    """
    return {"status": "ok", "message": "DeepInsight API is running"}
