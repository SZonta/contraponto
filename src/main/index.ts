import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, powerMonitor, powerSaveBlocker, protocol, shell, Tray } from 'electron';
import { CHAT_TITLE_LIMIT } from '@shared/chat-title';
import type { AgentId, AgentUsage, AppSettings, ApprovalDecision, Attachment, ChatSettings, ScheduleInput, UiEvent } from '@shared/types';
import { ClaudeAdapter } from './agents/claude/claude-adapter';
import { CodexAdapter } from './agents/codex/codex-adapter';
import { AttachmentStore } from './attachments';
import { ChatService } from './chat/chat-service';
import { ChatTitleGenerator } from './chat/chat-title-generator';
import { stripHostAgentEnv } from './env';
import { SettingsService } from './orchestrator/settings-service';
import { Timeline } from './timeline/timeline';
import { Store } from './storage/store';
import { removeFolder } from './storage/remove-folder';
import { UsageService } from './usage/usage-service';
import { Scheduler } from './scheduler/scheduler';

stripHostAgentEnv();

// Development only: lets scripts drive the window through the DevTools protocol.
if (import.meta.env.DEV && !app.isPackaged && process.env.CONTRAPONTO_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.CONTRAPONTO_DEBUG_PORT);

const here = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// Lets the window show local images (attachments, generated textures) without opening file:// to it.
protocol.registerSchemesAsPrivileged([{ scheme: 'cp-file', privileges: { secure: true, supportFetchAPI: true, stream: true } }]);

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.resolve(here, '../../build/icon.ico');

function showWindow(): void {
  if (!window) createWindow();
  if (window!.isMinimized()) window!.restore();
  window!.show();
  window!.focus();
}

function emit(event: UiEvent): void {
  window?.webContents.send('cp:event', event);
  if (event.type === 'approval' && window && !window.isVisible()) {
    tray?.displayBalloon({ title: 'Contraponto precisa de aprovação', content: event.request.title });
  }
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Contraponto',
    icon: iconPath,
    backgroundColor: '#1c1b19',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1c1b19', symbolColor: '#ece7df', height: 32 },
    webPreferences: { preload: path.join(here, '../preload/index.cjs'), sandbox: true, contextIsolation: true },
  });
  if (import.meta.env.DEV && !app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(path.join(here, '../renderer/index.html'));
  // Links in answers open in the user's browser; the window itself never navigates away.
  const openExternally = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternally(url);
  });
  // A crashed renderer leaves a blank window; record why and load the UI again.
  window.webContents.on('render-process-gone', (_event, details) => {
    appendFileSync(path.join(app.getPath('userData'), 'renderer-crash.log'), `${new Date().toISOString()} ${details.reason} ${details.exitCode}\n`);
    if (details.reason !== 'clean-exit') window?.reload();
  });
  window.on('closed', () => {
    window = null;
  });
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window!.hide();
    }
  });
}

