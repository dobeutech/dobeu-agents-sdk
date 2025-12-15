// ccsdk/shared/index.ts
// Shared utilities for agent infrastructure

/**
 * Generate a unique ID for various purposes
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(date1: Date | string, date2: Date | string = new Date()): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is past due
 */
export function isPastDue(dueDate: Date | string): boolean {
  return daysBetween(dueDate, new Date()) > 0;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Parse email address from "Name <email@domain.com>" format
 */
export function parseEmailAddress(emailString: string): { name: string; email: string } {
  const match = emailString.match(/^(?:(.+?)\s*<)?([^<>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || '',
      email: match[2]?.trim() || emailString
    };
  }
  return { name: '', email: emailString };
}

/**
 * Extract domain from email address
 */
export function getEmailDomain(email: string): string {
  const parsed = parseEmailAddress(email);
  const atIndex = parsed.email.indexOf('@');
  return atIndex >= 0 ? parsed.email.substring(atIndex + 1).toLowerCase() : '';
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Retry an async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Rate limiter for API calls
 */
export class RateLimiter {
  private timestamps: number[] = [];
  
  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}
  
  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    
    if (this.timestamps.length >= this.maxRequests) {
      const oldestTimestamp = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestTimestamp);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.timestamps.push(Date.now());
  }
}

/**
 * Agent activity logger interface
 */
export interface AgentActivityLog {
  timestamp: Date;
  agentId: string;
  parentAgentId?: string;
  event: 'start' | 'tool_call' | 'subagent_spawn' | 'complete' | 'error';
  details: {
    toolName?: string;
    input?: any;
    output?: any;
    duration?: number;
    cost?: number;
    error?: string;
  };
}

/**
 * Create a structured activity log entry
 */
export function createActivityLog(
  agentId: string,
  event: AgentActivityLog['event'],
  details: AgentActivityLog['details'] = {},
  parentAgentId?: string
): AgentActivityLog {
  return {
    timestamp: new Date(),
    agentId,
    parentAgentId,
    event,
    details
  };
}
