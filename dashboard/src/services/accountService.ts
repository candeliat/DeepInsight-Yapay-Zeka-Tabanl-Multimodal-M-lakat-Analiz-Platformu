import { api } from "../lib/api";
import { extractErrorMessage } from "../lib/apiError";

export interface ConsentStatus {
  consent_type: string;
  version: string;
  text: string;
  granted: boolean;
}

export const accountService = {
  async getConsent(type: "video_analysis"): Promise<ConsentStatus> {
    try {
      return (await api.get<ConsentStatus>(`/api/v1/account/consents/${type}`)).data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async setConsent(type: "video_analysis", granted: boolean): Promise<ConsentStatus> {
    try {
      return (await api.put<ConsentStatus>(`/api/v1/account/consents/${type}`, { granted })).data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async updateProfile(payload: { first_name?: string; last_name?: string; target?: string }) {
    try {
      return (await api.patch("/api/v1/users/me", payload)).data;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await api.post("/api/v1/auth/change-password", { current_password: currentPassword, new_password: newPassword });
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error));
    }
  },

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
