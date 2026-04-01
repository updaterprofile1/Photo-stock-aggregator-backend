// lib/metadataScore.js

/**
 * Compute a metadata completeness score (0–100) for an asset.
 *
 * Scoring rubric (total max = 13 points → 100):
 *   title         present (non-empty)    → +1 pt
 *   description   present (non-empty)    → +1 pt
 *   keywords      1 pt per keyword       → up to +10 pts  (capped at 10)
 *   contentOrigin present                → +1 pt
 *
 *   score = (points / 13) × 100, rounded to 1 decimal place
 *
 * Lifecycle promotion (e.g. draft → ready) requires score >= 50.
 *
 * @param {{ title?: string, description?: string, keywords?: string[], contentOrigin?: string }} metadataObj
 * @returns {number} score in range [0, 100] rounded to 1 decimal place
 */
function computeMetadataScore({ title = '', description = '', keywords = [], contentOrigin } = {}) {
  let points = 0;

  // --- Title (max 1) ---
  if (title && title.trim().length > 0) points += 1;

  // --- Description (max 1) ---
  if (description && description.trim().length > 0) points += 1;

  // --- Keywords (max 10, 1 pt per keyword) ---
  const kwCount = Array.isArray(keywords) ? keywords.filter(Boolean).length : 0;
  points += Math.min(kwCount, 10);

  // --- Content origin (max 1) ---
  if (contentOrigin) points += 1;

  return Math.round((points / 13) * 100 * 10) / 10;
}

module.exports = { computeMetadataScore };
