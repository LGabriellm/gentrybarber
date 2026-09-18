import { AdminLayout } from '../../../components/admin-layout';
import { NewUserForm } from './form';

export const dynamic = 'force-dynamic';
export default function NewUserPage() {
  return <AdminLayout activeTab="users" title="Novo usuário" description="Crie uma nova conta de acesso para a plataforma.">
    <NewUserForm />
    <aside className="admin-note"><span aria-hidden="true">◈</span><div><strong>Como ativar o acesso?</strong><p>O usuário define a senha pelo fluxo “Esqueci minha senha”. Ao entrar pela primeira vez, receberá um link para verificar o e-mail. Depois de confirmar esse link, poderá acessar com a senha escolhida.</p></div></aside>
  </AdminLayout>;
}
