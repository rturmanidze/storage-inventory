#!/usr/bin/env python3
"""Seed the database with a default admin user."""
import os
import sys

from passlib.context import CryptContext
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Role, User

DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main():
    db = Session()
    try:
        existing = db.query(User).filter(User.username == "admin").first()
        if existing:
            print("Seed already applied: admin user exists")
            return
        admin = User(
            username="admin",
            email="admin@inventory.local",
            passwordHash=pwd_context.hash("admin123"),
            role=Role.ADMIN,
        )
        db.add(admin)
        db.commit()
        print("Seed completed: admin user created")
    except Exception as e:
        print(f"Seed failed (non-fatal): {e}", file=sys.stderr)
    finally:
        db.close()


if __name__ == "__main__":
    main()
