from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import interview, auth, users, analytics, question_bank_admin

app = FastAPI(
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
)

# Include the interview router
app.include_router(interview.router, prefix="/api/v1/interview", tags=["Interview"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(question_bank_admin.router, prefix="/api/v1/question-bank", tags=["Question Bank Admin"])

@app.get("/")
def root():
    """
    Health check or root endpoint.
    """
    return {"status": "ok", "message": "DeepInsight API is running"}
