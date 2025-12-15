// agent/custom_scripts/listeners/invoice-tracker.ts
// AI-powered invoice detection with payment tracking and overdue notifications

import type { ListenerConfig, ListenerContext, ListenerResult, Email } from '../types';

export const config: ListenerConfig = {
  id: 'invoice_tracker',
  name: 'Invoice Tracker',
  description: 'Detects invoices in emails, extracts payment details, tracks due dates, and sends overdue notifications',
  enabled: true,
  event: 'email_received'
};

/**
 * Invoice details extracted by AI
 */
interface InvoiceDetails {
  isInvoice: boolean;
  confidence: number;
  vendor: string;
  vendorEmail: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  issueDate: string;
  lineItems: string[];
  paymentTerms: string;
  bankDetails: boolean;
  hasAttachment: boolean;
}

/**
 * Invoice record stored in UI state
 */
interface InvoiceRecord {
  id: string;
  vendor: string;
  vendorEmail: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string;
  issueDate: string;
  status: 'pending' | 'overdue' | 'paid';
  emailId: string;
  trackedAt: string;
  remindersSent: number;
  lastReminderDate?: string;
}

/**
 * Invoice tracker state stored in UI
 */
interface InvoiceTrackerState {
  invoices: InvoiceRecord[];
  totalPending: number;
  totalOverdue: number;
  totalPaid: number;
  lastUpdated: string;
}

/**
 * Calculate days until/since due date
 */
