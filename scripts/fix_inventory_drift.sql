-- =============================================================================
-- Inventory Drift Analysis Script
-- =============================================================================
-- Purpose: Identify shoes responsible for deck-inventory drift caused by the
--          second-destruction formula bug, and confirm the formula fix restores
--          correct counts.
--
-- Root cause:
--   When a REFILLED shoe was destroyed for a second time, the available-deck
--   formula showed +8 (incorrect increase) because:
--     1. The shoe exits holding_shoes  → formula gains +8
--     2. cards_destroyed_shoes count stays the same (destroyedAt was already
--        set from the first cycle and only gets overwritten, not incremented)
--     Net: available incorrectly rises by 8 per affected shoe.
--
-- Fix applied (cards.py / reports.py):
--   Added an extra_refill_destructions term to every formula function.
--   Affected shoes: refilledAt IS NOT NULL
--                   AND destroyedAt IS NOT NULL
--                   AND status NOT IN ('IN_WAREHOUSE','SENT_TO_STUDIO',
--                                       'RETURNED','REFILLED')
--   The fix is applied at query time, so no data mutations are required.
--   Running this script AFTER the code fix should show drift_decks = 0 per color.
-- =============================================================================


-- ── 1. Identify affected shoes ──────────────────────────────────────────────
--
-- These are shoes that:
--   * Were refilled at least once (refilledAt IS NOT NULL)
--   * Had their second-cycle cards destroyed (destroyedAt IS NOT NULL)
--   * Are NOT currently holding active cards (i.e. not in a holding status)
--
-- Before the code fix these shoes each caused +8 drift in available decks.
-- After the code fix they are correctly accounted for by extra_refill_destructions.

SELECT
    id,
    "shoeNumber",
    color,
    material,
    status,
    "refilledAt",
    "destroyedAt"
FROM "Shoe"
WHERE "refilledAt"  IS NOT NULL
  AND "destroyedAt" IS NOT NULL
  AND status NOT IN (
      'IN_WAREHOUSE',
      'SENT_TO_STUDIO',
      'RETURNED',
      'REFILLED'
  )
ORDER BY color, "refilledAt" DESC;


-- ── 2. Drift summary by color ────────────────────────────────────────────────
--
-- drift_decks = affected_shoes × 8
-- Before the code fix this equalled the number of decks that appeared as
-- "available" but were actually consumed.
-- After the code fix the formula corrects for these automatically.

SELECT
    color,
    COUNT(*)       AS affected_shoes,
    COUNT(*) * 8   AS drift_decks
FROM "Shoe"
WHERE "refilledAt"  IS NOT NULL
  AND "destroyedAt" IS NOT NULL
  AND status NOT IN (
      'IN_WAREHOUSE',
      'SENT_TO_STUDIO',
      'RETURNED',
      'REFILLED'
  )
GROUP BY color
ORDER BY color;


-- ── 3. Drift summary by material ─────────────────────────────────────────────

SELECT
    material,
    COUNT(*)       AS affected_shoes,
    COUNT(*) * 8   AS drift_decks
FROM "Shoe"
WHERE "refilledAt"  IS NOT NULL
  AND "destroyedAt" IS NOT NULL
  AND status NOT IN (
      'IN_WAREHOUSE',
      'SENT_TO_STUDIO',
      'RETURNED',
      'REFILLED'
  )
GROUP BY material
ORDER BY material;


-- ── 4. Cross-check: current inventory state ──────────────────────────────────
--
-- After the code fix the value in the "available" column returned by the
-- GET /cards/inventory API should match:
--   total_added − (holding + cards_destroyed + extra_refill_destructions) × 8
-- Use the queries below to independently verify for each color.

-- BLACK
SELECT
    (SELECT COALESCE(SUM("deckCount"), 0) FROM "DeckEntry" WHERE color = 'BLACK')
        AS total_added,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'BLACK'
       AND status IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
        AS holding_shoes,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'BLACK' AND "destroyedAt" IS NOT NULL)
        AS cards_destroyed_shoes,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'BLACK'
       AND "refilledAt"  IS NOT NULL
       AND "destroyedAt" IS NOT NULL
       AND status NOT IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
        AS extra_refill_destructions,
    (
        (SELECT COALESCE(SUM("deckCount"), 0) FROM "DeckEntry" WHERE color = 'BLACK')
        - (
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'BLACK'
               AND status IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
            +
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'BLACK' AND "destroyedAt" IS NOT NULL)
            +
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'BLACK'
               AND "refilledAt"  IS NOT NULL
               AND "destroyedAt" IS NOT NULL
               AND status NOT IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
          ) * 8
    ) AS available_black_decks;

-- RED
SELECT
    (SELECT COALESCE(SUM("deckCount"), 0) FROM "DeckEntry" WHERE color = 'RED')
        AS total_added,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'RED'
       AND status IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
        AS holding_shoes,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'RED' AND "destroyedAt" IS NOT NULL)
        AS cards_destroyed_shoes,
    (SELECT COUNT(*) FROM "Shoe"
     WHERE color = 'RED'
       AND "refilledAt"  IS NOT NULL
       AND "destroyedAt" IS NOT NULL
       AND status NOT IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
        AS extra_refill_destructions,
    (
        (SELECT COALESCE(SUM("deckCount"), 0) FROM "DeckEntry" WHERE color = 'RED')
        - (
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'RED'
               AND status IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
            +
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'RED' AND "destroyedAt" IS NOT NULL)
            +
            (SELECT COUNT(*) FROM "Shoe"
             WHERE color = 'RED'
               AND "refilledAt"  IS NOT NULL
               AND "destroyedAt" IS NOT NULL
               AND status NOT IN ('IN_WAREHOUSE','SENT_TO_STUDIO','RETURNED','REFILLED'))
          ) * 8
    ) AS available_red_decks;
