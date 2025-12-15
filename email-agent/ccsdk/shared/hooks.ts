// ccsdk/shared/hooks.ts
// Standardized hook utilities for agent behavior control

import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";

/**
 * Hook result types
 */
export interface HookResult {
  continue: boolean;
  decision?: 'allow' | 'block' | 'modify';
  stopReason?: string;
  modifiedInput?: any;
}

/**
 * Create a path enforcement hook that restricts file writes to specific directories
 */
export function createPathEnforcementHook(
  allowedPaths: string[],
  restrictedExtensions: string[] = ['.js', '.ts']
) {
  return async (input: any): Promise<HookJSONOutput> => {
    const toolName = input.tool_name;
    const toolInput = input.tool_input;

    if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
      return { continue: true };
    }

    const filePath = toolInput.file_path || '';
    const ext = path.extname(filePath).toLowerCase();

    // Only check restricted extensions
    if (!restrictedExtensions.includes(ext)) {
      return { continue: true };
    }

    // Check if path is within allowed directories
    const isAllowed = allowedPaths.some(allowedPath => 
      filePath.startsWith(allowedPath) || filePath.startsWith(path.resolve(allowedPath))
    );

    if (!isAllowed) {
      return {
        decision: 'block',
        stopReason: `Files with extension ${ext} must be written to one of: ${allowedPaths.join(', ')}`,
        continue: false
      };
    }

    return { continue: true };
  };
}

/**
 * Create a logging hook that records all tool calls
 */
export function createLoggingHook(
  logCallback: (entry: {
    timestamp: Date;
    toolName: string;
    input: any;
    phase: 'pre' | 'post';
    output?: any;
    duration?: number;
  }) => void
) {
  const startTimes = new Map<string, number>();

  return {
    preToolUse: async (input: any): Promise<HookJSONOutput> => {
      const callId = `${input.tool_name}_${Date.now()}`;
      startTimes.set(callId, Date.now());
      
      logCallback({
        timestamp: new Date(),
        toolName: input.tool_name,
        input: input.tool_input,
        phase: 'pre'
      });

      // Attach callId to input for post-hook correlation
      input._callId = callId;
      return { continue: true };
    },

    postToolUse: async (input: any, output: any): Promise<HookJSONOutput> => {
      const callId = input._callId || `${input.tool_name}_unknown`;
      const startTime = startTimes.get(callId);
      const duration = startTime ? Date.now() - startTime : undefined;
      startTimes.delete(callId);

      logCallback({
        timestamp: new Date(),
        toolName: input.tool_name,
        input: input.tool_input,
        phase: 'post',
        output,
        duration
      });

      return { continue: true };
    }
  };
}

/**
 * Create a rate limiting hook
 */
export function createRateLimitingHook(
  maxCallsPerMinute: number = 60,
  toolsToLimit: string[] = ['WebSearch', 'WebFetch']
) {
  const callTimestamps: number[] = [];
  const windowMs = 60000; // 1 minute

  return async (input: any): Promise<HookJSONOutput> => {
    const toolName = input.tool_name;

    if (!toolsToLimit.includes(toolName)) {
      return { continue: true };
    }

    const now = Date.now();
    
    // Clean old timestamps
    while (callTimestamps.length > 0 && now - callTimestamps[0] > windowMs) {
      callTimestamps.shift();
    }

    if (callTimestamps.length >= maxCallsPerMinute) {
      return {
        decision: 'block',
        stopReason: `Rate limit exceeded: ${maxCallsPerMinute} calls per minute for ${toolName}. Please wait.`,
        continue: false
      };
    }

    callTimestamps.push(now);
    return { continue: true };
  };
}

/**
 * Create a content filtering hook that blocks sensitive operations
 */
export function createContentFilterHook(
  sensitivePatterns: RegExp[],
  sensitiveFields: string[] = ['password', 'secret', 'api_key', 'token']
) {
  return async (input: any): Promise<HookJSONOutput> => {
    const toolInput = JSON.stringify(input.tool_input || {});

    // Check for sensitive patterns
    for (const pattern of sensitivePatterns) {
      if (pattern.test(toolInput)) {
        return {
          decision: 'block',
          stopReason: 'Operation blocked: contains potentially sensitive information',
          continue: false
        };
      }
    }

    // Check for sensitive field names
    const inputStr = toolInput.toLowerCase();
    for (const field of sensitiveFields) {
      if (inputStr.includes(field)) {
        console.warn(`Warning: Tool input may contain sensitive field: ${field}`);
      }
    }

    return { continue: true };
  };
}

/**
 * Create a cost tracking hook
 */
export function createCostTrackingHook(
  onCostUpdate: (update: {
    toolName: string;
    estimatedCost: number;
    totalCost: number;
  }) => void
) {
  let totalCost = 0;

  // Rough cost estimates per tool call (in USD)
  const toolCosts: Record<string, number> = {
    'WebSearch': 0.01,
    'WebFetch': 0.005,
    'Task': 0.05,
    'Read': 0.001,
    'Write': 0.001,
    'Edit': 0.001,
    'Bash': 0.002,
    'default': 0.001
  };

  return async (input: any): Promise<HookJSONOutput> => {
    const toolName = input.tool_name;
    const estimatedCost = toolCosts[toolName] || toolCosts['default'];
    totalCost += estimatedCost;

    onCostUpdate({
      toolName,
      estimatedCost,
      totalCost
    });

    return { continue: true };
  };
}

/**
 * Combine multiple hooks into a single hook
 */
export function combineHooks(
  ...hooks: Array<(input: any) => Promise<HookJSONOutput>>
): (input: any) => Promise<HookJSONOutput> {
  return async (input: any): Promise<HookJSONOutput> => {
    for (const hook of hooks) {
      const result = await hook(input);
      if (!result.continue) {
        return result;
      }
    }
    return { continue: true };
  };
}
