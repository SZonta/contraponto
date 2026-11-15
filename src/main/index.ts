import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import type { AgentId, AgentUsage, ApprovalDecision, Attachment, ChatSettings, UiEvent } from '@shared/types';
import { ClaudeAdapter } from './agents/claude/claude-adapter';
import { CodexAdapter } from './agents/codex/codex-adapter';
import { AttachmentStore } from './attachments';
import { ChatService } from './chat/chat-service';
import { stripHostAgentEnv } from './env';
import { Store } from './storage/store';
import { UsageService } from './usage/usage-service';

stripHostAgentEnv();

// Development only: lets scripts drive the window through the DevTools protocol.
if (process.env.CONTRAPONTO_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.CONTRAPONTO_DEBUG_PORT);

const here = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

// Lets the window show local images (attachments, generated textures) without opening file:// to it.
protocol.registerSchemesAsPrivileged([{ scheme: 'cp-file', privileges: { secure: true, supportFetchAPI: true, stream: true } }]);

let window: BrowserWindow | null = null;

function emit(event: UiEvent): void {
  window?.webContents.send('cp:event', event);
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Contraponto',
    backgroundColor: '#1c1b19',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, '../preload/index.cjs'), sandbox: true, contextIsolation: true },
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(path.join(here, '../renderer/index.html'));
  window.on('closed', () => {
    window = null;
  });
}

app.whenReady().then(() => {
  const dataFolder = app.getPath('userData');
  const store = new Store(path.join(dataFolder, 'contraponto.db'));
  // Development only: registers a folder without the picker, for scripted checks.
  if (process.env.CONTRAPONTO_SEED_PROJECT) store.addProject(process.env.CONTRAPONTO_SEED_PROJECT);
  const attachments = new AttachmentStore(path.join(dataFolder, 'attachments'));
  const usage = new UsageService(store, emit);
  const claude = new ClaudeAdapter();
  const codex = new CodexAdapter();
  codex.onUsage = (report) => usage.update('codex', report);
  const adapters: Record<AgentId, ClaudeAdapter | CodexAdapter> = { claude, codex };
  const chats = new ChatService(store, adapters, usage, emit);

  protocol.handle('cp-file', (request) => {
    const file = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return new Response('Not allowed', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const handle = (channel: string, handler: (...args: any[]) => unknown) =>
    ipcMain.handle(`cp:${channel}`, (_event, ...args) => handler(...args));

  handle('listProjects', () => store.listProjects());
  handle('addProject', async () => {
    const result = await dialog.showOpenDialog(window!, { title: 'Escolha a pasta do projeto', properties: ['openDirectory'] });
    return result.canceled || !result.filePaths[0] ? null : store.addProject(result.filePaths[0]);
  });
  handle('listChats', (projectId: string) => store.listChats(projectId));
  handle('createChat', (projectId: string) => {
    // A new chat starts with the settings of the most recent one in the same project.
    const last = store.listChats(projectId)[0];
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
  handle('updateChat', (chatId: string, settings: ChatSettings) => store.updateChat(chatId, settings));
  handle('deleteChat', (chatId: string) => store.deleteChat(chatId));
  handle('listEntries', (chatId: string) => store.listEntries(chatId));
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
  handle('listModels', (agent: AgentId) => adapters[agent].listModels());
  handle('getUsage', () => usage.list());

  createWindow();

  // Fresh plan usage at startup; neither read spends tokens.
  for (const agent of ['claude', 'codex'] as const) {
    adapters[agent]
      .readUsage()
      .then((report: Omit<AgentUsage, 'agent'> | null) => report && usage.update(agent, report))
      .catch((error: unknown) => console.error(`[usage] ${agent}:`, error));
  }

  app.on('window-all-closed', () => {
    claude.dispose();
    codex.dispose();
    store.close();
    app.quit();
  });
});
