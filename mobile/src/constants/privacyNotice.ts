/**
 * KVKK aydınlatma metni (6698 sayılı Kanun md. 10). Web'deki asıl:
 * dashboard/src/lib/privacyNotice.ts — metin değişirse ikisi ve backend'deki
 * PRIVACY_NOTICE_VERSION (backend/app/api/schemas/user.py) birlikte güncellenir.
 *
 * İçerik platformun gerçekte yaptığı işlemlere göre yazılmıştır; yayına almadan önce
 * bir hukukçu tarafından gözden geçirilmeli ve veri sorumlusu bilgileri doldurulmalıdır.
 */
export const PRIVACY_NOTICE_VERSION = "2026-10-v1";

export const PRIVACY_NOTICE: { title: string; body: string[] }[] = [
  {
    title: "Veri sorumlusu",
    body: [
      "DeepInsight platformu kapsamında kişisel verileriniz, veri sorumlusu sıfatıyla [veri sorumlusunun adı/unvanı, adresi ve iletişim e-postası] tarafından işlenir.",
    ],
  },
  {
    title: "İşlenen kişisel veriler",
    body: [
      "Hesap bilgileri: ad, soyad, e-posta, hedef pozisyon, şifre (şifreler yalnızca şifrelenmiş olarak, kimlik doğrulama sağlayıcısında tutulur).",
      "Mülakat verileri: yazılı ve sesli cevaplarınız, mülakat dökümü, yapay zekâ değerlendirme skorları ve geri bildirimleri.",
      "Görüntülü mülakat verileri (yalnızca ayrıca onam verirseniz): video ve ses kaydından çıkarılan göz teması, yüz ifadesine dayalı duygu/stres tahmini, konuşma hızı, duraksama ve dolgu kelime ölçümleri ile konuşma metni. Video dosyası analizden sonra silinir.",
      "CV verileri (yalnızca ayrıca onam verirseniz): yüklediğiniz CV dosyası, çıkarılan metin ve profil.",
      "Eklediğiniz iş ilanları ve eşleştirme sonuçları; kurum üyelikleri ve ödevler; pilot çalışmaya katılırsanız anket yanıtlarınız.",
      "Güvenlik kayıtları: hangi işlemin ne zaman yapıldığına dair denetim kaydı.",
    ],
  },
  {
    title: "İşleme amaçları ve hukuki sebepler",
    body: [
      "Hesabınızı oluşturmak, mülakat simülasyonu ve geri bildirim sunmak, gelişiminizi raporlamak: hizmetin sunulması (sözleşmenin kurulması ve ifası, md. 5/2-c).",
      "CV analizi, görüntülü mülakat analizi ve pilot araştırma: açık rızanız (md. 5/1). Bu onamları istediğiniz zaman geri çekebilirsiniz; geri çekildiğinde ilgili veriler silinir.",
      "Bir kuruma (üniversite, bootcamp) katılırsanız: kurum adına yaptığınız mülakatlara katılımınız eğitmenlerle paylaşılır; skorlarınız yalnızca ayrıca izin verirseniz paylaşılır. Bireysel mülakatlarınız kurumla hiçbir zaman paylaşılmaz.",
      "Güvenliğin sağlanması ve yasal yükümlülükler: denetim kayıtları (md. 5/2-ç ve f).",
    ],
  },
  {
    title: "Aktarım",
    body: [
      "Verileriniz, hizmetin sunulması için kullanılan altyapı sağlayıcılarına (veritabanı, dosya depolama ve kimlik doğrulama) ve mülakat sorularını üreten/değerlendiren yapay zekâ hizmet sağlayıcısına aktarılır. Bu sağlayıcıların sunucuları yurt dışında bulunabilir. CV metniniz yapay zekâya gönderilmeden önce e-posta ve telefon bilgileriniz maskelenir.",
      "Verileriniz reklam veya pazarlama amacıyla üçüncü kişilerle paylaşılmaz ve satılmaz.",
    ],
  },
  {
    title: "Saklama süresi",
    body: [
      "Verileriniz hesabınız açık olduğu sürece saklanır. Hesabınızı sildiğinizde kişisel verileriniz silinir; denetim kayıtları yasal yükümlülükler için hesabınızla eşleştirilemeyecek biçimde tutulabilir.",
    ],
  },
  {
    title: "Haklarınız (md. 11)",
    body: [
      "Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.",
      "Profil sayfasındaki \"Verilerim\" bölümünden tüm verilerinizi indirebilir ve hesabınızı tüm verilerinizle birlikte silebilirsiniz. Diğer talepleriniz için veri sorumlusunun yukarıdaki iletişim adresine başvurabilirsiniz.",
    ],
  },
];
