
const fs = require('fs');
const file = 'backend/api-server/src/routes/widget-public.ts';
let code = fs.readFileSync(file, 'utf8');

const startIdx = code.indexOf('function isRetryableLlmError');
const endStr = 'const router = Router();';
const endIdx = code.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
  const replacement = \import { UniversalRouterService } from '../services/ai-router';

interface WidgetKey { id?: string; type?: string; }
const keyUsageStats: Record<string, any> = {};

async function fetchAndManageWidgetKeys(projectId: string, userId: string | null): Promise<WidgetKey[]> {
  return [{}];
}

async function executeLlmWithFailover(
  keys: WidgetKey[], 
  method: 'generateContent' | 'generateContentStream', 
  options: any, 
  projectId?: string, 
  userId?: string | null
): Promise<{ result: any, keyUsed: WidgetKey }> {
  
  const req = {
    capabilities: method === 'generateContentStream' ? { textGeneration: true, streaming: true } : { textGeneration: true },
    projectId,
    userId: userId || undefined,
    preferredModel: options.model,
    operation: 'chat' as const
  };

  const chatMessages = (options.contents || []).map((m: any) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.parts?.[0]?.text || m.content || ''
  }));

  const systemInst = options.config?.systemInstruction?.parts?.[0]?.text;
  if (systemInst) {
    chatMessages.unshift({ role: 'system', content: systemInst });
  }

  if (method === 'generateContent') {
    const res = await UniversalRouterService.executeChat(req, chatMessages, options.config?.temperature);
    return { result: { text: () => res.content, text_value: res.content }, keyUsed: {} };
  } else {
    const stream = await UniversalRouterService.executeStream(req, chatMessages, options.config?.temperature);
    return { 
      result: (async function*() {
        for await (const chunk of stream) {
          yield { text: () => chunk.text, text_value: chunk.text };
        }
      })(), 
      keyUsed: {} 
    };
  }
}
\;
  const before = code.substring(0, startIdx);
  const after = code.substring(endIdx);
  fs.writeFileSync(file, before + replacement + '\n\n' + after);
}
