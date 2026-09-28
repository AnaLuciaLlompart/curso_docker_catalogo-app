# catalogo-app

Proyecto integrador de la asignatura Contenedores, Docker y Orquestación con Kubernetes (FACET - UNT).
Variante C: catálogo de productos con React + Vite, Python + FastAPI y MongoDB 7.



## TP1 - La base de datos

### Punto 2 - Arquitectura

    navegador ──► catalogo-frontend ──────► catalogo-api ──────► catalogo-db
                  React + Vite              Python + FastAPI     MongoDB 7
                  nginx :8080               :8000                :27017
                  (host 3000)               (host 8000, solo     (sin puerto
                                             depuración)          publicado)

| Capa | Imagen | Puerto interno | Puerto publicado |
| --- | --- | --- | --- |
| `catalogo-frontend` | React + Vite servido por nginx | 8080 | 3000 |
| `catalogo-api` | Python + FastAPI | 8000 | 8000 (solo depuración) |
| `catalogo-db` | MongoDB 7 | 27017 | — |

El frontend es el único punto de entrada: nadie le habla a la base
directamente, y a la API le habla el frontend.

### Punto 3 - MongoDB sin configuración

a) `docker ps` con el contenedor en estado `Up`:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-db mongo:7
5e77517da9f92740f245e72411a3e45f38e4f9046184496857377eaf8cf2a5ab
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker ps
CONTAINER ID   IMAGE     COMMAND                  CREATED        STATUS                  PORTS       NAMES
5e77517da9f9   mongo:7   "docker-entrypoint.s…"   1 second ago   Up Less than a second   27017/tcp   catalogo-db
```

b) Bases listadas con mongosh sin credenciales:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet --eval 'show dbs'
admin    8.00 KiB
config  12.00 KiB
local    8.00 KiB
```

### Punto 4 - Usuario inicial

Variables que crean el usuario inicial (documentación de la imagen `mongo` en
Docker Hub): `MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD`.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-db -e MONGO_INITDB_ROOT_USERNAME=catalogo_user -e MONGO_INITDB_ROOT_PASSWORD=catalogo_pass mongo:7
7b57c6f223077d39e88dc6747bb6e8bfdd2ecf19ce76d4c48dda068721dc7c2f
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker logs catalogo-db | Select-String 'added user','Waiting for connections','RESTARTED'

{"t":{"$date":"2026-09-28T16:30:09.765+00:00"},"s":"I",  "c":"CONTROL",  "id":20698,   "ctx":"main","msg":"***** SERVER RESTARTED *****"}
{"t":{"$date":"2026-09-28T16:30:10.019+00:00"},"s":"I",  "c":"NETWORK",  "id":23016,   "ctx":"listener","msg":"Waiting for connections","attr":{"port":27017,"ssl":"off"}}
{"t":{"$date":"2026-09-28T16:30:11.215+00:00"},"s":"I",  "c":"CONTROL",  "id":20698,   "ctx":"main","msg":"***** SERVER RESTARTED *****"}
{"t":{"$date":"2026-09-28T16:30:12.734+00:00"},"s":"I",  "c":"NETWORK",  "id":23016,   "ctx":"listener","msg":"Waiting for connections","attr":{"port":27017,"ssl":"off"}}
```

El mensaje "Waiting for connections" aparece dos veces: el entrypoint de la
imagen levanta un mongod temporal para crear el usuario, lo reinicia
(`SERVER RESTARTED`) y recién entonces arranca el definitivo con autenticación.

### Punto 5 - Autenticación habilitada

Mensaje obtenido al listar las bases sin credenciales:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
{ ok: 1 }
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet --eval 'show dbs'
MongoServerError: Command listDatabases requires authentication
```

`ping` se completa sin credenciales; `listDatabases` es rechazado.

### Punto 6 - Conexión a MongoDB: authSource=admin

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet "mongodb://catalogo_user:catalogo_pass@localhost:27017/catalogodb" --eval 'db.getName()'
MongoServerError: Authentication failed.
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet "mongodb://catalogo_user:catalogo_pass@localhost:27017/catalogodb?authSource=admin" --eval 'db.getName()'
catalogodb
```

El usuario creado por las variables `MONGO_INITDB_ROOT_USERNAME` y
`MONGO_INITDB_ROOT_PASSWORD` de la imagen `mongo` reside en la base `admin`.
Si la cadena de conexión no incluye `?authSource=admin`, el motor busca al
usuario en la base de la aplicación (`catalogodb`), no lo encuentra e informa
"Authentication failed" aunque las credenciales sean correctas. Toda cadena de
conexión de `catalogo-api` a `catalogo-db` debe terminar en
`/catalogodb?authSource=admin`.

### Punto 7 - La contraseña en docker inspect

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker inspect --format '{{json .Config.Env}}' catalogo-db
["MONGO_INITDB_ROOT_USERNAME=catalogo_user","MONGO_INITDB_ROOT_PASSWORD=catalogo_pass","PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin","GOSU_VERSION=1.19","JSYAML_VERSION=3.13.1","JSYAML_CHECKSUM=662e32319bdd378e91f67578e56a34954b0a2e33aca11d70ab9f4826af24b941","MONGO_PACKAGE=mongodb-org","MONGO_REPO=repo.mongodb.org","MONGO_MAJOR=7.0","MONGO_VERSION=7.0.43","HOME=/data/db"]
```

