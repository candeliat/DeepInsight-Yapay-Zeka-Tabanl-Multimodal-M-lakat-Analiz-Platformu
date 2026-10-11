"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Video, User, MessageCircle, Database, FileText, Briefcase, TrendingUp, Building2, ClipboardList,
  FlaskConical, History, LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

type NavLink = { href: string; label: string; icon: LucideIcon };

// Gruplu menü: 11 maddelik düz liste yerine "ne yapmak istiyorum?" sorusuna göre.
// "AI Danışman" adı bir sohbet asistanı izlenimi veriyordu; sayfa aslında kameralı/sesli mülakat.
const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Mülakat",
    links: [
      { href: "/chat/text", label: "Yazılı Mülakat", icon: MessageCircle },
      { href: "/chat", label: "Görüntülü Mülakat", icon: Video },
      { href: "/interviews", label: "Mülakatlarım", icon: History },
      { href: "/progress", label: "Gelişimim", icon: TrendingUp },
    ],
  },
  {
    title: "Kariyer",
    links: [
      { href: "/cv", label: "CV Analizi", icon: FileText },
      { href: "/jobs", label: "İlan Eşleştirme", icon: Briefcase },
    ],
  },
  {
    title: "Kurum",
    links: [
      { href: "/assignments", label: "Ödevlerim", icon: ClipboardList },
      { href: "/organizations", label: "Kurumlarım", icon: Building2 },
    ],
  },
  {
    title: "Hesap",
    links: [
      { href: "/pilot", label: "Pilot Çalışma", icon: FlaskConical },
      { href: "/profile", label: "Profil", icon: User },
    ],
  },
];

const ADMIN_GROUP = { title: "Yönetim", links: [{ href: "/question-bank", label: "Soru Bankası", icon: Database }] };

export default function Sidebar() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const isAdmin = user?.app_metadata?.role === "admin";
  const groups = isAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS;

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
    }`;

  return (
    <aside className="w-64 bg-card border-r border-border h-screen flex flex-col">
      <div className="p-6">
        <Link href="/dashboard" className="font-serif italic text-2xl text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-sans not-italic text-sm font-bold">
            DI
          </div>
          DeepInsight
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-6 space-y-5" aria-label="Ana menü">
        <Link href="/dashboard" className={linkClass(pathname === "/dashboard")} aria-current={pathname === "/dashboard" ? "page" : undefined}>
          <LayoutDashboard className={`w-5 h-5 ${pathname === "/dashboard" ? "text-primary" : "text-muted-foreground"}`} />
          Ana Sayfa
        </Link>
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group.title}</p>
            <div className="space-y-0.5">
              {group.links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== "/chat" && pathname.startsWith(`${link.href}/`));
                return (
                  <Link key={link.href} href={link.href} className={linkClass(isActive)} aria-current={isActive ? "page" : undefined}>
                    <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
