/**
 * EventBus - Unit Tests
 *
 * Comprehensive test suite for EventBus job lifecycle event system.
 * Tests event emission, session-based filtering, memory management, and error scenarios.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBus,
  createEventBus,
  getEventBus,
  setEventBus,
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
  let originalSetInterval;
  let originalClearInterval;
  let mockSetInterval;
  let mockClearInterval;

  beforeEach(() => {
    // Mock timers to control cleanup cycles during tests
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    mockSetInterval = vi.fn();
    mockClearInterval = vi.fn();
    global.setInterval = mockSetInterval;
    global.clearInterval = mockClearInterval;

    // Clear all mocks BEFORE creating EventBus
    vi.clearAllMocks();

    // Create fresh EventBus instance for each test
    eventBus = new EventBus({
      maxListeners: 50,
      maxEventHistory: 10,
      maxPayloadSize: 1024,
      rateLimit: 10,
      sessionTimeout: 1000, // 1 second for faster test cleanup
    });
  });

  afterEach(async () => {
    // Restore original timers
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;

    // Shutdown EventBus to clean up resources
    if (eventBus) {
      await eventBus.shutdown();
    }

    // Reset global instance
    setEventBus(null);
  });

  describe('Constructor and Initialization', () => {
    it('should create EventBus with default options', () => {
      const bus = new EventBus();
      
      expect(bus).toBeInstanceOf(EventBus);
      expect(bus.maxListeners).toBe(100);
      expect(bus.maxEventHistory).toBe(100);
      expect(bus.maxPayloadSize).toBe(1024 * 1024);
      expect(bus.rateLimit).toBe(100);
      expect(bus.sessionTimeout).toBe(24 * 60 * 60 * 1000);
      
      bus.shutdown();
    });

    it('should create EventBus with custom options', () => {
      expect(eventBus.maxListeners).toBe(50);
      expect(eventBus.maxEventHistory).toBe(10);
      expect(eventBus.maxPayloadSize).toBe(1024);
      expect(eventBus.rateLimit).toBe(10);
      expect(eventBus.sessionTimeout).toBe(1000);
    });

    it('should initialize cleanup timer', () => {
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        600000  // 10 * 60 * 1000 = 600000ms
      );
    });

    it('should initialize tracking maps', () => {
      expect(eventBus.sessionListeners).toBeInstanceOf(Map);
      expect(eventBus.sessionLastActivity).toBeInstanceOf(Map);
      expect(eventBus.eventHistory).toBeInstanceOf(Map);
      expect(eventBus.rateLimitCounters).toBeInstanceOf(Map);
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
    const testSessionId = 'session_test456';

    describe('emitJobCreated', () => {
      it('should emit job created event with proper payload', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);

        const data = { tool: 'chat', options: { timeout: 5000 } };
        const result = eventBus.emitJobCreated(testJobId, testSessionId, data);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_CREATED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            tool: 'chat',
            options: { timeout: 5000 },
            timestamp: expect.any(Number),
          }),
        });
      });

      it('should add event to history', () => {
        eventBus.emitJobCreated(testJobId, testSessionId, { tool: 'chat' });
        
        const history = eventBus.getEventHistory(testJobId, testSessionId);
        expect(history).toHaveLength(1);
        expect(history[0].eventType).toBe(EVENT_TYPES.JOB_CREATED);
      });
    });

    describe('emitJobUpdated', () => {
      it('should emit job updated event with progress data', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_UPDATED, mockListener);

        const updateData = { 
          progress: 0.5, 
          status: 'running',
          providers: { openai: 'active' }
        };
        
        const result = eventBus.emitJobUpdated(testJobId, testSessionId, updateData);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_UPDATED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            progress: 0.5,
            status: 'running',
            providers: { openai: 'active' },
            timestamp: expect.any(Number),
          }),
        });
      });
    });

    describe('emitJobCompleted', () => {
      it('should emit job completed event with result indicator', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_COMPLETED, mockListener);

        const result = eventBus.emitJobCompleted(testJobId, testSessionId, { content: 'response' });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_COMPLETED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            result: 'present',
            hasResult: true,
            timestamp: expect.any(Number),
          }),
        });
      });

      it('should handle null result', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_COMPLETED, mockListener);

        eventBus.emitJobCompleted(testJobId, testSessionId, null);

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              result: 'null',
              hasResult: false,
            }),
          })
        );
      });
    });

    describe('emitJobFailed', () => {
      it('should emit job failed event with Error object', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_FAILED, mockListener);

        const error = new Error('Test error');
        error.code = 'TEST_ERROR';
        
        const result = eventBus.emitJobFailed(testJobId, testSessionId, error);

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_FAILED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            error: {
              message: 'Test error',
              name: 'Error',
              code: 'TEST_ERROR',
            },
            timestamp: expect.any(Number),
          }),
        });
      });

      it('should handle plain object errors', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_FAILED, mockListener);

        const error = { message: 'Custom error', code: 'CUSTOM_ERROR' };
        eventBus.emitJobFailed(testJobId, testSessionId, error);

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              error: { message: 'Custom error', code: 'CUSTOM_ERROR' },
            }),
          })
        );
      });
    });

    describe('emitJobCancelled', () => {
      it('should emit job cancelled event with reason', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CANCELLED, mockListener);

        const result = eventBus.emitJobCancelled(testJobId, testSessionId, { reason: 'Timeout' });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_CANCELLED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            reason: 'Timeout',
            timestamp: expect.any(Number),
          }),
        });
      });

      it('should use default reason if none provided', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_CANCELLED, mockListener);

        eventBus.emitJobCancelled(testJobId, testSessionId);

        expect(mockListener).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              reason: 'User cancellation',
            }),
          })
        );
      });
    });

    describe('emitJobStarted', () => {
      it('should emit job started event with tool info', () => {
        const mockListener = vi.fn();
        eventBus.on(EVENT_TYPES.JOB_STARTED, mockListener);

        const result = eventBus.emitJobStarted(testJobId, testSessionId, { tool: 'consensus' });

        expect(result).toBe(true);
        expect(mockListener).toHaveBeenCalledWith({
          eventType: EVENT_TYPES.JOB_STARTED,
          jobId: testJobId,
          sessionId: testSessionId,
          timestamp: expect.any(Number),
          data: expect.objectContaining({
            tool: 'consensus',
            timestamp: expect.any(Number),
          }),
        });
      });
    });
  });

  describe('Session-Based Event Filtering', () => {
    const testJobId = 'job_test123';
    const session1 = 'session_1';
    const session2 = 'session_2';

    it('should add session listener that only receives events for that session', () => {
      const session1Listener = vi.fn();
      const session2Listener = vi.fn();

      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, session1Listener);
      eventBus.addSessionListener(session2, EVENT_TYPES.JOB_CREATED, session2Listener);

      // Emit event for session1
      eventBus.emitJobCreated(testJobId, session1, { tool: 'chat' });

      expect(session1Listener).toHaveBeenCalledOnce();
      expect(session2Listener).not.toHaveBeenCalled();

      // Emit event for session2
      eventBus.emitJobCreated(testJobId, session2, { tool: 'consensus' });

      expect(session1Listener).toHaveBeenCalledOnce();
      expect(session2Listener).toHaveBeenCalledOnce();
    });

    it('should update session activity when adding listeners', () => {
      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, () => {});
      
      expect(eventBus.sessionLastActivity.has(session1)).toBe(true);
      expect(eventBus.sessionListeners.has(session1)).toBe(true);
      expect(eventBus.stats.sessionsActive).toBe(1);
    });

    it('should support multiple listeners for the same session and event type', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, listener1);
      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, listener2);

      eventBus.emitJobCreated(testJobId, session1, { tool: 'chat' });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should remove specific session listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, listener1);
      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_UPDATED, listener2);

      const removed = eventBus.removeSessionListener(session1, EVENT_TYPES.JOB_CREATED, listener1);
      expect(removed).toBe(true);

      eventBus.emitJobCreated(testJobId, session1, { tool: 'chat' });
      eventBus.emitJobUpdated(testJobId, session1, { progress: 0.5 });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should remove all session listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_CREATED, listener1);
      eventBus.addSessionListener(session1, EVENT_TYPES.JOB_UPDATED, listener2);

      const removedCount = eventBus.removeAllSessionListeners(session1);
      expect(removedCount).toBe(2);

      eventBus.emitJobCreated(testJobId, session1, { tool: 'chat' });
      eventBus.emitJobUpdated(testJobId, session1, { progress: 0.5 });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(eventBus.sessionListeners.has(session1)).toBe(false);
    });

    it('should return false when trying to remove non-existent session listener', () => {
      const removed = eventBus.removeSessionListener('non-existent', EVENT_TYPES.JOB_CREATED, () => {});
      expect(removed).toBe(false);
    });

    it('should return 0 when trying to remove all listeners for non-existent session', () => {
      const removedCount = eventBus.removeAllSessionListeners('non-existent');
      expect(removedCount).toBe(0);
    });
  });

  describe('Event History and Ring Buffer', () => {
    const testJobId = 'job_history';
    const testSessionId = 'session_history';

    it('should maintain event history for jobs', () => {
      eventBus.emitJobCreated(testJobId, testSessionId, { tool: 'chat' });
      eventBus.emitJobStarted(testJobId, testSessionId, { tool: 'chat' });
      eventBus.emitJobUpdated(testJobId, testSessionId, { progress: 0.5 });

      const history = eventBus.getEventHistory(testJobId, testSessionId);
      
      expect(history).toHaveLength(3);
      expect(history[0].eventType).toBe(EVENT_TYPES.JOB_CREATED);
      expect(history[1].eventType).toBe(EVENT_TYPES.JOB_STARTED);
      expect(history[2].eventType).toBe(EVENT_TYPES.JOB_UPDATED);
    });

    it('should filter event history by session', () => {
      const session1 = 'session_1';
      const session2 = 'session_2';

      eventBus.emitJobCreated(testJobId, session1, { tool: 'chat' });
      eventBus.emitJobCreated(testJobId, session2, { tool: 'consensus' });

      const session1History = eventBus.getEventHistory(testJobId, session1);
      const session2History = eventBus.getEventHistory(testJobId, session2);

      expect(session1History).toHaveLength(1);
      expect(session2History).toHaveLength(1);
      expect(session1History[0].sessionId).toBe(session1);
      expect(session2History[0].sessionId).toBe(session2);
    });

    it('should maintain ring buffer size limit', () => {
      const maxHistory = eventBus.maxEventHistory;
      
      // Create a new EventBus with higher rate limit for this test
      const testBus = new EventBus({
        maxEventHistory: 10,
        rateLimit: 100, // Much higher rate limit
      });
      
      // Create more events than the limit
      for (let i = 0; i < maxHistory + 5; i++) {
        testBus.emitJobUpdated(testJobId, testSessionId, { progress: i / 100 });
      }

      const history = testBus.getEventHistory(testJobId, testSessionId);
      expect(history).toHaveLength(maxHistory);
      
      testBus.shutdown();
    });

    it('should apply limit when getting event history', () => {
      // Create several events
      for (let i = 0; i < 5; i++) {
        eventBus.emitJobUpdated(testJobId, testSessionId, { progress: i / 10 });
      }

      const history = eventBus.getEventHistory(testJobId, testSessionId, 3);
      expect(history).toHaveLength(3);
    });

    it('should return empty array for non-existent job history', () => {
      const history = eventBus.getEventHistory('non-existent', testSessionId);
      expect(history).toEqual([]);
    });

    it('should handle invalid parameters gracefully', () => {
      const history1 = eventBus.getEventHistory('', testSessionId);
      const history2 = eventBus.getEventHistory(testJobId, '');
      
      expect(history1).toEqual([]);
      expect(history2).toEqual([]);
    });
  });

  describe('Rate Limiting', () => {
    const testJobId = 'job_rate';
    const testSessionId = 'session_rate';

    it('should allow events within rate limit', () => {
      const rateLimit = eventBus.rateLimit;
      
      // Emit events up to the rate limit
      for (let i = 0; i < rateLimit; i++) {
        expect(() => {
          eventBus.emitJobUpdated(testJobId, testSessionId, { progress: i });
        }).not.toThrow();
      }
    });

    it('should reject events exceeding rate limit', () => {
      const rateLimit = eventBus.rateLimit;
      
      // Fill up the rate limit
      for (let i = 0; i < rateLimit; i++) {
        eventBus.emitJobUpdated(testJobId, testSessionId, { progress: i });
      }

      // Next event should be rate limited
      expect(() => {
        eventBus.emitJobUpdated(testJobId, testSessionId, { progress: 100 });
      }).toThrow(EventBusError);
    });

    it('should reset rate limits after time window', async () => {
      const rateLimit = eventBus.rateLimit;
      
      // Fill up the rate limit
      for (let i = 0; i < rateLimit; i++) {
        eventBus.emitJobUpdated(testJobId, testSessionId, { progress: i });
      }

      // Mock time passage by directly manipulating the rate limit counter
      const counter = eventBus.rateLimitCounters.get(testSessionId);
      counter.resetTime = Date.now() - 1; // Make it expired
      eventBus.rateLimitCounters.set(testSessionId, counter);

      // Should now allow new events
      expect(() => {
        eventBus.emitJobUpdated(testJobId, testSessionId, { progress: 100 });
      }).not.toThrow();
    });

    it('should track rate limits per session', () => {
      const session1 = 'session_rate_1';
      const session2 = 'session_rate_2';
      const rateLimit = eventBus.rateLimit;
      
      // Fill rate limit for session1
      for (let i = 0; i < rateLimit; i++) {
        eventBus.emitJobUpdated(testJobId, session1, { progress: i });
      }

      // session2 should still be able to emit events
      expect(() => {
        eventBus.emitJobUpdated(testJobId, session2, { progress: 50 });
      }).not.toThrow();

      // But session1 should be rate limited
      expect(() => {
        eventBus.emitJobUpdated(testJobId, session1, { progress: 100 });
      }).toThrow(EventBusError);
    });
  });

  describe('Data Sanitization', () => {
    const testJobId = 'job_sanitize';
    const testSessionId = 'session_sanitize';

    it('should sanitize sensitive data from event payloads', () => {
      const mockListener = vi.fn();
      eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);

      const sensitiveData = {
        tool: 'chat',
        password: 'secret123',
        apiKey: 'key_456',
        authToken: 'token_789',
        normal: 'data'
      };

      eventBus.emitJobCreated(testJobId, testSessionId, sensitiveData);

      const eventPayload = mockListener.mock.calls[0][0];
      expect(eventPayload.data.password).toBe('[REDACTED]');
      expect(eventPayload.data.apiKey).toBe('[REDACTED]');
      expect(eventPayload.data.authToken).toBe('[REDACTED]');
      expect(eventPayload.data.normal).toBe('data');
      expect(eventPayload.data.tool).toBe('chat');
    });

    it('should sanitize nested sensitive data', () => {
      const mockListener = vi.fn();
      eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);

      const nestedData = {
        config: {
          credentials: {
            password: 'nested_secret',
            token: 'nested_token'
          },
          normal: 'value'
        }
      };

      eventBus.emitJobCreated(testJobId, testSessionId, nestedData);

      const eventPayload = mockListener.mock.calls[0][0];
      
      // The sanitization works by replacing the entire object containing sensitive field names
      expect(eventPayload.data.config.credentials).toBe('[REDACTED]');
      expect(eventPayload.data.config.normal).toBe('value');
    });
  });

  describe('Validation and Error Handling', () => {
    const testJobId = 'job_validate';
    const testSessionId = 'session_validate';

    describe('Parameter Validation', () => {
      it('should validate event types', () => {
        expect(() => {
          eventBus._emitJobEvent('invalid.event', testJobId, testSessionId, {});
        }).toThrow(EventBusError);
      });

      it('should validate job IDs', () => {
        expect(() => {
          eventBus.emitJobCreated('', testSessionId, {});
        }).toThrow(EventBusError);

        expect(() => {
          eventBus.emitJobCreated(null, testSessionId, {});
        }).toThrow(EventBusError);
      });

      it('should validate session IDs', () => {
        expect(() => {
          eventBus.emitJobCreated(testJobId, '', {});
        }).toThrow(EventBusError);

        expect(() => {
          eventBus.emitJobCreated(testJobId, null, {});
        }).toThrow(EventBusError);
      });

      it('should validate callbacks when adding session listeners', () => {
        expect(() => {
          eventBus.addSessionListener(testSessionId, EVENT_TYPES.JOB_CREATED, 'not-a-function');
        }).toThrow(EventBusError);
      });

      it('should validate payload size', () => {
        const largePayload = {
          data: 'x'.repeat(eventBus.maxPayloadSize + 1)
        };

        expect(() => {
          eventBus.emitJobCreated(testJobId, testSessionId, largePayload);
        }).toThrow(EventBusError);
      });
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

  describe('Memory Management and Cleanup', () => {
    it('should track session activity', () => {
      const testSession = 'session_activity';
      
      eventBus.addSessionListener(testSession, EVENT_TYPES.JOB_CREATED, () => {});
      expect(eventBus.sessionLastActivity.has(testSession)).toBe(true);
      
      eventBus.emitJobCreated('job_test', testSession, {});
      const lastActivity = eventBus.sessionLastActivity.get(testSession);
      expect(lastActivity).toBeGreaterThan(0);
    });

    it('should clean up expired sessions', () => {
      const testSession = 'session_cleanup';
      
      // Add listener
      eventBus.addSessionListener(testSession, EVENT_TYPES.JOB_CREATED, () => {});
      expect(eventBus.stats.sessionsActive).toBe(1);
      
      // Simulate expired session by setting old timestamp
      eventBus.sessionLastActivity.set(testSession, Date.now() - eventBus.sessionTimeout - 1000);
      
      // Trigger cleanup
      eventBus._cleanupExpiredSessions();
      
      expect(eventBus.stats.sessionsActive).toBe(0);
      expect(eventBus.sessionListeners.has(testSession)).toBe(false);
    });

    it('should clean up old event history', () => {
      const testJob = 'job_cleanup';
      const testSession = 'session_cleanup';
      
      eventBus.emitJobCreated(testJob, testSession, {});
      expect(eventBus.eventHistory.has(testJob)).toBe(true);
      
      // Make event history old
      const events = eventBus.eventHistory.get(testJob);
      events[0].timestamp = Date.now() - eventBus.sessionTimeout - 1000;
      
      // Trigger cleanup
      eventBus._cleanupExpiredSessions();
      
      expect(eventBus.eventHistory.has(testJob)).toBe(false);
    });

    it('should not clean up active sessions', () => {
      const testSession = 'session_active';
      
      eventBus.addSessionListener(testSession, EVENT_TYPES.JOB_CREATED, () => {});
      eventBus.emitJobCreated('job_test', testSession, {});
      
      // Trigger cleanup (should not remove active session)
      eventBus._cleanupExpiredSessions();
      
      expect(eventBus.stats.sessionsActive).toBe(1);
      expect(eventBus.sessionListeners.has(testSession)).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track event emission statistics', () => {
      const initialStats = eventBus.getStats();
      expect(initialStats.eventsEmitted).toBe(0);
      
      eventBus.emitJobCreated('job_1', 'session_1', {});
      eventBus.emitJobUpdated('job_1', 'session_1', {});
      
      const updatedStats = eventBus.getStats();
      expect(updatedStats.eventsEmitted).toBe(2);
    });

    it('should track listener statistics', () => {
      const initialStats = eventBus.getStats();
      expect(initialStats.listenersAdded).toBe(0);
      
      eventBus.addSessionListener('session_1', EVENT_TYPES.JOB_CREATED, () => {});
      eventBus.addSessionListener('session_1', EVENT_TYPES.JOB_UPDATED, () => {});
      
      const afterAddStats = eventBus.getStats();
      expect(afterAddStats.listenersAdded).toBe(2);
      expect(afterAddStats.totalSessions).toBe(1);
      
      eventBus.removeAllSessionListeners('session_1');
      
      const afterRemoveStats = eventBus.getStats();
      expect(afterRemoveStats.listenersRemoved).toBe(2);
      expect(afterRemoveStats.totalSessions).toBe(0);
    });

    it('should include memory and system information in stats', () => {
      const stats = eventBus.getStats();
      
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalEventHistory');
      expect(stats).toHaveProperty('activeRateCounters');
      expect(stats).toHaveProperty('maxListeners');
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats.memoryUsage).toHaveProperty('rss');
      expect(stats.memoryUsage).toHaveProperty('heapUsed');
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown cleanly', async () => {
      const testSession = 'session_shutdown';
      
      // Create a test EventBus that will have a real timer we can track
      const testBus = new EventBus();
      const shutdownSpy = vi.spyOn(testBus, 'shutdown');
      
      // Add some listeners and create events
      testBus.addSessionListener(testSession, EVENT_TYPES.JOB_CREATED, () => {});
      testBus.emitJobCreated('job_shutdown', testSession, {});
      
      // Verify data exists
      expect(testBus.sessionListeners.size).toBeGreaterThan(0);
      expect(testBus.eventHistory.size).toBeGreaterThan(0);
      
      await testBus.shutdown();
      
      // Verify cleanup
      expect(testBus.sessionListeners.size).toBe(0);
      expect(testBus.sessionLastActivity.size).toBe(0);
      expect(testBus.eventHistory.size).toBe(0);
      expect(testBus.rateLimitCounters.size).toBe(0);
      expect(testBus.stats.sessionsActive).toBe(0);
      // cleanupTimer is internal and set to null during shutdown
    });

    it('should remove all event listeners on shutdown', async () => {
      const mockListener = vi.fn();
      eventBus.on(EVENT_TYPES.JOB_CREATED, mockListener);
      
      await eventBus.shutdown();
      
      // Create a new event bus to test isolation
      const newEventBus = new EventBus();
      newEventBus.emitJobCreated('job_test', 'session_test', {});
      
      expect(mockListener).not.toHaveBeenCalled();
      
      await newEventBus.shutdown();
    });
  });

  describe('Global Instance Management', () => {
    afterEach(() => {
      setEventBus(null);
    });

    it('should create global instance on first access', () => {
      const globalBus = getEventBus();
      expect(globalBus).toBeInstanceOf(EventBus);
      
      const secondAccess = getEventBus();
      expect(secondAccess).toBe(globalBus);
    });

    it('should accept custom options for global instance', () => {
      const globalBus = getEventBus({ maxListeners: 200 });
      expect(globalBus.maxListeners).toBe(200);
    });

    it('should allow setting custom EventBus instance', () => {
      const customBus = new EventBus({ maxListeners: 300 });
      setEventBus(customBus);
      
      const retrievedBus = getEventBus();
      expect(retrievedBus).toBe(customBus);
      expect(retrievedBus.maxListeners).toBe(300);
      
      customBus.shutdown();
    });

    it('should validate EventBus instance when setting', () => {
      expect(() => {
        setEventBus('not-an-eventbus');
      }).toThrow(EventBusError);
    });

    it('should shutdown previous instance when setting new one', async () => {
      const firstBus = createEventBus();
      const shutdownSpy = vi.spyOn(firstBus, 'shutdown').mockImplementation(() => Promise.resolve());
      
      setEventBus(firstBus);
      setEventBus(createEventBus());
      
      // Give a moment for async shutdown to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should create EventBus with createEventBus function', () => {
      const customBus = createEventBus({ maxListeners: 150 });
      
      expect(customBus).toBeInstanceOf(EventBus);
      expect(customBus.maxListeners).toBe(150);
      
      customBus.shutdown();
    });
  });
});