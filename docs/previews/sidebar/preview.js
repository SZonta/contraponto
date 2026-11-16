const models = {
  essential: { number: '01', name: 'Essencial', description: 'Linhas leves, novo chat em terracota e configurações em um botão integrado ao rodapé.' },
  cards: { number: '02', name: 'Acolhedor', description: 'Ações em cartões, seleção em verde e configurações com ícone em uma base própria.' },
  studio: { number: '03', name: 'Estúdio', description: 'Ações agrupadas, novo chat em verde e seleção com uma linha em terracota.' },
};
const iconPaths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/><path d="M12 13v3l2 1"/><circle cx="12" cy="16" r="4" fill="var(--panel)"/><path d="M12 14v2l1.5 1"/>',
  settings: '<path d="M10 3h4l.7 2.5 2 .9L19 5.7l2 3.5-1.8 1.8v2l1.8 1.8-2 3.5-2.3-.7-2 .9L14 21h-4l-.7-2.5-2-.9-2.3.7-2-3.5L4.8 13v-2L3 9.2l2-3.5 2.3.7 2-.9Z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h3a7.5 7.5 0 0 1 7.5 7.5Z"/><path d="M7 10h8m-8 4h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  wave: '<path d="M2 12c3-10 6-10 10 0s7 10 10 0"/>',
  send: '<path d="M12 19V5m-5 5 5-5 5 5"/>',
};
const icon = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
const logo = '../../../build/icon.svg';
const model = document.body.dataset.model;
const comparing = model === 'compare';
const chatItem = (title, selected = false, time = '') => `<button class="chat-item" ${selected ? 'aria-current="page"' : ''} title="${title}">${icon('chat')}<span class="chat-title">${title}</span>${time ? `<span class="chat-time">${time}</span>` : ''}</button>`;

function sidebar(key) {
  return `<aside class="sidebar model-${key}" data-model="${key}" aria-label="Conversas — ${models[key].name}">
    <div class="brand"><img src="${logo}" alt=""><div><strong>Contraponto</strong>${key === 'cards' ? '<span class="brand-caption">Duas inteligências. Uma conversa.</span>' : ''}</div>${!comparing ? `<button class="mobile-close" aria-label="Fechar lateral">${icon('close')}</button>` : ''}</div>
    <nav class="top-actions" aria-label="Ações principais">
      <button class="nav-action new-chat">${icon('plus')}<span class="nav-copy">Novo chat</span></button>
      <button class="nav-action schedule">${icon('calendar')}<span class="nav-copy">Agendamentos</span><span class="count" aria-label="0 agendamentos ativos">0</span></button>
    </nav>
    <nav class="chat-list" aria-label="Histórico de conversas">
      <div class="section-label">Conversas<span class="section-count">3</span></div>
      <div class="loose-chats">${chatItem('Novo chat', true)}${chatItem('Ideias para a próxima versão', false, 'Hoje')}${chatItem('Revisão da interface', false, 'Ontem')}</div>
      <section class="folder"><button class="folder-heading" aria-expanded="true">${icon('folder')}<span>contraponto</span>${icon('down', 'chevron')}</button><div class="folder-chats">${chatItem('Ajustes na navegação')}${chatItem('Organização dos componentes e estados da interface')}</div></section>
    </nav>
    <footer class="settings-area"><button class="settings-button">${icon('settings')}<span class="settings-copy">Configurações<small>Preferências do aplicativo</small></span>${icon('chevron', 'chevron')}</button></footer>
    ${!comparing ? '<div class="resize-handle" role="separator" aria-orientation="vertical" aria-label="Largura da lateral" aria-valuemin="220" aria-valuemax="560" aria-valuenow="280" tabindex="0" title="Arraste para ajustar · Setas para mover · Duplo clique para restaurar"></div>' : ''}
  </aside>`;
}

function mainPane() {
  return `<main class="main-pane"><header class="main-header"><h1 class="main-title">Novo chat</h1><div class="usage">${[['Claude', 'var(--claude)', '24%', '24%'], ['Codex', 'var(--codex)', '12%', '12%']].map(([name, accent, value, quota]) => `<div class="usage-agent" style="--accent:${accent};--quota:${quota}"><strong>${name}</strong><div class="usage-numbers"><span>Sessão</span><span>${value}</span></div><div class="usage-bar"></div></div>`).join('')}</div></header>
    <div class="main-content"><div class="empty-state"><img src="${logo}" alt=""><h2>Tudo pronto para conversar</h2><p>Comece com um pedido pequeno. Se for trabalhar em arquivos, escolha a pasta no campo de mensagem.</p></div></div>
    <div class="composer"><textarea aria-label="Mensagem de exemplo" placeholder="O que você quer fazer?"></textarea><div class="composer-footer"><span class="composer-mode">${icon('wave')} Automático ${icon('down')}</span><span class="composer-folder">Escolher pasta</span><button class="send" disabled aria-label="Envio indisponível nesta prévia">${icon('send')}</button></div></div></main>`;
}

