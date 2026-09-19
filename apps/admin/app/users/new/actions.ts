'use server';
import { apiPost } from '@platform/web-kit/server';
import { revalidatePath } from 'next/cache';

export async function createUserAction(formData: FormData) {
  try {
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const emailVerified = formData.get('emailVerified') === 'on';
    const tenantSlug = (formData.get('tenantSlug') as string) || undefined;
    const result = await apiPost<{ id: string; email: string }>('/v1/admin/users', { name, email, role, emailVerified, tenantSlug });
    revalidatePath('/users');
    return { email: result.email };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CONFLICT') return { error: 'Este e-mail já está em uso.' };
      if (error.message === 'NOT_FOUND') return { error: 'A barbearia informada não foi encontrada.' };
      if (error.message === 'INVALID_INPUT') return { error: 'Preencha os dados corretamente.' };
    }
    return { error: 'Ocorreu um erro ao criar a conta.' };
  }
}
