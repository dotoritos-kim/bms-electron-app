import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { IpcInvokeChannel, IpcInvokeMap, IpcSendChannel, IpcSendMap } from '../../shared/ipc-contract';

/**
 * Typed wrapper around `ipcMain.handle()`.
 *
 * Enforces argument and return-type alignment with the central
 * `IpcInvokeMap` defined in `src/shared/ipc-contract.ts`.
 */
export function handle<K extends IpcInvokeChannel>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeMap[K]['in']
  ) => Promise<IpcInvokeMap[K]['out']> | IpcInvokeMap[K]['out'],
): void {
  ipcMain.handle(channel, handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown);
}

/**
 * Typed wrapper for fire-and-forget messages from main to renderer.
 *
 * Use `webContents.send()` directly when the channel is dynamic;
 * prefer this helper when the channel is statically known.
 */
export function sendToRenderer<K extends IpcSendChannel>(
  webContents: Electron.WebContents,
  channel: K,
  ...args: IpcSendMap[K]
): void {
  webContents.send(channel, ...args);
}
