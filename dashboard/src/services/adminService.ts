import { api } from "../lib/api";
import { call } from "../lib/apiError";
import type { OrgUsage } from "./orgService";

export interface AdminOverview {
  month: string;
  users: number | null;
  organizations: number | null;
  interviews_total: number | null;
  interviews_completed: number | null;
  interviews_month: number | null;
  cvs: number | null;
  job_postings: number | null;
}

export interface AdminUsage extends OrgUsage {
  active_users: number;
  by_feature: { feature: string; calls: number; failed: number; total_tokens: number; avg_latency_ms: number | null; purposes: string[] }[];
  by_org: { org_id: string | null; name: string; calls: number; total_tokens: number; users: number; estimated_cost_usd: number | null }[];
}

export interface AiInventory {
  llm: {
    provider: string;
    chain: {
      order: number;
      model: string;
      json_mode: boolean;
      circuit_open: boolean;
      reopens_in_s: number | null;
      since_start: { attempts: number; successes: number; failures: number; total_tokens: number } | null;
    }[];
    paid_fallback_enabled: boolean;
    attempt_timeout_s: number;
    json_attempt_timeout_s: number;
    purposes: { purpose: string; feature: string; where: string }[];
    prices_configured: boolean;
  };
  components: { id: string; name: string; model: string; runs: string; kind: string; used_for: string[]; loaded?: boolean }[];
  note: string;
}

export const adminService = {
  overview: () => call<AdminOverview>(api.get("/api/v1/admin/overview")),
  usage: (month?: string) => call<AdminUsage>(api.get("/api/v1/admin/ai-usage", { params: { month } })),
  inventory: () => call<AiInventory>(api.get("/api/v1/admin/ai-inventory")),
};
