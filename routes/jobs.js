'use strict';

const express = require('express');
const { getPrisma } = require('../lib/prisma');

const router = express.Router();

/**
 * GET /api/jobs/:jobId
 *
 * Returns the current state of a submission job.
 * Ownership is enforced: the job must belong to the authenticated user.
 *
 * Response shape (stable):
 *   { jobId, status, siteSlug, assetIds, createdAt, updatedAt }
 */
router.get('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const prisma = getPrisma();

    const job = await prisma.submissionJob.findUnique({
      where: { id: jobId },
    });

    // Return 404 for both "not found" and "wrong owner" to avoid leaking existence.
    if (!job || job.userId !== req.userId) {
      return res.status(404).json({ error: `Job '${jobId}' not found.` });
    }

    return res.json({
      jobId: job.id,
      status: job.status,
      siteSlug: job.siteSlug,
      assetIds: job.assetIds,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
