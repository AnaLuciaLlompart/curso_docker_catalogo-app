export default function Filtros({ categorias, seleccionada, onSeleccionar, total, cargando }) {
  return (
    <div className="filtros">
      <div className="chips">
        <button
          type="button"
          className={seleccionada === "" ? "chip chip-activo" : "chip"}
          onClick={() => onSeleccionar("")}
        >
          Todas
        </button>
        {categorias.map((cat) => (
          <button
            type="button"
            key={cat}
            className={seleccionada === cat ? "chip chip-activo" : "chip"}
            onClick={() => onSeleccionar(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      {!cargando && (
        <span className="conteo">
          {total} {total === 1 ? "producto" : "productos"}
        </span>
      )}
    </div>
  );
}
