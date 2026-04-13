import { NavLink, Outlet, useLocation } from 'react-router';

interface PageMeta {
  readonly title: string;
  readonly subtitle: string;
}

const navigationItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
  },
  {
    to: '/admin/settings',
    label: 'Admin',
  },
  {
    to: '/integrations/google-ads',
    label: 'Google Ads',
  },
  {
    to: '/reports',
    label: 'Relatorios',
  },
] as const;

const pageMetaByPath: Record<string, PageMeta> = {
  '/dashboard': {
    title: 'Workspace operacional',
    subtitle:
      'Monitore performance, integracoes e proximas acoes sem depender da Google Ads API em tempo real.',
  },
  '/admin/settings': {
    title: 'Administracao da integracao',
    subtitle:
      'Controle credenciais, politica de sincronizacao e governanca do ambiente pelo backend.',
  },
  '/integrations/google-ads': {
    title: 'Conexoes Google Ads',
    subtitle:
      'Gerencie onboarding, status das contas e fila de descoberta com seguranca.',
  },
  '/reports': {
    title: 'Relatorios executivos',
    subtitle:
      'Acompanhe decks gerados, proximas entregas e historico de exportacao.',
  },
};

export function AppShell() {
  const location = useLocation();
  const pageMeta = resolvePageMeta(location.pathname);

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-logo">
          <strong>Google Ads SaaS</strong>
          <span>
            Painel local-first para operacao, diagnostico e narrativa executiva.
          </span>
        </div>

        <nav className="workspace-nav" aria-label="Navegacao principal">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'workspace-link active' : 'workspace-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <p className="workspace-hint">
          Ambiente local de teste. As rotas administrativas atuais existem para
          desenvolvimento e devem ganhar autenticacao forte antes de ir para
          producao.
        </p>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="topbar-copy">
            <span className="eyebrow">Workspace</span>
            <h1 className="page-title">{pageMeta.title}</h1>
            <p className="page-subtitle">{pageMeta.subtitle}</p>
          </div>

          <div className="topbar-pills">
            <span className="pill pill-neutral">Local-first</span>
            <span className="pill pill-success">API em backend</span>
            <span className="pill pill-warning">Modo local</span>
          </div>
        </header>

        <div className="workspace-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function resolvePageMeta(pathname: string): PageMeta {
  if (pathname.startsWith('/clients/')) {
    return {
      title: 'Cliente',
      subtitle:
        'Visualize metas, relatorios e escopo de acesso do cliente selecionado.',
    };
  }

  return (
    pageMetaByPath[pathname] ?? {
      title: 'Workspace',
      subtitle: 'Ambiente administrativo do produto.',
    }
  );
}
