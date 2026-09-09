import { platformName } from '@platform/config';
import { AuthForm } from '@platform/web-kit/auth-form';
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
const { token } = await searchParams;
return <main className="auth-layout"><section className="auth-story"><a href="/" className="brand"><span className="brand-mark">B</span>{platformName()}</a><div><span className="eyebrow">Sua presença. Sua identidade.</span><h1>O seu próximo<br/>capítulo começa<br/>aqui.</h1><p>Um espaço para cuidar da sua marca, da sua operação e das pessoas que fazem parte dela.</p></div><small>Seu sistema é nosso. Sua identidade é sua.</small></section><section className="auth-content"><span className="eyebrow">Área da barbearia</span><h2>Sua conta começa aqui.</h2><p>Confirme seu e-mail para continuar.</p><AuthForm mode="register" token={token}/></section></main>;
}