/** Removes private chat folders no chat uses anymore (left by locked deletes or older versions). */
function sweepScratchFolders(root: string, store: Store): void {
  const used = new Set(store.listProjects().filter((project) => project.scratch).map((project) => path.resolve(project.path).toLowerCase()));
  let names: string[];
  try { names = readdirSync(root); } catch { return; }
  for (const name of names) {
    const folder = path.resolve(root, name);
    if (!used.has(folder.toLowerCase())) void removeFolder(folder).catch(() => {});
  }
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
// Keep the tray and scheduler alive even if a renderer closes its window.
app.on('window-all-closed', () => {});

if (primaryInstance) app.whenReady().then(() => {
  app.setAppUserModelId('dev.szonta.contraponto');
  const dataFolder = app.getPath('userData');
  const store = new Store(path.join(dataFolder, 'contraponto.db'));
  // Development only: registers a folder without the picker, for scripted checks.
  if (import.meta.env.DEV && !app.isPackaged && process.env.CONTRAPONTO_SEED_PROJECT) store.addProject(process.env.CONTRAPONTO_SEED_PROJECT);
  sweepScratchFolders(path.join(dataFolder, 'chats'), store);
  const attachments = new AttachmentStore(path.join(dataFolder, 'attachments'));
  const usage = new UsageService(store, emit);
  const claude = new ClaudeAdapter();
  const codex = new CodexAdapter();
  codex.onUsage = (report) => usage.update('codex', report);
  const adapters: Record<AgentId, ClaudeAdapter | CodexAdapter> = { claude, codex };
  const settings = new SettingsService(store);
  const timeline = new Timeline(store, path.join(dataFolder, 'shadow'));
  const previews = path.join(dataFolder, 'previews');
  mkdirSync(previews, { recursive: true });
  const previewScript = app.isPackaged ? path.join(process.resourcesPath, 'blender/render_preview.py') : path.resolve(here, '../../scripts/blender/render_preview.py');
  const titles = new ChatTitleGenerator();
  const chats = new ChatService(store, adapters, usage, settings, timeline, emit, { script: previewScript, directory: previews }, (text, agent) => titles.generate(text, agent));
  const scheduler = new Scheduler(store, async (schedule) => {
    const chat = schedule.continueChat ? store.getChat(schedule.chatId!) : store.createChat(schedule.projectId, { ...schedule.settings, title: Array.from(schedule.name).length <= CHAT_TITLE_LIMIT ? schedule.name : undefined });
    if (!chat || chat.projectId !== schedule.projectId) throw new Error('O chat do agendamento foi apagado. Edite o agendamento.');
    emit({ type: 'chatUpdated', chat });
    return { chatId: chat.id, status: await chats.sendAndWait(chat.id, schedule.prompt, schedule.settings) };
  }, {
    start: () => powerSaveBlocker.start('prevent-app-suspension'),
    stop: (id) => { if (powerSaveBlocker.isStarted(id)) powerSaveBlocker.stop(id); },
  }, () => emit({ type: 'schedulesChanged' }));

  protocol.handle('cp-file', (request) => {
    const file = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return new Response('Not allowed', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const handle = (channel: string, handler: (...args: any[]) => unknown) =>
    ipcMain.handle(`cp:${channel}`, (_event, ...args) => handler(...args));

  handle('listProjects', () => store.listProjects());
  handle('listChats', (projectId?: string) => store.listChats(projectId));
  handle('createChat', (projectId?: string) => {
    // A new chat starts with the settings of the most recent one in the same project, or anywhere.
    const last = store.listChats(projectId)[0];
    if (!projectId) {
      // Without a folder, the agents work in a private folder of their own.
      const folder = path.join(dataFolder, 'chats', randomUUID());
      mkdirSync(folder, { recursive: true });
      projectId = store.addProject(folder, true).id;
    }
    return store.createChat(
      projectId,
      last && {
        agent: last.agent,
        claudeModel: last.claudeModel,
        claudeEffort: last.claudeEffort,
        codexModel: last.codexModel,
        codexEffort: last.codexEffort,
        permissionLevel: last.permissionLevel,
      },
    );
  });
  handle('chooseChatFolder', async (chatId: string) => {
    const result = await dialog.showOpenDialog(window!, { title: 'Escolha a pasta da conversa', properties: ['openDirectory'] });
    return result.canceled || !result.filePaths[0] ? null : store.moveChat(chatId, result.filePaths[0]);
  });
  handle('updateChat', (chatId: string, settings: ChatSettings) => store.updateChat(chatId, settings));
  handle('deleteChat', (chatId: string) => {
    claude.closeChat(chatId);
    store.deleteChat(chatId);
  });
  handle('discardEmptyChat', (chatId: string) => store.deleteChatIfEmpty(chatId));
  handle('listEntries',(chatId: string) => store.listEntries(chatId));
  handle('sendMessage', (chatId: string, text: string, files: Attachment[]) => chats.send(chatId, text, files));
  handle('interrupt', (chatId: string) => chats.interrupt(chatId));
  handle('pickAttachments', async () => {
    const result = await dialog.showOpenDialog(window!, { title: 'Anexar arquivos', properties: ['openFile', 'multiSelections'] });
    return result.canceled ? [] : result.filePaths.map((file) => attachments.copy(file));
  });
  handle('attachPath', (file: string) => attachments.copy(file));
  handle('saveAttachment', (name: string, mimeType: string, bytes: Uint8Array) => attachments.save(name, mimeType, bytes));
  handle('resolveApproval', (id: string, decision: ApprovalDecision) => chats.resolveApproval(id, decision));
  handle('listPendingApprovals', () => chats.pendingApprovals());
  handle('runningChats', () => chats.runningChats());
  handle('backgroundTasks', () => chats.backgroundTasks());
  handle('listModels', (agent: AgentId) => adapters[agent].listModels());
  handle('getUsage', () => usage.list());
  handle('getSettings', () => settings.get());
  handle('updateSettings', (next: AppSettings) => settings.update(next));
  handle('undoTurn', (entryId: string) => chats.undoTurn(entryId));
  handle('listSchedules', () => store.listSchedules());
  handle('saveSchedule', (input: ScheduleInput, id?: string) => scheduler.save(input, id));
  handle('pauseSchedule', (id: string, paused: boolean) => scheduler.pause(id, paused));
  handle('deleteSchedule', (id: string) => scheduler.delete(id));
  handle('getDesktopSettings', () => ({ startWithWindows: app.getLoginItemSettings().openAtLogin, packaged: app.isPackaged }));
  handle('setStartWithWindows', (enabled: boolean) => {
    if (!app.isPackaged) throw new Error('Disponível no app instalado.');
    if (typeof enabled !== 'boolean') throw new Error('Valor inválido.');
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    return app.getLoginItemSettings().openAtLogin;
  });

  tray = new Tray(iconPath);
  tray.setToolTip('Contraponto');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: showWindow },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]));
  tray.on('double-click', showWindow);
  tray.on('balloon-click', showWindow);
  createWindow();
  scheduler.start();
  const resume = () => { void scheduler.tick(); };
  powerMonitor.on('resume', resume);
  app.on('activate', showWindow);

  // Fresh plan usage at startup; neither read spends tokens.
  for (const agent of ['claude', 'codex'] as const) {
    adapters[agent]
      .readUsage()
      .then((report: Omit<AgentUsage, 'agent'> | null) => report && usage.update(agent, report))
      .catch((error: unknown) => console.error(`[usage] ${agent}:`, error));
  }

  app.on('will-quit', () => {
    scheduler.stop();
    powerMonitor.removeListener('resume', resume);
    titles.dispose();
    claude.dispose();
    codex.dispose();
    tray?.destroy();
    store.close();
  });
});
