import asyncio
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator

from app.api.dependencies.auth import get_current_user, oauth2_scheme, require_admin
from app.api.schemas.user import UserProfile
from app.services import organization_service
from app.services import pilot_service as pilot

router = APIRouter()


class ConsentRequest(BaseModel):
    granted: bool


class PostInterviewSurvey(BaseModel):
    interview_id: str = Field(max_length=64)
    answers: Dict[str, int]
    comment: Optional[str] = Field(default=None, max_length=500)

    @field_validator("answers")
    @classmethod
    def _likert(cls, v: Dict[str, int]) -> Dict[str, int]:
        if set(v) != set(pilot.POST_ITEMS):
            raise ValueError(f"Yanıtlar şu maddeleri içermeli: {', '.join(pilot.POST_ITEMS)}")
        if any(a not in (1, 2, 3, 4, 5) for a in v.values()):
            raise ValueError("Her yanıt 1-5 arasında olmalı.")
        return v

    @field_validator("comment")
    @classmethod
    def _clean(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = " ".join(v.replace("<", " ").replace(">", " ").split())
        return v or None


class SusSurvey(BaseModel):
    answers: List[int] = Field(min_length=10, max_length=10)


@router.get("/me")
async def my_pilot_status(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    return await asyncio.to_thread(pilot.my_status, current_user.id)


@router.put("/me/consent")
async def set_pilot_consent(
    payload: ConsentRequest,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    """Araştırma onamı verir ya da geri çeker (geri çekilirse anket yanıtları silinir)."""
    granted = await asyncio.to_thread(pilot.set_consent, current_user.id, payload.granted)
    await organization_service.log_audit(current_user.id, None, "pilot.consent", "user", current_user.id, {"granted": granted})
    return {"consent": granted}


@router.post("/surveys/post-interview")
async def submit_post_interview_survey(
    payload: PostInterviewSurvey,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        await asyncio.to_thread(pilot.submit_post_interview, current_user.id, payload.interview_id, payload.answers, payload.comment)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "saved"}


@router.post("/surveys/sus")
async def submit_sus_survey(
    payload: SusSurvey,
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(get_current_user),
):
    try:
        score = await asyncio.to_thread(pilot.submit_sus, current_user.id, payload.answers)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"score": score, "grade": pilot.sus_grade(score)}


@router.get("/report")
async def pilot_report(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    """Kimliksiz pilot raporu (yalnızca platform yöneticisi)."""
    report = await asyncio.to_thread(pilot.fetch_report)
    await organization_service.log_audit(current_user.id, None, "pilot.report_view", "report", "pilot")
    return report


@router.get("/report.csv")
async def pilot_report_csv(
    token: str = Depends(oauth2_scheme),
    current_user: UserProfile = Depends(require_admin),
):
    report = await asyncio.to_thread(pilot.fetch_report)
    await organization_service.log_audit(current_user.id, None, "pilot.report_export", "report", "pilot")
    return Response(
        content=pilot.report_csv(report).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="pilot-raporu.csv"'},
    )
