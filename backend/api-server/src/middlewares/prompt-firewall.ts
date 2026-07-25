/**
 * Prompt Injection & Jailbreak Firewall
 * Uses heuristics and known patterns to block malicious prompts.
 */

const JAILBREAK_PATTERNS = [
  /ignore (all )?(previous )?instructions/i,
  /you are now (an? )?(DAN|developer|admin)/i,
  /system prompt/i,
  /forget (all )?(previous )?instructions/i,
  /disregard previous/i,
  /bypass (all )?(security )?protocols/i,
  /act as an? (uncensored|unrestricted)/i,
  /output your (initial|core) instructions/i,
];

export function detectPromptInjection(prompt: string): boolean {
  if (!prompt) return false;
  
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(prompt)) {
      return true; // Malicious pattern detected
    }
  }
  return false;
}
