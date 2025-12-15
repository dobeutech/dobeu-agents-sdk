// agent/custom_scripts/ui-states/invoice-tracker-dashboard.ts
// UI State definition for the Invoice Tracker Dashboard

import type { UIStateTemplate, InvoiceRecord } from '../types';

/**
 * Invoice Tracker Dashboard State
 */
export interface InvoiceTrackerDashboardState {
  // Invoice records
  invoices: InvoiceRecord[];
  
  // Summary metrics
  summary: {
    totalPending: number;
    totalOverdue: number;
    totalPaid: number;
    pendingCount: number;
    overdueCount: number;
    paidCount: number;
  };
  
  // Grouped by vendor
  byVendor: Record<string, {
    name: string;
    pending: number;
    overdue: number;
    paid: number;
    invoiceCount: number;
    lastInvoice: string;
  }>;
  
  // Upcoming due dates (next 14 days)
  upcoming: Array<{
    id: string;
    vendor: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
  }>;
  
  // Overdue invoices requiring attention
  overdueList: Array<{
    id: string;
    vendor: string;
    vendorEmail: string;
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
    remindersSent: number;
  }>;
  
  // Recent activity
  recentActivity: Array<{
    type: 'tracked' | 'paid' | 'reminder_sent' | 'overdue_warning';
    invoiceId: string;
    vendor: string;
    amount: number;
    timestamp: string;
    message: string;
  }>;
  
  // Settings
  settings: {
    autoRemindDaysBefore: number;
    reminderFrequencyDays: number;
    maxReminders: number;
    defaultCurrency: string;
  };
  
  // Metadata
  lastUpdated: string;
  lastRefreshed: string;
}

export const config: UIStateTemplate<InvoiceTrackerDashboardState> = {
  id: 'invoice_tracker_dashboard',
  name: 'Invoice Tracker Dashboard',
  description: 'Comprehensive dashboard for tracking invoices, payments, and cash flow',
  initialState: {
    invoices: [],
    summary: {
      totalPending: 0,
      totalOverdue: 0,
      totalPaid: 0,
      pendingCount: 0,
      overdueCount: 0,
      paidCount: 0
    },
    byVendor: {},
    upcoming: [],
    overdueList: [],
    recentActivity: [],
    settings: {
      autoRemindDaysBefore: 3,
      reminderFrequencyDays: 7,
      maxReminders: 3,
      defaultCurrency: 'USD'
    },
    lastUpdated: new Date().toISOString(),
    lastRefreshed: new Date().toISOString()
  }
};

/**
 * Helper function to refresh dashboard state from raw invoice data
 */
export function refreshDashboardState(
  invoices: InvoiceRecord[]
): Partial<InvoiceTrackerDashboardState> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Calculate summary
  const summary = {
    totalPending: 0,
    totalOverdue: 0,
    totalPaid: 0,
    pendingCount: 0,
    overdueCount: 0,
    paidCount: 0
  };
  
  const byVendor: InvoiceTrackerDashboardState['byVendor'] = {};
  const upcoming: InvoiceTrackerDashboardState['upcoming'] = [];
  const overdueList: InvoiceTrackerDashboardState['overdueList'] = [];
  
  for (const invoice of invoices) {
    // Update vendor grouping
    if (!byVendor[invoice.vendor]) {
      byVendor[invoice.vendor] = {
        name: invoice.vendor,
        pending: 0,
        overdue: 0,
        paid: 0,
        invoiceCount: 0,
        lastInvoice: invoice.issueDate
      };
    }
    byVendor[invoice.vendor].invoiceCount += 1;
    
    if (invoice.issueDate > byVendor[invoice.vendor].lastInvoice) {
      byVendor[invoice.vendor].lastInvoice = invoice.issueDate;
    }
    
    // Calculate days until/since due
    const dueDate = new Date(invoice.dueDate);
    const diffTime = dueDate.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    switch (invoice.status) {
      case 'pending':
        summary.totalPending += invoice.amount;
        summary.pendingCount += 1;
        byVendor[invoice.vendor].pending += invoice.amount;
        
        // Add to upcoming if due within 14 days
        if (daysUntilDue >= 0 && daysUntilDue <= 14) {
          upcoming.push({
            id: invoice.id,
            vendor: invoice.vendor,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            dueDate: invoice.dueDate,
            daysUntilDue
          });
        }
        break;
        
      case 'overdue':
        summary.totalOverdue += invoice.amount;
        summary.overdueCount += 1;
        byVendor[invoice.vendor].overdue += invoice.amount;
        
        overdueList.push({
          id: invoice.id,
          vendor: invoice.vendor,
          vendorEmail: invoice.vendorEmail,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          daysOverdue: Math.abs(daysUntilDue),
          remindersSent: invoice.remindersSent
        });
        break;
        
      case 'paid':
        summary.totalPaid += invoice.amount;
        summary.paidCount += 1;
        byVendor[invoice.vendor].paid += invoice.amount;
        break;
    }
  }
  
  // Sort upcoming by due date
  upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  
  // Sort overdue by days overdue (most urgent first)
  overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);
  
  return {
    invoices,
    summary,
    byVendor,
    upcoming: upcoming.slice(0, 10), // Top 10
    overdueList: overdueList.slice(0, 10), // Top 10
    lastRefreshed: now.toISOString()
  };
}
