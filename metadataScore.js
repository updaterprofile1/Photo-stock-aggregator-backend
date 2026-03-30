// lib/metadataScore.js

/**
 * Compute a metadata quality score (0–100) for an uploaded asset.
 *
 * Scoring rubric:
 *   title       present                          → +20 pts
 *   title       length >= 10 chars               → +10 pts (max 30)
 *   description present                          → +20 pts
 *   description length >= 30 chars               → +10 pts (max 30)
 *   keywords    >= 1 keyword                     → +10 pts
 *   keywords    >= 5 keywords                    → +10 pts
 *   keywords    >= 10 keywords                   → +10 pts  (max 30)
 *   contentOrigin present                        → +10 pts
 *
 * Total max: 100
 *
 * @param {{ title: string, description?: string, keywords?: string[], contentOrigin: string }} fields
 * @returns {number} score rounded to 1 decimal place
 */
function computeMetadataScore({ title = '', description = '', keywords = [], contentOrigin }) {
  let score = 0;

  // --- Title (max 30) ---
  if (title && title.trim().length > 0) {
    score += 20;
    if (title.trim().length >= 10) score += 10;
  }

  // --- Description (max 30) ---
  if (description && description.trim().length > 0) {
    score += 20;
    if (description.trim().length >= 30) score += 10;
  }

  // --- Keywords (max 30) ---
  const kwCount = Array.isArray(keywords) ? keywords.filter(Boolean).length : 0;
  if (kwCount >= 1)  score += 10;
  if (kwCount >= 5)  score += 10;
  if (kwCount >= 10) score += 10;

  // --- Content origin (max 10) ---
  if (contentOrigin) score += 10;

  return Math.round(score * 10) / 10;
}

module.exports = { computeMetadataScore };
