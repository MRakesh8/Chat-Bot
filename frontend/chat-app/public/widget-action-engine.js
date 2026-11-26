/**
 * Aria AI v2 - Browser Action Engine
 * 
 * Responsible for securely executing actions on the DOM based on
 * Swarm NavigationAgent outputs.
 */

(function () {
  if (window.AriaActionEngine) return;

  function AriaActionEngine() {}

  /**
   * Evaluates a locator to find a single target HTMLElement.
   * Prioritizes CSS, then XPath.
   */
  AriaActionEngine.prototype._findElement = function(locator) {
    if (!locator) return null;

    // 1. CSS
    if (locator.css) {
      try {
        var el = document.querySelector(locator.css);
        if (el) return el;
      } catch(e) {}
    }

    // 2. Fallback selectors
    if (locator.fallbackSelectors && locator.fallbackSelectors.length > 0) {
      for (var i = 0; i < locator.fallbackSelectors.length; i++) {
        try {
          var el2 = document.querySelector(locator.fallbackSelectors[i]);
          if (el2) return el2;
        } catch(e) {}
      }
    }

    // 3. XPath
    if (locator.xpath) {
      try {
        var res = document.evaluate(locator.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (res.singleNodeValue) return res.singleNodeValue;
      } catch(e) {}
    }

    // 4. Deep search including Shadow DOM (Expensive fallback)
    function deepSearch(root, selector) {
      if (root.querySelector) {
        var found = root.querySelector(selector);
        if (found) return found;
      }
      var children = root.children || root.childNodes;
      for (var j = 0; j < children.length; j++) {
        var child = children[j];
        if (child.shadowRoot) {
          var shadowFound = deepSearch(child.shadowRoot, selector);
          if (shadowFound) return shadowFound;
        }
        var deepFound = deepSearch(child, selector);
        if (deepFound) return deepFound;
      }
      return null;
    }

    if (locator.css) {
       try {
         var deepEl = deepSearch(document.body, locator.css);
         if (deepEl) return deepEl;
       } catch(e) {}
    }

    return null;
  };

  /**
   * Simulates a trusted click event on an element.
   */
  AriaActionEngine.prototype._simulateClick = function(element) {
    // Focus first
    if (typeof element.focus === 'function') element.focus();
    
    var events = ['mousedown', 'mouseup', 'click'];
    events.forEach(function(evType) {
      var ev = new MouseEvent(evType, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1
      });
      element.dispatchEvent(ev);
    });
  };

  /**
   * Simulates typing text into an input or textarea.
   */
  AriaActionEngine.prototype._simulateType = function(element, text) {
    if (typeof element.focus === 'function') element.focus();
    
    // Set value directly for controlled components (React, Vue)
    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    var nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    
    if (element.tagName === 'INPUT' && nativeInputValueSetter) {
      nativeInputValueSetter.call(element, text);
    } else if (element.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(element, text);
    } else {
      element.value = text;
    }

    var ev = new Event('input', { bubbles: true });
    element.dispatchEvent(ev);
    
    var changeEv = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEv);
  };

  /**
   * Main execution handler for Agent Actions.
   */
  AriaActionEngine.prototype.executeAction = function(actionParams, widgetToken, executionId, apiBaseUrl, confirmationToken) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var startTime = Date.now();
      var initialUrl = window.location.href;
      var domMutated = false;
      var elementFound = false;

      var postResult = function(status, error, verificationData) {
        if (!widgetToken || !executionId) return resolve({ status: status, error: error });
        var payload = {
           executionId: executionId,
           actionId: actionParams.id,
           status: status,
           tool: actionParams.type,
           duration: Date.now() - startTime,
           url: window.location.href,
           verification: verificationData || {},
           error: error ? error.message || String(error) : null,
           confirmationToken: confirmationToken
        };
        fetch((apiBaseUrl || 'http://localhost:3001') + '/api/widget/' + widgetToken + '/action-result', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload)
        }).then(function() {
           resolve(payload);
        }).catch(function(err) {
           resolve(payload); // Resolve anyway to not block frontend UI
        });
      };

      try {
        var actionType = actionParams.type || actionParams.actionType;
        var locator = actionParams.locator || { css: actionParams.actionTarget, xpath: actionParams.actionTarget }; // Simple mapping if LLM returns just a string target
        
        if (actionType === 'idle' || actionType === 'retry') {
          return postResult('success', null, { urlChanged: false, domMutated: false });
        }

        var element = self._findElement(locator);
        if (element) elementFound = true;
        
        if (!element && actionType !== 'navigate') {
          return postResult('failed', new Error('Target element not found: ' + JSON.stringify(locator)), { elementFound: false });
        }

        // Highlight element briefly for UX
        if (element) {
          var oldBorder = element.style.border;
          var oldTransition = element.style.transition;
          element.style.transition = 'all 0.3s';
          element.style.border = '2px solid #3b82f6';
        }
        
        setTimeout(function() {
          if (element) {
            element.style.border = oldBorder;
            element.style.transition = oldTransition;
          }
          
          try {
            switch (actionType) {
              case 'click':
                self._simulateClick(element);
                break;
              case 'navigate':
                if (actionParams.actionTarget || actionParams.value) {
                   window.location.href = actionParams.actionTarget || actionParams.value;
                } else if (element) {
                   self._simulateClick(element);
                }
                break;
              case 'type':
                self._simulateType(element, actionParams.value || actionParams.actionValue || '');
                break;
              case 'fill_form':
              case 'create_record':
                var fields = actionParams.fields || {};
                var fieldKeys = Object.keys(fields);
                
                function findInput(fieldName) {
                  var lower = fieldName.toLowerCase();
                  var selectors = [
                    'input[name="' + fieldName + '"]',
                    'input[id="' + fieldName + '"]',
                    'input[name*="' + lower + '" i]',
                    'input[id*="' + lower + '" i]',
                    'input[placeholder*="' + lower + '" i]',
                    'textarea[name*="' + lower + '" i]',
                    'textarea[placeholder*="' + lower + '" i]'
                  ];
                  if (lower.includes('email')) selectors.unshift('input[type="email"]');
                  if (lower.includes('phone') || lower.includes('tel')) selectors.unshift('input[type="tel"]');
                  for (var s = 0; s < selectors.length; s++) {
                    var inp = document.querySelector(selectors[s]);
                    if (inp) return inp;
                  }
                  return null;
                }

                var firstInput = fieldKeys.length > 0 ? findInput(fieldKeys[0]) : null;
                var openBtn = null;
                if (!firstInput) {
                  var buttons = Array.from(document.querySelectorAll('button, a'));
                  openBtn = buttons.find(function(b) {
                    var t = (b.textContent || '').trim().toLowerCase();
                    return t.includes('add client') || t.includes('new client') || t.includes('add') || t.includes('create');
                  });
                  if (openBtn) {
                    self._simulateClick(openBtn);
                  }
                }

                setTimeout(function() {
                  fieldKeys.forEach(function(key) {
                    var targetInp = findInput(key);
                    if (targetInp && fields[key]) {
                      self._simulateType(targetInp, String(fields[key]));
                    }
                  });

                  if (actionParams.submit !== false) {
                    setTimeout(function() {
                      var submitBtn = document.querySelector('button[type="submit"]') ||
                        Array.from(document.querySelectorAll('button')).find(function(b) {
                          var t = (b.textContent || '').trim().toLowerCase();
                          return t === 'save' || t === 'create' || t === 'submit' || t === 'save client' || t === 'add client';
                        });
                      if (submitBtn) {
                        self._simulateClick(submitBtn);
                      }
                    }, 400);
                  }
                }, openBtn ? 500 : 50);
                break;
              default:
                throw new Error('Unsupported action type: ' + actionType);
            }
            
            // Wait for potential DOM mutations (React updates)
            var observer = new MutationObserver(function(mutations) {
               if (mutations.length > 0) domMutated = true;
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            
            setTimeout(function() {
               observer.disconnect();
               var urlChanged = window.location.href !== initialUrl;
               postResult('success', null, { urlChanged: urlChanged, domMutated: domMutated, elementFound: elementFound });
            }, 800); // 800ms debounce
            
          } catch(e) {
            postResult('failed', e, { elementFound: elementFound });
          }
        }, 500); // Small delay to let user see what is being interacted with

      } catch (err) {
        postResult('failed', err, { elementFound: elementFound });
      }
    });
  };

  window.AriaActionEngine = AriaActionEngine;
})();
