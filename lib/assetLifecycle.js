'use strict';

const ASSET_LIFECYCLE_STATES = Object.freeze([
  'draft',
  'ready',
  'submitted',
  'accepted',
  'rejected',
  'distributed',
  'original_deleted',
  'thumbnail_only',
]);

const STATE_SET = new Set(ASSET_LIFECYCLE_STATES);

const TRANSITIONS = Object.freeze({
  draft: new Set(['ready', 'rejected']),
  ready: new Set(['submitted', 'rejected']),
  submitted: new Set(['accepted', 'rejected']),
  accepted: new Set(['distributed', 'original_deleted']),
  rejected: new Set([]),
  distributed: new Set(['original_deleted']),
  original_deleted: new Set(['thumbnail_only']),
  thumbnail_only: new Set([]),
});

class LifecycleError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LifecycleError';
    this.code = options.code || 'LIFECYCLE_ERROR';
  }
}

function isValidLifecycleState(state) {
  return STATE_SET.has(state);
}

function canTransition(from, to) {
  if (!isValidLifecycleState(from) || !isValidLifecycleState(to)) {
    return false;
  }

  if (from === to) {
    return true;
  }

  return TRANSITIONS[from].has(to);
}

function deriveReadyStateFromMetadata(asset) {
  const title = String(asset?.title || '').trim();
  const description = String(asset?.description || '').trim();
  const keywords = Array.isArray(asset?.keywords)
    ? asset.keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : [];

  return Boolean(title && description && keywords.length >= 3);
}

function resolveLifecycleTransition(asset, patch = {}, context = {}) {
  const currentState = asset?.status || 'draft';
  if (!isValidLifecycleState(currentState)) {
    throw new LifecycleError(`Unknown current lifecycle state '${currentState}'.`, {
      code: 'INVALID_CURRENT_LIFECYCLE',
    });
  }

  const requestedState = patch.lifecycleState !== undefined ? patch.lifecycleState : patch.status;

  if (requestedState !== undefined) {
    if (!isValidLifecycleState(requestedState)) {
      throw new LifecycleError(
        `lifecycleState must be one of '${ASSET_LIFECYCLE_STATES.join("', '")}'.`,
        { code: 'INVALID_TARGET_LIFECYCLE' },
      );
    }

    if (!canTransition(currentState, requestedState)) {
      throw new LifecycleError(`Invalid lifecycle transition '${currentState}' -> '${requestedState}'.`, {
        code: 'INVALID_LIFECYCLE_TRANSITION',
      });
    }

    return {
      nextState: requestedState,
      changed: requestedState !== currentState,
      reason: 'explicit-request',
    };
  }

  const shouldAutoPromoteReady = context.autoPromoteReady === true;
  if (shouldAutoPromoteReady && currentState === 'draft' && canTransition('draft', 'ready')) {
    return {
      nextState: 'ready',
      changed: true,
      reason: 'metadata-ready',
    };
  }

  return {
    nextState: currentState,
    changed: false,
    reason: 'no-change',
  };
}

module.exports = {
  ASSET_LIFECYCLE_STATES,
  LifecycleError,
  canTransition,
  deriveReadyStateFromMetadata,
  isValidLifecycleState,
  resolveLifecycleTransition,
};
