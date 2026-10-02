/**
 * NOVA Business AI - Embeddable Widget v2.1
 * Uses Shadow DOM for style isolation
 * Feature: Draggable widget (drag FAB or header to reposition)
 */
(function() {
  // Find script element using robust fallbacks
  let scriptTag = document.currentScript;
  if (!scriptTag || !scriptTag.getAttribute('data-widget-token')) {
    scriptTag = document.querySelector('script[data-widget-token]') || 
                document.querySelector('script[src*="widget.js"][data-widget-token]') ||
                document.querySelector('script[src*="widget.js"]');
  }

  // Extract widget token with fallbacks
  const widgetToken = (scriptTag && scriptTag.getAttribute('data-widget-token')) ||
                      window.NOVA_WIDGET_TOKEN ||
                      window.ARIA_WIDGET_TOKEN ||
                      null;

  if (!widgetToken) {
    console.error("NOVA AI Widget: Missing data-widget-token attribute or global token.");
    return;
  }

  // Track initialized tokens to ensure idempotency per token
  window.AriaWidgetInitializedTokens = window.AriaWidgetInitializedTokens || new Set();
  if (window.AriaWidgetInitializedTokens.has(widgetToken)) {
    return;
  }
  window.AriaWidgetInitializedTokens.add(widgetToken);
  window.AriaWidgetInitialized = true;

  // Determine API base URL
  const passedApiUrl = (scriptTag && scriptTag.getAttribute('data-api-url')) ||
                       window.NOVA_API_URL ||
                       window.ARIA_API_URL ||
                       null;

  let apiBaseUrl = passedApiUrl || "https://chat-bot-api-ns81.onrender.com"; 
  if (!passedApiUrl && scriptTag && scriptTag.src) {
    try {
      const url = new URL(scriptTag.src);
      if (url.port === "5173") {
        apiBaseUrl = `${url.protocol}//${url.hostname}:3000`;
      } else if (url.hostname === "localhost") {
        apiBaseUrl = url.origin;
      }
    } catch(e) {}
  }
  apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

  const storageKeyOpen = `aria_widget_open_${widgetToken}`;
  const storageKeyHistory = `aria_widget_history_${widgetToken}`;

  let config = null;
  let isOpen = sessionStorage.getItem(storageKeyOpen) === 'true';
  let isMobile = window.innerWidth <= 768;

  let contextEngine = null;
  let contextSessionId = null;

  async function initContextEngine() {
    if (!config.contextEngine || !config.contextEngine.enabled) return;
    
    try {
      const engineUrl = scriptTag && scriptTag.src ? scriptTag.src.replace('widget.js', 'widget-context-engine.js') : `${apiBaseUrl}/widget-context-engine.js`;
      
      const script = document.createElement('script');
      script.src = engineUrl;
      script.onload = () => {
        if (window.AriaContextEngine) {
          contextEngine = new window.AriaContextEngine({
            maxPayloadBytes: config.contextEngine.maxContextSizeBytes || 6144
          });
          contextEngine.start(document.body);
          
          contextSessionId = sessionStorage.getItem(`aria_ctx_session_${widgetToken}`);
          if (!contextSessionId) {
            contextSessionId = Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem(`aria_ctx_session_${widgetToken}`, contextSessionId);
          }
          
          if (config.contextEngine.developerDebugMode) {
            setInterval(async () => {
              try {
                const debugStatus = shadow.querySelector('#debug-status');
                const debugStats = shadow.querySelector('#debug-stats');
                if (debugStatus && debugStats) {
                  const ctx = await contextEngine.getContext();
                  const size = new Blob([JSON.stringify(ctx)]).size;
                  
                  debugStatus.innerHTML = `<span style="color:#0f0;">Status: Active</span><br/>Time: ${ctx.extractionDurationMs || 0}ms | Size: ${(size / 1024).toFixed(2)} KB`;
                  
                  debugStats.innerHTML = `
                    <div style="margin-top:4px;">Forms: ${ctx.content?.forms?.length || 0}</div>
                    <div>Tables: ${ctx.content?.tables?.length || 0}</div>
                    <div>Cards: ${ctx.content?.cards?.length || 0}</div>
                    <div>Errors: ${ctx.state?.visibleErrors?.length || 0}</div>
                  `;
                }
              } catch(err) {
                 const debugStatus = shadow.querySelector('#debug-status');
                 if(debugStatus) debugStatus.innerText = "Status: Error extracting context";
              }
            }, 2000);
          }
        }
      };
      document.head.appendChild(script);

      // Also load action engine
      const actionEngineUrl = scriptTag && scriptTag.src ? scriptTag.src.replace('widget.js', 'widget-action-engine.js') : `${apiBaseUrl}/widget-action-engine.js`;
      const actionScript = document.createElement('script');
      actionScript.src = actionEngineUrl;
      document.head.appendChild(actionScript);
    } catch (e) {
      console.error("Failed to init context engine", e);
    }
  }

  const container = document.createElement('div');
  container.id = 'aria-ai-widget-root';
  
  // Shadow DOM initialization
  const shadow = container.attachShadow({ mode: 'open' });

  async function loadConfig() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/widget/${widgetToken}/config`);
      if (!res.ok) throw new Error("Failed to load config");
      config = await res.json();
      render();
      initContextEngine();
    } catch (err) {
      console.error("NOVA AI Widget Initialization failed:", err);
    }
  }

  function getBaseStyles() {
    const themeColor = config.themeColor || "#8B5CF6";
    return `
      :host {
        --primary: ${themeColor};
        --bg-dark: #09090b;
        --bg-panel: #18181b;
        --border: #27272a;
        --text-main: #f4f4f5;
        --text-muted: #a1a1aa;
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        top: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }
      
      * { box-sizing: border-box; }

      .widget-wrapper {
        position: fixed;
        z-index: 2147483647;
        pointer-events: none !important;
        width: 56px;
        height: 56px;
        /* Default: bottom-right corner — top/left will be set via JS */
        bottom: 24px;
        right: 24px;
      }

      /* JS will override with top/left after first layout */
      .widget-wrapper.draggable-ready {
        bottom: auto !important;
        right: auto !important;
      }

      /* Floating Button */
      .floating-button {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: var(--primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        cursor: pointer;
        border: none;
        outline: none;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto !important;
      }
      .floating-button:hover { transform: scale(1.05); }
      .floating-button svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; }

      /* Chat Panel */
      .chat-panel {
        position: absolute;
        bottom: calc(100% + 24px);
        right: 0;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 100px);
        background-color: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        pointer-events: none !important;
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1);
        transform-origin: bottom right;
      }

      /* Dynamic Alignments */
      .widget-wrapper.align-top .chat-panel {
        bottom: auto;
        top: calc(100% + 24px);
        transform-origin: top right;
      }
      .widget-wrapper.align-left .chat-panel {
        right: auto;
        left: 0;
        transform-origin: bottom left;
      }
      .widget-wrapper.align-top.align-left .chat-panel {
        bottom: auto;
        top: calc(100% + 24px);
        right: auto;
        left: 0;
        transform-origin: top left;
      }

      .chat-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto !important;
      }

      /* Mobile Full Screen */
      @media (max-width: 768px) {
        .chat-panel {
          position: fixed !important;
          top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          width: 100%; height: 100%; max-height: 100%;
          border-radius: 0;
          transform: translateY(100%);
        }
        .chat-panel.open { transform: translateY(0) scale(1); }
      }

      .header {
        background-color: var(--primary);
        padding: 16px;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-info { display: flex; align-items: center; gap: 12px; }
      .avatar { 
        width: 32px; height: 32px; border-radius: 50%; 
        background: rgba(255,255,255,0.2); 
        display: flex; align-items: center; justify-content: center; font-weight: bold;
      }
      .title { font-weight: 600; font-size: 16px; margin: 0; line-height: 1.2; }
      .subtitle { font-size: 11px; opacity: 0.8; margin-top: 2px; }
      
      .close-btn { 
        background: none; border: none; color: white; cursor: pointer; padding: 4px; opacity: 0.8;
      }
      .close-btn:hover { opacity: 1; }
      
      .messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background-color: var(--bg-dark);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* Global Scrollbar for everything inside Shadow DOM */
      * {
        scrollbar-width: thin;
        scrollbar-color: #52525b transparent;
      }

      ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      ::-webkit-scrollbar-track {
        background: transparent;
      }

      ::-webkit-scrollbar-thumb {
        background: #52525b;
        border-radius: 9999px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: #71717a;
      }

      ::-webkit-scrollbar-corner {
        background: transparent;
      }

      .message {
        max-width: 85%;
        font-size: 14px;
        line-height: 1.5;
        padding: 12px 16px;
        border-radius: 16px;
        word-wrap: break-word;
      }

      .message.bot {
        align-self: flex-start;
        background-color: var(--bg-panel);
        color: var(--text-main);
        border: 1px solid var(--border);
        border-bottom-left-radius: 4px;
      }

      .message.user {
        align-self: flex-end;
        background-color: var(--primary);
        color: white;
        border-bottom-right-radius: 4px;
      }

      .input-area {
        padding: 16px;
        background-color: var(--bg-panel);
        border-top: 1px solid var(--border);
      }

      .input-wrapper {
        display: flex;
        background: var(--bg-dark);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 4px;
        align-items: center;
      }

      .input-wrapper input {
        flex: 1;
        background: none;
        border: none;
        color: var(--text-main);
        padding: 8px 16px;
        font-size: 14px;
        outline: none;
      }

      .send-btn {
        background: var(--primary);
        color: white;
        border: none;
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        margin-right: 2px;
      }
      .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .send-btn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }

      .typing-indicator {
        display: none;
        align-items: center;
        gap: 4px;
        padding: 12px 16px;
        background-color: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        width: fit-content;
      }
      .typing-indicator.visible { display: flex; }
      .typing-dot { width: 6px; height: 6px; background: var(--text-muted); border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
      .typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .typing-dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

      .feedback-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        border-top: 1px solid var(--border);
        padding-top: 8px;
      }
      .fb-btn {
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.7;
        font-size: 14px;
        padding: 4px;
        transition: opacity 0.2s, transform 0.2s;
      }
      .fb-btn:hover:not(:disabled) {
        opacity: 1;
        transform: scale(1.1);
      }

      ${config.customCss || ''}
    `;
  }

  let chatHistory = [];
  try {
    const saved = sessionStorage.getItem(storageKeyHistory);
    if (saved) {
      chatHistory = JSON.parse(saved);
      if (!Array.isArray(chatHistory)) chatHistory = [];
    }
  } catch (e) {
    chatHistory = [];
  }

  function saveHistory(history) {
    const capped = history.slice(-50);
    try {
      sessionStorage.setItem(storageKeyHistory, JSON.stringify(capped));
    } catch (e) {
      console.warn("NOVA AI Widget: failed to save chat history to sessionStorage:", e);
    }
  }

  function renderMessages() {
    const messagesContainer = shadow.querySelector('#messages-container');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '';
    
    if (config && config.welcomeMessage) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'message bot';
      welcomeDiv.innerHTML = formatMessageText(config.welcomeMessage);
      messagesContainer.appendChild(welcomeDiv);
    }
    
    chatHistory.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${msg.role === 'assistant' ? 'bot' : 'user'}`;
      msgDiv.innerHTML = formatMessageText(msg.content);
      messagesContainer.appendChild(msgDiv);
    });
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.id = 'typing-indicator';
    typingIndicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    messagesContainer.appendChild(typingIndicator);
    
    scrollToBottom();
  }

  function formatMessageText(text) {
    if (!text) return "";
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
      
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/^\*\s+(.*?)$/gm, "&bull; $1");
    escaped = escaped.replace(/\n/g, "<br>");
    return escaped;
  }

  function render() {
    if (config.displayMode === "custom" && config.customContainerId) {
      const customDiv = document.getElementById(config.customContainerId);
      if (customDiv) {
         customDiv.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    } else {
      document.body.appendChild(container);
    }

    const isBottomLeft = config.position === "bottom-left";

    shadow.innerHTML = `
      <style>${getBaseStyles()}</style>
      <div class="widget-wrapper" id="widget-wrapper">
        ${config.displayMode !== 'custom' ? `
        <div class="chat-panel ${isOpen ? 'open' : ''}">
          <div class="header">
            <div class="header-info">
              <div class="avatar">${config.botName.charAt(0)}</div>
              <div>
                <div class="title">${config.botName}</div>
                <div class="subtitle">Online</div>
              </div>
            </div>
            <button class="close-btn" aria-label="Close chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="messages" id="messages-container"></div>
          ${config.contextEngine?.developerDebugMode ? `
          <div class="debug-panel" id="debug-panel" style="font-size: 11px; background: #000; color: #0f0; padding: 8px; border-top: 1px solid #27272a; max-height: 120px; overflow-y: auto; font-family: monospace;">
            <div style="font-weight:bold; margin-bottom: 4px;">🛠️ Context Engine Debug</div>
            <div id="debug-status">Status: Waiting for engine...</div>
            <div id="debug-stats"></div>
          </div>
          ` : ''}
          <div class="input-area">
            ${config.isLocked ? `
              <div style="text-align: center; color: var(--text-muted); font-size: 13px; font-weight: 500; padding: 4px 8px;">
                🔒 Chat disabled: ${config.lockedReason || "Subscription or Trial expired."}
              </div>
            ` : `
              <form id="chat-form" class="input-wrapper">
                <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off">
                <button type="submit" class="send-btn">
                   <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                </button>
              </form>
            `}
          </div>
        </div>
        <button class="floating-button" aria-label="Open chat" style="${isOpen ? 'display:none;' : ''}">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        ` : `
          <!-- Custom Container Mode is just the panel always open -->
          <div class="chat-panel open" style="position:relative; bottom:0; right:0; width:100%; height:100%; transform:none;">
            <!-- Same interior... -->
            <div class="header">
              <div class="header-info">
                <div class="avatar">${config.botName.charAt(0)}</div>
                <div><div class="title">${config.botName}</div></div>
              </div>
            </div>
            <div class="messages" id="messages-container"></div>
            ${config.contextEngine?.developerDebugMode ? `
            <div class="debug-panel" id="debug-panel" style="font-size: 11px; background: #000; color: #0f0; padding: 8px; border-top: 1px solid #27272a; max-height: 120px; overflow-y: auto; font-family: monospace;">
              <div style="font-weight:bold; margin-bottom: 4px;">🛠️ Context Engine Debug</div>
              <div id="debug-status">Status: Waiting for engine...</div>
              <div id="debug-stats"></div>
            </div>
            ` : ''}
             <div class="input-area">
               ${config.isLocked ? `
                 <div style="text-align: center; color: var(--text-muted); font-size: 13px; font-weight: 500; padding: 4px 8px;">
                   🔒 Chat disabled: ${config.lockedReason || "Subscription or Trial expired."}
                 </div>
               ` : `
                 <form id="chat-form" class="input-wrapper">
                   <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off">
                   <button type="submit" class="send-btn">
                      <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                   </button>
                 </form>
               `}
             </div>
          </div>
        `}
      </div>
    `;

    renderMessages();
    bindEvents();
  }

  function bindEvents() {
    const fab = shadow.querySelector('.floating-button');
    const closeBtn = shadow.querySelector('.close-btn');
    const panel = shadow.querySelector('.chat-panel');
    const form = shadow.querySelector('#chat-form');
    const input = shadow.querySelector('#chat-input');
    const messagesContainer = shadow.querySelector('#messages-container');
    const typingIndicator = shadow.querySelector('#typing-indicator');

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let wrapperStartLeft = 0;
    let wrapperStartTop = 0;
    
    const wrapper = shadow.querySelector('.widget-wrapper');
    const header = shadow.querySelector('.header');

    // Initialize top/left positioning from current rendered position
    function initDraggablePosition() {
      const hostRect = container.getBoundingClientRect();
      const rect = wrapper.getBoundingClientRect();
      wrapper.style.left = (rect.left - hostRect.left) + 'px';
      wrapper.style.top = (rect.top - hostRect.top) + 'px';
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.classList.add('draggable-ready');
      updateAlignment();
    }

    function updateAlignment() {
      if (!wrapper.classList.contains('draggable-ready')) return;
      const rect = wrapper.getBoundingClientRect();
      const isTopHalf = rect.top < window.innerHeight / 2;
      const isLeftHalf = rect.left < window.innerWidth / 2;
      
      if (isTopHalf) wrapper.classList.add('align-top');
      else wrapper.classList.remove('align-top');
      
      if (isLeftHalf) wrapper.classList.add('align-left');
      else wrapper.classList.remove('align-left');
    }

    function clampToViewport(left, top) {
      let w = 56, h = 56;
      let minLeft = 0;
      let minTop = 0;
      let maxLeft = window.innerWidth - w;
      let maxTop = window.innerHeight - h;

      if (isOpen) {
        // Constrain so the chat panel itself stays within the screen
        const panelW = 380;
        const panelH = Math.min(600, window.innerHeight - 100);
        const isAlignTop = wrapper.classList.contains('align-top');
        const isAlignLeft = wrapper.classList.contains('align-left');

        if (isAlignLeft) {
          minLeft = 0;
          maxLeft = window.innerWidth - panelW;
        } else {
          minLeft = panelW - w;
          maxLeft = window.innerWidth - w;
        }

        if (isAlignTop) {
          minTop = 0;
          maxTop = window.innerHeight - h - 24 - panelH;
        } else {
          maxTop = window.innerHeight - h;
          minTop = panelH + 24;
        }
        
        // Failsafe for small screens to just clamp to viewport
        if (maxLeft < minLeft) maxLeft = minLeft;
        if (maxTop < minTop) maxTop = minTop;
      }

      return {
        left: Math.max(minLeft, Math.min(left, maxLeft)),
        top: Math.max(minTop, Math.min(top, maxTop)),
      };
    }

    const onMove = (e) => {
      e.preventDefault();
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;

      const dx = clientX - dragStartX;
      const dy = clientY - dragStartY;
      if (!isDragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isDragging = true;
      }
      if (!isDragging) return;

      const hostRect = container.getBoundingClientRect();
      const viewportLeft = wrapperStartLeft + hostRect.left + dx;
      const viewportTop = wrapperStartTop + hostRect.top + dy;
      
      const clamped = clampToViewport(viewportLeft, viewportTop);
      wrapper.style.left = (clamped.left - hostRect.left) + 'px';
      wrapper.style.top = (clamped.top - hostRect.top) + 'px';
      
      // Update alignment quadrant only when closed so it doesn't jump while open
      if (!isOpen) {
        updateAlignment();
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      if (header) header.style.cursor = 'grab';
      
      // Final alignment check if we were dragging the closed FAB
      if (!isOpen) {
        updateAlignment();
      }
      
      setTimeout(() => { isDragging = false; }, 50);
    };

    const onDown = (e) => {
      // Allow drag if it's the floating button itself
      const isFab = e.target && e.target.closest && e.target.closest('.floating-button');
      
      if (!isFab && e.target && e.target.closest) {
        // Exclude close button, form inputs, links, and message content from initiating drag
        if (e.target.closest('.close-btn') || 
            e.target.closest('#chat-form') || 
            e.target.closest('button') || 
            e.target.closest('a') ||
            e.target.closest('.message')) {
          return;
        }
      }
      
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;

      // Switch to top/left positioning on first drag attempt
      if (!wrapper.classList.contains('draggable-ready')) {
        initDraggablePosition();
      }

      const hostRect = container.getBoundingClientRect();
      const rect = wrapper.getBoundingClientRect();
      dragStartX = clientX;
      dragStartY = clientY;
      wrapperStartLeft = rect.left - hostRect.left;
      wrapperStartTop = rect.top - hostRect.top;
      if (header) header.style.cursor = 'grabbing';

      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchend', onUp);
    };

    if (fab) {
      fab.addEventListener('mousedown', onDown);
      fab.addEventListener('touchstart', onDown, { passive: false });

      fab.addEventListener('click', (e) => {
        if (isDragging) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        isOpen = true;
        
        // Ensure it has absolute coordinates before clamping
        if (!wrapper.classList.contains('draggable-ready')) {
          initDraggablePosition();
        }
        
        // Snap the wrapper to a valid position so the panel opens fully on-screen
        const hostRect = container.getBoundingClientRect();
        const rect = wrapper.getBoundingClientRect();
        const clamped = clampToViewport(rect.left, rect.top);
        wrapper.style.left = (clamped.left - hostRect.left) + 'px';
        wrapper.style.top = (clamped.top - hostRect.top) + 'px';

        sessionStorage.setItem(storageKeyOpen, 'true');
        panel.classList.add('open');
        fab.style.display = 'none';
        setTimeout(() => input && input.focus(), 300);
      });
    }

    // Allow dragging from any empty space in the chat panel
    if (panel) {
      panel.addEventListener('mousedown', onDown);
      panel.addEventListener('touchstart', onDown, { passive: false });
    }
    
    if (header) {
      header.style.cursor = 'grab';
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        isOpen = false;
        sessionStorage.setItem(storageKeyOpen, 'false');
        panel.classList.remove('open');
        if (fab) fab.style.display = 'flex';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        addMessage('user', text);
        
        chatHistory.push({ role: 'user', content: text });
        saveHistory(chatHistory);
        typingIndicator.classList.add('visible');
        messagesContainer.appendChild(typingIndicator); // Move to bottom
        scrollToBottom();

        try {
          let websiteContext = null;
          if (contextEngine) {
            try {
              // Retrieve new context if changed, otherwise fallback to the cached context from the previous turn
              websiteContext = await contextEngine.getContext() || contextEngine.getCachedContext();
            } catch (e) {
              console.error("Failed to get website context", e);
            }
          }

          // Merge manually injected context if present
          if (window.AriaHiddenContext) {
            if (!websiteContext) {
              websiteContext = { version: "1.0.0", segments: {} };
            }
            if (!websiteContext.segments) websiteContext.segments = {};
            websiteContext.segments.injectedContext = window.AriaHiddenContext;
            
            // Clear after consumption
            window.AriaHiddenContext = null;
          }

          const requestBody = { 
            messages: chatHistory,
            websiteContext,
            sessionId: contextSessionId
          };

          const res = await fetch(`${apiBaseUrl}/api/widget/${widgetToken}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });
          
          if (!res.ok) throw new Error("API Error");
          
          typingIndicator.classList.remove('visible');
          
          const botMsgDiv = document.createElement('div');
          botMsgDiv.className = 'message bot';
          messagesContainer.insertBefore(botMsgDiv, typingIndicator);
          scrollToBottom();
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let botResponse = "";
          let buffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                try {
                  const data = JSON.parse(trimmed.substring(6));
                  if (data.content) {
                    botResponse += data.content;
                    botMsgDiv.innerHTML = formatMessageText(botResponse);
                    scrollToBottom();
                  }
                  if (data.action) {
                    if (!window.AriaActionEngineInstance && window.AriaActionEngine) {
                       window.AriaActionEngineInstance = new window.AriaActionEngine();
                    }
                    if (window.AriaActionEngineInstance) {
                        const progressDiv = document.createElement('div');
                        progressDiv.className = 'message bot';
                        progressDiv.style.fontSize = '12px';
                        progressDiv.style.opacity = '0.8';
                        const actionLabel = data.action.actionType || data.action.type;
                        progressDiv.innerHTML = `<em>⚙️ Executing: ${actionLabel}...</em>`;
                        messagesContainer.insertBefore(progressDiv, typingIndicator);
                        scrollToBottom();
                        
                        if (data.security && data.security.requiresConfirmation) {
                           progressDiv.innerHTML = `⚠️ <b>Action Requires Approval</b><br>${data.security.reason}<br>
                           <button id="approve-btn-${data.action.id}" style="margin-top:4px; padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Approve</button>
                           <button id="reject-btn-${data.action.id}" style="margin-top:4px; margin-left: 4px; padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Reject</button>`;
                           
                           const approveBtn = progressDiv.querySelector(`#approve-btn-${data.action.id}`);
                           const rejectBtn = progressDiv.querySelector(`#reject-btn-${data.action.id}`);
                           
                           approveBtn.addEventListener('click', function() {
                              progressDiv.innerHTML = `<em>⚙️ Executing: ${actionLabel}...</em>`;
                              window.AriaActionEngineInstance.executeAction(data.action, widgetToken, data.executionId, apiBaseUrl, data.security.confirmationToken)
                               .then(res => { progressDiv.innerHTML = `✅ <em>Completed: ${actionLabel}</em>`; })
                               .catch(err => { progressDiv.innerHTML = `❌ <em>Failed: ${err.message}</em>`; });
                           });
                           
                           rejectBtn.addEventListener('click', function() {
                              progressDiv.innerHTML = `❌ <em>Rejected by user</em>`;
                              // Post rejection result
                              fetch(apiBaseUrl + '/api/widget/' + widgetToken + '/action-result', {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({
                                    executionId: data.executionId,
                                    actionId: data.action.id,
                                    status: 'failed',
                                    tool: actionLabel,
                                    error: 'User rejected the action'
                                 })
                              });
                           });
                        } else {
                           window.AriaActionEngineInstance.executeAction(data.action, widgetToken, data.executionId, apiBaseUrl)
                             .then(res => {
                                progressDiv.innerHTML = res.status === 'failed' ? `❌ <em>Failed: ${res.error}</em>` : `✅ <em>Completed: ${actionLabel}</em>`;
                             })
                             .catch(err => {
                                progressDiv.innerHTML = `❌ <em>Failed: ${err.message}</em>`;
                             });
                        }
                    }
                  }
                } catch (e) {
                  // Ignore parse error
                }
              }
            }
          }
          
          // Flush remainder
          if (buffer.startsWith("data: ")) {
             try {
               const data = JSON.parse(buffer.substring(6));
               if (data.content) {
                 botResponse += data.content;
                 botMsgDiv.innerHTML = formatMessageText(botResponse);
                 scrollToBottom();
               }
             } catch(e) {}
          }
          
          if (!botResponse) {
            botMsgDiv.textContent = "Sorry, I received an empty response.";
          } else {
            chatHistory.push({ role: 'assistant', content: botResponse });
            saveHistory(chatHistory);
            
            // Append feedback buttons
            const fbDiv = document.createElement('div');
            fbDiv.className = 'feedback-actions';
            fbDiv.style.flexDirection = 'column';
            fbDiv.innerHTML = `
              <div style="display: flex; gap: 8px;">
                <button class="fb-btn like-btn" title="Helpful" aria-label="Like response">👍</button>
                <button class="fb-btn dislike-btn" title="Not helpful" aria-label="Dislike response">👎</button>
              </div>
              <div class="feedback-input-area" style="display: none; margin-top: 8px;">
                <input type="text" class="feedback-input" placeholder="Optional suggestion or feedback..." style="width: 100%; font-size: 12px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-dark); color: var(--text-main); margin-bottom: 4px; outline: none;">
                <button class="feedback-submit" style="font-size: 11px; padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Send</button>
              </div>
            `;
            botMsgDiv.appendChild(fbDiv);
            
            const likeBtn = fbDiv.querySelector('.like-btn');
            const dislikeBtn = fbDiv.querySelector('.dislike-btn');
            const inputArea = fbDiv.querySelector('.feedback-input-area');
            const fbInput = fbDiv.querySelector('.feedback-input');
            const fbSubmit = fbDiv.querySelector('.feedback-submit');
            
            let selectedType = null;

            const handleFbClick = (type) => {
              selectedType = type;
              likeBtn.style.opacity = type === 'LIKE' ? '1' : '0.5';
              dislikeBtn.style.opacity = type === 'DISLIKE' ? '1' : '0.5';
              inputArea.style.display = 'block';
              scrollToBottom();
            };

            likeBtn.addEventListener('click', () => handleFbClick('LIKE'));
            dislikeBtn.addEventListener('click', () => handleFbClick('DISLIKE'));

            fbSubmit.addEventListener('click', () => {
              const text = fbInput.value.trim();
              fbSubmit.disabled = true;
              fbSubmit.textContent = 'Sent!';
              likeBtn.disabled = true;
              dislikeBtn.disabled = true;
              fbInput.disabled = true;
              
              const commentStr = text ? \`User Note: \${text} | AI Context: \${botResponse.substring(0, 200)}...\` : \`AI Context: \${botResponse.substring(0, 200)}...\`;

              fetch(apiBaseUrl + '/api/widget/' + widgetToken + '/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: selectedType,
                  text: commentStr
                })
              }).catch(e => console.error(e));
            });
          }
        } catch (err) {
          typingIndicator.classList.remove('visible');
          addMessage('bot', 'Sorry, I am having trouble connecting right now.');
        }
      });
    }
  }

  function addMessage(role, text) {
    const messagesContainer = shadow.querySelector('#messages-container');
    const typingIndicator = shadow.querySelector('#typing-indicator');
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = formatMessageText(text);
    
    messagesContainer.insertBefore(msgDiv, typingIndicator);
    scrollToBottom();
  }

  let scrollFrameId = null;
  function scrollToBottom() {
    if (scrollFrameId) cancelAnimationFrame(scrollFrameId);
    scrollFrameId = requestAnimationFrame(() => {
      const messagesContainer = shadow.querySelector('#messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      scrollFrameId = null;
    });
  }

  // Handle resizing for mobile
  window.addEventListener('resize', () => {
    isMobile = window.innerWidth <= 768;
  });

  // Expose NOVA_AI globally (with RAGHUB and AriaAI preserved for backwards compatibility)
  window.NOVA_AI = window.RAGHUB = window.AriaAI = {
    sendHiddenContext: function(text) {
      window.AriaHiddenContext = text;
    }
  };

  // Init
  loadConfig();
})();
