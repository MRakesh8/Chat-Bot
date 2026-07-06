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
  AriaActionEngine.prototype.executeAction = function(actionParams) {
    var self = this;
    return new Promise(function(resolve, reject) {
      try {
        var actionType = actionParams.type;
        var locator = actionParams.locator;
        
        if (actionType === 'idle') {
          return resolve({ success: true, message: 'Idle action completed' });
        }

        var element = self._findElement(locator);
        if (!element) {
          return reject(new Error('Target element not found: ' + JSON.stringify(locator)));
        }

        // Highlight element briefly for UX
        var oldBorder = element.style.border;
        var oldTransition = element.style.transition;
        element.style.transition = 'all 0.3s';
        element.style.border = '2px solid #3b82f6';
        
        setTimeout(function() {
          element.style.border = oldBorder;
          element.style.transition = oldTransition;
          
          try {
            switch (actionType) {
              case 'click':
              case 'navigate': // treated as click for DOM navigation
                self._simulateClick(element);
                break;
              case 'type':
                self._simulateType(element, actionParams.value || '');
                break;
              default:
                throw new Error('Unsupported action type: ' + actionType);
            }
            
            // Wait for potential DOM mutations (React updates)
            var observer = new MutationObserver(function() {});
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            
            setTimeout(function() {
               observer.disconnect();
               resolve({ success: true, target: locator.css, navigated: window.location.href });
            }, 800); // 800ms debounce
            
          } catch(e) {
            reject(e);
          }
        }, 500); // Small delay to let user see what is being interacted with

      } catch (err) {
        reject(err);
      }
    });
  };

  window.AriaActionEngine = AriaActionEngine;
})();
