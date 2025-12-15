// ccsdk/scheduler.ts
// Scheduler for triggering time-based listener events

import type { ListenersManager } from "./listeners-manager";

export interface ScheduleConfig {
  id: string;
  name: string;
  cronExpression?: string;  // Optional: for future cron support
  intervalMs?: number;       // Milliseconds between executions
  runAt?: string;           // Time to run (HH:MM format, 24-hour)
  enabled: boolean;
}

export class Scheduler {
  private schedules: Map<string, ScheduleConfig> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private listenersManager: ListenersManager;

  constructor(listenersManager: ListenersManager) {
    this.listenersManager = listenersManager;
  }

  /**
   * Add a scheduled task
   */
  addSchedule(config: ScheduleConfig): void {
    this.schedules.set(config.id, config);
    
    if (config.enabled) {
      this.startSchedule(config);
    }

    console.log(`[Scheduler] Added schedule: ${config.name} (${config.id})`);
  }

  /**
   * Start a schedule
   */
  private startSchedule(config: ScheduleConfig): void {
    // Clear existing timer if any
    this.stopSchedule(config.id);

    if (config.runAt) {
      // Schedule for specific time daily
      this.scheduleDailyAt(config);
    } else if (config.intervalMs) {
      // Schedule at regular intervals
      this.scheduleInterval(config);
    } else {
      console.warn(`[Scheduler] Schedule ${config.id} has no valid timing configuration`);
      return;
    }
  }

  /**
   * Schedule a task to run daily at a specific time
   */
  private scheduleDailyAt(config: ScheduleConfig): void {
    const runTask = () => {
      const now = new Date();
      const [hours, minutes] = config.runAt!.split(':').map(Number);
      
      // Calculate next run time
      const nextRun = new Date();
      nextRun.setHours(hours, minutes, 0, 0);
      
      // If the time has passed today, schedule for tomorrow
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      
      const msUntilRun = nextRun.getTime() - now.getTime();
      
      console.log(`[Scheduler] Next run for ${config.name}: ${nextRun.toLocaleString()}`);
      
      const timer = setTimeout(async () => {
        console.log(`[Scheduler] Triggering scheduled task: ${config.name}`);
        try {
          await this.listenersManager.checkEvent('scheduled_time', {
            timestamp: new Date(),
            scheduleId: config.id
          });
        } catch (error) {
          console.error(`[Scheduler] Error executing ${config.name}:`, error);
        }
        
        // Reschedule for next day
        runTask();
      }, msUntilRun);
      
      this.timers.set(config.id, timer);
    };
    
    runTask();
  }

  /**
   * Schedule a task to run at regular intervals
   */
  private scheduleInterval(config: ScheduleConfig): void {
    console.log(`[Scheduler] Starting interval schedule: ${config.name} every ${config.intervalMs}ms`);
    
    const timer = setInterval(async () => {
      console.log(`[Scheduler] Triggering scheduled task: ${config.name}`);
      try {
        await this.listenersManager.checkEvent('scheduled_time', {
          timestamp: new Date(),
          scheduleId: config.id
        });
      } catch (error) {
        console.error(`[Scheduler] Error executing ${config.name}:`, error);
      }
    }, config.intervalMs);
    
    this.timers.set(config.id, timer);
  }

  /**
   * Stop a schedule
   */
  stopSchedule(scheduleId: string): void {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      // Clear both types - one will be a no-op depending on what type it is
      // This is safe and handles both setTimeout and setInterval
      if (typeof timer === 'number') {
        clearTimeout(timer);
        clearInterval(timer);
      } else {
        clearTimeout(timer);
        clearInterval(timer);
      }
      this.timers.delete(scheduleId);
      console.log(`[Scheduler] Stopped schedule: ${scheduleId}`);
    }
  }

  /**
   * Stop all schedules
   */
  stopAll(): void {
    console.log(`[Scheduler] Stopping all schedules...`);
    for (const scheduleId of this.timers.keys()) {
      this.stopSchedule(scheduleId);
    }
  }

  /**
   * Enable a schedule
   */
  enableSchedule(scheduleId: string): void {
    const config = this.schedules.get(scheduleId);
    if (config) {
      config.enabled = true;
      this.startSchedule(config);
      console.log(`[Scheduler] Enabled schedule: ${config.name}`);
    }
  }

  /**
   * Disable a schedule
   */
  disableSchedule(scheduleId: string): void {
    const config = this.schedules.get(scheduleId);
    if (config) {
      config.enabled = false;
      this.stopSchedule(scheduleId);
      console.log(`[Scheduler] Disabled schedule: ${config.name}`);
    }
  }

  /**
   * Get all schedules
   */
  getSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get a specific schedule
   */
  getSchedule(scheduleId: string): ScheduleConfig | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * Update a schedule configuration
   */
  updateSchedule(scheduleId: string, updates: Partial<ScheduleConfig>): void {
    const config = this.schedules.get(scheduleId);
    if (!config) {
      console.warn(`[Scheduler] Schedule not found: ${scheduleId}`);
      return;
    }

    // Update configuration
    Object.assign(config, updates);

    // Restart if enabled
    if (config.enabled) {
      this.startSchedule(config);
    }

    console.log(`[Scheduler] Updated schedule: ${config.name}`);
  }

  /**
   * Manually trigger a schedule immediately
   */
  async triggerNow(scheduleId: string): Promise<void> {
    const config = this.schedules.get(scheduleId);
    if (!config) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    console.log(`[Scheduler] Manually triggering: ${config.name}`);
    await this.listenersManager.checkEvent('scheduled_time', {
      timestamp: new Date(),
      scheduleId: config.id,
      manual: true
    });
  }
}

/**
 * Default schedule configurations for built-in listeners
 */
export const DEFAULT_SCHEDULES: ScheduleConfig[] = [
  {
    id: 'invoice_overdue_checker',
    name: 'Invoice Overdue Checker',
    runAt: '08:00',  // 8:00 AM daily
    enabled: true
  },
  {
    id: 'newsletter_digest',
    name: 'Newsletter Daily Digest',
    runAt: '08:05',  // 8:05 AM daily (staggered to avoid resource contention)
    enabled: true
  }
];
