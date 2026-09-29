import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Snapmark',
  description: 'Быстрый снимок области с аннотациями и комментариями.',
  version: '0.1.0',
  minimum_chrome_version: '116',
  permissions: ['activeTab', 'scripting', 'storage', 'downloads', 'offscreen', 'clipboardWrite'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*', 'file:///*'],
      js: ['src/content.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_title: 'Snapmark — снимок области',
  },
  commands: {
    'capture-screenshot': {
      suggested_key: {
        default: 'Ctrl+Shift+S',
        mac: 'Command+Shift+S',
      },
      description: 'Сделать снимок области',
    },
  },
  options_page: 'options.html',
  web_accessible_resources: [
    {
      resources: ['editor.html', 'offscreen.html'],
      matches: ['<all_urls>'],
    },
  ],
});
