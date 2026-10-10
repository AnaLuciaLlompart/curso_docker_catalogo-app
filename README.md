# catalogo-app

Proyecto integrador de la asignatura Contenedores, Docker y Orquestación con Kubernetes (FACET - UNT).
Variante C: catálogo de productos con React + Vite, Python + FastAPI y MongoDB 7.

---

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

---

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

### Punto 10 - Efecto del cache de construcción

Cambio en un archivo de código (`main.py`): la instalación de dependencias sale
del cache y el build tarda 1,7 s.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Add-Content backend\main.py "# cambio de prueba para el cache"
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker build -t catalogo-api:v1 ./backend
[+] Building 1.7s (13/13) FINISHED                                                                 docker:desktop-linux
 => [internal] load build context                                                                                  0.0s
 => => transferring context: 12.85kB                                                                               0.0s
 => CACHED [stage-1 2/5] RUN useradd --create-home --shell /bin/bash appuser                                       0.0s
 => CACHED [stage-1 3/5] WORKDIR /app                                                                              0.0s
 => CACHED [builder 2/4] WORKDIR /app                                                                              0.0s
 => CACHED [builder 3/4] COPY requirements.txt .                                                                   0.0s
 => CACHED [builder 4/4] RUN pip install --user --no-cache-dir -r requirements.txt                                 0.0s
 => CACHED [stage-1 4/5] COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local             0.0s
 => [stage-1 5/5] COPY --chown=appuser:appuser . .                                                                 0.0s
 => exporting to image                                                                                             0.2s
```

Cambio en `requirements.txt`: la capa de instalación se invalida, `pip install`
vuelve a ejecutarse (8,1 s) y el build tarda 11,3 s.

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Add-Content backend\requirements.txt "# cambio de prueba"
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker build -t catalogo-api:v1 ./backend
[+] Building 11.3s (13/13) FINISHED                                                                docker:desktop-linux
 => [internal] load build context                                                                                  0.0s
 => => transferring context: 774B                                                                                  0.0s
 => CACHED [builder 2/4] WORKDIR /app                                                                              0.0s
 => [builder 3/4] COPY requirements.txt .                                                                          0.0s
 => [builder 4/4] RUN pip install --user --no-cache-dir -r requirements.txt                                        8.1s
 => CACHED [stage-1 2/5] RUN useradd --create-home --shell /bin/bash appuser                                       0.0s
 => CACHED [stage-1 3/5] WORKDIR /app                                                                              0.0s
 => [stage-1 4/5] COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local                    0.4s
 => [stage-1 5/5] COPY --chown=appuser:appuser . .                                                                 0.1s
 => exporting to image                                                                                             2.1s
```

Docker reutiliza una capa si la instrucción y su entrada no cambiaron, y al
invalidar una capa se reconstruyen todas las que están arriba. Como el
Dockerfile copia `requirements.txt` e instala las dependencias **antes** de
copiar el código, un cambio en el código solo rehace la última capa, mientras
que un cambio en las dependencias rehace la instalación y lo que sigue.

### Punto 11 - Publicación en Docker Hub