document.body.innerHTML = comparing
  ? `<header class="preview-toolbar"><img src="${logo}" width="23" height="23" alt=""><span class="preview-label">Contraponto / Estudo da lateral</span><span class="preview-label" style="margin-left:auto">Prévia · dados de exemplo</span></header>
    <main class="comparison"><div class="comparison-heading"><div><span class="preview-label">Mesmo tema. Três caminhos.</span><h1>Mais espaço para conversar.</h1><p>Agendamentos no topo. Configurações no lugar. Largura nas suas mãos.</p></div><div class="theme-swatches" aria-label="Paleta atual do aplicativo"><span style="--swatch:var(--claude)"></span><span style="--swatch:var(--codex)"></span><span style="--swatch:var(--muted)"></span></div></div>
    <div class="comparison-grid">${Object.entries(models).map(([key, value]) => `<article><div class="proposal-heading"><span class="proposal-number">${value.number}</span><h2>${value.name}</h2>${key === 'essential' ? '<span class="recommendation">Recomendado</span>' : ''}</div><div class="proposal-frame">${sidebar(key)}</div><p class="proposal-description">${value.description}</p><a class="proposal-link" href="${key}.html">Experimentar ${value.name}${icon('arrow')}</a></article>`).join('')}</div><p class="comparison-note">Abra uma proposta para arrastar a borda direita da lateral. Experimente também uma janela estreita. Nenhuma alteração aplicada ao app.</p></main>`
  : `<header class="preview-toolbar"><a class="back-link" href="index.html">${icon('back')} Comparar propostas</a><nav class="preview-tabs" aria-label="Propostas">${Object.entries(models).map(([key, value]) => `<a href="${key}.html" ${key === model ? 'aria-current="page"' : ''}>${value.number} ${value.name}</a>`).join('')}</nav></header>
    <div class="workspace"><button class="mobile-toggle" aria-label="Abrir lateral" aria-expanded="false">${icon('menu')}</button><button class="drawer-backdrop" aria-label="Fechar lateral"></button>${sidebar(model)}${mainPane()}</div>
    <footer class="preview-status"><span><strong>Prévia interativa</strong> · dados de exemplo</span><span class="resize-tip">Arraste a borda · use ← → · duplo clique restaura</span><output id="width-output" aria-live="off">Lateral: 280 px</output></footer>`;

const workspace = document.querySelector('.workspace');
const activeSidebar = workspace?.querySelector('.sidebar');
const separator = document.querySelector('.resize-handle');
const mobile = matchMedia('(max-width: 600px)');
let preferredWidth = 280;
try { preferredWidth = Number(localStorage.getItem(`sidebar-preview-${model}`)) || 280; } catch { /* Storage may be unavailable for local files. */ }

function widthLimit() { return Math.max(220, Math.min(560, innerWidth - 340)); }
function setWidth(value, persist = true) {
  if (!activeSidebar) return;
  const width = Math.round(Math.max(220, Math.min(mobile.matches ? innerWidth - 42 : widthLimit(), value)));
  activeSidebar.style.setProperty('--sidebar-width', `${width}px`);
  separator.setAttribute('aria-valuenow', String(width));
  separator.setAttribute('aria-valuemax', String(widthLimit()));
  document.querySelector('#width-output').textContent = `Lateral: ${width} px`;
  if (persist) {
    preferredWidth = width;
    try { localStorage.setItem(`sidebar-preview-${model}`, String(width)); } catch { /* Keep resizing available without storage. */ }
  }
}
function setDrawer(open) {
  if (!workspace) return;
  workspace.classList.toggle('drawer-open', open);
  document.querySelector('.mobile-toggle').setAttribute('aria-expanded', String(open));
  document.querySelector('.main-pane').inert = open;
  if (mobile.matches) {
    activeSidebar.inert = !open;
    (open ? document.querySelector('.mobile-close') : document.querySelector('.mobile-toggle')).focus();
  }
}

