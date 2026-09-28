# app-catalogo-backend

API REST de un catálogo de productos. Guarda los productos en **MongoDB**, incluidas sus
imágenes, y los expone en JSON. Está escrita en **Python 3.12 con FastAPI**.

Al arrancar declara sus índices y, si `SEED_DEMO` está activo, carga un catálogo de ejemplo con
imágenes. La carga es idempotente: correrlo varias veces no duplica productos.

Trae documentación interactiva generada sola en **`/docs`**.

## Qué expone

Escucha en el puerto **8000**.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Estado del servicio y de la base |
| `GET` | `/categorias` | Las categorías que existen en el catálogo |
| `GET` | `/productos` | Lista productos. Acepta `?categoria=`, `?q=` (busca por nombre o SKU) y `?limite=` (1 a 500, por defecto 100) |
| `POST` | `/productos` | Crea un producto |
| `GET` | `/productos/{id}` | Devuelve un producto |
| `PUT` | `/productos/{id}` | Modifica un producto |
| `DELETE` | `/productos/{id}` | Borra un producto |
| `GET` | `/productos/{id}/imagen` | Devuelve la imagen del producto (`image/jpeg`) |

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `DB_HOST` | `localhost` | Host de MongoDB |
| `DB_PORT` | `27017` | Puerto de MongoDB |
| `DB_NAME` | `catalogodb` | Nombre de la base |
| `DB_USER` | `catalogo_user` | Usuario |
| `DB_PASSWORD` | `catalogo_pass` | Contraseña |
| `APP_VERSION` | `v1` | Lo que devuelve `/health` en `version` |
| `SEED_DEMO` | `true` | Carga el catálogo de ejemplo. `false` para no hacerlo |
| `ROOT_PATH` | `/api` | Prefijo bajo el que la API queda publicada. **Vacío si se accede directo** |

> `ROOT_PATH` no cambia las rutas: solo le dice a la API bajo qué prefijo la ve el navegador,
> para que `/docs` arme bien los enlaces. Si se le pega directo al puerto 8000, hay que ponerlo
> en vacío.

## Cómo correrlo

**1. La base de datos.** Hace falta un MongoDB 7:

```bash
docker run -d --name catalogo-db \
  -e MONGO_INITDB_ROOT_USERNAME=catalogo_user \
  -e MONGO_INITDB_ROOT_PASSWORD=catalogo_pass \
  -p 27017:27017 \
  mongo:7
```

**2. La API.**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export DB_HOST=localhost DB_PORT=27017
export DB_NAME=catalogodb DB_USER=catalogo_user DB_PASSWORD=catalogo_pass
export ROOT_PATH=

uvicorn main:app --host 0.0.0.0 --port 8000
```

**3. Probar que anda.**

```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/categorias
curl -s 'http://localhost:8000/productos?limite=3'
```

Y la documentación interactiva, en el navegador: **http://localhost:8000/docs**

## Estructura

```
main.py             la aplicación entera: rutas y acceso a la base
catalogo_demo.py    el catálogo de ejemplo que se carga con SEED_DEMO
imagenes/           las fotos del catálogo de ejemplo
requirements.txt    dependencias de Python
```
