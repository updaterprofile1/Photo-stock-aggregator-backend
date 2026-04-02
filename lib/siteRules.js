'use strict';

/**
 * Hardcoded site submission rules.
 *
 * ai          – site accepts AI-generated content (contentOrigin === 'ai')
 * bulk        – preferred bulk-submission format: 'csv' | 'api' | null
 * disclosure  – site requires an explicit AI-disclosure flag from the contributor
 *
 * Add new sites here as they are onboarded.
 */
const SITE_RULES = {
  adobestock:  { ai: true,  bulk: 'csv', disclosure: true  },
  shutterstock: { ai: false, bulk: 'api', disclosure: false },
  gettyimages:  { ai: false, bulk: null,  disclosure: false },
  dreamstime:   { ai: true,  bulk: null,  disclosure: true  },
};

/**
 * Returns the rule object for a given siteSlug, or null if the site is unknown.
 * @param {string} siteSlug  Normalised (lowercased, trimmed) site identifier.
 * @returns {{ ai: boolean, bulk: string|null, disclosure: boolean } | null}
 */
function getSiteRules(siteSlug) {
  return SITE_RULES[siteSlug] ?? null;
}

/**
 * Validates an array of assets against a site's submission rules.
 * Returns an array of violation objects; empty array means all assets pass.
 *
 * @param {Array<{ id: string, contentOrigin: string }>} assets
 * @param {{ ai: boolean }} rules
 * @param {string} siteSlug
 * @returns {Array<{ rule: string, message: string, assetIds: string[] }>}
 */
function validateAssetsForSite(assets, rules, siteSlug) {
  const violations = [];

  if (!rules.ai) {
    const aiAssets = assets.filter((a) => a.contentOrigin === 'ai');
    if (aiAssets.length > 0) {
      violations.push({
        rule: 'ai',
        message: `Site '${siteSlug}' does not accept AI-generated content.`,
        assetIds: aiAssets.map((a) => a.id),
      });
    }
  }

  return violations;
}

module.exports = { getSiteRules, validateAssetsForSite };
