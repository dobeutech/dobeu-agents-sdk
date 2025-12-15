// agent/custom_scripts/actions/send-payment-reminder.ts
// One-click payment reminder action with AI-generated professional email

import type { ActionTemplate, ActionContext, ActionResult } from '../types';

export const config: ActionTemplate = {
  id: 'send_payment_reminder',
  name: 'Send Payment Reminder',
  description: 'Send a professional payment reminder email for an overdue or upcoming invoice',
  icon: '💰',
  parameterSchema: {
    type: 'object',
    properties: {
      vendor: {
        type: 'string',
        description: 'Vendor/company name'
      },
      vendorEmail: {
        type: 'string',
        description: 'Vendor email address to send reminder to'
      },
      invoiceNumber: {
        type: 'string',
        description: 'Invoice number or reference'
      },
      amount: {
        type: 'number',
        description: 'Invoice amount'
      },
      currency: {
        type: 'string',
        description: 'Currency code (USD, EUR, etc.)',
        default: 'USD'
      },
      dueDate: {
        type: 'string',
        description: 'Due date (YYYY-MM-DD format)'
      },
      daysOverdue: {
        type: 'number',
        description: 'Number of days past due (negative if not yet due)'
      },
      tone: {
        type: 'string',
        description: 'Tone of the reminder email',
        enum: ['friendly', 'professional', 'firm', 'urgent'],
        default: 'professional'
      },
      includePaymentDetails: {
        type: 'boolean',
        description: 'Whether to ask for payment details/confirmation',
        default: true
      }
    },
    required: ['vendor', 'vendorEmail', 'invoiceNumber', 'amount', 'dueDate']
  }
};

export async function handler(
  params: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  const {
    vendor,
    vendorEmail,
    invoiceNumber,
    amount,
    currency = 'USD',
    dueDate,
    daysOverdue = 0,
    tone = 'professional',
    includePaymentDetails = true
  } = params;

  context.log(`Preparing payment reminder for ${vendor} - Invoice ${invoiceNumber}`);

  // Format the amount
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);

  // Determine urgency context
  let urgencyContext: string;
  if (daysOverdue > 30) {
    urgencyContext = `This invoice is significantly overdue (${daysOverdue} days). This is a final reminder before escalation.`;
  } else if (daysOverdue > 14) {
    urgencyContext = `This invoice is ${daysOverdue} days past due. Please prioritize payment.`;
  } else if (daysOverdue > 0) {
    urgencyContext = `This invoice is ${daysOverdue} days past due.`;
  } else if (daysOverdue >= -3) {
    urgencyContext = `This invoice is due very soon (${Math.abs(daysOverdue)} days remaining).`;
  } else {
    urgencyContext = `This invoice is due on ${dueDate}.`;
  }

  try {
    // Generate professional email using AI
    const emailContent = await context.callAgent<{ subject: string; body: string }>({
      prompt: `Write a ${tone} payment reminder email with these details:

INVOICE DETAILS:
- Vendor/Company: ${vendor}
- Invoice Number: ${invoiceNumber}
- Amount: ${formattedAmount}
- Due Date: ${dueDate}
- Status: ${urgencyContext}

REQUIREMENTS:
- Tone: ${tone}
- Keep it concise (3-5 sentences for the main message)
- Be polite but clear about the payment request
- ${includePaymentDetails ? 'Ask them to confirm payment details or send confirmation once paid' : 'Just request payment'}
- Include a professional sign-off
- Do NOT include placeholder names - use generic professional language

Return JSON with "subject" and "body" fields.`,
      maxTokens: 500
    });

    // Determine subject based on urgency
    let subject = emailContent.subject;
    if (!subject) {
      if (daysOverdue > 14) {
        subject = `URGENT: Payment Reminder - Invoice ${invoiceNumber} (${daysOverdue} Days Overdue)`;
      } else if (daysOverdue > 0) {
        subject = `Payment Reminder: Invoice ${invoiceNumber} - ${daysOverdue} Days Past Due`;
      } else {
        subject = `Payment Reminder: Invoice ${invoiceNumber} - Due ${dueDate}`;
      }
    }

    // Send the email
    const result = await context.sendEmail({
      to: vendorEmail,
      subject,
      body: emailContent.body || generateFallbackBody()
    });

    // Update invoice tracker state if exists
    try {
      const state = await context.uiState.get<any>('invoice_tracker');
      if (state) {
        const invoice = state.invoices?.find((inv: any) => 
          inv.invoiceNumber === invoiceNumber
        );
        if (invoice) {
          invoice.remindersSent = (invoice.remindersSent || 0) + 1;
          invoice.lastReminderDate = new Date().toISOString();
          await context.uiState.set('invoice_tracker', state);
        }
      }
    } catch (e) {
      // State update is optional, don't fail the action
      context.log(`Could not update invoice tracker state: ${e}`, 'warn');
    }

    // Notify user of success
    context.notify(`✅ Payment reminder sent to ${vendor}`, {
      type: 'success',
      priority: 'normal'
    });

    // Add message to chat
    context.addAssistantMessage(
      `📧 **Payment Reminder Sent**\n\n` +
      `**To:** ${vendorEmail}\n` +
      `**Subject:** ${subject}\n` +
      `**Invoice:** ${invoiceNumber}\n` +
      `**Amount:** ${formattedAmount}\n\n` +
      `The reminder has been sent. I'll help you track any response.`
    );

    return {
      success: true,
      message: `Payment reminder sent to ${vendor} for invoice ${invoiceNumber} (${formattedAmount})`,
      data: {
        messageId: result.messageId,
        vendor,
        invoiceNumber,
        amount,
        daysOverdue
      },
      refreshInbox: true
    };

  } catch (error: any) {
    context.log(`Failed to send payment reminder: ${error.message}`, 'error');
    
    context.notify(`❌ Failed to send reminder to ${vendor}`, {
      type: 'error',
      priority: 'high'
    });

    return {
      success: false,
      message: `Failed to send payment reminder: ${error.message}`
    };
  }

  function generateFallbackBody(): string {
    return `Dear ${vendor} Accounts Team,

I hope this email finds you well.

This is a friendly reminder regarding Invoice ${invoiceNumber} for ${formattedAmount}, which was due on ${dueDate}.

${daysOverdue > 0 
  ? `Our records indicate this invoice is currently ${daysOverdue} days past due.` 
  : `The payment due date is approaching.`}

Could you please arrange for payment at your earliest convenience? If payment has already been made, please disregard this notice and accept our thanks.

${includePaymentDetails ? 'Please let me know if you need any additional information or documentation to process this payment.' : ''}

Thank you for your prompt attention to this matter.

Best regards`;
  }
}
