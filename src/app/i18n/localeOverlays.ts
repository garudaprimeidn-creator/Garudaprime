import type { I18nBundle } from "./types";

type Overlay = Partial<I18nBundle>;

const shell = (o: Overlay): Overlay => o;

export const LOCALE_OVERLAYS: Record<string, Overlay> = {
  ms: shell({
    nav: { home: "Laman Utama", wallet: "Dompet", invest: "Pelaburan", market: "Pasaran", community: "Komuniti" },
    screens: { home: "Papan Pemuka", wallet: "Dompet", invest: "Pelaburan", market: "Marketplace", community: "Komuniti" },
    theme: { lightOn: "Mod terang diaktifkan", darkOn: "Mod gelap diaktifkan", autoOn: "Mod automatik diaktifkan", light: "Terang", dark: "Gelap", auto: "Auto" },
    lang: { switched: (name: string) => `Wilayah ditetapkan ke ${name}` },
    settings: { themeLabel: "Tema Aplikasi", langLabel: "Negara & Wilayah" },
    skip: "Langkau", next: "Teruskan", start: "Mula Sekarang", appearance: "Penampilan & Bahasa", profile: "Profil",
    signOut: "Log Keluar", main: "Utama", tools: "Alat", seeAll: "Lihat semua", all: "Semua", copy: "Salin",
    auth: {
      login: { title: "Selamat kembali", subtitle: "Log masuk ke akaun Garuda Prime anda" },
      register: { title: "Cipta Akaun", subtitle: "Sertai masa depan kewangan Islam Web3" },
      signIn: "Log Masuk", signingIn: "Sedang log masuk…", createAccount: "Cipta Akaun", orEmail: "atau e-mel",
      email: "E-mel", password: "Kata Laluan", forgotPassword: "Lupa kata laluan?",
    },
    common: { send: "Hantar", receive: "Terima", swap: "Tukar", pay: "Bayar", scan: "Imbas" },
  }),

  th: shell({
    nav: { home: "หน้าแรก", wallet: "กระเป๋าเงิน", invest: "ลงทุน", market: "ตลาด", community: "ชุมชน" },
    screens: { home: "แดชบอร์ด", wallet: "กระเป๋าเงิน", invest: "การลงทุน", market: "Marketplace", community: "ชุมชน" },
    theme: { lightOn: "เปิดโหมดสว่าง", darkOn: "เปิดโหมดมืด", autoOn: "เปิดโหมดอัตโนมัติ", light: "สว่าง", dark: "มืด", auto: "อัตโนมัติ" },
    lang: { switched: (name: string) => `ตั้งภูมิภาคเป็น ${name}` },
    settings: { themeLabel: "ธีมแอป", langLabel: "ประเทศ & ภูมิภาค" },
    skip: "ข้าม", next: "ถัดไป", start: "เริ่มต้น", appearance: "รูปลักษณ์ & ภาษา", profile: "โปรไฟล์",
    signOut: "ออกจากระบบ", main: "หลัก", tools: "เครื่องมือ", seeAll: "ดูทั้งหมด", all: "ทั้งหมด", copy: "คัดลอก",
    auth: {
      login: { title: "ยินดีต้อนรับกลับ", subtitle: "เข้าสู่ระบบ Garuda Prime" },
      register: { title: "สร้างบัญชี", subtitle: "เข้าร่วมอนาคตการเงินอิสลาม Web3" },
      signIn: "เข้าสู่ระบบ", signingIn: "กำลังเข้าสู่ระบบ…", createAccount: "สร้างบัญชี", orEmail: "หรืออีเมล",
      email: "อีเมล", password: "รหัสผ่าน", forgotPassword: "ลืมรหัสผ่าน?",
    },
    common: { send: "ส่ง", receive: "รับ", swap: "แลก", pay: "ชำระ", scan: "สแกน" },
  }),

  vi: shell({
    nav: { home: "Trang chủ", wallet: "Ví", invest: "Đầu tư", market: "Chợ", community: "Cộng đồng" },
    screens: { home: "Bảng điều khiển", wallet: "Ví", invest: "Đầu tư", market: "Marketplace", community: "Cộng đồng" },
    theme: { lightOn: "Đã bật chế độ sáng", darkOn: "Đã bật chế độ tối", autoOn: "Đã bật chế độ tự động", light: "Sáng", dark: "Tối", auto: "Tự động" },
    lang: { switched: (name: string) => `Đã đặt khu vực: ${name}` },
    settings: { themeLabel: "Giao diện", langLabel: "Quốc gia & Khu vực" },
    skip: "Bỏ qua", next: "Tiếp tục", start: "Bắt đầu", appearance: "Giao diện & Ngôn ngữ", profile: "Hồ sơ",
    signOut: "Đăng xuất", main: "Chính", tools: "Công cụ", seeAll: "Xem tất cả", all: "Tất cả", copy: "Sao chép",
    auth: {
      login: { title: "Chào mừng trở lại", subtitle: "Đăng nhập vào Garuda Prime" },
      register: { title: "Tạo tài khoản", subtitle: "Tham gia tài chính Islam Web3" },
      signIn: "Đăng nhập", signingIn: "Đang đăng nhập…", createAccount: "Tạo tài khoản", orEmail: "hoặc email",
      email: "Email", password: "Mật khẩu", forgotPassword: "Quên mật khẩu?",
    },
    common: { send: "Gửi", receive: "Nhận", swap: "Hoán đổi", pay: "Thanh toán", scan: "Quét" },
  }),

  fil: shell({
    nav: { home: "Home", wallet: "Wallet", invest: "Invest", market: "Market", community: "Komunidad" },
    screens: { home: "Dashboard", wallet: "Wallet", invest: "Investment", market: "Marketplace", community: "Komunidad" },
    theme: { lightOn: "Naka-on ang light mode", darkOn: "Naka-on ang dark mode", autoOn: "Naka-on ang auto mode", light: "Maliwanag", dark: "Madilim", auto: "Auto" },
    lang: { switched: (name: string) => `Nakatakda ang rehiyon sa ${name}` },
    settings: { themeLabel: "Tema ng App", langLabel: "Bansa & Rehiyon" },
    skip: "Laktawan", next: "Susunod", start: "Simulan", appearance: "Itsura & Wika", profile: "Profile",
    signOut: "Mag-sign out", main: "Pangunahin", tools: "Mga Tool", seeAll: "Tingnan lahat", all: "Lahat", copy: "Kopyahin",
    auth: {
      login: { title: "Maligayang pagbabalik", subtitle: "Mag-sign in sa Garuda Prime" },
      register: { title: "Gumawa ng Account", subtitle: "Sumali sa hinaharap ng Islamic Web3 finance" },
      signIn: "Mag-sign In", signingIn: "Nag-sign in…", createAccount: "Gumawa ng Account", orEmail: "o email",
      email: "Email", password: "Password", forgotPassword: "Nakalimutan ang password?",
    },
    common: { send: "Ipadala", receive: "Tanggapin", swap: "Palitan", pay: "Bayaran", scan: "I-scan" },
  }),

  km: shell({
    nav: { home: "ទំព័រដើម", wallet: "កាបូប", invest: "វិនិយ័យ", market: "ទីផ្សារ", community: "សហគមន៍" },
    theme: { light: "ភ្លឺ", dark: "ងងឹត", auto: "ស្វ័យប្រវត្តិ" },
    settings: { langLabel: "ប្រទេស & តំបន់" },
    skip: "រំលង", next: "បន្ត", start: "ចាប់ផ្តើម", signOut: "ចេញ", copy: "ចម្លង",
    auth: { login: { title: "សូមស្វាគមន៍" }, signIn: "ចូល", createAccount: "បង្កើតគណនី" },
    common: { send: "ផ្ញើ", receive: "ទទួល", pay: "បង់", scan: "សкан" },
  }),

  lo: shell({
    nav: { home: "ໜ້າຫຼັກ", wallet: "ກະເປົາ", invest: "ລົງທຶນ", market: "ຕະຫຼາດ", community: "ຊຸມຊົນ" },
    theme: { light: "ສະຫວ່າງ", dark: "ມືດ", auto: "ອັດຕະໂນມັດ" },
    settings: { langLabel: "ປະເທດ & ພາກພື້ນ" },
    skip: "ຂ້າມ", next: "ຕໍ່", start: "ເລີ່ມ", signOut: "ອອກ", copy: "ຄັດລອກ",
    auth: { login: { title: "ຍິນດີຕ້ອນຮັບ" }, signIn: "ເຂົ້າລະບົບ", createAccount: "ສ້າງບັນຊີ" },
    common: { send: "ສົ່ງ", receive: "ຮັບ", pay: "ຈ່າຍ", scan: "ສະແກນ" },
  }),

  bur: shell({
    nav: { home: "ပင်မစာမျက်နှာ", wallet: "ပိုက်ဆံအိတ်", invest: "ရင်းနှီးမြှုပ်နှံ", market: "ဈေးကွက်", community: "အသိုင်းအဝိုင်း" },
    theme: { light: "အလင်း", dark: "အမှောင်", auto: "အလိုအလျောက်" },
    settings: { langLabel: "နိုင်ငံ & ဒေသ" },
    skip: "ကျော်မည်", next: "ရှေ့သို့", start: "စတင်", signOut: "ထွက်မည်", copy: "ကူးယူ",
    auth: { login: { title: "ပြန်လည်ကြိုဆိုပါသည်" }, signIn: "ဝင်ရောက်ရန်", createAccount: "အကောင့်ဖွင့်ရန်" },
    common: { send: "ပို့", receive: "လက်ခံ", pay: "ပေးချေ", scan: "စкан်" },
  }),

  pt: shell({
    nav: { home: "Início", wallet: "Carteira", invest: "Investir", market: "Mercado", community: "Comunidade" },
    theme: { light: "Claro", dark: "Escuro", auto: "Automático" },
    settings: { langLabel: "País & Região" },
    skip: "Saltar", next: "Continuar", start: "Começar", signOut: "Sair", copy: "Copiar",
    auth: { login: { title: "Bem-vindo de volta" }, signIn: "Entrar", createAccount: "Criar conta" },
    common: { send: "Enviar", receive: "Receber", pay: "Pagar", scan: "Digitalizar" },
  }),

  hi: shell({
    nav: { home: "होम", wallet: "वॉलेट", invest: "निवेश", market: "मार्केट", community: "समुदाय" },
    screens: { home: "डैशबोर्ड", wallet: "वॉलेट", invest: "निवेश", market: "मार्केटप्लेस", community: "समुदाय" },
    theme: { lightOn: "लाइट मोड चालू", darkOn: "डार्क मोड चालू", autoOn: "ऑटो मोड चालू", light: "लाइट", dark: "डार्क", auto: "ऑटो" },
    lang: { switched: (name: string) => `क्षेत्र ${name} पर सेट` },
    settings: { themeLabel: "ऐप थीम", langLabel: "देश & क्षेत्र" },
    skip: "छोड़ें", next: "आगे", start: "शुरू करें", appearance: "दिखावट & भाषा", profile: "प्रोफ़ाइल",
    signOut: "साइन आउट", main: "मुख्य", tools: "टूल", seeAll: "सभी देखें", all: "सभी", copy: "कॉपी",
    auth: {
      login: { title: "वापस स्वागत है", subtitle: "Garuda Prime में साइन इन करें" },
      register: { title: "खाता बनाएं", subtitle: "इस्लामिक Web3 वित्त में शामिल हों" },
      signIn: "साइन इन", signingIn: "साइन इन हो रहा है…", createAccount: "खाता बनाएं", orEmail: "या ईमेल",
      email: "ईमेल", password: "पासवर्ड", forgotPassword: "पासवर्ड भूल गए?",
    },
    common: { send: "भेजें", receive: "प्राप्त", swap: "अदला-बदली", pay: "भुगतान", scan: "स्कैन" },
  }),

  bn: shell({
    nav: { home: "হোম", wallet: "ওয়ালেট", invest: "বিনিয়োগ", market: "বাজার", community: "সম্প্রদায়" },
    theme: { light: "হালকা", dark: "গাঢ়", auto: "স্বয়ংক্রিয়" },
    settings: { langLabel: "দেশ & অঞ্চল" },
    skip: "এড়িয়ে যান", next: "পরবর্তী", start: "শুরু", signOut: "সাইন আউট", copy: "কপি",
    auth: { login: { title: "স্বাগতম" }, signIn: "সাইন ইন", createAccount: "অ্যাকাউন্ট তৈরি" },
    common: { send: "পাঠান", receive: "গ্রহণ", pay: "পেমেন্ট", scan: "স্ক্যান" },
  }),

  ur: shell({
    nav: { home: "ہوم", wallet: "والٹ", invest: "سرمایہ کاری", market: "مارکیٹ", community: "کمیونٹی" },
    theme: { light: "روشن", dark: "تاریک", auto: "خودکار" },
    settings: { langLabel: "ملک & علاقہ" },
    skip: "چھوڑیں", next: "آگے", start: "شروع", signOut: "سائن آؤٹ", copy: "کاپی",
    auth: { login: { title: "خوش آمدید" }, signIn: "سائن ان", createAccount: "اکاؤنٹ بنائیں" },
    common: { send: "بھیجیں", receive: "وصول", pay: "ادائیگی", scan: "اسکین" },
  }),

  ta: shell({
    nav: { home: "முகப்பு", wallet: "பணப்பை", invest: "முதலீடு", market: "சந்தை", community: "சமூகம்" },
    theme: { light: "வெளிச்சம்", dark: "இருள்", auto: "தானியங்கி" },
    settings: { langLabel: "நாடு & பகுதி" },
    skip: "தவிர்", next: "தொடர்", start: "தொடங்கு", signOut: "வெளியேறு", copy: "நகல்",
    auth: { login: { title: "மீண்டும் வரவேற்கிறோம்" }, signIn: "உள்நுழை", createAccount: "கணக்கு உருவாக்கு" },
    common: { send: "அனுப்பு", receive: "பெறு", pay: "செலுத்து", scan: "ஸ்கேன்" },
  }),

  ne: shell({
    nav: { home: "गृह", wallet: "वालेट", invest: "लगानी", market: "बजार", community: "समुदाय" },
    theme: { light: "उज्यालो", dark: "अँध्यारो", auto: "स्वचालित" },
    settings: { langLabel: "देश & क्षेत्र" },
    skip: "छोड्नुहोस्", next: "अगाडि", start: "सुरु", signOut: "साइन आउट", copy: "प्रतिलिपि",
    auth: { login: { title: "स्वागत छ" }, signIn: "साइन इन", createAccount: "खाता बनाउनुहोस्" },
    common: { send: "पठाउनु", receive: "प्राप्त", pay: "भुक्तानी", scan: "स्क्यान" },
  }),

  ar: shell({
    nav: { home: "الرئيسية", wallet: "المحفظة", invest: "استثمار", market: "السوق", community: "المجتمع" },
    screens: { home: "لوحة التحكم", wallet: "المحفظة", invest: "الاستثمار", market: "السوق", community: "المجتمع" },
    theme: { lightOn: "تم تفعيل الوضع الفاتح", darkOn: "تم تفعيل الوضع الداكن", autoOn: "تم تفعيل الوضع التلقائي", light: "فاتح", dark: "داكن", auto: "تلقائي" },
    lang: { switched: (name: string) => `تم تعيين المنطقة إلى ${name}` },
    settings: { themeLabel: "سمة التطبيق", langLabel: "البلد والمنطقة" },
    skip: "تخطي", next: "متابعة", start: "ابدأ", appearance: "المظهر واللغة", profile: "الملف الشخصي",
    signOut: "تسجيل الخروج", main: "الرئيسية", tools: "الأدوات", seeAll: "عرض الكل", all: "الكل", copy: "نسخ",
    auth: {
      login: { title: "مرحباً بعودتك", subtitle: "سجّل الدخول إلى Garuda Prime" },
      register: { title: "إنشاء حساب", subtitle: "انضم إلى مستقبل التمويل الإسلامي Web3" },
      signIn: "تسجيل الدخول", signingIn: "جاري تسجيل الدخول…", createAccount: "إنشاء حساب", orEmail: "أو البريد",
      email: "البريد الإلكتروني", password: "كلمة المرور", forgotPassword: "نسيت كلمة المرور؟",
    },
    common: { send: "إرسال", receive: "استلام", swap: "تبادل", pay: "دفع", scan: "مسح" },
  }),

  fr: shell({
    nav: { home: "Accueil", wallet: "Portefeuille", invest: "Investir", market: "Marché", community: "Communauté" },
    theme: { light: "Clair", dark: "Sombre", auto: "Auto" },
    settings: { langLabel: "Pays & Région" },
    skip: "Passer", next: "Continuer", start: "Commencer", signOut: "Déconnexion", copy: "Copier",
    auth: { login: { title: "Bon retour" }, signIn: "Connexion", createAccount: "Créer un compte" },
    common: { send: "Envoyer", receive: "Recevoir", pay: "Payer", scan: "Scanner" },
  }),

  sw: shell({
    nav: { home: "Nyumbani", wallet: "Mkoba", invest: "Wekeza", market: "Soko", community: "Jumuiya" },
    theme: { light: "Mwanga", dark: "Giza", auto: "Otomatiki" },
    settings: { langLabel: "Nchi & Eneo" },
    skip: "Ruka", next: "Endelea", start: "Anza", signOut: "Toka", copy: "Nakili",
    auth: { login: { title: "Karibu tena" }, signIn: "Ingia", createAccount: "Fungua akaunti" },
    common: { send: "Tuma", receive: "Pokea", pay: "Lipa", scan: "Skani" },
  }),

  am: shell({
    nav: { home: "መነሻ", wallet: "ቦርሳ", invest: "ኢንቨስት", market: "ገበያ", community: "ማህበረሰብ" },
    theme: { light: "ብርሃን", dark: "ጨለማ", auto: "ራስ-ሰር" },
    settings: { langLabel: "አገር & ክልል" },
    skip: "ዝለል", next: "ቀጥል", start: "ጀምር", signOut: "ውጣ", copy: "ቅዳ",
    auth: { login: { title: "እንኳን ደህና መጡ" }, signIn: "ግባ", createAccount: "መለያ ፍጠር" },
    common: { send: "ላክ", receive: "ተቀበል", pay: "ክፍያ", scan: "ስካን" },
  }),

  ha: shell({
    nav: { home: "Gida", wallet: "Wallet", invest: "Saka hannun jari", market: "Kasuwa", community: "Al'umma" },
    theme: { light: "Haske", dark: "Duhu", auto: "Atomatik" },
    settings: { langLabel: "Kasa & Yanki" },
    skip: "Tsallake", next: "Ci gaba", start: "Fara", signOut: "Fita", copy: "Kwafi",
    auth: { login: { title: "Barka da dawowa" }, signIn: "Shiga", createAccount: "Ƙirƙiri asusu" },
    common: { send: "Aika", receive: "Karɓa", pay: "Biya", scan: "Duba" },
  }),
};
