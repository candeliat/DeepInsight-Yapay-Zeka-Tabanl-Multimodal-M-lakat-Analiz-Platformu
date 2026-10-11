"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import { accountService, ConsentStatus } from "@/services/accountService";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/** KVKK veri hakları: verilerimi indir ve hesabımı sil. */
export function DataRightsCard({ email }: { email: string | undefined }) {
  const { logout } = useAuthStore();
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = !!email && confirm.trim().toLowerCase() === email.toLowerCase();

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await accountService.downloadMyData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veriler indirilemedi.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await accountService.deleteAccount(confirm.trim());
      logout();
      router.push("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hesap silinemedi.");
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Verilerim (KVKK)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="text-sm max-w-xl">
            <p className="font-semibold text-foreground">Verilerimi indir</p>
            <p className="text-muted-foreground mt-1">
              Mülakatlarınız ve mesajları, video/ses analizleri, CV&apos;leriniz ve analizleri, ilanlarınız, onamlarınız,
              kurum üyelikleriniz ve anket yanıtlarınız tek bir JSON dosyasında.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} İndir
          </Button>
        </div>

        <VideoConsentRow />

        <div className="border-t border-border pt-6">
          <p className="font-semibold text-foreground text-sm">Hesabımı ve tüm verilerimi sil</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Hesabınız ve yukarıdaki tüm kişisel verileriniz kalıcı olarak silinir; bu işlem geri alınamaz. Kurumlara ait
            içerik (ör. kurum soru bankası) silinmez. Bir kurumun tek yöneticisiyseniz önce başka bir üyeyi yönetici yapmanız gerekir.
          </p>
          {!showDelete ? (
            <Button variant="outline" size="sm" className="mt-3 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Hesabımı silmek istiyorum
            </Button>
          ) : (
            <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 max-w-xl">
              <p className="text-sm text-foreground flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                Onaylamak için e-posta adresinizi yazın: <span className="font-mono text-xs break-all">{email}</span>
              </p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="E-posta adresiniz" aria-label="Onay için e-posta adresiniz" autoComplete="off" />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDelete} disabled={!matches || deleting} className="bg-destructive hover:bg-destructive/90 text-white">
                  {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Kalıcı olarak sil
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowDelete(false); setConfirm(""); }}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** Video analizi onamı: verildiyse geri çekilebilir (video analizi sonuçları silinir). */
function VideoConsentRow() {
  const [consent, setConsent] = useState<ConsentStatus | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    accountService.getConsent("video_analysis").then(setConsent).catch(() => setConsent(null));
  }, []);

  if (!consent) return null;
  const revoke = async () => {
    setBusy(true);
    try {
      setConsent(await accountService.setConsent("video_analysis", false));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border pt-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="text-sm max-w-xl">
        <p className="font-semibold text-foreground">Video analizi onamı</p>
        <p className="text-muted-foreground mt-1">
          {consent.granted
            ? "Görüntülü mülakat kayıtlarınızın analiz edilmesine onam verdiniz. Geri çekerseniz video analizi sonuçlarınız silinir."
            : "Onam vermediniz; görüntülü mülakat başlatırken onam istenir."}
        </p>
      </div>
      {consent.granted &&
        (confirm ? (
          <span className="text-sm">
            <button onClick={revoke} disabled={busy} className="font-bold text-destructive hover:underline">Geri çek ve sil</button>
            <button onClick={() => setConfirm(false)} className="ml-3 text-muted-foreground hover:underline">Vazgeç</button>
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>Onamı geri çek</Button>
        ))}
    </div>
  );
}
