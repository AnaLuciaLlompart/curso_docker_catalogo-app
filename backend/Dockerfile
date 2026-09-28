# backend/Dockerfile — versión DEFINITIVA, multi-etapa


# ---------- Etapa 1: builder (instala dependencias) ----------
FROM python:3.12-slim AS builder
WORKDIR /app
# (b) el manifiesto ANTES del código: esta capa solo se rehace si cambian las dependencias
COPY requirements.txt .
# (a) --user deja todo en /root/.local; --no-cache-dir no guarda los .whl descargados
RUN pip install --user --no-cache-dir -r requirements.txt


# ---------- Etapa 2: final (solo lo necesario para ejecutar) ----------
FROM python:3.12-slim
# (d) la imagen de Python no trae usuario sin privilegios: se crea a mano
RUN useradd --create-home --shell /bin/bash appuser
WORKDIR /app
# (c) las dependencias cruzan de etapa al home del usuario; --chown para que le pertenezcan
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local
# el código, después de las dependencias
COPY --chown=appuser:appuser . .
# (c) PATH: sin esto, "uvicorn" no se encuentra al arrancar
# (e) PYTHONUNBUFFERED: sin esto, docker logs no muestra nada
ENV PATH=/home/appuser/.local/bin:$PATH \
PYTHONUNBUFFERED=1
# (f) versión horneada: ARG vive solo en el build, ENV queda en la imagen
ARG APP_VERSION=v1
ENV APP_VERSION=${APP_VERSION}
# (d) USER casi al final, DESPUÉS de los COPY
USER appuser
# (g) EXPOSE documenta el puerto; el CMD en forma de lista, escuchando en 0.0.0.0
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
