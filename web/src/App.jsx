import React, { useEffect, useMemo, useState } from "react";
import { api, setToken, getToken, clearToken } from "./api.js";

const dayNamesShort = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function Login({ onLogged }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await api.login(email, password);
      setToken(res.access_token);
      onLogged();
    } catch (err) {
      setError("Credenciales invalidas");
    }
  }

  return (
    <div className="login">
      <form onSubmit={handleSubmit}>
        <h2>Planificador</h2>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error">{error}</div>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}

function Modal({ title, open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("tasks");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [dragOverDate, setDragOverDate] = useState(null);
  const [showTaskMoveModal, setShowTaskMoveModal] = useState(false);
  const [taskMoveDraft, setTaskMoveDraft] = useState(null);

  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logTaskId, setLogTaskId] = useState(null);
  const [logInput, setLogInput] = useState("");

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedDayTaskId, setSelectedDayTaskId] = useState(null);
  const [taskDraft, setTaskDraft] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTask, setAssignTask] = useState(null);
  const [assignWorkerIds, setAssignWorkerIds] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [taskMenuId, setTaskMenuId] = useState(null);
  const [maintainerTab, setMaintainerTab] = useState("workers");
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [profileWorker, setProfileWorker] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!getToken()) return;
    api.me().then(setUser).catch(() => clearToken());
  }, []);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      api.workers().then(setWorkers);
      api.projects().then(setProjects);
      api.users().then(setUsersList);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) return;
    if (tab === "history" && isAdmin) {
      api.history().then(setHistory);
      return;
    }
    const start = startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    api.tasks({ start_date: formatDate(start), end_date: formatDate(end) }).then(setTasks);
  }, [user, tab, currentDate, isAdmin]);

  useEffect(() => {
    if (!user) return;
    if (tab === "profile") {
      api.meWorker().then(setProfileWorker).catch(() => setProfileWorker(null));
    }
  }, [user, tab]);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      map[t.task_date] = map[t.task_date] || [];
      map[t.task_date].push(t);
    });
    return map;
  }, [tasks]);
  const plannableWorkers = useMemo(
    () => workers.filter((w) => w.visible_in_planner !== false),
    [workers]
  );
  const plannableWorkerIds = useMemo(
    () => new Set(plannableWorkers.map((w) => w.id)),
    [plannableWorkers]
  );

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  async function openLogs(taskId, showModal = true) {
    const data = await api.logs(taskId);
    setLogs(data);
    setSelectedTask(taskId);
    setLogTaskId(taskId);
    if (showModal) setShowLogsModal(true);
  }

  async function addLog(taskId, content) {
    await api.addLog(taskId, content);
    openLogs(taskId);
  }

  async function createTask(payload) {
    await api.createTask(payload);
    setShowTaskModal(false);
    setTaskDraft(null);
    window.alert("Tarea creada exitosamente");
    await reloadTasks();
  }

  async function reloadTasks() {
    const start = startOfWeek(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 41);
    const data = await api.tasks({ start_date: formatDate(start), end_date: formatDate(end) });
    setTasks(data);
  }

  async function saveWorker(payload) {
    if (editingWorker) {
      await api.updateWorker(editingWorker.id, payload);
    } else {
      await api.createWorker(payload);
    }
    setShowWorkerModal(false);
    setEditingWorker(null);
    api.workers().then(setWorkers);
  }

  async function reloadUsers() {
    if (!isAdmin) return;
    const data = await api.users();
    setUsersList(data);
  }

  function mapTaskToPayload(task, taskDateOverride = null) {
    return {
      task_date: taskDateOverride || task.task_date,
      title: task.title || "",
      project: task.project || "",
      start_time: task.start_time || "",
      end_time: task.end_time || "",
      prereq_ppe: task.prereq_ppe || "",
      prereq_client_response: task.prereq_client_response || 0,
      prereq_coord_st: task.prereq_coord_st || 0,
      prereq_notes: task.prereq_notes || "",
      worker_id: task.worker_id || null,
      status: task.status || "Pendiente",
      priority: task.priority || "Media",
    };
  }

  function handleWorkerDragStart(event, worker) {
    event.dataTransfer.setData("application/x-worker-id", String(worker.id));
    event.dataTransfer.setData("text/plain", worker.name);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleTaskDragStart(event, task, sourceDate) {
    if (!isAdmin) return;
    event.dataTransfer.setData("application/x-task-id", String(task.id));
    event.dataTransfer.setData("application/x-task-source-date", sourceDate || task.task_date);
    // Keep a standard MIME payload for broader browser compatibility during DnD.
    event.dataTransfer.setData("text/plain", String(task.id));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleCellDragOver(event, dateKey) {
    event.preventDefault();
    const types = Array.from(event.dataTransfer?.types || []);
    const hasTaskPayload = types.includes("application/x-task-id");
    event.dataTransfer.dropEffect = hasTaskPayload ? "move" : "copy";
    setDragOverDate(dateKey);
  }

  function handleCellDragLeave(dateKey) {
    if (dragOverDate === dateKey) {
      setDragOverDate(null);
    }
  }

  async function handleCellDrop(event, dateKey) {
    event.preventDefault();
    setDragOverDate(null);

    const taskIdRaw = event.dataTransfer.getData("application/x-task-id");
    if (taskIdRaw && isAdmin) {
      const taskId = Number(taskIdRaw);
      const sourceDateRaw = event.dataTransfer.getData("application/x-task-source-date");
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const sourceDate = sourceDateRaw || task.task_date;
      if (sourceDate === dateKey) return;
      setTaskMoveDraft({
        task,
        sourceDate,
        targetDate: dateKey,
        mode: "move",
        reason: "",
      });
      setSelectedDate(dateKey);
      setShowTaskMoveModal(true);
      return;
    }

    const workerIdRaw = event.dataTransfer.getData("application/x-worker-id");
    if (!workerIdRaw) return;
    const workerId = Number(workerIdRaw);
    setSelectedDate(dateKey);
    setTaskDraft({
      task_date: dateKey,
      project: "",
      start_time: "",
      end_time: "",
      prereq_tools: 0,
      prereq_shoes: 0,
      prereq_vest: 0,
      prereq_helmet: 0,
      prereq_client_response: 0,
      prereq_coord_st: 0,
      prereq_notes: "",
      worker_id: workerId,
      status: "Pendiente",
      priority: "Media",
    });
    setShowTaskModal(true);
  }

  async function updateStatus(taskId, statusValue) {
    await api.updateStatus(taskId, statusValue);
    await reloadTasks();
  }

  function mapTaskToForm(task) {
    const ppe = (task.prereq_ppe || "").split(",").map((v) => v.trim()).filter(Boolean);
    return {
      task_date: task.task_date,
      title: task.title || "",
      project: task.project || "",
      start_time: task.start_time || "",
      end_time: task.end_time || "",
      prereq_tools: ppe.includes("herramientas") ? 1 : 0,
      prereq_shoes: ppe.includes("zapatos") ? 1 : 0,
      prereq_vest: ppe.includes("chaleco") ? 1 : 0,
      prereq_helmet: ppe.includes("casco") ? 1 : 0,
      prereq_client_response: task.prereq_client_response || 0,
      prereq_coord_st: task.prereq_coord_st || 0,
      prereq_notes: task.prereq_notes || "",
      worker_id: task.worker_id || "",
      status: task.status || "Pendiente",
      priority: task.priority || "Media",
    };
  }

  function openDetail(task) {
    setDetailTask(task);
    setShowDetailModal(true);
    openLogs(task.id, false);
  }

  async function updateTask(taskId, payload) {
    await api.updateTask(taskId, payload);
    setShowDetailModal(false);
    setDetailTask(null);
    await reloadTasks();
  }

  async function deleteTask(task) {
    const reason = window.prompt("Motivo de la eliminacion?");
    if (!reason || !reason.trim()) return;
    await api.deleteTask(task.id, reason.trim());
    setTaskMenuId(null);
    await reloadTasks();
  }

  function openAssign(task) {
    setAssignTask(task);
    const initialIds = task.workers?.length
      ? task.workers.map((w) => w.id).filter((id) => plannableWorkerIds.has(id))
      : (task.worker_id && plannableWorkerIds.has(task.worker_id) ? [task.worker_id] : []);
    setAssignWorkerIds(initialIds);
    setShowAssignModal(true);
  }

  async function saveAssign() {
    if (!assignTask) return;
    await api.assignWorkers(assignTask.id, assignWorkerIds);
    setShowAssignModal(false);
    setAssignTask(null);
    await reloadTasks();
  }

  function closeTaskMoveModal() {
    setShowTaskMoveModal(false);
    setTaskMoveDraft(null);
  }

  async function confirmTaskMoveAction() {
    if (!taskMoveDraft) return;
    const { task, sourceDate, targetDate, mode, reason } = taskMoveDraft;
    if (mode === "move" && !reason.trim()) {
      window.alert("Debes indicar una causa para mover la tarea.");
      return;
    }

    if (mode === "move") {
      await api.updateTask(task.id, mapTaskToPayload(task, targetDate));
      await api.addLog(task.id, `Tarea movida de ${sourceDate} a ${targetDate}. Motivo: ${reason.trim()}`);
    } else {
      const copiedTask = await api.createTask(mapTaskToPayload(task, targetDate));
      const workerIds = task.workers?.length
        ? task.workers.map((w) => w.id).filter((id) => plannableWorkerIds.has(id))
        : (task.worker_id && plannableWorkerIds.has(task.worker_id) ? [task.worker_id] : []);
      if (workerIds.length > 0) {
        await api.assignWorkers(copiedTask.id, workerIds);
      }
      await api.addLog(copiedTask.id, `Tarea copiada desde #${task.id} (${sourceDate} -> ${targetDate})`);
    }

    closeTaskMoveModal();
    await reloadTasks();
  }

  async function saveUser(payload) {
    if (editingUser) {
      await api.updateUser(editingUser.id, payload);
    } else {
      await api.createUser(payload);
    }
    setShowUserModal(false);
    setEditingUser(null);
    await reloadUsers();
  }

  async function removeUser(userId) {
    if (!window.confirm("Eliminar este usuario?")) return;
    await api.deleteUser(userId);
    await reloadUsers();
  }

  if (!user) return <Login onLogged={() => api.me().then(setUser)} />;

  const grid = monthGrid(currentDate);
  const todayKey = formatDate(new Date());
  const selectedTasks = tasksByDate[selectedDate] || [];

  return (
    <div className="app">
      <aside className="sidebar" onClick={() => setTaskMenuId(null)}>
        <div className="brand">Planificador</div>
        <nav>
          <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>Tareas</button>
          {isAdmin && (
            <>
              <button className={tab === "maintainers" ? "active" : ""} onClick={() => setTab("maintainers")}>Mantenedores</button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Historial</button>
            </>
          )}
          <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Perfil</button>
        </nav>
        {isAdmin && tab === "tasks" && (
          <button
            onClick={() => {
              setTaskDraft({
                task_date: selectedDate,
                title: "",
                project: "",
                start_time: "",
                end_time: "",
                prereq_tools: 0,
                prereq_shoes: 0,
                prereq_vest: 0,
                prereq_helmet: 0,
                prereq_client_response: 0,
                prereq_coord_st: 0,
                prereq_notes: "",
                worker_id: "",
                status: "Pendiente",
                priority: "Media",
              });
              setShowTaskModal(true);
            }}
          >
            Crear tarea
          </button>
        )}
        {isAdmin && (
          <div className="sidebar-section">
            <div className="sidebar-title">Equipo</div>
                <div className="worker-list">
                  {plannableWorkers.map((w) => (
                    <button
                      key={w.id}
                      className="worker-chip"
                      style={{ background: w.color }}
                      draggable
                      onDragStart={(event) => handleWorkerDragStart(event, w)}
                      data-worker-id={w.id}
                      title={w.status}
                    >
                      {w.name}
                    </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main onClick={() => setTaskMenuId(null)}>
        <div className="topbar">
          <div className="topbar-spacer" />
          <button className="logout" onClick={handleLogout}>Salir</button>
        </div>
        {tab === "tasks" && (
          <>
            <div className="toolbar">
              <div className="nav-date">
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>{"<"}</button>
                <div>{currentDate.toLocaleString("es-CL", { month: "long", year: "numeric" })}</div>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>{">"}</button>
              </div>
            </div>


            <div className="tasks-layout">
                <div className="calendar-pane">
                  <div className="month-grid">
                    {dayNamesShort.map((d, idx) => (
                      <div key={d} className={`cell header${idx >= 5 ? " weekend" : ""}`}>{d}</div>
                    ))}
                    {grid.map((d) => {
                      const key = formatDate(d);
                      const items = tasksByDate[key] || [];
                      const isOutsideMonth = d.getMonth() !== currentDate.getMonth();
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div
                          key={key}
                          className={`cell${isOutsideMonth ? " outside" : " current"}${isWeekend ? " weekend" : ""}${dragOverDate === key ? " drag-over" : ""}${key === todayKey ? " today" : ""}${key === selectedDate ? " selected-date" : ""}`}
                          onClick={() => setSelectedDate(key)}
                          onDragOver={(event) => handleCellDragOver(event, key)}
                          onDragLeave={() => handleCellDragLeave(key)}
                          onDrop={(event) => handleCellDrop(event, key)}
                        >
                          <div className="day-num">{d.getDate()}</div>
                          <div className="bars">
                          {items
                            .flatMap((t) => {
                              if (t.workers && t.workers.length) {
                                return t.workers.map((w) => ({
                                  key: `${t.id}-${w.id}`,
                                  color: w.color || t.worker_color || "#2b6cff",
                                  title: `${t.title} (${w.name})`,
                                  task: t,
                                }));
                              }
                              return [{
                                key: String(t.id),
                                color: t.worker_color || "#2b6cff",
                                title: t.title,
                                task: t,
                              }];
                            })
                            .slice(0, 6)
                            .map((dot) => (
                              <span
                                key={dot.key}
                                className="bar"
                                style={{ background: dot.color }}
                                data-title={dot.title}
                                draggable={isAdmin}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  handleTaskDragStart(e, dot.task, key);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(key);
                                  openDetail(dot.task);
                                }}
                              />
                            ))}
                            {items.flatMap((t) => (t.workers && t.workers.length) ? t.workers : [t]).length > 6 && (
                              <span className="more">
                                +{items.flatMap((t) => (t.workers && t.workers.length) ? t.workers : [t]).length - 6}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <section className="day-tasks">
                  <div className="day-tasks-header">Tareas del dia</div>
                  <div className="list">
                    {selectedTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`task-card${selectedDayTaskId === t.id ? " selected" : ""}${isAdmin ? " draggable-task" : ""}`}
                        draggable={isAdmin}
                        onDragStart={(e) => handleTaskDragStart(e, t, t.task_date)}
                        onClick={() => setSelectedDayTaskId(t.id)}
                        onDoubleClick={() => openDetail(t)}
                      >
                        <div className="title">#{t.id} {t.title}</div>
                        <div className="meta">
                          {t.project && <span>[{t.project}]</span>}
                          <span>{t.start_time}{t.end_time ? `-${t.end_time}` : ""}</span>
                          <span>{t.workers?.length ? t.workers.map((w) => w.name).join(", ") : (t.worker_name || "Sin asignar")}</span>
                          <span>{t.status}</span>
                          <span>{t.priority}</span>
                        </div>
                        <div className="actions">
                          <button onClick={() => openLogs(t.id)}>Comentarios</button>
                          {isAdmin && (
                            <div className="task-menu">
                              <button
                                className="menu-trigger"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaskMenuId(taskMenuId === t.id ? null : t.id);
                                }}
                              >
                                +
                              </button>
                              {taskMenuId === t.id && (
                                <div className="menu-panel" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => openAssign(t)}>Asignar</button>
                                  <button type="button" className="danger" onClick={() => deleteTask(t)}>Eliminar</button>
                                </div>
                              )}
                            </div>
                          )}
                          {user.role !== "admin" && (
                            <>
                              <button onClick={() => updateStatus(t.id, "En progreso")}>En progreso</button>
                              <button onClick={() => updateStatus(t.id, "Finalizada")}>Finalizada</button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {selectedTasks.length === 0 && <div className="task-card">Sin tareas para este dia</div>}
                  </div>
                </section>
              </div>
          </>
        )}

        {tab === "maintainers" && isAdmin && (
          <div className="grid-list">
            <div className="card">
              <div className="actions maintainer-tabs" style={{ marginBottom: 10 }}>
                <button
                  className={maintainerTab === "workers" ? "active" : ""}
                  onClick={() => setMaintainerTab("workers")}
                >
                  Trabajadores
                </button>
                <button
                  className={maintainerTab === "projects" ? "active" : ""}
                  onClick={() => setMaintainerTab("projects")}
                >
                  Proyectos
                </button>
                <button
                  className={maintainerTab === "users" ? "active" : ""}
                  onClick={() => setMaintainerTab("users")}
                >
                  Cuentas
                </button>
              </div>

              {maintainerTab === "workers" && (
                <>
                  <div className="actions" style={{ marginBottom: 10 }}>
                    <button onClick={() => { setEditingWorker(null); setShowWorkerModal(true); }}>Crear trabajador</button>
                  </div>
                  <div className="grid-list">
                    {workers.map((w) => (
                      <div
                        className="card"
                        key={w.id}
                        style={{ borderLeft: `6px solid ${w.color}` }}
                        onDoubleClick={() => {
                          setEditingWorker(w);
                          setShowWorkerModal(true);
                        }}
                        title="Doble click para editar"
                      >
                        <div className="title">{w.name}</div>
                        <div className="meta">
                          {w.status} | {w.visible_in_planner === false ? "Oculto en planner" : "Visible en planner"}
                        </div>
                      </div>
                    ))}
                    {workers.length === 0 && <div className="card">Sin trabajadores</div>}
                  </div>
                </>
              )}

              {maintainerTab === "projects" && (
                <>
                  <div className="actions" style={{ marginBottom: 10 }}>
                    <button onClick={() => setShowProjectModal(true)}>Crear proyecto</button>
                  </div>
                  <div className="grid-list">
                    {projects.map((p) => (
                      <div className="card" key={p.id}>
                        <div className="title">{p.name}</div>
                        <div className="meta">{p.contact || "Sin contacto"}</div>
                        <div className="meta">{p.address || "Sin direccion"}</div>
                      </div>
                    ))}
                    {projects.length === 0 && <div className="card">Sin proyectos</div>}
                  </div>
                </>
              )}

              {maintainerTab === "users" && (
                <>
                  <div className="actions" style={{ marginBottom: 10 }}>
                    <button onClick={() => { setEditingUser(null); setShowUserModal(true); }}>Crear usuario</button>
                  </div>
                  <div className="grid-list">
                    {usersList.map((u) => (
                      <div className="card" key={u.id}>
                        <div className="title">{u.email}</div>
                        <div className="meta">Rol: {u.role}</div>
                        <div className="meta">
                          Trabajador: {u.worker_id ? (workers.find((w) => w.id === u.worker_id)?.name || "Asignado") : "Sin asignar"}
                        </div>
                        <div className="actions">
                          <button onClick={() => { setEditingUser(u); setShowUserModal(true); }}>Editar</button>
                          <button className="danger" onClick={() => removeUser(u.id)}>Eliminar</button>
                        </div>
                      </div>
                    ))}
                    {usersList.length === 0 && <div className="card">Sin usuarios</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {tab === "history" && isAdmin && (
          <div className="history">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Proyecto</th>
                  <th>Titulo</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Trabajador</th>
                  <th>Estado</th>
                  <th>Prioridad</th>
                  <th>Eliminada</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id} className={t.deleted_at ? "deleted" : ""}>
                    <td>{t.id}</td>
                    <td>{t.task_date}</td>
                    <td>{t.project}</td>
                    <td>{t.title}</td>
                    <td>{t.start_time}</td>
                    <td>{t.end_time || ""}</td>
                    <td>{t.workers?.length ? t.workers.map((w) => w.name).join(", ") : (t.worker_name || "")}</td>
                    <td>{t.status}</td>
                    <td>{t.priority}</td>
                    <td>{t.deleted_at ? "Si" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "profile" && (
          <div className="grid-list">
            <div className="card">
              <div className="title">Cuenta</div>
              <div className="meta">{user.email}</div>
              <div className="meta">Rol: {user.role}</div>
              <div className="actions" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => setShowPasswordModal(true)}>Cambiar contrasena</button>
              </div>
            </div>
            <div className="card">
              <div className="title">Trabajador</div>
              {profileWorker ? (
                <>
                  <div className="meta">Nombre: {profileWorker.name}</div>
                  <div className="meta">Estado: {profileWorker.status}</div>
                  <div className="meta">Color: {profileWorker.color}</div>
                </>
              ) : (
                <div className="meta">Sin trabajador asociado</div>
              )}
            </div>
          </div>
        )}
      </main>

      <Modal title="Crear tarea" open={showTaskModal} onClose={() => { setShowTaskModal(false); setTaskDraft(null); }}>
        <TaskForm workers={plannableWorkers} projects={projects} onSubmit={createTask} initialValues={taskDraft} />
      </Modal>

      <Modal
        title={editingWorker ? "Editar trabajador" : "Crear trabajador"}
        open={showWorkerModal}
        onClose={() => { setShowWorkerModal(false); setEditingWorker(null); }}
      >
        <WorkerForm
          initialValues={editingWorker}
          onSubmit={saveWorker}
        />
      </Modal>

      <Modal title="Crear proyecto" open={showProjectModal} onClose={() => setShowProjectModal(false)}>
        <ProjectForm onSubmit={async (payload) => {
          await api.createProject(payload);
          setShowProjectModal(false);
          api.projects().then(setProjects);
        }} />
      </Modal>

      <Modal
        title={editingUser ? "Editar usuario" : "Crear usuario"}
        open={showUserModal}
        onClose={() => { setShowUserModal(false); setEditingUser(null); }}
      >
        <UserForm
          workers={workers}
          initialValues={editingUser}
          onSubmit={saveUser}
        />
      </Modal>

      <Modal title="Asignar trabajadores" open={showAssignModal} onClose={() => setShowAssignModal(false)}>
        <div className="form">
          {plannableWorkers.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={assignWorkerIds.includes(w.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setAssignWorkerIds([...assignWorkerIds, w.id]);
                  } else {
                    setAssignWorkerIds(assignWorkerIds.filter((id) => id !== w.id));
                  }
                }}
              />
              {w.name}
            </label>
          ))}
          <button type="button" onClick={saveAssign}>Guardar</button>
        </div>
      </Modal>

      <Modal title="Detalle tarea" open={showDetailModal} onClose={() => { setShowDetailModal(false); setDetailTask(null); }}>
        {detailTask && (
          <>
            <div className="detail-meta">
              <div><strong>ID:</strong> #{detailTask.id}</div>
              <div><strong>Asignados:</strong> {detailTask.workers?.length ? detailTask.workers.map((w) => w.name).join(", ") : (detailTask.worker_name || "Sin asignar")}</div>
            </div>
            <div className="actions" style={{ marginBottom: 8 }}>
              <button type="button" onClick={() => openLogs(detailTask.id)}>Comentarios</button>
            </div>
            <TaskForm
              workers={plannableWorkers}
              projects={projects}
              onSubmit={(payload) => updateTask(detailTask.id, payload)}
              initialValues={mapTaskToForm(detailTask)}
              submitLabel="Guardar cambios"
              readOnly={!isAdmin}
            />
          </>
        )}
      </Modal>

      <Modal title="Comentarios" open={showLogsModal} onClose={() => setShowLogsModal(false)}>
        <div className="log-list">
          {logs.map((log) => (
            <div key={log.id} className="log-item">
              <div className="log-meta">
                <span>#{log.id}</span>
                <span>{new Date(log.created_at).toLocaleString("es-CL")}</span>
                <span>{log.user_email || "Sistema"}</span>
                <span>{log.user_role || ""}</span>
              </div>
              <div className="log-content">{log.content}</div>
            </div>
          ))}
          {logs.length === 0 && <div className="log-item">Sin comentarios</div>}
        </div>
        <div className="log-input">
          <input
            value={logInput}
            onChange={(e) => setLogInput(e.target.value)}
            placeholder="Agregar comentario..."
          />
          <button
            type="button"
            onClick={() => {
              if (!logTaskId || !logInput.trim()) return;
              addLog(logTaskId, logInput.trim());
              setLogInput("");
            }}
          >
            Guardar
          </button>
        </div>
      </Modal>

      <Modal title="Cambiar contrasena" open={showPasswordModal} onClose={() => setShowPasswordModal(false)}>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!passwordForm.current || !passwordForm.next) {
              window.alert("Completa los campos.");
              return;
            }
            if (passwordForm.next !== passwordForm.confirm) {
              window.alert("La confirmacion no coincide.");
              return;
            }
            await api.changePassword({
              current_password: passwordForm.current,
              new_password: passwordForm.next,
            });
            setPasswordForm({ current: "", next: "", confirm: "" });
            setShowPasswordModal(false);
            window.alert("Contrasena actualizada.");
          }}
        >
          <label>Contrasena actual</label>
          <input
            type="password"
            value={passwordForm.current}
            onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
          />
          <label>Nueva contrasena</label>
          <input
            type="password"
            value={passwordForm.next}
            onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
          />
          <label>Confirmar nueva contrasena</label>
          <input
            type="password"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
          />
          <button type="submit">Guardar</button>
        </form>
      </Modal>

      <Modal title="Mover o copiar tarea" open={showTaskMoveModal} onClose={closeTaskMoveModal}>
        {taskMoveDraft && (
          <div className="form">
            <div className="detail-meta">
              <div><strong>Tarea:</strong> #{taskMoveDraft.task.id} {taskMoveDraft.task.title}</div>
              <div><strong>Origen:</strong> {taskMoveDraft.sourceDate}</div>
              <div><strong>Destino:</strong> {taskMoveDraft.targetDate}</div>
            </div>
            <label>
              <input
                type="radio"
                checked={taskMoveDraft.mode === "move"}
                onChange={() => setTaskMoveDraft({ ...taskMoveDraft, mode: "move" })}
              />
              Mover tarea
            </label>
            <label>
              <input
                type="radio"
                checked={taskMoveDraft.mode === "copy"}
                onChange={() => setTaskMoveDraft({ ...taskMoveDraft, mode: "copy" })}
              />
              Copiar tarea
            </label>
            {taskMoveDraft.mode === "move" && (
              <>
                <label>Causa del movimiento</label>
                <textarea
                  value={taskMoveDraft.reason}
                  onChange={(e) => setTaskMoveDraft({ ...taskMoveDraft, reason: e.target.value })}
                  placeholder="Ej: reprogramacion por solicitud del cliente"
                />
              </>
            )}
            <div className="actions">
              <button type="button" onClick={closeTaskMoveModal}>Cancelar</button>
              <button type="button" onClick={confirmTaskMoveAction}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TaskForm({ workers, projects, onSubmit, initialValues, submitLabel, readOnly = false }) {
  const [form, setForm] = useState({
    task_date: formatDate(new Date()),
    title: "",
    project: "",
    start_time: "",
    end_time: "",
    prereq_tools: 0,
    prereq_shoes: 0,
    prereq_vest: 0,
    prereq_helmet: 0,
    prereq_client_response: 0,
    prereq_coord_st: 0,
    prereq_notes: "",
    worker_id: "",
    status: "Pendiente",
    priority: "Media",
  });

  useEffect(() => {
    if (initialValues) {
      setForm((prev) => ({ ...prev, ...initialValues }));
    }
  }, [initialValues]);

  function update(key, value) {
    setForm({ ...form, [key]: value });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        const ppeParts = [];
        if (form.prereq_tools) ppeParts.push("herramientas");
        if (form.prereq_shoes) ppeParts.push("zapatos");
        if (form.prereq_vest) ppeParts.push("chaleco");
        if (form.prereq_helmet) ppeParts.push("casco");
        onSubmit({
          ...form,
          prereq_ppe: ppeParts.join(","),
          worker_id: form.worker_id ? Number(form.worker_id) : null,
        });
      }}
      className="form"
    >
      <label>Fecha</label>
      <div className="readonly">{form.task_date}</div>
      <label>Titulo</label>
      <input value={form.title} onChange={(e) => update("title", e.target.value)} disabled={readOnly} />
      <div className="inline">
        <div className="field-inline">
          <span>Proyecto</span>
          <select value={form.project} onChange={(e) => update("project", e.target.value)} disabled={readOnly}>
            <option value="">(Sin proyecto)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="field-inline">
          <span>Trabajador</span>
          <select value={form.worker_id} onChange={(e) => update("worker_id", e.target.value)} disabled={readOnly}>
            <option value="">(Sin asignar)</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="inline">
        <div className="field-inline">
          <span>Hora inicio</span>
          <input value={form.start_time} onChange={(e) => update("start_time", e.target.value)} placeholder="09:00" disabled={readOnly} />
        </div>
        <div className="field-inline">
          <span>Hora fin</span>
          <input value={form.end_time} onChange={(e) => update("end_time", e.target.value)} placeholder="18:00" disabled={readOnly} />
        </div>
      </div>
      <div className="inline">
        <div className="field-inline">
          <span>Estado</span>
          <select value={form.status} onChange={(e) => update("status", e.target.value)} disabled={readOnly}>
            <option>Pendiente</option>
            <option>En progreso</option>
            <option>Bloqueada</option>
            <option>Finalizada</option>
          </select>
        </div>
        <div className="field-inline">
          <span>Prioridad</span>
          <select value={form.priority} onChange={(e) => update("priority", e.target.value)} disabled={readOnly}>
            <option>Baja</option>
            <option>Media</option>
            <option>Alta</option>
            <option>Urgente</option>
          </select>
        </div>
      </div>
      <label>Prerequisitos</label>
      <div className="checkbox-grid">
        <label><input type="checkbox" checked={!!form.prereq_tools} onChange={(e) => update("prereq_tools", e.target.checked ? 1 : 0)} disabled={readOnly} /> Herramientas</label>
        <label><input type="checkbox" checked={!!form.prereq_shoes} onChange={(e) => update("prereq_shoes", e.target.checked ? 1 : 0)} disabled={readOnly} /> Zapatos</label>
        <label><input type="checkbox" checked={!!form.prereq_vest} onChange={(e) => update("prereq_vest", e.target.checked ? 1 : 0)} disabled={readOnly} /> Chaleco</label>
        <label><input type="checkbox" checked={!!form.prereq_helmet} onChange={(e) => update("prereq_helmet", e.target.checked ? 1 : 0)} disabled={readOnly} /> Casco</label>
        <label><input type="checkbox" checked={!!form.prereq_client_response} onChange={(e) => update("prereq_client_response", e.target.checked ? 1 : 0)} disabled={readOnly} /> Confirmacion cliente</label>
        <label><input type="checkbox" checked={!!form.prereq_coord_st} onChange={(e) => update("prereq_coord_st", e.target.checked ? 1 : 0)} disabled={readOnly} /> Coordinacion ST</label>
      </div>
      {!readOnly && <button type="submit">{submitLabel || "Guardar"}</button>}
    </form>
  );
}

function WorkerForm({ onSubmit, initialValues }) {
  const [form, setForm] = useState({
    name: "",
    status: "Activo",
    color: "#6c757d",
    visible_in_planner: true,
  });

  useEffect(() => {
    if (initialValues) {
      setForm({
        name: initialValues.name || "",
        status: initialValues.status || "Activo",
        color: initialValues.color || "#6c757d",
        visible_in_planner: initialValues.visible_in_planner !== false,
      });
    }
  }, [initialValues]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="form">
      <label>Nombre</label>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label>Estado</label>
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option>Activo</option>
        <option>Vacaciones</option>
        <option>Libre</option>
      </select>
      <label>Color</label>
      <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
      <label>
        <input
          type="checkbox"
          checked={!!form.visible_in_planner}
          onChange={(e) => setForm({ ...form, visible_in_planner: e.target.checked })}
        />
        Visible en planner (sidebar y asignacion)
      </label>
      <button type="submit">Guardar</button>
    </form>
  );
}

function ProjectForm({ onSubmit }) {
  const [form, setForm] = useState({ name: "", contact: "", address: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="form">
      <label>Nombre</label>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label>Contacto</label>
      <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
      <label>Direccion</label>
      <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <button type="submit">Guardar</button>
    </form>
  );
}

function UserForm({ workers, initialValues, onSubmit }) {
  const [form, setForm] = useState({
    email: "",
    role: "worker",
    worker_id: "",
    password: "",
  });

  useEffect(() => {
    if (initialValues) {
      setForm({
        email: initialValues.email || "",
        role: initialValues.role || "worker",
        worker_id: initialValues.worker_id || "",
        password: "",
      });
    }
  }, [initialValues]);

  function update(key, value) {
    setForm({ ...form, [key]: value });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          email: form.email,
          role: form.role,
          worker_id: form.worker_id ? Number(form.worker_id) : null,
          ...(form.password ? { password: form.password } : {}),
        });
      }}
      className="form"
    >
      <label>Email</label>
      <input value={form.email} onChange={(e) => update("email", e.target.value)} />
      <label>Rol</label>
      <select value={form.role} onChange={(e) => update("role", e.target.value)}>
        <option value="admin">admin</option>
        <option value="worker">worker</option>
      </select>
      <label>Trabajador</label>
      <select value={form.worker_id} onChange={(e) => update("worker_id", e.target.value)}>
        <option value="">(Sin asignar)</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
      <label>Password {initialValues ? "(opcional)" : ""}</label>
      <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} />
      <button type="submit">Guardar</button>
    </form>
  );
}
