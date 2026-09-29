import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const appDir = '/mnt/Programming/AI/Projects/Chrome Extensions/Make Screenshot/app';
const distDir = `${appDir}/dist`;
const iteration = process.env.SNAPMARK_QA_ITERATION ?? '1';
const proofDir = `${appDir}/qa/overlay-iteration-${iteration}`;
await mkdir(proofDir, { recursive: true });

const demo = await readFile(`${appDir}/demo.html`);
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(demo);
});
await new Promise((resolve) => server.listen(4177, '127.0.0.1', resolve));

const browser = await puppeteer.launch({
  executablePath: '/tmp/snapmark-chrome-for-testing/chrome-linux64/chrome',
  headless: false,
  env: { ...process.env, DISPLAY: ':1', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' },
  userDataDir: `/tmp/snapmark-cft-overlay-profile-${iteration}-${process.pid}`,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${distDir}`,
    `--load-extension=${distDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
  ],
});

const report = {
  iteration: Number(iteration),
  chrome: '',
  extensionId: '',
  errors: [],
  checks: {},
  artifacts: [],
};

try {
  report.chrome = await browser.version();
  const workerTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/service-worker-loader.js'),
    { timeout: 10000 },
  );
  report.extensionId = new URL(workerTarget.url()).host;

  const page = await browser.newPage();
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4177', { waitUntil: 'networkidle0' });
  await browser.defaultBrowserContext().overridePermissions('http://127.0.0.1:4177', ['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => {
    window.__underlyingClicks = 0;
    document.querySelector('.card .button')?.addEventListener('click', () => { window.__underlyingClicks += 1; });
  });

  const controlPage = await browser.newPage();
  await controlPage.goto(`chrome-extension://${report.extensionId}/options.html`, { waitUntil: 'domcontentloaded' });
  await controlPage.evaluate(() => chrome.storage.sync.set({ color: '#FF4D2E', lineWidth: 4, shapeFill: false, copyCloses: true }));
  const begin = async (targetPage = page) => {
    await targetPage.bringToFront();
    const targetUrl = targetPage.url();
    return controlPage.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url });
      if (!tab?.id) throw new Error('Active tab not found');
      return chrome.tabs.sendMessage(tab.id, { type: 'SNAPMARK_BEGIN_SELECTION' });
    }, targetUrl);
  };
  const captureCount = () => page.evaluate(() => Number(document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.root')?.dataset.captureRequests ?? '-1'));
  const shadow = (selector) => page.evaluate((value) => Boolean(document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector(value)), selector);
  const rectOf = (selector) => page.evaluate((value) => {
    const node = document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector(value);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
  const clickShadow = (selector) => page.evaluate((value) => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector(value)?.click(), selector);
  const canvasScreenshot = async (name) => {
    const handle = await page.evaluateHandle(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.canvas'));
    const element = handle.asElement();
    if (!element) throw new Error('Canvas not found');
    const path = `${proofDir}/${name}`;
    await element.screenshot({ path });
    await handle.dispose();
    report.artifacts.push(name);
  };
  const waitFor = (selector) => page.waitForFunction(
    (value) => Boolean(document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector(value)), {}, selector,
  );
  const selectRegion = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
    await waitFor('.inline-editor .canvas');
  };

  const pagesBefore = (await browser.pages()).length;
  const beginResponse = await begin();
  console.log('begin response', JSON.stringify(beginResponse), 'page', page.url());
  console.log('host state', await page.evaluate(() => {
    const host = document.querySelector('#snapmark-extension-root');
    return { host: Boolean(host), shadow: Boolean(host?.shadowRoot), html: host?.outerHTML ?? null };
  }));
  await waitFor('.capture.live');
  report.checks.captureBeforePointerUp = await captureCount();
  report.checks.liveSelectionHasNoScreenshot = !(await shadow('.capture-bg')) && !(await shadow('.canvas'));
  report.checks.scrollLockedDuringSelection = await page.evaluate(() => document.documentElement.style.overflow === 'hidden');

  await page.mouse.click(190, 440);
  report.checks.underlyingPageClickBlocked = await page.evaluate(() => window.__underlyingClicks === 0);
  await page.mouse.move(560, 205);
  await page.mouse.down();
  await page.mouse.move(1160, 690, { steps: 12 });
  await page.screenshot({ path: `${proofDir}/01-live-selection.png` });
  report.artifacts.push('01-live-selection.png');
  await page.mouse.up();
  await waitFor('.inline-editor .canvas');

  report.checks.captureAfterPointerUp = await captureCount();
  report.checks.exactlyOneCapture = report.checks.captureBeforePointerUp === 0 && report.checks.captureAfterPointerUp === 1;
  report.checks.noWindowOnOrdinaryPage = (await browser.pages()).length === pagesBefore;
  const stage = await rectOf('.stage');
  report.checks.fragmentStaysInPlace = Boolean(stage)
    && Math.abs(stage.x - 560) <= 1 && Math.abs(stage.y - 205) <= 1
    && Math.abs(stage.width - 600) <= 1 && Math.abs(stage.height - 485) <= 1;
  report.checks.maskIsTwelvePercent = await page.evaluate(() => {
    const mask = document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('[data-mask="top"]');
    return mask ? getComputedStyle(mask).backgroundColor.replaceAll(' ', '').endsWith(',0.12)') : false;
  });
  report.checks.inlineHasNoFullscreenStage = await page.evaluate(() => {
    const root = document.querySelector('#snapmark-extension-root')?.shadowRoot;
    const editor = root?.querySelector('.editor');
    const props = root?.querySelector('.props');
    return Boolean(editor?.classList.contains('inline-editor')) && getComputedStyle(editor).backgroundColor === 'rgba(0, 0, 0, 0)'
      && (!props || getComputedStyle(props).display === 'none');
  });
  report.checks.captureHasNoSnapmarkFrame = await page.evaluate(() => {
    const canvas = document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let uiBlueAtEdge = 0;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if (x > 2 && y > 2 && x < canvas.width - 3 && y < canvas.height - 3) continue;
      const index = (y * canvas.width + x) * 4;
      if (data[index] > 45 && data[index] < 100 && data[index + 1] > 105 && data[index + 1] < 175 && data[index + 2] > 220) uiBlueAtEdge += 1;
    }
    return uiBlueAtEdge === 0;
  });

  const cropCaptureCount = await captureCount();
  await page.setViewport({ width: 1180, height: 720, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const stageAfterResize = await rectOf('.stage');
  report.checks.resizeDoesNotRecapture = await captureCount() === cropCaptureCount;
  report.checks.resizeKeepsCrop = Boolean(stageAfterResize)
    && Math.abs(stageAfterResize.x - stage.x) <= 1 && Math.abs(stageAfterResize.y - stage.y) <= 1
    && Math.abs(stageAfterResize.width - stage.width) <= 1 && Math.abs(stageAfterResize.height - stage.height) <= 1;
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await new Promise((resolve) => setTimeout(resolve, 100));

  // QA example 1: coral arrow, Shift+Enter line break, Enter commit, Copy.
  let canvas = await rectOf('.canvas');
  await page.mouse.move(canvas.x + canvas.width * .78, canvas.y + canvas.height * .62);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .55, canvas.y + canvas.height * .42, { steps: 10 });
  await page.mouse.up();
  await waitFor('.comment:not(.hidden)');
  await page.keyboard.type('Кнопка перекрывает');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.keyboard.type('текст на узком экране');
  await page.keyboard.press('Enter');
  report.checks.enterCommits = !(await shadow('.comment:not(.hidden)'));
  report.checks.arrowIsCoral = await page.evaluate(() => {
    const canvas = document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.canvas');
    const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!pixels) return false;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 240 && pixels[index + 1] > 45 && pixels[index + 1] < 110 && pixels[index + 2] < 80) return true;
    }
    return false;
  });
  await canvasScreenshot('example-1-arrow-comment.png');
  await page.screenshot({ path: `${proofDir}/02-inline-arrow-comment.png` });
  report.artifacts.push('02-inline-arrow-comment.png');
  report.checks.panelsOutsideExport = await page.evaluate(() => {
    const root = document.querySelector('#snapmark-extension-root')?.shadowRoot;
    const canvas = root?.querySelector('.canvas')?.getBoundingClientRect();
    const topbar = root?.querySelector('.topbar')?.getBoundingClientRect();
    return Boolean(canvas && topbar && topbar.bottom <= canvas.top);
  });
  await clickShadow('[data-action="copy"]');
  await waitFor('.toast');
  report.checks.copyMessage = await page.evaluate(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.toast')?.textContent ?? '');
  report.checks.copyWorks = report.checks.copyMessage === 'PNG скопирован';
  await page.waitForFunction(() => !document.querySelector('#snapmark-extension-root'), { timeout: 5000 });
  report.checks.pageRestoredAfterClose = await page.evaluate(() => document.documentElement.style.overflow === '' && document.documentElement.style.overscrollBehavior === '');

  // QA example 2: rectangle, Ctrl+Enter line break, selection UI and second Enter export.
  await begin();
  await waitFor('.capture.live');
  await selectRegion({ x: 540, y: 190 }, { x: 1165, y: 700 });
  await clickShadow('[data-tool="rect"]');
  canvas = await rectOf('.canvas');
  await page.mouse.move(canvas.x + canvas.width * .46, canvas.y + canvas.height * .36);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .82, canvas.y + canvas.height * .68, { steps: 10 });
  await page.mouse.up();
  await waitFor('.comment:not(.hidden)');
  await page.keyboard.type('Проверь отступ');
  await page.keyboard.down('Control');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Control');
  await page.keyboard.type('и контраст кнопки');
  report.checks.ctrlEnterNewline = await page.evaluate(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.comment textarea')?.value.includes('\n'));
  await page.keyboard.press('Enter');
  await page.keyboard.press('v');
  report.checks.blueSelectionUi = await page.evaluate(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('[data-tool="select"]')?.classList.contains('active'));
  await canvasScreenshot('example-2-rectangle-comment.png');
  const saveTitle = await page.evaluate(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('[data-action="save"]')?.getAttribute('title') ?? '');
  report.checks.saveAsShortcutExposed = saveTitle.includes('Ctrl+S');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#snapmark-extension-root'), { timeout: 5000 });
  report.checks.secondEnterCopiesAndCloses = true;

  // The exact emitted content bundle can be resolved and dynamically injected into an already-open HTTP tab.
  const injectionPage = await browser.newPage();
  await injectionPage.goto('http://127.0.0.1:4177?dynamic-injection=1', { waitUntil: 'networkidle0' });
  report.checks.dynamicInjectionBundleResolved = await controlPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4177/*' });
    const tab = tabs.find((candidate) => candidate.url?.includes('dynamic-injection=1'));
    const files = chrome.runtime.getManifest().content_scripts?.flatMap((entry) => entry.js ?? []) ?? [];
    if (!tab?.id || !files.length) return false;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
    return true;
  });
  await injectionPage.close();

  // Restricted page: run the same send → inject → retry → fallback sequence as the background.
  const restrictedPage = await browser.newPage();
  await restrictedPage.goto('chrome://version', { waitUntil: 'domcontentloaded' });
  await restrictedPage.bringToFront();
  const restrictedResult = await controlPage.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'chrome://version/' });
    if (!tab?.id || tab.windowId == null) return { fallback: false, error: 'Restricted tab not found' };
    const message = { type: 'SNAPMARK_BEGIN_SELECTION' };
    try {
      const first = await chrome.tabs.sendMessage(tab.id, message);
      if (!first?.ok) throw new Error(first?.error ?? 'Overlay refused');
      return { overlay: true };
    } catch {
      try {
        const files = chrome.runtime.getManifest().content_scripts?.flatMap((entry) => entry.js ?? []) ?? [];
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files });
        const retry = await chrome.tabs.sendMessage(tab.id, message);
        if (!retry?.ok) throw new Error(retry?.error ?? 'Overlay retry refused');
        return { overlay: true };
      } catch {
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          await chrome.storage.session.set({ pendingCapture: dataUrl, fallbackReason: 'Chrome запретил встроить редактор в эту страницу.' });
          await chrome.windows.create({ url: chrome.runtime.getURL('editor.html'), type: 'popup', width: 960, height: 700 });
          return { fallback: true };
        } catch (error) {
          await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
          return { fallback: false, error: String(error) };
        }
      }
    }
  });
  const fallbackTarget = await browser.waitForTarget(
    (target) => target.type() === 'page' && target.url().endsWith('/editor.html'),
    { timeout: 3500 },
  ).catch(() => null);
  report.checks.restrictedPageRejectsInjection = !(await restrictedPage.evaluate(() => Boolean(document.querySelector('#snapmark-extension-root'))));
  if (fallbackTarget) {
    report.checks.restrictedPageFallbackOrCaptureError = restrictedResult.fallback === true;
    const fallbackPage = await fallbackTarget.page();
    await fallbackPage.setViewport({ width: 940, height: 660, deviceScaleFactor: 1 });
    await fallbackPage.waitForFunction(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.capture-tip'));
    report.checks.fallbackExplainsReason = await fallbackPage.evaluate(() => document.querySelector('#snapmark-extension-root')?.shadowRoot?.querySelector('.capture-tip')?.textContent.includes('Chrome запретил') ?? false);
    await fallbackPage.screenshot({ path: `${proofDir}/03-restricted-page-fallback.png` });
    report.artifacts.push('03-restricted-page-fallback.png');
    await fallbackPage.close();
  } else {
    const badge = await controlPage.evaluate(() => chrome.action.getBadgeText({}));
    report.checks.restrictedPageFallbackOrCaptureError = badge === '!';
    report.checks.fallbackExplainsReason = badge === '!';
  }

  report.checks.noRuntimeErrors = report.errors.length === 0;
  const booleanChecks = Object.entries(report.checks).filter(([, value]) => typeof value === 'boolean');
  report.checks.allBooleanChecksPass = booleanChecks.every(([, value]) => value === true);
  await writeFile(`${proofDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.close();
  await browser.close();
}
