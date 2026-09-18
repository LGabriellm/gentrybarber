'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({ email: z.email('Informe um e-mail válido.'), password: z.string(), name: z.string() });
type FormData = z.infer<typeof formSchema>;
export function AuthForm({ mode = 'login', token }: { mode?: 'login' | 'register' | 'forgot' | 'reset'; token?: string }) {
  const [message, setMessage] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(formSchema), defaultValues: { email: mode === 'reset' ? 'reset@local.invalid' : '', password: '', name: '' } });
  async function submit(data: FormData) {
    setMessage('');
    if (mode !== 'forgot' && data.password.length < 12) return setMessage('Use uma senha com pelo menos 12 caracteres.');
    if (mode === 'register' && !data.name.trim()) return setMessage('Informe seu nome.');
    const endpoint = { login: 'sign-in/email', register: 'sign-up/email', forgot: 'request-password-reset', reset: 'reset-password' }[mode];
    const body = mode === 'login' ? { email: data.email, password: data.password, callbackURL: `${window.location.origin}/login` } : mode === 'register' ? { name: data.name, email: data.email, password: data.password, callbackURL: `${window.location.origin}/login` } : mode === 'forgot' ? { email: data.email, redirectTo: `${window.location.origin}/reset-password` } : { newPassword: data.password, token };
    try {
      const response = await fetch(`/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        return setMessage(mode === 'login' && result.code === 'EMAIL_NOT_VERIFIED' ? 'Enviamos um link de verificação. Confira seu e-mail, confirme a conta e entre novamente.' : mode === 'login' ? 'Não foi possível entrar. Confira seus dados.' : 'Não foi possível concluir. Confira os dados e tente novamente.');
      }
      if (mode === 'login') { window.location.assign('/'); return; }
      setMessage(mode === 'register' ? 'Confira seu e-mail para confirmar a conta. O acesso à barbearia depende de uma vinculação pela equipe.' : mode === 'forgot' ? 'Se existir uma conta com esse e-mail, enviaremos as instruções de recuperação.' : 'Senha atualizada. Entre com a nova senha; se o e-mail ainda não estiver verificado, enviaremos um link para confirmar a conta.');
    } catch { setMessage('A plataforma está indisponível neste momento. Tente novamente.'); }
  }
  return <form onSubmit={handleSubmit(submit)} className="auth-form">
    {mode === 'register' && <label>Seu nome<input autoComplete="name" {...register('name')} required /></label>}
    {mode !== 'reset' && <label>E-mail<input type="email" autoComplete="email" {...register('email')} required />{errors.email && <small>{errors.email.message}</small>}</label>}
    {mode !== 'forgot' && <label>{mode === 'reset' ? 'Nova senha' : 'Senha'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} {...register('password')} minLength={12} maxLength={128} required /><small>Pelo menos 12 caracteres.</small></label>}
    <button className="button" type="submit" disabled={isSubmitting || (mode === 'reset' && !token)}>{isSubmitting ? 'Aguarde…' : { login: 'Entrar na plataforma', register: 'Criar minha conta', forgot: 'Enviar instruções', reset: 'Atualizar senha' }[mode]}</button>
    {message && <p role="status" className="form-message">{message}</p>}
    <div className="form-links"><a href="/login">Entrar</a><a href="/register">Criar conta</a><a href="/forgot-password">Esqueci a senha</a></div>
  </form>;
}
export function SignOutButton() {
  const [error, setError] = useState(false);
  return <><button className="button secondary" onClick={async () => { try { const response = await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) { setError(true); return; } window.location.assign('/login'); } catch { setError(true); } }}>Sair</button>{error && <small role="alert">Não foi possível sair. Tente novamente.</small>}</>;
}
