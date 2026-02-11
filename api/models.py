from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="worker")  # admin | worker
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=True)

    worker = relationship("Worker")


class Worker(Base):
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    status = Column(String, nullable=False, default="Activo")
    color = Column(String, nullable=False, default="#6c757d")
    visible_in_planner = Column(Boolean, nullable=False, default=True)
    tasks = relationship("Task", secondary="task_workers", back_populates="workers")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    contact = Column(String, nullable=True)
    address = Column(String, nullable=True)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_date = Column(String, nullable=False)
    title = Column(String, nullable=False)
    project = Column(String, nullable=False, default="")
    start_time = Column(String, nullable=False, default="")
    end_time = Column(String, nullable=True)
    prereq_eepp = Column(Integer, nullable=False, default=0)
    prereq_ppe = Column(String, nullable=False, default="")
    prereq_client_response = Column(Integer, nullable=False, default=0)
    prereq_coord_st = Column(Integer, nullable=False, default=0)
    prereq_notes = Column(Text, nullable=False, default="")
    worker_id = Column(Integer, ForeignKey("workers.id"), nullable=True)
    status = Column(String, nullable=False)
    priority = Column(String, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    worker = relationship("Worker")
    workers = relationship("Worker", secondary="task_workers", back_populates="tasks")
    logs = relationship("TaskLog", back_populates="task", cascade="all, delete-orphan")


class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    content = Column(Text, nullable=False)

    task = relationship("Task", back_populates="logs")
    user = relationship("User")


class TaskWorker(Base):
    __tablename__ = "task_workers"

    task_id = Column(Integer, ForeignKey("tasks.id"), primary_key=True)
    worker_id = Column(Integer, ForeignKey("workers.id"), primary_key=True)
