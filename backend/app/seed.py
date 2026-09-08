"""Seed users and load the rule pack into the database.

Run once after the database is up:  python -m app.seed
"""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Rule, RuleVersion, User

DEMO_USERS = [
    ("Asha Rao", "officer@metriscan.local", "OFFICER", "Enforcement Officer", "Hyderabad Urban"),
    ("Vikram Nair", "reviewer@metriscan.local", "REVIEWER", "Senior Inspector", "Telangana"),
    ("Priya Menon", "admin@metriscan.local", "ADMIN", "Controller", "Telangana"),
]
DEMO_PASSWORD = os.environ.get("SEED_PASSWORD", "MetriScan#2026")


def seed_users(db) -> None:
    for name, email, role, designation, jurisdiction in DEMO_USERS:
        if db.query(User).filter(User.email == email).first():
            continue
        db.add(User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD),
                    role=role, designation=designation, jurisdiction=jurisdiction))
        print(f"  created {role:9s} {email}")


def seed_rules(db) -> None:
    with open(settings.rules_path, "r", encoding="utf-8") as fh:
        pack = json.load(fh)

    for raw in pack.get("rules", []):
        rule = db.query(Rule).filter(Rule.code == raw["code"]).first()
        if rule is None:
            rule = Rule(code=raw["code"], title=raw["title"],
                        description=raw.get("description", ""),
                        category=raw.get("category", "declaration"),
                        requirement_type=raw.get("requirement_type", "presence"),
                        field=raw.get("field"), severity=raw.get("severity", "MAJOR"),
                        applicability=raw.get("applicability", {}))
            db.add(rule)
            db.flush()
            print(f"  created rule {rule.code}")

        for v in raw.get("versions", []):
            exists = db.query(RuleVersion).filter(
                RuleVersion.rule_id == rule.id, RuleVersion.version == v["version"]).first()
            if exists:
                continue
            db.add(RuleVersion(
                rule_id=rule.id, version=v["version"],
                effective_from=v.get("effective_from"), effective_to=v.get("effective_to"),
                definition=v.get("definition", {}),
                source_reference=v.get("source_reference", ""),
                verification_status=v.get("verification_status", "UNVERIFIED"),
                active=bool(v.get("active", True)),
            ))
            print(f"    + {rule.code} v{v['version']} [{v.get('verification_status')}]")


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("Seeding users:")
        seed_users(db)
        print("Seeding rules:")
        seed_rules(db)
        db.commit()

        unverified = db.query(RuleVersion).filter(
            RuleVersion.verification_status != "VERIFIED", RuleVersion.active.is_(True)).count()
        print(f"\nDone. Demo password: {DEMO_PASSWORD}")
        if unverified:
            print(f"WARNING: {unverified} rule version(s) are UNVERIFIED. Check each against the "
                  "current gazette text and mark it verified before demoing a finalised report.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
