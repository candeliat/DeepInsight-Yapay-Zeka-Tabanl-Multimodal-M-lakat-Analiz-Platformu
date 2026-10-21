"use client";

import { useEffect } from "react";
import Link from "next/link";
import { UserCircle, LogOut, Menu } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavStore } from "@/store/useNavStore";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/ui/NotificationBell";

export default function Topbar() {
  const { user, initialize, logout } = useAuthStore();
  const router = useRouter();
  const { open, setOpen } = useNavStore();

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
    <header className="h-16 bg-card border-b border-border flex items-center justify-between gap-2 px-3 sm:px-6">
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden p-2 rounded-xl hover:bg-muted"
        aria-label="Menü"
        aria-expanded={open}
        aria-controls="main-sidebar"
      >
        <Menu className="w-6 h-6 text-foreground" />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {user && <NotificationBell />}
        <Link href="/profile" className="flex items-center gap-2 hover:bg-muted p-2 rounded-xl transition-colors min-w-0" title="Profil">
          <UserCircle className="w-6 h-6 text-foreground shrink-0" />
          {/* Dar ekranda ad gizlenir (üst çubuk taşmasın); bağlantının adı yine okunur. */}
          {displayName ? (
            <>
              <span className="hidden sm:inline text-sm font-medium text-foreground truncate max-w-[16rem]">{displayName}</span>
              <span className="sr-only sm:hidden">Profil</span>
            </>
          ) : (
            <span className="w-24 h-4 rounded bg-muted animate-pulse hidden sm:block" aria-hidden />
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
