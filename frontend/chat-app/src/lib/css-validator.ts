export interface CSSBlock {
  header: string;
  declarations: string[];
  children: CSSBlock[];
  parent?: CSSBlock;
}

export function parseCSS(css: string): { valid: boolean; error?: string; root?: CSSBlock } {
  const root: CSSBlock = {
    header: 'root',
    declarations: [],
    children: []
  };
  
  let current = root;
  let buffer = '';
  const stack: CSSBlock[] = [root];
  
  let inString: string | null = null;
  let inComment = false;
  
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];
    
    // Handle comments
    if (inComment) {
      if (char === '*' && nextChar === '/') {
        inComment = false;
        i++; // skip '/'
      }
      continue;
    }
    
    if (!inString && char === '/' && nextChar === '*') {
      inComment = true;
      i++; // skip '*'
      continue;
    }
    
    // Handle strings
    if (inString) {
      if (char === '\\') {
        buffer += char + (nextChar || '');
        i++;
        continue;
      }
      buffer += char;
      if (char === inString) {
        inString = null;
      }
      continue;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      buffer += char;
      continue;
    }
    
    // Process characters outside of comments and strings
    if (char === '{') {
      const header = buffer.trim();
      if (!header && current !== root) {
        return { valid: false, error: "Missing selector before '{'." };
      }
      
      const newBlock: CSSBlock = {
        header: header,
        declarations: [],
        children: [],
        parent: current
      };
      
      current.children.push(newBlock);
      current = newBlock;
      stack.push(newBlock);
      buffer = '';
    } else if (char === '}') {
      const remaining = buffer.trim();
      if (remaining) {
        const decs = remaining.split(';').map(d => d.trim()).filter(Boolean);
        current.declarations.push(...decs);
      }
      
      if (stack.length <= 1) {
        return { valid: false, error: "Unexpected closing brace '}' without a matching '{'." };
      }
      
      stack.pop();
      current = stack[stack.length - 1];
      buffer = '';
    } else if (char === ';') {
      const term = buffer.trim();
      if (term) {
        if (current === root) {
          if (!term.startsWith('@')) {
            return { valid: false, error: `Invalid top-level CSS statement: "${term}".` };
          }
        } else {
          current.declarations.push(term);
        }
      }
      buffer = '';
    } else {
      buffer += char;
    }
  }
  
  if (inComment) {
    return { valid: false, error: "Unterminated comment." };
  }
  if (inString) {
    return { valid: false, error: `Unterminated string literal: ${inString}.` };
  }
  if (stack.length > 1) {
    return { valid: false, error: "Mismatched braces. Ensure every '{' has a matching '}'." };
  }
  
  const leftover = buffer.trim();
  if (leftover) {
    if (!leftover.startsWith('@') && leftover !== '') {
      return { valid: false, error: `Invalid CSS after block: "${leftover}".` };
    }
  }
  
  return { valid: true, root };
}

export function validateBlock(block: CSSBlock): { valid: boolean; error?: string } {
  for (const dec of block.declarations) {
    if (dec.startsWith('@')) {
      continue;
    }
    
    if (!dec.includes(':')) {
      return { valid: false, error: `Invalid CSS declaration "${dec}". Missing colon ':' separating property and value.` };
    }
    
    const colonIndex = dec.indexOf(':');
    const prop = dec.slice(0, colonIndex).trim();
    const val = dec.slice(colonIndex + 1).trim();
    if (!prop) {
      return { valid: false, error: `Invalid CSS declaration "${dec}". Missing property name.` };
    }
    if (!val) {
      return { valid: false, error: `Invalid CSS declaration "${dec}". Missing value for property "${prop}".` };
    }
  }

  for (const child of block.children) {
    const header = child.header;
    const parentHeader = block.header;
    
    if (parentHeader.startsWith('@keyframes')) {
      const selectors = header.split(',').map(s => s.trim());
      for (const selector of selectors) {
        if (selector !== 'from' && selector !== 'to' && !/^\d+(\.\d+)?%$/.test(selector)) {
          return { valid: false, error: `Invalid keyframe selector "${selector}". Keyframe selectors must be 'from', 'to', or a percentage (e.g., '50%').` };
        }
      }
    } else {
      if (!header) {
        return { valid: false, error: "Missing selector before '{'." };
      }
    }

    const result = validateBlock(child);
    if (!result.valid) return result;
  }

  return { valid: true };
}

