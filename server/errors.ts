export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: any[]
  ) {
    super(message);
    this.name = 'APIError';
  }
}
