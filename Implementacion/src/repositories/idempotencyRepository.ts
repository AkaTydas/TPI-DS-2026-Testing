import { dbM9 } from '../config/database.js';
import { RegistroIdempotencia, EstadoIdempotencia } from '../domain/types.js';

export class IdempotencyRepository {
  public static buscar(clave: string): RegistroIdempotencia | null {
    const stmt = dbM9.prepare('SELECT * FROM idempotencia WHERE clave = ?');
    const row = stmt.get(clave) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      clave: row.clave as string,
      estado: (row.estado as EstadoIdempotencia) || 'COMPLETADO',
      codigoEstado: row.codigo_estado !== null ? Number(row.codigo_estado) : null,
      cuerpoRespuesta: (row.cuerpo_respuesta as string) || null,
      creadoEn: row.creado_en as string
    };
  }

  /**
   * Intenta reservar la clave atómicamente al inicio del flujo (Candado Anti-TOCTOU).
   * Si la clave ya existe, detecta si está EN_PROCESO o ya COMPLETADA.
   */
  public static intentarReservar(clave: string): {
    exito: boolean;
    estado: EstadoIdempotencia;
    registro?: RegistroIdempotencia;
  } {
    const ahora = new Date().toISOString();
    try {
      const stmt = dbM9.prepare(`
        INSERT INTO idempotencia (clave, estado, codigo_estado, cuerpo_respuesta, creado_en)
        VALUES (?, 'EN_PROCESO', 0, '', ?)
      `);
      stmt.run(clave, ahora);
      return { exito: true, estado: 'EN_PROCESO' };
    } catch (err: unknown) {
      // Colisión de clave primaria: la clave ya fue registrada previamente
      const existente = this.buscar(clave);
      if (existente) {
        if (existente.estado === 'COMPLETADO') {
          return { exito: false, estado: 'COMPLETADO', registro: existente };
        }
        return { exito: false, estado: 'EN_PROCESO', registro: existente };
      }
      console.error('[IdempotencyRepository] Error inesperado en intentarReservar:', err);
      throw err;
    }
  }

  /**
   * Actualiza el registro de idempotencia al estado final COMPLETADO con la respuesta.
   */
  public static completar(clave: string, codigoEstado: number, cuerpoRespuesta: unknown): void {
    const stmt = dbM9.prepare(`
      UPDATE idempotencia 
      SET estado = 'COMPLETADO', codigo_estado = ?, cuerpo_respuesta = ?
      WHERE clave = ?
    `);

    stmt.run(
      codigoEstado,
      typeof cuerpoRespuesta === 'string' ? cuerpoRespuesta : JSON.stringify(cuerpoRespuesta),
      clave
    );
  }

  /**
   * En caso de error previo o aborto temprano, libera el candado EN_PROCESO.
   */
  public static liberar(clave: string): void {
    const stmt = dbM9.prepare(`
      DELETE FROM idempotencia 
      WHERE clave = ? AND estado = 'EN_PROCESO'
    `);
    stmt.run(clave);
  }

  /**
   * Compatibilidad hacia atrás: guarda o reemplaza directamente.
   */
  public static guardar(clave: string, codigoEstado: number, cuerpoRespuesta: unknown): void {
    const stmt = dbM9.prepare(`
      INSERT OR REPLACE INTO idempotencia (clave, estado, codigo_estado, cuerpo_respuesta, creado_en)
      VALUES (?, 'COMPLETADO', ?, ?, ?)
    `);

    stmt.run(
      clave,
      codigoEstado,
      typeof cuerpoRespuesta === 'string' ? cuerpoRespuesta : JSON.stringify(cuerpoRespuesta),
      new Date().toISOString()
    );
  }
}
