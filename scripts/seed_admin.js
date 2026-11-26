require('../src/config/env');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/mariadb');

function readAccounts() {
  const admin = {
    username: (process.env.SEED_ADMIN_USERNAME || 'admin').trim(),
    email: (process.env.SEED_ADMIN_EMAIL || 'admin@c360.com').trim(),
    password: process.env.SEED_ADMIN_PASSWORD || '1234',
    role: 'admin',
  };
  const analyst = {
    username: (process.env.SEED_ANALYST_USERNAME || 'analista').trim(),
    email: (process.env.SEED_ANALYST_EMAIL || 'analista@c360.com').trim(),
    password: process.env.SEED_ANALYST_PASSWORD || '1234',
    role: 'analista',
  };
  const accounts = [admin, analyst];
  for (const account of accounts) {
    if (!account.username || !account.email || !account.password) {
      throw new Error('Configura SEED_ADMIN_USERNAME/EMAIL/PASSWORD y SEED_ANALYST_USERNAME/EMAIL/PASSWORD en .env.');
    }
    if (account.username.length < 4 || account.username.length > 40) {
      throw new Error(`Username inválido para la cuenta ${account.role} (mínimo 4 caracteres).`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(account.email)) {
      throw new Error(`Correo inválido para la cuenta ${account.role}.`);
    }
    if (account.password.length < 4) {
      throw new Error('Las contraseñas deben tener al menos 4 caracteres.');
    }
  }
  if (
    admin.username.toLowerCase() === analyst.username.toLowerCase() ||
    admin.email.toLowerCase() === analyst.email.toLowerCase()
  ) {
    throw new Error('Admin y analista deben tener username y correo distintos.');
  }
  return accounts;
}

async function main() {
  const accounts = readAccounts();
  const prepared = await Promise.all(
    accounts.map(async (account) => ({ ...account, hash: await bcrypt.hash(account.password, 10) }))
  );
  if (prepared.some(({ hash }) => hash.length !== 60 || !hash.startsWith('$2'))) {
    throw new Error('Hash bcrypt incompatible con la restricción de la tabla.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const { username, email, role, hash } of prepared) {
      const [byIdentity] = await connection.execute(
        'SELECT admin_id FROM administradores_auth WHERE username=? OR email=? FOR UPDATE',
        [username, email]
      );
      let targetId = byIdentity[0]?.admin_id || null;

      if (!targetId) {
        const [byRole] = await connection.execute(
          'SELECT admin_id FROM administradores_auth WHERE rol=? ORDER BY admin_id ASC LIMIT 1 FOR UPDATE',
          [role]
        );
        targetId = byRole[0]?.admin_id || null;
      }

      if (targetId) {
        await connection.execute(
          'UPDATE administradores_auth SET username=?, email=?, password_hash=?, rol=?, activo=1 WHERE admin_id=?',
          [username, email, hash, role, targetId]
        );
      } else {
        await connection.execute(
          'INSERT INTO administradores_auth (username,email,password_hash,rol,activo) VALUES (?,?,?,?,1)',
          [username, email, hash, role]
        );
      }
    }
    await connection.commit();
    console.log('Cuentas admin y analista actualizadas correctamente.');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

main()
  .catch((err) => {
    console.error(`Seed cancelado: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
