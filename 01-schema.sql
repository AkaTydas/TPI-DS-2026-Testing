-- =============================================================================
-- PROYECTO: Plataforma Distribuida de Movilidad Urbana - TPI 2026 (UTN FRRe)
-- MÓDULO:   M9 - Reservas de Viajes
-- GRUPO:    Grupo 8
-- ARCHIVO:  01-schema.sql (Definición de Esquema de Datos)
-- =============================================================================

-- Habilitar extensión para generación de identificadores únicos universales (UUID v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TIPOS ENUMERADOS (ENUMs)
-- =============================================================================

-- Estados del ciclo de vida de la reserva
CREATE TYPE reservation_status_enum AS ENUM (
    'PENDING',               -- Creada, esperando validación de cobertura/estimación inicial
    'CONFIRMED',             -- Confirmada por el cliente y agendada para el futuro
    'ACTIVATING',            -- En proceso de despacho a M5 (estado transitorio para lock distribuido)
    'ACTIVATED',             -- Despachada a M5 exitosamente (solicitud de viaje creada)
    'COMPLETED',             -- Viaje finalizado con éxito (notificado por ciclo de vida M6)
    'CANCELLED_BY_CLIENT',   -- Cancelada por solicitud del cliente
    'CANCELLED_BY_OPERATOR', -- Cancelada por intervención de un operador/administrador
    'EXPIRED_NO_DRIVERS',    -- Venció el plazo de búsqueda en despacho sin conductores disponibles
    'REJECTED'               -- Rechazada (fuera de cobertura, cliente inhabilitado, etc.)
);

-- Tipo de vehículo soportado por la plataforma
CREATE TYPE vehicle_type_enum AS ENUM (
    'AUTO',
    'MOTO'
);

-- Roles de actores autorizados a interactuar con el sistema
CREATE TYPE actor_role_enum AS ENUM (
    'CUSTOMER',
    'OPERATOR',
    'SYSTEM'
);

-- Estado de los recordatorios automáticos
CREATE TYPE reminder_status_enum AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'CANCELLED'
);

-- =============================================================================
-- 2. TABLA PRINCIPAL: RESERVATIONS (RF-9.1 a RF-9.7, RF-9.9 a RF-9.11)
-- =============================================================================
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identidad del cliente (M2 / M1). 
    -- RNF-05 (Propiedad de datos): No hay FK externa a tablas de otros módulos.
    customer_id UUID NOT NULL,
    
    -- Estado actual de la reserva
    status reservation_status_enum NOT NULL DEFAULT 'PENDING',
    
    -- Especificación del servicio (RF-9.1)
    vehicle_type vehicle_type_enum NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    
    -- Origen del viaje (RF-9.1)
    pickup_address TEXT NOT NULL,
    pickup_latitude NUMERIC(9, 6) NOT NULL CHECK (pickup_latitude BETWEEN -90.000000 AND 90.000000),
    pickup_longitude NUMERIC(9, 6) NOT NULL CHECK (pickup_longitude BETWEEN -180.000000 AND 180.000000),
    
    -- Destino del viaje (RF-9.1)
    dropoff_address TEXT NOT NULL,
    dropoff_latitude NUMERIC(9, 6) NOT NULL CHECK (dropoff_latitude BETWEEN -90.000000 AND 90.000000),
    dropoff_longitude NUMERIC(9, 6) NOT NULL CHECK (dropoff_longitude BETWEEN -180.000000 AND 180.000000),
    
    -- Estimaciones y Condiciones provistas por M4 y M7 (RF-9.3, RF-9.4)
    estimated_distance_km NUMERIC(6, 2) NULL CHECK (estimated_distance_km > 0),
    estimated_duration_min INTEGER NULL CHECK (estimated_duration_min > 0),
    estimated_fare NUMERIC(10, 2) NULL CHECK (estimated_fare >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
    cancellation_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (cancellation_fee >= 0),

    -- Configuración de activación en M5 - Solicitud y Despacho (RF-9.9, RF-9.10)
    activation_window_min INTEGER NOT NULL DEFAULT 15 CHECK (activation_window_min > 0),
    activation_idempotency_key UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
    dispatch_request_id UUID NULL, -- ID retornado por M5 al crear la solicitud de despacho
    
    -- Datos de Cancelación / Desistimiento (RF-9.7)
    cancellation_reason TEXT NULL,
    cancelled_by_role actor_role_enum NULL,
    cancelled_by_id UUID NULL,
    
    -- Metadatos y Auditoría temporal
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraint de anticipación mínima (RF-9.2)
    CONSTRAINT chk_scheduled_future CHECK (scheduled_at > created_at)
);

