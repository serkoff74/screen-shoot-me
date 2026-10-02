# Browser QA

Проверка выполнена 2026-09-15 в Chrome for Testing 153.0.8010.36 с реально загруженным unpacked
`app/dist` (extension id `egoapejcamijpgkmjbnijkeeplkfkahh`).

## Overlay-first циклы

- `overlay-iteration-1/` — первый визуальный цикл. Зафиксировано живое выделение; прогон показал, что QA
  держал активной служебную extension-вкладку во время `captureVisibleTab`. Harness исправлен, продуктовый
  алгоритм не менялся.
- `overlay-iteration-2/` — второй и последний визуальный цикл. Зафиксированы live selection, inline editor,
  коралловая стрелка и прямоугольник, две подписи и чистые crop-примеры.
- Второй цикл выявил реальную ошибку порядка обработки клавиатуры: capture-listener на `window` останавливал
  `Enter` до textarea. После цикла порядок исправлен, контракт вынесен в `keyboard.ts` и закрыт unit-тестами.
  Третий визуальный цикл намеренно не запускался из-за лимита пользователя.

Основной путь в цикле 2 подтвердил: до `pointerup` снимка нет, после него появляется inline canvas на
исходных координатах, отдельное окно на HTTP-странице не создаётся, внешняя страница остаётся видимой под
12% маской, Copy работает, а панели не входят в crop.

## Актуальные доказательства

- `overlay-iteration-2/01-live-selection.png` — выделение поверх живой страницы.
- `overlay-iteration-2/02-inline-arrow-comment.png` — компактный редактор вокруг исходного фрагмента.
- `overlay-iteration-2/example-1-arrow-comment.png` — выбранная область со стрелкой и подписью.
- `overlay-iteration-2/example-2-rectangle-comment.png` — выбранная область с прямоугольником и подписью.
- `overlay-iteration-2/report.json` — сводка браузерных, статических и unit-проверок.

Системный выбор папки не автоматизировался: это нативный диалог Chrome. Production-путь проверяется по
единственному вызову `chrome.downloads.download` с обязательным `saveAs: true`; кнопка и `Ctrl+S` используют
один обработчик.

Папки `iteration-1/` и `iteration-2/` относятся к прежнему fullscreen-редактору и сохранены как legacy.
