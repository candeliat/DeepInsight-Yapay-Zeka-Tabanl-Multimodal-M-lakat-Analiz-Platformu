import { api } from "../lib/api";
import { call } from "../lib/apiError";
import { Progress, TopicStat } from "./progressService";
import type { CreateQuestionPayload, QuestionBankItem, UpdateQuestionPayload } from "./questionBankService";

export type OrgRole = "org_admin" | "instructor" | "candidate";

export const ROLE_LABEL: Record<OrgRole, string> = {
  org_admin: "Kurum yöneticisi",
  instructor: "Eğitmen",
  candidate: "Öğrenci",
};

export interface MyOrganization {
  id: string;
  name: string;
  created_at: string | null;
  role: OrgRole;
  share_progress: boolean;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  created_at: string | null;
  invite_code: string;
  monthly_interview_quota: number | null;
  rubric: Rubric | null;
}

/** Kurum skorlarında metrik ağırlıkları (yüzde, toplam 100). null = eşit ağırlık. */
export interface Rubric {
  technical: number;
  confidence: number;
  vocabulary: number;
}

export interface OrgGroup {
  id: string;
  name: string;
  created_at: string | null;
  member_count: number;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  group_id: string | null;
  created_at: string | null;
}

export interface MyInvite {
  id: string;
  org_id: string;
  org_name: string | null;
  role: OrgRole;
  created_at: string | null;
}

export interface BulkInviteResult {
  invited: number;
  already_member: string[];
  invalid: string[];
  truncated: number;
}

export interface MemberDetail {
  user_id: string;
  role: OrgRole;
  created_at: string | null;
  email: string | null;
  name: string | null;
  share_progress: boolean;
  group_id: string | null;
  interview_count: number;
  last_interview_at: string | null;
  /** Yalnızca öğrenci paylaşım rızası verdiyse dolu. */
  average: number | null;
}

export interface OrgOverview {
  org: { id: string; name: string; monthly_interview_quota: number | null; rubric: Rubric | null };
  member_counts: Partial<Record<OrgRole, number>>;
  completed_count: number;
  contributors: number;
  active_students_30d: number;
  month_interviews: number;
  min_cohort: number;
  /** Toplu istatistikler yalnızca en az min_cohort öğrenci katkı verdiyse gelir. */
  aggregates_available: boolean;
  metric_means: Partial<Record<"technical" | "confidence" | "vocabulary" | "average", number | null>>;
  weekly: { week: string; count: number; average: number | null }[];
  topics: TopicStat[];
}

