"""
Tests for deck inventory calculation correctness across the full shoe lifecycle.

Scenarios covered:
  1. Add decks → available increases
  2. Create shoe → available decreases by 8
  3. Send to studio → available unchanged
  4. Return from studio → available unchanged
  5. Destroy cards → available unchanged
  6. Full first lifecycle with no drift
  7. Refill path: recover → refill → send → return → destroy → unchanged
  8. Multiple cycles (two full refill cycles) → no cumulative drift
"""
import pytest
from datetime import datetime

from app.models import (
    CardColor,
    CardMaterial,
    DeckEntry,
    Shoe,
    ShoeStatus,
    Studio,
)
from app.routers.cards import (
    DECKS_PER_SHOE,
    _get_available_decks,
    _get_available_decks_by_material,
    _get_deck_count_by_material,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _add_decks(db, color, material, count):
    """Insert a DeckEntry directly (simulates the add-decks endpoint)."""
    entry = DeckEntry(
        color=color,
        material=material,
        deckCount=count,
        cardCount=count * 52,
        createdAt=datetime.utcnow(),
    )
    db.add(entry)
    db.flush()
    return entry


def _create_shoe(db, color, material, status=ShoeStatus.IN_WAREHOUSE):
    shoe = Shoe(
        shoeNumber="S1",
        color=color,
        material=material,
        status=status,
        createdAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()
    return shoe


# ── test scenarios ────────────────────────────────────────────────────────────

class TestInventoryLifecycle:
    """Verifies available deck counts at each step of the shoe lifecycle."""

    COLOR = CardColor.BLACK
    MATERIAL = CardMaterial.PLASTIC

    def _available(self, db):
        return _get_available_decks(db, self.COLOR)

    def _available_by_mat(self, db):
        return _get_available_decks_by_material(db, self.COLOR, self.MATERIAL)

    def _available_mat_only(self, db):
        return _get_deck_count_by_material(db, self.MATERIAL)

    # ── step 1: add decks ─────────────────────────────────────────────────────

    def test_add_decks_increases_available(self, db):
        before = self._available(db)
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        assert self._available(db) == before + DECKS_PER_SHOE

    # ── step 2: create shoe ────────────────────────────────────────────────────

    def test_create_shoe_decreases_available_by_8(self, db):
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        available_before = self._available(db)
        _create_shoe(db, self.COLOR, self.MATERIAL)
        assert self._available(db) == available_before - DECKS_PER_SHOE

    # ── step 3: send to studio ─────────────────────────────────────────────────

    def test_send_to_studio_leaves_available_unchanged(self, db):
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        before = self._available(db)

        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.sentAt = datetime.utcnow()
        db.flush()

        assert self._available(db) == before

    # ── step 4: return for destruction ─────────────────────────────────────────

    def test_return_from_studio_leaves_available_unchanged(self, db):
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.sentAt = datetime.utcnow()
        db.flush()
        before = self._available(db)

        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()

        assert self._available(db) == before

    # ── step 5: destroy cards ──────────────────────────────────────────────────

    def test_destroy_cards_leaves_available_unchanged(self, db):
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.sentAt = datetime.utcnow()
        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()
        before = self._available(db)

        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()

        assert self._available(db) == before

    # ── full first lifecycle ───────────────────────────────────────────────────

    def test_full_first_lifecycle_no_drift(self, db):
        """
        Add 8 → create → send → return → destroy
        Expected: available starts at 8, ends at 0, no intermediate drift.
        """
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        assert self._available(db) == DECKS_PER_SHOE  # +8

        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        assert self._available(db) == 0              # -8

        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.sentAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0              # 0

        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0              # 0  ← key: no +8 on return

        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0              # 0  ← key: no change on destroy

    # ── refill cycle ───────────────────────────────────────────────────────────

    def test_refill_cycle_no_drift(self, db):
        """
        First cycle: add 8 → create → destroy
        Recover shoe, add 8 more → refill shoe
        Second cycle: send → return → destroy
        Expected: available = 0 at end, no +8 drift on second destroy.
        """
        # Cycle 1 ── consume 8 decks
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()
        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0

        # Recover shoe
        shoe.status = ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE
        shoe.recoveredAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0

        # Add 8 new decks for the refill
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        assert self._available(db) == DECKS_PER_SHOE

        # Refill shoe (EMPTY_SHOE_IN_WAREHOUSE → REFILLED)
        shoe.status = ShoeStatus.REFILLED
        shoe.refilledAt = datetime.utcnow()
        db.flush()
        # REFILLED shoe is counted in BOTH holding AND destroyed → -16 total
        assert self._available(db) == 0

        # Cycle 2 ── send/return/destroy
        shoe.status = ShoeStatus.SENT_TO_STUDIO
        shoe.sentAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0              # 0

        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0              # 0  ← key: no +8 on return

        # Second destruction — this is where the bug previously caused +8
        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()         # overwrite, still not NULL
        db.flush()
        assert self._available(db) == 0              # 0  ← key: fixed, no +8 drift

    def test_refill_cycle_material_formula_no_drift(self, db):
        """Same scenario verified via the material-based formula."""
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()

        shoe.status = ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE
        shoe.recoveredAt = datetime.utcnow()
        db.flush()

        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe.status = ShoeStatus.REFILLED
        shoe.refilledAt = datetime.utcnow()
        db.flush()
        assert self._available_by_mat(db) == 0
        assert self._available_mat_only(db) == 0

        shoe.status = ShoeStatus.RETURNED
        shoe.returnedAt = datetime.utcnow()
        db.flush()
        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()

        assert self._available_by_mat(db) == 0
        assert self._available_mat_only(db) == 0

    # ── direct IN_WAREHOUSE → destroy (no studio) ──────────────────────────────

    def test_direct_destroy_from_warehouse_no_drift(self, db):
        """Shoe destroyed without going to studio: available unchanged on destroy."""
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE)
        shoe = _create_shoe(db, self.COLOR, self.MATERIAL)
        assert self._available(db) == 0

        shoe.status = ShoeStatus.CARDS_DESTROYED
        shoe.destroyedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0

    # ── multiple shoes ─────────────────────────────────────────────────────────

    def test_multiple_shoes_no_drift(self, db):
        """Two independent shoes going through full lifecycle: no cumulative drift."""
        _add_decks(db, self.COLOR, self.MATERIAL, DECKS_PER_SHOE * 2)
        shoe_a = _create_shoe(db, self.COLOR, self.MATERIAL)
        shoe_b = _create_shoe(db, self.COLOR, self.MATERIAL)
        assert self._available(db) == 0

        for shoe in (shoe_a, shoe_b):
            shoe.status = ShoeStatus.RETURNED
            shoe.returnedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0

        for shoe in (shoe_a, shoe_b):
            shoe.status = ShoeStatus.CARDS_DESTROYED
            shoe.destroyedAt = datetime.utcnow()
        db.flush()
        assert self._available(db) == 0

    # ── color isolation ────────────────────────────────────────────────────────

    def test_color_isolation(self, db):
        """Operations on RED shoes do not affect BLACK deck counts."""
        _add_decks(db, CardColor.BLACK, self.MATERIAL, DECKS_PER_SHOE)
        _add_decks(db, CardColor.RED, self.MATERIAL, DECKS_PER_SHOE)

        black_before = _get_available_decks(db, CardColor.BLACK)
        red_before = _get_available_decks(db, CardColor.RED)

        red_shoe = _create_shoe(db, CardColor.RED, self.MATERIAL)
        red_shoe.status = ShoeStatus.RETURNED
        red_shoe.returnedAt = datetime.utcnow()
        db.flush()
        red_shoe.status = ShoeStatus.CARDS_DESTROYED
        red_shoe.destroyedAt = datetime.utcnow()
        db.flush()

        assert _get_available_decks(db, CardColor.BLACK) == black_before  # unchanged
        assert _get_available_decks(db, CardColor.RED) == red_before - DECKS_PER_SHOE
