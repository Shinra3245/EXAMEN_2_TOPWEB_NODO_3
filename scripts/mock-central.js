import { createMockBank } from '../dev/mock-bank.js';
if (process.env.NODE_ENV === 'production') throw new Error('El Banco Central simulado solo se ejecuta en desarrollo.');
if (!process.env.MOCK_CENTRAL_API_KEY) throw new Error('Configura MOCK_CENTRAL_API_KEY o ejecuta npm run setup:local.');
const { app } = createMockBank({ apiKey: process.env.MOCK_CENTRAL_API_KEY });
const port = Number(process.env.MOCK_PORT || 4001);
app.listen(port, '127.0.0.1', () => console.log(`Banco Central SIMULADO en puerto ${port}. Cuenta 10001: $1,000.00; cajero: $5,000.00. Estado temporal de desarrollo.`));
