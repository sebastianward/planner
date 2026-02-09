$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiPy = Join-Path $root ".venv\\Scripts\\python.exe"
$cloudflared = Join-Path $root "cloudflared-windows-amd64.exe"
$webDir = Join-Path $root "web"

# Debug mode: shows separate windows for API/Web.
$debugMode = $true

if (!(Test-Path $apiPy)) {
  Write-Host "No encuentro el venv en .venv. Ejecuta el setup primero." -ForegroundColor Red
  exit 1
}

if (!(Test-Path $cloudflared)) {
  Write-Host "No encuentro cloudflared-windows-amd64.exe en el directorio del repo." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "No encuentro npm en PATH. Abre una nueva terminal o reinstala Node.js." -ForegroundColor Red
  exit 1
}

Write-Host "Iniciando API..." -ForegroundColor Cyan
$apiArgs = "-m uvicorn api.main:app --reload --port 8001"
if ($debugMode) {
  Start-Process -FilePath $apiPy -ArgumentList $apiArgs -WorkingDirectory $root -WindowStyle Normal
} else {
  Start-Process -FilePath $apiPy -ArgumentList $apiArgs -WorkingDirectory $root -WindowStyle Hidden
}

Write-Host "Iniciando Web (Vite)..." -ForegroundColor Cyan
if ($debugMode) {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$webDir'; npm run dev -- --host" -WorkingDirectory $webDir -WindowStyle Normal
} else {
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-Command", "Set-Location -LiteralPath '$webDir'; npm run dev -- --host" -WorkingDirectory $webDir -WindowStyle Hidden
}

Write-Host "Esperando que Vite abra el puerto 5173..." -ForegroundColor Yellow
for ($i = 0; $i -lt 40; $i++) {
  try {
    $ok = Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -InformationLevel Quiet
  } catch {
    $ok = $false
  }
  if ($ok) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $ok) {
  Write-Host "No se detecta Vite en 127.0.0.1:5173. Revisa la ventana de Vite." -ForegroundColor Red
}

Write-Host "Iniciando tunel fijo (dominio propio)..." -ForegroundColor Cyan
Write-Host "URL fija: https://desarrolloantalis.lol" -ForegroundColor Green

& $cloudflared tunnel run planificador
