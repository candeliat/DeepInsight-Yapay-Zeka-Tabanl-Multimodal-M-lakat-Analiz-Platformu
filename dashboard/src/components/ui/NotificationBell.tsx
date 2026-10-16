"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, AlarmClock, ClipboardList, Megaphone, Loader2 } from "lucide-react";
import { AppNotification, NotificationKind, notificationService } from "@/services/notificationService";

const REFRESH_MS = 5 * 60 * 1000;

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  assignment_new: ClipboardList,
  assignment_due_soon: CalendarClock,
  assignment_overdue: AlarmClock,
  assignment_reminder: Megaphone,
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} sa önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Üst çubuktaki bildirim zili: ödev bildirimleri, okunmamış sayısı ve açılır liste. */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      notificationService
        .mine()
        .then((data) => {
          setItems(data.items);
          setUnread(data.unread_count);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Bildirimler yüklenemedi.")),
    [],
  );

  useEffect(() => {
    void load();
    const timer = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const markAll = async () => {
    try {
      await notificationService.markRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      setUnread(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşaretlenemedi.");
    }
  };

  const openItem = async (n: AppNotification) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationService.markRead([n.id]).catch(() => undefined);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const label = unread > 0 ? `Bildirimler (${unread} okunmamış)` : "Bildirimler";

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={toggle}
        className="relative p-2 rounded-full hover:bg-muted transition-colors text-foreground"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center tabular-nums" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-card border border-border rounded-2xl shadow-lg z-50 overflow-hidden" role="region" aria-label="Bildirimler">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-bold text-foreground">Bildirimler</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-primary hover:underline">
                Tümünü okundu say
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-6 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : error && items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-destructive">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Bildiriminiz yok. Yeni ödevler ve son tarih hatırlatmaları burada görünür.</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const Icon = KIND_ICON[n.kind] ?? Bell;
                  const urgent = n.kind === "assignment_overdue" || n.kind === "assignment_due_soon";
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => openItem(n)}
                        className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted transition-colors border-b border-border/60 last:border-0 ${n.read_at ? "" : "bg-primary/5"}`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${urgent ? "text-warning" : "text-primary"}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.read_at ? "text-foreground" : "font-semibold text-foreground"}`}>{n.title}</span>
                          {n.body && <span className="block text-xs text-muted-foreground mt-0.5">{n.body}</span>}
                          <span className="block text-[11px] text-muted-foreground mt-1">
                            {timeAgo(n.created_at)}
                            {!n.read_at && <span className="sr-only"> · okunmadı</span>}
                          </span>
                        </span>
                        {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
