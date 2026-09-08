from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserCreate, UserOut
from app.services import audit_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        audit_service.record(db, user_id=user.id if user else None, entity_type="auth",
                             entity_id=payload.email, action="LOGIN_FAILED",
                             ip_address=client_ip(request))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password do not match.")
    if user.status != "ACTIVE":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is inactive. Contact an administrator.")

    audit_service.record(db, user_id=user.id, entity_type="auth", entity_id=user.id,
                         action="LOGIN", ip_address=client_ip(request))
    db.commit()
    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        expires_in_minutes=settings.access_token_minutes,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut.model_validate(user)


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles("ADMIN"))):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.created_at).all()]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db),
                admin: User = Depends(require_roles("ADMIN"))):
    if payload.role not in ("OFFICER", "REVIEWER", "ADMIN"):
        raise HTTPException(422, "Role must be OFFICER, REVIEWER or ADMIN.")
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(409, "An account with that email already exists.")
    user = User(name=payload.name, email=payload.email.lower(),
                password_hash=hash_password(payload.password), role=payload.role,
                designation=payload.designation, jurisdiction=payload.jurisdiction)
    db.add(user)
    db.flush()
    audit_service.record(db, user_id=admin.id, entity_type="user", entity_id=user.id,
                         action="CREATE_USER", new_value={"email": user.email, "role": user.role},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
