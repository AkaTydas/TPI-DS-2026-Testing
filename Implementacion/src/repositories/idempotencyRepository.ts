import { dbM9 } from '../config/database.js';
import { RegistroIdempotencia } from '../domain/types.js';

export class IdempotencyRepository {
  public static buscar(clave: string): RegistroIdempotencia | null {
    const stmt = dbM9.prepare('SELECT * FROM idempotencia WHERE clave = ?');
    const row = stmt.get(clave) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      clave: row.clave as string,
      codigoEstado: row.codigo_estado as number,
      cuerpoRespuesta: row.cuerpo_respuesta as string,
      creadoEn: row.creado_en as string
    };
  }

  public static guardar(clave: string, codigoEstado: number, cuerpoRespuesta: unknown): void {
    const stmt = dbM9.prepare(`
      INSERT OR REPLACE INTO idempotencia (clave, codigo_estado, cuerpo_respuesta, creado_en)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      clave,
      codigoEstado,
      typeof cuerpoRespuesta === 'string' ? cuerpoRespuesta : JSON.stringify(cuerpoRespuesta),
      new Date().toISOString()
    );
  }
}
