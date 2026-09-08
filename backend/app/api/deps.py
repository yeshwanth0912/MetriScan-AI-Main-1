"""Shared dependencies: current user, role gates, pagination."""
from typing import Iterable

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User


def current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    payload = decode_token(authorization.split(" ", 1)[1].strip())
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired. Sign in again.")
    user = db.get(User, payload.get("sub"))
    if not user or user.status != "ACTIVE":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is no longer active.")
    return user


def require_roles(*roles: str):
    """Authorisation is enforced here, on the server, not in the interface."""
    allowed = set(roles)

    def guard(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action needs one of these roles: {', '.join(sorted(allowed))}.",
            )
        return user

    return guard


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "")
