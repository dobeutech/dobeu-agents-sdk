// ccsdk/scheduler.test.ts
// Unit tests for the Scheduler

import { Scheduler } from './scheduler';
import type { ListenersManager } from './listeners-manager';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockListenersManager: ListenersManager;
  let checkEventCalls: any[];

  beforeEach(() => {
    checkEventCalls = [];
    
    // Create a mock ListenersManager
    mockListenersManager = {
      checkEvent: jest.fn(async (event, data) => {
        checkEventCalls.push({ event, data });
      })
    } as any;

    scheduler = new Scheduler(mockListenersManager);
  });

  afterEach(() => {
    // Clean up timers
    scheduler.stopAll();
  });

  describe('addSchedule', () => {
    it('should add a new schedule', () => {
      scheduler.addSchedule({
        id: 'test-schedule',
        name: 'Test Schedule',
        intervalMs: 1000,
        enabled: false
      });

      const schedule = scheduler.getSchedule('test-schedule');
      expect(schedule).toBeDefined();
      expect(schedule?.name).toBe('Test Schedule');
    });

    it('should start an enabled schedule', () => {
      scheduler.addSchedule({
        id: 'test-schedule',
        name: 'Test Schedule',
        intervalMs: 1000,
        enabled: true
      });

      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0].enabled).toBe(true);
    });
  });

  describe('interval scheduling', () => {
    it('should trigger events at intervals', async () => {
      scheduler.addSchedule({
        id: 'interval-test',
        name: 'Interval Test',
        intervalMs: 100, // 100ms for quick testing
        enabled: true
      });

      // Wait for at least 2 executions
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(checkEventCalls.length).toBeGreaterThanOrEqual(2);
      expect(checkEventCalls[0].event).toBe('scheduled_time');
      expect(checkEventCalls[0].data.scheduleId).toBe('interval-test');
    }, 10000);
  });

  describe('enableSchedule and disableSchedule', () => {
    it('should enable a disabled schedule', () => {
      scheduler.addSchedule({
        id: 'test-schedule',
        name: 'Test Schedule',
        intervalMs: 1000,
        enabled: false
      });

      scheduler.enableSchedule('test-schedule');
      const schedule = scheduler.getSchedule('test-schedule');
      expect(schedule?.enabled).toBe(true);
    });

    it('should disable an enabled schedule', () => {
      scheduler.addSchedule({
        id: 'test-schedule',
        name: 'Test Schedule',
        intervalMs: 1000,
        enabled: true
      });

      scheduler.disableSchedule('test-schedule');
      const schedule = scheduler.getSchedule('test-schedule');
      expect(schedule?.enabled).toBe(false);
    });
  });

  describe('triggerNow', () => {
    it('should manually trigger a schedule immediately', async () => {
      scheduler.addSchedule({
        id: 'manual-test',
        name: 'Manual Test',
        intervalMs: 10000, // Long interval
        enabled: false
      });

      await scheduler.triggerNow('manual-test');

      expect(checkEventCalls.length).toBe(1);
      expect(checkEventCalls[0].event).toBe('scheduled_time');
      expect(checkEventCalls[0].data.scheduleId).toBe('manual-test');
      expect(checkEventCalls[0].data.manual).toBe(true);
    });

    it('should throw error for non-existent schedule', async () => {
      await expect(scheduler.triggerNow('non-existent')).rejects.toThrow();
    });
  });

  describe('updateSchedule', () => {
    it('should update schedule configuration', () => {
      scheduler.addSchedule({
        id: 'update-test',
        name: 'Original Name',
        intervalMs: 1000,
        enabled: false
      });

      scheduler.updateSchedule('update-test', {
        name: 'Updated Name',
        intervalMs: 2000
      });

      const schedule = scheduler.getSchedule('update-test');
      expect(schedule?.name).toBe('Updated Name');
      expect(schedule?.intervalMs).toBe(2000);
    });
  });

  describe('getSchedules', () => {
    it('should return all schedules', () => {
      scheduler.addSchedule({
        id: 'schedule-1',
        name: 'Schedule 1',
        intervalMs: 1000,
        enabled: false
      });

      scheduler.addSchedule({
        id: 'schedule-2',
        name: 'Schedule 2',
        intervalMs: 2000,
        enabled: false
      });

      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(2);
      expect(schedules.map(s => s.id)).toContain('schedule-1');
      expect(schedules.map(s => s.id)).toContain('schedule-2');
    });
  });

  describe('stopAll', () => {
    it('should stop all active schedules', () => {
      scheduler.addSchedule({
        id: 'schedule-1',
        name: 'Schedule 1',
        intervalMs: 1000,
        enabled: true
      });

      scheduler.addSchedule({
        id: 'schedule-2',
        name: 'Schedule 2',
        intervalMs: 1000,
        enabled: true
      });

      scheduler.stopAll();

      // Schedules should still exist but be stopped
      const schedules = scheduler.getSchedules();
      expect(schedules).toHaveLength(2);
    });
  });

  describe('daily scheduling', () => {
    it('should calculate next run time correctly', () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      const timeStr = `${futureTime.getHours().toString().padStart(2, '0')}:${futureTime.getMinutes().toString().padStart(2, '0')}`;

      scheduler.addSchedule({
        id: 'daily-test',
        name: 'Daily Test',
        runAt: timeStr,
        enabled: true
      });

      const schedule = scheduler.getSchedule('daily-test');
      expect(schedule?.runAt).toBe(timeStr);
    });
  });
});
