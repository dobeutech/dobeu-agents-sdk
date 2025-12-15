// server/endpoints/scheduler.ts
// API endpoints for managing scheduled tasks

import type { Scheduler, ScheduleConfig } from "../../ccsdk/scheduler";

/**
 * Get all schedules
 * GET /api/schedules
 */
export async function handleGetSchedules(
  req: Request,
  scheduler: Scheduler
): Promise<Response> {
  try {
    const schedules = scheduler.getSchedules();
    return new Response(JSON.stringify({
      success: true,
      schedules
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get a specific schedule
 * GET /api/schedule/:id
 */
export async function handleGetSchedule(
  req: Request,
  scheduler: Scheduler,
  scheduleId: string
): Promise<Response> {
  try {
    const schedule = scheduler.getSchedule(scheduleId);
    if (!schedule) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Schedule not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      schedule
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Enable a schedule
 * POST /api/schedule/:id/enable
 */
export async function handleEnableSchedule(
  req: Request,
  scheduler: Scheduler,
  scheduleId: string
): Promise<Response> {
  try {
    scheduler.enableSchedule(scheduleId);
    return new Response(JSON.stringify({
      success: true,
      message: `Schedule ${scheduleId} enabled`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Disable a schedule
 * POST /api/schedule/:id/disable
 */
export async function handleDisableSchedule(
  req: Request,
  scheduler: Scheduler,
  scheduleId: string
): Promise<Response> {
  try {
    scheduler.disableSchedule(scheduleId);
    return new Response(JSON.stringify({
      success: true,
      message: `Schedule ${scheduleId} disabled`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Manually trigger a schedule
 * POST /api/schedule/:id/trigger
 */
export async function handleTriggerSchedule(
  req: Request,
  scheduler: Scheduler,
  scheduleId: string
): Promise<Response> {
  try {
    await scheduler.triggerNow(scheduleId);
    return new Response(JSON.stringify({
      success: true,
      message: `Schedule ${scheduleId} triggered manually`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Update a schedule
 * PUT /api/schedule/:id
 */
export async function handleUpdateSchedule(
  req: Request,
  scheduler: Scheduler,
  scheduleId: string
): Promise<Response> {
  try {
    const updates = await req.json() as Partial<ScheduleConfig>;
    scheduler.updateSchedule(scheduleId, updates);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Schedule ${scheduleId} updated`,
      schedule: scheduler.getSchedule(scheduleId)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Add a new schedule
 * POST /api/schedules
 */
export async function handleAddSchedule(
  req: Request,
  scheduler: Scheduler
): Promise<Response> {
  try {
    const config = await req.json() as ScheduleConfig;
    
    // Validate required fields
    if (!config.id || !config.name) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: id, name'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    scheduler.addSchedule(config);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Schedule ${config.id} added`,
      schedule: config
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
