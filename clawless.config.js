/**
 * ClawLess Integration — meta-ads-analyzer
 * Runtime serverless para agentes de IA no browser via WebContainers
 * https://github.com/open-gitagent/clawless
 *
 * Uso: importe este módulo no dashboard para habilitar análises
 * executadas diretamente no browser sem servidor.
 *
 * Instalação:
 *   npm install clawcontainer
 */

// import { ClawContainer } from 'clawcontainer';

const clawlessConfig = {
  /**
   * Template padrão de agente para análise de Meta Ads
   * O agente recebe dados da API Meta e gera relatórios/scripts
   */
  template: 'gitclaw',

  /**
   * Variáveis de ambiente injetadas no container WASM
   * Substitua pelos valores reais via process.env em produção
   */
  env: {
    // Provedor de IA preferido (compatível com sua stack)
    AI_PROVIDER: 'google',                          // 'anthropic' | 'openai' | 'google'
    GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || '',
    OPENAI_API_KEY:    process.env.OPENAI_API_KEY    || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

    // Modelo padrão
    CLAWLESS_MODEL: 'gemini-2.0-flash',

    // Contexto do projeto
    PROJECT: 'meta-ads-analyzer',
    META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID || '',
    META_ACCESS_TOKEN:  process.env.META_ACCESS_TOKEN  || '',
  },

  /**
   * Política de segurança do container (sandbox WASM)
   * O agente NÃO pode acessar o sistema host — apenas o filesystem virtual
   */
  policy: {
    allowedProcesses: ['node', 'npm', 'npx'],
    fileAccess: {
      read:  ['**/*.js', '**/*.json', '**/*.md'],
      write: ['output/**', 'reports/**'],
      deny:  ['.env', '**/*.key', '**/*.pem'],
    },
    network: {
      allowedHosts: [
        'graph.facebook.com',
        'generativelanguage.googleapis.com',
        'api.openai.com',
        'api.anthropic.com',
      ],
    },
    limits: {
      maxFileSize:  '10mb',
      maxProcesses: 5,
      maxTurns:     20,
      timeout:      '5m',
    },
  },
};

/**
 * Inicializa o ClawContainer no elemento HTML fornecido
 *
 * @param {string} selector - seletor CSS do elemento container (ex: '#clawless-panel')
 * @returns {Promise<void>}
 *
 * Exemplo de uso no dashboard.html:
 *   import { initClawless } from './clawless.config.js';
 *   await initClawless('#ai-panel');
 */
export async function initClawless(selector = '#clawless-panel') {
  // Importação dinâmica — só carrega quando chamado
  const { ClawContainer } = await import('https://esm.sh/clawcontainer@latest');

  const cc = new ClawContainer(selector, clawlessConfig);
  await cc.start();

  cc.on('ready', () => {
    console.log('[ClawLess] Container pronto — agente de análise Meta Ads iniciado');
  });

  cc.on('message', (msg) => {
    console.log('[ClawLess] Agente:', msg);
  });

  cc.on('error', (err) => {
    console.error('[ClawLess] Erro no container:', err);
  });

  return cc;
}

export default clawlessConfig;
