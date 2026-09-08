import hashlib
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.models import Image, Inspection, Product, User
from app.schemas import InspectionCreate, InspectionOut, InspectionUpdate
from app.services import audit_service

router = APIRouter(prefix="/api/inspections", tags=["inspections"])

EDITABLE_STATES = {"DRAFT", "ANALYZING", "REVIEW"}


def _next_reference(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.query(func.count(Inspection.id)).scalar() or 0
    return f"MS-{year}-{count + 1:06d}"


def _visible(db: Session, user: User):
    q = db.query(Inspection)
    # An officer sees their own work. Reviewers and administrators see all of it.
    if user.role == "OFFICER":
        q = q.filter(Inspection.officer_id == user.id)
    return q


def get_inspection(inspection_id: str, db: Session, user: User) -> Inspection:
    inspection = _visible(db, user).filter(Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(404, "That inspection does not exist, or is not yours to open.")
    return inspection


@router.post("", response_model=InspectionOut, status_code=201)
def create_inspection(payload: InspectionCreate, request: Request,
                      db: Session = Depends(get_db), user: User = Depends(current_user)):
    product = Product(brand=payload.brand, product_name=payload.product_name,
                      category=payload.category, barcode=payload.barcode)
    db.add(product)
    db.flush()

    inspection = Inspection(
        reference=_next_reference(db), product_id=product.id, officer_id=user.id,
        location=payload.location, premises=payload.premises, channel=payload.channel,
        listing_url=payload.listing_url, listing_text=payload.listing_text,
        is_imported=payload.is_imported, panel_width_mm=payload.panel_width_mm,
        panel_height_mm=payload.panel_height_mm,
        fiducial_marker_side_mm=payload.fiducial_marker_side_mm,
        notes=payload.notes,
    )
    if payload.inspection_date:
        inspection.inspection_date = payload.inspection_date
    db.add(inspection)
    db.flush()
    audit_service.record(db, user_id=user.id, entity_type="inspection", entity_id=inspection.id,
                         action="CREATE", new_value={"reference": inspection.reference},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)
    return InspectionOut.model_validate(inspection)


@router.get("", response_model=dict)
def list_inspections(
    db: Session = Depends(get_db), user: User = Depends(current_user),
    q: str = Query(default=""), status: str = Query(default=""),
    compliance: str = Query(default=""), category: str = Query(default=""),
    page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100),
):
    query = _visible(db, user)
    if status:
        query = query.filter(Inspection.status == status)
    if compliance:
        query = query.filter(Inspection.compliance_status == compliance)
    if q:
        like = f"%{q}%"
        query = query.outerjoin(Product, Inspection.product_id == Product.id).filter(
            or_(Inspection.reference.ilike(like), Inspection.location.ilike(like),
                Product.brand.ilike(like), Product.product_name.ilike(like))
        )
    if category:
        query = query.outerjoin(Product, Inspection.product_id == Product.id).filter(
            Product.category == category)

    total = query.count()
    rows = (query.order_by(Inspection.started_at.desc())
            .offset((page - 1) * page_size).limit(page_size).all())

    items = []
    for row in rows:
        data = InspectionOut.model_validate(row).model_dump()
        data["product"] = {
            "brand": row.product.brand if row.product else "",
            "product_name": row.product.product_name if row.product else "",
            "category": row.product.category if row.product else "",
        }
        data["image_count"] = len(row.images)
        items.append(data)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}


