/**
 * Uygulama genelinde TEK skor ölçeği (web ve mobilde aynı eşikler — mobile/src/utils/scoreBand.ts).
 * Önceden her ekran kendi eşiğini ve kelimesini kullanıyordu (72 bir yerde
 * "Geliştirilmeli", bir yerde "Tebrikler"; 62 bir yerde "İyi"). Eşik 60, gelişim
 * raporundaki "zayıf konu" eşiğiyle (backend progress_service.WEAK_TOPIC_THRESHOLD) aynıdır.
 */
export type ScoreTone = "good" | "mid" | "low";

export interface ScoreBand {
  label: string;
  tone: ScoreTone;
}

export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score >= 80) return { label: "Güçlü", tone: "good" };
  if (score >= 60) return { label: "Gelişiyor", tone: "mid" };
  return { label: "Geliştirilmeli", tone: "low" };
}

/** Badge bileşeninin variant'ı ile eşleşme. */
export const BAND_BADGE: Record<ScoreTone, "success" | "warning" | "destructive"> = {
  good: "success",
  mid: "warning",
  low: "destructive",
};

/** Türkçe sayı biçimi (52,5) — İngilizce "52.5" yerine. */
export function formatScore(value: number | null | undefined, digits = 0): string {
  if (value == null) return "—";
  return value.toLocaleString("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
