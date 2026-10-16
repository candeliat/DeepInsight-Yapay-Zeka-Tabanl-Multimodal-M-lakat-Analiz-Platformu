"use client";

import { useEffect } from "react";
import Link from "next/link";
import { UserCircle, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/ui/NotificationBell";

export default function Topbar() {
  const { user, initialize, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Profil yüklenene kadar ad yerine iskelet gösterilir ("Ziyaretçi" yanıp sönmesin).
  const displayName = user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`.trim()
    : user?.email ?? null;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        {user && <NotificationBell />}
        <Link href="/profile" className="flex items-center gap-2 hover:bg-muted p-2 rounded-xl transition-colors" title="Profil">
          <UserCircle className="w-6 h-6 text-foreground" />
          {displayName ? (
            <span className="text-sm font-medium text-foreground">{displayName}</span>
          ) : (
            <span className="w-24 h-4 rounded bg-muted animate-pulse" aria-hidden />
          )}
        </Link>
        <button
          onClick={handleLogout}
          className="p-2 text-destructive hover:bg-destructive/10 rounded-full transition-colors"
          title="Çıkış yap"
          aria-label="Çıkış yap"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
