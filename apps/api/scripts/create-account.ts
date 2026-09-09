import { createDatabase } from '@platform/database';
import { loadConfig } from '@platform/config';
import { createAuth } from '@platform/auth';
import { ConsoleEmailProvider } from '@platform/notifications';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const email = new ConsoleEmailProvider();
const auth = createAuth(db, config, email);

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('\n❌ Argumentos faltando!');
    console.error('Uso: pnpm run create-account <email> <password> "<Nome Completo>"\n');
    process.exit(1);
  }

  const [emailAddress, password, ...nameParts] = args;
  const name = nameParts.join(' ');

  console.log(`\n⏳ Criando conta para: ${emailAddress} (${name})...`);

  try {
    const response = await auth.api.signUpEmail({
      body: {
        email: emailAddress,
        password,
        name,
      },
      asResponse: true
    });

    if (!response.ok) {
      console.error('\n❌ Erro ao criar conta:', await response.text());
      process.exit(1);
    }

    // Marca como verificado e dá permissão de SUPER_ADMIN
    await db.user.updateMany({
      where: { email: emailAddress },
      data: { emailVerified: true, platformRole: 'SUPER_ADMIN' }
    });

    console.log(`\n✅ Conta criada e verificada com sucesso!`);
    console.log(`📧 E-mail: ${emailAddress}`);
    console.log(`🔑 Senha:  (oculta)`);
    console.log(`\nVocê já pode fazer login na aplicação!\n`);
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
  } finally {
    await db.$disconnect();
  }
}

main();
