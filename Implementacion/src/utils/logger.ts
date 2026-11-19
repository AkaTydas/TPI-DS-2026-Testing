export class Logger {
  private static colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    blue: '\x1b[34m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m'
  };

  public static info(message: string, requestId?: string): void {
    const reqStr = requestId ? `${this.colors.gray}[ReqId: ${requestId.substring(0, 8)}]${this.colors.reset} ` : '';
    console.log(`${this.colors.blue}[INFO]${this.colors.reset} ${reqStr}${message}`);
  }

  public static success(message: string, requestId?: string): void {
    const reqStr = requestId ? `${this.colors.gray}[ReqId: ${requestId.substring(0, 8)}]${this.colors.reset} ` : '';
    console.log(`${this.colors.green}[OK]${this.colors.reset} ${reqStr}${message}`);
  }

  public static warn(message: string, requestId?: string): void {
    const reqStr = requestId ? `${this.colors.gray}[ReqId: ${requestId.substring(0, 8)}]${this.colors.reset} ` : '';
    console.log(`${this.colors.yellow}[WARN]${this.colors.reset} ${reqStr}${message}`);
  }

  public static error(message: string, requestId?: string): void {
    const reqStr = requestId ? `${this.colors.gray}[ReqId: ${requestId.substring(0, 8)}]${this.colors.reset} ` : '';
    console.log(`${this.colors.red}[ERROR]${this.colors.reset} ${reqStr}${message}`);
  }

  public static sagaStep(tipo: string, servicio: string, paso: string, resultado: string, requestId?: string): void {
    const reqStr = requestId ? `${this.colors.gray}[${requestId.substring(0, 8)}]${this.colors.reset} ` : '';
    let badgeColor = this.colors.cyan;
    if (tipo.startsWith('C')) badgeColor = this.colors.yellow; // Compensación
    if (tipo === 'Tp') badgeColor = this.colors.magenta; // Pivotante

    const resColor = resultado === 'OK' ? this.colors.green : (resultado === 'FALLO' ? this.colors.red : this.colors.yellow);

    console.log(
      `${this.colors.bright}[SAGA]${this.colors.reset} ${reqStr}${badgeColor}[${tipo} | ${servicio}]${this.colors.reset} ${paso} -> ${resColor}${resultado}${this.colors.reset}`
    );
  }
}
