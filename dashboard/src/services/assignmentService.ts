import { api } from "../lib/api";
import { call } from "../lib/apiError";

export type AssignmentStatus = "not_started" | "in_progress" | "completed";

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: "Başlamadı",
  in_progress: "Devam ediyor",
  completed: "Tamamlandı",
};

export interface Assignment {
  id: string;
  org_id: string;
  title: string;
  role: string;
  topic: string;
  difficulty: "JUNIOR" | "ORTA" | "UZMAN" | null;
  instructions: string | null;
  due_at: string | null;
  /** Doluysa ödev yalnızca bu grubun öğrencilerine atanmıştır. */
  group_id: string | null;
  created_at: string | null;
}

export interface OrgAssignment extends Assignment {
  total_candidates: number;
  completed_count: number;
  in_progress_count: number;
}

export interface AssignmentStudentRow {
  user_id: string;
  email: string | null;
  name: string | null;
  status: AssignmentStatus;
  completed_at: string | null;
  share_progress: boolean;
  /** Yalnızca öğrenci paylaşım rızası verdiyse dolu. */
  score: number | null;
}

export interface MyAssignment extends Assignment {
  org_name: string | null;
  status: AssignmentStatus;
  my_score: number | null;
  interview_id: string | null;
  overdue: boolean;
}

export interface AssignmentCreatePayload {
  title: string;
  role: string;
  topic: string;
  difficulty?: string;
  instructions?: string;
  due_at?: string;
  group_id?: string;
}

export const assignmentService = {
  mine: () => call<MyAssignment[]>(api.get("/api/v1/assignments/me")),
  list: (orgId: string) => call<OrgAssignment[]>(api.get(`/api/v1/organizations/${orgId}/assignments`)),
  create: (orgId: string, payload: AssignmentCreatePayload) =>
    call<OrgAssignment>(api.post(`/api/v1/organizations/${orgId}/assignments`, payload)),
  students: (orgId: string, assignmentId: string) =>
    call<AssignmentStudentRow[]>(api.get(`/api/v1/organizations/${orgId}/assignments/${assignmentId}/students`)),
  remove: (orgId: string, assignmentId: string) =>
    call<{ status: string }>(api.delete(`/api/v1/organizations/${orgId}/assignments/${assignmentId}`)),
};
