import { urlImagen } from "../api.js";

const moneda = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const precio = (n) => `$ ${moneda.format(n ?? 0)}`;

function EstadoStock({ stock }) {
  if (stock === 0) return <span className="pill pill-sin">Sin stock</span>;
  if (stock <= 5) return <span className="pill pill-bajo">Últimas {stock} unidades</span>;
  return <span className="pill pill-ok">{stock} en stock</span>;
}

function ProductoCard({ producto, onEditar, onBorrar }) {
  const imagen = urlImagen(producto);
  return (
    <li className="ficha">
      <div className="ficha-imagen">
        {imagen ? (
          <img src={imagen} alt={producto.nombre} loading="lazy" />
        ) : (
          <span className="sin-imagen" aria-hidden="true">
            {producto.nombre.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="etiqueta-categoria">{producto.categoria}</span>
      </div>

      <div className="ficha-cuerpo">
        <h2 title={producto.nombre}>{producto.nombre}</h2>
        {producto.descripcion && <p className="descripcion">{producto.descripcion}</p>}
        <p className="sku">SKU {producto.sku}</p>
      </div>

      <div className="ficha-pie">
        <div className="precio-linea">
          <span className="precio">{precio(producto.precio)}</span>
          <EstadoStock stock={producto.stock ?? 0} />
        </div>
        <div className="acciones">
          <button type="button" className="secundario" onClick={() => onEditar(producto)}>
            Editar
          </button>
          <button type="button" className="peligro" onClick={() => onBorrar(producto)}>
            Eliminar
          </button>
        </div>
      </div>
    </li>
  );
}

export default function ProductoGrid({ productos, onEditar, onBorrar }) {
  if (productos.length === 0) {
    return (
      <div className="vacio">
        <p>No hay productos que coincidan con la búsqueda.</p>
      </div>
    );
  }
  return (
    <ul className="grilla">
      {productos.map((producto) => (
        <ProductoCard
          key={producto.id}
          producto={producto}
          onEditar={onEditar}
          onBorrar={onBorrar}
        />
      ))}
    </ul>
  );
}
