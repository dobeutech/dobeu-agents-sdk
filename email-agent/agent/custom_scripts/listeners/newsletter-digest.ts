// agent/custom_scripts/listeners/newsletter-digest.ts
// Daily newsletter digest - summarizes all newsletters into a single digest

import type { ListenerConfig, ListenerContext, ListenerResult, Email } from '../types';

export const config: ListenerConfig = {
  id: 'newsletter_digest',
  name: 'Newsletter Digest',
  description: 'Creates a daily digest summarizing all newsletters received in the past 24 hours',
  enabled: true,
  event: 'scheduled_time'  // Triggered by scheduler (configure for 8am daily)
};

/**
 * Newsletter sources to look for
 * Customize this list based on your subscriptions
 */
const NEWSLETTER_PATTERNS = [
  // Common newsletter senders
  'newsletter@',
  'noreply@',
  'news@',
  'digest@',
  'updates@',
  'hello@',
  // Popular newsletters (add your own)
  'morningbrew',
  'techcrunch',
  'hackernewsletter',
  'substack',
  'beehiiv',
  'mailchimp',
  'convertkit',
  'buttondown',
  // Domain patterns
  '.substack.com',
  'mail.beehiiv.com'
];

/**
 * Categories for newsletter classification
 */
interface NewsletterClassification {
  isNewsletter: boolean;
  category: 'tech' | 'business' | 'finance' | 'lifestyle' | 'news' | 'other';
  publication: string;
  keyTopics: string[];
  summary: string;
  readTimeMinutes: number;
}

/**
 * Digest state for tracking
 */
interface DigestState {
  lastDigestDate: string;
  totalDigestsSent: number;
  newsletters: {
    publication: string;
    category: string;
    lastSeen: string;
  }[];
}

export async function handler(
  data: { timestamp: Date },
  context: ListenerContext
): Promise<ListenerResult> {
  try {
    const now = data.timestamp || new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    context.notify('📰 Preparing your newsletter digest...', { priority: 'low' });

    // Build Gmail query for newsletter-like emails
    const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '/');
    const patterns = NEWSLETTER_PATTERNS.slice(0, 10).map(p => `from:${p}`).join(' OR ');
    const query = `(${patterns}) after:${dateStr} -in:trash`;

    // Note: In a real implementation, you'd use the email API
    // This is a conceptual implementation showing the pattern
    // const newsletters = await context.emailAPI.searchWithGmailQuery(query);

    // For now, we'll work with emails passed via the listener system
    // In production, you'd integrate with the email search API

    // Simulated newsletter processing logic:
    const digestContent = await generateDigest(context);
    
    if (!digestContent.hasNewsletters) {
      return {
        executed: true,
        reason: 'No newsletters found in the past 24 hours'
      };
    }

    // Send digest notification
    await context.notify(
      `📰 **Your Daily Newsletter Digest**\n\n` +
      `${digestContent.summary}\n\n` +
      `📊 ${digestContent.count} newsletters summarized\n` +
      `⏱️ ~${digestContent.totalReadTime} min saved`,
      { priority: 'normal' }
    );

    // Update digest state
    const stateId = 'newsletter_digest';
    let state = await context.uiState.get<DigestState>(stateId);
    if (!state) {
      state = {
        lastDigestDate: '',
        totalDigestsSent: 0,
        newsletters: []
      };
    }
    
    state.lastDigestDate = now.toISOString();
    state.totalDigestsSent += 1;
    await context.uiState.set(stateId, state);

    return {
      executed: true,
      reason: `Generated digest with ${digestContent.count} newsletters`,
      actions: ['digest_sent', 'ui_state_updated:newsletter_digest']
    };

  } catch (error) {
    return {
      executed: false,
      reason: `Error generating digest: ${(error as Error).message}`
    };
  }
}

/**
 * Generate the newsletter digest using AI
 */
async function generateDigest(context: ListenerContext): Promise<{
  hasNewsletters: boolean;
  count: number;
  summary: string;
  totalReadTime: number;
  categories: Record<string, number>;
}> {
  // This would normally process actual emails
  // For now, return a structure showing the expected output
  
  // In production implementation:
  // 1. Fetch newsletters from last 24h via email API
  // 2. For each newsletter, use AI to classify and summarize
  // 3. Group by category
  // 4. Generate overall digest
  
  return {
    hasNewsletters: false,  // Would be true if newsletters found
    count: 0,
    summary: 'No newsletters to summarize today.',
    totalReadTime: 0,
    categories: {}
  };
}

/**
 * Alternative: On-demand newsletter digest (email_received event)
 * This version processes newsletters as they arrive and can batch them
 */
export const onDemandConfig: ListenerConfig = {
  id: 'newsletter_collector',
  name: 'Newsletter Collector',
  description: 'Collects newsletters throughout the day for digest generation',
  enabled: true,
  event: 'email_received'
};

export async function onDemandHandler(
  email: Email,
  context: ListenerContext
): Promise<ListenerResult> {
  // Check if this looks like a newsletter
  const fromLower = email.from.toLowerCase();
  const isNewsletter = NEWSLETTER_PATTERNS.some(pattern => 
    fromLower.includes(pattern.toLowerCase())
  );

  if (!isNewsletter) {
    return {
      executed: false,
      reason: 'Not a newsletter email'
    };
  }

  // Classify and summarize the newsletter
  const classification = await context.callAgent<NewsletterClassification>({
    prompt: `Analyze this email to determine if it's a newsletter and extract key information:

FROM: ${email.from}
SUBJECT: ${email.subject}
DATE: ${email.date}

BODY (first 2000 chars):
${email.body.substring(0, 2000)}

Determine:
1. Is this actually a newsletter/digest (not a transactional email)?
2. What category? (tech, business, finance, lifestyle, news, other)
3. What publication/source is it from?
4. What are the 3-5 key topics covered?
5. Write a 2-3 sentence summary of the key takeaways
6. Estimated read time in minutes`,
    schema: {
      type: 'object',
      properties: {
        isNewsletter: { type: 'boolean' },
        category: { 
          type: 'string',
          enum: ['tech', 'business', 'finance', 'lifestyle', 'news', 'other']
        },
        publication: { type: 'string' },
        keyTopics: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
        readTimeMinutes: { type: 'number' }
      },
      required: ['isNewsletter']
    },
    model: 'haiku'
  });

  if (!classification.isNewsletter) {
    return {
      executed: false,
      reason: 'Email is not a newsletter'
    };
  }

  // Store for later digest
  const stateId = 'newsletter_pending';
  let pendingState = await context.uiState.get<{
    newsletters: Array<{
      emailId: string;
      publication: string;
      category: string;
      summary: string;
      topics: string[];
      receivedAt: string;
    }>;
  }>(stateId);

  if (!pendingState) {
    pendingState = { newsletters: [] };
  }

  pendingState.newsletters.push({
    emailId: email.messageId,
    publication: classification.publication,
    category: classification.category,
    summary: classification.summary,
    topics: classification.keyTopics,
    receivedAt: new Date().toISOString()
  });

  await context.uiState.set(stateId, pendingState);

  // Label the email
  await context.addLabel(email.messageId, 'Newsletter');
  await context.addLabel(email.messageId, `Newsletter/${classification.category}`);
  await context.markAsRead(email.messageId);  // Auto-read newsletters

  return {
    executed: true,
    reason: `Collected newsletter: ${classification.publication} (${classification.category})`,
    actions: [
      'labeled:Newsletter',
      `labeled:Newsletter/${classification.category}`,
      'marked_as_read',
      'added_to_digest_queue'
    ]
  };
}
