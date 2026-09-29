import { DEFAULT_SETTINGS, readSettings } from './shared';

const settings = await readSettings();
document.body.innerHTML = `<main><header><i></i><div><h1>Snapmark</h1><p>Настройки по умолчанию</p></div></header><section><label><span>Цвет аннотаций</span><input id="color" type="color" value="${settings.color}"></label><label><span>Толщина линии</span><div><input id="width" type="range" min="2" max="10" value="${settings.lineWidth}"><output>${settings.lineWidth} px</output></div></label><label class="row"><input id="fill" type="checkbox" ${settings.shapeFill ? 'checked' : ''}><span>Заливка прямоугольников и овалов (12%)</span></label><label class="row"><input id="close" type="checkbox" ${settings.copyCloses ? 'checked' : ''}><span>Закрывать редактор после копирования</span></label><div class="shortcut"><strong>Горячая клавиша запуска</strong><output id="shortcut">Проверяем…</output><p>Работает, когда Chrome в фокусе. Системные сочетания Linux/Ubuntu имеют приоритет.</p><button id="shortcuts">Настроить в Chrome</button></div><button id="reset">Сбросить настройки</button><p id="saved">Изменения сохраняются автоматически</p></section></main>`;
const style = document.createElement('style');
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#151a21;color:#eef3f8;font:14px Inter,system-ui,sans-serif}main{width:min(620px,calc(100% - 40px));margin:50px auto}header{display:flex;align-items:center;gap:13px;margin-bottom:22px}header i{width:35px;height:35px;border-radius:9px;background:#4c8dff}h1{font-size:22px;margin:0}header p{margin:3px 0 0;color:#93a0b2}section{background:#202630;border:1px solid #374151;border-radius:12px;padding:22px;box-shadow:0 20px 60px #0003}label{display:grid;gap:9px;margin-bottom:24px;color:#cdd6e1}label>div{display:flex;align-items:center;gap:14px}.row{display:flex;align-items:center;gap:10px}input[type=color]{width:54px;height:34px;border:1px solid #4a5665;border-radius:7px;background:transparent}input[type=range]{width:260px;accent-color:#4c8dff}input[type=checkbox]{accent-color:#4c8dff}output{color:#91a0b3}button{border:1px solid #455163;background:#28313d;color:#e9eef5;border-radius:7px;padding:8px 12px;cursor:pointer}button:hover{border-color:#4c8dff}.shortcut{display:grid;gap:8px;margin:4px 0 24px;padding:13px;border:1px solid #384657;border-radius:8px;background:#1a212b}.shortcut output{font:600 16px ui-monospace,monospace;color:#eef3f8}.shortcut p{margin:0;color:#93a0b2;font-size:12px;line-height:1.4}#saved{color:#8190a3;font-size:12px}`;
document.head.append(style);
const color = document.querySelector<HTMLInputElement>('#color')!;
const width = document.querySelector<HTMLInputElement>('#width')!;
const fill = document.querySelector<HTMLInputElement>('#fill')!;
const close = document.querySelector<HTMLInputElement>('#close')!;
const output = document.querySelector<HTMLOutputElement>('output')!;
const shortcut = document.querySelector<HTMLOutputElement>('#shortcut')!;
const save = async () => { output.value = `${width.value} px`; await chrome.storage.sync.set({ color: color.value.toUpperCase(), lineWidth: Number(width.value), shapeFill: fill.checked, copyCloses: close.checked }); };
[color, width, fill, close].forEach((input) => input.addEventListener('input', () => void save()));
document.querySelector<HTMLButtonElement>('#reset')!.addEventListener('click', async () => { await chrome.storage.sync.set(DEFAULT_SETTINGS); location.reload(); });
const refreshShortcut = async () => {
  const command = (await chrome.commands.getAll()).find((item) => item.name === 'capture-screenshot');
  shortcut.value = command?.shortcut || 'Не назначена';
};
void refreshShortcut();
document.querySelector<HTMLButtonElement>('#shortcuts')!.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'SNAPMARK_OPEN_SHORTCUTS' }));