La contraseña queda en texto plano en los metadatos del contenedor: cualquiera
con acceso a Docker en la máquina la lee con `docker inspect`. Las variables de
entorno no son un lugar seguro para secretos.

### Punto 8 - Ausencia de persistencia

Salida 1: se inserta un documento y se cuenta.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> $URI = "mongodb://catalogo_user:catalogo_pass@localhost:27017/catalogodb?authSource=admin"
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet $URI --eval 'db.productos.insertOne({ sku: 1, nombre: "prueba" })'
{
  acknowledged: true,
  insertedId: ObjectId('6aba961ea3abc07e4aace304')
}
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet $URI --eval 'db.productos.countDocuments()'
1
```

Salida 2: se elimina el contenedor y se vuelve a crear con el mismo comando.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker rm -f catalogo-db
catalogo-db
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-db -e MONGO_INITDB_ROOT_USERNAME=catalogo_user -e MONGO_INITDB_ROOT_PASSWORD=catalogo_pass mongo:7
e5d8bf846efc6261e289f45be04b53dcda90d1bce43f3588c455258d982f9e97
```

Salida 3: se cuenta de nuevo.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet $URI --eval 'db.productos.countDocuments()'
0
```

El documento se perdió: `docker rm` destruye el contenedor con lo que escribió y
`docker run` crea una instancia nueva y vacía a partir de la misma imagen. Sin
un volumen, los datos duran lo que dura el contenedor.



## TP2 - Las imágenes propias

### Punto 1 - Dockerfile ingenuo de la API

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker build -t catalogo-api:naive ./backend
[+] Building 37.0s (9/9) FINISHED                                                                  docker:desktop-linux
 => [internal] load build definition from Dockerfile                                                               0.0s
 => [internal] load metadata for docker.io/library/python:3.12                                                     2.1s
 => [internal] load .dockerignore                                                                                  0.0s
 => => transferring context: 2B                                                                                    0.0s
 => [1/4] FROM docker.io/library/python:3.12@sha256:4d1caded1f729ae443eb803f26ffde7b61e696aeaef62f099abb6dd6b142  23.0s
 => => sha256:e7272a918094ebc3b66e08b23223afd37614df4ba4518b2dfd9da5ee9247fce6 236.40MB / 236.40MB                16.9s
 => => sha256:38985a14f2b1b8215895ecb448f3dfc4067cb494aa00b547c78c9a012e9b2460 67.81MB / 67.81MB                   9.8s
 => => sha256:6eefb2f5d3e91a6cfc577476bbec26bb63f0d0fc31f904493f400833783aa2c2 49.38MB / 49.38MB                   4.4s
 => [internal] load build context                                                                                  0.1s
 => => transferring context: 500.22kB                                                                              0.1s
 => [2/4] WORKDIR /app                                                                                             0.6s
 => [3/4] COPY . .                                                                                                 0.0s
 => [4/4] RUN pip install -r requirements.txt                                                                      7.9s
 => exporting to image                                                                                             3.2s
 => => naming to docker.io/library/catalogo-api:naive                                                              0.0s

PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker images catalogo-api
REPOSITORY     TAG       IMAGE ID       CREATED         SIZE
catalogo-api   naive     3ffaefcf6ed3   9 minutes ago   1.71GB
```

### Punto 4 - Versión horneada

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm --entrypoint sh catalogo-api:v2 -c 'echo $APP_VERSION'
v2
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm --entrypoint sh catalogo-api:v1 -c 'echo $APP_VERSION'
v1
```

### Punto 6 - Configuración del frontend al arrancar

La configuración del proxy de nginx (`API_HOST`, `API_PORT`) se resuelve al
arrancar el contenedor, no durante la construcción: la imagen oficial de nginx
aplica `envsubst` sobre las plantillas de `/etc/nginx/templates/` en cada
arranque, así una misma imagen sirve para cualquier entorno. El `ENV` del
Dockerfile solo fija los valores por defecto.

`NGINX_ENVSUBST_FILTER=^API_` no es opcional: `envsubst` reemplaza toda
variable con forma `$NOMBRE`, y la configuración de nginx usa variables propias
con esa misma forma (`$uri`, `$host`, `$proxy_add_x_forwarded_for`) que no
existen como variables de entorno. Sin el filtro quedarían reemplazadas por
cadenas vacías y la configuración resultante sería inválida, sin ningún mensaje
de error. El filtro restringe la sustitución a las variables que empiezan con
`API_` y deja intactas las de nginx.

### Punto 7 - Verificación de la imagen del frontend

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm catalogo-frontend:v1 whoami
nginx
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm catalogo-frontend:v1 node --version
/docker-entrypoint.sh: exec: line 47: node: not found
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker images catalogo-frontend
REPOSITORY          TAG       IMAGE ID       CREATED         SIZE
catalogo-frontend   v1        a4e5062b21a9   9 minutes ago   73.9MB
```

