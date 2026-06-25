/**
 * Aria AI - Embeddable Widget
 * Uses Shadow DOM for style isolation
 */
(function() {
  // Prevent multiple initializations
  if (window.AriaWidgetInitialized) return;
  window.AriaWidgetInitialized = true;

  const scriptTag = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const widgetToken = scriptTag ? scriptTag.getAttribute('data-widget-token') : null;
  const passedApiUrl = scriptTag ? scriptTag.getAttribute('data-api-url') : null;

  if (!widgetToken) {
    console.error("Aria AI Widget: Missing data-widget-token attribute on script tag.");
    return;
  }

  // Determine API base URL
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
      console.error("Aria AI Widget Initialization failed:", err);
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
      }

      .widget-wrapper.position-bottom-right { bottom: 24px; right: 24px; }
      .widget-wrapper.position-bottom-left { bottom: 24px; left: 24px; }

      /* Floating Button */
      .floating-button {
        width: 56px;
        height: 56px;
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
        justify-content: center;
        pointer-events: auto !important;
      }
      .floating-button:hover { transform: scale(1.05); }
      .floating-button svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; }

      /* Chat Panel */
      .chat-panel {
        position: absolute;
        bottom: 80px;
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

      .widget-wrapper.position-bottom-left .chat-panel {
        right: auto; left: 0; transform-origin: bottom left;
      }

      .chat-panel.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto !important;
      }

      /* Mobile Full Screen */
      @media (max-width: 768px) {
        .chat-panel {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          width: 100%; height: 100%; max-height: 100%;
          border-radius: 0;
          bottom: 0 !important; right: 0 !important;
          transform: translateY(100%);
        }
        .chat-panel.open { transform: translateY(0); }
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
      console.warn("Aria Widget: failed to save chat history to sessionStorage:", e);
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

    const positionClass = config.position === "bottom-left" ? "position-bottom-left" : "position-bottom-right";

    shadow.innerHTML = `
      <style>${getBaseStyles()}</style>
      <div class="widget-wrapper ${positionClass}">
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
            <form id="chat-form" class="input-wrapper">
              <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off">
              <button type="submit" class="send-btn">
                 <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              </button>
            </form>
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
              <form id="chat-form" class="input-wrapper">
                <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off">
                <button type="submit" class="send-btn">
                   <svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                </button>
              </form>
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

    if (fab) {
      fab.addEventListener('click', () => {
        isOpen = true;
        sessionStorage.setItem(storageKeyOpen, 'true');
        panel.classList.add('open');
        fab.style.display = 'none';
        setTimeout(() => input.focus(), 300);
      });
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

  // Expose AriaAI globally for manual context injection
  window.AriaAI = {
    sendHiddenContext: function(text) {
      window.AriaHiddenContext = text;
    }
  };

  // Init
  loadConfig();
})();
