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

Por defecto el frontend usa `/api` como API (same-origin). Si quieres otro host en modo dev:
```bash
set VITE_API_URL=http://localhost:8001
```

## Docker
```bash
docker compose up --build -d
```

Servicios:
- Frontend: `http://localhost:5173` (solo localhost)
- API: `http://localhost:8001` (solo localhost)

## Persistencia y migracion de datos (Raspberry/Linux)
La base SQLite vive en `./data/app.db` mediante volumen bind mount.

1. En tu equipo actual, copia la base al directorio `data`:
```bash
mkdir -p data
cp app.db data/app.db
```

2. Sube el proyecto a la Raspberry y tambien `data/app.db`:
```bash
scp -r . usuario@raspberry:/home/usuario/planner
scp data/app.db usuario@raspberry:/home/usuario/planner/data/app.db
```

3. Levanta en Raspberry:
```bash
cd /home/usuario/planner
docker compose up -d --build
```

## Cloudflare Tunnel (desarrolloantalis.lol)
Configura el tunnel para apuntar al frontend en la Raspberry:

- `service`: `http://localhost:5173`
- host publico: `desarrolloantalis.lol`

El frontend reenvia `/api/*` internamente al contenedor `api` (Nginx proxy), por lo que no necesitas publicar la API al exterior.
