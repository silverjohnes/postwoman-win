(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.I18N = factory(); })(typeof self !== 'undefined' ? self : this, function () {
'use strict';
const en = {
  'app.name': 'Postwoman', 'tab.request': 'Request', 'tab.runner': 'Runner', 'tab.globals': 'Variables', 'tab.history': 'History', 'tab.log': 'Log',
  'btn.import': 'Import', 'btn.settings': 'Settings', 'btn.newRequest': 'New request', 'btn.newFolder': 'New folder', 'btn.export': 'Export',
  'btn.send': 'Send', 'btn.save': 'Save', 'btn.cancel': 'Cancel', 'btn.delete': 'Delete', 'btn.rename': 'Rename', 'btn.duplicate': 'Duplicate',
  'btn.run': 'Run', 'btn.pause': 'Pause', 'btn.resume': 'Resume', 'btn.stop': 'Stop', 'btn.beautify': 'Beautify', 'btn.add': 'Add', 'btn.close': 'Close',
  'btn.override': 'Override', 'btn.preview': 'Preview', 'btn.errorsCsv': 'Errors CSV', 'btn.chooseFile': 'Choose file…', 'btn.clear': 'Clear', 'btn.copy': 'Copy',
  'btn.saveBody': 'Save body', 'btn.browse': 'Browse…', 'btn.checkPaths': 'Check paths', 'btn.saveAll': 'Save all', 'btn.discard': 'Discard', 'btn.discardAll': 'Discard all',
  'btn.parse': 'Parse', 'btn.reveal': 'Show', 'btn.hide': 'Hide', 'btn.hotkeys': 'Hotkeys',
  'search.placeholder': 'Search…', 'search.byContent': 'By content', 'search.count': '{0} of {1}', 'search.none': 'No matches', 'search.find': 'Find',
  'req.params': 'Params', 'req.headers': 'Headers', 'req.body': 'Body', 'req.scripts': 'Scripts', 'req.preScript': 'PreScript', 'req.postScript': 'PostScript',
  'req.auto': 'Automatic', 'req.inherited': 'Inherited from folder “{0}”', 'req.key': 'Key', 'req.value': 'Value', 'req.name': 'Name', 'req.url': 'Request URL',
  'req.authError': 'Authorization token is empty or incorrect', 'req.unsaved': 'Unsaved', 'req.newName': 'Untitled request', 'req.folderName': 'New folder', 'req.saveAs': 'Name of the request',
  'body.none': 'none', 'body.formdata': 'form-data', 'body.urlencoded': 'x-www-form-urlencoded', 'body.raw': 'raw', 'body.binary': 'binary', 'body.json': 'JSON', 'body.text': 'Text',
  'body.noBody': 'This request has no body', 'body.file': 'File', 'body.type': 'Type',
  'res.response': 'Response', 'res.request': 'Request', 'res.visualize': 'Visualize', 'res.console': 'Console', 'res.headers': 'Headers', 'res.empty': '<empty>', 'res.noResult': 'No result yet',
  'res.sending': 'Sending…', 'res.error': 'Error', 'res.size': 'Size', 'res.time': 'Time', 'res.tests': 'Tests', 'res.noViz': 'No visualization: use pm.visualizer.set() in the post-response script',
  'res.bodyLabel': 'Body', 'res.loading': 'Formatting…',
  'curl.title': 'cURL', 'curl.copy': 'Copy as cURL',
  'import.title': 'Import', 'import.collection': 'Postman collection (file)', 'import.curl': 'Paste cURL command', 'import.curlPlaceholder': 'curl -X POST https://… (bash, cmd or PowerShell format)',
  'import.done': 'Imported: {0} requests, {1} variables', 'import.error': 'Import error: {0}',
  'runner.target': 'Target', 'runner.iterations': 'Iterations', 'runner.interval': 'Interval, ms', 'runner.data': 'Data file (CSV/JSON)', 'runner.noData': 'No data file',
  'runner.progress': 'Progress', 'runner.state.idle': 'Idle', 'runner.state.running': 'Running', 'runner.state.paused': 'Paused', 'runner.state.stopped': 'Stopped', 'runner.state.finished': 'Finished',
  'runner.pickTarget': 'Select a folder or request in the list', 'runner.variables': 'Variables', 'runner.requests': 'Requests', 'runner.previewTitle': 'Preview', 'runner.rows': '{0} rows',
  'runner.results': 'Results', 'runner.details': 'Details',
  'vars.title': 'Variables', 'vars.add': 'Add variable', 'vars.secret': 'Secret', 'vars.locked': 'hidden', 'vars.authPrompt': 'Postwoman: confirm access to secret variables',
  'vars.authFailed': 'Authentication failed', 'vars.authUnavailable': 'Windows Hello is not set up — confirm the access manually',
  'hist.title': 'History', 'hist.empty': 'No history yet', 'hist.deleteSelected': 'Delete selected', 'hist.clearAll': 'Clear history for this request', 'hist.pick': 'Select an entry', 'hist.selectAll': 'Select all',
  'log.level': 'Level', 'log.autoscroll': 'Follow new lines', 'log.clear': 'Clear', 'log.copyAll': 'Copy all',
  'ctx.newRequest': 'New request', 'ctx.newFolder': 'New folder', 'ctx.rename': 'Rename', 'ctx.duplicate': 'Duplicate', 'ctx.delete': 'Delete', 'ctx.run': 'Run in Runner', 'ctx.addHeader': 'Folder headers…', 'ctx.copyCurl': 'Copy as cURL', 'ctx.export': 'Export…',
  'folder.headers': 'Folder headers (applied to all nested requests)',
  'set.title': 'Settings', 'set.language': 'Language', 'set.langAuto': 'System default', 'set.storage': 'Storage', 'set.storageDesc': 'Folder for collections, variables and history',
  'set.backupEnable': 'Duplicate writes to the backup folder', 'set.backupDesc': 'Backup storage path. When enabled, every change is written to both folders. A cloud-synced folder can be used as the backup.',
  'set.timeout': 'Request timeout, s', 'set.history': 'History retention', 'set.historyUnit': 'Unit', 'set.days': 'days', 'set.months': 'months', 'set.autosave': 'Autosave',
  'set.autosaveDesc': 'When off, changed requests are saved only on request', 'set.hotkeys': 'Keyboard shortcuts…', 'set.pathsOk': 'All paths are available', 'set.logLevel': 'Log level',
  'set.version': 'Version {0}, build {1}',
  'warn.pathUnavailable': 'Storage path unavailable', 'warn.checkPaths': 'Check paths in Settings',
  'close.title': 'Unsaved requests', 'close.message': 'Request “{0}” has unsaved changes.', 'close.saveFail': 'Could not save',
  'hot.title': 'Keyboard shortcuts', 'hot.action': 'Action', 'hot.keys': 'Keys',
  'hot.send': 'Send request', 'hot.newRequest': 'New request', 'hot.newFolder': 'New folder', 'hot.save': 'Save request', 'hot.import': 'Import', 'hot.export': 'Export collection', 'hot.rename': 'Rename selected', 'hot.duplicate': 'Duplicate selected', 'hot.delete': 'Delete selected',
  'hot.close': 'Delete the new unsaved request', 'hot.find': 'Find in window', 'hot.undoWin': 'Undo in the active area', 'hot.redoWin': 'Redo in the active area', 'hot.undoApp': 'Undo (whole app)', 'hot.redoApp': 'Redo (whole app)',
  'hot.comment': 'Toggle comment in scripts', 'hot.focusSearch': 'Focus collection search', 'hot.settings': 'Settings', 'hot.runner': 'Open the Runner for the selection', 'hot.hotkeys': 'Show this window',
  'file.responsePrefix': 'Response', 'file.saveTitle': 'Save response body', 'file.csvErrors': 'Errors', 'file.csvTitle': 'Save errors CSV',
  'err.invalidJson': 'JSON is invalid; formatted the valid parts', 'err.noRun': 'Nothing to run', 'status.ready': 'Ready', 'msg.copied': 'Copied',
  'dlg.confirmDelete': 'Delete “{0}”?',
};
const ru = {
  'tab.request': 'Запрос', 'tab.runner': 'Раннер', 'tab.globals': 'Переменные', 'tab.history': 'История', 'tab.log': 'Журнал',
  'btn.import': 'Импорт', 'btn.settings': 'Настройки', 'btn.newRequest': 'Новый запрос', 'btn.newFolder': 'Новая папка', 'btn.export': 'Экспорт',
  'btn.send': 'Отправить', 'btn.save': 'Сохранить', 'btn.cancel': 'Отмена', 'btn.delete': 'Удалить', 'btn.rename': 'Переименовать', 'btn.duplicate': 'Дублировать',
  'btn.run': 'Запустить', 'btn.pause': 'Пауза', 'btn.resume': 'Продолжить', 'btn.stop': 'Остановить', 'btn.beautify': 'Beautify', 'btn.add': 'Добавить', 'btn.close': 'Закрыть',
  'btn.override': 'Переопределить', 'btn.preview': 'Предпросмотр', 'btn.errorsCsv': 'CSV ошибок', 'btn.chooseFile': 'Выбрать файл…', 'btn.clear': 'Очистить', 'btn.copy': 'Копировать',
  'btn.saveBody': 'Сохранить тело', 'btn.browse': 'Обзор…', 'btn.checkPaths': 'Проверить пути', 'btn.saveAll': 'Сохранить все', 'btn.discard': 'Отменить', 'btn.discardAll': 'Отменить все',
  'btn.parse': 'Разобрать', 'btn.reveal': 'Показать', 'btn.hide': 'Скрыть', 'btn.hotkeys': 'Горячие клавиши',
  'search.placeholder': 'Поиск…', 'search.byContent': 'По содержимому', 'search.count': '{0} из {1}', 'search.none': 'Не найдено', 'search.find': 'Найти',
  'req.params': 'Параметры', 'req.headers': 'Заголовки', 'req.body': 'Тело', 'req.scripts': 'Скрипты', 'req.preScript': 'PreScript', 'req.postScript': 'PostScript',
  'req.auto': 'Автоматические', 'req.inherited': 'Унаследован от папки «{0}»', 'req.key': 'Ключ', 'req.value': 'Значение', 'req.name': 'Название', 'req.url': 'URL запроса',
  'req.authError': 'Токен авторизации пуст или некорректен', 'req.unsaved': 'Не сохранён', 'req.newName': 'Новый запрос', 'req.folderName': 'Новая папка', 'req.saveAs': 'Название запроса',
  'body.noBody': 'У этого запроса нет тела', 'body.file': 'Файл', 'body.type': 'Тип', 'body.text': 'Текст',
  'res.response': 'Ответ', 'res.request': 'Запрос', 'res.visualize': 'Визуализация', 'res.console': 'Консоль', 'res.headers': 'Заголовки', 'res.empty': '<пусто>', 'res.noResult': 'Результата пока нет',
  'res.sending': 'Отправка…', 'res.error': 'Ошибка', 'res.size': 'Размер', 'res.time': 'Время', 'res.tests': 'Тесты', 'res.noViz': 'Нет визуализации: используйте pm.visualizer.set() в скрипте PostScript',
  'res.bodyLabel': 'Тело', 'res.loading': 'Форматирование…',
  'curl.copy': 'Копировать как cURL',
  'import.title': 'Импорт', 'import.collection': 'Коллекция Postman (файл)', 'import.curl': 'Вставить команду cURL', 'import.curlPlaceholder': 'curl -X POST https://… (формат bash, cmd или PowerShell)',
  'import.done': 'Импортировано: запросов {0}, переменных {1}', 'import.error': 'Ошибка импорта: {0}',
  'runner.target': 'Цель', 'runner.iterations': 'Итерации', 'runner.interval': 'Интервал, мс', 'runner.data': 'Файл данных (CSV/JSON)', 'runner.noData': 'Файл не выбран',
  'runner.progress': 'Прогресс', 'runner.state.idle': 'Ожидание', 'runner.state.running': 'Выполняется', 'runner.state.paused': 'Пауза', 'runner.state.stopped': 'Остановлен', 'runner.state.finished': 'Завершён',
  'runner.pickTarget': 'Выберите папку или запрос в списке', 'runner.variables': 'Переменные', 'runner.requests': 'Запросы', 'runner.previewTitle': 'Предпросмотр', 'runner.rows': 'строк: {0}',
  'runner.results': 'Результаты', 'runner.details': 'Подробности',
  'vars.title': 'Переменные', 'vars.add': 'Добавить переменную', 'vars.secret': 'Секрет', 'vars.locked': 'скрыто', 'vars.authPrompt': 'Postwoman: подтвердите доступ к секретным переменным',
  'vars.authFailed': 'Аутентификация не пройдена', 'vars.authUnavailable': 'Windows Hello не настроен — подтвердите доступ вручную',
  'hist.title': 'История', 'hist.empty': 'История пуста', 'hist.deleteSelected': 'Удалить выбранные', 'hist.clearAll': 'Очистить историю запроса', 'hist.pick': 'Выберите запись', 'hist.selectAll': 'Выбрать все',
  'log.level': 'Уровень', 'log.autoscroll': 'Следить за новыми строками', 'log.clear': 'Очистить', 'log.copyAll': 'Копировать всё',
  'ctx.newRequest': 'Новый запрос', 'ctx.newFolder': 'Новая папка', 'ctx.rename': 'Переименовать', 'ctx.duplicate': 'Дублировать', 'ctx.delete': 'Удалить', 'ctx.run': 'Запустить в Раннере', 'ctx.addHeader': 'Заголовки папки…', 'ctx.copyCurl': 'Копировать как cURL', 'ctx.export': 'Экспорт…',
  'folder.headers': 'Заголовки папки (применяются ко всем вложенным запросам)',
  'set.title': 'Настройки', 'set.language': 'Язык', 'set.langAuto': 'Как в системе', 'set.storage': 'Хранилище', 'set.storageDesc': 'Папка для хранения коллекций, переменных и истории',
  'set.backupEnable': 'Дублировать запись в резервную папку', 'set.backupDesc': 'Резервный путь для хранения. Если настройка включена, каждое изменение записывается в обе папки. В качестве резервной может использоваться облачная папка.',
  'set.timeout': 'Таймаут запроса, с', 'set.history': 'Срок хранения истории', 'set.historyUnit': 'Единица', 'set.days': 'дней', 'set.months': 'месяцев', 'set.autosave': 'Автосохранение',
  'set.autosaveDesc': 'Если выключено, изменённые запросы сохраняются только по команде', 'set.hotkeys': 'Горячие клавиши…', 'set.pathsOk': 'Все пути доступны', 'set.logLevel': 'Уровень журнала',
  'set.version': 'Версия {0}, билд {1}',
  'warn.pathUnavailable': 'Путь хранения недоступен', 'warn.checkPaths': 'Проверить пути в Настройках',
  'close.title': 'Несохранённые запросы', 'close.message': 'В запросе «{0}» есть несохранённые изменения.', 'close.saveFail': 'Не удалось сохранить',
  'hot.title': 'Горячие клавиши', 'hot.action': 'Действие', 'hot.keys': 'Клавиши',
  'hot.send': 'Отправить запрос', 'hot.newRequest': 'Новый запрос', 'hot.newFolder': 'Новая папка', 'hot.save': 'Сохранить запрос', 'hot.import': 'Импорт', 'hot.export': 'Экспорт коллекции', 'hot.rename': 'Переименовать выбранное', 'hot.duplicate': 'Дублировать выбранное', 'hot.delete': 'Удалить выбранное',
  'hot.close': 'Удалить новый несохранённый запрос', 'hot.find': 'Поиск в окне', 'hot.undoWin': 'Отмена в активной области', 'hot.redoWin': 'Повтор в активной области', 'hot.undoApp': 'Отмена (во всей программе)', 'hot.redoApp': 'Повтор (во всей программе)',
  'hot.comment': 'Комментирование в скриптах', 'hot.focusSearch': 'Фокус на поиск по коллекции', 'hot.settings': 'Настройки', 'hot.runner': 'Открыть Раннер для выделенного', 'hot.hotkeys': 'Показать это окно',
  'file.responsePrefix': 'Ответ', 'file.saveTitle': 'Сохранить тело ответа', 'file.csvErrors': 'Ошибки', 'file.csvTitle': 'Сохранить CSV ошибок',
  'err.invalidJson': 'JSON некорректен; отформатированы корректные части', 'err.noRun': 'Нечего запускать', 'status.ready': 'Готово', 'msg.copied': 'Скопировано',
  'dlg.confirmDelete': 'Удалить «{0}»?',
};
// Core UI subset for the remaining languages (missing keys fall back to English)
const C = (a) => Object.fromEntries(['tab.request','tab.runner','tab.globals','tab.history','tab.log','btn.import','btn.settings','btn.newRequest','btn.newFolder','btn.send','btn.save','btn.cancel','btn.delete','btn.rename','req.params','req.headers','req.body','req.scripts','res.response','res.request','res.visualize','search.placeholder','search.byContent','set.title','set.language','btn.run'].map((k, i) => [k, a[i]]));
const packs = {
  zh: C(['请求','运行器','变量','历史','日志','导入','设置','新建请求','新建文件夹','发送','保存','取消','删除','重命名','参数','请求头','请求体','脚本','响应','请求','可视化','搜索…','按内容','设置','语言','运行']),
  hi: C(['अनुरोध','रनर','वेरिएबल','इतिहास','लॉग','आयात','सेटिंग्स','नया अनुरोध','नया फ़ोल्डर','भेजें','सहेजें','रद्द करें','हटाएं','नाम बदलें','पैरामीटर','हेडर','बॉडी','स्क्रिप्ट','प्रतिक्रिया','अनुरोध','विज़ुअलाइज़','खोजें…','सामग्री से','सेटिंग्स','भाषा','चलाएं']),
  es: C(['Solicitud','Ejecutor','Variables','Historial','Registro','Importar','Ajustes','Nueva solicitud','Nueva carpeta','Enviar','Guardar','Cancelar','Eliminar','Renombrar','Parámetros','Cabeceras','Cuerpo','Scripts','Respuesta','Solicitud','Visualizar','Buscar…','Por contenido','Ajustes','Idioma','Ejecutar']),
  ar: C(['الطلب','المشغّل','المتغيرات','السجل','السجلّ','استيراد','الإعدادات','طلب جديد','مجلد جديد','إرسال','حفظ','إلغاء','حذف','إعادة تسمية','المعاملات','الترويسات','المحتوى','السكربتات','الاستجابة','الطلب','التصور','بحث…','حسب المحتوى','الإعدادات','اللغة','تشغيل']),
  fr: C(['Requête','Exécuteur','Variables','Historique','Journal','Importer','Paramètres','Nouvelle requête','Nouveau dossier','Envoyer','Enregistrer','Annuler','Supprimer','Renommer','Paramètres','En-têtes','Corps','Scripts','Réponse','Requête','Visualiser','Rechercher…','Par contenu','Paramètres','Langue','Exécuter']),
  pt: C(['Requisição','Executor','Variáveis','Histórico','Registro','Importar','Configurações','Nova requisição','Nova pasta','Enviar','Salvar','Cancelar','Excluir','Renomear','Parâmetros','Cabeçalhos','Corpo','Scripts','Resposta','Requisição','Visualizar','Pesquisar…','Por conteúdo','Configurações','Idioma','Executar']),
  de: C(['Anfrage','Runner','Variablen','Verlauf','Protokoll','Importieren','Einstellungen','Neue Anfrage','Neuer Ordner','Senden','Speichern','Abbrechen','Löschen','Umbenennen','Parameter','Header','Body','Skripte','Antwort','Anfrage','Visualisieren','Suchen…','Nach Inhalt','Einstellungen','Sprache','Ausführen']),
  ja: C(['リクエスト','ランナー','変数','履歴','ログ','インポート','設定','新規リクエスト','新規フォルダ','送信','保存','キャンセル','削除','名前変更','パラメータ','ヘッダー','ボディ','スクリプト','レスポンス','リクエスト','可視化','検索…','内容で検索','設定','言語','実行']),
  ko: C(['요청','러너','변수','기록','로그','가져오기','설정','새 요청','새 폴더','보내기','저장','취소','삭제','이름 바꾸기','매개변수','헤더','본문','스크립트','응답','요청','시각화','검색…','내용으로','설정','언어','실행']),
  tr: C(['İstek','Çalıştırıcı','Değişkenler','Geçmiş','Günlük','İçe aktar','Ayarlar','Yeni istek','Yeni klasör','Gönder','Kaydet','İptal','Sil','Yeniden adlandır','Parametreler','Başlıklar','Gövde','Betikler','Yanıt','İstek','Görselleştir','Ara…','İçeriğe göre','Ayarlar','Dil','Çalıştır']),
  it: C(['Richiesta','Esecutore','Variabili','Cronologia','Registro','Importa','Impostazioni','Nuova richiesta','Nuova cartella','Invia','Salva','Annulla','Elimina','Rinomina','Parametri','Intestazioni','Corpo','Script','Risposta','Richiesta','Visualizza','Cerca…','Per contenuto','Impostazioni','Lingua','Esegui']),
  vi: C(['Yêu cầu','Trình chạy','Biến','Lịch sử','Nhật ký','Nhập','Cài đặt','Yêu cầu mới','Thư mục mới','Gửi','Lưu','Hủy','Xóa','Đổi tên','Tham số','Tiêu đề','Nội dung','Tập lệnh','Phản hồi','Yêu cầu','Trực quan hóa','Tìm kiếm…','Theo nội dung','Cài đặt','Ngôn ngữ','Chạy']),
  pl: C(['Żądanie','Runner','Zmienne','Historia','Dziennik','Importuj','Ustawienia','Nowe żądanie','Nowy folder','Wyślij','Zapisz','Anuluj','Usuń','Zmień nazwę','Parametry','Nagłówki','Treść','Skrypty','Odpowiedź','Żądanie','Wizualizacja','Szukaj…','Po zawartości','Ustawienia','Język','Uruchom']),
  id: C(['Permintaan','Runner','Variabel','Riwayat','Log','Impor','Pengaturan','Permintaan baru','Folder baru','Kirim','Simpan','Batal','Hapus','Ganti nama','Parameter','Header','Isi','Skrip','Respons','Permintaan','Visualisasi','Cari…','Berdasarkan isi','Pengaturan','Bahasa','Jalankan']),
  th: C(['คำขอ','รันเนอร์','ตัวแปร','ประวัติ','บันทึก','นำเข้า','การตั้งค่า','คำขอใหม่','โฟลเดอร์ใหม่','ส่ง','บันทึก','ยกเลิก','ลบ','เปลี่ยนชื่อ','พารามิเตอร์','ส่วนหัว','เนื้อหา','สคริปต์','การตอบกลับ','คำขอ','แสดงภาพ','ค้นหา…','ตามเนื้อหา','การตั้งค่า','ภาษา','รัน']),
  nl: C(['Verzoek','Runner','Variabelen','Geschiedenis','Logboek','Importeren','Instellingen','Nieuw verzoek','Nieuwe map','Verzenden','Opslaan','Annuleren','Verwijderen','Hernoemen','Parameters','Headers','Body','Scripts','Antwoord','Verzoek','Visualiseren','Zoeken…','Op inhoud','Instellingen','Taal','Uitvoeren']),
  fa: C(['درخواست','اجراکننده','متغیرها','تاریخچه','گزارش','درون‌ریزی','تنظیمات','درخواست جدید','پوشه جدید','ارسال','ذخیره','لغو','حذف','تغییر نام','پارامترها','هدرها','بدنه','اسکریپت‌ها','پاسخ','درخواست','بصری‌سازی','جستجو…','بر اساس محتوا','تنظیمات','زبان','اجرا']),
  he: C(['בקשה','מריץ','משתנים','היסטוריה','יומן','ייבוא','הגדרות','בקשה חדשה','תיקייה חדשה','שליחה','שמירה','ביטול','מחיקה','שינוי שם','פרמטרים','כותרות','גוף','סקריפטים','תגובה','בקשה','הצגה חזותית','חיפוש…','לפי תוכן','הגדרות','שפה','הרצה']),
  sv: C(['Förfrågan','Körare','Variabler','Historik','Logg','Importera','Inställningar','Ny förfrågan','Ny mapp','Skicka','Spara','Avbryt','Ta bort','Byt namn','Parametrar','Rubriker','Innehåll','Skript','Svar','Förfrågan','Visualisera','Sök…','Efter innehåll','Inställningar','Språk','Kör']),
  cs: C(['Požadavek','Spouštěč','Proměnné','Historie','Protokol','Importovat','Nastavení','Nový požadavek','Nová složka','Odeslat','Uložit','Zrušit','Smazat','Přejmenovat','Parametry','Hlavičky','Tělo','Skripty','Odpověď','Požadavek','Vizualizace','Hledat…','Podle obsahu','Nastavení','Jazyk','Spustit']),
  ro: C(['Cerere','Rulator','Variabile','Istoric','Jurnal','Importă','Setări','Cerere nouă','Dosar nou','Trimite','Salvează','Anulează','Șterge','Redenumește','Parametri','Antete','Corp','Scripturi','Răspuns','Cerere','Vizualizare','Căutare…','După conținut','Setări','Limbă','Rulează']),
  bn: C(['অনুরোধ','রানার','ভেরিয়েবল','ইতিহাস','লগ','আমদানি','সেটিংস','নতুন অনুরোধ','নতুন ফোল্ডার','পাঠান','সংরক্ষণ','বাতিল','মুছুন','নাম পরিবর্তন','প্যারামিটার','হেডার','বডি','স্ক্রিপ্ট','প্রতিক্রিয়া','অনুরোধ','ভিজ্যুয়ালাইজ','অনুসন্ধান…','বিষয়বস্তু অনুযায়ী','সেটিংস','ভাষা','চালান']),
};
const names = { en: 'English', ru: 'Русский', uk: 'Українська (рос. написание)', zh: '中文', hi: 'हिन्दी', es: 'Español', ar: 'العربية', fr: 'Français', pt: 'Português', de: 'Deutsch', ja: '日本語', ko: '한국어', tr: 'Türkçe', it: 'Italiano', vi: 'Tiếng Việt', pl: 'Polski', id: 'Bahasa Indonesia', th: 'ไทย', nl: 'Nederlands', fa: 'فارسی', he: 'עברית', sv: 'Svenska', cs: 'Čeština', ro: 'Română', bn: 'বাংলা' };
const dicts = { en, ru: { ...en, ...ru }, uk: { ...en, ...ru } };
for (const k of Object.keys(packs)) dicts[k] = { ...en, ...packs[k] };
const RTL = new Set(['ar', 'fa', 'he']);
function resolve(pref, systemLocale) {
  if (pref && pref !== 'auto' && dicts[pref]) return pref;
  const l = String(systemLocale || 'en').toLowerCase().split(/[-_]/)[0];
  return dicts[l] ? l : 'en';
}
function make(lang) {
  const d = dicts[lang] || en;
  const t = (key, ...a) => String(d[key] ?? en[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => a[+i] ?? '');
  t.lang = lang; t.rtl = RTL.has(lang); return t;
}
return { dicts, names, resolve, make, RTL, list: Object.keys(names) };
});
