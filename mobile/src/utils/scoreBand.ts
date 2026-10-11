/**
 * Uygulama genelinde TEK skor ölçeği — web ile aynı eşikler (dashboard/src/lib/scoreBand.ts).
 * Eşik 60, gelişim raporundaki "zayıf konu" eşiğiyle aynıdır.
 */
import { Colors } from '../constants/Colors';

export type ScoreTone = 'good' | 'mid' | 'low';

export interface ScoreBand {
  label: string;
  tone: ScoreTone;
  color: string;
}

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 80) return { label: 'Güçlü', tone: 'good', color: '#047857' };
  if (score >= 60) return { label: 'Gelişiyor', tone: 'mid', color: '#b45309' };
  return { label: 'Geliştirilmeli', tone: 'low', color: Colors.error };
}
