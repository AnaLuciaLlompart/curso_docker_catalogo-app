// Cliente HTTP de catalogo-api.
//
// Acá no hay ninguna URL absoluta ni ningún import.meta.env.VITE_*: Vite
// hornea las variables VITE_* en TIEMPO DE BUILD, así que usarlas obligaría a
// construir una imagen distinta por cada entorno.
//
// En vez de eso el SPA pide siempre una ruta RELATIVA de su propio origen, y
// nginx —configurado al ARRANCAR el contenedor con envsubst— decide a qué
// backend reenviar. Una imagen, todos los entornos. Y como todo es mismo
// origen, no hay CORS: el backend no necesita ningún header especial.
const BASE = "/api";

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return null;
  const body = await res.text();
  if (!res.ok) throw new Error(mensajeDeError(res.status, body));
  return body ? JSON.parse(body) : null;
}

// FastAPI devuelve {"detail": ...}; los errores de validación de Pydantic
// vienen como una lista de objetos. Se traduce a algo legible para el usuario.
function mensajeDeError(status, body) {
  try {
    const { detail } = JSON.parse(body);
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((e) => `${e.loc?.at(-1) ?? "campo"}: ${e.msg}`).join(" · ");
    }
  } catch {
    /* el cuerpo no era JSON: se cae al mensaje genérico */
  }
  return `HTTP ${status}`;
}

export const getHealth = () => req("/health");
export const listarCategorias = () => req("/categorias");

export const listarProductos = ({ categoria = "", q = "" } = {}) => {
  const params = new URLSearchParams();
  if (categoria) params.set("categoria", categoria);
  if (q) params.set("q", q);
  const query = params.toString();
  return req(query ? `/productos?${query}` : "/productos");
};

// El id es un ObjectId de Mongo serializado como string: se trata como opaco
// (nada de parseInt) y se interpola tal cual en la URL.
export const crearProducto = (producto) =>
  req("/productos", { method: "POST", body: JSON.stringify(producto) });
export const actualizarProducto = (id, producto) =>
  req(`/productos/${id}`, { method: "PUT", body: JSON.stringify(producto) });
export const borrarProducto = (id) => req(`/productos/${id}`, { method: "DELETE" });

// La imagen no viaja en el JSON: se pide por su propia URL, que el navegador
// cachea. El hash va como query para invalidar el cache si la imagen cambia.
export const urlImagen = (producto) =>
  producto.imagen
    ? `${BASE}/productos/${producto.id}/imagen?v=${producto.imagen_hash ?? ""}`
    : null;