export const orgService = {
  myOrganizations: () => call<MyOrganization[]>(api.get("/api/v1/organizations/me")),
  join: (inviteCode: string) => call<{ id: string; name: string }>(api.post("/api/v1/organizations/join", { invite_code: inviteCode })),
  /** Yalnızca platform yöneticisi. adminEmail verilirse o kişi kurum yöneticisi olur. */
  create: (name: string, adminEmail?: string) =>
    call<OrganizationDetail>(api.post("/api/v1/organizations", { name, admin_email: adminEmail || undefined })),
  setSharing: (orgId: string, share: boolean) =>
    call<{ share_progress: boolean }>(api.put(`/api/v1/organizations/${orgId}/me/sharing`, { share_progress: share })),

  get: (orgId: string) => call<OrganizationDetail>(api.get(`/api/v1/organizations/${orgId}`)),
  overview: (orgId: string, groupId?: string) =>
    call<OrgOverview>(api.get(`/api/v1/organizations/${orgId}/overview`, { params: { group_id: groupId || undefined } })),
  members: (orgId: string, groupId?: string) =>
    call<MemberDetail[]>(api.get(`/api/v1/organizations/${orgId}/members`, { params: { group_id: groupId || undefined } })),
  memberProgress: (orgId: string, userId: string) =>
    call<Progress>(api.get(`/api/v1/organizations/${orgId}/members/${userId}/progress`)),
  updateMemberRole: (orgId: string, userId: string, role: OrgRole) =>
    call<{ user_id: string; role: OrgRole }>(api.patch(`/api/v1/organizations/${orgId}/members/${userId}`, { role })),
  removeMember: (orgId: string, userId: string) => call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/members/${userId}`)),
  rotateInviteCode: (orgId: string) => call<{ invite_code: string }>(api.post(`/api/v1/organizations/${orgId}/invite-code/rotate`)),
  updateSettings: (
    orgId: string,
    payload: { name?: string; monthly_interview_quota?: number; clear_quota?: boolean; rubric?: Rubric; clear_rubric?: boolean },
  ) => call<OrganizationDetail>(api.patch(`/api/v1/organizations/${orgId}`, payload)),

  groups: (orgId: string) => call<OrgGroup[]>(api.get(`/api/v1/organizations/${orgId}/groups`)),
  createGroup: (orgId: string, name: string) => call<OrgGroup>(api.post(`/api/v1/organizations/${orgId}/groups`, { name })),
  deleteGroup: (orgId: string, groupId: string) => call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/groups/${groupId}`)),
  setMemberGroup: (orgId: string, userId: string, groupId: string | null) =>
    call<{ user_id: string; group_id: string | null }>(api.put(`/api/v1/organizations/${orgId}/members/${userId}/group`, { group_id: groupId })),

  invites: (orgId: string) => call<OrgInvite[]>(api.get(`/api/v1/organizations/${orgId}/invites`)),
  bulkInvite: (orgId: string, rows: { email: string; group?: string }[], role: "candidate" | "instructor", groupId?: string) =>
    call<BulkInviteResult>(api.post(`/api/v1/organizations/${orgId}/invites`, { rows, role, group_id: groupId || undefined })),
  deleteInvite: (orgId: string, inviteId: string) => call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/invites/${inviteId}`)),
  // Kuruma özel soru bankası: yalnızca bu kurumun mülakatlarında, global sorularla birlikte kullanılır.
  questions: (orgId: string) => call<QuestionBankItem[]>(api.get(`/api/v1/organizations/${orgId}/questions`)),
  createQuestion: (orgId: string, payload: CreateQuestionPayload) =>
    call<QuestionBankItem>(api.post(`/api/v1/organizations/${orgId}/questions`, payload)),
  updateQuestion: (orgId: string, questionId: string, payload: UpdateQuestionPayload) =>
    call<QuestionBankItem>(api.patch(`/api/v1/organizations/${orgId}/questions/${questionId}`, payload)),
  deleteQuestion: (orgId: string, questionId: string) =>
    call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/questions/${questionId}`)),
  myInvites: () => call<MyInvite[]>(api.get("/api/v1/organizations/invites/me")),
  respondInvite: (inviteId: string, accept: boolean) =>
    call<{ org_id: string; accepted: boolean }>(api.post(`/api/v1/organizations/invites/${inviteId}/${accept ? "accept" : "decline"}`)),

  /** CSV'yi yetkili istekle indirir ve tarayıcıya dosya olarak kaydettirir. */
  async downloadCsv(path: string, filename: string, params?: Record<string, string | undefined>): Promise<void> {
    const blob = await call<Blob>(api.get(`/api/v1/organizations/${path}`, { params, responseType: "blob" }));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

/**
 * CSV metninden e-posta/grup satırları çıkarır. Başlık satırı ("email", "e-posta",
 * "grup") varsa sütunlar ona göre bulunur; yoksa ilk sütun e-posta, ikinci sütun grup.
 * Ayırıcı ',' ya da ';' (Türkçe Excel) olabilir.
 */
export function parseInviteCsv(text: string): { email: string; group?: string }[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) => line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]).map((h) => h.toLocaleLowerCase("tr"));
  const hasHeader = head.some((h) => ["email", "e-posta", "eposta", "mail"].includes(h));
  const emailCol = hasHeader ? head.findIndex((h) => ["email", "e-posta", "eposta", "mail"].includes(h)) : 0;
  const groupCol = hasHeader ? head.findIndex((h) => ["grup", "group", "sınıf", "şube"].includes(h)) : 1;
  return (hasHeader ? lines.slice(1) : lines)
    .map(split)
    .map((cells) => ({ email: cells[emailCol] ?? "", group: groupCol >= 0 ? cells[groupCol] || undefined : undefined }))
    .filter((r) => r.email);
}
