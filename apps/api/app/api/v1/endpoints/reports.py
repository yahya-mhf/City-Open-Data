import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.constants import ALLOWED_MIME_TYPES, MAX_FILE_SIZE_MB
from smart_city_shared.schemas import ReportCreate, ReportRead, ReportStatusUpdate
from ....core.dependencies import get_db, get_current_user, require_operator

from ....core.minio_client import minio_manager

router = APIRouter()

MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
async def create_report(
    category: str = Form(...),
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    image_url = None
    if image:
        if image.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")
        contents = await image.read()
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large")
        object_name = f"reports/{current_user['id']}/{uuid.uuid4()}_{image.filename}"
        image_url = minio_manager.upload_file(
            object_name, BytesIO(contents), image.content_type
        )

    report = models.CitizenReport(
        user_id=current_user["id"],
        category=category,
        description=description,
        latitude=latitude,
        longitude=longitude,
        image_url=image_url,
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


@router.get("/me", response_model=list[ReportRead])
async def get_my_reports(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(models.CitizenReport)
        .where(models.CitizenReport.user_id == current_user["id"])
        .order_by(models.CitizenReport.created_at.desc())
    )
    return result.scalars().all()


@router.get("/public", response_model=list[ReportRead])
async def list_public_reports(
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(models.CitizenReport).order_by(models.CitizenReport.created_at.desc())
    if category:
        query = query.where(models.CitizenReport.category == category)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("", response_model=list[ReportRead])
async def list_all_reports(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_operator),
):
    query = select(models.CitizenReport).order_by(models.CitizenReport.created_at.desc())
    if status_filter:
        query = query.where(models.CitizenReport.status == status_filter)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{report_id}", response_model=ReportRead)
async def update_report_status(
    report_id: uuid.UUID,
    body: ReportStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_operator),
):
    result = await db.execute(
        select(models.CitizenReport).where(models.CitizenReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    report.status = body.status
    await db.flush()
    await db.refresh(report)
    return report
