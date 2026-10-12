import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { PRIVACY_NOTICE, PRIVACY_NOTICE_VERSION } from "@/lib/privacyNotice";

export const metadata = { title: "Aydınlatma Metni · DeepInsight" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <article className="max-w-3xl mx-auto bg-card border border-border rounded-3xl shadow-sm p-6 sm:p-10">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> DeepInsight
        </Link>
        <div className="mt-6 mb-8">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="font-serif italic text-3xl text-foreground tracking-tight">Kişisel Verilerin Korunması Aydınlatma Metni</h1>
          <p className="text-sm text-muted-foreground mt-2">Sürüm {PRIVACY_NOTICE_VERSION}</p>
        </div>
        <div className="space-y-7">
          {PRIVACY_NOTICE.map((section) => (
            <section key={section.title}>
              <h2 className="font-bold text-foreground mb-2">{section.title}</h2>
              <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
                {section.body.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
