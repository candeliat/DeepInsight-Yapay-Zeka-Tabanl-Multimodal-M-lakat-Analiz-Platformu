import { api } from "../lib/api";
import { call } from "../lib/apiError";

export type NotificationKind = "assignment_new" | "assignment_due_soon" | "assignment_overdue" | "assignment_reminder";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  assignment_id: string | null;
  read_at: string | null;
  created_at: string | null;
}

export interface NotificationList {
  items: AppNotification[];
  unread_count: number;
}

export interface ReminderResult {
  sent: number;
  last_reminded_at: string;
  next_available_at: string;
}

export const notificationService = {
  mine: () => call<NotificationList>(api.get("/api/v1/notifications/me")),
  /** ids verilmezse tüm okunmamışlar okundu sayılır. */
  markRead: (ids?: string[]) => call<{ updated: number }>(api.post("/api/v1/notifications/read", { ids })),
  remind: (orgId: string, assignmentId: string) =>
    call<ReminderResult>(api.post(`/api/v1/organizations/${orgId}/assignments/${assignmentId}/remind`)),
};
