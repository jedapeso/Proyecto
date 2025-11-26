FROM python:3.11-slim

# Instalar dependencias básicas necesarias para compilar librerías (ej: psycopg2, informix, pandas, etc.)
RUN apt-get update && \
    apt-get install -y gcc python3-dev libpq-dev build-essential && \
    rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar primero requirements para aprovechar el cache de Docker
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt


# Exponer el puerto Flask
EXPOSE 5005

# Comando por defecto (puedes cambiar run.py a tu script principal)
CMD ["python", "run.py"]

