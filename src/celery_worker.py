from src import create_app
from src.extensions import make_celery
from src.db_engine import engine  # ✅ Usa el engine global definido para Informix


# ==========================================================
#  Inicialización de Flask y Celery
# ==========================================================
app = create_app()
celery = make_celery(app)


# ==========================================================
#  Importar tareas (después de inicializar Celery y el engine)
# ==========================================================
try:
    from src.routes.facturacion.tasks import procesar_anio, ejecutar_reporte_cargos
    print("✅ Tareas de facturación registradas correctamente en Celery.")
except Exception as e:
    print(f"⚠️ No se pudieron registrar las tareas de facturación: {e}")

# ==========================================================
#  Punto de entrada principal
# ==========================================================
if __name__ == "__main__":
    print("🚀 Iniciando Celery Worker con conexión Informix optimizada...")
    celery.start()
