// agent/custom_scripts/listeners/invoice-overdue-checker.ts
// Scheduled listener that checks for overdue invoices and sends reminders

import type { 
  ListenerConfig, 
  ListenerContext, 
  ListenerResult,
  InvoiceTrackerState,
  InvoiceRecord
} from '../types';

export const config: ListenerConfig = {
  id: 'invoice_overdue_checker',
  name: 'Invoice Overdue Checker',
  description: 'Daily check for overdue invoices with automatic status updates and reminder suggestions',
  enabled: true,
  event: 'scheduled_time'  // Configure to run daily at 9am
};

/**
 * Calculate days between two dates
 */
function daysBetween(date1: string, date2: string = new Date().toISOString()): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export async function handler(
  data: { timestamp: Date },
  context: ListenerContext
): Promise<ListenerResult> {
  try {
    const now = data.timestamp || new Date();
    const today = now.toISOString().split('T')[0];

    // Get invoice tracker state
    const stateId = 'invoice_tracker';
    const state = await context.uiState.get<InvoiceTrackerState>(stateId);

    if (!state || !state.invoices || state.invoices.length === 0) {
      return {
        executed: true,
        reason: 'No invoices to check'
      };
    }

    // Separate invoices by status
    const overdueInvoices: InvoiceRecord[] = [];
    const dueSoonInvoices: InvoiceRecord[] = [];
    const newlyOverdue: InvoiceRecord[] = [];
    let stateUpdated = false;

    for (const invoice of state.invoices) {
      if (invoice.status === 'paid' || invoice.status === 'disputed') {
        continue;
      }

      const daysUntilDue = daysBetween(today, invoice.dueDate);

      // Check if newly overdue
      if (daysUntilDue < 0 && invoice.status !== 'overdue') {
        invoice.status = 'overdue';
        newlyOverdue.push(invoice);
        stateUpdated = true;
        
        // Update totals
        state.totalPending -= invoice.amount;
        state.totalOverdue += invoice.amount;
      }

      // Categorize
      if (invoice.status === 'overdue') {
        overdueInvoices.push(invoice);
      } else if (daysUntilDue <= 3 && daysUntilDue >= 0) {
        dueSoonInvoices.push(invoice);
      }
    }

    // Save state if updated
    if (stateUpdated) {
      state.lastUpdated = now.toISOString();
      await context.uiState.set(stateId, state);
    }

    // Build notification
    const notifications: string[] = [];
    const actions: string[] = [];

    // Newly overdue invoices - high priority
    if (newlyOverdue.length > 0) {
      const newlyOverdueTotal = newlyOverdue.reduce((sum, inv) => sum + inv.amount, 0);
      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(newlyOverdueTotal);

      notifications.push(
        `🚨 **${newlyOverdue.length} invoice(s) became overdue**\n` +
        `Total: ${formattedTotal}\n` +
        newlyOverdue.map(inv => 
          `• ${inv.vendor}: ${inv.invoiceNumber} ($${inv.amount})`
        ).join('\n')
      );
      actions.push('status_updated:overdue');
    }

    // All overdue invoices
    if (overdueInvoices.length > 0) {
      const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(overdueTotal);

      // Find invoices needing reminders
      const needsReminder = overdueInvoices.filter(inv => {
        const maxReminders = state.settings?.maxReminders || 3;
        const reminderFrequency = state.settings?.reminderFrequencyDays || 7;
        
        if (inv.remindersSent >= maxReminders) return false;
        if (!inv.lastReminderDate) return true;
        
        const daysSinceReminder = daysBetween(inv.lastReminderDate, today);
        return daysSinceReminder >= reminderFrequency;
      });

      if (needsReminder.length > 0) {
        notifications.push(
          `\n⏰ **${needsReminder.length} overdue invoice(s) need follow-up:**\n` +
          needsReminder.slice(0, 5).map(inv => {
            const daysOverdue = Math.abs(daysBetween(today, inv.dueDate));
            return `• ${inv.vendor}: $${inv.amount} (${daysOverdue} days overdue, ${inv.remindersSent} reminder${inv.remindersSent !== 1 ? 's' : ''} sent)`;
          }).join('\n')
        );
      }

      notifications.push(
        `\n📊 **Overdue Summary:** ${overdueInvoices.length} invoices, ${formattedTotal} total`
      );
    }

    // Due soon invoices - warning
    if (dueSoonInvoices.length > 0) {
      const dueSoonTotal = dueSoonInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(dueSoonTotal);

      notifications.push(
        `\n⚠️ **${dueSoonInvoices.length} invoice(s) due within 3 days:**\n` +
        dueSoonInvoices.map(inv => {
          const daysLeft = daysBetween(today, inv.dueDate);
          return `• ${inv.vendor}: $${inv.amount} (${daysLeft === 0 ? 'TODAY' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`})`;
        }).join('\n') +
        `\nTotal: ${formattedTotal}`
      );
    }

    // Send notification if there's anything to report
    if (notifications.length > 0) {
      await context.notify(
        `📋 **Daily Invoice Check**\n\n${notifications.join('\n')}`,
        { priority: newlyOverdue.length > 0 ? 'high' : 'normal' }
      );
    }

    // Build result
    const summary = {
      totalInvoices: state.invoices.length,
      overdue: overdueInvoices.length,
      dueSoon: dueSoonInvoices.length,
      newlyOverdue: newlyOverdue.length
    };

    if (overdueInvoices.length === 0 && dueSoonInvoices.length === 0) {
      return {
        executed: true,
        reason: 'All invoices are current - no action needed',
        actions: ['daily_check_complete']
      };
    }

    return {
      executed: true,
      reason: `Found ${summary.overdue} overdue, ${summary.dueSoon} due soon (${summary.newlyOverdue} newly overdue)`,
      actions: [
        'daily_check_complete',
        stateUpdated ? 'state_updated' : undefined,
        ...actions
      ].filter(Boolean) as string[]
    };

  } catch (error) {
    return {
      executed: false,
      reason: `Error during invoice check: ${(error as Error).message}`
    };
  }
}
