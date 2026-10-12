/**
 * Backend hata yanıtından kullanıcıya gösterilecek Türkçe mesaj.
 * Servislerin hepsi bunu kullanır (önceden her serviste ayrı kopya vardı ve ayrışmışlardı).
 */
export function extractErrorMessage(error: unknown, fallback = "Bilinmeyen bir hata oluştu."): string {
  const e = error as { isAxiosError?: boolean; response?: { status?: number; data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  // FastAPI doğrulama hatası (422): [{ loc, msg, type }, ...]
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (e?.isAxiosError) {
    // axios'un kendi metinleri İngilizce ("Network Error", "Request failed with status code 500").
    if (!e.response) return "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.";
    return e.response.status && e.response.status >= 500
      ? "Sunucuda bir sorun oluştu. Biraz sonra tekrar deneyin."
      : fallback;
  }
  return (error instanceof Error && error.message) || fallback;
}

/** İsteği bekler ve gövdeyi döner; hata olursa kullanıcıya gösterilebilir mesajlı Error fırlatır. */
export async function call<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error: unknown) {
    throw new Error(extractErrorMessage(error));
  }
}
