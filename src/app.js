import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppError, invariant } from './errors.js';
import { verifyPassword } from './security.js';

export function createApp({ config, pool, service }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../views', import.meta.url)));
  app.use(helmet({ strictTransportSecurity: config.production ? undefined : false, contentSecurityPolicy: {
    directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'form-action': ["'self'"], 'upgrade-insecure-requests': config.production ? [] : null },
  } }));
  app.use('/assets', express.static(fileURLToPath(new URL('../public', import.meta.url)), { dotfiles: 'deny', maxAge: '1h' }));
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool, tableName: 'atm_sessions', createTableIfMissing: false, pruneSessionInterval: false });
  store.on('error', () => console.warn('No fue posible persistir una sesión administrativa.'));
  app.use(session({
    name: 'atm.sid', store, secret: config.sessionSecret,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 30 * 60 * 1000 },
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.admin = req.session.admin || null;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers.origin) {
      // Render's proxy can use an internal Host or append the default TLS port.
      // Prefer the configured public origin; never derive it from caller-controlled forwarding headers.
      const expectedOrigin = config.publicOrigin || new URL(`${req.protocol}://${req.get('host')}`).origin;
      invariant(req.headers.origin === expectedOrigin, 'INVALID_ORIGIN', 'Origen de solicitud no permitido.', 403);
    }
    next();
  });

  function csrfToken(req) {
    if (!req.session.csrf) req.session.csrf = randomBytes(32).toString('hex');
    return req.session.csrf;
  }
  function csrf(req, res, next) {
    const provided = req.body?._csrf || req.get('X-CSRF-Token');
    const expected = req.session.csrf;
    invariant(typeof provided === 'string' && /^[a-f0-9]{64}$/.test(provided) && typeof expected === 'string' && timingSafeEqual(Buffer.from(provided), Buffer.from(expected)),
      'INVALID_CSRF', 'La sesión del formulario caducó. Vuelve a abrir la página.', 403);
    next();
  }
  function admin(req, res, next) {
    if (req.session.admin !== config.adminUsername) return res.redirect('/admin/login');
    next();
  }

  const apiLimit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Espera un momento antes de volver a intentar.' } }) });
  const loginLimit = rateLimit({ windowMs: 15 * 60_000, limit: 5, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).render('error', { title: 'Espera para volver a ingresar', message: 'Demasiados intentos de acceso. Intenta de nuevo en 15 minutos.', code: 'RATE_LIMIT' }) });

  app.get('/health', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok', service: 'node3-atm', commit: process.env.RENDER_GIT_COMMIT || null, branch: process.env.RENDER_GIT_BRANCH || null }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.get('/', async (req, res) => res.render('atm', { status: await service.publicStatus() }));
  app.use('/api', apiLimit);
  app.get('/api/atm', async (req, res) => res.json({ data: await service.publicStatus() }));
  app.get('/api/accounts/:numero/saldo', async (req, res) => res.json({ data: await service.balance(req.params.numero) }));
  for (const [path, type] of [['retiros', 'retiro'], ['depositos', 'deposito']]) {
    app.post(`/api/${path}`, async (req, res) => {
      invariant(req.is('application/json'), 'INVALID_CONTENT_TYPE', 'Envía la solicitud como application/json.', 415);
      const operation = await service.move(type, req.body, req.get('Idempotency-Key'));
      res.status(operation.status === 'pending' ? 202 : operation.status === 'rejected' ? 422 : 200).json({ data: operation });
    });
  }
  app.get('/api/operaciones/:id', async (req, res) => {
    const operation = await service.getOperation(req.params.id);
    res.status(operation.status === 'pending' ? 202 : 200).json({ data: operation });
  });

  app.get('/admin/login', (req, res) => {
    if (req.session.admin === config.adminUsername) return res.redirect('/admin');
    res.render('login', { csrf: csrfToken(req), error: null });
  });
  app.post('/admin/login', loginLimit, csrf, async (req, res) => {
    const passwordOk = verifyPassword(req.body.password, config.adminPasswordHash);
    if (req.body.username !== config.adminUsername || !passwordOk) {
      return res.status(401).render('login', { csrf: csrfToken(req), error: 'Usuario o contraseña incorrectos.' });
    }
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.admin = config.adminUsername;
    csrfToken(req);
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.redirect('/admin');
  });
  app.get('/admin', admin, async (req, res) => res.render('admin', {
    state: await service.adminStatus(), centralUrl: config.centralUrl, csrf: csrfToken(req), message: null, error: null,
  }));
  async function adminAction(req, res, action, message) {
    let error = null;
    let status = 200;
    try { await action(); }
    catch (cause) {
      if (!(cause instanceof AppError)) throw cause;
      error = cause.message;
      status = cause.status;
    }
    res.status(status).render('admin', {
      state: await service.adminStatus(), centralUrl: config.centralUrl, csrf: csrfToken(req), message: error ? null : message, error,
    });
  }
  app.post('/admin/configuracion', admin, csrf, async (req, res) => adminAction(req, res,
    () => service.configure(req.body.api_key), 'Conexión verificada. La configuración y el efectivo se guardaron.'));
  app.post('/admin/sincronizar', admin, csrf, async (req, res) => adminAction(req, res,
    () => service.synchronize(), 'Efectivo sincronizado con el Banco Central.'));
  app.post('/admin/recuperar', admin, csrf, async (req, res) => adminAction(req, res,
    () => service.recoverPending(), 'Se consultó el resultado central. Revisa si la operación sigue pendiente.'));
  app.post('/admin/logout', admin, csrf, async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('atm.sid');
    res.redirect('/admin/login');
  });
  app.use((req, res, next) => next(new AppError('NOT_FOUND', 'No se encontró la página solicitada.', 404)));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = error instanceof AppError;
    const malformed = error.type === 'entity.parse.failed';
    const tooLarge = error.type === 'entity.too.large';
    const status = known ? error.status : malformed ? 400 : tooLarge ? 413 : 500;
    const code = known ? error.code : malformed ? 'INVALID_JSON' : tooLarge ? 'BODY_TOO_LARGE' : 'INTERNAL_ERROR';
    const message = known ? error.message : malformed ? 'El cuerpo JSON no es válido.' : tooLarge ? 'La solicitud es demasiado grande.' : 'No fue posible completar la solicitud. Intenta de nuevo más tarde.';
    if (!known && !malformed && !tooLarge) console.error('Error de aplicación:', error.code || error.name || 'INTERNAL_ERROR');
    if (req.path.startsWith('/api/') || req.path === '/api') return res.status(status).json({ error: { code, message } });
    res.status(status).render('error', { title: 'No se pudo completar la solicitud', message, code });
  });
  return app;
}
