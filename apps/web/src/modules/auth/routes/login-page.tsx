import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@local.test');
  const [password, setPassword] = useState('local-only');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate('/dashboard');
  }

  return (
    <main className="auth-page">
      <section className="auth-poster">
        <span className="auth-brand">Google Ads SaaS</span>
        <p className="auth-kicker">Controle operacional para varias contas</p>
        <h1 className="auth-title">Entenda o que mudou antes da proxima reuniao.</h1>
        <p className="auth-copy">
          Centralize sincronizacao, diagnostico e narrativa executiva em um
          ambiente que prioriza dados locais, seguranca e isolamento entre
          clientes.
        </p>

        <div className="auth-highlights">
          <div className="auth-highlight">
            <strong>Local-first de verdade</strong>
            <span>
              Dashboard, insights e relatorios nascem do banco local para reduzir
              custo de API, latencia e risco de quota.
            </span>
          </div>
          <div className="auth-highlight">
            <strong>Leitura executiva e tecnica</strong>
            <span>
              O mesmo dado pode virar diagnostico para gestor e apresentacao clara
              para cliente final.
            </span>
          </div>
          <div className="auth-highlight">
            <strong>Multi-tenant com governanca</strong>
            <span>
              Conexoes, auditoria, escopo e politicas sao desenhados para atender
              varios clientes sem mistura de dados.
            </span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-shell">
          <span className="eyebrow">Ambiente local</span>
          <h1>Entrar</h1>
          <p>
            Este acesso ainda e um fluxo de teste. O proximo passo sera ligar
            sessao server-side, MFA e permissao por tenant no backend.
          </p>

          <form className="stack" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
              />
            </label>

            <label className="field">
              <span className="field-label">Senha</span>
              <input
                className="field-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>

            <div className="button-row">
              <button className="button-primary" type="submit">
                Entrar no workspace
              </button>
              <button className="button-ghost" type="button">
                Ver requisitos de seguranca
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