function isNonCSSContent(css: string): boolean {
  const trimmed = css.trim();
  if (!trimmed) return false;

  // 1. Check if it is a JSON object or array (often JSON errors, config payloads, etc.)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {}
  }

  // 2. Check for JSON log properties
  if (/"level":\s*\d+/.test(trimmed) && /"time":\s*\d+/.test(trimmed) && /"pid":\s*\d+/.test(trimmed)) {
    return true;
  }

  // 3. Check for stack trace signatures
  if (/\b(at\s+[a-zA-Z0-9_$<>#.-]+\s+\(|at\s+async\s+<anonymous>|at\s+process\.)/i.test(trimmed)) {
    return true;
  }
  if (/\bError:\s+Failed\s+query:/i.test(trimmed)) {
    return true;
  }

  // 4. Check for absolute file paths (ignoring CSS URLs)
  const unixPathRegex = /(?:\s|^)\/(?:opt|usr|home|var|tmp|etc|bin|lib|node_modules)\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/i;
  const winPathRegex = /[a-zA-Z]:\\[a-zA-Z0-9_.-]+(?:\\[a-zA-Z0-9_.-]+)+/i;
  if (unixPathRegex.test(trimmed) || winPathRegex.test(trimmed)) {
    return true;
  }

  // 5. Check for SQL queries
  const sqlRegex = /\b(select\s+[\s\S]*?\s+from|insert\s+into|update\s+[\s\S]*?\s+set|delete\s+from|create\s+table|alter\s+table)\b/i;
  if (sqlRegex.test(trimmed)) {
    return true;
  }

  return false;
}

// CSS Validation Function
export function validateCSS(css: string): { valid: boolean; error?: string } {
  const trimmed = css.trim();
  if (!trimmed) return { valid: true };

  // Reject non-CSS content
  if (isNonCSSContent(trimmed)) {
    return { valid: false, error: "This does not appear to be CSS" };
  }
  
  const parsed = parseCSS(trimmed);
  if (!parsed.valid) {
    return { valid: false, error: parsed.error };
  }
  
  if (parsed.root) {
    return validateBlock(parsed.root);
  }
  
  return { valid: true };
}

export function scopeBlock(
  block: CSSBlock, 
  scopeSelector: string, 
  insideKeyframes = false, 
  insideStandardSelector = false
): string {
  if (block.header === 'root') {
    return block.children.map(child => scopeBlock(child, scopeSelector, false, false)).join('\n\n');
  }

  let header = block.header;
  let isKeyframes = insideKeyframes || header.startsWith('@keyframes');
  let isStandardSelector = !header.startsWith('@') && !insideKeyframes;

  let scopedHeader = header;
  if (header.includes(':host')) {
    scopedHeader = header.replace(/:host/g, scopeSelector);
  } else if (isStandardSelector && !insideStandardSelector) {
    scopedHeader = header
      .split(',')
      .map(s => {
        const trimmed = s.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith(scopeSelector)) {
          return trimmed;
        }
        return `${scopeSelector} ${trimmed}`;
      })
      .join(', ');
  }

  let result = `${scopedHeader} {\n`;
  
  if (block.declarations.length > 0) {
    result += block.declarations.map(dec => `  ${dec};`).join('\n') + '\n';
  }
  
  if (block.children.length > 0) {
    result += block.children.map(child => {
      const childStr = scopeBlock(
        child, 
        scopeSelector, 
        isKeyframes, 
        insideStandardSelector || isStandardSelector
      );
      return childStr.split('\n').map(line => '  ' + line).join('\n');
    }).join('\n\n') + '\n';
  }
  
  result += '}';
  return result;
}

// Scoping CSS Function (limits user CSS to the preview box)
export function scopeCSS(css: string, scopeSelector: string): string {
  if (!css) return "";
  
  const parsed = parseCSS(css);
  if (!parsed.valid || !parsed.root) {
    return css;
  }
  
  return scopeBlock(parsed.root, scopeSelector);
}