if (separator) {
  setWidth(preferredWidth, false);
  separator.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    separator.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  separator.addEventListener('pointermove', (event) => {
    if (separator.hasPointerCapture(event.pointerId)) setWidth(event.clientX - activeSidebar.getBoundingClientRect().left);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) separator.addEventListener(eventName, (event) => {
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId);
    document.body.classList.remove('resizing');
  });
  separator.addEventListener('dblclick', () => setWidth(280));
  separator.addEventListener('keydown', (event) => {
    const width = Number(separator.getAttribute('aria-valuenow'));
    const next = { ArrowLeft: width - (event.shiftKey ? 40 : 10), ArrowRight: width + (event.shiftKey ? 40 : 10), Home: 220, End: widthLimit() }[event.key];
    if (next !== undefined) { event.preventDefault(); setWidth(next); }
  });
  document.querySelector('.mobile-toggle').addEventListener('click', () => setDrawer(true));
  document.querySelector('.mobile-close').addEventListener('click', () => setDrawer(false));
  document.querySelector('.drawer-backdrop').addEventListener('click', () => setDrawer(false));
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setDrawer(false); });
  addEventListener('resize', () => {
    setWidth(preferredWidth, false);
    if (!mobile.matches) { workspace.classList.remove('drawer-open'); activeSidebar.inert = false; document.querySelector('.main-pane').inert = false; }
    else activeSidebar.inert = !workspace.classList.contains('drawer-open');
  });
  if (mobile.matches) activeSidebar.inert = true;
}

function showConversation(sidebarElement, button) {
  sidebarElement.querySelectorAll('[aria-current]').forEach((item) => item.removeAttribute('aria-current'));
  button.setAttribute('aria-current', 'page');
  if (!workspace) return;
  document.querySelector('.main-title').textContent = button.querySelector('.chat-title').textContent;
  document.querySelector('.composer').hidden = false;
  document.querySelector('.main-content').innerHTML = '<div class="empty-state"><h2>Conversa de exemplo</h2><p>Esta prévia demonstra a navegação e a largura da lateral. Suas conversas reais ficam no aplicativo.</p></div>';
  if (mobile.matches) setDrawer(false);
}

document.querySelectorAll('.sidebar').forEach((sidebarElement) => {
  sidebarElement.addEventListener('click', (event) => {
    const chat = event.target.closest('.chat-item');
    if (chat) showConversation(sidebarElement, chat);
  });
  sidebarElement.querySelector('.new-chat').addEventListener('click', () => {
    const list = sidebarElement.querySelector('.loose-chats');
    list.insertAdjacentHTML('afterbegin', chatItem('Novo chat'));
    sidebarElement.querySelector('.section-count').textContent = list.children.length;
    showConversation(sidebarElement, list.firstElementChild);
  });
  sidebarElement.querySelector('.folder-heading').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
    sidebarElement.querySelector('.folder-chats').hidden = open;
  });
  sidebarElement.querySelector('.schedule').addEventListener('click', (event) => {
    sidebarElement.querySelectorAll('[aria-current]').forEach((item) => item.removeAttribute('aria-current'));
    event.currentTarget.setAttribute('aria-current', 'page');
    if (!workspace) return;
    document.querySelector('.main-title').textContent = 'Agendamentos';
    document.querySelector('.composer').hidden = true;
    document.querySelector('.main-content').innerHTML = `<div class="empty-state">${icon('calendar')}<h2>Nenhum agendamento por aqui</h2><p>As tarefas agendadas aparecem aqui. Esta é uma prévia visual, sem conexão com os dados do app.</p></div>`;
    if (mobile.matches) setDrawer(false);
  });
  sidebarElement.querySelector('.settings-button').addEventListener('click', () => {
    const dialog = document.createElement('dialog');
    dialog.innerHTML = `<div class="dialog-heading"><h2>Configurações</h2><button aria-label="Fechar configurações">${icon('close')}</button></div><p>Prévia do acesso às configurações. As preferências e contas reais continuam no aplicativo.</p>${workspace ? `<label>Largura da lateral<input type="range" min="220" max="${widthLimit()}" value="${separator.getAttribute('aria-valuenow')}" aria-label="Largura da lateral em pixels"></label><button class="reset-width">Restaurar largura padrão</button>` : '<p>Abra uma proposta para experimentar o ajuste da largura.</p>'}`;
    document.body.append(dialog);
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (event) => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
    if (workspace) {
      const range = dialog.querySelector('input');
      range.addEventListener('input', () => setWidth(Number(range.value)));
      dialog.querySelector('.reset-width').addEventListener('click', () => { setWidth(280); range.value = separator.getAttribute('aria-valuenow'); });
    }
    dialog.showModal();
  });
});
