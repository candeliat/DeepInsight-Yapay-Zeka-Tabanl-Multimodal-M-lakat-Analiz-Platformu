"use client";

import { useEffect } from "react";
import { Bell, UserCircle, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";

export default function Topbar() {
  const { user, initialize, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const displayName = user?.user_metadata?.first_name 
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}` 
    : (user?.email || "Ziyaretçi");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <div className="flex-1">
        {/* Arama çubuğu vs. buraya eklenebilir */}
      </div>
      <div className="flex items-center gap-4">
        <button
          disabled
          aria-label="Bildirimler (yakında)"
          title="Bildirimler (yakında)"
          className="p-2 text-muted-foreground/50 rounded-full cursor-not-allowed"
        >
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded-xl transition-colors">
          <UserCircle className="w-6 h-6 text-foreground" />
          <span className="text-sm font-medium text-foreground">{displayName}</span>
        </div>
        <button onClick={handleLogout} className="p-2 text-destructive hover:bg-destructive/10 rounded-full transition-colors ml-2" title="Çıkış Yap">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
