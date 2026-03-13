
## Validacion

1. Copia `.env.example` a `.env` y ajusta variables si necesitas conectarte a Informix real.
2. Para validacion completa sin dependencias externas, usa:

```powershell
docker compose run --rm validator
```

O en PowerShell:

```powershell
.\scripts\validate_app.ps1
```

La validacion corre en `APP_VALIDATION_MODE=1` y verifica:

- arranque de Flask y registro de blueprints,
- endpoint `/healthz`,
- smoke tests de censo y facturacion con dobles de base de datos,
- existencia de assets estaticos referenciados por templates.
