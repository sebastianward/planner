# Planificador web (FastAPI + React + SQLite)

### API
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r api/requirements.txt
set ADMIN_EMAIL=admin@local
set ADMIN_PASSWORD=admin123
uvicorn api.main:app --reload --port 8001
```

Crear usuarios adicionales:
```bash
python -m api.create_user usuario@local clave worker 1
```

### Frontend (React)
```bash
cd web
npm install
npm run dev
```

Por defecto el frontend usa `http://localhost:8001` como API. Si quieres otro host:
```bash
set VITE_API_URL=http://localhost:8001
```

## Docker
```bash
docker compose up --build
```

Servicios:
- Frontend: `http://localhost:5173`
- API: `http://localhost:8001`