```
docker login
docker tag catalogo-api:v1 analuciallompart/catalogo-api:v1
docker tag catalogo-api:v2 analuciallompart/catalogo-api:v2
docker tag catalogo-frontend:v1 analuciallompart/catalogo-frontend:v1
docker push analuciallompart/catalogo-api:v1
docker push analuciallompart/catalogo-api:v2
docker push analuciallompart/catalogo-frontend:v1
```

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker login
Authenticating with existing credentials... [Username: analuciallompart]
Login Succeeded
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker push analuciallompart/catalogo-api:v1
The push refers to repository [docker.io/analuciallompart/catalogo-api]
898ca8286969: Pushed
880cba0b13d9: Pushed
3cb0c987b938: Pushed
9ff6e3daca59: Pushed
536380939b8d: Pushed
3764a9a7d1e8: Pushed
06ad939ed42b: Pushed
b0dc7f87bef1: Pushed
6b37362b3da7: Pushed
v1: digest: sha256:2207e1bd130a00bacf6ff254227f6d637a6c98f52cc8cde9e7eec0615e8b6c96 size: 856
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker push analuciallompart/catalogo-api:v2
The push refers to repository [docker.io/analuciallompart/catalogo-api]
3cb0c987b938: Layer already exists
06ad939ed42b: Layer already exists
6b37362b3da7: Layer already exists
0c761e02a8a4: Pushed
3764a9a7d1e8: Layer already exists
eeb521dbad8f: Pushed
898ca8286969: Layer already exists
b0dc7f87bef1: Layer already exists
b8d3defa2c02: Pushed
v2: digest: sha256:615ac663be665ac2c75f7187831d5c65e78da8df20fd0ad2c280a45ba21f59ef size: 856
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker push analuciallompart/catalogo-frontend:v1
The push refers to repository [docker.io/analuciallompart/catalogo-frontend]
2957425470d2: Pushed
945f5aaec3d7: Pushed
aca083b8d655: Pushed
b16687ec2b7b: Pushed
8d9423e8935c: Pushed
048c29a61317: Pushed
f18232174bc9: Pushed
8f7ead5f2dc0: Pushed
f79056b7935e: Pushed
400c1de759f4: Pushed
576fe098e846: Pushed
513bae533eb2: Pushed
v1: digest: sha256:a4e5062b21a9a101cca58598bd417471e57efb30b230e9fd80bd7e0cf89dcbc0 size: 856
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker images analuciallompart/*
REPOSITORY                           TAG       IMAGE ID       CREATED          SIZE
analuciallompart/catalogo-api        v1        2207e1bd130a   14 minutes ago   246MB
analuciallompart/catalogo-frontend   v1        a4e5062b21a9   46 minutes ago   73.9MB
analuciallompart/catalogo-api        v2        615ac663be66   2 hours ago      246MB
```

En el push de `v2` la mayoría de las capas figura como `Layer already exists`:
comparte las capas con `v1` y solo sube la diferencia.

Nombres completos de las imágenes publicadas:

- `docker.io/analuciallompart/catalogo-api:v1`
- `docker.io/analuciallompart/catalogo-api:v2`
- `docker.io/analuciallompart/catalogo-frontend:v1`

---

## TP3 - Red, volumen y la aplicación completa

### Punto 1 - Red y volumen

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker network create catalogo-net
4dbe8a67e7e6471e6fadb2e4b74397fb32774089fec383b0459137d51ca71e87
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker volume create catalogo-db-data
catalogo-db-data
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker network ls
NETWORK ID     NAME           DRIVER    SCOPE
d79b2be52f57   bridge         bridge    local
4dbe8a67e7e6   catalogo-net   bridge    local
9f6b2db3a9b6   host           host      local
aca6d66c54bd   none           null      local
9af1e79bec64   red-solab      bridge    local
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker volume ls
DRIVER    VOLUME NAME
local     9d9dffc50ee424dd6e1dd8cd674b8dd473f9d84e96d8e70dcf4fc3c4223d0769
local     30a3dd36bdd2765d8b158665f7491ceb10c47ac44a5a6f74f620382d8421bb87
local     60ef91c6080314507a73e3b949177071865f12fea8b88a605cde242636cfed2d
local     70b1df82c386303b60c00c624be14a90209239343e5bb77de935302f013fcb12
local     78f934ef640f4fd29e4fb07b153a7d2d2c198d07aac1d364c7ba8d13b7669d0b
local     88eedd29a17720460a8526f450cb3059d7b71253edd184ba9d036776e29814a6
local     94ccbe2b96e3c01ebd8d11977b13f0d32935028cd733ebf8e6bf0e850fced994
local     8008a8ac6fcdd95640ac6e20052daf8720dc2be754981f79c1cdb91e2c07172e
local     9004ceee5c5db6972ed5bd4563573c843b19c0212eb97f074514d2acc7df4a6e
local     a6dd5594c748196e2a6992a8f48a0007f4846cda618e3344648bccd71f6033db
local     afa241de8fb39ad675b72f9817b9be4480e184d5195dca6ea023ec4c3ee8487a
local     c088583dd5d54fee2c05665a083e75f076afba3d7ffa2b32541a63231ba935cc
local     catalogo-db-data
local     dda832c98415013966f1c3fe42bc97d3cb76a69caec3457dc8414a6d8a6efc23
local     e56365f82975bec1d612cce73565f55d581b554d0040f2fe6174e776873a4403
local     f83b262c24251ba656bd438964d444c6f070d973915713a804e2dfb03a88669b
```

`catalogo-net` aparece con driver `bridge` y `catalogo-db-data` con driver
`local`. Los nombres hexadecimales son volúmenes anónimos que la imagen `mongo`
creó en cada `docker run` sin `-v` de las semanas anteriores; quedaron huérfanos
al borrar los contenedores. Se limpiaron con `docker volume prune -f`
(2,2 GB recuperados), que no toca los volúmenes con nombre.

### Punto 2 - La base de datos, sin puerto publicado

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-db `
>> --network catalogo-net `
>> -e MONGO_INITDB_ROOT_USERNAME=catalogo_user `
>> -e MONGO_INITDB_ROOT_PASSWORD=catalogo_pass `
>> -v catalogo-db-data:/data/db `
>> mongo:7
b0b423f134077bf6bf51318a255803e490d7d83af98c53e072ad08ce78d30c62
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Start-Sleep 10
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker logs catalogo-db 2>&1 | Select-String "Waiting for connections"

{"t":{"$date":"2026-10-10T16:27:29.607+00:00"},"s":"I",  "c":"NETWORK",  "id":23016,   "ctx":"listener","msg":"Waiting
for connections","attr":{"port":27017,"ssl":"off"}}
{"t":{"$date":"2026-10-10T16:27:32.640+00:00"},"s":"I",  "c":"NETWORK",  "id":23016,   "ctx":"listener","msg":"Waiting
for connections","attr":{"port":27017,"ssl":"off"}}

PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker ps
CONTAINER ID   IMAGE     COMMAND                  CREATED          STATUS          PORTS       NAMES
b0b423f13407   mongo:7   "docker-entrypoint.s…"   40 seconds ago   Up 40 seconds   27017/tcp   catalogo-db
```

"Waiting for connections" aparece dos veces: la primera es del mongod temporal
que crea el usuario y la segunda del definitivo, ya con autenticación. En
`docker ps`, la columna PORTS muestra `27017/tcp` sin flecha: el puerto existe
dentro del contenedor pero no está publicado en el anfitrión.

**Por qué no lleva `-p`.** La base es la capa más interna de la arquitectura:
solo la API le habla, y la API está en `catalogo-net`, donde la alcanza por
nombre sin necesidad de ningún puerto publicado. Publicar el 27017 en el
anfitrión abriría la base a cualquier proceso de la máquina sin que ningún
componente lo necesite. Al no publicarlo, la única forma de llegar a Mongo es
estar dentro de la red de la aplicación.

### Punto 3 - La API, alcanzando la base por nombre

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-api `
>> --network catalogo-net `
>> -e DB_HOST=catalogo-db `
>> -e DB_PORT=27017 `
>> -e DB_NAME=catalogodb `
>> -e DB_USER=catalogo_user `
>> -e DB_PASSWORD=catalogo_pass `
>> -e APP_VERSION=v1 `
>> -e ROOT_PATH=/api `
>> -e SEED_DEMO=true `
>> -p 8000:8000 `
>> catalogo-api:v1
74a03e280a196cc26328dc1c936cdcb767e5ccf13ae89475af22890d012755f4
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker logs catalogo-api
INFO:     Started server process [1]
INFO:     Waiting for application startup.
[2026-10-10T16:34:26+0000] INFO conexión a MongoDB establecida (base=catalogodb)
[2026-10-10T16:34:26+0000] INFO catálogo de demo sembrado (12 productos)
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

a) Resolución del nombre desde adentro de la API:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-api getent hosts catalogo-db
172.19.0.2      catalogo-db
```

b) Estado de la API:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> curl -s localhost:8000/health
{"status":"ok","db":"ok","version":"v1"}
```

c) Productos sembrados, consultando la API y la colección:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> (curl -s localhost:8000/productos | ConvertFrom-Json).Count
12
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet `
>> "mongodb://catalogo_user:catalogo_pass@localhost:27017/catalogodb?authSource=admin" --eval 'db.productos.countDocuments()'
12
```

`DB_HOST=catalogo-db` es un nombre, no una IP: lo resuelve el DNS interno de
`catalogo-net` (en este caso a `172.19.0.2`). En la red `bridge` por defecto
esa resolución no funcionaría.

### Punto 4 - Fallo de nombre vs. fallo de autenticación

a) API recreada con `DB_HOST=catalogo-bd` (nombre inexistente):

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-api `
>> --network catalogo-net `
>> -e DB_HOST=catalogo-bd `
>> -e DB_PORT=27017 `
>> -e DB_NAME=catalogodb `
>> -e DB_USER=catalogo_user `
>> -e DB_PASSWORD=catalogo_pass `
>> -e APP_VERSION=v1 `
>> -e ROOT_PATH=/api `
>> -e SEED_DEMO=true `
>> -p 8000:8000 `
>> catalogo-api:v1
f36754cd85d71bf7ec4cb062da25bbcdfe46160802c6ce896b84136d19b3f9bd
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Start-Sleep 5; docker logs catalogo-api
INFO:     Started server process [1]
INFO:     Waiting for application startup.
[2026-10-10T16:36:33+0000] WARNING intento 1/10 de conexión falló: No servers found yet, Timeout: 3.0s, Topology Description: <TopologyDescription id: 6aca698ec6cae8c4c4f766ca, topology_type: Unknown, servers: [<ServerDescription ('catalogo-bd', 27017) server_type: Unknown, rtt: None>]>
[2026-10-10T16:36:39+0000] WARNING intento 2/10 de conexión falló: catalogo-bd:27017: [Errno -2] Name or service not known (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms), Timeout: 3.0s, Topology Description: <TopologyDescription id: 6aca698ec6cae8c4c4f766ca, topology_type: Unknown, servers: [<ServerDescription ('catalogo-bd', 27017) server_type: Unknown, rtt: None, error=AutoReconnect('catalogo-bd:27017: [Errno -2] Name or service not known (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms)')>]>
```

b) mongosh sin `?authSource=admin`, desde un contenedor temporal en la red, y
la misma conexión con el parámetro:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm --network catalogo-net mongo:7 mongosh --quiet `
>> "mongodb://catalogo_user:catalogo_pass@catalogo-db:27017/catalogodb" --eval 'db.getName()'
MongoServerError: Authentication failed.
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run --rm --network catalogo-net mongo:7 mongosh --quiet `
>> "mongodb://catalogo_user:catalogo_pass@catalogo-db:27017/catalogodb?authSource=admin" --eval 'db.getName()'
catalogodb
```

c) El primer mensaje (`Name or service not known`) lo produce el cliente antes
de abrir ninguna conexión: no pudo traducir el nombre a una IP, así que nunca
llegó a la base; es un problema de red o de configuración. El segundo
(`Authentication failed`) lo produce el servidor Mongo como respuesta: la
conexión se estableció y el nombre `catalogo-db` resolvió, el motor recibió las
credenciales y las rechazó; la base se alcanzó y el problema está en la
autenticación (el usuario se buscó en `catalogodb` en vez de en `admin`).

API restablecida con la configuración correcta:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker rm -f catalogo-api
catalogo-api
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-api `
>> --network catalogo-net `
>> -e DB_HOST=catalogo-db `
>> -e DB_PORT=27017 `
>> -e DB_NAME=catalogodb `
>> -e DB_USER=catalogo_user `
>> -e DB_PASSWORD=catalogo_pass `
>> -e APP_VERSION=v1 `
>> -e ROOT_PATH=/api `
>> -e SEED_DEMO=true `
>> -p 8000:8000 `
>> catalogo-api:v1
fdb65dbe314502b266c51f9299fa95c87a960ef09a12b896a2346423667bd0ca
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> curl -s localhost:8000/health
{"status":"ok","db":"ok","version":"v1"}
```

### Punto 5 - El frontend fuera de la red

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-frontend `
>> -e API_HOST=catalogo-api `
>> -e API_PORT=8000 `
>> -p 3000:8080 `
>> catalogo-frontend:v1
95c2d006f5bbba94e86a69c0ab6fc44649f6fcdcb2c3fd24af4a5ec47bd92364
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker ps -a --filter "name=catalogo-frontend"
CONTAINER ID   IMAGE                  COMMAND                  CREATED          STATUS                      PORTS     NAMES
95c2d006f5bb   catalogo-frontend:v1   "/docker-entrypoint.…"   18 seconds ago   Exited (1) 13 seconds ago             catalogo-frontend
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker logs catalogo-frontend
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
10-listen-on-ipv6-by-default.sh: info: /etc/nginx/conf.d/default.conf differs from the packaged version
/docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh
/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
20-envsubst-on-templates.sh: Running envsubst on /etc/nginx/templates/default.conf.template to /etc/nginx/conf.d/default.conf
/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
/docker-entrypoint.sh: Configuration complete; ready for start up
2026/10/10 16:45:27 [emerg] 1#1: host not found in upstream "catalogo-api" in /etc/nginx/conf.d/default.conf:24
nginx: [emerg] host not found in upstream "catalogo-api" in /etc/nginx/conf.d/default.conf:24
```

Mensaje: `nginx: [emerg] host not found in upstream "catalogo-api"`. nginx
resuelve el nombre del `proxy_pass` una única vez, al iniciar, como parte de la
validación de su configuración; si el nombre no resuelve, considera la
configuración inválida y el proceso termina con código 1 (`Exited (1)`), sin
reintentar y sin arrancar en modo degradado. Como el contenedor estaba en la
red por defecto, sin DNS interno, `catalogo-api` no podía resolverse.

### Punto 6 - El frontend en la red

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker rm catalogo-frontend
catalogo-frontend
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-frontend `
>> --network catalogo-net `
>> -e API_HOST=catalogo-api `
>> -e API_PORT=8000 `
>> -p 3000:8080 `
>> catalogo-frontend:v1
33fc8f994ff84f03f5d8701789d107e878caa20f4b53ac15be16592baf98e374
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker ps
CONTAINER ID   IMAGE                  COMMAND                  CREATED          STATUS          PORTS                                         NAMES
33fc8f994ff8   catalogo-frontend:v1   "/docker-entrypoint.…"   5 seconds ago    Up 5 seconds    0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp   catalogo-frontend
fdb65dbe3145   catalogo-api:v1        "uvicorn main:app --…"   9 minutes ago    Up 9 minutes    0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp   catalogo-api
b0b423f13407   mongo:7                "docker-entrypoint.s…"   20 minutes ago   Up 20 minutes   27017/tcp                                     catalogo-db
```

La imagen es la misma (`catalogo-frontend:v1`) y no se reconstruyó nada: solo
cambió `--network catalogo-net`. Los tres contenedores quedan `Up`; solo el
frontend (3000) y la API (8000, depuración) publican puertos.

Captura de las herramientas de desarrollo (pestaña Network, filtro Fetch/XHR)
al crear un producto con imagen:

<img src="image.png" alt="Pestaña Network al crear un producto" width="500">

| Campo | Valor observado |
| --- | --- |
| Request URL | `http://localhost:3000/api/productos` |
| Request Method | `POST` |
| Status Code | `201 Created` |
| Remote Address | `[::1]:3000` |
| Server (respuesta) | `nginx/1.27.5` |
| Content-Length (pedido) | 386271 bytes (la imagen viaja en el JSON) |

La página envió el `POST` a `localhost:3000/api/productos`, es decir, al mismo
origen desde el que se sirvió, y no a `localhost:8000`. La respuesta la entrega
`nginx/1.27.5` y la dirección remota es el puerto 3000: el navegador solo habló
con el frontend. En la lista de solicitudes aparecen `productos`, `categorias` y
`health`, y **ninguna solicitud `OPTIONS`**: como el pedido no cruza orígenes,
el navegador no necesita el preflight de CORS. Quien habla con la API es nginx,
dentro de `catalogo-net`; el navegador nunca conoce la dirección del backend.

Productos a través del proxy, con el producto cargado (`tp3 docker`, SKU 2) al
final:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> curl -s localhost:3000/api/productos | ConvertFrom-Json | Select-Object id, sku, nombre, imagen

id                          sku nombre                                           imagen
--                          --- ------                                           ------
6aca6912de6edde0c4e296a9 999666 Apple iPhone 6 (Gold, 32 GB)                       True
6aca6912de6edde0c4e296af 379182 Apple iPhone 8 Plus (Silver, 64 GB)                True
6aca6912de6edde0c4e2969f 456654 Apple iPhone X (Space Gray, 256 GB)                True
6aca6912de6edde0c4e296a7 963852 Asus ZenFone Max M1 (Black, 32 GB) (3 GB RAM)      True
6aca6912de6edde0c4e296a3 123222 Honor 9N (Midnight Black, 32 GB) (3 GB RAM)        True
6aca6912de6edde0c4e296a5 741852 Lenovo K8 Note (Venom Black, 64 GB) (4 GB RAM)     True
6aca6912de6edde0c4e2969d 357842 OPPO K1 (Piano Black, 64 GB) (4 GB RAM)            True
6aca6912de6edde0c4e29699 852369 Redmi Y2 (Black, 32 GB) (3 GB RAM)                 True
6aca6912de6edde0c4e296ad 848484 Samsung Galaxy A8 Star (White, 64 GB) (6 GB RAM)   True
6aca6912de6edde0c4e296ab 332211 Samsung Galaxy A9 (Bubblegum Pink, 128 GB)         True
6aca6912de6edde0c4e2969b 159753 Samsung Galaxy M20 (Charcoal Black, 4+64GB)        True
6aca6912de6edde0c4e296a1 358426 Vivo V15 Pro (Topaz Blue, 128 GB) (6 GB RAM)       True
6aca6ccc185e7cc739faa55b      2 tp3 docker                                         True
```

### Punto 7 - El proxy y ROOT_PATH

a) La API directa y a través del proxy devuelven lo mismo. Sin el prefijo
`/api`, el frontend responde con el `index.html` de la SPA (falso positivo):

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> (curl -s localhost:8000/productos | ConvertFrom-Json).Count; (curl -s localhost:3000/api/productos | ConvertFrom-Json).Count
13
13
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> curl -s localhost:3000/productos | Select-Object -First 3
<!doctype html>
<html lang="es">
  <head>
```

b) Con `ROOT_PATH=/api`, `openapi.json` contiene la clave `servers`:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> (curl -s localhost:8000/openapi.json | ConvertFrom-Json).servers

url
---
/api
```

c) Con la API recreada con `ROOT_PATH=` (vacío), la clave `servers` desaparece:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker rm -f catalogo-api
catalogo-api
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-api `
>> --network catalogo-net `
>> -e DB_HOST=catalogo-db `
>> -e DB_PORT=27017 `
>> -e DB_NAME=catalogodb `
>> -e DB_USER=catalogo_user `
>> -e DB_PASSWORD=catalogo_pass `
>> -e APP_VERSION=v1 `
>> -e ROOT_PATH= `
>> -e SEED_DEMO=true `
>> -p 8000:8000 `
>> catalogo-api:v1
72281d322d026a4addea155e312bf7f32f24c5ff09e7c267ca666f99ab6b875e
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> (curl -s localhost:8000/openapi.json | ConvertFrom-Json).servers
```

Nota: el backend usa `/api` como valor por defecto cuando la variable no está
definida, por lo que para reproducir el caso "sin la variable" se la pasa vacía.
Luego se restableció la API con `ROOT_PATH=/api`.

d) Con `ROOT_PATH=/api`, la página `http://localhost:3000/api/docs` carga la
definición y arma todas las direcciones bajo `/api/...`, que es por donde el
proxy las reenvía: la documentación funciona. Sin el prefijo, la clave `servers`
no existe, Swagger pide `/openapi.json` a la raíz de `localhost:3000`, nginx no
lo trata como ruta de API y responde con el `index.html` de la aplicación, y la
página queda sin contenido (`Failed to load API definition`). `ROOT_PATH` no
cambia las rutas de la API: solo le informa bajo qué prefijo la ve el navegador.

### Punto 8 - Persistencia

Se elimina la base, se verifica el volumen, se recrea con las mismas opciones
del punto 2 y se reinicia la API:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker rm -f catalogo-db
catalogo-db
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker volume ls
DRIVER    VOLUME NAME
local     c648772f56a416321157bbf39487bfed34fd549e67a39cf54539991d374713cc
local     catalogo-db-data
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker run -d --name catalogo-db `
>> --network catalogo-net `
>> -e MONGO_INITDB_ROOT_USERNAME=catalogo_user `
>> -e MONGO_INITDB_ROOT_PASSWORD=catalogo_pass `
>> -v catalogo-db-data:/data/db `
>> mongo:7
44f28ed5a9048db96b9f05613530d2d2a6f67f93d74be0dad00f3b88c2e45714
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Start-Sleep 10; docker restart catalogo-api
catalogo-api
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> Start-Sleep 5; curl -s localhost:8000/health
{"status":"ok","db":"ok","version":"v1"}
```

Documentos en la colección y lista de productos después de recrear la base:

```
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> docker exec catalogo-db mongosh --quiet `
>> "mongodb://catalogo_user:catalogo_pass@localhost:27017/catalogodb?authSource=admin" --eval 'db.productos.countDocuments()'
13
PS C:\Users\analu\OneDrive\Desktop\catalogo-app> curl -s localhost:3000/api/productos | ConvertFrom-Json | Select-Object id, sku, nombre, imagen

id                          sku nombre                                           imagen
--                          --- ------                                           ------
6aca6912de6edde0c4e296a9 999666 Apple iPhone 6 (Gold, 32 GB)                       True
6aca6912de6edde0c4e296af 379182 Apple iPhone 8 Plus (Silver, 64 GB)                True
6aca6912de6edde0c4e2969f 456654 Apple iPhone X (Space Gray, 256 GB)                True
6aca6912de6edde0c4e296a7 963852 Asus ZenFone Max M1 (Black, 32 GB) (3 GB RAM)      True
6aca6912de6edde0c4e296a3 123222 Honor 9N (Midnight Black, 32 GB) (3 GB RAM)        True
6aca6912de6edde0c4e296a5 741852 Lenovo K8 Note (Venom Black, 64 GB) (4 GB RAM)     True
6aca6912de6edde0c4e2969d 357842 OPPO K1 (Piano Black, 64 GB) (4 GB RAM)            True
6aca6912de6edde0c4e29699 852369 Redmi Y2 (Black, 32 GB) (3 GB RAM)                 True
6aca6912de6edde0c4e296ad 848484 Samsung Galaxy A8 Star (White, 64 GB) (6 GB RAM)   True
6aca6912de6edde0c4e296ab 332211 Samsung Galaxy A9 (Bubblegum Pink, 128 GB)         True
6aca6912de6edde0c4e2969b 159753 Samsung Galaxy M20 (Charcoal Black, 4+64GB)        True
6aca6912de6edde0c4e296a1 358426 Vivo V15 Pro (Topaz Blue, 128 GB) (6 GB RAM)       True
6aca6ccc185e7cc739faa55b      2 tp3 docker                                         True
```

Tras eliminar y recrear el contenedor de la base, el volumen `catalogo-db-data`
persistió y la colección volvió a tener 13 documentos, incluido el producto
cargado en el punto 6 (`tp3 docker`) con su mismo `id`
(`6aca6ccc185e7cc739faa55b`) y su imagen (`True`). Los bytes de la imagen viven
dentro del documento de MongoDB, es decir, en el volumen, y no en el disco del
contenedor de la API: la API no guarda estado propio, y por eso puede
destruirse, reiniciarse o replicarse sin perder nada. Hubo que reiniciar la API
porque conservaba la conexión al contenedor anterior.

### Punto 9 - Orden de arranque

| Paso | Qué se crea | Qué falla si se invierte o se omite |
| --- | --- | --- |
| 1 | Red `catalogo-net` | Sin la red, `--network catalogo-net` falla con `network catalogo-net not found`; sin `--network`, los contenedores caen en la red por defecto, sin DNS, y no se encuentran por nombre. |
| 2 | Volumen `catalogo-db-data` | `docker run -v` lo crea si no existe, pero debe existir antes y sobrevivir después; si al recrear se usa otro volumen o una ruta local, los datos "desaparecen". |
| 3 | Base `catalogo-db` | Si la API arranca antes de que Mongo acepte conexiones, reintenta 10 veces (30 s) y, si no llega, termina con `Application startup failed`. |
| 4 | API `catalogo-api` | Si el frontend arranca antes que la API, nginx no resuelve `catalogo-api` al iniciar y muere con `host not found in upstream` (punto 5); no reintenta. |
| 5 | Frontend `catalogo-frontend` | Último porque depende de todo lo anterior. Único punto de entrada publicado (3000); el 8000 es solo depuración. |

**Limitación:** hoy este orden, con todos sus flags (`--network`, `-e`, `-v`,
`-p`), existe solo en la memoria de quien levanta la aplicación y en este
README; no hay ningún archivo ejecutable que lo reproduzca. Se resuelve la
semana siguiente con Docker Compose: toda la configuración declarada en un
único archivo y levantada con un comando, con `depends_on` para el orden.

---

## TP4 - Docker Compose y seguridad básica

### Punto 1 - docker-compose.yml

El archivo `docker-compose.yml` en la raíz del repo declara los tres servicios,
la red `catalogo-net` y el volumen `catalogo-db-data`, ambos con `name:`
explícito para que sean los mismos de la semana 3 (el volumen conserva el
catálogo). Las credenciales se leen de un `.env` no versionado (ver punto 9).
La base de datos no publica puertos. Antes del primer `up` se eliminaron los
contenedores y la red creados a mano en el TP3; el volumen se reutilizó.

```
PS> docker rm -f catalogo-frontend catalogo-api catalogo-db
catalogo-frontend
catalogo-api
catalogo-db
PS> docker network rm catalogo-net
catalogo-net
PS> docker volume ls
DRIVER    VOLUME NAME
local     3312d95beecc287b5b3733df71d3ae147863ba8a402d4ff27b6e763b9bd8b050
local     c648772f56a416321157bbf39487bfed34fd549e67a39cf54539991d374713cc
local     catalogo-db-data
```

### Punto 2 - Healthcheck de catalogo-db

```yaml
healthcheck:
  test:
    - CMD-SHELL
    - mongosh --quiet --eval "db.adminCommand('ping').ok" || exit 1
  interval: 5s
  timeout: 3s
  retries: 10
  start_period: 10s
```

El healthcheck ejecuta `db.adminCommand('ping')`, uno de los pocos comandos
que MongoDB responde sin autenticación porque no accede a datos. Por eso no
lleva credenciales, y esa es una ventaja frente a la variante B: en PostgreSQL
el chequeo necesita un usuario y la contraseña queda escrita en el comando del
healthcheck, visible con `docker inspect`; acá la contraseña no viaja en ningún
lado. Lo que **no** verifica: que `ping` responda prueba que `mongod` está vivo
y acepta conexiones, pero no que el usuario `catalogo_user` exista ni que la
contraseña configurada sea la correcta. La base puede figurar `healthy` y la
API fallar igualmente con `Authentication failed`, por ejemplo si el volumen ya
estaba inicializado con otras credenciales. Un healthcheck verifica lo que
verifica, no que todo funcione.

### Punto 3 - Healthcheck de catalogo-api

```yaml
healthcheck:
  test:
    - CMD
    - python
    - -c
    - "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
  interval: 5s
  timeout: 3s
  retries: 10
  start_period: 15s
```

Usa `urllib`, incluida con Python; si `/health` no responde 2xx, `urlopen`
lanza una excepción y el comando termina con código distinto de 0. No
corresponde instalar `curl` solo para esto: agregaría un paquete y sus
dependencias a una imagen construida para ser mínima (TP2), con más tamaño,
más superficie de ataque y más vulnerabilidades que escanear, para una función
que la imagen ya cumple con lo que trae. Además, como `/health` hace un `ping`
a Mongo con las credenciales de la API, este healthcheck sí verifica lo que el
de la base no podía.

### Punto 4 - Healthcheck de catalogo-frontend

```yaml
healthcheck:
  test:
    - CMD-SHELL
    - wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
  interval: 5s
  timeout: 3s
  retries: 5
  start_period: 5s
```

`wget` viene en BusyBox, ya presente en Alpine. Mide `/healthz`, que nginx
responde sin tocar la API: la salud del frontend no depende de la de la API.

### Punto 5 - depends_on con condición

**(a) `catalogo-api` → `catalogo-db`.** La API no solo necesita que el nombre
`catalogo-db` resuelva: tiene que conectarse y sembrar el catálogo. La forma
corta `depends_on: [catalogo-db]` espera a que el contenedor arranque, no a
que MongoDB acepte conexiones. Con `condition: service_healthy`, la API
arranca recién cuando el `ping` del healthcheck responde. La API además
reintenta la conexión durante unos 30 segundos; ese reintento es lo único que
subsistirá en Kubernetes, donde `depends_on` no existe.

**(b) `catalogo-frontend` → `catalogo-api`.** Lo que no puede faltar es algún
`depends_on`: sin él, Compose arranca todo a la vez, el frontend sale antes
que la API, nginx no resuelve el upstream y termina con `host not found in
upstream`. A nginx le basta con que el nombre resuelva, así que la forma corta
también funcionaría; `service_healthy` hace además que el frontend arranque
con la API ya respondiendo, sin devolver `502` en los primeros segundos.

### Punto 6 - Validar y levantar

```
PS> docker compose up --build -d
[+] Building 17.2s (34/34) FINISHED
...
 => [catalogo-api] resolving provenance for metadata file  0.0s
[+] Running 6/6
 ✔ catalogo-api:v1              Built  0.0s
 ✔ catalogo-frontend:v1         Built  0.0s
 ✔ Network catalogo-net         Created  0.1s
 ✔ Container catalogo-db        Healthy  6.6s
 ✔ Container catalogo-api       Healthy  12.2s
 ✔ Container catalogo-frontend  Started  12.4s
```

```
PS> docker compose ps
NAME                IMAGE                  COMMAND                  SERVICE             CREATED              STATUS                        PORTS
catalogo-api        catalogo-api:v1        "uvicorn main:app --…"   catalogo-api        About a minute ago   Up About a minute (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
catalogo-db         mongo:7                "docker-entrypoint.s…"   catalogo-db         About a minute ago   Up About a minute (healthy)   27017/tcp
catalogo-frontend   catalogo-frontend:v1   "/docker-entrypoint.…"   catalogo-frontend   About a minute ago   Up About a minute (healthy)   0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp
```

```
PS> docker compose logs -f catalogo-api
catalogo-api  | INFO:     Started server process [1]
catalogo-api  | INFO:     Waiting for application startup.
catalogo-api  | [2026-10-10T18:07:07+0000] INFO conexión a MongoDB establecida (base=catalogodb)
catalogo-api  | [2026-10-10T18:07:07+0000] INFO catálogo de demo sembrado (12 productos)
catalogo-api  | INFO:     Application startup complete.
catalogo-api  | INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
catalogo-api  | INFO:     127.0.0.1:33104 - "GET /health HTTP/1.1" 200 OK
catalogo-api  | INFO:     127.0.0.1:53858 - "GET /health HTTP/1.1" 200 OK
catalogo-api  | INFO:     127.0.0.1:53862 - "GET /health HTTP/1.1" 200 OK
catalogo-api  | INFO:     127.0.0.1:35944 - "GET /health HTTP/1.1" 200 OK
...
```

### Punto 7 - Ciclo de vida de los datos

```
PS> (curl -s localhost:3000/api/productos | ConvertFrom-Json).Count
13
PS> docker compose down
[+] Running 4/4
 ✔ Container catalogo-frontend  Removed  0.4s
 ✔ Container catalogo-api       Removed  1.0s
 ✔ Container catalogo-db        Removed  0.3s
 ✔ Network catalogo-net         Removed  0.4s
PS> docker volume ls
DRIVER    VOLUME NAME
local     7ae16ffdd6549c14d8913d8ac1fa7ff6e720a438115410eca15543cd123bc814
local     3312d95beecc287b5b3733df71d3ae147863ba8a402d4ff27b6e763b9bd8b050
local     c648772f56a416321157bbf39487bfed34fd549e67a39cf54539991d374713cc
local     catalogo-db-data
PS> docker compose up -d
time="2026-10-10T15:17:12-03:00" level=warning msg="volume \"catalogo-db-data\" already exists but was not created by Docker Compose. Use `external: true` to use an existing volume"
[+] Running 4/4
 ✔ Network catalogo-net         Created  0.0s
 ✔ Container catalogo-db        Healthy  5.9s
 ✔ Container catalogo-api       Healthy  11.6s
 ✔ Container catalogo-frontend  Started  11.8s
```

```
PS> (curl -s localhost:3000/api/productos | Out-String).Substring(0, 300)
[{"sku":999666,"categoria":"Apple","creado_en":"2026-10-10T16:34:26.117000","descripcion":"Clásico de 4.7\" con Touch ID y cuerpo de aluminio.","imagen_hash":"7e23251b780a76a1","imagen_tipo":"image/jpeg","nombre":"Apple iPhone 6 (Gold, 32 GB)","precio":44000,"stock":2,"id":"6aca6912de6edde0c4e296a9
```

`docker compose down` elimina los contenedores y la red del proyecto, todo lo
que el próximo `up` recrea idéntico; el volumen `catalogo-db-data` sobrevive y
por eso, tras `down` + `up`, el catálogo sigue completo (13 productos, el primero
es el cargado a mano en el TP3). El aviso `volume "catalogo-db-data" already
exists but was not created by Docker Compose` aparece porque el volumen se creó
a mano en el TP3; es solo una advertencia y Compose lo usa igual. `docker compose down
-v` elimina además los volúmenes declarados: los datos se pierden y el
siguiente `up` arranca con una base vacía que la API vuelve a sembrar con los
12 productos de ejemplo. `down -v` sirve para empezar de cero a propósito (por
ejemplo, para que las variables `MONGO_INITDB_*` vuelvan a aplicarse) y para
nada más.

### Punto 8 - Siembra idempotente

```
PS> (curl -s localhost:3000/api/productos | ConvertFrom-Json).Count
13
PS> docker compose up -d --force-recreate catalogo-api
time="2026-10-10T15:18:14-03:00" level=warning msg="volume \"catalogo-db-data\" already exists but was not created by Docker Compose. Use `external: true` to use an existing volume"
[+] Running 2/2
 ✔ Container catalogo-db   Healthy  1.4s
 ✔ Container catalogo-api  Started  1.7s
PS> docker compose logs catalogo-api | Select-String "sembrado"
catalogo-api  | [2026-10-10T18:18:17+0000] INFO catálogo de demo sembrado (12 productos)
PS> (curl -s localhost:3000/api/productos | ConvertFrom-Json).Count
13
```

Tras recrear la API con la base ya poblada, la siembra volvió a ejecutarse y
la cantidad de productos se mantuvo: la siembra hace un *upsert* por SKU
(actualiza el documento si existe, lo inserta si no), de modo que ejecutarla N
veces deja el mismo resultado. Esa idempotencia es la precondición para la
semana 6, cuando tres réplicas de la API arranquen a la vez y las tres siembren
sobre la misma base.

### Punto 9 - Contrato de variables

El archivo `.env.example` (versionado) documenta todas las variables de las
tres capas y qué componente consume cada una; el `.env` real contiene la
contraseña y figura en el `.gitignore`. Las variables fijas entre entornos
(`DB_HOST`, `DB_PORT`, `ROOT_PATH`, `SEED_DEMO`, `API_HOST`, `API_PORT`) van
directamente en el `docker-compose.yml`. Si se usara `MONGO_URI` en lugar de
las `DB_*`, esa cadena contiene la contraseña y debería ir completa en el
Secret de la semana 7, nunca en un ConfigMap.

```
PS> Select-String -Path .gitignore -Pattern "^\.env$"
.gitignore:3:.env
PS> git status --short
?? .env.example
?? docker-compose.yml
```

Límite: `.env` saca la contraseña de Git, no del contenedor; `docker compose
config` y `docker inspect` la siguen mostrando en texto plano.

### Punto 10 - Revisión de seguridad

```
PS> docker compose exec catalogo-api id
uid=1000(appuser) gid=1000(appuser) groups=1000(appuser)
PS> docker compose exec catalogo-frontend id
uid=101(nginx) gid=101(nginx) groups=101(nginx)
PS> docker compose exec catalogo-db id
uid=0(root) gid=0(root) groups=0(root)
```

```
PS> docker compose ps
NAME                IMAGE                  COMMAND                  SERVICE             CREATED         STATUS                   PORTS
catalogo-api        catalogo-api:v1        "uvicorn main:app --…"   catalogo-api        7 minutes ago   Up 7 minutes (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
catalogo-db         mongo:7                "docker-entrypoint.s…"   catalogo-db         8 minutes ago   Up 8 minutes (healthy)   27017/tcp
catalogo-frontend   catalogo-frontend:v1   "/docker-entrypoint.…"   catalogo-frontend   8 minutes ago   Up 8 minutes (healthy)   0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp
```

```
PS> docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --scanners vuln catalogo-api:v1
Report Summary (resumido: solo los objetivos con vulnerabilidades)
catalogo-api:v1 (debian 13.7)                                          debian       166
.../site-packages/pymongo-4.8.0.dist-info/METADATA                     python-pkg     4
.../site-packages/starlette-0.38.6.dist-info/METADATA                  python-pkg     7
usr/local/lib/python3.12/site-packages/pip-25.0.1.dist-info/METADATA   python-pkg     6

catalogo-api:v1 (debian 13.7)
Total: 166 (UNKNOWN: 3, LOW: 61, MEDIUM: 58, HIGH: 44, CRITICAL: 0)

Python (python-pkg)
Total: 17 (UNKNOWN: 0, LOW: 2, MEDIUM: 10, HIGH: 5, CRITICAL: 0)
```

```
PS> docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --scanners vuln catalogo-frontend:v1
Report Summary
catalogo-frontend:v1 (alpine 3.21.3)   alpine   159

catalogo-frontend:v1 (alpine 3.21.3)
Total: 159 (UNKNOWN: 0, LOW: 42, MEDIUM: 76, HIGH: 39, CRITICAL: 2)
```

| Revisión | catalogo-db | catalogo-api | catalogo-frontend |
| --- | --- | --- | --- |
| Usuario del proceso (`id`) | `root` (uid 0; la imagen oficial baja a `mongodb` con gosu al arrancar `mongod`) | `appuser` (uid 1000) | `nginx` (uid 101) |
| Puertos publicados | ninguno (`27017/tcp` solo en la red) | `8000:8000`, solo depuración; en la semana 6 pasa a ser interno | `3000:8080`, único punto de entrada |
| Vulnerabilidades, sistema base | no escaneada (imagen oficial) | 166 (Debian 13.7) · 2 con Fixed Version | 159 (Alpine 3.21.3) · 159 con Fixed Version (2 CRITICAL) |
| Vulnerabilidades, dependencias | — | 17 (Python: pymongo 4, starlette 7, pip 6) · 17 con Fixed Version | — (sin runtime: solo archivos estáticos) |

Las dos imágenes propias corren con un usuario distinto de root (`appuser` uid
1000 y `nginx` uid 101); la base muestra `root` porque `docker compose exec`
abre un proceso nuevo con el usuario de la imagen, aunque `mongod` corre como
`mongodb`. En la API, de las 166 vulnerabilidades del sistema base Debian solo 2
tienen versión corregida (`liblzma5`); el resto se documenta y se decide:
aceptarlas o cambiar de base. Las 17 de las dependencias de Python (`pymongo`,
`starlette` y `pip`) tienen todas versión corregida: se resuelven actualizando
`requirements.txt` y reconstruyendo. En el frontend, las 159 vulnerabilidades
(2 críticas) tienen parche porque la base Alpine 3.21.3 quedó vieja: se resuelven
reconstruyendo sobre una versión más nueva de `nginx-unprivileged`.

### Punto 11 - Mínimo privilegio

```
PS> docker compose up -d
time="2026-10-10T15:34:43-03:00" level=warning msg="volume \"catalogo-db-data\" already exists but was not created by Docker Compose. Use `external: true` to use an existing volume"
[+] Running 3/3
 ✘ Container catalogo-db        Error  5.9s
 ✔ Container catalogo-api       Recreated  4.3s
 ✔ Container catalogo-frontend  Recreated  0.5s
dependency failed to start: container catalogo-db exited (1)
PS> docker compose logs catalogo-db
catalogo-db  | find: '/data/db/journal': Permission denied
catalogo-db  | find: '/data/db/.mongodb': Permission denied
catalogo-db  | find: '/data/db/diagnostic.data': Permission denied
PS> docker compose ps -a
NAME                IMAGE                  COMMAND                  SERVICE             CREATED              STATUS                          PORTS
catalogo-api        catalogo-api:v1        "uvicorn main:app --…"   catalogo-api        About a minute ago   Created
catalogo-db         mongo:7                "docker-entrypoint.s…"   catalogo-db         About a minute ago   Exited (1) About a minute ago
catalogo-frontend   catalogo-frontend:v1   "/docker-entrypoint.…"   catalogo-frontend   About a minute ago   Created
```

```
PS> docker compose up -d; Start-Sleep 20; docker compose ps
time="2026-10-10T15:53:13-03:00" level=warning msg="volume \"catalogo-db-data\" already exists but was not created by Docker Compose. Use `external: true` to use an existing volume"
[+] Running 3/3
 ✔ Container catalogo-db        Healthy  0.5s
 ✔ Container catalogo-api       Healthy  5.7s
 ✔ Container catalogo-frontend  Started  0.2s
NAME                IMAGE                  COMMAND                  SERVICE             CREATED          STATUS                    PORTS
catalogo-api        catalogo-api:v1        "uvicorn main:app --…"   catalogo-api        18 minutes ago   Up 26 seconds (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
catalogo-db         mongo:7                "docker-entrypoint.s…"   catalogo-db         45 seconds ago   Up 44 seconds (healthy)   27017/tcp
catalogo-frontend   catalogo-frontend:v1   "/docker-entrypoint.…"   catalogo-frontend   18 minutes ago   Up 20 seconds (healthy)   0.0.0.0:3000->8080/tcp, [::]:3000->8080/tcp
```

```
PS> docker inspect --format '{{.HostConfig.CapDrop}} {{.HostConfig.CapAdd}}' catalogo-api catalogo-frontend catalogo-db
[ALL] []
[ALL] []
[ALL] [CAP_CHOWN CAP_DAC_OVERRIDE CAP_SETGID CAP_SETUID]
```

Con `cap_drop: [ALL]` en los tres servicios, `catalogo-api` y
`catalogo-frontend` siguieron funcionando: corren como usuarios sin privilegios
desde el primer instante (`appuser` y `nginx`), escuchan en puertos altos (8000
y 8080) y no realizan ninguna operación que requiera una capability.
`catalogo-db` terminó con `find: '/data/db/journal': Permission denied`: la
imagen oficial de MongoDB arranca como root, recorre el directorio de datos
para dejarlo a nombre del usuario `mongodb` (`find` + `chown`) y luego cambia a
ese usuario con `gosu` (`setuid`/`setgid`); sin capabilities, root no puede
entrar a las carpetas de `mongodb`, ni cambiar dueños, ni cambiar de usuario. Agregando de a una y leyendo el error en cada paso,
la lista final es:

```yaml
catalogo-db:
  cap_drop: [ALL]
  cap_add: [SETGID, SETUID, CHOWN, DAC_OVERRIDE]
```

- `SETUID` / `SETGID`: pasar de root al usuario `mongodb`.
- `CHOWN`: dejar los archivos de `/data/db` a nombre de `mongodb`.
- `DAC_OVERRIDE`: que root pueda recorrer `/data/db` aunque las carpetas sean de
  `mongodb` con permisos cerrados. Hizo falta porque el volumen ya traía datos
  del TP3.

Nota: al cambiar `cap_add` hay que recrear el contenedor (`docker compose up -d
--force-recreate catalogo-db`); mientras no se recreó, `docker inspect` seguía
mostrando solo `[CAP_SETGID]` y el error se repetía.

La base necesita capabilities porque su propio proceso de arranque hace
trabajo de root antes de bajar de privilegios; las otras dos capas no, porque
nunca son root.

### Punto 12 - Compose frente a los docker run de la semana 3

| Semana 3 (docker run) | Semana 4 (docker-compose.yml) |
| --- | --- |
| `docker network create catalogo-net` | bloque `networks:` con `name: catalogo-net`; la crea el `up` |
| `docker volume create catalogo-db-data` | bloque `volumes:` con `name: catalogo-db-data` |
| `--name X` | `container_name: X` |
| `--network catalogo-net` en cada run | `networks: [catalogo-net]` en cada servicio |
| `-v catalogo-db-data:/data/db` | `volumes: [catalogo-db-data:/data/db]` |
| `-e VAR=valor` (diez veces, con la contraseña a la vista) | `environment:` con `${VAR}` leídas de `.env`, fuera de Git |
| `-p 3000:8080`, `-p 8000:8000` | `ports:` |
| `docker build -t catalogo-api:v1 ./backend` | `build: ./backend` + `image: catalogo-api:v1` |
| el orden de tipeo y el `Start-Sleep 10` entre base y API (memoria) | `depends_on` con `condition: service_healthy` (declarado) |
| nada | `healthcheck` en los tres servicios: Compose sabe cuándo cada capa está lista |
| nada | `cap_drop: [ALL]` y `cap_add` mínimo: privilegios explícitos |
| cuatro comandos, catorce flags | `docker compose up -d` / `docker compose down` |

**Qué desapareció:** los comandos sueltos, el orden en la memoria de quien
levanta el proyecto, la espera manual entre base y API, la contraseña escrita
en la terminal. **Qué apareció:** un archivo versionado que es la única fuente
de verdad, healthchecks que definen "listo", dependencias declaradas, variables
sensibles fuera del repo y privilegios mínimos. Este archivo es la referencia
contra la que, desde la semana 5, se escriben los manifiestos de Kubernetes:
cada servicio se vuelve un manifiesto, `ports` un Service, `healthcheck` una
probe, y `depends_on` desaparece (solo queda el reintento de la API).