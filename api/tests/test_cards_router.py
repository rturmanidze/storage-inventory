import json
from datetime import datetime

from app.models import AuditLog, ContainerEventType, Shoe, ShoeStatus
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
