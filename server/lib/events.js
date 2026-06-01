import { EventEmitter } from 'events';

// In-process pub/sub for live teacher monitoring (SSE).
// Student writes call publish(); teacher SSE streams subscribe by classId/sessionId.
// For multi-instance deployments this would move to Postgres LISTEN/NOTIFY.
class Bus extends EventEmitter {}
export const bus = new Bus();
bus.setMaxListeners(0); // many concurrent teacher streams

// kind: 'chat' | 'blockly' | 'event' | 'intervention' | 'presence'
export function publish(sessionId, classId, kind, data) {
  const payload = { sessionId, classId, kind, data, at: Date.now() };
  if (sessionId) bus.emit(`session:${sessionId}`, payload);
  if (classId) bus.emit(`class:${classId}`, payload);
}
