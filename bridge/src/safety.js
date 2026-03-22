/**
 * PotassiumMCP Bridge — Safety Policy Engine
 * 
 * Enforces rate limits, blocked remote patterns, and
 * destructive operation gates before requests reach the agent.
 */

export class SafetyPolicy {
  /**
   * @param {object} config - Loaded from config/default.json
   */
  constructor(config) {
    const safety = config.safety || {};
    this.maxCallsPerSecond = safety.max_calls_per_second ?? 10;
    this.blockedPatterns = (safety.blocked_remote_patterns || []).map(
      p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i')
    );
    this.destructiveEnabled = safety.destructive_operations_enabled ?? false;
    this.confirmDestructive = safety.confirm_destructive ?? true;
    this.targetSelfOnly = safety.target_self_only ?? true;

    // Rate tracking
    this._callTimestamps = [];
  }

  /**
   * Check whether a tool call is allowed.
   * @param {string} method - Tool name
   * @param {object} params - Tool parameters
   * @returns {{ allowed: boolean, reason?: string }}
   */
  check(method, params) {
    // Rate limit check
    const now = Date.now();
    this._callTimestamps = this._callTimestamps.filter(t => now - t < 1000);
    if (this._callTimestamps.length >= this.maxCallsPerSecond) {
      return { allowed: false, reason: `Rate limit exceeded (${this.maxCallsPerSecond}/sec)` };
    }

    // Blocked remote patterns (for call_remote, get_connections)
    if (method === 'call_remote' && params?.path) {
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(params.path)) {
          return { allowed: false, reason: `Remote blocked by safety policy: ${params.path}` };
        }
      }
    }

    // Destructive operations gate
    if (method === 'execute_probe' && params?.probe) {
      const destructiveProbes = ['fuzz_remote', 'mass_call', 'stress_test'];
      if (destructiveProbes.includes(params.probe) && !this.destructiveEnabled) {
        return { allowed: false, reason: `Destructive probe "${params.probe}" is disabled` };
      }
    }

    // Record the call for rate tracking
    this._callTimestamps.push(now);

    return { allowed: true };
  }
}
