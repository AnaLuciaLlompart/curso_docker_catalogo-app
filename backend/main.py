"""catalogo-api — Variante C del proyecto integrador (FastAPI + MongoDB).

Equivalente de `notas-api` sobre una base documental. La forma del contrato es
la misma que la de la variante A (mismo /health, mismos verbos REST), para que
el frontend y la rúbrica sean comparables; lo que cambia es el motor de base.
"""

import base64
import binascii
import hashlib
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import Binary, ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, HTTPException, Header, Query, Response
from pydantic import BaseModel, Field
from pymongo import ASCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from catalogo_demo import CATALOGO_DEMO

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("catalogo-api")

DB_NAME = os.environ.get("DB_NAME", "catalogodb")
APP_VERSION = os.environ.get("APP_VERSION", "v1")

# Detrás del proxy del frontend la app vive bajo /api. FastAPI lo necesita para
# generar bien las URLs absolutas de /docs y /openapi.json (ver README).
# Se deja vacío para pegarle a la API directa por su puerto de depuración.
ROOT_PATH = os.environ.get("ROOT_PATH", "/api")

SEED_DEMO = os.environ.get("SEED_DEMO", "true").lower() in ("1", "true", "yes")

IMAGENES_DIR = Path(__file__).parent / "imagenes"

# Las imágenes viajan como data URI dentro del JSON y se guardan en el propio
# documento. El tope tiene que quedar por debajo del client_max_body_size del
# nginx del frontend (1 MB), teniendo en cuenta que base64 infla un 33%.
IMAGEN_MAX_BYTES = 512 * 1024
TIPOS_IMAGEN = {"image/jpeg", "image/png", "image/webp", "image/gif"}
DATA_URI = re.compile(r"^data:(?P<tipo>[\w/+.-]+);base64,(?P<datos>.+)$", re.S)

# authSource=admin: el usuario root creado por MONGO_INITDB_ROOT_* vive en la
# base 'admin', no en la de la aplicación. Sin este parámetro la autenticación
# falla con "Authentication failed" aunque usuario y password sean correctos.
MONGO_URI = os.environ.get("MONGO_URI") or (
    f"mongodb://{os.environ.get('DB_USER', 'catalogo_user')}"
    f":{os.environ.get('DB_PASSWORD', 'catalogo_pass')}"
    f"@{os.environ.get('DB_HOST', 'localhost')}"
    f":{os.environ.get('DB_PORT', '27017')}"
    f"/{DB_NAME}?authSource=admin"
)

cliente = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
productos = cliente[DB_NAME]["productos"]

# Campos binarios: nunca se devuelven en el JSON de la lista. La imagen se pide
# aparte, por su propia URL, para que el navegador pueda cachearla.
SIN_BINARIOS = {"imagen_datos": 0}


class ProductoIn(BaseModel):
    sku: int = Field(ge=1, description="Código único del producto")
    nombre: str = Field(min_length=1, max_length=200)
    precio: float = Field(ge=0)
    categoria: str = Field(default="General", min_length=1, max_length=60)
    stock: int = Field(default=0, ge=0)
    descripcion: str = Field(default="", max_length=500)
    # data URI ("data:image/jpeg;base64,...") o None para dejar la imagen como
    # está. La cadena vacía significa "borrar la imagen actual".
    imagen: Optional[str] = None


def serializar(doc: dict) -> dict:
    """El _id de Mongo es un ObjectId: el JSON de salida lo expone como string."""
    doc["id"] = str(doc.pop("_id"))
    doc.pop("imagen_datos", None)
    # `imagen` es un booleano: los bytes se piden aparte. El hash se expone
    # para que el frontend pueda usarlo como cache-buster en la URL.
    doc["imagen"] = bool(doc.get("imagen_hash"))
    return doc


def a_object_id(id_: str) -> ObjectId:
    try:
        return ObjectId(id_)
    except InvalidId:
        # Un id mal formado es un error del cliente (400), no del servidor (500).
        raise HTTPException(status_code=400, detail="id inválido")


