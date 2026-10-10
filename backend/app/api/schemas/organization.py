from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

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


class OrganizationDetail(OrganizationItem):
    invite_code: str
    monthly_interview_quota: Optional[int] = None


class MemberItem(BaseModel):
    user_id: str
    role: OrgRole
    created_at: Optional[str] = None


class UpdateMemberRoleRequest(BaseModel):
    role: OrgRole
