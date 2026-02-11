import os
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import auth, models, schemas
from .database import Base, engine, get_db


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Planificador API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth.decode_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")
    sub = payload.get("sub")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalido")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return user


def require_admin(user: models.User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin")
    return user


def user_can_access_task(user: models.User, task: models.Task) -> bool:
    return True


def task_to_schema(task: models.Task) -> schemas.TaskOut:
    workers = task.workers or []
    primary_worker = task.worker or (workers[0] if workers else None)
    return schemas.TaskOut(
        id=task.id,
        task_date=task.task_date,
        title=task.title,
        project=task.project,
        start_time=task.start_time,
        end_time=task.end_time,
        prereq_ppe=task.prereq_ppe,
        prereq_client_response=task.prereq_client_response,
        prereq_coord_st=task.prereq_coord_st,
        prereq_notes=task.prereq_notes,
        worker_id=task.worker_id,
        status=task.status,
        priority=task.priority,
        deleted_at=task.deleted_at,
        updated_at=task.updated_at,
        worker_name=primary_worker.name if primary_worker else None,
        worker_color=primary_worker.color if primary_worker else None,
        workers=workers,
    )


def add_task_log(db: Session, task_id: int, user: Optional[models.User], content: str):
    db.add(models.TaskLog(task_id=task_id, user_id=user.id if user else None, content=content))


def get_plannable_worker_or_400(db: Session, worker_id: Optional[int]):
    if not worker_id:
        return None
    worker = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=400, detail="Trabajador invalido")
    if not worker.visible_in_planner:
        raise HTTPException(status_code=400, detail="Trabajador no visible para planificacion")
    return worker


