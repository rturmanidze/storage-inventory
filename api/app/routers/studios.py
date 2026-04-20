from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Role, Studio, User
from app.schemas import StudioCreate, StudioOut, StudioUpdate

router = APIRouter(prefix="/studios", tags=["studios"])


@router.get("", response_model=List[StudioOut])
def list_studios(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Studio).order_by(Studio.name).all()


@router.get("/{studio_id}", response_model=StudioOut)
def get_studio(
    studio_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    studio = db.query(Studio).filter(Studio.id == studio_id).first()
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found")
    return studio


@router.post("", response_model=StudioOut, status_code=status.HTTP_201_CREATED)
def create_studio(
    body: StudioCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    existing = db.query(Studio).filter(Studio.name == body.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A studio with this name already exists")
    studio = Studio(name=body.name, description=body.description)
    db.add(studio)
    db.flush()
    log_action(
        db,
        "CREATE_STUDIO",
        user_id=current_user.id,
        resource_type="studio",
        resource_id=studio.id,
        detail={"name": body.name},
        request=request,
    )
    db.commit()
    db.refresh(studio)
    return studio


@router.put("/{studio_id}", response_model=StudioOut)
def update_studio(
    studio_id: int,
    body: StudioUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN, Role.MANAGER)),
):
    studio = db.query(Studio).filter(Studio.id == studio_id).first()
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found")
    if body.name is not None:
        existing = db.query(Studio).filter(Studio.name == body.name, Studio.id != studio_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="A studio with this name already exists")
        studio.name = body.name
    if body.description is not None:
        studio.description = body.description
    log_action(
        db,
        "UPDATE_STUDIO",
        user_id=current_user.id,
        resource_type="studio",
        resource_id=studio_id,
        detail=body.model_dump(exclude_none=True),
        request=request,
    )
    db.commit()
    db.refresh(studio)
    return studio


@router.delete("/{studio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_studio(
    studio_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    studio = db.query(Studio).filter(Studio.id == studio_id).first()
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found")
    log_action(
        db,
        "DELETE_STUDIO",
        user_id=current_user.id,
        resource_type="studio",
        resource_id=studio_id,
        detail={"name": studio.name},
        request=request,
    )
    db.delete(studio)
    db.commit()
