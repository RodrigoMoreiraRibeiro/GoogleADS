import { useParams } from 'react-router';

export function ClientDetailPage() {
  const { clientId } = useParams();

  return (
    <>
      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Cliente selecionado</h2>
            <p className="section-copy">
              Esta area vai concentrar metas, permissao, integracoes e historico
              de relatorios por cliente.
            </p>
          </div>
          <span className="pill pill-neutral mono">{clientId ?? 'sem-id'}</span>
        </div>

        <div className="support-grid">
          <article className="surface surface-quiet">
            <h3 className="surface-title">Escopo previsto</h3>
            <p className="section-copy">
              O backend deve limitar leitura, exportacao e sync manual ao
              `client_id` autorizado no contexto de sessao.
            </p>
          </article>

          <article className="surface surface-quiet">
            <h3 className="surface-title">Proxima implementacao</h3>
            <p className="section-copy">
              Metas, comparativos de periodo, insights aprovados e historico de
              decks executivos do cliente.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