-- =============================================================================
-- ÍNDICES ESTRATÉGICOS PARA DESEMPEÑO
-- =============================================================================
-- Búsqueda de historial de reservas por cliente (RF-2.4 / RF-9.1)
CREATE INDEX idx_reservations_customer ON reservations(customer_id);

-- Búsqueda general por estado y fecha agendada
CREATE INDEX idx_reservations_status_scheduled ON reservations(status, scheduled_at);

-- ÍNDICE PARCIAL: Optimización clave para el worker del Scheduler (RF-9.9).
-- Solo indexa reservas confirmadas para no escanear toda la tabla.
CREATE INDEX idx_reservations_pending_activation ON reservations(scheduled_at) 
    WHERE status = 'CONFIRMED';

-- =============================================================================
-- 3. TABLA: HISTORIAL DE TRANSICIONES Y AUDITORÍA (RF-9.12)
-- Registro no destructivo de estados, actores, motivos y eventos del ciclo de vida.
-- =============================================================================
CREATE TABLE reservation_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    previous_status reservation_status_enum NULL,
    new_status reservation_status_enum NOT NULL,
    changed_by_role actor_role_enum NOT NULL,
    changed_by_id UUID NULL,
    reason TEXT NULL,
    metadata JSONB NULL, -- Payload extra (payload de M5, detalles de tarifa, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_history_reservation_id ON reservation_status_history(reservation_id);
CREATE INDEX idx_history_created_at ON reservation_status_history(created_at);

-- =============================================================================
-- 4. TABLA: PROGRAMACIÓN DE RECORDATORIOS (RF-9.8)
-- Administra recordatorios configurables hacia el cliente vía M8 (Notificaciones).
-- =============================================================================
CREATE TABLE reservation_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    reminder_type VARCHAR(50) NOT NULL, -- Ej: '24_HOURS_BEFORE', '2_HOURS_BEFORE'
    scheduled_for TIMESTAMPTZ NOT NULL,
    status reminder_status_enum NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índice parcial para el cron/worker de recordatorios pendientes
CREATE INDEX idx_reminders_pending_to_send ON reservation_reminders(scheduled_for)
    WHERE status = 'PENDING';

-- =============================================================================
-- 5. TABLA: PARÁMETROS CONFIGURABLES DEL SISTEMA (RF-9.2, RF-9.4, RF-9.9)
-- Permite calibrar reglas de negocio sin reiniciar la aplicación.
-- =============================================================================
CREATE TABLE system_parameters (
    param_key VARCHAR(50) PRIMARY KEY,
    param_value VARCHAR(100) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_parameters (param_key, param_value, description) VALUES
('MIN_ANTICIPATION_HOURS', '1', 'Anticipación mínima para crear una reserva'),
('MAX_ANTICIPATION_DAYS', '30', 'Anticipación máxima permitida a futuro'),
('DEFAULT_ACTIVATION_WINDOW_MIN', '15', 'Minutos previos al viaje para ordenar despacho en M5'),
('FREE_CANCELLATION_LIMIT_MIN', '30', 'Minutos previos antes de los cuales la cancelación es gratuita');

-- =============================================================================
-- 6. PROCEDIMIENTOS ALMACENADOS Y TRIGGERS (Automatización en DB)
-- =============================================================================

-- Trigger 1: Actualización automática del timestamp 'updated_at'
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_updated_at();

-- Trigger 2: Auditoría automática de cambios de estado (RF-9.12)
CREATE OR REPLACE FUNCTION fn_log_reservation_status()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO reservation_status_history (
            reservation_id, previous_status, new_status, changed_by_role, reason
        ) VALUES (
            NEW.id, NULL, NEW.status, 'SYSTEM', 'Creación inicial de la reserva'
        );
    ELSIF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO reservation_status_history (
            reservation_id, previous_status, new_status, changed_by_role, reason
        ) VALUES (
            NEW.id, OLD.status, NEW.status, 
            COALESCE(NEW.cancelled_by_role, 'SYSTEM'), 
            NEW.cancellation_reason
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_reservation_status
    AFTER INSERT OR UPDATE OF status ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION fn_log_reservation_status();
