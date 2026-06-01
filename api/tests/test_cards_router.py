import json
from datetime import datetime

from app.models import (
    AuditLog,
    CardColor,
    CardMaterial,
    Container,
    ContainerEventType,
    DeckNumber,
    Shoe,
    ShoeContainerLink,
    ShoeStatus,
)
from app.routers.containers import consume_one_deck_per_type
from app.schemas import ContainerEventOut
from app.routers.cards import return_shoe_from_studio


def test_return_shoe_from_studio_accepts_string_backed_shoe_fields(db, admin_user):
    shoe = Shoe(
        shoeNumber="11",
        color="BLACK",
        material="PAPER",
        status=ShoeStatus.SENT_TO_STUDIO,
        createdAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()

    returned = return_shoe_from_studio(
        shoe_id=shoe.id,
        request=None,
        db=db,
        current_user=admin_user,
    )

    assert returned.status == ShoeStatus.RETURNED

    audit = db.query(AuditLog).filter(AuditLog.resourceType == "shoe", AuditLog.resourceId == str(shoe.id)).one()
    detail = json.loads(audit.detail)
    assert detail["color"] == "BLACK"
    assert detail["studioId"] is None


def test_container_event_out_accepts_quantity_adjusted():
    event = ContainerEventOut.model_validate(
        {
            "id": 1,
            "containerId": 10,
            "eventType": "QUANTITY_ADJUSTED",
            "decksConsumed": None,
            "shoeId": None,
            "userId": None,
            "note": "Adjusted after recount",
            "createdAt": datetime.utcnow(),
            "user": None,
        }
    )

    assert event.eventType == ContainerEventType.QUANTITY_ADJUSTED


def test_consume_one_deck_per_type_replaces_existing_shoe_links(db, admin_user):
    shoe = Shoe(
        shoeNumber="9",
        color=CardColor.BLACK,
        material=CardMaterial.PAPER,
        status=ShoeStatus.EMPTY_SHOE_IN_WAREHOUSE,
        createdAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()

    for deck_type in DeckNumber:
        db.add(
            ShoeContainerLink(
                shoeId=shoe.id,
                containerId=None,
                deckType=deck_type,
                decksConsumed=1,
                createdAt=datetime.utcnow(),
            )
        )

    containers = []
    for index, deck_type in enumerate(DeckNumber, start=1):
        container = Container(
            code=f"CONTAINER-{index}",
            color=CardColor.BLACK,
            material=CardMaterial.PAPER,
            deckType=deck_type,
            decksRemaining=1,
            isLocked=False,
            createdById=admin_user.id,
            createdAt=datetime.utcnow(),
        )
        db.add(container)
        containers.append(container)

    db.flush()

    result = consume_one_deck_per_type(
        db,
        CardColor.BLACK,
        CardMaterial.PAPER,
        user_id=admin_user.id,
        shoe_id=shoe.id,
    )

    assert result is not None
    links = (
        db.query(ShoeContainerLink)
        .filter(ShoeContainerLink.shoeId == shoe.id)
        .order_by(ShoeContainerLink.deckType.asc())
        .all()
    )
    assert len(links) == len(DeckNumber)
    assert {link.deckType for link in links} == {deck_type for deck_type in DeckNumber}
    assert {link.containerId for link in links} == {container.id for container in containers}
