import { SquareClient, SquareEnvironment } from 'square'

export function createSquareClient(
  accessToken: string,
  environment: 'sandbox' | 'production' = 'sandbox',
) {
  return new SquareClient({
    token: accessToken,
    environment:
      environment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  })
}
