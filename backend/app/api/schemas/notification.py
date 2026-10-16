from typing import List, Literal, Optional

from pydantic import BaseModel, Field

NotificationKind = Literal["assignment_new", "assignment_due_soon", "assignment_overdue", "assignment_reminder"]


class NotificationItem(BaseModel):
    id: str
    kind: NotificationKind
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    assignment_id: Optional[str] = None
    read_at: Optional[str] = None
    created_at: Optional[str] = None


class NotificationList(BaseModel):
    items: List[NotificationItem]
    unread_count: int = 0


class MarkReadRequest(BaseModel):
    # Boşsa tüm okunmamışlar okundu sayılır.
    ids: Optional[List[str]] = Field(default=None, max_length=100)


class ReminderResult(BaseModel):
    sent: int
    last_reminded_at: str
    next_available_at: str
