# Scheduler Usage Guide

The Email Agent now includes a powerful scheduler for running time-based automation tasks like daily invoice checks and newsletter digests.

## Overview

The scheduler supports two types of scheduling:
1. **Daily at specific time** - Run tasks at a specific time each day (e.g., 8:00 AM)
2. **Interval-based** - Run tasks at regular intervals (e.g., every hour)

## Default Schedules

The following schedules are configured by default:

| Schedule ID | Name | Runs At | Description |
|------------|------|---------|-------------|
| `invoice_overdue_checker` | Invoice Overdue Checker | Daily at 8:00 AM | Checks for overdue invoices and sends notifications |
| `newsletter_digest` | Newsletter Daily Digest | Daily at 8:00 AM | Compiles newsletters received in the past 24 hours into a digest |

## API Endpoints

### List All Schedules
```bash
GET /api/schedules
```

**Response:**
```json
{
  "success": true,
  "schedules": [
    {
      "id": "invoice_overdue_checker",
      "name": "Invoice Overdue Checker",
      "runAt": "08:00",
      "enabled": true
    }
  ]
}
```

### Get Schedule Details
```bash
GET /api/schedule/:id
```

**Example:**
```bash
curl http://localhost:3000/api/schedule/invoice_overdue_checker
```

### Enable a Schedule
```bash
POST /api/schedule/:id/enable
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/schedule/invoice_overdue_checker/enable
```

### Disable a Schedule
```bash
POST /api/schedule/:id/disable
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/schedule/invoice_overdue_checker/disable
```

### Manually Trigger a Schedule
```bash
POST /api/schedule/:id/trigger
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/schedule/newsletter_digest/trigger
```

This immediately runs the scheduled task without waiting for the scheduled time.

### Update a Schedule
```bash
PUT /api/schedule/:id
Content-Type: application/json

{
  "runAt": "09:00",
  "enabled": true
}
```

**Example:**
```bash
curl -X PUT http://localhost:3000/api/schedule/invoice_overdue_checker \
  -H "Content-Type: application/json" \
  -d '{"runAt": "09:00"}'
```

### Add a New Schedule
```bash
POST /api/schedules
Content-Type: application/json

{
  "id": "my_custom_schedule",
  "name": "My Custom Schedule",
  "runAt": "14:00",
  "enabled": true
}
```

## Schedule Configuration Format

### Daily Schedule
```typescript
{
  id: "my_schedule",
  name: "My Daily Schedule",
  runAt: "08:00",  // HH:MM format (24-hour)
  enabled: true
}
```

### Interval Schedule
```typescript
{
  id: "my_interval",
  name: "My Interval Schedule",
  intervalMs: 3600000,  // 1 hour in milliseconds
  enabled: true
}
```

## How It Works

### Invoice Overdue Checker

When triggered, this schedule:
1. Retrieves all tracked invoices from the invoice tracker UI state
2. Checks each invoice's due date against the current date
3. Updates invoice status (pending → overdue)
4. Sends notifications for newly overdue invoices
5. Updates the invoice tracker dashboard

**What it checks:**
- Invoices that are now past their due date
- Invoices approaching due date (within 3 days)
- Updates total overdue amounts

### Newsletter Digest

When triggered, this schedule:
1. Retrieves newsletters collected in the past 24 hours
2. Groups newsletters by category (tech, business, news, etc.)
3. Uses AI to generate a concise summary of each newsletter
4. Compiles everything into a single digest
5. Sends the digest via notification
6. Clears the pending newsletters queue

**Digest format:**
```markdown
📰 Your Daily Newsletter Digest

## Tech (3 newsletters)
- TechCrunch: Major AI breakthrough...
- Hacker Newsletter: Top GitHub projects...
- The Verge: Apple announces...

## Business (2 newsletters)
- Morning Brew: Market analysis...
- The Hustle: Startup funding rounds...

⏱️ ~15 minutes of reading compressed into 5 minutes
```

## Testing Schedules

### Test Invoice Checker Immediately

