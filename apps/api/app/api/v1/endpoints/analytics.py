from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from smart_city_database import models
from smart_city_shared.schemas import (
    SensorReadingHistory,
    ExportResponse,
    AggregateResponse,
    CorrelationMatrix,
    CorrelationPair,
)

from smart_city_shared.enums import SubscriptionPlan
from ....core.dependencies import get_current_user, get_db, track_usage
from fastapi import status as fastapi_status

router = APIRouter()


@router.get("/sensors/{sensor_id}/history", response_model=list[SensorReadingHistory])
async def get_analytics_history(
    sensor_id: str,
    metric_key: str | None = Query(None),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_join = select(models.MetricDefinition.id, models.MetricDefinition.key).subquery()
    query = select(
        models.SensorReading.time,
        metric_join.c.key,
        models.SensorReading.value_numeric,
        models.SensorReading.value_text,
        models.SensorReading.quality_flag,
    ).join(
        metric_join,
        models.SensorReading.metric_id == metric_join.c.id,
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.time >= from_date,
        models.SensorReading.time <= to_date,
    )

    if metric_key:
        query = query.where(metric_join.c.key == metric_key)

    query = query.order_by(models.SensorReading.time.desc())
    query = query.limit(10000)

    result = await db.execute(query)
    rows = result.all()
    return [
        SensorReadingHistory(
            time=row.time,
            metric_key=row.key,
            value_numeric=row.value_numeric,
            value_text=row.value_text,
            quality_flag=row.quality_flag,
        )
        for row in rows
    ]


@router.get("/export", response_model=ExportResponse)
async def export_data(
    sensor_id: str = Query(...),
    metric_key: str = Query(...),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_subq = select(models.MetricDefinition.id).where(
        models.MetricDefinition.key == metric_key
    ).scalar_subquery()

    query = select(
        models.SensorReading.time,
        models.SensorReading.value_numeric,
        models.SensorReading.value_text,
        models.SensorReading.quality_flag,
    ).where(
        models.SensorReading.sensor_id == sensor_id,
        models.SensorReading.metric_id == metric_subq,
        models.SensorReading.time >= from_date,
        models.SensorReading.time <= to_date,
    ).order_by(models.SensorReading.time.asc())

    result = await db.execute(query)
    rows = result.all()

    data = [
        {
            "time": row.time.isoformat(),
            "value_numeric": row.value_numeric,
            "value_text": row.value_text,
            "quality_flag": row.quality_flag,
        }
        for row in rows
    ]

    if format == "csv":
        csv_lines = ["time,value_numeric,value_text,quality_flag"]
        for row in data:
            csv_lines.append(
                f"{row['time']},{row['value_numeric']},{row['value_text'] or ''},{row['quality_flag']}"
            )
        return ExportResponse(
            sensor_id=sensor_id,
            metric_key=metric_key,
            from_date=from_date,
            to_date=to_date,
            data=csv_lines,
            format="csv",
        )

    return ExportResponse(
        sensor_id=sensor_id,
        metric_key=metric_key,
        from_date=from_date,
        to_date=to_date,
        data=data,
        format="json",
    )


@router.get("/aggregate", response_model=list[AggregateResponse])
async def aggregate_data(
    sensor_id: str = Query(...),
    metric_keys: str = Query(None, alias="metrics"),
    from_date: datetime = Query(default=None, alias="from"),
    to_date: datetime = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(track_usage),
):
    if current_user["plan"] not in (SubscriptionPlan.PRO, SubscriptionPlan.ENTERPRISE):
        raise HTTPException(status_code=fastapi_status.HTTP_403_FORBIDDEN, detail="Paid subscription required")
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_date:
        to_date = datetime.now(timezone.utc)

    metric_query = select(models.MetricDefinition)
    if metric_keys:
        keys_list = [k.strip() for k in metric_keys.split(",")]
        metric_query = metric_query.where(models.MetricDefinition.key.in_(keys_list))

    metrics = await db.execute(metric_query)
    metric_defs = metrics.scalars().all()

    results = []
    for md in metric_defs:
        agg_query = select(
            sa_func.avg(models.SensorReading.value_numeric),
            sa_func.min(models.SensorReading.value_numeric),
            sa_func.max(models.SensorReading.value_numeric),
            sa_func.count(models.SensorReading.value_numeric),
        ).where(
            models.SensorReading.sensor_id == sensor_id,
            models.SensorReading.metric_id == md.id,
            models.SensorReading.time >= from_date,
            models.SensorReading.time <= to_date,
        )
        agg_result = await db.execute(agg_query)
        row = agg_result.one()

        results.append(
            AggregateResponse(
                metric_key=md.key,
                sensor_id=sensor_id,
                avg=round(row[0], 2) if row[0] is not None else None,
                min=round(row[1], 2) if row[1] is not None else None,
                max=round(row[2], 2) if row[2] is not None else None,
                count=row[3] or 0,
                from_date=from_date,
                to_date=to_date,
            )
        )

    return results


@router.get("/correlations", response_model=CorrelationMatrix)
async def get_correlations(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    metric_defs = await db.execute(
        select(models.MetricDefinition).where(models.MetricDefinition.is_active == True)
    )
    all_metrics = metric_defs.scalars().all()
    if len(all_metrics) < 2:
        return CorrelationMatrix(metrics=[m.key for m in all_metrics], pairs=[])

    metric_keys = [m.key for m in all_metrics]
    metric_id_map = {m.id: m.key for m in all_metrics}
    metric_ids = list(metric_id_map.keys())

    bucket = sa_func.date_trunc("hour", models.SensorReading.time)
    hourly = await db.execute(
        select(
            models.SensorReading.metric_id,
            bucket.label("bucket"),
            sa_func.avg(models.SensorReading.value_numeric).label("avg_val"),
        ).where(
            models.SensorReading.time >= since,
            models.SensorReading.metric_id.in_(metric_ids),
            models.SensorReading.value_numeric.isnot(None),
        ).group_by(
            models.SensorReading.metric_id,
            bucket,
        ).order_by(
            models.SensorReading.metric_id,
            bucket,
        )
    )
    rows = hourly.all()

    raw: dict[str, dict[datetime, float]] = {}
    for row in rows:
        key = metric_id_map.get(row.metric_id, "")
        if not key:
            continue
        raw.setdefault(key, {})
        raw[key][row.bucket] = float(row.avg_val)

    keys_with_data = [k for k in metric_keys if k in raw]
    if len(keys_with_data) < 2:
        return CorrelationMatrix(metrics=metric_keys, pairs=[])

    pairs: list[CorrelationPair] = []
    for i in range(len(keys_with_data)):
        for j in range(i + 1, len(keys_with_data)):
            a, b = keys_with_data[i], keys_with_data[j]
            shared_buckets = sorted(set(raw[a].keys()) & set(raw[b].keys()))
            if len(shared_buckets) < 100:
                continue
            series_a = [raw[a][bucket] for bucket in shared_buckets]
            series_b = [raw[b][bucket] for bucket in shared_buckets]
            corr = _pearson(series_a, series_b)
            pairs.append(CorrelationPair(metric_a=a, metric_b=b, correlation=round(corr, 4)))

    pairs.sort(key=lambda p: abs(p.correlation), reverse=True)
    return CorrelationMatrix(metrics=metric_keys, pairs=pairs)


def _pearson(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n < 3:
        return 0.0
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(a * b for a, b in zip(x, y))
    sum_x2 = sum(a * a for a in x)
    sum_y2 = sum(b * b for b in y)
    num = n * sum_xy - sum_x * sum_y
    den = ((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y)) ** 0.5
    if den == 0:
        return 0.0
    r = num / den
    return max(-1.0, min(1.0, r))
