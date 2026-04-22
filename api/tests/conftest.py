"""Pytest configuration and shared fixtures for the inventory test suite."""
import os
import pytest
from datetime import datetime
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Set required environment variables BEFORE any app imports
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-not-for-production")
os.environ.setdefault("BACKUP_DIR", "/tmp/test-backups")

from app.models import Base, CardColor, CardMaterial, Role, ShoeStatus, User  # noqa: E402


@pytest.fixture(scope="session")
def engine():
    """Create a shared in-memory SQLite engine for the test session."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
    )
    # SQLite does not enforce foreign keys by default; enable for correctness
    @event.listens_for(eng, "connect")
    def set_sqlite_pragma(dbapi_con, _con_rec):
        cursor = dbapi_con.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture()
def db(engine):
    """Provide a transactional database session that rolls back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def admin_user(db):
    """Create and return a test admin user."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    user = User(
        username="test_admin",
        email="admin@test.com",
        passwordHash=pwd_context.hash("password"),
        role=Role.ADMIN,
        createdAt=datetime.utcnow(),
        updatedAt=datetime.utcnow(),
    )
    db.add(user)
    db.flush()
    return user
