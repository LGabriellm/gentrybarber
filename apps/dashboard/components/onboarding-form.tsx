'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';


export function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const data = {
      tenantName: formData.get('tenantName') as string,
      tenantSlug: formData.get('tenantSlug') as string,
      locationName: formData.get('locationName') as string,
    };

    try {
      const response = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        setError(response.status === 409 ? 'Este identificador (URL) já está em uso.' : 'Erro ao criar ambiente. Tente novamente.');
      } else {
        // Redireciona para o novo ambiente
        router.refresh();
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Bem-vindo à Plataforma</h2>
      <p>Sua conta está pronta. Vamos configurar o seu ambiente (barbearia) para você começar a usar.</p>
      
      {error && <div className="alert error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          <span>Nome da Barbearia</span>
          <input type="text" name="tenantName" required minLength={2} maxLength={64} placeholder="Ex: Barbearia do Zé" />
        </label>
        
        <label>
          <span>Identificador (URL)</span>
          <input type="text" name="tenantSlug" required minLength={2} maxLength={63} pattern="^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$" placeholder="ex: barbearia-do-ze" title="Apenas letras minúsculas, números e hifens." />
          <p className="help-text">Isto será usado no link do seu site (identificador da sua barbearia)</p>
        </label>

        <label>
          <span>Nome da Primeira Unidade</span>
          <input type="text" name="locationName" required minLength={2} maxLength={64} defaultValue="Unidade Principal" />
        </label>

        <button type="submit" className="button primary" disabled={loading}>
          {loading ? 'Criando ambiente...' : 'Criar ambiente'}
        </button>
      </form>
    </section>
  );
}