@router.get("/{inspection_id}", response_model=dict)
def read_inspection(inspection_id: str, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    data = InspectionOut.model_validate(inspection).model_dump()
    data["product"] = {
        "brand": inspection.product.brand if inspection.product else "",
        "product_name": inspection.product.product_name if inspection.product else "",
        "category": inspection.product.category if inspection.product else "",
        "barcode": inspection.product.barcode if inspection.product else "",
    }
    data["officer"] = {"id": inspection.officer.id, "name": inspection.officer.name}
    data["images"] = [
        {"id": i.id, "image_type": i.image_type, "status": i.status,
         "quality_score": i.quality_score, "quality_report": i.quality_report,
         "width": i.width, "height": i.height, "panel_bbox": i.panel_bbox,
         "url": f"/api/inspections/{inspection.id}/images/{i.id}/file"}
        for i in inspection.images
    ]
    return data


@router.patch("/{inspection_id}", response_model=InspectionOut)
def update_inspection(inspection_id: str, payload: InspectionUpdate, request: Request,
                      db: Session = Depends(get_db), user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status == "FINALIZED":
        raise HTTPException(409, "This inspection is finalised. Reopen it before making changes.")

    changes = payload.model_dump(exclude_unset=True)
    before = {k: getattr(inspection, k) for k in changes}
    for key, value in changes.items():
        setattr(inspection, key, value)
    audit_service.record(db, user_id=user.id, entity_type="inspection", entity_id=inspection.id,
                         action="UPDATE", old_value=before, new_value=changes,
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(inspection)
    return InspectionOut.model_validate(inspection)


@router.post("/{inspection_id}/images", response_model=dict, status_code=201)
async def upload_image(inspection_id: str, request: Request,
                       file: UploadFile = File(...), image_type: str = Form(default="front"),
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status not in EDITABLE_STATES:
        raise HTTPException(409, "Images can only be added while an inspection is open.")
    allowed_image_types = {"front", "back", "side", "top", "bottom", "listing", "principal"}
    if image_type not in allowed_image_types:
        raise HTTPException(422, f"image_type must be one of: {', '.join(sorted(allowed_image_types))}.")
    if file.content_type not in settings.upload_types:
        raise HTTPException(415, f"Upload a {', '.join(settings.upload_types)} image.")

    payload = await file.read()
    if len(payload) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Images must be under {settings.max_upload_mb} MB.")

    checksum = hashlib.sha256(payload).hexdigest()
    duplicate = db.query(Image).filter(Image.inspection_id == inspection.id,
                                       Image.checksum == checksum).first()
    if duplicate:
        raise HTTPException(409, "That exact image is already attached to this inspection.")

    folder = os.path.join(settings.storage_path, "originals", inspection.id)
    os.makedirs(folder, exist_ok=True)
    suffix = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    image = Image(inspection_id=inspection.id, image_type=image_type,
                  original_filename=file.filename or "", content_type=file.content_type,
                  size_bytes=len(payload), checksum=checksum, file_path="")
    db.add(image)
    db.flush()

    path = os.path.join(folder, f"{image.id}{suffix}")
    with open(path, "wb") as fh:          # the original is written once and never altered
        fh.write(payload)
    image.file_path = path

    try:
        from ai.preprocessing import image_ops
        loaded = image_ops.load_image(path)
        quality = image_ops.assess_quality(loaded)
        image.quality_score = quality.score
        image.quality_report = quality.as_dict()
        image.height, image.width = loaded.shape[0], loaded.shape[1]
        image.status = "READY" if quality.usable else "POOR_QUALITY"
    except Exception as exc:
        image.status = "QUALITY_CHECK_FAILED"
        image.quality_report = {"error": str(exc)}

    audit_service.record(db, user_id=user.id, entity_type="image", entity_id=image.id,
                         action="UPLOAD", new_value={"inspection_id": inspection.id,
                                                     "image_type": image_type},
                         ip_address=client_ip(request))
    db.commit()
    db.refresh(image)
    return {"id": image.id, "image_type": image.image_type, "status": image.status,
            "quality_score": image.quality_score, "quality_report": image.quality_report,
            "url": f"/api/inspections/{inspection.id}/images/{image.id}/file"}


@router.get("/{inspection_id}/images/{image_id}/file")
def read_image_file(inspection_id: str, image_id: str, processed: bool = False,
                    db: Session = Depends(get_db), user: User = Depends(current_user)):
    from fastapi.responses import FileResponse
    inspection = get_inspection(inspection_id, db, user)
    image = db.query(Image).filter(Image.id == image_id,
                                   Image.inspection_id == inspection.id).first()
    if not image:
        raise HTTPException(404, "That image is not part of this inspection.")
    path = image.processed_path if (processed and image.processed_path) else image.file_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "The stored image file is missing.")
    return FileResponse(path, media_type=image.content_type or "image/jpeg")


@router.delete("/{inspection_id}/images/{image_id}", status_code=204)
def delete_image(inspection_id: str, image_id: str, request: Request,
                 db: Session = Depends(get_db), user: User = Depends(current_user)):
    inspection = get_inspection(inspection_id, db, user)
    if inspection.status == "FINALIZED":
        raise HTTPException(409, "This inspection is finalised. Reopen it before removing images.")
    image = db.query(Image).filter(Image.id == image_id,
                                   Image.inspection_id == inspection.id).first()
    if not image:
        raise HTTPException(404, "That image is not part of this inspection.")
    audit_service.record(db, user_id=user.id, entity_type="image", entity_id=image.id,
                         action="DELETE", old_value={"file_path": image.file_path},
                         ip_address=client_ip(request))
    db.delete(image)
    db.commit()
