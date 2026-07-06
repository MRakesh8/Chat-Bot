/**
 * Aria AI v2 - Plugin SDK
 * 
 * Allows 3rd-party websites (e.g., Shopify, WordPress) to provide direct
 * native API access to the agent, bypassing brittle DOM manipulation.
 */

(function () {
  if (window.AriaPluginSDK) return;

  function AriaPluginSDK() {
    this.adapters = {};
    this.activeAdapter = null;
  }

  AriaPluginSDK.prototype.registerAdapter = function(name, adapter) {
    if (typeof adapter.detect === 'function' && typeof adapter.execute === 'function') {
      this.adapters[name] = adapter;
    } else {
      console.warn("AriaPluginSDK: Invalid adapter format for " + name);
    }
  };

  AriaPluginSDK.prototype.detectActiveAdapter = function() {
    for (var name in this.adapters) {
      if (this.adapters[name].detect()) {
        this.activeAdapter = this.adapters[name];
        console.log("AriaPluginSDK: Auto-detected " + name + " environment. Switching to API mode.");
        return name;
      }
    }
    this.activeAdapter = null;
    return null;
  };

  AriaPluginSDK.prototype.executeAction = function(action, payload) {
    if (this.activeAdapter) {
      return this.activeAdapter.execute(action, payload);
    }
    return Promise.reject(new Error("No active adapter found"));
  };

  AriaPluginSDK.prototype.getContext = function() {
    if (this.activeAdapter && typeof this.activeAdapter.getContext === 'function') {
      return this.activeAdapter.getContext();
    }
    return null;
  };

  var sdk = new AriaPluginSDK();

  // --- Built-in Adapters ---

  // Shopify
  sdk.registerAdapter('shopify', {
    detect: function() {
      return !!window.Shopify;
    },
    execute: function(action, payload) {
      if (action === 'add_to_cart') {
        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: payload.variantId, quantity: payload.quantity || 1 }] })
        }).then(function(res) { return res.json(); });
      }
      return Promise.reject(new Error("Unsupported Shopify action"));
    },
    getContext: function() {
      return { platform: 'shopify', currency: window.Shopify?.currency?.active || 'USD' };
    }
  });

  // WordPress/WooCommerce
  sdk.registerAdapter('wordpress', {
    detect: function() {
      return !!document.querySelector('meta[name="generator"][content*="WordPress"]');
    },
    execute: function(action, payload) {
      if (action === 'search') {
        window.location.href = '/?s=' + encodeURIComponent(payload.query);
        return Promise.resolve({ navigated: true });
      }
      return Promise.reject(new Error("Unsupported WordPress action"));
    }
  });

  window.AriaPluginSDK = sdk;
  
  // Auto-detect on load
  setTimeout(function() { sdk.detectActiveAdapter(); }, 1000);
})();
