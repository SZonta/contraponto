import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ContrapontoApi, UiEvent } from '@shared/types';

const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`cp:${channel}`, ...args);

const api: ContrapontoApi = {
  listProjects: invoke('listProjects') as ContrapontoApi['listProjects'],
  addProject: invoke('addProject') as ContrapontoApi['addProject'],
  listChats: invoke('listChats') as ContrapontoApi['listChats'],
  createChat: invoke('createChat') as ContrapontoApi['createChat'],
  updateChat: invoke('updateChat') as ContrapontoApi['updateChat'],
  deleteChat: invoke('deleteChat') as ContrapontoApi['deleteChat'],
  listEntries: invoke('listEntries') as ContrapontoApi['listEntries'],
  sendMessage: invoke('sendMessage') as ContrapontoApi['sendMessage'],
  interrupt: invoke('interrupt') as ContrapontoApi['interrupt'],
  pickAttachments: invoke('pickAttachments') as ContrapontoApi['pickAttachments'],
  // Dropped files only expose their path here, in the preload.
  attachFile: (file) => ipcRenderer.invoke('cp:attachPath', webUtils.getPathForFile(file)),
  saveAttachment: invoke('saveAttachment') as ContrapontoApi['saveAttachment'],
  resolveApproval: invoke('resolveApproval') as ContrapontoApi['resolveApproval'],
  listPendingApprovals: invoke('listPendingApprovals') as ContrapontoApi['listPendingApprovals'],
  runningChats: invoke('runningChats') as ContrapontoApi['runningChats'],
  backgroundTasks: invoke('backgroundTasks') as ContrapontoApi['backgroundTasks'],
  listModels: invoke('listModels') as ContrapontoApi['listModels'],
  getUsage: invoke('getUsage') as ContrapontoApi['getUsage'],
  getSettings: invoke('getSettings') as ContrapontoApi['getSettings'],
  updateSettings: invoke('updateSettings') as ContrapontoApi['updateSettings'],
  undoTurn: invoke('undoTurn') as ContrapontoApi['undoTurn'],
  listSchedules: invoke('listSchedules') as ContrapontoApi['listSchedules'],
  saveSchedule: invoke('saveSchedule') as ContrapontoApi['saveSchedule'],
  pauseSchedule: invoke('pauseSchedule') as ContrapontoApi['pauseSchedule'],
  deleteSchedule: invoke('deleteSchedule') as ContrapontoApi['deleteSchedule'],
  getDesktopSettings: invoke('getDesktopSettings') as ContrapontoApi['getDesktopSettings'],
  setStartWithWindows: invoke('setStartWithWindows') as ContrapontoApi['setStartWithWindows'],
  onEvent: (listener) => {
    const handler = (_event: unknown, payload: UiEvent) => listener(payload);
    ipcRenderer.on('cp:event', handler);
    return () => ipcRenderer.removeListener('cp:event', handler);
  },
};

contextBridge.exposeInMainWorld('contraponto', api);
