import { api } from "../lib/api";

function extractErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return e.message ?? "Bilinmeyen bir hata oluştu.";
}

export const accountService = {
  /** KVKK md. 11: hakkımdaki tüm verileri JSON dosyası olarak indir. */
  async downloadMyData(): Promise<void> {
    try {
      const { data } = await api.get<Blob>("/api/v1/account/export", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deepinsight-verilerim.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  /** Hesabı ve tüm kişisel veriyi kalıcı olarak siler. */
  async deleteAccount(confirmEmail: string): Promise<void> {
    try {
      await api.delete("/api/v1/account", { data: { confirm_email: confirmEmail } });
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },
};
