declare module "mssql" {
  export interface ConnectionPool {
    request(): Request;
    close(): Promise<void>;
  }
  export interface Request {
    input(name: string, value: string | number | null): Request;
    query<T>(command: string): Promise<{ recordset: T[] }>;
  }
  export function connect(config: {
    server: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    options?: Record<string, unknown>;
  }): Promise<ConnectionPool>;
}
