// agent/custom_scripts/actions/mark-invoice-paid.ts
// Mark an invoice as paid and update tracking state

import type { ActionTemplate, ActionContext, ActionResult, InvoiceTrackerState } from '../types';

export const config: ActionTemplate = {
  id: 'mark_invoice_paid',
  name: 'Mark Invoice Paid',
  description: 'Mark an invoice as paid and update the invoice tracker',
  icon: '✅',
  parameterSchema: {
    type: 'object',
    properties: {
      invoiceId: {
        type: 'string',
        description: 'Invoice ID to mark as paid'
      },
      invoiceNumber: {
        type: 'string',
        description: 'Invoice number (alternative to ID)'
      },
      vendor: {
        type: 'string',
        description: 'Vendor name (used with invoiceNumber for lookup)'
      },
      paidDate: {
        type: 'string',
        description: 'Date payment was made (YYYY-MM-DD)',
        default: 'today'
      },
      paymentMethod: {
        type: 'string',
        description: 'How payment was made',
        enum: ['bank_transfer', 'credit_card', 'check', 'other']
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the payment'
      }
    },
    required: []  // Either invoiceId or invoiceNumber+vendor required
  }
};

export async function handler(
  params: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const {
    invoiceId,
    invoiceNumber,
    vendor,
    paidDate = new Date().toISOString().split('T')[0],
    paymentMethod,
    notes
  } = params;

  context.log(`Marking invoice as paid: ${invoiceId || invoiceNumber}`);

  // Get invoice tracker state
  const stateId = 'invoice_tracker';
  const state = await context.uiState.get<InvoiceTrackerState>(stateId);

  if (!state || !state.invoices || state.invoices.length === 0) {
    return {
      success: false,
      message: 'No invoices found in tracker. Add invoices first using the Invoice Tracker listener.'
    };
  }

  // Find the invoice
  let invoice = state.invoices.find(inv => inv.id === invoiceId);
  
  if (!invoice && invoiceNumber) {
    invoice = state.invoices.find(inv => 
      inv.invoiceNumber === invoiceNumber &&
      (!vendor || inv.vendor.toLowerCase().includes(vendor.toLowerCase()))
    );
  }

  if (!invoice) {
    // List available invoices for user
    const pendingInvoices = state.invoices
      .filter(inv => inv.status !== 'paid')
      .map(inv => `• ${inv.vendor}: ${inv.invoiceNumber} ($${inv.amount})`)
      .slice(0, 5)
      .join('\n');

    return {
      success: false,
      message: `Invoice not found. Pending invoices:\n${pendingInvoices || 'No pending invoices'}`
    };
  }

  if (invoice.status === 'paid') {
    return {
      success: false,
      message: `Invoice ${invoice.invoiceNumber} from ${invoice.vendor} is already marked as paid (${invoice.paidAt})`
    };
  }

  // Calculate previous status for totals update
  const wasPending = invoice.status === 'pending';
  const wasOverdue = invoice.status === 'overdue';

  // Update invoice
  invoice.status = 'paid';
  invoice.paidAt = paidDate;
  if (notes) {
    invoice.notes = (invoice.notes ? invoice.notes + '\n' : '') + 
      `[${paidDate}] Paid via ${paymentMethod || 'unknown'}: ${notes}`;
  }

  // Update totals
  if (wasPending) {
    state.totalPending -= invoice.amount;
  }
  if (wasOverdue) {
    state.totalOverdue -= invoice.amount;
  }
  state.totalPaid += invoice.amount;
  state.lastUpdated = new Date().toISOString();

  // Save state
  await context.uiState.set(stateId, state);

  // Update email labels if we have the email ID
  if (invoice.emailId) {
    try {
      await context.removeLabel(invoice.emailId, 'Invoice/Pending');
      await context.removeLabel(invoice.emailId, 'Invoice/Overdue');
      await context.addLabel(invoice.emailId, 'Invoice/Paid');
      await context.unstarEmail(invoice.emailId);
    } catch (e) {
      context.log(`Could not update email labels: ${e}`, 'warn');
    }
  }

  // Format amount for display
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency || 'USD'
  }).format(invoice.amount);

  // Notify user
  context.notify(
    `✅ Invoice Paid: ${invoice.vendor}\n${formattedAmount} - ${invoice.invoiceNumber}`,
    { type: 'success', priority: 'normal' }
  );

  // Add to chat
  context.addAssistantMessage(
    `✅ **Invoice Marked as Paid**\n\n` +
    `**Vendor:** ${invoice.vendor}\n` +
    `**Invoice:** ${invoice.invoiceNumber}\n` +
    `**Amount:** ${formattedAmount}\n` +
    `**Paid:** ${paidDate}\n` +
    (paymentMethod ? `**Method:** ${paymentMethod}\n` : '') +
    `\n📊 Updated totals:\n` +
    `• Pending: $${state.totalPending.toFixed(2)}\n` +
    `• Overdue: $${state.totalOverdue.toFixed(2)}\n` +
    `• Paid: $${state.totalPaid.toFixed(2)}`
  );

  return {
    success: true,
    message: `Marked invoice ${invoice.invoiceNumber} from ${invoice.vendor} as paid (${formattedAmount})`,
    data: {
      invoice: {
        id: invoice.id,
        vendor: invoice.vendor,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        paidDate
      },
      totals: {
        pending: state.totalPending,
        overdue: state.totalOverdue,
        paid: state.totalPaid
      }
    },
    refreshInbox: true
  };
}
