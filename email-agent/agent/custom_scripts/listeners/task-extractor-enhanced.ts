// agent/custom_scripts/listeners/task-extractor-enhanced.ts
// Enhanced task extraction with AI-powered detection and priority assessment

import type { 
  ListenerConfig, 
  ListenerContext, 
  ListenerResult, 
  Email,
  ExtractedTask,
  TaskBoardState 
} from '../types';

export const config: ListenerConfig = {
  id: 'task_extractor_enhanced',
  name: 'Smart Task Extractor',
  description: 'AI-powered extraction of action items and tasks from emails with automatic priority and due date detection',
  enabled: true,
  event: 'email_received'
};

/**
 * Task extraction result from AI
 */
interface TaskExtractionResult {
  hasTasks: boolean;
  tasks: Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dueDate?: string;
    category?: string;
  }>;
  confidence: number;
}

/**
 * Keywords that indicate an email might contain tasks
 */
const TASK_INDICATORS = [
  'please',
  'could you',
  'can you',
  'need you to',
  'action required',
  'action needed',
  'todo',
  'to-do',
  'follow up',
  'follow-up',
  'asap',
  'urgent',
  'deadline',
  'by end of',
  'by eod',
  'by cob',
  'by tomorrow',
  'by friday',
  'this week',
  'next week'
];

/**
 * Senders to prioritize for task extraction
 */
const PRIORITY_SENDERS = [
  // Add domains or email patterns for priority senders
  // e.g., 'boss@company.com', '@company.com'
];

export async function handler(
  email: Email,
  context: ListenerContext
): Promise<ListenerResult> {
  try {
    // Quick pre-filter: check for task indicators
    const emailText = `${email.subject} ${email.body}`.toLowerCase();
    const hasIndicators = TASK_INDICATORS.some(indicator => 
      emailText.includes(indicator)
    );

    // Check if from priority sender
    const isPrioritySender = PRIORITY_SENDERS.length === 0 || 
      PRIORITY_SENDERS.some(pattern => 
        email.from.toLowerCase().includes(pattern.toLowerCase())
      );

    // Skip if no indicators and not from priority sender
    if (!hasIndicators && !isPrioritySender) {
      return {
        executed: false,
        reason: 'No task indicators found in email'
      };
    }

    // Use AI to extract tasks
    const extraction = await context.callAgent<TaskExtractionResult>({
      prompt: `Analyze this email and extract any action items or tasks assigned to the recipient.

FROM: ${email.from}
SUBJECT: ${email.subject}
DATE: ${email.date}

EMAIL BODY:
${email.body.substring(0, 3000)}

INSTRUCTIONS:
1. Look for explicit requests, action items, or things the recipient needs to do
2. Look for implicit tasks (meetings to schedule, documents to review, questions to answer)
3. For each task, determine:
   - A clear, actionable title (start with a verb)
   - Brief description if needed
   - Priority: high (urgent/deadline soon), medium (important but flexible), low (nice to have)
   - Due date if mentioned or implied (ISO format YYYY-MM-DD)
   - Category if obvious (meeting, document, response, research, approval, etc.)

Only extract genuine tasks - not FYI emails or newsletters.
Confidence: 0-1 indicating how confident you are these are real tasks.`,
      schema: {
        type: 'object',
        properties: {
          hasTasks: { type: 'boolean' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                dueDate: { type: 'string' },
                category: { type: 'string' }
              },
              required: ['title', 'priority']
            }
          },
          confidence: { type: 'number' }
        },
        required: ['hasTasks', 'tasks', 'confidence']
      },
      model: 'haiku'
    });

    // Skip if no tasks or low confidence
    if (!extraction.hasTasks || extraction.tasks.length === 0 || extraction.confidence < 0.6) {
      return {
        executed: false,
        reason: `No actionable tasks found (confidence: ${(extraction.confidence * 100).toFixed(0)}%)`
      };
    }

    // Get or initialize task board state
    const stateId = 'task_board';
    let state = await context.uiState.get<TaskBoardState>(stateId);
    if (!state) {
      state = {
        tasks: [],
        categories: [],
        lastUpdated: new Date().toISOString()
      };
    }

    // Add extracted tasks
    const newTasks: ExtractedTask[] = [];
    for (const task of extraction.tasks) {
      const newTask: ExtractedTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        sourceEmailId: email.messageId,
        sourceSubject: email.subject,
        sourceFrom: email.from,
        extractedAt: new Date().toISOString(),
        status: 'pending',
        tags: task.category ? [task.category] : []
      };

      newTasks.push(newTask);
      state.tasks.push(newTask);

      // Track categories
      if (task.category && !state.categories.includes(task.category)) {
        state.categories.push(task.category);
      }
    }

    state.lastUpdated = new Date().toISOString();

    // Save state
    await context.uiState.set(stateId, state);

    // Label the email
    await context.addLabel(email.messageId, 'HasTasks');
    
    // Star if high priority tasks
    const hasHighPriority = newTasks.some(t => t.priority === 'high');
    if (hasHighPriority) {
      await context.starEmail(email.messageId);
      await context.addLabel(email.messageId, 'HasTasks/Urgent');
    }

    // Create notification
    const taskSummary = newTasks.map(t => {
      const priorityIcon = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
      return `${priorityIcon} ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ''}`;
    }).join('\n');

    await context.notify(
      `📋 ${newTasks.length} task${newTasks.length > 1 ? 's' : ''} extracted from ${email.from.split('<')[0].trim()}\n\n${taskSummary}`,
      { priority: hasHighPriority ? 'high' : 'normal' }
    );

    return {
      executed: true,
      reason: `Extracted ${newTasks.length} task(s): ${newTasks.map(t => t.title).join(', ')}`,
      actions: [
        'labeled:HasTasks',
        hasHighPriority ? 'labeled:HasTasks/Urgent' : undefined,
        hasHighPriority ? 'starred' : undefined,
        'ui_state_updated:task_board'
      ].filter(Boolean) as string[]
    };

  } catch (error) {
    return {
      executed: false,
      reason: `Error extracting tasks: ${(error as Error).message}`
    };
  }
}
