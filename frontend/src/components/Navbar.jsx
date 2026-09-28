import VersionBadge from "./VersionBadge.jsx";

export default function Navbar({ health, busqueda, onBuscar, onNuevo }) {
  return (
    <header className="navbar">
      <div className="contenedor navbar-interior">
        <div className="marca">
          <span className="marca-logo" aria-hidden="true">
            ▤
          </span>
          <div>
            <strong>Catálogo</strong>
            <small>catalogo-app · Variante C</small>
          </div>
        </div>

        <div className="buscador">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            aria-label="Buscar productos"
          />
        </div>

        <div className="navbar-acciones">
          <VersionBadge health={health} />
          <button type="button" onClick={onNuevo}>
            + Nuevo producto
          </button>
        </div>
      </div>
    </header>
  );
}