function daysBetween(date1: string, date2: string = new Date().toISOString()): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export async function handler(
  email: Email,
  context: ListenerContext
): Promise<ListenerResult> {
  try {
    // Skip if email is from self (prevent loops)
    const selfDomains = ['@gmail.com']; // Configure as needed
    if (selfDomains.some(domain => email.from.toLowerCase().includes(domain))) {
      // Don't skip all gmail - just check if it's likely an automated response
    }

    // Use AI to detect and extract invoice details
    const analysis = await context.callAgent<InvoiceDetails>({
      prompt: `Analyze this email and determine if it contains an invoice or payment request.

FROM: ${email.from}
SUBJECT: ${email.subject}
DATE: ${email.date}
HAS ATTACHMENTS: ${email.hasAttachments}

EMAIL BODY:
${email.body.substring(0, 3000)}

Extract the following if this is an invoice:
1. Is this an invoice, bill, or payment request? (not just a receipt or confirmation)
2. Vendor/company name
3. Vendor email address (from the From field or body)
4. Invoice number or reference
5. Total amount (as a number, no currency symbols)
6. Currency (USD, EUR, GBP, etc.)
7. Due date (in ISO format YYYY-MM-DD, estimate if not explicit)
8. Issue date (in ISO format YYYY-MM-DD)
9. Line items (brief list)
10. Payment terms mentioned
11. Are bank/payment details included?

Confidence score: 0-1 (1 = definitely an invoice, 0 = definitely not)`,
      schema: {
        type: 'object',
        properties: {
          isInvoice: { type: 'boolean' },
          confidence: { type: 'number' },
          vendor: { type: 'string' },
          vendorEmail: { type: 'string' },
          invoiceNumber: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          dueDate: { type: 'string' },
          issueDate: { type: 'string' },
          lineItems: { type: 'array', items: { type: 'string' } },
          paymentTerms: { type: 'string' },
          bankDetails: { type: 'boolean' },
          hasAttachment: { type: 'boolean' }
        },
        required: ['isInvoice', 'confidence']
      },
      model: 'haiku'
    });

    // Skip if not an invoice or low confidence
    if (!analysis.isInvoice || analysis.confidence < 0.7) {
      return {
        executed: false,
        reason: `Not an invoice (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`
      };
    }

    // Validate required fields
    if (!analysis.amount || !analysis.vendor) {
      return {
        executed: false,
        reason: 'Invoice detected but missing critical details (amount or vendor)'
      };
    }

    // Get or initialize invoice tracker state
    const stateId = 'invoice_tracker';
    let state = await context.uiState.get<InvoiceTrackerState>(stateId);
    if (!state) {
      state = {
        invoices: [],
        totalPending: 0,
        totalOverdue: 0,
        totalPaid: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    // Check for duplicate invoice
    const existingInvoice = state.invoices.find(inv => 
      inv.invoiceNumber === analysis.invoiceNumber && 
      inv.vendor.toLowerCase() === analysis.vendor.toLowerCase()
    );

    if (existingInvoice) {
      return {
        executed: false,
        reason: `Invoice ${analysis.invoiceNumber} from ${analysis.vendor} already tracked`
      };
    }

    // Calculate status based on due date
    const today = new Date().toISOString().split('T')[0];
    const daysUntilDue = daysBetween(today, analysis.dueDate);
    const status: InvoiceRecord['status'] = daysUntilDue < 0 ? 'overdue' : 'pending';

    // Create invoice record
    const invoiceRecord: InvoiceRecord = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      vendor: analysis.vendor,
      vendorEmail: analysis.vendorEmail || email.from,
      invoiceNumber: analysis.invoiceNumber || `REF-${Date.now()}`,
      amount: analysis.amount,
      currency: analysis.currency || 'USD',
      dueDate: analysis.dueDate,
      issueDate: analysis.issueDate || email.date,
      status,
      emailId: email.messageId,
      trackedAt: new Date().toISOString(),
      remindersSent: 0
    };

    // Add to state
    state.invoices.push(invoiceRecord);
    
    // Update totals
    if (status === 'overdue') {
      state.totalOverdue += analysis.amount;
    } else {
      state.totalPending += analysis.amount;
    }
    state.lastUpdated = new Date().toISOString();

    // Save state
    await context.uiState.set(stateId, state);

    // Label the email
    await context.addLabel(email.messageId, 'Invoice');
    if (status === 'overdue') {
      await context.addLabel(email.messageId, 'Invoice/Overdue');
      await context.starEmail(email.messageId);
    } else {
      await context.addLabel(email.messageId, 'Invoice/Pending');
    }

    // Prepare notification based on urgency
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: analysis.currency || 'USD'
    }).format(analysis.amount);

    let notification: string;
    let priority: 'low' | 'normal' | 'high';

    if (status === 'overdue') {
      const daysOverdue = Math.abs(daysUntilDue);
      notification = `🚨 OVERDUE Invoice: ${analysis.vendor}\n${formattedAmount} • ${daysOverdue} days past due\nInvoice #${invoiceRecord.invoiceNumber}`;
      priority = 'high';
    } else if (daysUntilDue <= 3) {
      notification = `⚠️ Invoice Due Soon: ${analysis.vendor}\n${formattedAmount} • Due in ${daysUntilDue} days\nInvoice #${invoiceRecord.invoiceNumber}`;
      priority = 'high';
    } else if (daysUntilDue <= 7) {
      notification = `📋 Invoice Tracked: ${analysis.vendor}\n${formattedAmount} • Due in ${daysUntilDue} days`;
      priority = 'normal';
    } else {
      notification = `📋 Invoice Tracked: ${analysis.vendor}\n${formattedAmount} • Due ${analysis.dueDate}`;
      priority = 'low';
    }

    await context.notify(notification, { priority });

    return {
      executed: true,
      reason: `Tracked ${status} invoice: ${formattedAmount} from ${analysis.vendor} (due ${analysis.dueDate})`,
      actions: [
        'labeled:Invoice',
        status === 'overdue' ? 'labeled:Invoice/Overdue' : 'labeled:Invoice/Pending',
        status === 'overdue' ? 'starred' : undefined,
        'ui_state_updated:invoice_tracker'
      ].filter(Boolean) as string[]
    };

  } catch (error) {
    return {
      executed: false,
      reason: `Error processing email: ${(error as Error).message}`
    };
  }
}
