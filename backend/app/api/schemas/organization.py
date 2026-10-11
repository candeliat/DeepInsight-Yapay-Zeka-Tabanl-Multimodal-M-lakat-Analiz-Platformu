from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

OrgRole = Literal["org_admin", "instructor", "candidate"]


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    admin_email: Optional[EmailStr] = None  # verilirse bu kullanıcı org_admin olur


class JoinOrganizationRequest(BaseModel):
    invite_code: str = Field(min_length=4, max_length=64)


class OrganizationItem(BaseModel):
    id: str
    name: str
    created_at: Optional[str] = None


class MyOrganizationItem(OrganizationItem):
    role: OrgRole
    share_progress: bool = False


class Rubric(BaseModel):
    """Kurum skorlarında metrik ağırlıkları (yüzde, toplam 100)."""
    technical: int = Field(ge=0, le=100)
    confidence: int = Field(ge=0, le=100)
    vocabulary: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def _sum_100(self):
        if self.technical + self.confidence + self.vocabulary != 100:
            raise ValueError("Rubrik ağırlıklarının toplamı 100 olmalı.")
        return self


class OrganizationDetail(OrganizationItem):
    invite_code: str
    monthly_interview_quota: Optional[int] = None
    rubric: Optional[Rubric] = None


class MemberItem(BaseModel):
    user_id: str
    role: OrgRole
    created_at: Optional[str] = None


class UpdateMemberRoleRequest(BaseModel):
    role: OrgRole


class MemberDetail(BaseModel):
    user_id: str
    role: OrgRole
    created_at: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    share_progress: bool = False
    group_id: Optional[str] = None
    interview_count: int = 0
    last_interview_at: Optional[str] = None
    average: Optional[float] = None  # yalnızca share_progress=True ise dolu


class SharingRequest(BaseModel):
    share_progress: bool


class OrganizationSettingsUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    monthly_interview_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    clear_quota: bool = False  # True -> kota kaldırılır (sınırsız)
    rubric: Optional[Rubric] = None
    clear_rubric: bool = False  # True -> eşit ağırlığa döner


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class GroupItem(BaseModel):
    id: str
    name: str
    created_at: Optional[str] = None
    member_count: int = 0


class MemberGroupRequest(BaseModel):
    group_id: Optional[str] = None  # null -> grupsuz


class InviteRow(BaseModel):
    email: str = Field(max_length=320)
    group: Optional[str] = Field(default=None, max_length=60)


class BulkInviteRequest(BaseModel):
    rows: List[InviteRow] = Field(min_length=1, max_length=2000)
    role: Literal["instructor", "candidate"] = "candidate"
    group_id: Optional[str] = None  # satırda grup adı yoksa kullanılacak grup


class BulkInviteResult(BaseModel):
    invited: int
    already_member: List[str]
    invalid: List[str]
    truncated: int = 0


class OrgInviteItem(BaseModel):
    id: str
    email: str
    role: str
    group_id: Optional[str] = None
    created_at: Optional[str] = None


class MyInviteItem(BaseModel):
    id: str
    org_id: str
    org_name: Optional[str] = None
    role: str
    created_at: Optional[str] = None
