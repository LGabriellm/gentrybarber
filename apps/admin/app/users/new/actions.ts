'use server';
import { apiPost } from '@platform/web-kit/server';
import { revalidatePath } from 'next/cache';

export async function createUserAction(formData: FormData) {
  try {
    const data = Object.fromEntries(formData.entries());
    const result = await apiPost<{ id: string; email: string }>('/v1/admin/users', data);
    revalidatePath('/users');
    return { email: result.email };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CONFLICT') return { error: 'Este e-mail já está em uso.' };
      if (error.message === 'INVALID_INPUT') return { error: 'Preencha os dados corretamente.' };
    }
    return { error: 'Ocorreu um erro ao criar a conta.' };
  }
}
