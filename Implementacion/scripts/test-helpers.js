import { inicializarBasesDeDatos, dbM9, dbM7, dbM5 } from '../dist/config/database.js';

export function limpiarBases() {
  inicializarBasesDeDatos();
  dbM9.exec('DELETE FROM reservas; DELETE FROM historial_reservas; DELETE FROM idempotencia;');
  dbM7.exec('DELETE FROM transacciones;');
  dbM5.exec('DELETE FROM solicitudes_despacho;');
}
