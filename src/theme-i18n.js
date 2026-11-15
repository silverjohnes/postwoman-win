'use strict';
// Names of the colour themes in every interface language. Order: Theme, Light, Dark, Midnight blue, Sepia
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.THEME_TR = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const K = ['Theme', 'Light', 'Dark', 'Midnight blue', 'Sepia'];
  const D = {
    en: K,
    ru: ['Тема', 'Светлая', 'Тёмная', 'Ночная синяя', 'Сепия'],
    uk: ['Тема', 'Світла', 'Темна', 'Нічна синя', 'Сепія'],
    zh: ['主题', '浅色', '深色', '午夜蓝', '棕褐色'],
    hi: ['थीम', 'हल्की', 'गहरी', 'मध्यरात्रि नीला', 'सेपिया'],
    es: ['Tema', 'Claro', 'Oscuro', 'Azul medianoche', 'Sepia'],
    ar: ['السمة', 'فاتح', 'داكن', 'أزرق منتصف الليل', 'سيبيا'],
    fr: ['Thème', 'Clair', 'Sombre', 'Bleu nuit', 'Sépia'],
    pt: ['Tema', 'Claro', 'Escuro', 'Azul meia-noite', 'Sépia'],
    de: ['Design', 'Hell', 'Dunkel', 'Mitternachtsblau', 'Sepia'],
    ja: ['テーマ', 'ライト', 'ダーク', 'ミッドナイトブルー', 'セピア'],
    ko: ['테마', '밝게', '어둡게', '미드나이트 블루', '세피아'],
    tr: ['Tema', 'Açık', 'Koyu', 'Gece mavisi', 'Sepya'],
    it: ['Tema', 'Chiaro', 'Scuro', 'Blu notte', 'Seppia'],
    vi: ['Giao diện', 'Sáng', 'Tối', 'Xanh nửa đêm', 'Nâu sepia'],
    pl: ['Motyw', 'Jasny', 'Ciemny', 'Granatowy', 'Sepia'],
    id: ['Tema', 'Terang', 'Gelap', 'Biru tengah malam', 'Sepia'],
    th: ['ธีม', 'สว่าง', 'มืด', 'น้ำเงินเข้ม', 'ซีเปีย'],
    nl: ['Thema', 'Licht', 'Donker', 'Middernachtblauw', 'Sepia'],
    fa: ['پوسته', 'روشن', 'تیره', 'آبی نیمه‌شب', 'سپیا'],
    he: ['ערכת נושא', 'בהיר', 'כהה', 'כחול חצות', 'ספיה'],
    sv: ['Tema', 'Ljust', 'Mörkt', 'Midnattsblå', 'Sepia'],
    cs: ['Motiv', 'Světlý', 'Tmavý', 'Půlnoční modrá', 'Sépiový'],
    ro: ['Temă', 'Luminos', 'Întunecat', 'Albastru de noapte', 'Sepia'],
    bn: ['থিম', 'হালকা', 'গাঢ়', 'মধ্যরাতের নীল', 'সেপিয়া'],
  };
  const TH = (lang, en) => { const i = K.indexOf(en); const d = D[lang]; return (d && i >= 0 && d[i]) || en; };
  return { D, K, TH };
});
