from pydantic import BaseModel, Field, field_validator
from typing import List, Optional

_VALID_DIFFICULTIES = {"JUNIOR", "ORTA", "UZMAN"}


class QuestionBankCreate(BaseModel):
    role: str = Field(min_length=2, max_length=80)
    topic: str = Field(min_length=2, max_length=120)
    difficulty: Optional[str] = None
    question_text: str = Field(min_length=10, max_length=2000)
    tags: List[str] = []
    # Var olan bir aileye varyant eklemek için mevcut family_id'yi geçin;
    # yepyeni bir aile başlatmak için new_family=True verin (backend yeni bir
    # uuid üretip döner — sonraki varyantları aynı aileye eklemek için o
    # id'yi kullanın). İkisi de verilmezse soru bağımsız (ailesiz) kalır.
    family_id: Optional[str] = None
    new_family: bool = False

    @field_validator("difficulty")
    @classmethod
    def _validate_difficulty(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        v = v.strip().upper()
        if v not in _VALID_DIFFICULTIES:
            raise ValueError("difficulty JUNIOR, ORTA veya UZMAN olmalı")
        return v

    @field_validator("role", "topic", "question_text")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class QuestionBankUpdate(BaseModel):
    role: Optional[str] = None
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    question_text: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None

    @field_validator("difficulty")
    @classmethod
    def _validate_difficulty(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        v = v.strip().upper()
        if v not in _VALID_DIFFICULTIES:
            raise ValueError("difficulty JUNIOR, ORTA veya UZMAN olmalı")
        return v


class QuestionBankItem(BaseModel):
    id: str
    role: str
    topic: str
    difficulty: Optional[str] = None
    question_text: str
    tags: List[str] = []
    family_id: Optional[str] = None
    times_served: int = 0
    is_active: bool = True
    created_at: Optional[str] = None


class QuestionBankGapItem(BaseModel):
    id: str
    role: str
    topic: str
    difficulty: Optional[str] = None
    miss_count: int
    last_missing_count: int
    last_seen_at: Optional[str] = None
