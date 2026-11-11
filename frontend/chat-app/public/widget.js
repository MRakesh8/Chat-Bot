/**
 * NOVA Business AI - Embeddable Widget v2.1
 * Uses Shadow DOM for style isolation
 * Feature: Draggable widget (drag FAB or header to reposition)
 */
(function() {
  // Find script element using deterministic fallbacks
  let scriptTag = document.currentScript;
  if (!scriptTag || !(scriptTag.getAttribute('data-widget-token') || scriptTag.getAttribute('data-project-id') || scriptTag.getAttribute('data-token'))) {
    const tokenScripts = Array.from(document.querySelectorAll('script[data-widget-token], script[data-project-id], script[data-token]'));
    const uninitializedScripts = tokenScripts.filter(s => {
      const t = s.getAttribute('data-widget-token') || s.getAttribute('data-project-id') || s.getAttribute('data-token');
      const rootId = `aria-ai-widget-root-${t}`;
      const existing = document.getElementById(rootId);
      return t && (!existing || !document.body || !document.body.contains(existing));
    });

    if (uninitializedScripts.length === 1) {
      scriptTag = uninitializedScripts[0];
    } else if (uninitializedScripts.length > 1) {
      console.error("NOVA AI Widget: Ambiguous multi-widget initialization detected without document.currentScript context. Aborting load.");
      return;
    } else {
      scriptTag = document.querySelector('script[src*="widget.js"]');
    }
  }

  // Extract widget token with fallbacks
  const widgetToken = (scriptTag && (scriptTag.getAttribute('data-widget-token') || scriptTag.getAttribute('data-project-id') || scriptTag.getAttribute('data-token'))) ||
                      window.NOVA_WIDGET_TOKEN ||
                      window.ARIA_WIDGET_TOKEN ||
                      null;

  if (!widgetToken) {
    console.error("NOVA AI Widget: Missing data-widget-token attribute or global token.");
    return;
  }

  const rootContainerId = `aria-ai-widget-root-${widgetToken}`;
  const existingDomContainer = document.getElementById(rootContainerId);

  // If container is already mounted and connected to the document, avoid duplicate initialization
  if (existingDomContainer && document.body && document.body.contains(existingDomContainer)) {
    return;
  }

  // Track initialized tokens to prevent duplicate instances while allowing remount if DOM container was detached
  window.AriaWidgetInitializedTokens = window.AriaWidgetInitializedTokens || new Set();
  window.AriaWidgetInitializedTokens.add(widgetToken);
  window.AriaWidgetInitialized = true;

  // Determine API base URL
  const passedApiUrl = (scriptTag && (scriptTag.getAttribute('data-api-url') || scriptTag.getAttribute('data-server-url'))) ||
                       window.NOVA_API_URL ||
                       window.ARIA_API_URL ||
                       null;

  let apiBaseUrl = passedApiUrl || "https://chat-bot-api-ns81.onrender.com"; 
  if (passedApiUrl) {
    try {
      apiBaseUrl = new URL(passedApiUrl, window.location.origin).href;
    } catch(e) {
      apiBaseUrl = passedApiUrl;
    }
  } else if (scriptTag && scriptTag.src) {
    try {
      const scriptUrl = new URL(scriptTag.src, window.location.href);
      if (scriptUrl.hostname === "localhost" || scriptUrl.hostname === "127.0.0.1") {
        // In local development, the NOVA backend API gateway default port is 5000
        if (scriptUrl.port === "5000") {
          apiBaseUrl = scriptUrl.origin;
        } else {
          apiBaseUrl = `${scriptUrl.protocol}//${scriptUrl.hostname}:5000`;
        }
      } else if (scriptUrl.hostname.includes("onrender.com") || scriptUrl.hostname.includes("railway.app")) {
        apiBaseUrl = scriptUrl.origin;
      }
    } catch(e) {}
  }
  apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");

  const storageKeyOpen = `aria_widget_open_${widgetToken}`;
  const storageKeyHistory = `aria_widget_history_${widgetToken}`;

  let config = null;
  let contextEngine = null;
  let isOpen = sessionStorage.getItem(storageKeyOpen) === 'true';
  let isMobile = window.innerWidth <= 768;

  function generateSessionUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const sessionKey = `aria_ctx_session_${widgetToken}`;
  let contextSessionId = sessionStorage.getItem(sessionKey);
  if (!contextSessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contextSessionId)) {
    contextSessionId = generateSessionUuid();
    sessionStorage.setItem(sessionKey, contextSessionId);
  }

  function getSubAssetUrl(filename) {
    try {
      if (scriptTag && scriptTag.src) {
        const u = new URL(scriptTag.src, window.location.href);
        const lastSlash = u.pathname.lastIndexOf('/');
        const basePath = lastSlash !== -1 ? u.pathname.substring(0, lastSlash + 1) : '/';
        u.pathname = `${basePath}${filename}`;
        u.search = '';
        return u.href;
      }
    } catch (e) {}
    return `${apiBaseUrl}/${filename}`;
  }

  let contextDebugInterval = null;

  function shouldRenderDebugPanel() {
    if (!config || !config.contextEngine || !config.contextEngine.developerDebugMode) {
      return false;
    }
    // Public URL query parameters (e.g. ?debug=true) MUST NOT authorize privileged debug UI
    // Only permit visual in-DOM debug panel in explicitly authorized developer environments:
    // 1. Local development hostnames
    try {
      const hostname = window.location.hostname || '';
      const isLocalhost = hostname === 'localhost' ||
                          hostname === '127.0.0.1' ||
                          hostname === '::1' ||
                          hostname.endsWith('.local') ||
                          hostname === '';
      if (isLocalhost) return true;
    } catch (e) {}

    // 2. Explicit developer debug embed attribute on the script tag (opt-in by site developer)
    if (scriptTag) {
      const devAttr = scriptTag.getAttribute('data-developer-debug') || scriptTag.getAttribute('data-debug');
      if (devAttr === 'true') return true;
    }

    // 3. Explicit programmatic test or developer harness flag set in window
    if (typeof window !== 'undefined' && (window.__NOVA_DEV_DEBUG__ === true || window.__ARIA_DEV_DEBUG__ === true)) {
      return true;
    }

    return false;
  }

  async function initContextEngine() {
    if (!config || !config.contextEngine || !config.contextEngine.enabled) return;

    if (contextDebugInterval) {
      clearInterval(contextDebugInterval);
      contextDebugInterval = null;
    }

    const startEngineInstance = () => {
      if (!window.AriaContextEngine) return;

      if (contextEngine && typeof contextEngine.destroy === 'function') {
        try {
          contextEngine.destroy();
        } catch (e) {}
      }

      contextEngine = new window.AriaContextEngine({
        maxPayloadBytes: config.contextEngine.maxContextSizeBytes || 6144
      });
      contextEngine.start(document.body);

      const updateDebugDisplay = async () => {
        try {
          const debugStatus = shadow.querySelector('#debug-status');
          const debugStats = shadow.querySelector('#debug-stats');
          if (!debugStatus || !debugStats) return;

          const freshCtx = await contextEngine.getContext();
          const ctx = freshCtx || (typeof contextEngine.getCachedContext === 'function' ? contextEngine.getCachedContext() : null);

          if (ctx) {
            let size = 0;
            try {
              size = new Blob([JSON.stringify(ctx)]).size;
            } catch (e) {
              size = (JSON.stringify(ctx) || '').length;
            }
            const isFresh = Boolean(freshCtx);
            const statusLabel = isFresh ? 'Active' : 'Active (Cached)';
            const duration = ctx.extractionDurationMs != null ? `${Math.round(ctx.extractionDurationMs)}ms` : 'cached';

            debugStatus.innerHTML = `<span style="color:#0f0;">Status: ${statusLabel}</span><br/>Time: ${duration} | Size: ${(size / 1024).toFixed(2)} KB`;

            const formsCount = Array.isArray(ctx.content?.forms) ? ctx.content.forms.length : 0;
            const tablesCount = Array.isArray(ctx.content?.tables) ? ctx.content.tables.length : 0;
            const cardsCount = Array.isArray(ctx.content?.cards) ? ctx.content.cards.length : 0;
            const errorsCount = Array.isArray(ctx.state?.visibleErrors) ? ctx.state.visibleErrors.length : 0;

            debugStats.innerHTML = `
              <div style="margin-top:4px;">Forms: ${formsCount}</div>
              <div>Tables: ${tablesCount}</div>
              <div>Cards: ${cardsCount}</div>
              <div>Errors: ${errorsCount}</div>
            `;
          } else {
            debugStatus.innerHTML = `<span style="color:#eab308;">Status: Ready (Awaiting scan)</span>`;
            debugStats.innerHTML = `
              <div style="margin-top:4px;">Forms: 0</div>
              <div>Tables: 0</div>
              <div>Cards: 0</div>
              <div>Errors: 0</div>
            `;
          }
        } catch (err) {
          const debugStatus = shadow.querySelector('#debug-status');
          if (debugStatus) {
            debugStatus.innerHTML = `<span style="color:#ef4444;">Status: Extraction error</span>`;
          }
        }
      };

      if (shouldRenderDebugPanel()) {
        updateDebugDisplay().catch(() => {});
        contextDebugInterval = setInterval(updateDebugDisplay, 2000);
      } else if (config.contextEngine.developerDebugMode) {
        // Safe console-only logging for developer inspection without polluting visitor DOM
        try {
          contextEngine.getContext().then(ctx => {
            const resolved = ctx || (contextEngine.getCachedContext && contextEngine.getCachedContext());
            if (resolved && typeof console !== 'undefined' && console.debug) {
              console.debug("[NOVA Context Engine] Initialized:", {
                url: resolved.page?.url,
                cards: resolved.content?.cards?.length || 0,
                forms: resolved.content?.forms?.length || 0,
                tables: resolved.content?.tables?.length || 0
              });
            }
          }).catch(() => {});
        } catch (e) {}
      }
    };

    if (window.AriaContextEngine) {
      startEngineInstance();
      return;
    }

    try {
      const engineUrl = getSubAssetUrl('widget-context-engine.js');
      const existingScript = document.querySelector(`script[src="${engineUrl}"], script[data-nova-engine="context"]`);

      if (existingScript) {
        existingScript.addEventListener('load', startEngineInstance, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = engineUrl;
        script.async = true;
        script.setAttribute('data-nova-engine', 'context');
        script.onload = startEngineInstance;
        script.onerror = () => {
          if (!engineUrl.startsWith(apiBaseUrl)) {
            const fallbackScript = document.createElement('script');
            fallbackScript.src = `${apiBaseUrl}/widget-context-engine.js`;
            fallbackScript.async = true;
            fallbackScript.setAttribute('data-nova-engine', 'context');
            fallbackScript.onload = startEngineInstance;
            document.head.appendChild(fallbackScript);
          }
        };
        document.head.appendChild(script);
      }

      // Also load action engine deduplicated
      if (!window.AriaActionEngine) {
        const actionEngineUrl = getSubAssetUrl('widget-action-engine.js');
        const existingActionScript = document.querySelector(`script[src="${actionEngineUrl}"], script[data-nova-engine="action"]`);
        if (!existingActionScript) {
          const actionScript = document.createElement('script');
          actionScript.src = actionEngineUrl;
          actionScript.async = true;
          actionScript.setAttribute('data-nova-engine', 'action');
          actionScript.onerror = () => {
            if (!actionEngineUrl.startsWith(apiBaseUrl)) {
              const fallbackActionScript = document.createElement('script');
              fallbackActionScript.src = `${apiBaseUrl}/widget-action-engine.js`;
              fallbackActionScript.async = true;
              fallbackActionScript.setAttribute('data-nova-engine', 'action');
              document.head.appendChild(fallbackActionScript);
            }
          };
          document.head.appendChild(actionScript);
        }
      }
    } catch (e) {
      console.warn("NOVA AI Widget: Failed to initialize context engine:", e);
    }
  }

  const container = existingDomContainer || document.createElement('div');
  container.id = rootContainerId;
  container.setAttribute('aria-ai-widget-root', 'true');
  container.setAttribute('data-widget-token', widgetToken);
  container.classList.add('aria-ai-widget-root');
  container.style.cssText = "position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; z-index: 2147483647 !important; pointer-events: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; background: transparent !important; display: block !important;";
  
  // Shadow DOM initialization (reuse existing shadowRoot if element already created)
  const shadow = container.shadowRoot || container.attachShadow({ mode: 'open' });

  function mountContainer() {
    try {
      container.style.cssText = "position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; z-index: 2147483647 !important; pointer-events: none !important; border: 0 !important; padding: 0 !important; margin: 0 !important; background: transparent !important; display: block !important;";

      const isCustomMode = config && config.displayMode === "custom" && config.customContainerId;
      const customEl = isCustomMode ? document.getElementById(config.customContainerId) : null;
      const mountTarget = customEl || document.body;

      if (!mountTarget) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => mountContainer(), { once: true });
        } else {
          setTimeout(mountContainer, 50);
        }
        return;
      }

      if (!mountTarget.contains(container)) {
        mountTarget.appendChild(container);
      }
    } catch (e) {
      console.warn("NOVA AI Widget: Failed to mount container:", e);
    }
  }

  function notifyRouteChange() {
    try {
      if (contextEngine && typeof contextEngine.getContext === 'function') {
        contextEngine.getContext().catch(() => {});
      }
    } catch(e) {}
  }

  function initBodyObserver() {
    if (typeof MutationObserver !== 'undefined' && document.body) {
      if (window._novaBodyObserver) {
        window._novaBodyObserver.disconnect();
      }
      window._novaBodyObserver = new MutationObserver(() => {
        const isCustomMode = config && config.displayMode === "custom" && config.customContainerId;
        const customEl = isCustomMode ? document.getElementById(config.customContainerId) : null;
        const mountTarget = customEl || document.body;
        if (mountTarget && !mountTarget.contains(container)) {
          mountTarget.appendChild(container);
        }
      });
      window._novaBodyObserver.observe(document.body, { childList: true, subtree: false });
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBodyObserver, { once: true });
    }
  }

  function attachRouteObserver() {
    if (window._novaRouteObserverAttached) {
      initBodyObserver();
      return;
    }
    window._novaRouteObserverAttached = true;

    let routeChangeTimer = null;
    function handleRouteChange() {
      if (routeChangeTimer) clearTimeout(routeChangeTimer);
      routeChangeTimer = setTimeout(() => {
        mountContainer();
        notifyRouteChange();
      }, 50);
    }

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    const originalPushState = window.history.pushState;
    if (typeof originalPushState === 'function') {
      window.history.pushState = function() {
        const result = originalPushState.apply(this, arguments);
        handleRouteChange();
        return result;
      };
    }

    const originalReplaceState = window.history.replaceState;
    if (typeof originalReplaceState === 'function') {
      window.history.replaceState = function() {
        const result = originalReplaceState.apply(this, arguments);
        handleRouteChange();
        return result;
      };
    }

    initBodyObserver();
  }

  window.__novaWidgetConfigs = window.__novaWidgetConfigs || {};

  async function loadConfig() {
    if (window.__novaWidgetConfigs[widgetToken]) {
      config = window.__novaWidgetConfigs[widgetToken];
      render();
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/widget/${widgetToken}/config`);
      if (!res.ok) throw new Error("Failed to load config (HTTP " + res.status + ")");
      config = await res.json();
      window.__novaWidgetConfigs[widgetToken] = config;
      render();
      initContextEngine();
    } catch (err) {
      console.error("NOVA AI Widget Initialization failed:", err);
      if (!config) {
        config = {
          botName: "AI Assistant",
          themeColor: "#8B5CF6",
          welcomeMessage: "Hi there! How can I help you today?",
          onlineStatus: "Online",
          displayMode: "bubble",
          position: "bottom-right"
        };
        render();
      }
    }
  }

  function getBaseStyles() {
    const themeColor = config.themeColor || "#8B5CF6";
    const app = config.appearance || {};
    const isCustom = app.themeMode === "custom";

    const widgetBg = (isCustom && app.widgetBg) ? app.widgetBg : "#18181b";
    const headerBg = (isCustom && app.headerBg) ? app.headerBg : themeColor;
    const headerText = (isCustom && app.headerText) ? app.headerText : "#ffffff";
    const aiMsgBg = (isCustom && app.aiMsgBg) ? app.aiMsgBg : "#18181b";
    const aiMsgText = (isCustom && app.aiMsgText) ? app.aiMsgText : "#f4f4f5";
    const userMsgBg = (isCustom && app.userMsgBg) ? app.userMsgBg : themeColor;
    const userMsgText = (isCustom && app.userMsgText) ? app.userMsgText : "#ffffff";
    const inputBg = (isCustom && app.inputBg) ? app.inputBg : "#09090b";
    const inputText = (isCustom && app.inputText) ? app.inputText : "#f4f4f5";
    const placeholderText = (isCustom && app.placeholderText) ? app.placeholderText : "#a1a1aa";
    const sendBtnBg = (isCustom && app.sendBtnBg) ? app.sendBtnBg : themeColor;
    const sendBtnIcon = (isCustom && app.sendBtnIcon) ? app.sendBtnIcon : "#ffffff";
    const launcherBg = (isCustom && app.launcherBg) ? app.launcherBg : themeColor;
    const launcherIcon = (isCustom && app.launcherIcon) ? app.launcherIcon : "#ffffff";
    const borderColor = (isCustom && app.borderColor) ? app.borderColor : "#27272a";
    const statusColor = (isCustom && app.statusColor) ? app.statusColor : "#10b981";

    return `
      :host {
        --primary: ${themeColor};
        --widget-bg: ${widgetBg};
        --header-bg: ${headerBg};
        --header-text: ${headerText};
        --ai-msg-bg: ${aiMsgBg};
        --ai-msg-text: ${aiMsgText};
        --user-msg-bg: ${userMsgBg};
        --user-msg-text: ${userMsgText};
        --input-bg: ${inputBg};
        --input-text: ${inputText};
        --placeholder-text: ${placeholderText};
        --send-btn-bg: ${sendBtnBg};
        --send-btn-icon: ${sendBtnIcon};
        --launcher-bg: ${launcherBg};
        --launcher-icon: ${launcherIcon};
        --border-color: ${borderColor};
        --status-color: ${statusColor};
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
        bottom: 24px;
        right: 24px;
      }

      .widget-wrapper.draggable-ready {
        bottom: auto !important;
        right: auto !important;
      }

      /* Floating Button Launcher */
      .floating-button {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: var(--launcher-bg);
        color: var(--launcher-icon);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 25px rgba(0,0,0,0.25);
        cursor: pointer;
        border: none;
        outline: none;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        pointer-events: auto !important;
      }
      .floating-button:hover { transform: scale(1.08); }
      .floating-button svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; }

      /* Chat Panel */
      .chat-panel {
        position: absolute;
        bottom: calc(100% + 24px);
        right: 0;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 100px);
        background-color: var(--widget-bg);
        border: 1px solid var(--border-color);
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
        background-color: var(--header-bg);
        padding: 16px;
        color: var(--header-text);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .header-info { display: flex; align-items: center; gap: 12px; }
      .avatar { 
        width: 32px; height: 32px; border-radius: 50%; 
        background: rgba(255,255,255,0.2); 
        color: var(--header-text);
        display: flex; align-items: center; justify-content: center; font-weight: bold;
      }
      .title { font-weight: 600; font-size: 16px; margin: 0; line-height: 1.2; color: var(--header-text); }
      .subtitle { font-size: 11px; opacity: 0.9; margin-top: 2px; color: var(--header-text); display: flex; align-items: center; gap: 4px; }
      .status-dot { width: 7px; height: 7px; border-radius: 50%; background-color: var(--status-color); display: inline-block; }
      
      .close-btn { 
        background: none; border: none; color: var(--header-text); cursor: pointer; padding: 4px; opacity: 0.8;
      }
      .close-btn:hover { opacity: 1; }
      
      .messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background-color: var(--widget-bg);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      * {
        scrollbar-width: thin;
        scrollbar-color: #52525b transparent;
      }

      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #52525b; border-radius: 9999px; }
      ::-webkit-scrollbar-thumb:hover { background: #71717a; }

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
        background-color: var(--ai-msg-bg);
        color: var(--ai-msg-text);
        border: 1px solid var(--border-color);
        border-bottom-left-radius: 4px;
      }

      .message.user {
        align-self: flex-end;
        background-color: var(--user-msg-bg);
        color: var(--user-msg-text);
        border-bottom-right-radius: 4px;
      }

      .input-area {
        padding: 14px 16px;
        background-color: var(--widget-bg);
        border-top: 1px solid var(--border-color);
      }

      .input-wrapper {
        display: flex;
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        border-radius: 9999px;
        padding: 4px 6px 4px 16px;
        align-items: center;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }

      .input-wrapper:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
      }

      .input-wrapper input {
        flex: 1;
        background: none;
        border: none;
        color: var(--input-text);
        padding: 8px 0;
        font-size: 14px;
        outline: none;
      }
      .input-wrapper input::placeholder {
        color: var(--placeholder-text);
        opacity: 0.8;
      }

      .send-btn {
        background: var(--send-btn-bg);
        color: var(--send-btn-icon);
        border: none;
        width: 32px; height: 32px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: transform 0.15s ease, opacity 0.15s ease;
        flex-shrink: 0;
      }
      .send-btn:hover:not(:disabled) { transform: scale(1.05); }
      .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .send-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; }

      .typing-indicator {
        display: none;
        align-items: center;
        gap: 4px;
        padding: 12px 16px;
        background-color: var(--ai-msg-bg);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        width: fit-content;
      }
      .typing-indicator.visible { display: flex; }
      .typing-dot { width: 6px; height: 6px; background: var(--placeholder-text); border-radius: 50%; animation: typing 1.4s infinite ease-in-out both; }
      .typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .typing-dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes typing { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

      .feedback-actions {
        display: flex;
        gap: 6px;
        margin-top: 8px;
        border-top: 1px solid var(--border-color);
        padding-top: 6px;
      }
      .fb-btn {
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.7;
        font-size: 14px;
        padding: 4px 6px;
        border-radius: 4px;
        transition: opacity 0.2s, transform 0.2s, background-color 0.2s;
      }
      .fb-btn:hover:not(:disabled), .fb-btn:focus-visible:not(:disabled) {
        opacity: 1;
        transform: scale(1.15);
        background-color: rgba(255, 255, 255, 0.05);
        outline: none;
      }
      .fb-btn.submitted { opacity: 1; cursor: pointer; background-color: rgba(255, 255, 255, 0.12); border-radius: 4px; }
      .fb-btn:disabled { cursor: default; opacity: 0.4; }
      .fb-submitted-check {
        font-size: 10px;
        color: var(--primary);
        margin-left: 2px;
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
    mountContainer();
    attachRouteObserver();

    const isBottomLeft = config.position === "bottom-left";
    const hasCustomEl = !!(config.displayMode === 'custom' && config.customContainerId && document.getElementById(config.customContainerId));
    const isCustom = config.displayMode === 'custom' && hasCustomEl;

    shadow.innerHTML = `
      <style>${getBaseStyles()}</style>
      <div class="widget-wrapper" id="widget-wrapper">
        ${!isCustom ? `
        <div class="chat-panel ${isOpen ? 'open' : ''}">
          <div class="header">
            <div class="header-info">
              <div class="avatar">${(config.botName || "A").charAt(0)}</div>
              <div>
                <div class="title">${config.botName || "AI Assistant"}</div>
                <div class="subtitle"><span class="status-dot"></span>${config.onlineStatus || "Online"}</div>
              </div>
            </div>
            <button class="close-btn" aria-label="Close chat">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="messages" id="messages-container"></div>
          ${shouldRenderDebugPanel() ? `
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
                <input type="text" id="chat-input" placeholder="${config.inputPlaceholder || "Ask a question..."}" autocomplete="off" aria-label="${config.inputPlaceholder || "Type a message"}">
                <button type="submit" class="send-btn" aria-label="Send message">
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
            <div class="header">
              <div class="header-info">
                <div class="avatar">${(config.botName || "A").charAt(0)}</div>
                <div>
                  <div class="title">${config.botName || "AI Assistant"}</div>
                  <div class="subtitle"><span class="status-dot"></span>${config.onlineStatus || "Online"}</div>
                </div>
              </div>
            </div>
            <div class="messages" id="messages-container"></div>
            ${shouldRenderDebugPanel() ? `
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
                   <input type="text" id="chat-input" placeholder="${config.inputPlaceholder || "Ask a question..."}" autocomplete="off" aria-label="${config.inputPlaceholder || "Type a message"}">
                   <button type="submit" class="send-btn" aria-label="Send message">
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
    const sendBtn = shadow.querySelector('.send-btn');
    const messagesContainer = shadow.querySelector('#messages-container');
    const typingIndicator = shadow.querySelector('#typing-indicator');
    const defaultSendBtnHtml = sendBtn ? sendBtn.innerHTML : '';

    let activeAbortController = null;
    let isSending = false;
    let activeRequestSeq = 0;

    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        if (isSending && activeAbortController) {
          e.preventDefault();
          e.stopPropagation();
          activeAbortController.abort();
        }
      });
    }

    window.addEventListener('beforeunload', () => {
      if (activeAbortController) {
        activeAbortController.abort();
      }
    });

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
        if (isSending) return;
        const text = input.value.trim();
        if (!text) return;

        const mySeq = ++activeRequestSeq;
        isSending = true;
        activeAbortController = new AbortController();
        const clientReqStart = performance.now();
        let clientTtftMs = null;
        let chunkCount = 0;

        if (sendBtn) {
          sendBtn.title = "Stop response";
          sendBtn.setAttribute("aria-label", "Stop response");
          sendBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
        }

        input.value = '';
        addMessage('user', text);
        
        chatHistory.push({ role: 'user', content: text });
        saveHistory(chatHistory);
        typingIndicator.classList.add('visible');
        messagesContainer.appendChild(typingIndicator); // Move to bottom
        scrollToBottom();

        let botMsgDiv = null;
        let botResponse = "";
        let hasActionPayload = false;
        let streamErrorMsg = null;

        const ensureBotMsgDiv = () => {
          if (!botMsgDiv) {
            typingIndicator.classList.remove('visible');
            botMsgDiv = document.createElement('div');
            botMsgDiv.className = 'message bot';
            messagesContainer.insertBefore(botMsgDiv, typingIndicator);
          }
          return botMsgDiv;
        };

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

          if (!websiteContext) {
            websiteContext = {
              version: "1.0.0",
              url: window.location.href,
              title: document.title || "",
              segments: {}
            };
          } else {
            // Always synchronize live URL and title so SPA transitions never report stale route
            websiteContext.url = window.location.href;
            if (!websiteContext.title) {
              websiteContext.title = document.title || "";
            }
          }

          // Merge manually injected context if present
          if (window.AriaHiddenContext) {
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
            body: JSON.stringify(requestBody),
            signal: activeAbortController.signal
          });
          
          if (!res.ok) {
            let errDetail = "API Error";
            try {
              const errJson = await res.json();
              if (errJson && errJson.error) errDetail = errJson.error;
            } catch (_) {}
            throw new Error(errDetail);
          }
          
          if (!res.body || typeof res.body.getReader !== 'function') {
            throw new Error("Streaming not supported by response");
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let currentEvent = "message";

          const processSseLine = (rawLine) => {
            const trimmed = rawLine.trim();
            if (!trimmed) {
              currentEvent = "message";
              return;
            }
            if (trimmed.startsWith("event:")) {
              currentEvent = trimmed.substring(6).trim() || "message";
              return;
            }
            if (!trimmed.startsWith("data:")) return;

            const payloadStr = trimmed.substring(5).trim();
            if (!payloadStr) return;

            try {
              const data = JSON.parse(payloadStr);
              if (currentEvent === "error" || data.error) {
                streamErrorMsg = data.error || "Sorry, I encountered an issue connecting to the AI assistant.";
              }
              if (data.content) {
                if (clientTtftMs === null) {
                  clientTtftMs = Math.round(performance.now() - clientReqStart);
                }
                chunkCount++;
                botResponse += data.content;
                const targetDiv = ensureBotMsgDiv();
                targetDiv.innerHTML = formatMessageText(botResponse);
                scrollToBottom();
              }
              if (data.action) {
                hasActionPayload = true;
                typingIndicator.classList.remove('visible');
                if (clientTtftMs === null) {
                  clientTtftMs = Math.round(performance.now() - clientReqStart);
                }
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
              // Ignore partial or non-JSON SSE keepalive frame
            }
          };
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              processSseLine(line);
            }
          }
          
          // Flush any trailing decoder bytes and buffered SSE line
          buffer += decoder.decode();
          if (buffer.trim()) {
            for (const line of buffer.split(/\r?\n/)) {
              processSseLine(line);
            }
          }

          window.__novaWidgetLastTiming = {
            ttftMs: clientTtftMs,
            totalMs: Math.round(performance.now() - clientReqStart),
            chunkCount
          };

          typingIndicator.classList.remove('visible');
          
          if (!botResponse && !hasActionPayload) {
            const fallbackDiv = ensureBotMsgDiv();
            fallbackDiv.textContent = streamErrorMsg || "Sorry, I received an empty response.";
          } else if (botResponse && mySeq === activeRequestSeq) {
            chatHistory.push({ role: 'assistant', content: botResponse });
            saveHistory(chatHistory);
            
            // Append feedback buttons
            const fbDiv = document.createElement('div');
            fbDiv.className = 'feedback-actions';
            fbDiv.style.flexDirection = 'column';
            fbDiv.innerHTML = `
              <div style="display: flex; gap: 6px; align-items: center;">
                <button class="fb-btn like-btn" title="Like" aria-label="Like">👍</button>
                <button class="fb-btn dislike-btn" title="Dislike" aria-label="Dislike">👎</button>
                <button class="fb-btn suggestion-btn" title="Suggestion" aria-label="Suggestion">💡</button>
              </div>
              <div class="feedback-input-area" style="display: none; margin-top: 8px;">
                <input type="text" class="feedback-input" placeholder="Type your suggestion..." style="width: 100%; font-size: 12px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-dark); color: var(--text-main); margin-bottom: 4px; outline: none;">
                <button class="feedback-submit" style="font-size: 11px; padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">Send</button>
              </div>
            `;
            botMsgDiv.appendChild(fbDiv);
            
            const likeBtn = fbDiv.querySelector('.like-btn');
            const dislikeBtn = fbDiv.querySelector('.dislike-btn');
            const suggestionBtn = fbDiv.querySelector('.suggestion-btn');
            const inputArea = fbDiv.querySelector('.feedback-input-area');
            const fbInput = fbDiv.querySelector('.feedback-input');
            const fbSubmit = fbDiv.querySelector('.feedback-submit');
            
            let currentFeedback = null; // 'LIKE' | 'DISLIKE' | null

            const submitFeedback = (type, comment) => {
              const commentStr = comment
                ? `User Note: ${comment} | AI Context: ${botResponse.substring(0, 200)}...`
                : `AI Context: ${botResponse.substring(0, 200)}...`;
              fetch(apiBaseUrl + '/api/widget/' + widgetToken + '/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, text: commentStr })
              }).catch(e => console.error('Feedback error:', e));
            };

            const renderFeedbackUI = () => {
              if (currentFeedback === 'LIKE') {
                likeBtn.classList.add('submitted');
                likeBtn.innerHTML = '👍 Liked ✓';
                dislikeBtn.classList.remove('submitted');
                dislikeBtn.innerHTML = '👎';
              } else if (currentFeedback === 'DISLIKE') {
                dislikeBtn.classList.add('submitted');
                dislikeBtn.innerHTML = '👎 Disliked ✓';
                likeBtn.classList.remove('submitted');
                likeBtn.innerHTML = '👍';
              } else {
                likeBtn.classList.remove('submitted');
                likeBtn.innerHTML = '👍';
                dislikeBtn.classList.remove('submitted');
                dislikeBtn.innerHTML = '👎';
              }
            };

            likeBtn.addEventListener('click', () => {
              if (currentFeedback === 'LIKE') {
                currentFeedback = null;
                submitFeedback('NONE');
              } else {
                currentFeedback = 'LIKE';
                submitFeedback('LIKE');
              }
              renderFeedbackUI();
              inputArea.style.display = 'none';
            });

            dislikeBtn.addEventListener('click', () => {
              if (currentFeedback === 'DISLIKE') {
                currentFeedback = null;
                submitFeedback('NONE');
              } else {
                currentFeedback = 'DISLIKE';
                submitFeedback('DISLIKE');
              }
              renderFeedbackUI();
              inputArea.style.display = 'none';
            });

            suggestionBtn.addEventListener('click', () => {
              const isVisible = inputArea.style.display !== 'none';
              inputArea.style.display = isVisible ? 'none' : 'block';
              if (!isVisible) {
                fbInput.focus();
              }
              scrollToBottom();
            });

            fbSubmit.addEventListener('click', () => {
              const text = fbInput.value.trim();
              if (!text) return;
              submitFeedback('SUGGESTION', text);
              fbSubmit.textContent = 'Sent!';
              setTimeout(() => {
                fbSubmit.textContent = 'Send';
                fbInput.value = '';
                inputArea.style.display = 'none';
              }, 1200);
            });
          }
        } catch (err) {
          typingIndicator.classList.remove('visible');
          if (err && err.name === 'AbortError') {
            if (botResponse && mySeq === activeRequestSeq) {
              chatHistory.push({ role: 'assistant', content: botResponse });
              saveHistory(chatHistory);
            } else if (!botMsgDiv) {
              addMessage('bot', 'Response generation stopped.');
            }
          } else {
            console.error("NOVA AI Widget Chat Error:", err);
            addMessage('bot', 'Sorry, I am having trouble connecting right now.');
          }
        } finally {
          if (mySeq === activeRequestSeq) {
            isSending = false;
            activeAbortController = null;
            typingIndicator.classList.remove('visible');
            if (sendBtn) {
              sendBtn.innerHTML = defaultSendBtnHtml;
              sendBtn.title = "Send message";
              sendBtn.setAttribute("aria-label", "Send message");
            }
          }
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

  // Early container mount and observer attachment
  mountContainer();
  attachRouteObserver();

  // Init
  loadConfig();
})();