def decodificar_imagen(data_uri: str) -> dict:
    """Valida un data URI y lo convierte en los campos que se guardan en Mongo."""
    match = DATA_URI.match(data_uri.strip())
    if not match:
        raise HTTPException(
            status_code=400,
            detail="la imagen debe ser un data URI base64 (data:image/...;base64,...)",
        )
    tipo = match.group("tipo").lower()
    if tipo not in TIPOS_IMAGEN:
        raise HTTPException(
            status_code=400,
            detail=f"tipo de imagen no soportado: {tipo}. Válidos: {sorted(TIPOS_IMAGEN)}",
        )
    try:
        datos = base64.b64decode(match.group("datos"), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="la imagen no es base64 válido")
    if len(datos) > IMAGEN_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"la imagen supera el máximo de {IMAGEN_MAX_BYTES // 1024} KB",
        )
    return {
        "imagen_datos": Binary(datos),
        "imagen_tipo": tipo,
        # El hash sirve de ETag y de cache-buster: si la imagen cambia, cambia
        # la URL que pide el navegador.
        "imagen_hash": hashlib.sha256(datos).hexdigest()[:16],
    }


def campos_de_imagen(imagen: Optional[str]) -> tuple[dict, list]:
    """Traduce el campo `imagen` del request a operaciones de $set / $unset."""
    if imagen is None:
        return {}, []
    if imagen == "":
        return {}, ["imagen_datos", "imagen_tipo", "imagen_hash"]
    return decodificar_imagen(imagen), []


def sembrar_catalogo() -> None:
    """Carga el catálogo de demo con sus imágenes.

    Es idempotente: upsert por `sku` (que además tiene índice único), así que
    correrlo N veces —o desde N réplicas -- deja siempre los mismos documentos.
    """
    for producto in CATALOGO_DEMO:
        doc = {k: v for k, v in producto.items() if k not in ("sku", "imagen")}
        archivo = IMAGENES_DIR / producto["imagen"]
        if archivo.is_file():
            datos = archivo.read_bytes()
            doc.update(
                imagen_datos=Binary(datos),
                imagen_tipo="image/jpeg",
                imagen_hash=hashlib.sha256(datos).hexdigest()[:16],
            )
        else:
            log.warning("falta la imagen de demo %s", archivo)
        productos.update_one(
            {"sku": producto["sku"]},
            {"$set": doc, "$setOnInsert": {"creado_en": datetime.now(timezone.utc)}},
            upsert=True,
        )
    log.info("catálogo de demo sembrado (%s productos)", len(CATALOGO_DEMO))


def esperar_mongo(reintentos: int = 10, espera_s: int = 3) -> None:
    """Mongo puede tardar en aceptar conexiones. Se reintenta ~30 s antes de
    fallar."""
    for intento in range(1, reintentos + 1):
        try:
            cliente.admin.command("ping")
            # Sin esquema no significa sin diseño: los índices se declaran igual.
            productos.create_index([("categoria", ASCENDING)])
            productos.create_index([("sku", ASCENDING)], unique=True)
            log.info("conexión a MongoDB establecida (base=%s)", DB_NAME)
            return
        except PyMongoError as err:
            log.warning("intento %s/%s de conexión falló: %s", intento, reintentos, err)
            if intento == reintentos:
                raise
            time.sleep(espera_s)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    esperar_mongo()
    if SEED_DEMO:
        sembrar_catalogo()
    yield
    cliente.close()


app = FastAPI(
    title="catalogo-api",
    description="Catálogo de productos de la Variante C del proyecto integrador.",
    version=APP_VERSION,
    root_path=ROOT_PATH,
    lifespan=lifespan,
)


@app.get("/health", tags=["operación"])
def health():
    try:
        cliente.admin.command("ping")
        return {"status": "ok", "db": "ok", "version": APP_VERSION}
    except PyMongoError as err:
        raise HTTPException(status_code=503, detail=f"bd no disponible: {err}")


