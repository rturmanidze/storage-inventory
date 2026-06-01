-- Data correction: fix deck-pool accounting for shoes that transitioned
-- RETURNED → PHYSICALLY_DAMAGED → (PHYSICALLY_DESTROYED) without destroyedAt
-- being set.
--
-- Background
-- ----------
-- Prior to the inventory-logic fix, RETURNED shoes were NOT counted in the
-- holding_shoes pool formula, so their 8 decks were incorrectly released back
-- to the available pool when the shoe was returned from the studio.
-- When such a shoe was subsequently reported as physically damaged the
-- destroyedAt column was never set, leaving those 8 decks permanently
-- unaccounted for (neither in holding nor in destroyed).
--
-- The fix adds RETURNED to the holding formula and sets destroyedAt in
-- report_physical_damage when the source is RETURNED.  This script
-- back-fills destroyedAt for any historical rows that were missed.
--
-- Identification
-- --------------
-- Shoes in (PHYSICALLY_DAMAGED, PHYSICALLY_DESTROYED) with
--   destroyedAt IS NULL
-- must have come from RETURNED (not EMPTY_SHOE_IN_WAREHOUSE, which always
-- carries a destroyedAt from the preceding CARDS_DESTROYED step).
--
-- Run once on the production database after deploying the application fix.
-- Safe to re-run (WHERE destroyedAt IS NULL guard prevents double updates).

BEGIN;

UPDATE "Shoe"
SET
    "destroyedAt"  = COALESCE("physicalDamageAt", "physicallyDestroyedAt", "createdAt"),
    "destroyedById" = COALESCE("physicalDamageById", "physicallyDestroyedById", "destroyedById")
WHERE
    status IN ('PHYSICALLY_DAMAGED', 'PHYSICALLY_DESTROYED')
    AND "destroyedAt" IS NULL;

-- Verify: after the update there should be zero rows with destroyedAt IS NULL
-- in those two statuses.
DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM "Shoe"
    WHERE status IN ('PHYSICALLY_DAMAGED', 'PHYSICALLY_DESTROYED')
      AND "destroyedAt" IS NULL;

    IF remaining > 0 THEN
        RAISE EXCEPTION 'Data correction incomplete: % rows still have destroyedAt IS NULL', remaining;
    END IF;
    RAISE NOTICE 'Data correction complete — all PHYSICALLY_DAMAGED/DESTROYED shoes now have destroyedAt set.';
END $$;

COMMIT;
