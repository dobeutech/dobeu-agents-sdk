# Agent Automation System

This directory contains AI-powered email automation agents that work together to manage your inbox intelligently.

## Quick Start

1. **Ensure all listeners are enabled** in your email agent settings
2. **Start receiving emails** - agents will automatically process them
3. **Use actions** via the chat interface when you need to take action

## Installed Agents

### 📧 Listeners (Event-Driven Automation)

| Listener | Event | Description |
|----------|-------|-------------|
| **Invoice Tracker** | `email_received` | Detects invoices, extracts payment details, tracks due dates |
| **Invoice Overdue Checker** | `scheduled_time` | Daily check for overdue invoices, status updates |
| **Newsletter Digest** | `scheduled_time` | Summarizes newsletters into daily digest |
| **Newsletter Collector** | `email_received` | Collects newsletters throughout the day |
| **Task Extractor Enhanced** | `email_received` | AI-powered extraction of action items from emails |
| **Finance Email Tracker** | `email_received` | Tracks expenses and income from receipts |

### ⚡ Actions (User-Triggered)

| Action | Description |
|--------|-------------|
| **Send Payment Reminder** | Generate and send professional payment reminder |
| **Mark Invoice Paid** | Update invoice status and totals |
| **View Invoice Summary** | Display invoice dashboard with totals |

### 🤖 Subagents (Specialized AI)

| Subagent | Purpose |
|----------|---------|
| **Invoice Detector** | Specialized extraction of invoice data |
| **Inbox Searcher** | Strategic email search with Gmail query syntax |

## Detailed Usage

### Invoice Tracking System

The invoice tracking system automatically:
1. **Detects** incoming invoices using AI classification
2. **Extracts** vendor, amount, due date, invoice number
3. **Tracks** payment status (pending → overdue → paid)
4. **Notifies** you of overdue and upcoming due dates
5. **Enables** one-click payment reminders

**Labels Applied:**
- `Invoice` - All detected invoices
- `Invoice/Pending` - Awaiting payment
- `Invoice/Overdue` - Past due date
- `Invoice/Paid` - Marked as paid

**Actions Available:**
```
"Send payment reminder to ACME for invoice INV-2024-001"
"Mark invoice INV-2024-001 as paid"
"Show me all overdue invoices"
"What's my invoice summary?"
```

### Newsletter Digest System

The newsletter system:
1. **Identifies** newsletters as they arrive
2. **Classifies** by category (tech, business, news, etc.)
3. **Summarizes** key content using AI
4. **Generates** daily digest at scheduled time

**Labels Applied:**
- `Newsletter` - All newsletters
- `Newsletter/{category}` - By category
- Auto-marked as read after collection

### Task Extraction System

The task extractor:
1. **Monitors** incoming emails for action items
2. **Uses AI** to identify tasks and requests
3. **Extracts** title, priority, due date
4. **Updates** TaskBoard UI state
5. **Notifies** for high-priority tasks

**Labels Applied:**
- `HasTasks` - Emails containing tasks
- `HasTasks/Urgent` - High priority tasks

## UI States

These agents maintain persistent state for dashboards:

| State ID | Description |
|----------|-------------|
| `invoice_tracker` | Invoice records and totals |
| `invoice_tracker_dashboard` | Enhanced dashboard with analytics |
| `newsletter_digest` | Newsletter collection and digest history |
| `newsletter_pending` | Pending newsletters for next digest |
| `task_board` | Extracted tasks and categories |
| `financial_dashboard` | Expense/income tracking |

## Configuration

### Invoice Tracker Settings

Adjust in the `invoice_tracker` state:
```typescript
settings: {
  autoRemindDaysBefore: 3,   // Remind X days before due
  reminderFrequencyDays: 7,  // Days between reminders
  maxReminders: 3            // Max reminders per invoice
}
```

### Scheduled Listeners

Configure cron schedules for:
- `invoice_overdue_checker` - Recommend: Daily at 9:00 AM
- `newsletter_digest` - Recommend: Daily at 8:00 AM

## File Structure

```
agent/custom_scripts/
├── listeners/
│   ├── invoice-tracker.ts          # Invoice detection
│   ├── invoice-overdue-checker.ts  # Daily overdue check
│   ├── newsletter-digest.ts        # Newsletter digest
│   ├── task-extractor-enhanced.ts  # Task extraction
│   └── finance-email-tracker.ts    # Expense tracking
├── actions/
│   ├── send-payment-reminder.ts    # Payment reminders
│   ├── mark-invoice-paid.ts        # Mark paid
│   └── view-invoice-summary.ts     # View summary
├── ui-states/
│   ├── invoice-tracker-dashboard.ts
│   ├── financial-dashboard.ts
│   └── task-board.ts
└── types.ts                        # Type definitions

agent/.claude/agents/
├── inbox-searcher.md               # Email search specialist
└── invoice-detector.md             # Invoice extraction specialist
```

## Extending the System

### Adding a New Listener

1. Create file in `listeners/` directory
2. Export `config: ListenerConfig` and `handler` function
3. Use `context.callAgent()` for AI-powered decisions
4. Update UI state with `context.uiState.set()`
5. Notify user with `context.notify()`

```typescript
import type { ListenerConfig, ListenerContext, ListenerResult, Email } from '../types';

export const config: ListenerConfig = {
  id: 'my_listener',
  name: 'My Listener',
  description: 'What it does',
  enabled: true,
  event: 'email_received'
};

export async function handler(
  email: Email,
  context: ListenerContext
): Promise<ListenerResult> {
  // Your logic here
  return {
    executed: true,
    reason: 'What happened',
    actions: ['what_was_done']
  };
}
```

### Adding a New Action

1. Create file in `actions/` directory
2. Export `config: ActionTemplate` and `handler` function
3. Define parameter schema for inputs
4. Return `ActionResult` with success/failure

```typescript
import type { ActionTemplate, ActionContext, ActionResult } from '../types';

export const config: ActionTemplate = {
  id: 'my_action',
  name: 'My Action',
  description: 'What it does',
  icon: '🚀',
  parameterSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description' }
    },
    required: ['param1']
  }
};

export async function handler(
  params: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  // Your logic here
  return {
    success: true,
    message: 'What happened',
    data: { /* structured data */ }
  };
}
```

## Troubleshooting

### Invoice not detected
- Check if email contains clear invoice indicators
- Verify listener is enabled
- Check confidence threshold (default 0.7)

### Notifications not appearing
- Verify notification permissions
- Check priority level settings

### State not updating
- Use `context.uiState.get()` before modifying
- Always call `context.uiState.set()` after changes

## Best Practices

1. **Use AI for decisions** - Don't hardcode keyword lists
2. **Label emails** - Makes tracking and searching easier
3. **Update state atomically** - Get, modify, set in one flow
4. **Log important events** - Use `context.log()` for debugging
5. **Handle errors gracefully** - Return meaningful error reasons
6. **Notify appropriately** - Use priority levels wisely

## API Reference

See `types.ts` for complete type definitions including:
- `ListenerContext` - Available methods for listeners
- `ActionContext` - Available methods for actions
- `InvoiceRecord`, `TaskBoardState`, etc. - Data structures
