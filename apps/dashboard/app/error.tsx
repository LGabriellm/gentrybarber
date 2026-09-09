'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-page"><span className="eyebrow">Não foi possível carregar</span><h1>Vamos tentar novamente.</h1><p>O serviço pode estar temporariamente indisponível ou sua conta pode não ter acesso a este recurso.</p><button className="button" onClick={reset}>Tentar novamente</button> <a href="/">Voltar ao início</a></main>; }

