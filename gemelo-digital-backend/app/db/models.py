from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

#|----------------- Creación de tablas base ----------------------|

class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brightspace_user_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("org_unit_id", "brightspace_user_id", name="uq_enrollment_course_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    brightspace_user_id: Mapped[int] = mapped_column(Integer, index=True)
    role_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GradeItem(Base):
    __tablename__ = "grade_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    brightspace_grade_object_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    max_points: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    due_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    end_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    grade_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    associated_tool_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    associated_tool_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DropboxFolder(Base):
    __tablename__ = "dropbox_folders"
    __table_args__ = (
        UniqueConstraint("org_unit_id", "brightspace_folder_id", name="uq_dropbox_folder_course_folder"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    brightspace_folder_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    due_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    end_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    grade_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class OutcomeSet(Base):
    __tablename__ = "outcome_sets"
    __table_args__ = (
        UniqueConstraint("org_unit_id", "brightspace_outcome_set_id", name="uq_outcome_set_course_set"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    brightspace_outcome_set_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_type: Mapped[str] = mapped_column(String(100), index=True)
    org_unit_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class SyncState(Base):
    __tablename__ = "sync_state"
    __table_args__ = (
        UniqueConstraint("sync_type", "org_unit_id", name="uq_sync_state_type_course"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_type: Mapped[str] = mapped_column(String(100), index=True)
    org_unit_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    watermark: Mapped[str | None] = mapped_column(Text, nullable=True)


class SyncError(Base):
    __tablename__ = "sync_errors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    sync_type: Mapped[str] = mapped_column(String(100), index=True)
    org_unit_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
class CourseMetricHistory(Base):
    """Un snapshot diario de métricas agregadas del curso (tendencias)."""
    __tablename__ = "course_metric_history"
    __table_args__ = (
        UniqueConstraint("org_unit_id", "snapshot_date", name="uq_course_metric_history_course_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    snapshot_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    avg_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    at_risk_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_students: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class KnownUser(Base):
    """Usuario que ha iniciado sesión en G.D (persistente en Postgres).

    Reemplaza (con fallback) el JSON efímero known_users.json: el filesystem
    del contenedor ECS se borra en cada redeploy, esta tabla no.
    """
    __tablename__ = "known_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # "student" (solo in-app) | "staff" (recibe correo) — mismo criterio que user_registry
    audience: Mapped[str | None] = mapped_column(String(20), nullable=True)
    first_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    login_count: Mapped[int] = mapped_column(Integer, default=0)


class LoginEvent(Base):
    """Un registro por cada ingreso (login OAuth) a G.D — historial de uso."""
    __tablename__ = "login_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    logged_in_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class StudentCourseMetricSnapshot(Base):
    __tablename__ = "student_course_metric_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            "brightspace_user_id",
            name="uq_student_course_metric_snapshot_course_user",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_unit_id: Mapped[int] = mapped_column(Integer, index=True)
    brightspace_user_id: Mapped[int] = mapped_column(Integer, index=True)

    current_performance_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    coverage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)

    graded_items_count: Mapped[int] = mapped_column(Integer, default=0)
    total_items_count: Mapped[int] = mapped_column(Integer, default=0)

    not_submitted_weight_pct: Mapped[float] = mapped_column(Float, default=0.0)
    pending_submitted_weight_pct: Mapped[float] = mapped_column(Float, default=0.0)
    open_weight_pct: Mapped[float] = mapped_column(Float, default=0.0)

    overdue_count: Mapped[int] = mapped_column(Integer, default=0)
    pending_submitted_count: Mapped[int] = mapped_column(Integer, default=0)
    open_count: Mapped[int] = mapped_column(Integer, default=0)

    risk_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)