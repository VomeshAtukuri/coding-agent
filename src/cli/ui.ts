import chalk from 'chalk';
import { select, text, password, note, isCancel, intro, outro, cancel } from '@clack/prompts';

const PROVIDERS = ['OpenAI', 'Anthropic', 'Azure', 'Custom', 'Google'] as const;
type Provider = (typeof PROVIDERS)[number];

const providerOptions = PROVIDERS.map((p) => ({ value: p, label: p }));

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  resourceName?: string;
  baseURL?: string;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  OpenAI: 'gpt-4o',
  Anthropic: 'claude-sonnet-4-5',
  Azure: 'gpt-4o',
  Google: 'gemini-3.5-flash-lite',
  Custom: 'custom-model',
};

export function Welcome() {
  console.log('');
  console.log(chalk.cyan.bold('  ╔══════════════════════════════════╗'));
  console.log(chalk.cyan.bold('  ║') + chalk.white.bold('        H A R N E S S L Y         ') + chalk.cyan.bold('║'));
  console.log(chalk.cyan.bold('  ╚══════════════════════════════════╝'));
  console.log(chalk.gray('    Your harnessed AI coding agent'));
  console.log(chalk.dim('    Type "exit" to quit | Ctrl+C to cancel'));
  console.log('');
}

/** Unwraps a clack prompt result, exiting cleanly on Ctrl+C / cancel. */
function unwrap<T>(result: T | symbol): T {
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  return result as T;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export async function SelectProvider(): Promise<ProviderConfig> {
  intro(chalk.bold('Setup'));

  const provider = unwrap(
    await select({
      message: 'Select your AI provider',
      options: providerOptions,
    })
  );

  // password() masks input as it's typed — apiKey should never use text().
  const apiKey = unwrap(
    await password({
      message: `Enter your ${provider} API Key`,
      validate: (val) => ((val || '').trim().length < 4 ? 'API key is too short' : undefined),
    })
  );

  const config: ProviderConfig = { provider, apiKey, model: DEFAULT_MODELS[provider] };

  if (provider === 'Azure') {
    config.resourceName = unwrap(
      await text({
        message: 'Enter Azure Resource Name',
        placeholder: 'my-resource',
        validate: (val) => ((val || '').trim().length === 0 ? 'Resource name is required' : undefined),
      })
    );
  }

  if (provider === 'Custom') {
    config.baseURL = unwrap(
      await text({
        message: 'Enter base URL',
        placeholder: 'http://localhost:11434/v1',
        validate: (val) => (!isValidUrl(val || '') ? 'Enter a valid URL' : undefined),
      })
    );
  }

  const defaultModel = DEFAULT_MODELS[provider];
  const model = unwrap(
    await text({
      message: 'Model name',
      placeholder: defaultModel,
      defaultValue: defaultModel,
    })
  );
  config.model = model;

  note(
    `${chalk.dim('Provider')}  ${config.provider}\n` +
      `${chalk.dim('Model')}     ${config.model}\n` +
      `${chalk.dim('Config')}    ${process.cwd()}`,
    chalk.green('Ready')
  );

  outro(chalk.dim('Starting session...'));

  return config;
}