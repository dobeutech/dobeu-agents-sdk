// agent/custom_scripts/actions/view-invoice-summary.ts
// View a summary of all tracked invoices

import type { ActionTemplate, ActionContext, ActionResult, InvoiceTrackerState } from '../types';

export const config: ActionTemplate = {
  id: 'view_invoice_summary',
  name: 'View Invoice Summary',
  description: 'Display a summary of all tracked invoices with totals and status breakdown',
  icon: '📊',
  parameterSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter invoices by status',
        enum: ['all', 'pending', 'overdue', 'paid'],
        default: 'all'
      },
      sortBy: {
        type: 'string',
        description: 'How to sort the results',
        enum: ['dueDate', 'amount', 'vendor', 'trackedAt'],
        default: 'dueDate'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of invoices to show',
        default: 10
      }
    },
    required: []
  }
};

export async function handler(
  params: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const {
    filter = 'all',
    sortBy = 'dueDate',
    limit = 10
  } = params;

  context.log(`Generating invoice summary (filter: ${filter}, sort: ${sortBy})`);

  // Get invoice tracker state
  const stateId = 'invoice_tracker';
  const state = await context.uiState.get<InvoiceTrackerState>(stateId);

  if (!state || !state.invoices || state.invoices.length === 0) {
    context.addAssistantMessage(
      `📊 **Invoice Summary**\n\n` +
      `No invoices are currently being tracked.\n\n` +
      `Invoices are automatically tracked when detected in incoming emails. ` +
      `Make sure the Invoice Tracker listener is enabled.`
    );

    return {
      success: true,
      message: 'No invoices found',
      data: { totalInvoices: 0 }
    };
  }

  // Filter invoices
  let invoices = [...state.invoices];
  if (filter !== 'all') {
    invoices = invoices.filter(inv => inv.status === filter);
  }

  // Sort invoices
  invoices.sort((a, b) => {
    switch (sortBy) {
      case 'dueDate':
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      case 'amount':
        return b.amount - a.amount;
      case 'vendor':
        return a.vendor.localeCompare(b.vendor);
      case 'trackedAt':
        return new Date(b.trackedAt).getTime() - new Date(a.trackedAt).getTime();
      default:
        return 0;
    }
  });

  // Calculate totals
  const totals = {
    pending: state.totalPending,
    overdue: state.totalOverdue,
    paid: state.totalPaid,
    pendingCount: state.invoices.filter(i => i.status === 'pending').length,
    overdueCount: state.invoices.filter(i => i.status === 'overdue').length,
    paidCount: state.invoices.filter(i => i.status === 'paid').length
  };

  // Format currency helper
  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount);
  };

  // Build summary message
  let message = `📊 **Invoice Summary**\n\n`;

  // Totals section
  message += `**Totals:**\n`;
  message += `• 🟡 Pending: ${formatCurrency(totals.pending)} (${totals.pendingCount} invoices)\n`;
  message += `• 🔴 Overdue: ${formatCurrency(totals.overdue)} (${totals.overdueCount} invoices)\n`;
  message += `• 🟢 Paid: ${formatCurrency(totals.paid)} (${totals.paidCount} invoices)\n\n`;

  // Invoice list
  const displayInvoices = invoices.slice(0, limit);
  
  if (displayInvoices.length > 0) {
    const filterLabel = filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1);
    message += `**${filterLabel} Invoices** (sorted by ${sortBy}):\n\n`;

    const today = new Date().toISOString().split('T')[0];

    for (const inv of displayInvoices) {
      const statusIcon = inv.status === 'paid' ? '✅' : 
                        inv.status === 'overdue' ? '🔴' : '🟡';
      
      // Calculate days
      const dueDate = new Date(inv.dueDate);
      const diffMs = dueDate.getTime() - new Date().getTime();
      const daysDiff = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      let dueText = '';
      if (inv.status === 'paid') {
        dueText = `Paid ${inv.paidAt || ''}`;
      } else if (daysDiff < 0) {
        dueText = `${Math.abs(daysDiff)} days overdue`;
      } else if (daysDiff === 0) {
        dueText = 'Due today';
      } else {
        dueText = `Due in ${daysDiff} days`;
      }

      message += `${statusIcon} **${inv.vendor}**\n`;
      message += `   ${inv.invoiceNumber} • ${formatCurrency(inv.amount, inv.currency)}\n`;
      message += `   ${dueText}`;
      if (inv.remindersSent > 0) {
        message += ` • ${inv.remindersSent} reminder${inv.remindersSent !== 1 ? 's' : ''} sent`;
      }
      message += `\n\n`;
    }

    if (invoices.length > limit) {
      message += `_...and ${invoices.length - limit} more_\n`;
    }
  } else {
    message += `No ${filter} invoices found.\n`;
  }

  // Add last updated
  message += `\n_Last updated: ${new Date(state.lastUpdated).toLocaleString()}_`;

  // Send to chat
  context.addAssistantMessage(message);

  return {
    success: true,
    message: `Displayed ${displayInvoices.length} invoices`,
    data: {
      totals,
      displayedCount: displayInvoices.length,
      totalCount: state.invoices.length,
      filter,
      sortBy
    }
  };
}
