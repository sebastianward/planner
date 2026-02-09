import sys

from sqlalchemy.orm import Session

from . import auth, models
from .database import SessionLocal, engine


def main():
    if len(sys.argv) < 4:
        print("Uso: python -m api.create_user <email> <password> <role> [worker_id]")
        return 1
    email = sys.argv[1]
    password = sys.argv[2]
    role = sys.argv[3]
    worker_id = int(sys.argv[4]) if len(sys.argv) > 4 else None

    models.Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        exists = db.query(models.User).filter(models.User.email == email).first()
        if exists:
            print("Usuario ya existe")
            return 1
        user = models.User(
            email=email,
            hashed_password=auth.get_password_hash(password),
            role=role,
            worker_id=worker_id,
        )
        db.add(user)
        db.commit()
        print("Usuario creado")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
