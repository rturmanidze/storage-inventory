from datetime import datetime

from starlette.requests import Request

from app.models import CardColor, CardMaterial, Shoe, ShoeStatus, Studio
from app.routers.cards import return_shoe_from_studio


def _request() -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/cards/shoes/1/return-from-studio",
        "raw_path": b"/api/cards/shoes/1/return-from-studio",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("test", 80),
    }
    return Request(scope)


def test_return_from_studio_handles_string_color_without_500(db, admin_user):
    studio = Studio(name="S1", description=None, createdAt=datetime.utcnow(), updatedAt=datetime.utcnow())
    db.add(studio)
    db.flush()

    shoe = Shoe(
        shoeNumber="8",
        color=CardColor.BLACK,
        material=CardMaterial.PLASTIC,
        status=ShoeStatus.SENT_TO_STUDIO,
        studioId=studio.id,
        createdAt=datetime.utcnow(),
        sentAt=datetime.utcnow(),
    )
    db.add(shoe)
    db.flush()
    db.refresh(shoe)  # ensures color/status are loaded from DB as strings

    result = return_shoe_from_studio(shoe.id, _request(), db, admin_user)

    assert result.status == ShoeStatus.RETURNED
    assert result.returnedById == admin_user.id
    assert result.returnedAt is not None
