import { Platform } from 'react-native';
import { api, call } from '../config/api';

export type FeedbackKind = 'bug' | 'feature';
export type FeedbackStatus = 'new' | 'triaged' | 'planned' | 'resolved' | 'rejected';

export const KIND_LABEL: Record<FeedbackKind, string> = { bug: 'Hata bildirimi', feature: 'Özellik önerisi' };
export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'Yeni', triaged: 'İnceleniyor', planned: 'Planlandı', resolved: 'Çözüldü', rejected: 'Reddedildi',
};

export interface MyFeedback {
  id: string;
  kind: FeedbackKind;
  title: string;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string | null;
}

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
  /** Web'de seçilen dosyanın kendisi. */
  file?: File;
}

export const feedbackService = {
  send(payload: { kind: FeedbackKind; title: string; description: string; page?: string; screenshot?: PickedImage | null }) {
    const form = new FormData();
    form.append('kind', payload.kind);
    form.append('title', payload.title);
    form.append('description', payload.description);
    form.append('platform', 'mobile');
    if (payload.page) form.append('page', payload.page);
    const s = payload.screenshot;
    if (s) {
      if (Platform.OS === 'web' && s.file) form.append('screenshot', s.file);
      else form.append('screenshot', { uri: s.uri, name: s.name, type: s.mimeType } as unknown as Blob);
    }
    return call<{ id: string; status: FeedbackStatus }>(api.post('/api/v1/feedback', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
  mine: () => call<MyFeedback[]>(api.get('/api/v1/feedback/me')),
};
