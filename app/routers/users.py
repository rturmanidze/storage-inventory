from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import get_current_user, hash_password, require_roles, verify_password
from app.database import get_db
from app.models import Role, User
from app.schemas import UserCreate, UserOut, UserSelfPasswordUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

_admin_only = require_roles(Role.ADMIN)


@router.get("", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role == Role.ADMIN:
        return db.query(User).order_by(User.id).all()
    return [current]


@router.patch("/me", response_model=UserOut)
def change_own_password(
    body: UserSelfPasswordUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current.passwordHash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current.passwordHash = hash_password(body.new_password)
    log_action(
        db,
        "CHANGE_OWN_PASSWORD",
        user_id=current.id,
        resource_type="user",
        resource_id=current.id,
        request=request,
    )
    db.commit()
    db.refresh(current)
    return current


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(_admin_only),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")
    user = User(
        username=body.username,
        email=body.email,
        passwordHash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.flush()
    log_action(
        db,
        "CREATE_USER",
        user_id=current.id,
        resource_type="user",
        resource_id=user.id,
        detail={"username": user.username, "role": user.role.value},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(_admin_only),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    changes: dict = {}
    if body.email is not None:
        existing = db.query(User).filter(User.email == body.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        changes["email"] = body.email
        user.email = body.email
    if body.role is not None:
        changes["role"] = body.role.value
        user.role = body.role
    if body.password is not None:
        user.passwordHash = hash_password(body.password)
        changes["password_reset"] = True
    log_action(
        db,
        "UPDATE_USER",
        user_id=current.id,
        resource_type="user",
        resource_id=user_id,
        detail=changes,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current: User = Depends(_admin_only),
):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    log_action(
        db,
        "DELETE_USER",
        user_id=current.id,
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username},
        request=request,
    )
    db.delete(user)
    db.commit()

