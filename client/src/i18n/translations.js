/**
 * Landing-page copy, per language.
 *
 * Scope: the PUBLIC landing page only. The auth page keeps its own
 * (English) copy and is not affected by this switcher.
 *
 * Adding a language later: add its code to LANGUAGES and a matching
 * entry to `translations` with the same shape as the ones below —
 * nothing else in the components needs to change.
 */
export const LANGUAGES = [
  { code: "he", nativeName: "עברית", dir: "rtl" },
  { code: "ar", nativeName: "العربية", dir: "rtl" },
  { code: "en", nativeName: "English", dir: "ltr" },
];

export const DEFAULT_LANG = "he";

export const translations = {
  he: {
    dir: "rtl",
    nav: {
      home: "דף הבית",
      how: "איך זה עובד",
      about: "מי אנחנו",
      login: "התחברות",
      homeAria: "Match Queens — לראש הדף",
      openMenu: "פתיחת תפריט",
      closeMenu: "סגירת תפריט",
      language: "שפה",
    },
    hero: {
      eyebrow: "קהילת QueenB להאצת קריירה בהייטק",
      titleBefore: "החיבור הנכון יכול ",
      titleHighlight: "לשנות את הדרך שלך",
      titleAfter: " בהייטק",
      subtitle:
        "Match Queens מחברת בין מנטיות למנטוריות בתעשיית ההייטק, כדי להפוך ניסיון, ידע וקשרים להזדמנות לצמוח יחד.",
      ctaPrimary: "התחברות למערכת",
      ctaSecondary: "איך זה עובד?",
    },
    art: {
      mentee: "מנטית",
      mentor: "מנטורית",
      menteeComment: "// מנטית",
      mentorComment: "// מנטורית",
      cardTitle: "התאמה חדשה",
      matchedBadge: "מותאמות ✓",
    },
    how: {
      kicker: "התהליך",
      title: "איך זה עובד?",
      subtitle: "מהחיבור הראשון ועד הפגישה עצמה — שלושה צעדים פשוטים, הכול במקום אחד.",
      steps: [
        {
          title: "מוצאות את החיבור",
          text: "המנטית בוחרת מנטורית המתאימה לתחום ולמטרות שלה.",
        },
        {
          title: "מתאמות זמן",
          text: "המנטורית מציעה מועדים והמנטית בוחרת את הזמן המתאים לה.",
        },
        {
          title: "נפגשות ומתקדמות",
          text: "הפגישה נקבעת ושתיהן מקבלות את כל הפרטים במקום אחד.",
        },
      ],
    },
    about: {
      kicker: "מי אנחנו",
      title: "מי אנחנו?",
      text:
        "Match Queens נוצרה עבור QueenB כדי לחבר בין נשים בתחילת דרכן לבין נשים מנוסות בתעשיית ההייטק. המערכת הופכת את תהליך החיבור ותיאום הפגישה לפשוט, ברור ונגיש.",
      badges: ["נבנה עבור QueenB", "פשוט וברור", "נגיש לכולן"],
      braceLine1: "נשים בתחילת הדרך",
      braceLine2: "נשים מנוסות בהייטק",
    },
    cta: {
      title: "מוכנה לחיבור הבא שלך?",
      text: "התחברי למערכת והתחילי את תהליך המנטורינג.",
      button: "להתחברות",
    },
    footer: {
      tagline: "נוצר עבור QueenB",
    },

    app: {
      nav: {
        menteeHome: "חיפוש מנטוריות",
        personalArea: "האזור האישי",
        mentorArea: "אזור המנטורית",
        becomeMentor: "הפכי למנטורית",
        logout: "יציאה",
        openMenu: "פתיחת תפריט",
        closeMenu: "סגירת תפריט",
        language: "שפה",
        brandAria: "Match Queens — לאזור האישי",
      },
      menteeHome: {
        title: "מצאי את המנטורית שלך",
        description: "עברי בין מנטוריות מהתעשייה ומצאי התאמה למטרות שלך.",
        searchPlaceholder: "חיפוש לפי שם, תחום או טכנולוגיה",
        filtersTitle: "סינון",
        filtersHint: "אפשרויות הסינון יתווספו כשמנוע החיפוש יחובר.",
        resultsTitle: "מנטוריות",
        emptyTitle: "עדיין אין תוצאות",
        emptyHint: "כשמנוע החיפוש יחובר, מנטוריות מתאימות יופיעו כאן.",
      },
      personalArea: {
        title: "האזור האישי",
        description: "סקירה של הפרופיל, הבקשות והפגישות שלך.",
        profileTitle: "הפרופיל שלי",
        profileHint: "פרטי הפרופיל יופיעו כאן כשמערכת המשתמשים תחובר.",
        requestsTitle: "בקשות ופגישות",
        requestsEmptyTitle: "אין בקשות פעילות",
        requestsEmptyHint: "בקשות מנטורינג שתשלחי יופיעו כאן.",
      },
      mentorArea: {
        title: "אזור המנטורית",
        description: "ניהול הפרופיל, הבקשות הנכנסות והזמינות שלך.",
        profileTitle: "פרופיל המנטורית",
        profileHint: "פרטי המנטורית יופיעו כאן כשפרופיל המנטורית יחובר.",
        requestsTitle: "בקשות נכנסות",
        requestsEmptyTitle: "אין בקשות חדשות",
        requestsEmptyHint: "בקשות ממנטיות יופיעו כאן.",
        scheduleTitle: "פגישות וזמינות",
        scheduleHint: "ניהול הזמינות והפגישות יתווסף בהמשך.",
      },
      becomeMentor: {
        title: "רוצה להנחות מנטיות?",
        description:
          "יש לך ניסיון שיכול לעזור למישהי אחרת להתקדם? בקרוב תוכלי להצטרף כמנטורית ולקבל בקשות מנטורינג.",
        cta: "הצטרפי כמנטורית",
        ctaNote: "טופס ההצטרפות יתווסף בהמשך.",
      },
      common: {
        loading: "טוען…",
        comingSoon: "בקרוב",
        placeholderNote: "אזור זה יתמלא בתוכן כשהפיצ'ר יחובר.",
        status: {
          pending: "ממתין",
          scheduled: "נקבעה",
          done: "התקיימה",
          cancelled: "בוטלה",
          neutral: "כללי",
        },
      },
    },
  },

  ar: {
    dir: "rtl",
    nav: {
      home: "الرئيسية",
      how: "كيف تعمل",
      about: "من نحن",
      login: "تسجيل الدخول",
      homeAria: "Match Queens — العودة إلى الأعلى",
      openMenu: "فتح القائمة",
      closeMenu: "إغلاق القائمة",
      language: "اللغة",
    },
    hero: {
      eyebrow: "مجتمع QueenB لتسريع المسار المهني في التكنولوجيا",
      titleBefore: "الاتصال الصحيح يمكن أن ",
      titleHighlight: "يغيّر مسارك",
      titleAfter: " في عالم التكنولوجيا",
      subtitle:
        "منصّة Match Queens تربط بين المتدرّبات والمرشدات في صناعة التكنولوجيا، لتحويل الخبرة والمعرفة والعلاقات إلى فرصة للنمو معًا.",
      ctaPrimary: "تسجيل الدخول إلى المنصّة",
      ctaSecondary: "كيف تعمل؟",
    },
    art: {
      mentee: "متدرّبة",
      mentor: "مرشدة",
      menteeComment: "// المتدرّبة",
      mentorComment: "// المرشدة",
      cardTitle: "تطابق جديد",
      matchedBadge: "تم التطابق ✓",
    },
    how: {
      kicker: "خطوات العمل",
      title: "كيف تعمل؟",
      subtitle: "من أول تواصل وحتى اللقاء نفسه — ثلاث خطوات بسيطة، كل شيء في مكان واحد.",
      steps: [
        {
          title: "إيجاد التطابق المناسب",
          text: "تختار المتدرّبة المرشدة الأنسب لمجالها وأهدافها.",
        },
        {
          title: "تحديد الموعد",
          text: "تقترح المرشدة مواعيد متاحة وتختار المتدرّبة ما يناسبها.",
        },
        {
          title: "اللقاء والتقدّم",
          text: "يتم تحديد اللقاء وتحصل كلتاهما على كل التفاصيل في مكان واحد.",
        },
      ],
    },
    about: {
      kicker: "من نحن",
      title: "من نحن؟",
      text:
        "تأسّست Match Queens من أجل QueenB لربط النساء في بداية مسيرتهنّ بنساء ذوات خبرة في صناعة التكنولوجيا. تجعل المنصّة عملية التواصل وتحديد المواعيد بسيطة وواضحة وسهلة الوصول.",
      badges: ["صُممت من أجل QueenB", "بسيطة وواضحة", "متاحة للجميع"],
      braceLine1: "نساء في بداية الطريق",
      braceLine2: "نساء ذوات خبرة في التكنولوجيا",
    },
    cta: {
      title: "مستعدّة لتواصلك القادم؟",
      text: "سجّلي الدخول وابدئي رحلة الإرشاد المهني.",
      button: "تسجيل الدخول",
    },
    footer: {
      tagline: "صُممت من أجل QueenB",
    },

    app: {
      nav: {
        menteeHome: "البحث عن مرشدات",
        personalArea: "المنطقة الشخصية",
        mentorArea: "منطقة المرشدة",
        becomeMentor: "كوني مرشدة",
        logout: "تسجيل الخروج",
        openMenu: "فتح القائمة",
        closeMenu: "إغلاق القائمة",
        language: "اللغة",
        brandAria: "Match Queens — إلى المنطقة الشخصية",
      },
      menteeHome: {
        title: "ابحثي عن مرشدتك",
        description: "تصفّحي المرشدات من الصناعة وابحثي عن الأنسب لأهدافك.",
        searchPlaceholder: "ابحثي بالاسم أو المجال أو التقنية",
        filtersTitle: "تصفية",
        filtersHint: "ستُضاف خيارات التصفية عند ربط محرك البحث.",
        resultsTitle: "المرشدات",
        emptyTitle: "لا توجد نتائج بعد",
        emptyHint: "عند ربط محرك البحث ستظهر هنا المرشدات المناسبات.",
      },
      personalArea: {
        title: "المنطقة الشخصية",
        description: "نظرة عامة على ملفك وطلباتك ولقاءاتك.",
        profileTitle: "ملفي الشخصي",
        profileHint: "ستظهر تفاصيل الملف هنا عند ربط نظام المستخدمين.",
        requestsTitle: "الطلبات واللقاءات",
        requestsEmptyTitle: "لا توجد طلبات نشطة",
        requestsEmptyHint: "ستظهر هنا طلبات الإرشاد التي ترسلينها.",
      },
      mentorArea: {
        title: "منطقة المرشدة",
        description: "إدارة ملفك والطلبات الواردة وتوفّرك.",
        profileTitle: "ملف المرشدة",
        profileHint: "ستظهر تفاصيل المرشدة هنا عند ربط ملف المرشدة.",
        requestsTitle: "الطلبات الواردة",
        requestsEmptyTitle: "لا توجد طلبات جديدة",
        requestsEmptyHint: "ستظهر هنا طلبات المتدرّبات.",
        scheduleTitle: "اللقاءات والتوفّر",
        scheduleHint: "ستُضاف إدارة التوفّر واللقاءات لاحقًا.",
      },
      becomeMentor: {
        title: "هل تريدين إرشاد المتدرّبات؟",
        description:
          "لديكِ خبرة يمكن أن تساعد غيركِ على التقدّم؟ قريبًا يمكنكِ الانضمام كمرشدة واستقبال طلبات الإرشاد.",
        cta: "انضمي كمرشدة",
        ctaNote: "سيُضاف نموذج الانضمام لاحقًا.",
      },
      common: {
        loading: "جارٍ التحميل…",
        comingSoon: "قريبًا",
        placeholderNote: "سيمتلئ هذا القسم بالمحتوى عند ربط الميزة.",
        status: {
          pending: "قيد الانتظار",
          scheduled: "مُحدَّد",
          done: "تمّ",
          cancelled: "أُلغيت",
          neutral: "عام",
        },
      },
    },
  },

  en: {
    dir: "ltr",
    nav: {
      home: "Home",
      how: "How it works",
      about: "About us",
      login: "Log in",
      homeAria: "Match Queens — back to top",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      language: "Language",
    },
    hero: {
      eyebrow: "QueenB's community for accelerating tech careers",
      titleBefore: "The right connection can ",
      titleHighlight: "change your path",
      titleAfter: " in tech",
      subtitle:
        "Match Queens connects mentees with mentors across the tech industry, turning experience, knowledge and connections into a chance to grow together.",
      ctaPrimary: "Log in to get started",
      ctaSecondary: "How it works?",
    },
    art: {
      mentee: "Mentee",
      mentor: "Mentor",
      menteeComment: "// mentee",
      mentorComment: "// mentor",
      cardTitle: "New match",
      matchedBadge: "Matched ✓",
    },
    how: {
      kicker: "The process",
      title: "How it works?",
      subtitle: "From the first connection to the meeting itself — three simple steps, all in one place.",
      steps: [
        {
          title: "Find your match",
          text: "The mentee chooses a mentor who fits her field and goals.",
        },
        {
          title: "Set a time",
          text: "The mentor offers available times and the mentee picks what works for her.",
        },
        {
          title: "Meet and grow",
          text: "The meeting is set, and both get all the details in one place.",
        },
      ],
    },
    about: {
      kicker: "About us",
      title: "Who we are?",
      text:
        "Match Queens was created for QueenB to connect women at the start of their journey with experienced women in the tech industry. It turns connecting and scheduling into something simple, clear and accessible.",
      badges: ["Built for QueenB", "Simple & clear", "Accessible to all"],
      braceLine1: "Women starting out",
      braceLine2: "Experienced women in tech",
    },
    cta: {
      title: "Ready for your next connection?",
      text: "Log in and start your mentoring journey.",
      button: "Log in",
    },
    footer: {
      tagline: "Built for QueenB",
    },

    app: {
      nav: {
        menteeHome: "Find a mentor",
        personalArea: "Personal area",
        mentorArea: "Mentor area",
        becomeMentor: "Become a mentor",
        logout: "Log out",
        openMenu: "Open menu",
        closeMenu: "Close menu",
        language: "Language",
        brandAria: "Match Queens — to personal area",
      },
      menteeHome: {
        title: "Find your mentor",
        description: "Browse mentors from the industry and find the right fit for your goals.",
        searchPlaceholder: "Search by name, field or technology",
        filtersTitle: "Filters",
        filtersHint: "Filter options will be added once search is connected.",
        resultsTitle: "Mentors",
        emptyTitle: "No results yet",
        emptyHint: "Matching mentors will appear here once search is connected.",
      },
      personalArea: {
        title: "Personal area",
        description: "An overview of your profile, requests and meetings.",
        profileTitle: "My profile",
        profileHint: "Profile details will appear here once the user system is connected.",
        requestsTitle: "Requests & meetings",
        requestsEmptyTitle: "No active requests",
        requestsEmptyHint: "Mentoring requests you send will appear here.",
      },
      mentorArea: {
        title: "Mentor area",
        description: "Manage your profile, incoming requests and availability.",
        profileTitle: "Mentor profile",
        profileHint: "Mentor details will appear here once the mentor profile is connected.",
        requestsTitle: "Incoming requests",
        requestsEmptyTitle: "No new requests",
        requestsEmptyHint: "Requests from mentees will appear here.",
        scheduleTitle: "Meetings & availability",
        scheduleHint: "Availability and meeting management will be added later.",
      },
      becomeMentor: {
        title: "Want to mentor?",
        description:
          "Have experience that could help someone else grow? Soon you'll be able to join as a mentor and receive mentoring requests.",
        cta: "Join as a mentor",
        ctaNote: "The signup form will be added later.",
      },
      common: {
        loading: "Loading…",
        comingSoon: "Coming soon",
        placeholderNote: "This section will fill with content once the feature is connected.",
        status: {
          pending: "Pending",
          scheduled: "Scheduled",
          done: "Done",
          cancelled: "Cancelled",
          neutral: "General",
        },
      },
    },
  },
};

export default translations;
