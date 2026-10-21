/**
 * Aria AI — Website Context Engine
 * Viewport-based DOM analysis with incremental delta updates.
 *
 * Usage (from widget.js):
 *   const engine = new window.AriaContextEngine(config);
 *   engine.start(document.body);
 *   const context = await engine.getContext();
 *
 * @file widget-context-engine.js
 * @version 1.0.0
 * @license MIT
 */
(function () {
  'use strict';

  /* ================================================================
   *  CONSTANTS
   * ================================================================ */

  /** Sensitive field name patterns — values are always redacted */
  var SENSITIVE_FIELD_RE =
    /password|passwd|secret|token|jwt|api[_-]?key|authorization|credit[_-]?card|card[_-]?number|cvv|cvc|ssn|social[_-]?security|pin|otp|2fa|mfa|cookie|session|csrf|xsrf|private[_-]?key/i;

  /** Input types whose values must never be read */
  var SENSITIVE_INPUT_TYPES = ['password', 'hidden'];

  /** URL query-param keys that must be stripped */
  var SENSITIVE_URL_PARAMS_RE =
    /^(token|key|secret|auth|password|jwt|session|code|access_token|refresh_token|api_key|apikey)$/i;

  /** CSS selector for "semantic" elements the viewport scanner should observe */
  var SEMANTIC_SELECTORS = [
    'table', '[role="grid"]', '[role="table"]',
    'form', '[role="form"]',
    'nav', '[role="navigation"]',
    'dialog', '[role="dialog"]', '[role="alertdialog"]',
    '[role="alert"]', '[role="status"]',
    'button', '[role="button"]', 'input[type="submit"]',
    'canvas', 'svg',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', '[role="list"]',
    '[role="progressbar"]',
    '[class*="card"]', '[class*="stat"]', '[class*="metric"]', '[class*="kpi"]', '[class*="widget"]',
    '[class*="chart"]', '[class*="graph"]',
    '[class*="modal"]',
    '[class*="toast"]', '[class*="notification"]', '[class*="alert"]',
    '[class*="error"]', '[class*="warning"]', '[class*="success"]',
    '[class*="step"]', '[class*="wizard"]', '[class*="progress"]',
    '[class*="breadcrumb"]'
  ].join(',');

  /** Animation-related class substrings to ignore in mutations */
  var ANIMATION_CLASS_TOKENS = ['animate', 'transition', 'fade'];

  /** Intersection-observer thresholds */
  var IO_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1.0];
  var IO_ROOT_MARGIN = '100px';

  /** Performance budget (ms) */
  var EXTRACTION_BUDGET_MS = 50;
  /** Min interval between full scans (ms) */
  var THROTTLE_MS = 2000;
  /** Maximum DOM nodes before we bail out */
  var MAX_DOM_NODES = 50000;
  /** Context cache TTL (ms) */
  var CACHE_TTL_MS = 30000;
  /** URL poll interval (ms) */
  var URL_POLL_MS = 2000;
  /** Max page-history entries kept in memory */
  var MAX_PAGE_HISTORY = 10;
  /** Max field-value length before truncation */
  var MAX_FIELD_VALUE_LEN = 100;
  /** Max memory storage size (bytes) */
  var MAX_MEMORY_SIZE = 2048;

  /* ================================================================
   *  HELPERS
   * ================================================================ */

  /**
   * Safe text content getter. Returns trimmed text limited to `maxLen`.
   * @param {Element|null} el
   * @param {number} [maxLen=200]
   * @returns {string}
   */
  function safeText(el, maxLen) {
    if (!el) return '';
    maxLen = maxLen || 200;
    var t = (el.textContent || '').trim();
    return t.length > maxLen ? t.slice(0, maxLen) + '…' : t;
  }

  /**
   * Returns a label string for an input element.
   * Checks: associated <label>, aria-label, aria-labelledby, placeholder, name.
   * @param {HTMLElement} input
   * @returns {string}
   */
  function getFieldLabel(input) {
    // Associated <label> via for/id
    if (input.id) {
      var label = input.ownerDocument.querySelector('label[for="' + CSS.escape(input.id) + '"]');
      if (label) return safeText(label, 100);
    }
    // Parent <label>
    var parentLabel = input.closest('label');
    if (parentLabel) {
      // Clone, remove the input, and read the remaining text
      var clone = parentLabel.cloneNode(true);
      var inputs = clone.querySelectorAll('input,select,textarea');
      inputs.forEach(function (inp) { inp.remove(); });
      var text = (clone.textContent || '').trim();
      if (text) return text.slice(0, 100);
    }
    return input.getAttribute('aria-label')
      || input.getAttribute('placeholder')
      || input.getAttribute('name')
      || '';
  }

  /**
   * Checks if an element is "visible" in CSS terms (not display:none, visibility:hidden, etc.).
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el || !el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    var style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  /**
   * Matches an element's class list against a pattern.
   * @param {HTMLElement} el
   * @param {RegExp} pattern
   * @returns {boolean}
   */
  function classMatches(el, pattern) {
    return pattern.test(el.className || '');
  }

  /**
   * Creates a prioritized item envelope.
   * @param {object} data
   * @param {number} priority 1–10 (10 = most important)
   * @param {boolean} inViewport
   * @param {number} distance px from viewport edge
   * @param {string[]} [signals]
   * @returns {{data: object, priority: number, inViewport: boolean, distanceFromViewport: number, relevanceSignals: string[]}}
   */
  function prioritizedItem(data, priority, inViewport, distance, signals) {
    return {
      data: data,
      priority: priority,
      inViewport: inViewport,
      distanceFromViewport: distance,
      relevanceSignals: signals || []
    };
  }

  /* ================================================================
   *  SECURITY SANITIZER
   * ================================================================ */

  var SecuritySanitizer = {
    /**
     * Returns true if the field is considered sensitive and its value must not be read.
     * @param {HTMLElement} input
     * @returns {boolean}
     */
    isSensitiveField: function (input) {
      var type = (input.getAttribute('type') || '').toLowerCase();
      if (SENSITIVE_INPUT_TYPES.indexOf(type) !== -1) return true;
      var name = (input.getAttribute('name') || '') + ' ' + (input.getAttribute('id') || '') + ' ' + (input.getAttribute('autocomplete') || '');
      return SENSITIVE_FIELD_RE.test(name);
    },

    /**
     * Returns the sanitized value for a form field.
     * @param {HTMLElement} input
     * @returns {string}
     */
    sanitizeFieldValue: function (input) {
      if (this.isSensitiveField(input)) return '[REDACTED]';
      var val = (input.value || '').trim();
      if (val.length > MAX_FIELD_VALUE_LEN) {
        val = val.slice(0, MAX_FIELD_VALUE_LEN) + '…';
      }
      return val;
    },

    /**
     * Sanitizes a URL string — removes sensitive query parameters.
     * @param {string} url
     * @returns {string}
     */
    sanitizeUrl: function (url) {
      try {
        var u = new URL(url, window.location.origin);
        var keysToDelete = [];
        u.searchParams.forEach(function (_v, k) {
          if (SENSITIVE_URL_PARAMS_RE.test(k)) keysToDelete.push(k);
        });
        keysToDelete.forEach(function (k) { u.searchParams.delete(k); });
        return u.toString();
      } catch (_e) {
        return url;
      }
    }
  };

  /* ================================================================
   *  PAGE CLASSIFIER
   * ================================================================ */

  /**
   * Classifies the current page type using URL patterns and DOM heuristics.
   * @param {Document} doc
   * @returns {string} one of the known page types
   */
  function classifyPage(doc) {
    var path = window.location.pathname.toLowerCase();
    var body = doc.body;
    if (!body) return 'unknown';

    // URL-pattern shortcuts
    if (/settings|preferences|configuration/.test(path)) return 'settings';
    if (/login|signin|sign-in|signup|sign-up|register|auth/.test(path)) return 'auth';
    if (/checkout|payment|billing/.test(path)) return 'checkout';

    // DOM heuristics
    var hasCards = body.querySelectorAll('[class*="card"],[class*="stat"],[class*="kpi"],[class*="metric"]').length >= 2;
    var hasCharts = body.querySelectorAll('[class*="chart"],[class*="graph"],canvas,svg').length >= 1;
    var hasForms = body.querySelectorAll('form,[role="form"]').length > 0;
    var hasTables = body.querySelectorAll('table,[role="grid"],[role="table"]').length > 0;
    var hasLists = body.querySelectorAll('ul,ol,[role="list"]').length >= 2;
    var hasSteps = body.querySelectorAll('[class*="step"],[class*="wizard"],[role="progressbar"]').length > 0;
    var hasSearch = body.querySelector('input[type="search"],[role="search"],[class*="search-result"]');
    var hasBreadcrumb = body.querySelector('[class*="breadcrumb"],[aria-label="breadcrumb"]');
    var headings = body.querySelectorAll('h1,h2');

    // Auth form detection (login/signup)
    if (hasForms) {
      var passwordFields = body.querySelectorAll('input[type="password"]');
      if (passwordFields.length > 0) return 'auth';
    }

    // Checkout detection
    if (hasForms) {
      var paymentInputs = body.querySelectorAll('[name*="card"],[name*="payment"],[name*="shipping"],[autocomplete*="cc-"]');
      if (paymentInputs.length > 0) return 'checkout';
    }

    if (hasSearch) return 'search';
    if (hasSteps) return 'wizard';
    if (hasCards && hasCharts) return 'dashboard';
    if (hasTables && !hasForms) return 'table';
    if (hasForms && !hasTables) return 'form';
    if (hasLists) return 'list';
    if (hasBreadcrumb && headings.length >= 1) return 'detail';
    if (hasCards) return 'dashboard';

    return 'unknown';
  }

  /* ================================================================
   *  FRAMEWORK DETECTOR
   * ================================================================ */

  /**
   * Detects the JavaScript framework used by the host page.
   * @returns {string}
   */
  function detectFramework() {
    try {
      if (window.__NEXT_DATA__) return 'nextjs';
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')) return 'react';
      if (window.__vue__ || window.__VUE__) return 'vue';
      if (document.querySelector('[ng-version]') || typeof window.getAllAngularRootElements === 'function') return 'angular';
      if (document.querySelector('[class*="svelte"]')) return 'svelte';
    } catch (_e) { /* ignore */ }
    return 'static';
  }

  /* ================================================================
   *  CONTEXT HASHER
   * ================================================================ */

  /**
   * @constructor
   * Computes SHA-256 (or simple fallback) hashes for context segments.
   * Tracks previous hashes to support delta transport.
   */
  function ContextHasher() {
    this._prev = {};
    this._seq = 0;
    this._canUseCrypto = !!(window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function');
  }

  /**
   * Hash a string to a 16-char hex prefix.
   * @param {string} str
   * @returns {Promise<string>}
   */
  ContextHasher.prototype.hash = function (str) {
    if (this._canUseCrypto) {
      var buf = new TextEncoder().encode(str);
      return window.crypto.subtle.digest('SHA-256', buf).then(function (ab) {
        var arr = new Uint8Array(ab);
        var hex = '';
        for (var i = 0; i < arr.length; i++) {
          hex += ('0' + arr[i].toString(16)).slice(-2);
        }
        return hex.slice(0, 16);
      });
    }
    // Fallback: simple DJB2-based hash
    return Promise.resolve(this._simpleHash(str));
  };

  /**
   * Fallback DJB2 hash producing a 16-char hex string.
   * @param {string} str
   * @returns {string}
   */
  ContextHasher.prototype._simpleHash = function (str) {
    var h1 = 5381;
    var h2 = 52711;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) >>> 0;
      h2 = ((h2 << 5) + h2 + c) >>> 0;
    }
    var hex = h1.toString(16) + h2.toString(16);
    while (hex.length < 16) hex = '0' + hex;
    return hex.slice(0, 16);
  };

  /**
   * Computes hashes for all segments and returns a delta-aware payload.
   * @param {object} segments  key → value (each value will be JSON-stringified)
   * @returns {Promise<{mode: string, sequenceNumber: number, hashes: object, changed: object}>}
   */
  ContextHasher.prototype.computeDelta = function (segments) {
    var self = this;
    self._seq++;
    var keys = Object.keys(segments);
    var hashPromises = keys.map(function (k) {
      return self.hash(JSON.stringify(segments[k])).then(function (h) {
        return { key: k, hash: h };
      });
    });

    return Promise.all(hashPromises).then(function (results) {
      var isFirst = Object.keys(self._prev).length === 0;
      var newHashes = {};
      var changed = {};

      results.forEach(function (r) {
        newHashes[r.key] = r.hash;
        if (isFirst || self._prev[r.key] !== r.hash) {
          changed[r.key] = segments[r.key];
        }
      });

      self._prev = newHashes;

      return {
        mode: isFirst ? 'full' : 'delta',
        sequenceNumber: self._seq,
        hashes: newHashes,
        changed: changed
      };
    });
  };

  /* ================================================================
   *  MUTATION WATCHER
   * ================================================================ */

  /**
   * @constructor
   * Observes host-page DOM mutations, ignoring widget shadow DOM and animations.
   * @param {HTMLElement} widgetRoot  The widget's outermost container on the host page
   */
  function MutationWatcher(widgetRoot) {
    this._widgetRoot = widgetRoot;
    this._observer = null;
    this._significant = false;
  }

  /** Watched attribute list */
  MutationWatcher.ATTR_FILTER = ['class', 'disabled', 'hidden', 'aria-expanded', 'aria-selected', 'data-state', 'value'];

  /**
   * Start observing.
   * @param {HTMLElement} root
   */
  MutationWatcher.prototype.start = function (root) {
    if (this._observer) return;
    var self = this;

    this._observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        // Skip mutations inside the widget container
        if (self._widgetRoot && self._widgetRoot.contains(m.target)) continue;

        if (m.type === 'attributes') {
          // Skip style-only changes
          if (m.attributeName === 'style') continue;
          // Skip animation class toggles
          if (m.attributeName === 'class') {
            var cls = (m.target.className || '').toLowerCase();
            var oldCls = (m.oldValue || '').toLowerCase();
            var isAnimOnly = ANIMATION_CLASS_TOKENS.some(function (tok) {
              return cls.indexOf(tok) !== -1 || oldCls.indexOf(tok) !== -1;
            });
            // If the ONLY change is animation classes, skip
            if (isAnimOnly) {
              var newSet = cls.split(/\s+/).sort().join(' ');
              var oldSet = oldCls.split(/\s+/).sort().join(' ');
              // Strip animation tokens and compare
              var strip = function (s) {
                return s.split(/\s+/).filter(function (c) {
                  return !ANIMATION_CLASS_TOKENS.some(function (t) { return c.indexOf(t) !== -1; });
                }).sort().join(' ');
              };
              if (strip(newSet) === strip(oldSet)) continue;
            }
          }
        }

        self._significant = true;
        return; // One significant mutation is enough
      }
    });

    this._observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: MutationWatcher.ATTR_FILTER,
      attributeOldValue: true
    });
  };

  /**
   * @returns {boolean} Whether significant changes have been detected since last reset.
   */
  MutationWatcher.prototype.hasChanges = function () {
    return this._significant;
  };

  /** Clears the significant-change flag. */
  MutationWatcher.prototype.reset = function () {
    this._significant = false;
  };

  /** Disconnects the observer and cleans up. */
  MutationWatcher.prototype.destroy = function () {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  };

  /* ================================================================
   *  MEMORY MANAGER
   * ================================================================ */

  /**
   * @constructor
   * Persists lightweight page-navigation memory in sessionStorage.
   * @param {string} widgetToken
   */
  function MemoryManager(widgetToken) {
    this._key = 'aria_context_memory_' + widgetToken;
    this._memory = this._load();
  }

  /**
   * Load from sessionStorage.
   * @returns {object}
   */
  MemoryManager.prototype._load = function () {
    try {
      var raw = sessionStorage.getItem(this._key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (_e) { /* ignore */ }
    return { pageHistory: [], currentPage: null, previousPage: null, currentWorkflow: null, selectedTab: null, recentActions: [] };
  };

  /**
   * Save to sessionStorage (capped to MAX_MEMORY_SIZE).
   */
  MemoryManager.prototype._save = function () {
    try {
      var json = JSON.stringify(this._memory);
      // If over budget, trim page history
      while (json.length > MAX_MEMORY_SIZE && this._memory.pageHistory.length > 1) {
        this._memory.pageHistory.shift();
        json = JSON.stringify(this._memory);
      }
      sessionStorage.setItem(this._key, json);
    } catch (_e) {
      // Storage full or disabled — silently ignore
    }
  };

  /**
   * Records a page visit.
   * @param {{url: string, title: string, pageType: string}} pageContext
   */
  MemoryManager.prototype.recordPage = function (pageContext) {
    this._memory.previousPage = this._memory.currentPage;
    this._memory.currentPage = {
      url: pageContext.url,
      title: pageContext.title,
      pageType: pageContext.pageType,
      timestamp: Date.now()
    };

    // Avoid duplicate consecutive entries
    var history = this._memory.pageHistory;
    var last = history.length > 0 ? history[history.length - 1] : null;
    if (!last || last.url !== pageContext.url) {
      history.push(this._memory.currentPage);
      if (history.length > MAX_PAGE_HISTORY) {
        history.shift();
      }
    }
    this._save();
  };

  /**
   * @returns {object} Current memory state.
   */
  MemoryManager.prototype.getMemory = function () {
    return {
      pageHistory: this._memory.pageHistory,
      currentPage: this._memory.currentPage,
      previousPage: this._memory.previousPage,
      currentWorkflow: this._memory.currentWorkflow,
      selectedTab: this._memory.selectedTab,
      recentActions: this._memory.recentActions
    };
  };

  /** Clears all persisted memory. */
  MemoryManager.prototype.destroy = function () {
    try { sessionStorage.removeItem(this._key); } catch (_e) { /* ignore */ }
  };

  /* ================================================================
   *  VIEWPORT SCANNER
   * ================================================================ */

  /**
   * @constructor
   * Uses IntersectionObserver to track which semantic elements are visible.
   */
  function ViewportScanner() {
    /** @type {Set<Element>} */
    this._visible = new Set();
    /** @type {WeakMap<Element, {ratio: number, inViewport: boolean, distance: number}>} */
    this._info = new WeakMap();
    /** @type {IntersectionObserver|null} */
    this._observer = null;
  }

  /**
   * Start observing semantic elements within root.
   * @param {HTMLElement} root
   */
  ViewportScanner.prototype.start = function (root) {
    if (this._observer) return;
    var self = this;

    if (typeof IntersectionObserver !== 'undefined') {
      this._observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var el = entry.target;
          var inViewport = entry.isIntersecting;
          var distance = 0;
          if (!inViewport) {
            var rect = entry.boundingClientRect;
            var vpH = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
            if (rect.bottom < 0) {
              distance = Math.abs(rect.bottom);
            } else if (rect.top > vpH) {
              distance = rect.top - vpH;
            }
          }

          self._info.set(el, {
            ratio: entry.intersectionRatio,
            inViewport: inViewport,
            distance: distance
          });

          if (inViewport) {
            self._visible.add(el);
          } else {
            self._visible.delete(el);
          }
        }
      }, {
        rootMargin: IO_ROOT_MARGIN,
        threshold: IO_THRESHOLDS
      });

      // Observe existing semantic elements
      this._observeElements(root);
    }
  };

  /**
   * Query and observe all semantic elements under root.
   * @param {HTMLElement} root
   */
  ViewportScanner.prototype._observeElements = function (root) {
    if (!this._observer) return;
    try {
      var els = root.querySelectorAll(SEMANTIC_SELECTORS);
      for (var i = 0; i < els.length && i < MAX_DOM_NODES; i++) {
        this._observer.observe(els[i]);
      }
    } catch (_e) {
      console.warn('AriaContextEngine: viewport scanner failed to observe elements', _e);
    }
  };

  /**
   * Re-scan the DOM for new elements (after mutations).
   * @param {HTMLElement} root
   */
  ViewportScanner.prototype.refresh = function (root) {
    this._observeElements(root);
  };

  /**
   * Get visibility info for an element.
   * @param {Element} el
   * @returns {{ratio: number, inViewport: boolean, distance: number}|null}
   */
  ViewportScanner.prototype.getInfo = function (el) {
    return this._info.get(el) || null;
  };

  /**
   * @returns {Set<Element>} Currently visible elements.
   */
  ViewportScanner.prototype.getVisible = function () {
    return this._visible;
  };

  /**
   * Checks if an element is visible or near the viewport (distance < 200px).
   * @param {Element} el
   * @returns {boolean}
   */
  ViewportScanner.prototype.isRelevant = function (el) {
    var info = this._info.get(el);
    if (!info) return false;
    return info.inViewport || info.distance < 200;
  };

  /** Disconnect observer. */
  ViewportScanner.prototype.destroy = function () {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._visible.clear();
  };

  /* ================================================================
   *  ELEMENT EXTRACTORS
   * ================================================================ */

  /**
   * Helper: get viewport info or a default for an element.
   * @param {ViewportScanner} scanner
   * @param {Element} el
   * @returns {{inViewport: boolean, distance: number}}
   */
  function vInfo(scanner, el) {
    var info = scanner.getInfo(el);
    return info || { inViewport: false, distance: 9999 };
  }

  /**
   * Fallback check for element visibility and viewport relevance.
   * If the IntersectionObserver hasn't fired yet, it uses getBoundingClientRect.
   * @param {HTMLElement} el
   * @param {object} vi
   * @returns {boolean}
   */
  function isElementRelevantFallback(el, vi) {
    if (vi.inViewport) return true;
    if (vi.distance !== 9999) return vi.distance < 400; // Increased distance threshold
    
    try {
      var rect = el.getBoundingClientRect();
      var vpH = window.innerHeight;
      var inViewport = rect.top < vpH && rect.bottom > 0; // Correct intersection check
      if (inViewport) return true;
      var dist = Math.min(Math.abs(rect.top - vpH), Math.abs(rect.bottom));
      return dist < 400;
    } catch(e) {
      return false;
    }
  }

  /**
   * Extracts text content of an element cleanly, ignoring specified selectors.
   * @param {HTMLElement} el
   * @param {string[]} ignoreSelectors
   * @returns {string}
   */
  function getCleanTextOfElement(el, ignoreSelectors) {
    var clone = el.cloneNode(true);
    var widget = clone.querySelector('#aria-ai-widget-root');
    if (widget) widget.remove();
    
    ignoreSelectors.forEach(function (ign) {
      try {
        clone.querySelectorAll(ign).forEach(function (e) { e.remove(); });
      } catch (err) {}
    });
    
    var text = (clone.textContent || '').trim();
    text = text.replace(/\s+/g, ' ');
    return text.length > 1000 ? text.slice(0, 1000) + '…' : text;
  }

  /**
   * Custom Container Extractor.
   * Extracts text content of selectors defined in window.AriaConfig.contextSelectors.
   * @param {HTMLElement} root
   * @param {ViewportScanner} scanner
   * @returns {object[]}
   */
  function extractCustomContainers(root, scanner) {
    var results = [];
    try {
      var config = window.AriaConfig || {};
      var selectors = config.contextSelectors || [];
      if (!Array.isArray(selectors)) selectors = [selectors];
      
      var ignoreSelectors = config.ignoreSelectors || [];
      if (!Array.isArray(ignoreSelectors)) ignoreSelectors = [ignoreSelectors];
      
      selectors.forEach(function (sel) {
        if (typeof sel !== 'string') return;
        var els = root.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          
          var isIgnored = ignoreSelectors.some(function (ign) {
            try {
              return el.closest(ign) !== null;
            } catch (e) {
              return false;
            }
          });
          if (isIgnored) continue;
          
          var vi = vInfo(scanner, el);
          var inViewport = vi.inViewport;
          var distance = vi.distance;
          
          if (!inViewport && distance === 9999) {
            var rect = el.getBoundingClientRect();
            var vpH = window.innerHeight;
            inViewport = rect.top >= 0 && rect.bottom <= vpH;
            distance = inViewport ? 0 : Math.min(Math.abs(rect.top), Math.abs(rect.bottom - vpH));
          }
          
          if (!inViewport && distance > 300) continue;
          
          var text = getCleanTextOfElement(el, ignoreSelectors);
          if (!text) continue;
          
          results.push(prioritizedItem({
            selector: sel,
            text: text
          }, 6, inViewport, distance, ['custom-container']));
        }
      });
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Heading Extractor ---------------------------------------- */
  function extractHeadings(root, scanner) {
    var results = [];
    try {
      var els = root.querySelectorAll('h1,h2,h3,h4');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;
        var text = safeText(el, 150);
        if (!text) continue;
        results.push(prioritizedItem(
          { level: parseInt(el.tagName[1], 10), text: text },
          el.tagName === 'H1' ? 9 : el.tagName === 'H2' ? 7 : 5,
          vi.inViewport, vi.distance, ['heading']
        ));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Card Extractor ------------------------------------------- */
  var CARD_CLASS_RE = /\bcard\b|stat|metric|kpi|widget/i;
  var CARD_ROLES = ['group', 'region', 'listitem'];

  /**
   * Recursively extracts all leaf text blocks from an element in DOM order,
   * skipping scripts, styles, widget container, SVGs, etc.
   * @param {HTMLElement} el
   * @returns {string[]}
   */
  function getTextBlocks(el) {
    var blocks = [];
    
    function traverse(node) {
      if (node.nodeType === 3) { // Text node
        var txt = node.nodeValue.trim();
        if (txt) blocks.push(txt);
        return;
      }
      
      if (node.nodeType === 1) { // Element node
        var tagName = node.tagName.toLowerCase();
        if (tagName === 'script' || tagName === 'style' || tagName === 'noscript' || tagName === 'svg' || tagName === 'canvas') return;
        if (node.id === 'aria-ai-widget-root') return;
        
        // If it's a simple text container with no element children, we can grab its textContent directly
        var hasElementChildren = false;
        for (var i = 0; i < node.children.length; i++) {
          if (node.children[i].nodeType === 1) {
            hasElementChildren = true;
            break;
          }
        }
        
        if (!hasElementChildren) {
          var t = (node.textContent || '').trim();
          if (t) blocks.push(t);
          return;
        }
        
        // Otherwise, traverse child nodes
        var childNodes = node.childNodes;
        for (var j = 0; j < childNodes.length; j++) {
          traverse(childNodes[j]);
        }
      }
    }
    
    traverse(el);
    return blocks;
  }

  function extractCards(root, scanner) {
    var results = [];
    var extractedElements = [];
    try {
      // Find generic block elements that might be KPI cards
      var candidates = root.querySelectorAll('div, article, section, li');
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        
        // Prevent nesting: check if this element is inside an already extracted card element
        var isSubCard = false;
        for (var k = 0; k < extractedElements.length; k++) {
          if (extractedElements[k].contains(el)) {
            isSubCard = true;
            break;
          }
        }
        if (isSubCard) continue;
        
        // Extract all text blocks in this element recursively
        var lines = getTextBlocks(el);
        
        // A KPI card typically has 2 to 15 text blocks (complex cards might have badges, icons, or split text)
        if (lines.length < 2 || lines.length > 15) continue;
        
        var totalLen = 0;
        for (var c = 0; c < lines.length; c++) {
          totalLen += lines[c].length;
        }
        
        // A stat card usually has short total text (less than 300 chars)
        if (totalLen > 300) continue;

        // At least one line should look like a numeric value, currency, or count
        var valueIdx = -1;
        for (var j = 0; j < lines.length; j++) {
          if (/^[\$\€\£\₹]?\s*[\d,]+(\.\d+)?([KMBkmb%])?$/.test(lines[j]) || /^\d+$/.test(lines[j])) {
            valueIdx = j;
            break;
          }
        }
        // Fallback to checking if there is any digit
        if (valueIdx === -1) {
          for (var j = 0; j < lines.length; j++) {
            if (/\d/.test(lines[j]) && lines[j].length <= 15) {
              valueIdx = j;
              break;
            }
          }
        }
        
        if (valueIdx === -1) continue;

        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;

        var value = lines[valueIdx];
        var title = valueIdx > 0 ? lines[0] : (lines.length > 1 ? lines[1] : '');
        var subtitle = lines.length > 2 ? lines.filter(function(_, idx) { return idx !== valueIdx && lines[idx] !== title; }).join(' ') : '';

        var card = {
          title: title,
          value: value,
          description: subtitle
        };

        // Skip generic noisy elements (e.g. timestamps, pagination)
        if (!card.title || !card.value || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(card.value)) continue;

        // Prevent exact duplicates
        var isDuplicate = false;
        for (var k = 0; k < results.length; k++) {
          if (results[k].item.title === card.title && results[k].item.value === card.value) {
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate) {
          results.push(prioritizedItem(card, 7, vi.inViewport, vi.distance, ['card']));
          extractedElements.push(el);
        }
      }
    } catch (_e) { /* ignore */ }
    return results;
  }


  /* -- Table Extractor ------------------------------------------ */
  function extractTables(root, scanner) {
    var results = [];
    try {
      var tables = root.querySelectorAll('table,[role="grid"],[role="table"]');
      for (var t = 0; t < tables.length; t++) {
        var table = tables[t];
        var vi = vInfo(scanner, table);
        if (!isElementRelevantFallback(table, vi)) continue;

        var headers = [];
        var headerEls = table.querySelectorAll('thead th, thead td, [role="columnheader"]');
        for (var h = 0; h < headerEls.length; h++) {
          var headerText = safeText(headerEls[h], 60);
          // Skip interactive or empty action headers
          if (/^(actions|action|operations|op|manage|edit|view|delete|\s*)$/i.test(headerText.trim())) {
            continue;
          }
          var sortDir = headerEls[h].getAttribute('aria-sort') || '';
          headers.push({
            text: headerText,
            sorted: sortDir || undefined
          });
        }

        // Visible rows (first 5)
        var rows = [];
        var bodyRows = table.querySelectorAll('tbody tr, [role="row"]');
        var selectedRow = null;
        var count = 0;
        for (var r = 0; r < bodyRows.length; r++) {
          var row = bodyRows[r];
          // Skip header rows inside role="row"
          if (row.querySelector('[role="columnheader"]')) continue;
          
          // Skip hidden rows
          if (row.offsetHeight === 0 && row.offsetWidth === 0) continue;

          var isSelected = /\b(selected|active)\b/.test(row.className || '');
          var cells = row.querySelectorAll('td,[role="cell"],[role="gridcell"]');
          var rowData = [];
          for (var c = 0; c < cells.length; c++) {
            var cellText = safeText(cells[c], 60);
            // Clean up cell text: skip cells containing only interactive actions (e.g., View | Edit | Delete)
            var isActionCell = /^\s*(view|edit|delete|remove|details|update|\s*\/\|\s*)*$/i.test(cellText) ||
                               cells[c].querySelector('button, a, [role="button"]') !== null &&
                               /^(view|edit|delete|remove|details|update)$/i.test(cellText.replace(/\s+/g, ''));
            if (isActionCell) continue;
            rowData.push(cellText);
          }

          if (isSelected) {
            selectedRow = rowData;
          }

          if (count < 5) {
            rows.push(rowData);
          }
          count++;
        }

        // Pagination info
        var pagination = null;
        var pagEl = table.parentElement ? table.parentElement.querySelector('[class*="pagination"],[class*="pager"],[role="navigation"]') : null;
        if (pagEl) {
          var activePage = pagEl.querySelector('[aria-current="page"],.active,[class*="current"]');
          pagination = {
            currentPage: safeText(activePage, 10) || '1',
            text: safeText(pagEl, 80)
          };
        }

        // Prepare format-compliant headers and sort info
        var headersText = headers.map(function (h) { return h.text; });
        var sortCol = undefined;
        var sortDirVal = undefined;
        for (var idx = 0; idx < headers.length; idx++) {
          if (headers[idx].sorted && headers[idx].sorted !== 'none') {
            sortCol = headers[idx].text;
            sortDirVal = headers[idx].sorted;
          }
        }

        results.push(prioritizedItem({
          headers: headersText, // Conforming string[]
          rawHeaders: headers, // Legacy compatibility
          rows: rows, // Legacy compatibility
          visibleRows: rows, // Conforming string[][]
          rowCount: count,
          selectedRow: selectedRow, // Now string[] instead of number index
          sortColumn: sortCol,
          sortDirection: sortDirVal,
          pagination: pagination ? {
            currentPage: parseInt(pagination.currentPage, 10) || 1,
            totalPages: 1,
            text: pagination.text
          } : undefined
        }, 8, vi.inViewport, vi.distance, ['table']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Form Extractor ------------------------------------------- */
  function extractForms(root, scanner) {
    var results = [];
    try {
      var forms = root.querySelectorAll('form,[role="form"]');
      for (var f = 0; f < forms.length; f++) {
        var form = forms[f];
        var vi = vInfo(scanner, form);
        if (!isElementRelevantFallback(form, vi)) continue;

        var fields = [];
        var inputs = form.querySelectorAll('input,select,textarea');
        var filled = 0;
        var total = 0;

        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          var type = (inp.getAttribute('type') || inp.tagName.toLowerCase()).toLowerCase();

          // Skip hidden and submit-like inputs
          if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
          total++;

          var label = getFieldLabel(inp);
          var value = SecuritySanitizer.sanitizeFieldValue(inp);
          if (value && value !== '[REDACTED]') filled++;

          // Error detection
          var hasError = false;
          var errorMsg = '';
          if (inp.getAttribute('aria-invalid') === 'true') hasError = true;
          if (/\b(error|invalid)\b/i.test(inp.className || '')) hasError = true;
          // Check sibling or parent for error messages
          var errEl = inp.parentElement ? inp.parentElement.querySelector('.error-message,[class*="error"],[role="alert"]') : null;
          if (errEl) {
            hasError = true;
            errorMsg = safeText(errEl, 80);
          }

          fields.push({
            label: label,
            type: type === 'password' ? 'password' : type,
            name: inp.getAttribute('name') || '',
            value: type === 'password' ? '[REDACTED]' : value,
            required: inp.hasAttribute('required'),
            hasError: hasError,
            errorMessage: errorMsg || undefined
          });
        }

        var completion = total > 0 ? Math.round((filled / total) * 100) : 0;

        results.push(prioritizedItem({
          action: SecuritySanitizer.sanitizeUrl(form.getAttribute('action') || ''),
          method: (form.getAttribute('method') || 'GET').toUpperCase(),
          fields: fields,
          completionPercent: completion,
          fieldCount: total
        }, 8, vi.inViewport, vi.distance, ['form']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Navigation Extractor ------------------------------------- */
  function extractNavigation(root, scanner) {
    var results = [];
    try {
      var navs = root.querySelectorAll('nav,[role="navigation"]');
      for (var n = 0; n < navs.length; n++) {
        var nav = navs[n];
        var vi = vInfo(scanner, nav);
        if (!isElementRelevantFallback(nav, vi)) continue;

        var items = [];
        var links = nav.querySelectorAll('a,button,[role="tab"],[role="menuitem"]');
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          var isActive = link.getAttribute('aria-current') === 'page'
            || link.getAttribute('aria-selected') === 'true'
            || /\b(active|selected|current)\b/i.test(link.className || '');

          items.push({
            label: safeText(link, 60),
            active: isActive
          });
        }

        if (items.length > 0) {
          results.push(prioritizedItem({
            label: nav.getAttribute('aria-label') || '',
            items: items
          }, 6, vi.inViewport, vi.distance, ['navigation']));
        }
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Chart Extractor ------------------------------------------ */
  var CHART_CLASS_RE = /chart|graph|plot|recharts|highcharts|echarts|d3|viz/i;

  function extractCharts(root, scanner) {
    var results = [];
    try {
      var els = root.querySelectorAll('[class*="chart"],[class*="graph"],[class*="plot"],[class*="recharts"],[class*="highcharts"],[class*="echarts"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;

        var library = 'unknown';
        var cls = (el.className || '').toLowerCase();
        if (cls.indexOf('recharts') !== -1) library = 'recharts';
        else if (cls.indexOf('highcharts') !== -1) library = 'highcharts';
        else if (cls.indexOf('echarts') !== -1) library = 'echarts';
        else if (cls.indexOf('d3') !== -1 || el.querySelector('.d3')) library = 'd3';
        else if (el.querySelector('canvas')) library = 'chartjs';

        var titleEl = el.querySelector('[class*="title"],h1,h2,h3,h4,h5,h6,figcaption');
        var chartType = el.getAttribute('data-chart-type') || el.getAttribute('data-type') || '';

        results.push(prioritizedItem({
          title: safeText(titleEl, 100) || el.getAttribute('aria-label') || '',
          library: library,
          type: chartType,
          ariaLabel: el.getAttribute('aria-label') || ''
        }, 7, vi.inViewport, vi.distance, ['chart']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Dialog Extractor ----------------------------------------- */
  function extractDialogs(root, scanner) {
    var results = [];
    try {
      var dialogs = root.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[class*="modal"]');
      for (var i = 0; i < dialogs.length; i++) {
        var el = dialogs[i];
        // Only extract if visible
        if (!isElementVisible(el)) continue;
        var vi = vInfo(scanner, el);

        var titleEl = el.querySelector('[class*="title"],h1,h2,h3,h4,[id*="title"]');
        var actions = [];
        var btns = el.querySelectorAll('button,[role="button"]');
        for (var b = 0; b < btns.length; b++) {
          var label = safeText(btns[b], 40);
          if (label) actions.push(label);
        }

        results.push(prioritizedItem({
          title: safeText(titleEl, 100) || '',
          content: safeText(el, 200),
          actions: actions
        }, 10, vi.inViewport, vi.distance, ['dialog']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Notification Extractor ----------------------------------- */
  var NOTIF_TYPE_RE = {
    success: /success|complete/i,
    error: /error|danger|fail/i,
    warning: /warning|warn|caution/i,
    info: /info|notice|status/i
  };

  function extractNotifications(root, scanner) {
    var results = [];
    try {
      var els = root.querySelectorAll('[role="alert"],[role="status"],[class*="toast"],[class*="notification"],[class*="alert"],[class*="error"],[class*="warning"],[class*="success"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!isElementVisible(el)) continue;
        var vi = vInfo(scanner, el);

        // Determine type
        var cls = (el.className || '') + ' ' + (el.getAttribute('role') || '');
        var nType = 'info';
        if (NOTIF_TYPE_RE.error.test(cls)) nType = 'error';
        else if (NOTIF_TYPE_RE.success.test(cls)) nType = 'success';
        else if (NOTIF_TYPE_RE.warning.test(cls)) nType = 'warning';

        var text = safeText(el, 200);
        if (!text) continue;

        results.push(prioritizedItem({
          type: nType,
          message: text
        }, nType === 'error' ? 9 : 7, vi.inViewport, vi.distance, ['notification', nType]));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Button Extractor ----------------------------------------- */
  function extractButtons(root, scanner) {
    var results = [];
    try {
      var btns = root.querySelectorAll('button,[role="button"],input[type="submit"]');
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;

        var label = safeText(el, 60) || el.getAttribute('aria-label') || el.getAttribute('value') || '';
        if (!label) continue;

        // Variant detection
        var cls = (el.className || '').toLowerCase();
        var variant = 'default';
        if (/primary/.test(cls)) variant = 'primary';
        else if (/secondary/.test(cls)) variant = 'secondary';
        else if (/danger|destructive|delete/.test(cls)) variant = 'danger';
        else if (/outline/.test(cls)) variant = 'outline';
        else if (/ghost/.test(cls)) variant = 'ghost';

        results.push(prioritizedItem({
          label: label,
          type: el.getAttribute('type') || 'button',
          disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
          variant: variant
        }, 4, vi.inViewport, vi.distance, ['button']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Stat Extractor ------------------------------------------- */
  var STAT_CLASS_RE = /\b(stat|metric|kpi)\b/i;

  function extractStats(root, scanner) {
    var results = [];
    try {
      var els = root.querySelectorAll('[class*="stat"],[class*="metric"],[class*="kpi"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!STAT_CLASS_RE.test(el.className || '')) continue;
        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;

        var labelEl = el.querySelector('[class*="label"],[class*="title"],[class*="name"],dt,th');
        var valueEl = el.querySelector('[class*="value"],[class*="number"],[class*="count"],dd,td');
        var trendEl = el.querySelector('[class*="trend"],[class*="change"],[class*="delta"]');

        var stat = {
          label: safeText(labelEl, 80) || '',
          value: safeText(valueEl, 50) || '',
          trend: safeText(trendEl, 40) || '',
          change: trendEl ? (safeText(trendEl, 20) || '') : ''
        };
        if (!stat.label && !stat.value) continue;

        results.push(prioritizedItem(stat, 7, vi.inViewport, vi.distance, ['stat']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- List Extractor ------------------------------------------- */
  function extractLists(root, scanner) {
    var results = [];
    try {
      var lists = root.querySelectorAll('ul,ol,[role="list"]');
      for (var i = 0; i < lists.length; i++) {
        var el = lists[i];
        // Skip lists inside navs (handled by nav extractor)
        if (el.closest('nav,[role="navigation"]')) continue;
        var vi = vInfo(scanner, el);
        if (!isElementRelevantFallback(el, vi)) continue;

        var items = [];
        var listItems = el.querySelectorAll(':scope > li, :scope > [role="listitem"]');
        var totalCount = listItems.length;
        for (var j = 0; j < Math.min(listItems.length, 10); j++) {
          var text = safeText(listItems[j], 100);
          if (text) items.push(text);
        }
        if (items.length === 0) continue;

        results.push(prioritizedItem({
          type: el.tagName === 'OL' ? 'ordered' : 'unordered',
          items: items,
          totalCount: totalCount
        }, 5, vi.inViewport, vi.distance, ['list']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Workflow Extractor --------------------------------------- */
  function extractWorkflows(root, scanner) {
    var results = [];
    try {
      // Progress bars
      var progressBars = root.querySelectorAll('[role="progressbar"]');
      for (var p = 0; p < progressBars.length; p++) {
        var pb = progressBars[p];
        var vi = vInfo(scanner, pb);
        if (!isElementRelevantFallback(pb, vi)) continue;

        var now = pb.getAttribute('aria-valuenow');
        var max = pb.getAttribute('aria-valuemax') || '100';
        var label = pb.getAttribute('aria-label') || pb.getAttribute('aria-valuetext') || '';
        var percent = now !== null ? Math.round((parseFloat(now) / parseFloat(max)) * 100) : null;

        results.push(prioritizedItem({
          type: 'progress',
          label: label,
          percent: percent,
          value: now,
          max: max
        }, 6, vi.inViewport, vi.distance, ['workflow', 'progress']));
      }

      // Step / wizard indicators
      var stepContainers = root.querySelectorAll('[class*="step"],[class*="wizard"],[class*="stepper"]');
      for (var s = 0; s < stepContainers.length; s++) {
        var container = stepContainers[s];
        var vi2 = vInfo(scanner, container);
        if (!isElementRelevantFallback(container, vi2)) continue;

        var steps = container.querySelectorAll('[class*="step"],li');
        if (steps.length < 2) continue;

        var stepLabels = [];
        var currentStep = -1;
        for (var j = 0; j < steps.length; j++) {
          stepLabels.push(safeText(steps[j], 60));
          var sCls = (steps[j].className || '').toLowerCase();
          if (/\b(active|current)\b/.test(sCls) || steps[j].getAttribute('aria-current') === 'step') {
            currentStep = j;
          }
        }

        results.push(prioritizedItem({
          type: 'wizard',
          steps: stepLabels,
          currentStep: currentStep >= 0 ? currentStep + 1 : null,
          totalSteps: steps.length
        }, 7, vi2.inViewport, vi2.distance, ['workflow', 'wizard']));
      }

      // Breadcrumbs
      var breadcrumbs = root.querySelectorAll('[class*="breadcrumb"],[aria-label="breadcrumb"],[role="navigation"][aria-label*="breadcrumb"]');
      for (var b = 0; b < breadcrumbs.length; b++) {
        var bc = breadcrumbs[b];
        var vi3 = vInfo(scanner, bc);
        if (!isElementRelevantFallback(bc, vi3)) continue;

        var crumbs = bc.querySelectorAll('a,span,li');
        var crumbLabels = [];
        for (var c = 0; c < crumbs.length; c++) {
          var ct = safeText(crumbs[c], 40);
          if (ct && ct !== '/' && ct !== '>' && ct !== '»') crumbLabels.push(ct);
        }
        if (crumbLabels.length === 0) continue;

        results.push(prioritizedItem({
          type: 'breadcrumb',
          items: crumbLabels
        }, 5, vi3.inViewport, vi3.distance, ['workflow', 'breadcrumb']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /* -- Canvas / SVG Extractor ----------------------------------- */
  function extractCanvasSvg(root, scanner) {
    var results = [];
    try {
      // Canvas elements
      var canvases = root.querySelectorAll('canvas');
      for (var i = 0; i < canvases.length; i++) {
        var cvs = canvases[i];
        var vi = vInfo(scanner, cvs);
        if (!isElementRelevantFallback(cvs, vi)) continue;

        var label = cvs.getAttribute('aria-label') || '';
        var parent = cvs.closest('figure,[class*="chart"],[class*="graph"]');
        var caption = parent ? parent.querySelector('figcaption') : null;

        // Detect chart library
        var library = 'unknown';
        if (parent) {
          var pCls = (parent.className || '').toLowerCase();
          if (pCls.indexOf('chartjs') !== -1 || pCls.indexOf('chart-js') !== -1) library = 'chartjs';
          else if (pCls.indexOf('echarts') !== -1) library = 'echarts';
        }

        results.push(prioritizedItem({
          type: 'canvas',
          ariaLabel: label,
          caption: safeText(caption, 100),
          library: library,
          dataAttributes: extractDataAttrs(cvs)
        }, 6, vi.inViewport, vi.distance, ['canvas']));
      }

      // SVG elements (skip tiny icons)
      var svgs = root.querySelectorAll('svg');
      for (var j = 0; j < svgs.length; j++) {
        var svg = svgs[j];
        // Skip small icons (< 40x40)
        var w = svg.getAttribute('width');
        var h = svg.getAttribute('height');
        if (w && h && parseInt(w, 10) < 40 && parseInt(h, 10) < 40) continue;
        // Also skip by bounding box
        try {
          var rect = svg.getBoundingClientRect();
          if (rect.width < 40 && rect.height < 40) continue;
        } catch (_e2) { /* ignore */ }

        var vi2 = vInfo(scanner, svg);
        if (!vi2.inViewport && vi2.distance > 200) continue;

        var svgTitle = svg.querySelector('title');
        var svgDesc = svg.querySelector('desc');
        var svgTexts = svg.querySelectorAll('text');
        var textLabels = [];
        for (var k = 0; k < Math.min(svgTexts.length, 10); k++) {
          var t = safeText(svgTexts[k], 40);
          if (t) textLabels.push(t);
        }

        var svgParent = svg.closest('figure,[class*="chart"],[class*="graph"]');
        var svgCaption = svgParent ? svgParent.querySelector('figcaption') : null;

        results.push(prioritizedItem({
          type: 'svg',
          title: safeText(svgTitle, 80),
          description: safeText(svgDesc, 100),
          ariaLabel: svg.getAttribute('aria-label') || '',
          caption: safeText(svgCaption, 100),
          textLabels: textLabels,
          dataAttributes: extractDataAttrs(svg)
        }, 5, vi2.inViewport, vi2.distance, ['svg']));
      }
    } catch (_e) { /* ignore */ }
    return results;
  }

  /**
   * Extracts data-* attributes from an element.
   * @param {Element} el
   * @returns {object}
   */
  function extractDataAttrs(el) {
    var attrs = {};
    try {
      if (el.dataset) {
        var keys = Object.keys(el.dataset);
        for (var i = 0; i < Math.min(keys.length, 10); i++) {
          var val = el.dataset[keys[i]];
          if (typeof val === 'string' && val.length <= 100) {
            attrs[keys[i]] = val;
          }
        }
      }
    } catch (_e) { /* ignore */ }
    return attrs;
  }

  /* ================================================================
   *  MAIN CLASS — AriaContextEngine
   * ================================================================ */

  /**
   * Website Context Engine for the Aria AI widget.
   * Extracts structured, security-sanitized context from the host page's visible DOM.
   *
   * @constructor
   * @param {object} config  Widget configuration object
   * @param {string} config.widgetToken  The unique widget token
   * @param {boolean} [config.contextEnabled=true]  Whether context extraction is enabled
   */
  function AriaContextEngine(config) {
    config = config || {};

    /** @private */ this._config = config;
    /** @private */ this._widgetToken = config.widgetToken || 'default';
    /** @private */ this._enabled = config.contextEnabled !== false;
    /** @private */ this._started = false;
    /** @private */ this._root = null;
    /** @private */ this._widgetContainer = config.widgetContainer || null;

    // Sub-components (lazily initialized in start())
    /** @private */ this._scanner = null;
    /** @private */ this._mutationWatcher = null;
    /** @private */ this._hasher = new ContextHasher();
    /** @private */ this._memory = new MemoryManager(this._widgetToken);

    // Cache
    /** @private */ this._cachedContext = null;
    /** @private */ this._cacheTime = 0;
    /** @private */ this._lastUrl = '';

    // Throttle
    /** @private */ this._lastScanTime = 0;

    // URL polling timer
    /** @private */ this._urlPollTimer = null;
  }

  /**
   * Initialize the context engine and begin observing the host page.
   * Does nothing if context extraction is disabled.
   *
   * @param {HTMLElement} rootElement  The host page's document.body
   */
  AriaContextEngine.prototype.start = function (rootElement) {
    if (this._started || !this._enabled) return;
    if (!rootElement) {
      console.warn('AriaContextEngine: start() called without a root element');
      return;
    }

    // Performance guard: bail if DOM is too large
    try {
      var nodeCount = rootElement.querySelectorAll('*').length;
      if (nodeCount > MAX_DOM_NODES) {
        console.warn('AriaContextEngine: DOM has ' + nodeCount + ' nodes (limit ' + MAX_DOM_NODES + '). Context extraction disabled.');
        this._enabled = false;
        return;
      }
    } catch (_e) { /* ignore, proceed */ }

    this._root = rootElement;
    this._started = true;
    this._lastUrl = window.location.href;

    // Initialize viewport scanner
    this._scanner = new ViewportScanner();
    this._scanner.start(this._root);

    // Initialize mutation watcher
    var widgetRoot = this._widgetContainer || rootElement.querySelector('#aria-ai-widget-root');
    this._mutationWatcher = new MutationWatcher(widgetRoot);
    this._mutationWatcher.start(this._root);

    // Start URL change polling
    var self = this;
    this._urlPollTimer = setInterval(function () {
      var currentUrl = window.location.href;
      if (currentUrl !== self._lastUrl) {
        self._lastUrl = currentUrl;
        self._invalidateCache();
        // Re-scan elements after SPA navigation
        if (self._scanner) {
          self._scanner.refresh(self._root);
        }
      }
    }, URL_POLL_MS);

    // Record initial page
    this._memory.recordPage({
      url: SecuritySanitizer.sanitizeUrl(window.location.href),
      title: document.title || '',
      pageType: classifyPage(document)
    });
  };

  /**
   * Extracts the current website context with delta transport.
   * Returns null if:
   * - Context extraction is disabled
   * - The engine hasn't been started
   * - Nothing has changed since the last call and cache is still valid
   *
   * @returns {Promise<object|null>} WebsiteContext with delta information, or null.
   */
  AriaContextEngine.prototype.getContext = async function () {
    if (!this._enabled || !this._started || !this._root) return null;

    // Check cache validity
    var now = Date.now();
    var urlChanged = window.location.href !== this._lastUrl;
    var mutationsDetected = this._mutationWatcher && this._mutationWatcher.hasChanges();
    var cacheExpired = (now - this._cacheTime) > CACHE_TTL_MS;

    if (this._cachedContext && !urlChanged && !mutationsDetected && !cacheExpired) {
      // Nothing changed — return null to signal "no update needed"
      return null;
    }

    // Throttle: don't scan more often than THROTTLE_MS
    if ((now - this._lastScanTime) < THROTTLE_MS && this._cachedContext) {
      return null;
    }

    // If URL changed or mutations detected, refresh the scanner to observe new elements
    if (urlChanged || mutationsDetected) {
      if (urlChanged) this._lastUrl = window.location.href;
      if (this._scanner) this._scanner.refresh(this._root);
    }

    // Reset mutation flag
    if (this._mutationWatcher) this._mutationWatcher.reset();

    this._lastScanTime = now;

    try {
      var context = await this._extract();
      this._cachedContext = context;
      this._cacheTime = Date.now();
      return context;
    } catch (err) {
      console.warn('AriaContextEngine: extraction failed', err);
      return this._cachedContext || null;
    }
  };

  /**
   * Returns the last cached context without triggering a re-scan.
   * @returns {object|null}
   */
  AriaContextEngine.prototype.getCachedContext = function () {
    return this._cachedContext || null;
  };

  /**
   * Stops all observers, timers, and cleans up resources.
   */
  AriaContextEngine.prototype.destroy = function () {
    if (this._scanner) {
      this._scanner.destroy();
      this._scanner = null;
    }
    if (this._mutationWatcher) {
      this._mutationWatcher.destroy();
      this._mutationWatcher = null;
    }
    if (this._urlPollTimer) {
      clearInterval(this._urlPollTimer);
      this._urlPollTimer = null;
    }
    this._started = false;
    this._cachedContext = null;
    this._root = null;
  };

  /** @private Invalidates the cached context. */
  AriaContextEngine.prototype._invalidateCache = function () {
    this._cachedContext = null;
    this._cacheTime = 0;
  };

  /**
   * Core extraction pipeline. Runs all extractors within a performance budget
   * and computes the delta hash.
   *
   * @private
   * @returns {Promise<object>} Full WebsiteContext payload.
   */
  AriaContextEngine.prototype._extract = async function () {
    var startTime = performance.now();

    // --- Structured Context API (Highest Priority) ---
    if (window.AriaContext) {
      // Return structured data immediately, bypassing DOM scan
      return {
        version: "2.0",
        timestamp: Date.now(),
        extractionDurationMs: performance.now() - startTime,
        transport: { mode: "full", sessionHash: "", segmentHashes: {}, changedSegments: [], unchangedSegments: [], sequenceNumber: 0 },
        page: { url: window.location.href, title: document.title, type: window.AriaContext.page || "unknown", breadcrumbs: [], heading: "" },
        navigation: { items: [] },
        content: { headings: [], forms: window.AriaContext.forms || [], tables: window.AriaContext.tables || [], cards: [], stats: [], notifications: [], dialogs: [], charts: [] },
        state: { currentCustomer: window.AriaContext.user?.name || undefined, selectedFilters: {}, openDialogs: [], recentActions: [], conversationTurns: 0, createdAt: Date.now(), lastActivityAt: Date.now() },
        workflow: { currentWorkflow: "", completedSteps: [], activeStep: "", nextSteps: [] },
        viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY, scrollDepthPercent: 0, visibleElementCount: 0, totalElementCount: 0, viewportCoveragePercent: 0 },
        metadata: { engineVersion: "1.0.0", extractorsUsed: ["structured_api"], domNodeCount: 0, memoryUsageBytes: 0, isPartial: false },
        ariaContext: window.AriaContext // Attach the raw payload
      };
    }

    var root = this._root;
    var scanner = this._scanner;

    // --- Page-level info ---
    var pageUrl = SecuritySanitizer.sanitizeUrl(window.location.href);
    var pageType = classifyPage(document);
    var framework = detectFramework();

    var page = {
      url: pageUrl,
      title: document.title || '',
      pageType: pageType,
      framework: framework
    };

    // --- Run extractors (budget-aware) ---
    var flatSegments = {};
    var extractors = [
      { key: 'headings',         fn: extractHeadings },
      { key: 'cards',            fn: extractCards },
      { key: 'tables',           fn: extractTables },
      { key: 'forms',            fn: extractForms },
      { key: 'navigation',       fn: extractNavigation },
      { key: 'charts',           fn: extractCharts },
      { key: 'dialogs',          fn: extractDialogs },
      { key: 'notifications',    fn: extractNotifications },
      { key: 'buttons',          fn: extractButtons },
      { key: 'stats',            fn: extractStats },
      { key: 'lists',            fn: extractLists },
      { key: 'workflows',        fn: extractWorkflows },
      { key: 'canvasSvg',        fn: extractCanvasSvg },
      { key: 'customContainers', fn: extractCustomContainers }
    ];

    for (var i = 0; i < extractors.length; i++) {
      // Check budget
      if (performance.now() - startTime > EXTRACTION_BUDGET_MS) {
        console.warn('AriaContextEngine: extraction budget exceeded after ' + extractors[i - 1].key + '. Skipping remaining extractors.');
        break;
      }

      try {
        var items = extractors[i].fn(root, scanner);
        if (items && items.length > 0) {
          // Sort by priority descending, viewport items first
          items.sort(function (a, b) {
            if (a.inViewport !== b.inViewport) return a.inViewport ? -1 : 1;
            return b.priority - a.priority;
          });
          flatSegments[extractors[i].key] = items;
        }
      } catch (_e) {
        console.warn('AriaContextEngine: extractor "' + extractors[i].key + '" failed', _e);
      }
    }

    // Memory / Action History
    var memory = this._memory.getMemory();

    // 1. Page Segment
    var pageH1 = document.querySelector('h1');
    var pageObj = {
      url: pageUrl,
      path: window.location.pathname,
      title: document.title || '',
      type: pageType,
      breadcrumbs: (flatSegments.workflows || []).filter(function(w) { return w.data && w.data.type === 'breadcrumb'; }).map(function(w) { return w.data.items; })[0] || [],
      heading: pageH1 ? (pageH1.textContent || '').trim().slice(0, 100) : ''
    };

    // Record in memory
    this._memory.recordPage(page);

    // 2. Navigation Segment
    var navObj = {
      items: (flatSegments.navigation || []).map(function(n) { 
        return (n.data.items || []).map(function(i) { return { label: i.label, active: i.active }; });
      })[0] || []
    };

    // Helper to unwrap prioritized items
    var unwrapItems = function(arr) {
      if (!arr) return [];
      return arr.map(function(item) { return item.data || item; });
    };

    // 3. Content Segment
    var contentObj = {
      headings: unwrapItems(flatSegments.headings),
      cards: unwrapItems(flatSegments.cards),
      tables: unwrapItems(flatSegments.tables),
      forms: unwrapItems(flatSegments.forms),
      charts: unwrapItems(flatSegments.charts),
      lists: unwrapItems(flatSegments.lists),
      notifications: unwrapItems(flatSegments.notifications),
      dialogs: unwrapItems(flatSegments.dialogs),
      buttons: unwrapItems(flatSegments.buttons),
      stats: unwrapItems(flatSegments.stats),
      canvasElements: unwrapItems(flatSegments.canvasSvg)
    };

    // 4. State Segment
    var stateObj = {
      activeFilters: [],
      openDialogs: (flatSegments.dialogs || []).filter(function(d) { return d.inViewport; }).map(function(d) { return d.data.title || ''; }),
      visibleErrors: (flatSegments.notifications || []).filter(function(n) { return n.data && n.data.type === 'error'; }).map(function(n) { return n.data.message; }),
      visibleWarnings: (flatSegments.notifications || []).filter(function(n) { return n.data && n.data.type === 'warning'; }).map(function(n) { return n.data.message; }),
      scrollPosition: window.scrollX + ',' + window.scrollY,
      idleTimeMs: 0
    };

    // 5. Workflow Segment
    var workflowObj = {
      currentWorkflow: (flatSegments.workflows || []).filter(function(w) { return w.data && w.data.type === 'wizard'; }).map(function(w) { return w.data.steps.join(' -> '); })[0] || '',
      completedSteps: [],
      activeStep: (flatSegments.workflows || []).filter(function(w) { return w.data && w.data.type === 'wizard'; }).map(function(w) { return w.data.currentStep + ''; })[0] || '',
      nextSteps: []
    };

    // 6. Viewport Segment
    var viewportObj = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollDepthPercent: Math.round((window.scrollY / (Math.max(1, document.documentElement.scrollHeight - window.innerHeight))) * 100) || 0,
      visibleElementCount: scanner.getVisible().size,
      totalElementCount: document.getElementsByTagName('*').length,
      viewportCoveragePercent: 0
    };

    // 7. Metadata Segment
    var metadataObj = {
      framework: framework,
      spaDetected: framework !== 'static',
      domNodeCount: document.getElementsByTagName('*').length,
      viewportNodeCount: scanner.getVisible().size,
      extractedElementCount: 0,
      cacheHit: false,
      mutationsSinceLastExtraction: 0,
      compressionRatio: 1
    };

    // Group into v2.0 segments
    var v2Segments = {
      page: pageObj,
      navigation: navObj,
      content: contentObj,
      state: stateObj,
      workflow: workflowObj,
      viewport: viewportObj,
      metadata: metadataObj
    };

    // --- Compute delta ---
    var delta = await this._hasher.computeDelta(v2Segments);

    var elapsed = Math.round(performance.now() - startTime);

    var changedList = Object.keys(delta.changed);
    var unchangedList = Object.keys(v2Segments).filter(function(k) { return !delta.changed[k]; });

    var payload = {
      version: '2.0',
      timestamp: Date.now(),
      extractionDurationMs: elapsed,
      transport: {
        mode: delta.mode,
        sessionHash: '',
        segmentHashes: delta.hashes,
        changedSegments: changedList,
        unchangedSegments: unchangedList,
        sequenceNumber: delta.sequenceNumber
      }
    };

    // Merge segments into payload. For full mode, send all segments. For delta mode, send only changed ones.
    if (delta.mode === 'full') {
      for (var k in v2Segments) {
        payload[k] = v2Segments[k];
      }
    } else {
      for (var k in delta.changed) {
        payload[k] = delta.changed[k];
      }
    }

    return payload;
  };

  /* ================================================================
   *  EXPOSE ON WINDOW
   * ================================================================ */

  window.AriaContextEngine = AriaContextEngine;

})();