@app.get("/categorias", tags=["catálogo"])
def categorias():
    """Alimenta los filtros del frontend."""
    return sorted(productos.distinct("categoria"))


@app.get("/productos", tags=["catálogo"])
def listar(
    categoria: Optional[str] = None,
    q: Optional[str] = Query(default=None, description="Busca por nombre o SKU"),
    limite: int = Query(default=100, ge=1, le=500),
):
    filtro: dict = {}
    if categoria:
        filtro["categoria"] = categoria
    if q:
        # re.escape: lo que escribe el usuario es un dato, no una expresión regular.
        condiciones: list = [{"nombre": {"$regex": re.escape(q), "$options": "i"}}]
        if q.isdigit():
            condiciones.append({"sku": int(q)})
        filtro["$or"] = condiciones
    cursor = productos.find(filtro, SIN_BINARIOS).sort("nombre", ASCENDING).limit(limite)
    return [serializar(d) for d in cursor]


@app.post("/productos", status_code=201, tags=["catálogo"])
def crear(producto: ProductoIn):
    doc = producto.model_dump(exclude={"imagen"})
    imagen, _ = campos_de_imagen(producto.imagen)
    doc.update(imagen)
    doc["creado_en"] = datetime.now(timezone.utc)
    try:
        resultado = productos.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"ya existe un producto con SKU {producto.sku}")
    return serializar(productos.find_one({"_id": resultado.inserted_id}, SIN_BINARIOS))


@app.get("/productos/{id_}", tags=["catálogo"])
def obtener(id_: str):
    doc = productos.find_one({"_id": a_object_id(id_)}, SIN_BINARIOS)
    if not doc:
        raise HTTPException(status_code=404, detail="no encontrado")
    return serializar(doc)


@app.get(
    "/productos/{id_}/imagen",
    tags=["catálogo"],
    responses={200: {"content": {"image/jpeg": {}}}, 404: {"description": "sin imagen"}},
)
def imagen(id_: str, if_none_match: Optional[str] = Header(default=None)):
    doc = productos.find_one(
        {"_id": a_object_id(id_)},
        {"imagen_datos": 1, "imagen_tipo": 1, "imagen_hash": 1},
    )
    if not doc or not doc.get("imagen_datos"):
        raise HTTPException(status_code=404, detail="el producto no tiene imagen")
    etag = f'"{doc.get("imagen_hash", "")}"'
    # La URL lleva el hash como query (?v=), así que la respuesta se puede
    # cachear fuerte: si la imagen cambia, cambia la URL.
    cabeceras = {"ETag": etag, "Cache-Control": "public, max-age=86400"}
    if if_none_match == etag:
        return Response(status_code=304, headers=cabeceras)
    return Response(
        content=bytes(doc["imagen_datos"]),
        media_type=doc.get("imagen_tipo", "application/octet-stream"),
        headers=cabeceras,
    )


@app.put("/productos/{id_}", tags=["catálogo"])
def actualizar(id_: str, producto: ProductoIn):
    cambios = producto.model_dump(exclude={"imagen"})
    imagen_set, imagen_unset = campos_de_imagen(producto.imagen)
    cambios.update(imagen_set)
    operacion: dict = {"$set": cambios}
    if imagen_unset:
        operacion["$unset"] = {campo: "" for campo in imagen_unset}
    try:
        doc = productos.find_one_and_update(
            {"_id": a_object_id(id_)},
            operacion,
            projection=SIN_BINARIOS,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"ya existe un producto con SKU {producto.sku}")
    if not doc:
        raise HTTPException(status_code=404, detail="no encontrado")
    return serializar(doc)


@app.delete("/productos/{id_}", status_code=204, tags=["catálogo"])
def eliminar(id_: str):
    if productos.delete_one({"_id": a_object_id(id_)}).deleted_count == 0:
        raise HTTPException(status_code=404, detail="no encontrado")
