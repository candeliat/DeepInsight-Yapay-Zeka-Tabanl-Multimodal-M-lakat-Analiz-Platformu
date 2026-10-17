import { api } from "../lib/api";
import { call } from "../lib/apiError";

export type FeedbackKind = "bug" | "feature";
export type FeedbackStatus = "new" | "triaged" | "planned" | "resolved" | "rejected";

export const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Hata bildirimi",
  feature: "Özellik önerisi",
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Yeni",
  triaged: "İnceleniyor",
  planned: "Planlandı",
  resolved: "Çözüldü",
  rejected: "Reddedildi",
};

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export interface MyFeedback {
  id: string;
  kind: FeedbackKind;
  title: string;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string | null;
}

export interface AdminFeedback extends MyFeedback {
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  description: string;
  page: string | null;
  platform: "web" | "mobile" | null;
  user_agent: string | null;
  screenshot_url: string | null;
  has_screenshot: boolean;
  updated_at: string | null;
}

export const feedbackService = {
  send: (payload: { kind: FeedbackKind; title: string; description: string; page?: string; screenshot?: File | null }) => {
    const form = new FormData();
    form.append("kind", payload.kind);
    form.append("title", payload.title);
    form.append("description", payload.description);
    form.append("platform", "web");
    if (payload.page) form.append("page", payload.page);
    if (payload.screenshot) form.append("screenshot", payload.screenshot);
    // api örneğinin varsayılanı JSON: başlık verilmezse axios FormData'yı JSON'a çevirir ve dosya kaybolur.
    return call<{ id: string; status: FeedbackStatus }>(
      api.post("/api/v1/feedback", form, { headers: { "Content-Type": "multipart/form-data" } }),
    );
  },
  mine: () => call<MyFeedback[]>(api.get("/api/v1/feedback/me")),
  adminList: (filters: { kind?: FeedbackKind; status?: FeedbackStatus }) =>
    call<AdminFeedback[]>(api.get("/api/v1/admin/feedback", { params: filters })),
  adminUpdate: (id: string, payload: { status?: FeedbackStatus; admin_note?: string }) =>
    call<{ id: string; status: FeedbackStatus; admin_note: string | null }>(api.patch(`/api/v1/admin/feedback/${id}`, payload)),
};
