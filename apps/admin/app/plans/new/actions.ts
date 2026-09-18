'use server';
import { apiPost } from '@platform/web-kit/server';
import { revalidatePath } from 'next/cache';

export async function createPlanAction(formData: FormData) {
  try {
    const data = Object.fromEntries(formData.entries());
    const payload = {
      ...data,
      monthlyPriceCents: parseInt(data.monthlyPriceCents as string, 10),
      setupFeeCents: parseInt(data.setupFeeCents as string, 10),
      customDesignFeeCents: parseInt(data.customDesignFeeCents as string, 10),
      basePlanId: data.basePlanId || undefined,
    };
    const result = await apiPost<{ id: string; key: string }>('/v1/admin/plans', payload);
    revalidatePath('/plans');
    return { key: result.key };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'CONFLICT') return { error: 'Este identificador de plano já existe.' };
      if (error.message === 'INVALID_INPUT') return { error: 'Preencha os dados corretamente.' };
    }
    return { error: 'Ocorreu um erro ao criar o plano.' };
  }
}
