from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import IssuedTo, User
from app.schemas import IssuedToCreate, IssuedToOut, IssuedToUpdate

router = APIRouter(prefix="/issued-to", tags=["issued-to"])


@router.get("", response_model=List[IssuedToOut])
def list_issued_to(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(IssuedTo).all()


@router.post("", response_model=IssuedToOut, status_code=status.HTTP_201_CREATED)
def create_issued_to(
    body: IssuedToCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    issued_to = IssuedTo(**body.model_dump())
    db.add(issued_to)
    db.commit()
    db.refresh(issued_to)
    return issued_to


@router.get("/{issued_to_id}", response_model=IssuedToOut)
def get_issued_to(
    issued_to_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    issued_to = db.query(IssuedTo).filter(IssuedTo.id == issued_to_id).first()
    if not issued_to:
        raise HTTPException(status_code=404, detail=f"IssuedTo {issued_to_id} not found")
    return issued_to


@router.put("/{issued_to_id}", response_model=IssuedToOut)
def update_issued_to(
    issued_to_id: int,
    body: IssuedToUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    issued_to = db.query(IssuedTo).filter(IssuedTo.id == issued_to_id).first()
    if not issued_to:
        raise HTTPException(status_code=404, detail=f"IssuedTo {issued_to_id} not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(issued_to, field, value)
    db.commit()
    db.refresh(issued_to)
    return issued_to


@router.delete("/{issued_to_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issued_to(
    issued_to_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    issued_to = db.query(IssuedTo).filter(IssuedTo.id == issued_to_id).first()
    if not issued_to:
        raise HTTPException(status_code=404, detail=f"IssuedTo {issued_to_id} not found")
    db.delete(issued_to)
    db.commit()
