const API_URL = import.meta.env.VITE_API_URL || "/api";

export function getToken() {
  return localStorage.getItem("token") || "";
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

async function request(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!headers["Content-Type"] && options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: async (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error("Login invalido");
    return res.json();
  },
  me: () => request("/me"),
  meWorker: () => request("/me/worker"),
  changePassword: (payload) => request("/me/password", { method: "PATCH", body: JSON.stringify(payload) }),
  users: () => request("/users"),
  createUser: (payload) => request("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  workers: () => request("/workers"),
  createWorker: (payload) => request("/workers", { method: "POST", body: JSON.stringify(payload) }),
  updateWorker: (id, payload) => request(`/workers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteWorker: (id) => request(`/workers/${id}`, { method: "DELETE" }),

  projects: () => request("/projects"),
  createProject: (payload) => request("/projects", { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (id, payload) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  tasks: (params) => {
    const qs = new URLSearchParams(params || {});
    return request(`/tasks?${qs.toString()}`);
  },
  history: () => request("/tasks/history"),
  createTask: (payload) => request("/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (id, payload) => request(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteTask: (id, reason) =>
    request(`/tasks/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }),
  updateStatus: (id, statusValue) =>
    request(`/tasks/${id}/status?status_value=${encodeURIComponent(statusValue)}`, { method: "PATCH" }),
  assignWorkers: (id, worker_ids) =>
    request(`/tasks/${id}/workers`, { method: "PUT", body: JSON.stringify({ worker_ids }) }),
  logs: (id) => request(`/tasks/${id}/logs`),
  addLog: (id, content) => request(`/tasks/${id}/logs`, { method: "POST", body: JSON.stringify({ content }) }),
};
