export class AppError extends Error {
    status;
    title;
    detail;
    constructor(status, title, detail) {
        super(detail);
        this.name = 'AppError';
        this.status = status;
        this.title = title;
        this.detail = detail;
    }
}
export class NoDriversAvailableError extends AppError {
    constructor(detail = 'No se encontraron conductores disponibles en la zona de cobertura.') {
        super(404, 'Sin conductores disponibles', detail);
        this.name = 'NoDriversAvailableError';
    }
}
