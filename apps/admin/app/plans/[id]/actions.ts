'use server';
import { revalidatePath } from 'next/cache';
import { apiPatch, apiDelete } from '@platform/web-kit/server';

export async function updatePlanAction(id: string, formData: FormData) {
  try {
    const data = Object.fromEntries(formData.entries());
    const payload = {
      name: data.name as string,
      description: (data.description as string) || null,
      monthlyPriceCents: parseInt(data.monthlyPriceCents as string, 10),
      setupFeeCents: parseInt(data.setupFeeCents as string, 10),
      customDesignFeeCents: parseInt(data.customDesignFeeCents as string, 10),
      active: data.active === 'on',
    };
    if (isNaN(payload.monthlyPriceCents) || isNaN(payload.setupFeeCents) || isNaN(payload.customDesignFeeCents)) {
      return { error: 'Preencha os valores corretamente.' };
    }
    await apiPatch<{ success: boolean }>(`/v1/admin/plans/${encodeURIComponent(id)}`, payload);
    revalidatePath('/plans');
    revalidatePath(`/plans/${id}`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return { error: 'Plano não encontrado.' };
      if (error.message === 'INVALID_INPUT') return { error: 'Preencha os dados corretamente.' };
    }
    return { error: 'Ocorreu um erro ao atualizar o plano.' };
  }
}

export async function deletePlanAction(id: string) {
  try {
    await apiDelete<{ success: boolean }>(`/v1/admin/plans/${encodeURIComponent(id)}`);
    revalidatePath('/plans');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return { error: 'Plano não encontrado.' };
      if (error.message === 'CONFLICT') return { error: 'Este plano está vinculado a barbearias ou assinaturas e não pode ser removido. Desative-o para impedir novos usos.' };
    }
    return { error: 'Ocorreu um erro ao remover o plano.' };
  }
}
