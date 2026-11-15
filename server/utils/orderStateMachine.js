/**
 * Server-enforced Order State Machine
 * Transitions:
 * - new -> preparing, rejected
 * - preparing -> ready, rejected
 * - ready -> served
 * - served -> terminal
 * - rejected -> terminal
 */

const VALID_TRANSITIONS = {
  payment_pending: ['new', 'rejected'],
  new: ['preparing', 'rejected'],
  preparing: ['ready', 'rejected'],
  ready: ['served'],
  served: [],
  rejected: []
};

/**
 * Validates if the proposed status transition is permitted
 * @param {string} currentStatus 
 * @param {string} nextStatus 
 * @param {string} role (owner can override if necessary)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateStatusTransition(currentStatus, nextStatus, role = 'staff') {
  if (currentStatus === nextStatus) {
    return { valid: true };
  }

  const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
  
  if (allowedNext.includes(nextStatus)) {
    return { valid: true };
  }

  // Owner override exception: allow moving ready back to preparing if kitchen needs re-work
  if (role === 'owner' && currentStatus === 'ready' && nextStatus === 'preparing') {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Illegal state transition: Cannot change order from '${currentStatus}' to '${nextStatus}'. Permitted transitions: [${allowedNext.join(', ') || 'None (Terminal state)'}]`
  };
}

module.exports = {
  VALID_TRANSITIONS,
  validateStatusTransition
};
