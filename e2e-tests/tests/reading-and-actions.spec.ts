import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Aria AI v2 - Reading and Actions', () => {
  let contextEngineSrc: string;
  let actionEngineSrc: string;
  let pluginSdkSrc: string;

  test.beforeAll(() => {
    // Load local scripts
    const root = path.join(__dirname, '..', '..');
    contextEngineSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'widget-context-engine.js'), 'utf8');
    actionEngineSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'widget-action-engine.js'), 'utf8');
    pluginSdkSrc = fs.readFileSync(path.join(root, 'frontend', 'chat-app', 'public', 'aria-plugin-sdk.js'), 'utf8');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:8080');
    // Inject scripts
    await page.evaluate(contextEngineSrc);
    await page.evaluate(actionEngineSrc);
    await page.evaluate(pluginSdkSrc);
  });

  test('Extracts whole website reading and semantic graph', async ({ page }) => {
    const context = await page.evaluate(async () => {
      const engine = new (window as any).AriaContextEngine();
      engine.start(document.body);
      return await engine.getContext();
    });

    expect(context).toBeDefined();
    expect(context.graph).toBeDefined();
    expect(context.graph.nodes).toBeDefined();
    expect(context.graph.edges).toBeDefined();
    
    // Check if form buttons were extracted
    const hasSubmitBtn = context.content.buttons.some((b: any) => b.text === 'Submit');
    expect(hasSubmitBtn).toBeTruthy();
    
    // Security check - password mask
    const contextStr = JSON.stringify(context);
    expect(contextStr).not.toContain('super-secret-key-123');
  });

  test('Action Engine - Light DOM Click', async ({ page }) => {
    await page.evaluate(async () => {
      const actionEngine = new (window as any).AriaActionEngine();
      await actionEngine.executeAction({
        type: 'click',
        locator: { css: '#submit-invoice' }
      });
    });

    const result = page.locator('#form-result');
    await expect(result).toBeVisible();
    await expect(result).toHaveText('Invoice Submitted Successfully!');
  });

  test('Action Engine - Shadow DOM Click', async ({ page }) => {
    await page.evaluate(async () => {
      const actionEngine = new (window as any).AriaActionEngine();
      await actionEngine.executeAction({
        type: 'click',
        locator: { css: '#shadow-btn' } // our action engine pierces shadow boundaries
      });
    });

    // We have to evaluate inside page to check shadow root result, since Playwright handles it differently
    // But Playwright can pierce it if configured, or we can just check with page.evaluate
    const isVisible = await page.evaluate(() => {
      const host = document.getElementById('shadow-host');
      if (!host || !host.shadowRoot) return false;
      return host.shadowRoot.getElementById('shadow-result')?.style.display === 'block';
    });
    
    expect(isVisible).toBeTruthy();
  });

  test('API Detection - Shopify Mode', async ({ page }) => {
    const detected = await page.evaluate(() => {
      const sdk = (window as any).AriaPluginSDK;
      return sdk.detectActiveAdapter();
    });

    expect(detected).toBe('shopify');
  });
});
