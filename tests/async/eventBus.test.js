/**
 * EventBus - Unit Tests
 *
 * Test suite for simplified EventBus job lifecycle event system (single-user).
 * Tests event emission, history tracking, and error scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBus,
  getEventBus,
  resetEventBus,
  EventBusError,
  EVENT_TYPES,
} from '../../src/async/eventBus.js';

// Mock console utilities to prevent test output noise
vi.mock('../../src/utils/console.js', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

describe('EventBus Unit Tests', () => {
  let eventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create fresh EventBus instance for each test
    eventBus = new EventBus({
      maxListeners: 50,
      maxEventHistory: 10,
    });
  });

  afterEach(() => {
    // Cleanup EventBus to release resources
    if (eventBus) {
      eventBus.destroy();
    }
    // Reset global instance
    resetEventBus();
  });

  describe('Constructor and Initialization', () => {
    it('should create EventBus with default options', () => {
      const bus = new EventBus();

      expect(bus).toBeInstanceOf(EventBus);
      expect(bus.maxListeners).toBe(100);
      expect(bus.maxEventHistory).toBe(100);

      bus.destroy();
    });

    it('should create EventBus with custom options', () => {
      expect(eventBus.maxListeners).toBe(50);
      expect(eventBus.maxEventHistory).toBe(10);
    });

    it('should initialize tracking maps', () => {
      expect(eventBus.eventHistory).toBeInstanceOf(Map);
    });

    it('should initialize statistics', () => {
      expect(eventBus.stats).toEqual({
        eventsEmitted: 0,
        listenersAdded: 0,
        listenersRemoved: 0,
        memoryUsage: 0,
      });
    });
  });

  describe('Event Type Constants', () => {
    it('should define all required event types', () => {
      expect(EVENT_TYPES.JOB_CREATED).toBe('job.created');
      expect(EVENT_TYPES.JOB_UPDATED).toBe('job.updated');
      expect(EVENT_TYPES.JOB_COMPLETED).toBe('job.completed');
      expect(EVENT_TYPES.JOB_FAILED).toBe('job.failed');
      expect(EVENT_TYPES.JOB_CANCELLED).toBe('job.cancelled');
      expect(EVENT_TYPES.JOB_STARTED).toBe('job.started');
    });
  });

  describe('Event Emission Methods', () => {
    const testJobId = 'job_test123';

    describe('emitJobCreated', () => {
      it('should emit job created event with proper payload', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);

        const data = { tool: 'chat', options: { timeout: 5000 } };
        const result = eventBus.emitJobCreated(testJobId, data);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_CREATED,
            jobId: testJobId,
            data: expect.objectContaining({
              tool: 'chat',
              options: { timeout: 5000 },
              timestamp: expect.any(Number),
            }),
          }),
        );
      });

      it('should add event to history', () => {
        eventBus.emitJobCreated(testJobId, { tool: 'chat' });

        const history = eventBus.getJobHistory(testJobId);
        expect(history).toHaveLength(1);
        expect(history[0].type).toBe(EVENT_TYPES.JOB_CREATED);
      });
    });

    describe('emitJobUpdated', () => {
      it('should emit job updated event with progress data', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_UPDATED, mockListener);

        const updateData = {
          progress: 0.5,
          status: 'running',
          providers: { openai: 'active' },
        };

        const result = eventBus.emitJobUpdated(testJobId, updateData);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_UPDATED,
            jobId: testJobId,
            data: expect.objectContaining({
              progress: 0.5,
              status: 'running',
              providers: { openai: 'active' },
            }),
          }),
        );
      });
    });

    describe('emitJobCompleted', () => {
      it('should emit job completed event with result', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_COMPLETED, mockListener);

        const result = eventBus.emitJobCompleted(testJobId, {
          content: 'response',
        });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_COMPLETED,
            jobId: testJobId,
            data: expect.objectContaining({
              result: { content: 'response' },
              timestamp: expect.any(Number),
            }),
          }),
        );
      });

      it('should handle null result', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_COMPLETED, mockListener);

        eventBus.emitJobCompleted(testJobId, null);

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              result: null,
            }),
          }),
        );
      });

      it('should calculate duration when job was created first', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_COMPLETED, mockListener);

        // First create the job
        eventBus.emitJobCreated(testJobId, { tool: 'chat' });

        // Then complete it
        eventBus.emitJobCompleted(testJobId, { content: 'done' });

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              duration: expect.any(Number),
            }),
          }),
        );
      });
    });

    describe('emitJobFailed', () => {
      it('should emit job failed event with Error object', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_FAILED, mockListener);

        const error = new Error('Test error');
        error.code = 'TEST_ERROR';

        const result = eventBus.emitJobFailed(testJobId, error);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_FAILED,
            jobId: testJobId,
            data: expect.objectContaining({
              error: expect.objectContaining({
                message: 'Test error',
                code: 'TEST_ERROR',
              }),
            }),
          }),
        );
      });

      it('should handle string errors', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_FAILED, mockListener);

        eventBus.emitJobFailed(testJobId, 'Simple error message');

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              error: { message: 'Simple error message' },
            }),
          }),
        );
      });
    });

    describe('emitJobCancelled', () => {
      it('should emit job cancelled event with reason', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CANCELLED, mockListener);

        const result = eventBus.emitJobCancelled(testJobId, {
          reason: 'Timeout',
        });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_CANCELLED,
            jobId: testJobId,
            data: expect.objectContaining({
              reason: 'Timeout',
            }),
          }),
        );
      });

      it('should use default reason if none provided', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CANCELLED, mockListener);

        eventBus.emitJobCancelled(testJobId);

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reason: 'User cancelled',
            }),
          }),
        );
      });
    });

    describe('emitJobStarted', () => {
      it('should emit job started event with tool info', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_STARTED, mockListener);

        const result = eventBus.emitJobStarted(testJobId, {
          tool: 'consensus',
        });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            type: EVENT_TYPES.JOB_STARTED,
            jobId: testJobId,
            data: expect.objectContaining({
              tool: 'consensus',
            }),
          }),
        );
      });
    });
  });

  describe('Event Listener Registration', () => {
    it('should register event listener with onJobEvent', () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.onJobEvent(
        EVENT_TYPES.JOB_CREATED,
        listener,
      );

      expect(typeof unsubscribe).toBe('function');
      expect(eventBus.stats.listenersAdded).toBe(1);
    });

    it('should unsubscribe listener when calling returned function', () => {
      const listener = vi.fn();
      const unsubscribe = eventBus.onJobEvent(
        EVENT_TYPES.JOB_CREATED,
        listener,
      );

      unsubscribe();

      eventBus.emitJobCreated('job_123', { tool: 'chat' });
      expect(listener).not.toHaveBeenCalled();
      expect(eventBus.stats.listenersRemoved).toBe(1);
    });

    it('should throw for invalid event type', () => {
      expect(() => {
        eventBus.onJobEvent('invalid.event', () => {});
      }).toThrow(EventBusError);
    });

    it('should throw for non-function listener', () => {
      expect(() => {
        eventBus.onJobEvent(EVENT_TYPES.JOB_CREATED, 'not-a-function');
      }).toThrow(EventBusError);
    });
  });

  describe('Event History and Ring Buffer', () => {
    const testJobId = 'job_history';

    it('should maintain event history for jobs', () => {
      eventBus.emitJobCreated(testJobId, { tool: 'chat' });
      eventBus.emitJobStarted(testJobId, { tool: 'chat' });
      eventBus.emitJobUpdated(testJobId, { progress: 0.5 });

      const history = eventBus.getJobHistory(testJobId);

      expect(history).toHaveLength(3);
      expect(history[0].type).toBe(EVENT_TYPES.JOB_CREATED);
      expect(history[1].type).toBe(EVENT_TYPES.JOB_STARTED);
      expect(history[2].type).toBe(EVENT_TYPES.JOB_UPDATED);
    });

    it('should maintain ring buffer size limit', () => {
      const maxHistory = eventBus.maxEventHistory; // 10

      // Create more events than the limit
      for (let i = 0; i < maxHistory + 5; i++) {
        eventBus.emitJobUpdated(testJobId, { progress: i / 100 });
      }

      const history = eventBus.getJobHistory(testJobId);
      expect(history).toHaveLength(maxHistory);
    });

    it('should return empty array for non-existent job history', () => {
      const history = eventBus.getJobHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('should clear job history', () => {
      eventBus.emitJobCreated(testJobId, { tool: 'chat' });
      expect(eventBus.getJobHistory(testJobId)).toHaveLength(1);

      eventBus.clearJobHistory(testJobId);
      expect(eventBus.getJobHistory(testJobId)).toEqual([]);
    });
  });

  describe('Validation and Error Handling', () => {
    it('should validate job IDs', () => {
      expect(() => {
        eventBus.emitJobCreated('', {});
      }).toThrow(EventBusError);

      expect(() => {
        eventBus.emitJobCreated(null, {});
      }).toThrow(EventBusError);
    });

    describe('EventBusError Class', () => {
      it('should create EventBusError with message and code', () => {
        const error = new EventBusError('Test message', 'TEST_CODE');

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EventBusError);
        expect(error.name).toBe('EventBusError');
        expect(error.message).toBe('Test message');
        expect(error.code).toBe('TEST_CODE');
      });

      it('should use default code if none provided', () => {
        const error = new EventBusError('Test message');
        expect(error.code).toBe('EVENT_BUS_ERROR');
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track event emission statistics', () => {
      const initialStats = eventBus.getStats();
      expect(initialStats.eventsEmitted).toBe(0);

      eventBus.emitJobCreated('job_1', {});
      eventBus.emitJobUpdated('job_1', {});

      const updatedStats = eventBus.getStats();
      expect(updatedStats.eventsEmitted).toBe(2);
    });

    it('should track listener statistics', () => {
      const initialStats = eventBus.getStats();
      expect(initialStats.listenersAdded).toBe(0);

      const unsub1 = eventBus.onJobEvent(EVENT_TYPES.JOB_CREATED, () => {});
      const unsub2 = eventBus.onJobEvent(EVENT_TYPES.JOB_UPDATED, () => {});

      const afterAddStats = eventBus.getStats();
      expect(afterAddStats.listenersAdded).toBe(2);

      unsub1();
      unsub2();

      const afterRemoveStats = eventBus.getStats();
      expect(afterRemoveStats.listenersRemoved).toBe(2);
    });

    it('should include memory and event history size in stats', () => {
      eventBus.emitJobCreated('job_1', { tool: 'chat' });

      const stats = eventBus.getStats();

      expect(stats).toHaveProperty('totalListeners');
      expect(stats).toHaveProperty('eventHistorySize');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats.eventHistorySize).toBe(1);
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should destroy cleanly', () => {
      eventBus.emitJobCreated('job_1', { tool: 'chat' });
      expect(eventBus.eventHistory.size).toBe(1);

      eventBus.destroy();

      expect(eventBus.eventHistory.size).toBe(0);
    });

    it('should remove all event listeners on destroy', () => {
      const mockListener = vi.fn();
      eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);

      eventBus.destroy();

      // Create new event - should not trigger old listener
      eventBus.emit(EVENT_TYPES.JOB_CREATED, { test: true });
      expect(mockListener).not.toHaveBeenCalled();
    });
  });

  describe('Global Instance Management', () => {
    afterEach(() => {
      resetEventBus();
    });

    it('should create global instance on first access', () => {
      const globalBus = getEventBus();
      expect(globalBus).toBeInstanceOf(EventBus);

      const secondAccess = getEventBus();
      expect(secondAccess).toBe(globalBus);
    });

    it('should reset global instance', () => {
      const firstBus = getEventBus();
      resetEventBus();
      const secondBus = getEventBus();

      expect(secondBus).not.toBe(firstBus);
    });
  });
});