@app.on_event("startup")
def ensure_admin():
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_email or not admin_password:
        return
    db = next(get_db())
    try:
        exists = db.query(models.User).filter(models.User.email == admin_email).first()
        if not exists:
            user = models.User(
                email=admin_email,
                hashed_password=auth.get_password_hash(admin_password),
                role="admin",
            )
            db.add(user)
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
def ensure_schema_columns():
    if not engine.url.get_backend_name().startswith("sqlite"):
        return
    with engine.connect() as conn:
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS task_workers (
                task_id INTEGER NOT NULL,
                worker_id INTEGER NOT NULL,
                PRIMARY KEY (task_id, worker_id),
                FOREIGN KEY(task_id) REFERENCES tasks(id),
                FOREIGN KEY(worker_id) REFERENCES workers(id)
            )
            """
        )
        columns = conn.exec_driver_sql("PRAGMA table_info(task_logs)").fetchall()
        col_names = {row[1] for row in columns}
        if "user_id" not in col_names:
            conn.exec_driver_sql("ALTER TABLE task_logs ADD COLUMN user_id INTEGER")
        worker_columns = conn.exec_driver_sql("PRAGMA table_info(workers)").fetchall()
        worker_col_names = {row[1] for row in worker_columns}
        if "visible_in_planner" not in worker_col_names:
            conn.exec_driver_sql(
                "ALTER TABLE workers ADD COLUMN visible_in_planner INTEGER NOT NULL DEFAULT 1"
            )
        conn.exec_driver_sql(
            """
            INSERT INTO task_workers (task_id, worker_id)
            SELECT id, worker_id FROM tasks
            WHERE worker_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM task_workers
                WHERE task_workers.task_id = tasks.id
                AND task_workers.worker_id = tasks.worker_id
            )
            """
        )


@app.post("/auth/login", response_model=schemas.Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form.username).first()
    if not user or not auth.verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")
    token = auth.create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.Token(access_token=token)


@app.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@app.get("/me/worker", response_model=Optional[schemas.WorkerOut])
def me_worker(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if not user.worker_id:
        return None
    worker = db.query(models.Worker).filter(models.Worker.id == user.worker_id).first()
    return worker


@app.patch("/me/password")
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not auth.verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Password actual incorrecta")
    user.hashed_password = auth.get_password_hash(payload.new_password)
    db.commit()
    return {"ok": True}


@app.post("/users", response_model=schemas.UserOut)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email ya existe")
    user = models.User(
        email=payload.email,
        hashed_password=auth.get_password_hash(payload.password),
        role=payload.role,
        worker_id=payload.worker_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.User).order_by(models.User.id.desc()).all()


@app.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No encontrado")
    if payload.email and payload.email != user.email:
        if db.query(models.User).filter(models.User.email == payload.email).first():
            raise HTTPException(status_code=400, detail="Email ya existe")
        user.email = payload.email
    if payload.role:
        user.role = payload.role
    if payload.worker_id is not None:
        user.worker_id = payload.worker_id
    if payload.password:
        user.hashed_password = auth.get_password_hash(payload.password)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: models.User = Depends(require_admin),
):
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="No se puede eliminar el usuario actual")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(user)
    db.commit()
    return {"ok": True}


@app.get("/workers", response_model=List[schemas.WorkerOut])
def list_workers(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.Worker).order_by(models.Worker.name.asc()).all()


@app.post("/workers", response_model=schemas.WorkerOut)
def create_worker(payload: schemas.WorkerBase, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    worker = models.Worker(
        name=payload.name,
        status=payload.status,
        color=payload.color,
        visible_in_planner=payload.visible_in_planner,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@app.put("/workers/{worker_id}", response_model=schemas.WorkerOut)
def update_worker(worker_id: int, payload: schemas.WorkerBase, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    worker = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="No encontrado")
    worker.name = payload.name
    worker.status = payload.status
    worker.color = payload.color
    worker.visible_in_planner = payload.visible_in_planner
    db.commit()
    db.refresh(worker)
    return worker


@app.delete("/workers/{worker_id}")
def delete_worker(worker_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    worker = db.query(models.Worker).filter(models.Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.query(models.Task).filter(models.Task.worker_id == worker_id).update({models.Task.worker_id: None})
    db.query(models.TaskWorker).filter(models.TaskWorker.worker_id == worker_id).delete()
    db.delete(worker)
    db.commit()
    return {"ok": True}


@app.get("/projects", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return db.query(models.Project).order_by(models.Project.name.asc()).all()


@app.post("/projects", response_model=schemas.ProjectOut)
def create_project(payload: schemas.ProjectBase, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = models.Project(name=payload.name, contact=payload.contact, address=payload.address)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.put("/projects/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, payload: schemas.ProjectBase, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="No encontrado")
    project.name = payload.name
    project.contact = payload.contact
    project.address = payload.address
    db.commit()
    db.refresh(project)
    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="No encontrado")
    db.delete(project)
    db.commit()
    return {"ok": True}


@app.get("/tasks", response_model=List[schemas.TaskOut])
def list_tasks(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.Task).outerjoin(models.Worker)
    if start_date and end_date:
        query = query.filter(models.Task.task_date.between(start_date, end_date))
    if not include_deleted:
        query = query.filter(models.Task.deleted_at.is_(None))
    tasks = query.order_by(models.Task.updated_at.desc(), models.Task.id.desc()).all()
    return [task_to_schema(t) for t in tasks]


@app.get("/tasks/history", response_model=List[schemas.TaskOut])
def tasks_history(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    tasks = db.query(models.Task).outerjoin(models.Worker).order_by(
        models.Task.updated_at.desc(), models.Task.id.desc()
    ).all()
    return [task_to_schema(t) for t in tasks]


@app.post("/tasks", response_model=schemas.TaskOut)
def create_task(payload: schemas.TaskCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    user = _
    get_plannable_worker_or_400(db, payload.worker_id)
    task = models.Task(
        task_date=payload.task_date,
        title=payload.title,
        project=payload.project or "",
        start_time=payload.start_time or "",
        end_time=payload.end_time,
        prereq_ppe=payload.prereq_ppe or "",
        prereq_client_response=payload.prereq_client_response,
        prereq_coord_st=payload.prereq_coord_st,
        prereq_notes=payload.prereq_notes or "",
        worker_id=payload.worker_id,
        status=payload.status,
        priority=payload.priority,
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    if payload.worker_id:
        db.add(models.TaskWorker(task_id=task.id, worker_id=payload.worker_id))
    add_task_log(db, task.id, user, "Tarea creada")
    db.commit()
    db.refresh(task)
    return task_to_schema(task)


@app.put("/tasks/{task_id}", response_model=schemas.TaskOut)
def update_task(task_id: int, payload: schemas.TaskUpdate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    user = _
    get_plannable_worker_or_400(db, payload.worker_id)
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    changes = []
    for field, value in payload.dict().items():
        old = getattr(task, field)
        if old != value:
            changes.append(field)
        setattr(task, field, value)
    if payload.worker_id:
        exists = db.query(models.TaskWorker).filter(
            models.TaskWorker.task_id == task_id, models.TaskWorker.worker_id == payload.worker_id
        ).first()
        if not exists:
            db.add(models.TaskWorker(task_id=task_id, worker_id=payload.worker_id))
    task.updated_at = datetime.utcnow()
    if changes:
        add_task_log(db, task_id, user, f"Tarea actualizada: {', '.join(changes)}")
    db.commit()
    db.refresh(task)
    return task_to_schema(task)


@app.put("/tasks/{task_id}/workers", response_model=schemas.TaskOut)
def assign_workers(task_id: int, payload: schemas.TaskAssign, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    user = _
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    worker_ids = list(dict.fromkeys(payload.worker_ids))
    if worker_ids:
        existing = db.query(models.Worker.id).filter(
            models.Worker.id.in_(worker_ids),
            models.Worker.visible_in_planner.is_(True),
        ).all()
        existing_ids = {row[0] for row in existing}
        if len(existing_ids) != len(worker_ids):
            raise HTTPException(status_code=400, detail="Trabajador invalido")
    db.query(models.TaskWorker).filter(models.TaskWorker.task_id == task_id).delete()
    for wid in worker_ids:
        db.add(models.TaskWorker(task_id=task_id, worker_id=wid))
    task.worker_id = worker_ids[0] if worker_ids else None
    task.updated_at = datetime.utcnow()
    names = []
    if worker_ids:
        names = [w.name for w in db.query(models.Worker).filter(models.Worker.id.in_(worker_ids)).all()]
    add_task_log(db, task_id, user, f"Asignados: {', '.join(names) if names else 'Sin asignar'}")
    db.commit()
    db.refresh(task)
    return task_to_schema(task)


@app.patch("/tasks/{task_id}/status")
def update_status(task_id: int, status_value: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    if not user_can_access_task(user, task):
        raise HTTPException(status_code=403, detail="Sin permiso")
    task.status = status_value
    task.updated_at = datetime.utcnow()
    add_task_log(db, task_id, user, f"Estado cambiado a {status_value}")
    db.commit()
    return {"ok": True}


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, reason: str, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    user = _
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    task.deleted_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    add_task_log(db, task_id, user, f"Tarea eliminada. Motivo: {reason}")
    db.commit()
    return {"ok": True}


@app.get("/tasks/{task_id}/logs", response_model=List[schemas.TaskLogOut])
def list_logs(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    if not user_can_access_task(user, task):
        raise HTTPException(status_code=403, detail="Sin permiso")
    logs = db.query(models.TaskLog).filter(models.TaskLog.task_id == task_id).order_by(models.TaskLog.id.desc()).all()
    result = []
    for log in logs:
        result.append(
            schemas.TaskLogOut(
                id=log.id,
                created_at=log.created_at,
                content=log.content,
                user_id=log.user_id,
                user_email=log.user.email if log.user else None,
                user_role=log.user.role if log.user else None,
            )
        )
    return result


@app.post("/tasks/{task_id}/logs", response_model=schemas.TaskLogOut)
def add_log(task_id: int, payload: schemas.TaskLogCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="No encontrado")
    if not user_can_access_task(user, task):
        raise HTTPException(status_code=403, detail="Sin permiso")
    log = models.TaskLog(task_id=task_id, user_id=user.id, content=payload.content)
    db.add(log)
    db.commit()
    db.refresh(log)
    return schemas.TaskLogOut(
        id=log.id,
        created_at=log.created_at,
        content=log.content,
        user_id=log.user_id,
        user_email=user.email,
        user_role=user.role,
    )