```bash
# Manually trigger the invoice checker
curl -X POST http://localhost:3000/api/schedule/invoice_overdue_checker/trigger

# Check the logs
tail -f agent/custom_scripts/.logs/listeners/invoice-overdue-checker/*.jsonl
```

### Test Newsletter Digest Immediately

```bash
# Manually trigger the newsletter digest
curl -X POST http://localhost:3000/api/schedule/newsletter_digest/trigger

# Check the logs
tail -f agent/custom_scripts/.logs/listeners/newsletter-digest/*.jsonl
```

## Customizing Schedule Times

To change when schedules run, you can either:

### Option 1: Update via API
```bash
curl -X PUT http://localhost:3000/api/schedule/invoice_overdue_checker \
  -H "Content-Type: application/json" \
  -d '{"runAt": "07:00"}'
```

### Option 2: Modify Default Schedules
Edit `ccsdk/scheduler.ts`:

```typescript
export const DEFAULT_SCHEDULES: ScheduleConfig[] = [
  {
    id: 'invoice_overdue_checker',
    name: 'Invoice Overdue Checker',
    runAt: '07:00',  // Change to your preferred time
    enabled: true
  },
  {
    id: 'newsletter_digest',
    name: 'Newsletter Daily Digest',
    runAt: '09:00',  // Change to your preferred time
    enabled: true
  }
];
```

Then restart the server.

## Monitoring

The scheduler logs all executions:

```bash
# View server logs for scheduler activity
[Scheduler] Next run for Invoice Overdue Checker: 12/16/2024, 8:00:00 AM
[Scheduler] Triggering scheduled task: Invoice Overdue Checker
[Scheduler] ✓ Invoice Overdue Checker executed successfully
```

## Troubleshooting

### Schedule not running

1. **Check if enabled:**
   ```bash
   curl http://localhost:3000/api/schedule/invoice_overdue_checker
   ```
   Verify `"enabled": true`

2. **Check the time:**
   Make sure the `runAt` time hasn't already passed today.

3. **Check listener logs:**
   ```bash
   ls agent/custom_scripts/.logs/listeners/
   ```

### Manually test a schedule

You can always manually trigger a schedule to test it immediately:
```bash
curl -X POST http://localhost:3000/api/schedule/SCHEDULE_ID/trigger
```

### Disable a problematic schedule

```bash
curl -X POST http://localhost:3000/api/schedule/SCHEDULE_ID/disable
```

## Advanced: Creating Custom Schedules

To create a custom scheduled listener:

1. **Create the listener file** in `agent/custom_scripts/listeners/`:
   ```typescript
   export const config: ListenerConfig = {
     id: 'my_custom_task',
     name: 'My Custom Task',
     event: 'scheduled_time',
     enabled: true
   };

   export async function handler(data: any, context: ListenerContext) {
     // Your custom logic here
     console.log('Running custom scheduled task!');
   }
   ```

2. **Add the schedule** via API:
   ```bash
   curl -X POST http://localhost:3000/api/schedules \
     -H "Content-Type: application/json" \
     -d '{
       "id": "my_custom_task",
       "name": "My Custom Task",
       "runAt": "10:00",
       "enabled": true
     }'
   ```

The listener will automatically be loaded and the schedule will trigger it daily at 10:00 AM.

## Server Startup

When the server starts, you'll see:
```
🕐 Initializing scheduler...
[Scheduler] Added schedule: Invoice Overdue Checker (invoice_overdue_checker)
[Scheduler] Next run for Invoice Overdue Checker: 12/16/2024, 8:00:00 AM
[Scheduler] Added schedule: Newsletter Daily Digest (newsletter_digest)
[Scheduler] Next run for Newsletter Daily Digest: 12/16/2024, 8:00:00 AM
✅ Scheduler initialized with 2 schedule(s)
```

## Graceful Shutdown

When stopping the server (Ctrl+C), the scheduler will gracefully shut down:
```
🛑 Received SIGINT, shutting down gracefully...
[Scheduler] Stopping all schedules...
[Scheduler] Stopped schedule: invoice_overdue_checker
[Scheduler] Stopped schedule: newsletter_digest
```
