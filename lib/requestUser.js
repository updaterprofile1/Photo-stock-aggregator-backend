'use strict';

function requireUserId(req, res, next) {
  const userId = req.get('x-user-id');
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return res.status(401).json({ error: 'Missing required x-user-id header.' });
  }

  req.userId = userId.trim();
  return next();
}

module.exports = { requireUserId };