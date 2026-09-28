import { useCallback, useEffect, useState } from "react";
import {
  actualizarProducto,
  borrarProducto,
  crearProducto,
  getHealth,
  listarCategorias,
  listarProductos,
} from "./api.js";
import Navbar from "./components/Navbar.jsx";
import Filtros from "./components/Filtros.jsx";
import ProductoGrid from "./components/ProductoGrid.jsx";
import ProductoModal from "./components/ProductoModal.jsx";

// Cada cuánto se vuelve a consultar /api/health. 5 s es suficientemente rápido
// para que un rolling update se vea en vivo en el badge sin recargar la página.
const INTERVALO_HEALTH_MS = 5000;
const ESPERA_BUSQUEDA_MS = 300;

export default function App() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplicada, setBusquedaAplicada] = useState("");
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enEdicion, setEnEdicion] = useState(null); // null | {} | producto

  // La búsqueda no dispara un request por tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusquedaAplicada(busqueda.trim()), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [busqueda]);

  const refrescar = useCallback(async () => {
    try {
      const [lista, cats] = await Promise.all([
        listarProductos({ categoria, q: busquedaAplicada }),
        listarCategorias(),
      ]);
      setProductos(lista);
      setCategorias(cats);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [categoria, busquedaAplicada]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  useEffect(() => {
    const consultar = () => getHealth().then(setHealth).catch(() => setHealth(null));
    consultar();
    const id = setInterval(consultar, INTERVALO_HEALTH_MS);
    return () => clearInterval(id);
  }, []);

  const guardar = async (producto) => {
    // Deja que el modal muestre el error del backend sin cerrarse: por eso no
    // se atrapa acá (409 por SKU repetido, 413 por imagen grande, etc.).
    if (enEdicion?.id) await actualizarProducto(enEdicion.id, producto);
    else await crearProducto(producto);
    setEnEdicion(null);
    await refrescar();
  };

  const eliminar = async (producto) => {
    if (!window.confirm(`¿Eliminar "${producto.nombre}" del catálogo?`)) return;
    try {
      await borrarProducto(producto.id);
      await refrescar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Navbar
        health={health}
        busqueda={busqueda}
        onBuscar={setBusqueda}
        onNuevo={() => setEnEdicion({})}
      />

      <main className="contenedor">
        {/* El banner de error no reemplaza a la página: el frontend sigue
            sirviéndose aunque catalogo-api esté caída. Es la demostración
            visual de que son capas separadas. */}
        {error && (
          <div className="alerta" role="alert">
            <strong>No se puede contactar a catalogo-api.</strong> {error}
          </div>
        )}

        <Filtros
          categorias={categorias}
          seleccionada={categoria}
          onSeleccionar={setCategoria}
          total={productos.length}
          cargando={cargando}
        />

        {cargando ? (
          <p className="vacio">Cargando catálogo…</p>
        ) : (
          <ProductoGrid
            productos={productos}
            onEditar={setEnEdicion}
            onBorrar={eliminar}
          />
        )}
      </main>

      {enEdicion && (
        <ProductoModal
          producto={enEdicion}
          categorias={categorias}
          onGuardar={guardar}
          onCerrar={() => setEnEdicion(null)}
        />
      )}
    </>
  );
}
