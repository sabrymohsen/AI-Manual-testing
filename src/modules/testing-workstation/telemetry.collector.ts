/**
 * TelemetryCollector acts as a parser listener for runtime browser network latency values and error exceptions.
 */
export class TelemetryCollector {
  private static telemetryLogs: Map<string, Array<{ type: string; msg: string; time: Date }>> = new Map()

  /**
   * Appends an event to the session telemetry cache.
   */
  static recordEvent(sessionId: string, type: "console" | "network" | "exception", msg: string) {
    const logs = this.telemetryLogs.get(sessionId) || []
    logs.push({
      type,
      msg,
      time: new Date()
    })
    this.telemetryLogs.set(sessionId, logs)
  }

  /**
   * Returns all record values for a session.
   */
  static getTelemetry(sessionId: string) {
    return this.telemetryLogs.get(sessionId) || []
  }

  /**
   * Cleans up logs cache.
   */
  static clear(sessionId: string) {
    this.telemetryLogs.delete(sessionId)
  }
}
