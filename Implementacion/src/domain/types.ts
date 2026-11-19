export type EstadoReserva = 
  | 'CONFIRMADA' 
  | 'EN_PROCESO_DESPACHO' 
  | 'ACTIVADA' 
  | 'VENCIDA';

export type EstadoPago = 
  | 'PRE_AUTORIZADO' 
  | 'LIBERADO' 
  | 'COBRADO';

export type EstadoDespacho = 
  | 'PENDIENTE' 
  | 'ASIGNADO' 
  | 'SIN_CONDUCTOR';

export interface Reserva {
  id: string;
  clienteId: string; // Escalar UUID (Sin FK hacia M2)
  origen: string;
  destino: string;
  tarifaEstimada: number;
  estado: EstadoReserva;
  solicitudDespachoId: string | null;
  conductorId: string | null; // Escalar UUID (Sin FK hacia M5)
  claveIdempotencia: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface HistorialEvento {
  id?: number;
  reservaId: string;
  tipoEvento: string;
  estadoAnterior: string;
  estadoNuevo: string;
  actor: string;
  detalles: Record<string, unknown>;
  fechaHora: string;
}

export type EstadoIdempotencia = 'EN_PROCESO' | 'COMPLETADO';

export interface RegistroIdempotencia {
  clave: string;
  estado: EstadoIdempotencia;
  codigoEstado: number | null;
  cuerpoRespuesta: string | null;
  creadoEn: string;
}

export interface TransaccionPagoM7 {
  id: string;
  reservaId: string;
  monto: number;
  estado: EstadoPago;
  fechaHora: string;
}

export interface SolicitudDespachoM5 {
  id: string;
  reservaId: string;
  conductorId: string | null;
  conductorNombre?: string | null;
  vehiculo?: string | null;
  estado: EstadoDespacho;
  fechaHora: string;
}

export interface SagaPasoLog {
  paso: string;
  tipo: 'Tc' | 'Tp' | 'Tr' | 'C2' | 'C1';
  servicio: 'M9' | 'M7' | 'M5' | 'M8';
  descripcion: string;
  resultado: 'OK' | 'FALLO' | 'COMPENSADO';
  detalles?: Record<string, unknown>;
}

export interface ResultadoSaga {
  exito: boolean;
  reservaId: string;
  estadoFinal: EstadoReserva;
  mensaje: string;
  pasosEjecutados: SagaPasoLog[];
  saldoRetenidoM7: number;
  conductorAsignadoM5: string | null;
}
