export class AppError extends Error {
  public readonly status: number;
  public readonly title: string;
  public readonly detail: string;

  constructor(status: number, title: string, detail: string) {
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
