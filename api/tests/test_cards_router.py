import json
from datetime import datetime

from app.models import AuditLog, Shoe, ShoeStatus
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
