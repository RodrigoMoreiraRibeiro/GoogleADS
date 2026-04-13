import {
  type GoogleAdsAdminSettingsView,
  type UpdateGoogleAdsAdminSettingsInput,
} from '@googleads/shared';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { httpGet, httpRequest } from '../../../shared/api/http-client';

interface SecretDraftState {
  readonly googleClientSecret: string;
  readonly developerTokenValue: string;
}

const defaultFormState: UpdateGoogleAdsAdminSettingsInput = {
  googleClientId: '',
  googleAdsRedirectUri: '',
  googleAdsApiVersion: 'v21',
  developerTokenAlias: 'primary-google-ads-token',
  loginCustomerId: '',
  integrationMode: 'mcc',
  requireMfaForChanges: true,
  enableManualSync: true,
  allowSearchTerms: false,
  intradaySyncWindow: '2h',
};

export function AdminSettingsPage() {
  const [formState, setFormState] =
    useState<UpdateGoogleAdsAdminSettingsInput>(defaultFormState);
  const [secretDrafts, setSecretDrafts] = useState<SecretDraftState>({
    googleClientSecret: '',
    developerTokenValue: '',
  });
  const [settingsView, setSettingsView] =
    useState<GoogleAdsAdminSettingsView | null>(null);
  const [statusTone, setStatusTone] = useState<'info' | 'warning' | 'success'>(
    'info',
  );
  const [statusMessage, setStatusMessage] = useState(
    'Carregando configuracao administrativa do backend local...',
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadSettings() {
      try {
        const response = await httpGet<GoogleAdsAdminSettingsView>(
          '/admin/settings/google-ads',
        );

        if (ignore) {
          return;
        }

        setSettingsView(response);
        setFormState(mapViewToInput(response));
        setStatusTone('info');
        setStatusMessage(
          'Configuracao carregada do backend. Segredos permanecem write-only.',
        );
      } catch (error) {
        if (ignore) {
          return;
        }

        setStatusTone('warning');
        setStatusMessage(
          'Nao foi possivel carregar a configuracao. Confirme se a API local esta rodando em /api/admin/settings/google-ads.',
        );
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      ignore = true;
    };
  }, []);

  const readinessItems = useMemo(
    () => [
      {
        title: 'Client secret',
        status: settingsView?.hasGoogleClientSecret ? 'Configurado' : 'Pendente',
      },
      {
        title: 'Developer token',
        status: settingsView?.hasDeveloperToken ? 'Configurado' : 'Pendente',
      },
      {
        title: 'Callback OAuth',
        status:
          formState.googleAdsRedirectUri.length > 0 ? 'Definido' : 'Pendente',
      },
      {
        title: 'Protecao MFA',
        status: formState.requireMfaForChanges ? 'Ativa' : 'Revisar',
      },
    ],
    [formState.googleAdsRedirectUri, formState.requireMfaForChanges, settingsView],
  );

  function updateField<K extends keyof UpdateGoogleAdsAdminSettingsInput>(
    field: K,
    value: UpdateGoogleAdsAdminSettingsInput[K],
  ) {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }));
  }

  function updateSecretDraft<K extends keyof SecretDraftState>(
    field: K,
    value: SecretDraftState[K],
  ) {
    setSecretDrafts((currentState) => ({
      ...currentState,
      [field]: value,
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatusTone('info');
    setStatusMessage(
      'Persistindo configuracao no backend local com segredos write-only...',
    );

    try {
      const payload: UpdateGoogleAdsAdminSettingsInput = {
        ...formState,
        googleClientSecret:
          secretDrafts.googleClientSecret.trim().length > 0
            ? secretDrafts.googleClientSecret.trim()
            : undefined,
        developerTokenValue:
          secretDrafts.developerTokenValue.trim().length > 0
            ? secretDrafts.developerTokenValue.trim()
            : undefined,
      };

      const response = await httpRequest<GoogleAdsAdminSettingsView>(
        '/admin/settings/google-ads',
        {
          method: 'PUT',
          csrfToken: 'local-dev-admin',
          body: payload,
        },
      );

      setSettingsView(response);
      setFormState(mapViewToInput(response));
      setSecretDrafts({
        googleClientSecret: '',
        developerTokenValue: '',
      });
      setStatusTone('success');
      setStatusMessage(
        'Configuracao salva no backend local. Os segredos foram aceitos sem serem devolvidos ao navegador.',
      );
    } catch (error) {
      setStatusTone('warning');
      setStatusMessage(
        'Falha ao salvar configuracao. Revise os campos obrigatorios e confirme se a API local esta ativa em modo development.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="surface">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Configuracao real da integracao</h2>
            <p className="section-copy">
              Este formulario conversa com o backend local em{' '}
              <span className="mono">/api/admin/settings/google-ads</span>. Os
              segredos sao enviados apenas para escrita e nunca retornam na
              resposta.
            </p>
          </div>
          <span className="pill pill-warning">Dev-only endpoint</span>
        </div>

        <form className="admin-form" onSubmit={handleSave}>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">Google Client ID</span>
              <input
                className="field-input"
                type="text"
                value={formState.googleClientId}
                onChange={(event) =>
                  updateField('googleClientId', event.target.value)
                }
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Google Ads API version</span>
              <input
                className="field-input"
                type="text"
                value={formState.googleAdsApiVersion}
                onChange={(event) =>
                  updateField('googleAdsApiVersion', event.target.value)
                }
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Redirect URI OAuth</span>
              <input
                className="field-input"
                type="url"
                value={formState.googleAdsRedirectUri}
                onChange={(event) =>
                  updateField('googleAdsRedirectUri', event.target.value)
                }
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Alias do developer token</span>
              <input
                className="field-input"
                type="text"
                value={formState.developerTokenAlias}
                onChange={(event) =>
                  updateField('developerTokenAlias', event.target.value)
                }
                required
              />
            </label>

            <label className="field">
              <span className="field-label">Login customer ID</span>
              <input
                className="field-input"
                type="text"
                value={formState.loginCustomerId}
                onChange={(event) =>
                  updateField('loginCustomerId', event.target.value)
                }
                placeholder="Opcional para uso via MCC"
              />
            </label>

            <label className="field">
              <span className="field-label">Modo de integracao</span>
              <select
                className="field-select"
                value={formState.integrationMode}
                onChange={(event) =>
                  updateField(
                    'integrationMode',
                    event.target.value as UpdateGoogleAdsAdminSettingsInput['integrationMode'],
                  )
                }
              >
                <option value="mcc">MCC / multi-client</option>
                <option value="single-account">Conta isolada</option>
              </select>
            </label>

            <label className="field">
              <span className="field-label">Client secret</span>
              <input
                className="field-input"
                type="password"
                value={secretDrafts.googleClientSecret}
                onChange={(event) =>
                  updateSecretDraft('googleClientSecret', event.target.value)
                }
                placeholder={
                  settingsView?.hasGoogleClientSecret
                    ? 'Ja configurado. Preencha apenas para rotacionar.'
                    : 'Enviar secret ao backend'
                }
              />
              <span className="field-hint">
                Write-only. O valor salvo nao volta para o navegador.
              </span>
            </label>

            <label className="field">
              <span className="field-label">Developer token</span>
              <input
                className="field-input"
                type="password"
                value={secretDrafts.developerTokenValue}
                onChange={(event) =>
                  updateSecretDraft('developerTokenValue', event.target.value)
                }
                placeholder={
                  settingsView?.hasDeveloperToken
                    ? 'Ja configurado. Preencha apenas para rotacionar.'
                    : 'Enviar token ao backend'
                }
              />
              <span className="field-hint">
                O alias fica visivel. O token real nao deve ser exibido novamente.
              </span>
            </label>
          </div>

          <div className="support-grid">
            <section className="surface surface-quiet">
              <div className="surface-header">
                <div>
                  <h3 className="surface-title">Politicas operacionais</h3>
                  <p className="section-copy">
                    Essas chaves controlam o comportamento permitido por tenant.
                  </p>
                </div>
              </div>

              <div className="toggle-list">
                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={formState.requireMfaForChanges}
                    onChange={(event) =>
                      updateField('requireMfaForChanges', event.target.checked)
                    }
                  />
                  <span>
                    <strong>Exigir MFA em mudancas sensiveis</strong>
                    <span className="list-row-text">
                      Use MFA para alterar OAuth, segredos, callback ou politicas
                      de sync.
                    </span>
                  </span>
                </label>

                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={formState.enableManualSync}
                    onChange={(event) =>
                      updateField('enableManualSync', event.target.checked)
                    }
                  />
                  <span>
                    <strong>Permitir sync manual</strong>
                    <span className="list-row-text">
                      A requisicao entra em fila; o dashboard nao dispara consulta
                      imediata na API do Google.
                    </span>
                  </span>
                </label>

                <label className="toggle-item">
                  <input
                    type="checkbox"
                    checked={formState.allowSearchTerms}
                    onChange={(event) =>
                      updateField('allowSearchTerms', event.target.checked)
                    }
                  />
                  <span>
                    <strong>Habilitar search terms</strong>
                    <span className="list-row-text">
                      Recurso mais pesado. Mantenha desligado enquanto o tenant nao
                      precisar dessa profundidade.
                    </span>
                  </span>
                </label>
              </div>
            </section>

            <section className="surface surface-quiet">
              <div className="surface-header">
                <div>
                  <h3 className="surface-title">Leitura rapida do estado</h3>
                  <p className="section-copy">
                    O backend devolve apenas metadados e flags de configuracao.
                  </p>
                </div>
              </div>

              <div className="list-stack">
                {readinessItems.map((item) => (
                  <div className="list-row" key={item.title}>
                    <div>
                      <h4 className="list-row-title">{item.title}</h4>
                    </div>
                    <span className="pill pill-neutral">{item.status}</span>
                  </div>
                ))}
                <div className="list-row">
                  <div>
                    <h4 className="list-row-title">Atualizado em</h4>
                  </div>
                  <span className="pill pill-neutral">
                    {settingsView?.updatedAt
                      ? new Date(settingsView.updatedAt).toLocaleString('pt-BR')
                      : 'Sem alteracoes'}
                  </span>
                </div>
              </div>
            </section>
          </div>

          <label className="field">
            <span className="field-label">Janela do sync intraday</span>
            <select
              className="field-select"
              value={formState.intradaySyncWindow}
              onChange={(event) =>
                updateField(
                  'intradaySyncWindow',
                  event.target.value as UpdateGoogleAdsAdminSettingsInput['intradaySyncWindow'],
                )
              }
            >
              <option value="2h">A cada 2 horas</option>
              <option value="4h">A cada 4 horas</option>
              <option value="6h">A cada 6 horas</option>
            </select>
          </label>

          <div className={`status-banner ${statusTone}`}>{statusMessage}</div>

          <div className="button-row">
            <button className="button-primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar configuracao'}
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                setSecretDrafts({
                  googleClientSecret: '',
                  developerTokenValue: '',
                });
                setStatusTone('info');
                setStatusMessage(
                  'Campos write-only limpos. A configuracao persistida permanece no backend.',
                );
              }}
            >
              Limpar campos sensiveis
            </button>
          </div>
        </form>
      </section>

      <section className="surface surface-quiet">
        <div className="surface-header">
          <div>
            <h2 className="surface-title">Checklist para producao</h2>
            <p className="section-copy">
              O endpoint atual existe para desenvolvimento local. Antes de migrar
              para Hostinger, ele precisa ser protegido por autenticacao e
              auditoria.
            </p>
          </div>
        </div>

        <ul className="helper-list">
          <li>Exigir sessao autenticada e papel administrativo.</li>
          <li>Adicionar MFA step-up para alteracao de credenciais sensiveis.</li>
          <li>Registrar auditoria append-only de leitura e alteracao.</li>
          <li>Persistir configuracao em banco e segredos criptografados em repouso.</li>
          <li>Nao devolver segredos salvos em nenhuma resposta HTTP.</li>
          <li>Permitir teste de callback e consentimento sem revelar tokens.</li>
        </ul>
      </section>

      {isLoading ? (
        <section className="surface surface-quiet">
          <p className="muted-copy">
            Carregando dados administrativos do backend local...
          </p>
        </section>
      ) : null}
    </>
  );
}

function mapViewToInput(
  settings: GoogleAdsAdminSettingsView,
): UpdateGoogleAdsAdminSettingsInput {
  return {
    googleClientId: settings.googleClientId,
    googleAdsRedirectUri: settings.googleAdsRedirectUri,
    googleAdsApiVersion: settings.googleAdsApiVersion,
    developerTokenAlias: settings.developerTokenAlias,
    loginCustomerId: settings.loginCustomerId,
    integrationMode: settings.integrationMode,
    requireMfaForChanges: settings.requireMfaForChanges,
    enableManualSync: settings.enableManualSync,
    allowSearchTerms: settings.allowSearchTerms,
    intradaySyncWindow: settings.intradaySyncWindow,
  };
}
