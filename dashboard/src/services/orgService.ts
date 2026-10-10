import { api } from "../lib/api";
import { Progress, TopicStat } from "./progressService";

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
}

export interface MemberDetail {
  user_id: string;
  role: OrgRole;
  created_at: string | null;
  email: string | null;
  name: string | null;
  share_progress: boolean;
  interview_count: number;
  last_interview_at: string | null;
  /** Yalnızca öğrenci paylaşım rızası verdiyse dolu. */
  average: number | null;
}

export interface OrgOverview {
  org: { id: string; name: string; monthly_interview_quota: number | null };
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

function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return e.message ?? "Bilinmeyen bir hata oluştu.";
}

async function call<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error: unknown) {
    throw new Error(extractErrorMessage(error));
  }
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
  overview: (orgId: string) => call<OrgOverview>(api.get(`/api/v1/organizations/${orgId}/overview`)),
  members: (orgId: string) => call<MemberDetail[]>(api.get(`/api/v1/organizations/${orgId}/members`)),
  memberProgress: (orgId: string, userId: string) =>
    call<Progress>(api.get(`/api/v1/organizations/${orgId}/members/${userId}/progress`)),
  updateMemberRole: (orgId: string, userId: string, role: OrgRole) =>
    call<{ user_id: string; role: OrgRole }>(api.patch(`/api/v1/organizations/${orgId}/members/${userId}`, { role })),
  removeMember: (orgId: string, userId: string) => call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/members/${userId}`)),
  rotateInviteCode: (orgId: string) => call<{ invite_code: string }>(api.post(`/api/v1/organizations/${orgId}/invite-code/rotate`)),
  updateSettings: (orgId: string, payload: { name?: string; monthly_interview_quota?: number; clear_quota?: boolean }) =>
    call<OrganizationDetail>(api.patch(`/api/v1/organizations/${orgId}`, payload)),
};