a) El proceso corre como `nginx`, no como root. b) Node no existe en la imagen
final: el fallo es la evidencia de que el multi-etapa funcionó. c) 73,9 MB.

### Punto 8 - Medición

| Imagen | Imagen base | Tamaño | Reducción vs. ingenua |
| --- | --- | --- | --- |
| `catalogo-api:naive` | `python:3.12` (una etapa) | 1,71 GB | — |
| `catalogo-api:v1` | `python:3.12-slim` (multi-etapa) | 246 MB | 85,6 % |
| `catalogo-frontend:v1` | `nginxinc/nginx-unprivileged:1.27-alpine` (multi-etapa) | 73,9 MB | 95,7 % |

Reducción = (ingenua − imagen) / ingenua × 100.

Qué aportó cada decisión:

- **Base mínima (`slim` / `alpine`)**: la mayor parte del ahorro; saca el toolchain de compilación de la imagen final.
- **Multi-etapa**: deja afuera la caché de pip, `node_modules` y el código fuente del frontend; a la imagen final solo cruza el resultado.
- **Manifiestos antes que el código** (`requirements.txt`, `package.json`): la capa de instalación se reutiliza del cache; builds más rápidos, no cambia el tamaño.
- **`.dockerignore`**: reduce el contexto que viaja al daemon y evita que `.venv` o `.env` entren a la imagen.
- **`pip install --user` + `PATH`**: las dependencias quedan en un solo directorio que se copia entre etapas; el PATH hace localizables sus ejecutables.
- **Usuario no root** (`useradd` en la API; la base `nginx-unprivileged` ya lo trae): limita el daño ante una vulnerabilidad; sin costo en tamaño.
- **`PYTHONUNBUFFERED=1`**: los logs salen en tiempo real; sin costo en tamaño.
- **`ARG` + `ENV APP_VERSION`**: la versión queda horneada y es observable; sin costo en tamaño.
- **`--host 0.0.0.0`**: el servidor acepta conexiones desde fuera del contenedor.

### Punto 9 - docker history

Capas de `catalogo-api:v1` (sin las de 0B):

```
SIZE      CREATED BY
553kB     COPY --chown=appuser:appuser . . # buildkit
52.8MB    COPY --chown=appuser:appuser /root/.local /h…
8.19kB    WORKDIR /app
69.6kB    RUN /bin/sh -c useradd --create-home --shell…
16.4kB    RUN /bin/sh -c set -eux;  for src in idle3 p…
41.4MB    RUN /bin/sh -c set -eux;   savedAptMark="$(a…
4.95MB    RUN /bin/sh -c set -eux;  apt-get update;  a…
87.6MB    # debian.sh --arch 'amd64' out/ 'trixie' '@1…
```

La capa más pesada es la base del sistema operativo (`debian.sh … trixie`,
87,6 MB): el Debian recortado sobre el que está construida `python:3.12-slim`.
Le siguen las dependencias de la aplicación copiadas desde el builder
(`COPY /root/.local`, 52,8 MB: FastAPI, pymongo, uvicorn) y la instalación del
intérprete de Python (41,4 MB). El código propio pesa 553 kB.

Para comparar, las capas de `catalogo-api:naive`:

```
SIZE      CREATED BY
79.1MB    RUN /bin/sh -c pip install -r requirements.t…
549kB     COPY . . # buildkit
8.19kB    WORKDIR /app
16.4kB    RUN /bin/sh -c set -eux;  for src in idle3 p…
72.8MB    RUN /bin/sh -c set -eux;   wget -O python.ta…
19.9MB    RUN /bin/sh -c set -eux;  apt-get update;  a…
694MB     RUN /bin/sh -c set -ex;  apt-get update;  ap…
202MB     RUN /bin/sh -c set -eux;  apt-get update;  a…
65MB      RUN /bin/sh -c set -eux;  apt-get update;  a…
134MB     # debian.sh --arch 'amd64' out/ 'trixie' '@1…
```

En la ingenua, la capa de 694 MB (más las de 202 MB y 65 MB) corresponde a los
paquetes que `python:3.12` instala con `apt-get`: compiladores y librerías de
desarrollo que la API nunca usa en ejecución. Son capas heredadas de la imagen
base, y son la diferencia entre 1,71 GB y 246 MB.

### Punto 11 - Publicación en Docker Hub

```
docker login
docker tag catalogo-api:v1 TUUSUARIO/catalogo-api:v1
docker tag catalogo-api:v2 TUUSUARIO/catalogo-api:v2
docker tag catalogo-frontend:v1 TUUSUARIO/catalogo-frontend:v1
docker push TUUSUARIO/catalogo-api:v1
docker push TUUSUARIO/catalogo-api:v2
docker push TUUSUARIO/catalogo-frontend:v1
```

Nombres completos de las imágenes publicadas:

- `docker.io/TUUSUARIO/catalogo-api:v1`
- `docker.io/TUUSUARIO/catalogo-api:v2`
- `docker.io/TUUSUARIO/catalogo-frontend:v1`