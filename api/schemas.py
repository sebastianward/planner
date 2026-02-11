from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel


class UserBase(BaseModel):
    email: str
    role: str
    worker_id: Optional[int] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    worker_id: Optional[int] = None
    password: Optional[str] = None


class UserOut(UserBase):
    id: int

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class WorkerBase(BaseModel):
    name: str
    status: str = "Activo"
    color: str = "#6c757d"
    visible_in_planner: bool = True


class WorkerOut(WorkerBase):
    id: int

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    name: str
    contact: Optional[str] = None
    address: Optional[str] = None


class ProjectOut(ProjectBase):
    id: int

    class Config:
        from_attributes = True


class TaskBase(BaseModel):
    task_date: str
    title: str
    project: str = ""
    start_time: str = ""
    end_time: Optional[str] = None
    prereq_ppe: str = ""
    prereq_client_response: int = 0
    prereq_coord_st: int = 0
    prereq_notes: str = ""
    worker_id: Optional[int] = None
    status: str
    priority: str


class TaskCreate(TaskBase):
    pass


class TaskUpdate(TaskBase):
    pass


class TaskOut(TaskBase):
    id: int
    deleted_at: Optional[datetime] = None
    updated_at: datetime
    worker_name: Optional[str] = None
    worker_color: Optional[str] = None
    workers: List[WorkerOut] = []

    class Config:
        from_attributes = True


class TaskLogCreate(BaseModel):
    content: str


class TaskLogOut(BaseModel):
    id: int
    created_at: datetime
    content: str
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None

    class Config:
        from_attributes = True


class TaskAssign(BaseModel):
    worker_ids: List[int]
