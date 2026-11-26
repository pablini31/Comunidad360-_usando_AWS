const { z } = require('zod');

const str = (min = 1, max = 255) => z.string().trim().min(min).max(max);
const pwd = z.string().min(4, 'La contraseña debe tener al menos 4 caracteres.');
const nullableNumber = z.union([z.number().finite(), z.null()]).optional();

const user = z
  .object({
    id_usuario: z.string().trim().regex(/^U\d{6}$/),
    alias: str(3, 50),
    fecha_ingreso: z.iso.date(),
    ciudad_id: z.number().int().positive().nullable().optional(),
    latitud: nullableNumber,
    longitud: nullableNumber,
    rango_edad: z.enum(['18-24', '25-31', '32-38', '39+']),
    especie_fursona: str(1, 40),
    interes_principal: str(1, 50),
    plataforma_principal: z.enum(['Discord', 'Facebook', 'Instagram', 'Telegram', 'TikTok', 'Twitter/X']),
    es_artista: z
      .union([z.literal(0), z.literal(1), z.boolean()])
      .transform((x) => (x === true ? 1 : x === false ? 0 : x)),
    mensajes_30d: z.number().int().min(0),
    reacciones_30d: z.number().int().min(0),
    eventos_asistidos: z.number().int().min(0),
    comisiones_compradas: z.number().int().min(0),
    sentimiento_promedio: z.number().min(-1).max(1),
    ultima_actividad: z.iso.date(),
    estatus: z.enum(['activo', 'en_riesgo', 'inactivo']),
    consentimiento_datos: z.enum(['si', 'no']),
  })
  .strict()
  .superRefine((u, ctx) => {
    if (u.ultima_actividad < u.fecha_ingreso) {
      ctx.addIssue({ code: 'custom', path: ['ultima_actividad'], message: 'Debe ser igual o posterior a fecha_ingreso.' });
    }
    if (u.estatus === 'inactivo' && (u.mensajes_30d !== 0 || u.reacciones_30d !== 0)) {
      ctx.addIssue({ code: 'custom', path: ['estatus'], message: 'Un usuario inactivo debe tener mensajes y reacciones en cero.' });
    }
    if ((u.latitud == null) !== (u.longitud == null)) {
      ctx.addIssue({ code: 'custom', path: ['latitud'], message: 'Latitud y longitud deben enviarse juntas.' });
    }
    if (u.latitud != null && (u.latitud < -90 || u.latitud > 90)) {
      ctx.addIssue({ code: 'custom', path: ['latitud'], message: 'Fuera de rango.' });
    }
    if (u.longitud != null && (u.longitud < -180 || u.longitud > 180)) {
      ctx.addIssue({ code: 'custom', path: ['longitud'], message: 'Fuera de rango.' });
    }
  });

const locationObject = z.object({ pais: str(1, 60), estado: str(1, 60), ciudad: str(1, 60) }).strict();

const interaction = z
  .object({
    id_interaccion: str(1, 100),
    id_usuario: z.string().trim().regex(/^U\d{6}$/),
    timestamp: z.iso.datetime(),
    canal: str(1, 60),
    tipo: str(1, 40).transform((v) => v.toLowerCase()),
    texto: z.string().trim().max(10000).nullable().optional(),
    tema: str(1, 100),
    sentimiento: z.number().min(-1).max(1),
    idioma: str(1, 20),
    dispositivo: str(1, 60),
    longitud_texto: z.number().int().min(0).optional(),
    reacciones_recibidas: z.number().int().min(0),
    etiquetas: z.array(z.string().trim().min(1).max(40)).max(50),
    ubicacion_autorizada: z.boolean().optional(),
    ubicacion: locationObject.nullable().optional(),
  })
  .strict();

const interactionPatch = z
  .object({
    id_interaccion: str(1, 100).optional(),
    id_usuario: z.string().trim().regex(/^U\d{6}$/).optional(),
    timestamp: z.iso.datetime().optional(),
    canal: str(1, 60).optional(),
    tipo: str(1, 40).transform((v) => v.toLowerCase()).optional(),
    texto: z.string().trim().max(10000).nullable().optional(),
    tema: str(1, 100).optional(),
    sentimiento: z.number().min(-1).max(1).optional(),
    idioma: str(1, 20).optional(),
    dispositivo: str(1, 60).optional(),
    longitud_texto: z.number().int().min(0).optional(),
    reacciones_recibidas: z.number().int().min(0).optional(),
    etiquetas: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
    ubicacion_autorizada: z.boolean().optional(),
    ubicacion: locationObject.nullable().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).some((k) => k !== 'id_interaccion'), {
    message: 'Debes enviar al menos un campo para actualizar.',
  });

const admin = z
  .object({
    username: str(4, 40),
    email: z.string().trim().email(),
    password: pwd,
    rol: z.enum(['admin', 'analista']),
  })
  .strict();

module.exports = {
  pwd,
  user,
  interaction,
  interactionPatch,
  admin,
  adminActive: z.object({ activo: z.union([z.literal(0), z.literal(1)]) }).strict(),
  reprocess: z.object({ id_usuario: z.string().trim().regex(/^U\d{6}$/) }).strict(),
  login: z.object({ username: str(1, 40), password: z.string().min(1) }).strict(),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: pwd }).strict(),
};
