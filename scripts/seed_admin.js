require('../src/config/env');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/mariadb');

function readAccounts() {
  const admin = {
    username: (process.env.SEED_ADMIN_USERNAME || '').trim(),
    email: (process.env.SEED_ADMIN_EMAIL || '').trim(),
    password: process.env.SEED_ADMIN_PASSWORD || '',
    role: 'admin',
  };
  const analyst = {
    username: (process.env.SEED_ANALYST_USERNAME || '').trim(),
    email: (process.env.SEED_ANALYST_EMAIL || '').trim(),
    password: process.env.SEED_ANALYST_PASSWORD || '',
    role: 'analista',
  };
  const accounts = [admin, analyst];
  for (const account of accounts) {
    if (!account.username || !account.email || !account.password) {
      throw new Error('Configura SEED_ADMIN_USERNAME/EMAIL/PASSWORD y SEED_ANALYST_USERNAME/EMAIL/PASSWORD en .env.');
    }
    if ([account.username, account.email, account.password].some((v) => /^(CAMBIAR|REEMPLAZA|CHANGE_ME)/i.test(v))) {
      throw new Error('Reemplaza los valores de ejemplo del seed antes de ejecutarlo.');
    }
    if (account.username.length < 4 || account.username.length > 40) throw new Error(`Username inválido para la cuenta ${account.role}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) throw new Error(`Correo inválido para la cuenta ${account.role}.`);
    if (!/^(?=.{8,}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d).*$/.test(account.password)) {
      throw new Error('Las contraseñas deben tener 8+ caracteres, mayúscula, minúscula y número.');
    }
  }
  if (admin.username.toLowerCase() === analyst.username.toLowerCase() || admin.email.toLowerCase() === analyst.email.toLowerCase()) {
    throw new Error('Admin y analista deben tener username y correo distintos.');
  }
  return accounts;
}

async function main() {
  const accounts = readAccounts();
  const prepared = await Promise.all(accounts.map(async (account) => ({ ...account, hash: await bcrypt.hash(account.password, 10) })));
  if (prepared.some(({ hash }) => hash.length !== 60 || !hash.startsWith('$2'))) throw new Error('Hash bcrypt incompatible con la restricción de la tabla.');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const { username, email, role, hash } of prepared) {
      const [existing] = await connection.execute(
        'SELECT admin_id, username, email FROM administradores_auth WHERE username=? OR email=? FOR UPDATE',
        [username, email],
      );
      if (existing.length > 1 || (existing.length === 1 && (existing[0].username !== username || existing[0].email !== email))) {
        throw new Error(`Conflicto de username/correo para la cuenta ${role}; no se modificó ninguna cuenta.`);
      }
      if (existing.length === 1) {
        await connection.execute('UPDATE administradores_auth SET password_hash=?, rol=?, activo=1 WHERE admin_id=?', [hash, role, existing[0].admin_id]);
      } else {
        await connection.execute('INSERT INTO administradores_auth (username,email,password_hash,rol,activo) VALUES (?,?,?,?,1)', [username, email, hash, role]);
      }
    }
    await connection.commit();
    console.log('Cuentas admin y analista preparadas.');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main().catch((err) => {
  console.error(`Seed cancelado: ${err.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
