import { useEffect, useRef, useState } from "react";
import { urlImagen } from "../api.js";

// Tiene que coincidir con IMAGEN_MAX_BYTES del backend. Se valida en los dos
// lados a propósito: el cliente da un mensaje inmediato, pero la validación
// que vale es la del servidor (el cliente se puede saltear).
const IMAGEN_MAX_KB = 512;
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const vacio = {
  sku: "",
  nombre: "",
  categoria: "",
  precio: "",
  stock: "0",
  descripcion: "",
};

export default function ProductoModal({ producto, categorias, onGuardar, onCerrar }) {
  const esNuevo = !producto.id;
  const [campos, setCampos] = useState({
    ...vacio,
    ...Object.fromEntries(
      Object.keys(vacio).map((k) => [k, producto[k] != null ? String(producto[k]) : vacio[k]]),
    ),
  });
  // undefined = no se toca la imagen · "" = se borra · data URI = se reemplaza
  const [imagen, setImagen] = useState(undefined);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const archivoRef = useRef(null);

  useEffect(() => {
    const cerrarConEsc = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", cerrarConEsc);
    return () => document.removeEventListener("keydown", cerrarConEsc);
  }, [onCerrar]);

  const set = (clave) => (e) => setCampos({ ...campos, [clave]: e.target.value });

  const elegirArchivo = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
      setError(`Formato no soportado (${archivo.type || "desconocido"}). Usá JPG, PNG, WEBP o GIF.`);
      e.target.value = "";
      return;
    }
    if (archivo.size > IMAGEN_MAX_KB * 1024) {
      setError(
        `La imagen pesa ${Math.round(archivo.size / 1024)} KB y el máximo es ${IMAGEN_MAX_KB} KB.`,
      );
      e.target.value = "";
      return;
    }
    // Se envía como data URI dentro del JSON: un solo formato de request para
    // toda la API. El backend la decodifica y la guarda en Mongo.
    const lector = new FileReader();
    lector.onload = () => {
      setImagen(lector.result);
      setError(null);
    };
    lector.onerror = () => setError("No se pudo leer el archivo.");
    lector.readAsDataURL(archivo);
  };

  const quitarImagen = () => {
    setImagen("");
    if (archivoRef.current) archivoRef.current.value = "";
  };

  const vistaPrevia =
    imagen === undefined ? urlImagen(producto) : imagen === "" ? null : imagen;

  const submit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        sku: Number(campos.sku),
        nombre: campos.nombre.trim(),
        categoria: campos.categoria.trim() || "General",
        precio: Number(campos.precio || 0),
        stock: Number(campos.stock || 0),
        descripcion: campos.descripcion.trim(),
        ...(imagen === undefined ? {} : { imagen }),
      });
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-modal">
        <div className="modal-cabecera">
          <div>
            <h2 id="titulo-modal">{esNuevo ? "Nuevo producto" : "Editar producto"}</h2>
            <p className="ayuda">
              {esNuevo
                ? "Completá los datos del producto. Los campos marcados con * son obligatorios."
                : `Modificando “${producto.nombre}”.`}
            </p>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={submit} className="modal-cuerpo">
          {error && (
            <div className="alerta" role="alert">
              {error}
            </div>
          )}

          <fieldset>
            <legend>Identificación</legend>
            <div className="campos campos-identificacion">
              <label className="campo">
                <span className="etiqueta">SKU *</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={campos.sku}
                  onChange={set("sku")}
                  required
                  autoFocus={esNuevo}
                />
                <small>Código único. Si ya existe, la API responde 409.</small>
              </label>

              <label className="campo campo-ancho">
                <span className="etiqueta">Nombre *</span>
                <input
                  type="text"
                  value={campos.nombre}
                  onChange={set("nombre")}
                  maxLength={200}
                  required
                  placeholder="Ej.: Samsung Galaxy M20 (Charcoal Black, 4+64GB)"
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Comercialización</legend>
            <div className="campos">
              <label className="campo">
                <span className="etiqueta">Precio *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={campos.precio}
                  onChange={set("precio")}
                  required
                  placeholder="0.00"
                />
                <small>Sin símbolo de moneda.</small>
              </label>

              <label className="campo">
                <span className="etiqueta">Stock</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={campos.stock}
                  onChange={set("stock")}
                />
                <small>0 muestra la ficha como “Sin stock”.</small>
              </label>

              <label className="campo">
                <span className="etiqueta">Categoría</span>
                <input
                  type="text"
                  list="lista-categorias"
                  value={campos.categoria}
                  onChange={set("categoria")}
                  maxLength={60}
                  placeholder="General"
                />
                <datalist id="lista-categorias">
                  {categorias.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <small>Elegí una existente o escribí una nueva.</small>
              </label>
            </div>

            <label className="campo campo-ancho">
              <span className="etiqueta">Descripción</span>
              <textarea
                value={campos.descripcion}
                onChange={set("descripcion")}
                rows={3}
                maxLength={500}
                placeholder="Características principales que se muestran en la ficha."
              />
              <small>{campos.descripcion.length}/500 caracteres.</small>
            </label>
          </fieldset>

          <fieldset>
            <legend>Imagen</legend>
            <div className="campo-imagen">
              <div className="vista-previa">
                {vistaPrevia ? (
                  <img src={vistaPrevia} alt="Vista previa del producto" />
                ) : (
                  <span className="sin-imagen">Sin imagen</span>
                )}
              </div>
              <div className="campo">
                <input
                  ref={archivoRef}
                  type="file"
                  accept={TIPOS_ACEPTADOS.join(",")}
                  onChange={elegirArchivo}
                />
                <small>
                  Opcional. JPG, PNG, WEBP o GIF, hasta {IMAGEN_MAX_KB} KB. Se guarda en
                  MongoDB junto con el producto.
                </small>
                {vistaPrevia && (
                  <button type="button" className="secundario" onClick={quitarImagen}>
                    Quitar imagen
                  </button>
                )}
              </div>
            </div>
          </fieldset>

          <div className="modal-pie">
            <button type="button" className="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : esNuevo ? "Crear producto" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
