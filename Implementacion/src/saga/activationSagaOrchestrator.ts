import { ReservationRepository } from '../repositories/reservationRepository.js';
import { HistoryRepository } from '../repositories/historyRepository.js';
import { IdempotencyRepository } from '../repositories/idempotencyRepository.js';
import { M7Client } from '../clients/m7Client.js';
import { M5Client } from '../clients/m5Client.js';
import { M8Client } from '../clients/m8Client.js';
import { Logger } from '../utils/logger.js';
import { AppError } from '../domain/errors.js';
import { ResultadoSaga, SagaPasoLog } from '../domain/types.js';

export class ActivationSagaOrchestrator {
  /**
   * Orquestador de la Saga de Activación y Despacho.
   * Coordina las transacciones locales entre M9, M7 y M5 implementando
   * rollback lógico mediante acciones compensatorias inversas.
   */
  public static async ejecutarSaga(
    reservaId: string,
    opciones: {
      forzarFalloM5?: boolean;
      idempotencyKey?: string;
      requestId?: string;
    } = {}
  ): Promise<ResultadoSaga> {
    const requestId = opciones.requestId || 'req-default';
    const idempotencyKey = opciones.idempotencyKey || `idem-${reservaId}`;
    const pasos: SagaPasoLog[] = [];

    Logger.info(`========== INICIANDO SAGA DE ACTIVACIÓN (Reserva: ${reservaId}) ==========`, requestId);

    // 0. Control de Idempotencia estricta (RF-9.10)
    const cachedResponse = IdempotencyRepository.buscar(idempotencyKey);
    if (cachedResponse) {
      Logger.warn(`[IDEMPOTENCIA] Solicitud ya procesada para la clave ${idempotencyKey}. Retornando respuesta cacheada.`, requestId);
      return JSON.parse(cachedResponse.cuerpoRespuesta) as ResultadoSaga;
    }

    // 1. Obtener reserva desde la base de datos exclusiva de M9
    const reserva = ReservationRepository.obtenerPorId(reservaId);
    if (!reserva) {
      throw new AppError(404, 'Reserva no encontrada', `No existe la reserva con ID ${reservaId} en M9.`);
    }

    // Si ya está ACTIVADA, idempotencia de dominio
    if (reserva.estado === 'ACTIVADA') {
      Logger.info(`La reserva ${reservaId} ya se encuentra ACTIVADA.`, requestId);
      return {
        exito: true,
        reservaId,
        estadoFinal: 'ACTIVADA',
        mensaje: 'La reserva ya fue activada con anterioridad.',
        pasosEjecutados: [],
        saldoRetenidoM7: reserva.tarifaEstimada,
        conductorAsignadoM5: reserva.conductorId
      };
    }

    if (reserva.estado !== 'CONFIRMADA' && reserva.estado !== 'EN_PROCESO_DESPACHO') {
      throw new AppError(
        409,
        'Estado incompatible',
        `Solo reservas en estado CONFIRMADA pueden ser activadas en despacho. Estado actual: ${reserva.estado}`
      );
    }

    let pagoPreAutorizado = false;

    try {
      // -------------------------------------------------------------
      // T1 (Transacción Local M9): Poner reserva en EN_PROCESO_DESPACHO
      // -------------------------------------------------------------
      ReservationRepository.actualizarEstado(reservaId, 'EN_PROCESO_DESPACHO');
      HistoryRepository.registrar({
        reservaId,
        tipoEvento: 'ACTIVACION_INICIADA',
        estadoAnterior: reserva.estado,
        estadoNuevo: 'EN_PROCESO_DESPACHO',
        actor: 'SAGA_ORCHESTRATOR',
        detalles: { motivo: 'Inicio de despacho hacia M5', requestId },
        fechaHora: new Date().toISOString()
      });
      Logger.sagaStep('T1', 'M9', 'Reserva transicionada a EN_PROCESO_DESPACHO en db_m9', 'OK', requestId);
      pasos.push({
        paso: 'T1 - Bloqueo local de reserva',
        tipo: 'Tc',
        servicio: 'M9',
        descripcion: 'Reserva marcada como EN_PROCESO_DESPACHO en db_m9',
        resultado: 'OK'
      });

      // -------------------------------------------------------------
      // T2 (Transacción Compensable M7): Retención de fondos financieros
      // -------------------------------------------------------------
      const txPago = await M7Client.preAutorizarPago(
        { reservaId, monto: reserva.tarifaEstimada },
        requestId
      );
      pagoPreAutorizado = true;
      pasos.push({
        paso: 'T2 - Pre-autorización financiera',
        tipo: 'Tc',
        servicio: 'M7',
        descripcion: `Retención de $${reserva.tarifaEstimada.toFixed(2)} en db_pagos (TX: ${txPago.id})`,
        resultado: 'OK'
      });

      // -------------------------------------------------------------
      // T3 (Transacción Pivotante M5): Búsqueda y asignación de conductor
      // ¡ESTE ES EL PUNTO DE NO RETORNO!
      // -------------------------------------------------------------
      const despacho = await M5Client.solicitarDespacho(
        { reservaId, forzarFallo: opciones.forzarFalloM5 },
        idempotencyKey,
        requestId
      );
      pasos.push({
        paso: 'T3 - Transacción Pivotante (Despacho)',
        tipo: 'Tp',
        servicio: 'M5',
        descripcion: `Chofer ${despacho.conductorNombre} asignado (Despacho: ${despacho.id})`,
        resultado: 'OK'
      });

      // -------------------------------------------------------------
      // CONFIRMACIÓN DE LA SAGA (Pivotante exitosa)
      // -------------------------------------------------------------
      ReservationRepository.actualizarEstado(reservaId, 'ACTIVADA', {
        solicitudDespachoId: despacho.id,
        conductorId: despacho.conductorId
      });

      HistoryRepository.registrar({
        reservaId,
        tipoEvento: 'RESERVA_ACTIVADA',
        estadoAnterior: 'EN_PROCESO_DESPACHO',
        estadoNuevo: 'ACTIVADA',
        actor: 'SAGA_ORCHESTRATOR',
        detalles: {
          solicitudId: despacho.id,
          conductorId: despacho.conductorId,
          conductorNombre: despacho.conductorNombre,
          vehiculo: despacho.vehiculo
        },
        fechaHora: new Date().toISOString()
      });

      // Tr (Transacción Reintentable M8): Notificar al usuario
      await M8Client.enviarNotificacion(
        {
          tipoEvento: 'RESERVA_ACTIVADA',
          reservaId,
          clienteId: reserva.clienteId,
          mensaje: `¡Tu viaje fue confirmado! Conductor: ${despacho.conductorNombre}.`
        },
        requestId
      );
      pasos.push({
        paso: 'Tr - Notificación a Pasajero',
        tipo: 'Tr',
        servicio: 'M8',
        descripcion: 'Notificación de conductor en camino enviada al cliente',
        resultado: 'OK'
      });

      const resultadoExito: ResultadoSaga = {
        exito: true,
        reservaId,
        estadoFinal: 'ACTIVADA',
        mensaje: 'Saga completada con éxito. Conductor asignado y consistencia preservada.',
        pasosEjecutados: pasos,
        saldoRetenidoM7: reserva.tarifaEstimada,
        conductorAsignadoM5: despacho.conductorNombre || despacho.conductorId
      };

      IdempotencyRepository.guardar(idempotencyKey, 200, resultadoExito);
      Logger.success(`========== SAGA FINALIZADA EXITOSAMENTE (Reserva: ${reservaId}) ==========`, requestId);
      return resultadoExito;

    } catch (error: unknown) {
      // =============================================================
      // FALLO DETECTADO -> EJECUCIÓN DE TRANSACCIONES COMPENSATORIAS
      // =============================================================
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      Logger.error(`[SAGA ALERT] Falla en la ejecución de la Saga: ${errorMsg}`, requestId);
      Logger.warn('[SAGA COORDINATOR] Disparando acciones compensatorias en orden inverso...', requestId);

      pasos.push({
        paso: 'T3 - Falla en Matching de Conductor',
        tipo: 'Tp',
        servicio: 'M5',
        descripcion: errorMsg,
        resultado: 'FALLO'
      });

      // C2 (Acción Compensatoria M7): Liberar la pre-autorización monetaria
      if (pagoPreAutorizado) {
        await M7Client.liberarPreAutorizacion({ reservaId }, requestId);
        pasos.push({
          paso: 'C2 - Compensación Financiera',
          tipo: 'C2',
          servicio: 'M7',
          descripcion: 'Pre-autorización monetaria cancelada. Saldo retenido = $0 en db_pagos.',
          resultado: 'COMPENSADO'
        });
      }

      // C1 (Acción Compensatoria M9): Transición de estado a VENCIDA
      ReservationRepository.actualizarEstado(reservaId, 'VENCIDA');
      HistoryRepository.registrar({
        reservaId,
        tipoEvento: 'RESERVA_VENCIDA',
        estadoAnterior: 'EN_PROCESO_DESPACHO',
        estadoNuevo: 'VENCIDA',
        actor: 'SAGA_COMPENSATION_C1',
        detalles: {
          motivo: errorMsg,
          accion: 'Compensación lógica por indisponibilidad de chofer en M5'
        },
        fechaHora: new Date().toISOString()
      });
      Logger.sagaStep('C1', 'M9', 'Reserva transicionada a VENCIDA en db_m9', 'COMPENSADO', requestId);
      pasos.push({
        paso: 'C1 - Compensación de Estado Local',
        tipo: 'C1',
        servicio: 'M9',
        descripcion: 'Reserva marcada como VENCIDA con auditoría inmutable en db_m9.',
        resultado: 'COMPENSADO'
      });

      // Tr (Notificación de disculpas al cliente vía M8)
      await M8Client.enviarNotificacion(
        {
          tipoEvento: 'RESERVA_VENCIDA',
          reservaId,
          clienteId: reserva.clienteId,
          mensaje: 'No se encontraron conductores en la zona. No se realizó ningún cargo en tu tarjeta.'
        },
        requestId
      );
      pasos.push({
        paso: 'Tr - Notificación de Cancelación',
        tipo: 'Tr',
        servicio: 'M8',
        descripcion: 'Notificación de disculpa y liberación de fondos enviada al cliente',
        resultado: 'OK'
      });

      const resultadoFallo: ResultadoSaga = {
        exito: false,
        reservaId,
        estadoFinal: 'VENCIDA',
        mensaje: `La reserva falló y se aplicó rollback lógico: ${errorMsg}`,
        pasosEjecutados: pasos,
        saldoRetenidoM7: 0,
        conductorAsignadoM5: null
      };

      IdempotencyRepository.guardar(idempotencyKey, 200, resultadoFallo);
      Logger.warn(`========== SAGA COMPENSADA (Consistencia Eventual Lograda) ==========`, requestId);
      return resultadoFallo;
    }
  }
}
