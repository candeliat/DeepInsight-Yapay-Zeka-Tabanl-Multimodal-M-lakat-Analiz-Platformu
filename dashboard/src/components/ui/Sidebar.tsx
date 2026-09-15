"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Video, User, MessageSquare, MessageCircle } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

const candidateLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/interviews", label: "Mülakatlarım", icon: Video },
  { href: "/chat", label: "AI Danışman", icon: MessageSquare },
  { href: "/chat/text", label: "Yazılı Mülakat", icon: MessageCircle },
  { href: "/profile", label: "Profil", icon: User },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const displayName = user?.user_metadata?.first_name || "Aday";

  return (
    <aside className="w-64 bg-card border-r border-border h-screen flex flex-col">
      <div className="p-6">
        <h1 className="font-serif italic text-2xl text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-sans not-italic text-sm font-bold">
            DI
          </div>
          DeepInsight
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        <div>
          <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {displayName} Paneli
          </p>
          <div className="space-y-1">
            {candidateLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
