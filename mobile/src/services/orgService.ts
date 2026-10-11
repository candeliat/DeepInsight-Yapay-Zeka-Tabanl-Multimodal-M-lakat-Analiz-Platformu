/**
 * Öğrenci tarafı kurum servisleri (kurumlar, davetler, paylaşım rızası, ödevler),
 * pilot çalışma ve KVKK veri hakları. Eğitmen/kurum yöneticisi paneli mobilde yoktur
 * (masaüstü işi) — yalnızca adayın kullandığı uç noktalar.
 */
import { api, call } from '../config/api';
import { downloadAndShare } from '../utils/download';

export type OrgRole = 'org_admin' | 'instructor' | 'candidate';

export const ROLE_LABEL: Record<OrgRole, string> = {
  org_admin: 'Kurum yöneticisi',
  instructor: 'Eğitmen',
  candidate: 'Öğrenci',
};

export interface MyOrganization {
  id: string;
  name: string;
  created_at: string | null;
  role: OrgRole;
  share_progress: boolean;
}

export interface MyInvite {
  id: string;
  org_id: string;
  org_name: string | null;
  role: OrgRole;
  created_at: string | null;
}

export const orgService = {
  myOrganizations: () => call<MyOrganization[]>(api.get('/api/v1/organizations/me')),
  join: (inviteCode: string) => call<{ id: string; name: string }>(api.post('/api/v1/organizations/join', { invite_code: inviteCode })),
  setSharing: (orgId: string, share: boolean) =>
    call<{ share_progress: boolean }>(api.put(`/api/v1/organizations/${orgId}/me/sharing`, { share_progress: share })),
  myInvites: () => call<MyInvite[]>(api.get('/api/v1/organizations/invites/me')),
  respondInvite: (inviteId: string, accept: boolean) =>
    call<{ org_id: string; accepted: boolean }>(api.post(`/api/v1/organizations/invites/${inviteId}/${accept ? 'accept' : 'decline'}`)),
};

// --- Ödevler ---

export type AssignmentStatus = 'not_started' | 'in_progress' | 'completed';

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  not_started: 'Başlamadı',
  in_progress: 'Devam ediyor',
  completed: 'Tamamlandı',
};

export interface MyAssignment {
  id: string;
  org_id: string;
  org_name: string | null;
  title: string;
  role: string;
  topic: string;
  difficulty: 'JUNIOR' | 'ORTA' | 'UZMAN' | null;
  instructions: string | null;
  due_at: string | null;
  group_id: string | null;
  created_at: string | null;
  status: AssignmentStatus;
  my_score: number | null;
  interview_id: string | null;
  overdue: boolean;
}

export const assignmentService = {
  mine: () => call<MyAssignment[]>(api.get('/api/v1/assignments/me')),
};

// --- Pilot ---

export type PostItemKey = 'useful' | 'realistic' | 'feedback_clear';

export interface PilotStatus {
  consent: boolean;
  consent_text: string;
  consent_version: string;
  sus_items: string[];
  post_items: { key: PostItemKey; label: string }[];
  completed_interviews: number;
  sus_score: number | null;
  pending_surveys: { id: string; role: string | null; topic: string | null; created_at: string | null }[];
}

export const pilotService = {
  status: () => call<PilotStatus>(api.get('/api/v1/pilot/me')),
  setConsent: (granted: boolean) => call<{ consent: boolean }>(api.put('/api/v1/pilot/me/consent', { granted })),
  submitPostInterview: (interviewId: string, answers: Record<PostItemKey, number>, comment?: string) =>
    call<{ status: string }>(api.post('/api/v1/pilot/surveys/post-interview', { interview_id: interviewId, answers, comment: comment || undefined })),
  submitSus: (answers: number[]) => call<{ score: number; grade: string }>(api.post('/api/v1/pilot/surveys/sus', { answers })),
};

// --- KVKK veri hakları ---

export interface AccountConsent {
  consent_type: string;
  version: string;
  text: string;
  granted: boolean;
}

export const accountService = {
  /** Video analizi onamı: kayıt sunucuya yüklenmeden önce alınır, Profil'den geri çekilebilir. */
  getVideoConsent: () => call<AccountConsent>(api.get('/api/v1/account/consents/video_analysis')),
  setVideoConsent: (granted: boolean) =>
    call<AccountConsent>(api.put('/api/v1/account/consents/video_analysis', { granted })),
  updateProfile: (payload: { first_name?: string; last_name?: string; target?: string }) =>
    call<unknown>(api.patch('/api/v1/users/me', payload)),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<unknown>(api.post('/api/v1/auth/change-password', { current_password: currentPassword, new_password: newPassword })),
  /** Tüm verileri JSON olarak indirir ve paylaşım sayfasını açar. */
  exportMyData: () => downloadAndShare('/api/v1/account/export', 'deepinsight-verilerim.json', 'application/json'),
  /** Hesabı ve tüm kişisel veriyi kalıcı olarak siler (onay: kendi e-postası). */
  deleteAccount: (confirmEmail: string) => call<{ status: string }>(api.delete('/api/v1/account', { data: { confirm_email: confirmEmail } })),
};
