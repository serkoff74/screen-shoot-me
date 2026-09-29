export type OverlayReply = { ok?: boolean; error?: string } | undefined;
export type LaunchResult = 'overlay' | 'fallback' | 'error';

type LaunchActions = {
  send: () => Promise<OverlayReply>;
  inject: () => Promise<void>;
  fallback: () => Promise<void>;
  overlayError: (message: string) => Promise<void>;
};

function assertOverlayStarted(reply: OverlayReply, afterInjection = false): void {
  if (reply?.ok) return;
  const suffix = afterInjection ? ' после инъекции' : '';
  throw new Error(reply?.error ?? `Content script не запустил overlay${suffix}`);
}

export async function launchOverlay(actions: LaunchActions): Promise<LaunchResult> {
  try {
    assertOverlayStarted(await actions.send());
    return 'overlay';
  } catch { /* Получателя может не быть на вкладке, открытой до установки расширения. */ }

  try {
    await actions.inject();
  } catch {
    await actions.fallback();
    return 'fallback';
  }

  try {
    assertOverlayStarted(await actions.send(), true);
    return 'overlay';
  } catch (error) {
    await actions.overlayError(error instanceof Error ? error.message : 'overlay не запустился после инъекции');
    return 'error';
  }
}
