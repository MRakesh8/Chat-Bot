/**
 * Prompt Injection & Jailbreak Firewall
 * Uses heuristics and known patterns to block malicious prompts.
 */

const JAILBREAK_PATTERNS = [
  /ignore (all )?(previous )?instructions/i,
  /you are now (an? )?(DAN|developer|admin|root|unrestricted)/i,
  /system prompt/i,
  /reveal (your|the) (system|initial) prompt/i,
  /forget (all )?(previous )?instructions/i,
  /disregard previous/i,
  /bypass (all )?(security )?protocols/i,
  /act as an? (uncensored|unrestricted|jailbroken)/i,
  /output your (initial|core) instructions/i,
  /print your (system|developer) instructions/i,
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
