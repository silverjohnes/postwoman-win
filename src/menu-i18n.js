'use strict';
// Menu bar labels for every interface language.
// Order: File, Edit, Run, View, Window, Cut, Copy, Paste, Exit, Actual size, Zoom in, Zoom out, Full screen, Minimize, Maximize / restore
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MENU_TR = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const K = ['File', 'Edit', 'Run', 'View', 'Window', 'Cut', 'Copy', 'Paste', 'Exit', 'Actual size', 'Zoom in', 'Zoom out', 'Full screen', 'Minimize', 'Maximize / restore'];
  const D = {
    en: K,
    ru: ['Файл', 'Правка', 'Запуск', 'Вид', 'Окно', 'Вырезать', 'Копировать', 'Вставить', 'Выход', 'Реальный размер', 'Увеличить', 'Уменьшить', 'Во весь экран', 'Свернуть', 'Развернуть / восстановить'],
    uk: ['Файл', 'Редагування', 'Запуск', 'Вигляд', 'Вікно', 'Вирізати', 'Копіювати', 'Вставити', 'Вихід', 'Реальний розмір', 'Збільшити', 'Зменшити', 'На весь екран', 'Згорнути', 'Розгорнути / відновити'],
    zh: ['文件', '编辑', '运行', '视图', '窗口', '剪切', '复制', '粘贴', '退出', '实际大小', '放大', '缩小', '全屏', '最小化', '最大化 / 还原'],
    hi: ['फ़ाइल', 'संपादित करें', 'चलाएँ', 'दृश्य', 'विंडो', 'काटें', 'कॉपी करें', 'चिपकाएँ', 'बाहर निकलें', 'वास्तविक आकार', 'ज़ूम इन', 'ज़ूम आउट', 'पूर्ण स्क्रीन', 'छोटा करें', 'बड़ा करें / पुनर्स्थापित करें'],
    es: ['Archivo', 'Edición', 'Ejecutar', 'Ver', 'Ventana', 'Cortar', 'Copiar', 'Pegar', 'Salir', 'Tamaño real', 'Acercar', 'Alejar', 'Pantalla completa', 'Minimizar', 'Maximizar / restaurar'],
    ar: ['ملف', 'تحرير', 'تشغيل', 'عرض', 'نافذة', 'قص', 'نسخ', 'لصق', 'خروج', 'الحجم الفعلي', 'تكبير', 'تصغير', 'ملء الشاشة', 'تصغير النافذة', 'تكبير / استعادة'],
    fr: ['Fichier', 'Édition', 'Exécuter', 'Affichage', 'Fenêtre', 'Couper', 'Copier', 'Coller', 'Quitter', 'Taille réelle', 'Zoom avant', 'Zoom arrière', 'Plein écran', 'Réduire', 'Agrandir / restaurer'],
    pt: ['Arquivo', 'Editar', 'Executar', 'Exibir', 'Janela', 'Recortar', 'Copiar', 'Colar', 'Sair', 'Tamanho real', 'Ampliar', 'Reduzir', 'Tela cheia', 'Minimizar', 'Maximizar / restaurar'],
    de: ['Datei', 'Bearbeiten', 'Ausführen', 'Ansicht', 'Fenster', 'Ausschneiden', 'Kopieren', 'Einfügen', 'Beenden', 'Tatsächliche Größe', 'Vergrößern', 'Verkleinern', 'Vollbild', 'Minimieren', 'Maximieren / Wiederherstellen'],
    ja: ['ファイル', '編集', '実行', '表示', 'ウインドウ', '切り取り', 'コピー', '貼り付け', '終了', '実際のサイズ', '拡大', '縮小', 'フルスクリーン', '最小化', '最大化 / 元に戻す'],
    ko: ['파일', '편집', '실행', '보기', '윈도우', '잘라내기', '복사', '붙여넣기', '종료', '실제 크기', '확대', '축소', '전체 화면', '최소화', '최대화 / 복원'],
    tr: ['Dosya', 'Düzen', 'Çalıştır', 'Görünüm', 'Pencere', 'Kes', 'Kopyala', 'Yapıştır', 'Çıkış', 'Gerçek boyut', 'Yakınlaştır', 'Uzaklaştır', 'Tam ekran', 'Simge durumuna küçült', 'Büyüt / geri yükle'],
    it: ['File', 'Modifica', 'Esegui', 'Vista', 'Finestra', 'Taglia', 'Copia', 'Incolla', 'Esci', 'Dimensione reale', 'Ingrandisci', 'Riduci', 'Schermo intero', 'Riduci a icona', 'Ingrandisci / ripristina'],
    vi: ['Tệp', 'Chỉnh sửa', 'Chạy', 'Xem', 'Cửa sổ', 'Cắt', 'Sao chép', 'Dán', 'Thoát', 'Kích thước thực', 'Phóng to', 'Thu nhỏ', 'Toàn màn hình', 'Thu nhỏ cửa sổ', 'Phóng to / khôi phục'],
    pl: ['Plik', 'Edycja', 'Uruchom', 'Widok', 'Okno', 'Wytnij', 'Kopiuj', 'Wklej', 'Zakończ', 'Rzeczywisty rozmiar', 'Powiększ', 'Pomniejsz', 'Pełny ekran', 'Minimalizuj', 'Maksymalizuj / przywróć'],
    id: ['Berkas', 'Edit', 'Jalankan', 'Tampilan', 'Jendela', 'Potong', 'Salin', 'Tempel', 'Keluar', 'Ukuran sebenarnya', 'Perbesar', 'Perkecil', 'Layar penuh', 'Minimalkan', 'Maksimalkan / pulihkan'],
    th: ['ไฟล์', 'แก้ไข', 'เรียกใช้', 'มุมมอง', 'หน้าต่าง', 'ตัด', 'คัดลอก', 'วาง', 'ออก', 'ขนาดจริง', 'ซูมเข้า', 'ซูมออก', 'เต็มหน้าจอ', 'ย่อเล็กสุด', 'ขยายใหญ่สุด / คืนค่า'],
    nl: ['Bestand', 'Bewerken', 'Uitvoeren', 'Weergave', 'Venster', 'Knippen', 'Kopiëren', 'Plakken', 'Afsluiten', 'Werkelijke grootte', 'Inzoomen', 'Uitzoomen', 'Volledig scherm', 'Minimaliseren', 'Maximaliseren / herstellen'],
    fa: ['پرونده', 'ویرایش', 'اجرا', 'نما', 'پنجره', 'برش', 'رونوشت', 'چسباندن', 'خروج', 'اندازه واقعی', 'بزرگ‌نمایی', 'کوچک‌نمایی', 'تمام صفحه', 'کوچک کردن', 'بزرگ کردن / بازیابی'],
    he: ['קובץ', 'עריכה', 'הרצה', 'תצוגה', 'חלון', 'גזור', 'העתק', 'הדבק', 'יציאה', 'גודל מקורי', 'הגדל', 'הקטן', 'מסך מלא', 'מזער', 'הגדל / שחזר'],
    sv: ['Arkiv', 'Redigera', 'Kör', 'Visa', 'Fönster', 'Klipp ut', 'Kopiera', 'Klistra in', 'Avsluta', 'Verklig storlek', 'Zooma in', 'Zooma ut', 'Helskärm', 'Minimera', 'Maximera / återställ'],
    cs: ['Soubor', 'Úpravy', 'Spustit', 'Zobrazení', 'Okno', 'Vyjmout', 'Kopírovat', 'Vložit', 'Konec', 'Skutečná velikost', 'Přiblížit', 'Oddálit', 'Celá obrazovka', 'Minimalizovat', 'Maximalizovat / obnovit'],
    ro: ['Fișier', 'Editare', 'Rulare', 'Vizualizare', 'Fereastră', 'Decupare', 'Copiere', 'Lipire', 'Ieșire', 'Dimensiune reală', 'Mărire', 'Micșorare', 'Ecran complet', 'Minimizare', 'Maximizare / restaurare'],
    bn: ['ফাইল', 'সম্পাদনা', 'চালান', 'দেখুন', 'উইন্ডো', 'কাট', 'কপি', 'পেস্ট', 'প্রস্থান', 'প্রকৃত আকার', 'জুম ইন', 'জুম আউট', 'পূর্ণ পর্দা', 'ছোট করুন', 'বড় করুন / পুনরুদ্ধার'],
  };
  const MT = (lang, en) => { const i = K.indexOf(en); const d = D[lang]; return (d && i >= 0 && d[i]) || en; };
  return { D, K, MT };
});
