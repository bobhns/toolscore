import type { OpenAIClientConfig } from '../types/index.js'

/**
 * Parse a model string into OpenAI client configuration.
 * 
 * Formats:
 *   ollama/llama3.1:8b         → Ollama (localhost:11434)
 *   openai/gpt-4o              → OpenAI API
 *   openrouter/anthropic/...   → OpenRouter
 *   groq/llama-3.1-70b         → Groq
 *   anthropic/claude-3-haiku   → Anthropic (via their OpenAI-compat endpoint)
 *   http://custom:8080/v1:modelname → Custom endpoint
 *   bare-model-name            → OpenAI (assumed)
 */
export function parseModel(modelString: string, overrides?: {
  apiKey?: string
  baseUrl?: string
}): OpenAIClientConfig {
  // Custom URL format: http://host:port/v1:model-name
  if (modelString.startsWith('http://') || modelString.startsWith('https://')) {
    const lastColon = modelString.lastIndexOf(':')
    // Check if last colon is part of the URL path (i.e., after /v1)
    const slashIndex = modelString.indexOf('/', modelString.indexOf('//') + 2)
    if (lastColon > slashIndex) {
      const baseURL = modelString.substring(0, lastColon)
      const model = modelString.substring(lastColon + 1)
      return {
        baseURL: overrides?.baseUrl ?? baseURL,
        apiKey: overrides?.apiKey ?? 'none',
        model,
        providerName: 'custom',
      }
    }
    // URL without explicit model — use it as base URL
    return {
      baseURL: overrides?.baseUrl ?? modelString,
      apiKey: overrides?.apiKey ?? 'none',
      model: 'default',
      providerName: 'custom',
    }
  }

  const parts = modelString.split('/')
  const provider = parts[0]
  const model = parts.slice(1).join('/')

  switch (provider) {
    case 'ollama':
      return {
        baseURL: overrides?.baseUrl ?? (process.env.OLLAMA_HOST ?? 'http://localhost:11434/v1'),
        apiKey: overrides?.apiKey ?? (process.env.OLLAMA_API_KEY ?? 'ollama'),
        model: model || modelString,
        providerName: 'ollama',
      }

    case 'openai':
      return {
        baseURL: overrides?.baseUrl ?? 'https://api.openai.com/v1',
        apiKey: overrides?.apiKey ?? (process.env.OPENAI_API_KEY ?? ''),
        model: model || modelString,
        providerName: 'openai',
      }

    case 'openrouter':
      return {
        baseURL: overrides?.baseUrl ?? 'https://openrouter.ai/api/v1',
        apiKey: overrides?.apiKey ?? (process.env.OPENROUTER_API_KEY ?? ''),
        model: model || modelString,
        providerName: 'openrouter',
      }

    case 'groq':
      return {
        baseURL: overrides?.baseUrl ?? 'https://api.groq.com/openai/v1',
        apiKey: overrides?.apiKey ?? (process.env.GROQ_API_KEY ?? ''),
        model: model || modelString,
        providerName: 'groq',
      }

    case 'anthropic':
      // Anthropic doesn't have an official OpenAI-compat endpoint,
      // but some proxies do. Support it for custom base URLs.
      return {
        baseURL: overrides?.baseUrl ?? 'https://api.anthropic.com/v1',
        apiKey: overrides?.apiKey ?? (process.env.ANTHROPIC_API_KEY ?? ''),
        model: model || modelString,
        providerName: 'anthropic',
      }

    case 'together':
      return {
        baseURL: overrides?.baseUrl ?? 'https://api.together.xyz/v1',
        apiKey: overrides?.apiKey ?? (process.env.TOGETHER_API_KEY ?? ''),
        model: model || modelString,
        providerName: 'together',
      }

    case 'fireworks':
      return {
        baseURL: overrides?.baseUrl ?? 'https://api.fireworks.ai/inference/v1',
        apiKey: overrides?.apiKey ?? (process.env.FIREWORKS_API_KEY ?? ''),
        model: `accounts/fireworks/models/${model}` || modelString,
        providerName: 'fireworks',
      }

    case 'lmstudio':
      return {
        baseURL: overrides?.baseUrl ?? 'http://localhost:1234/v1',
        apiKey: overrides?.apiKey ?? 'lm-studio',
        model: model || modelString,
        providerName: 'lmstudio',
      }

    default:
      // No recognized provider prefix — assume bare model name for OpenAI
      if (!model) {
        return {
          baseURL: overrides?.baseUrl ?? 'https://api.openai.com/v1',
          apiKey: overrides?.apiKey ?? (process.env.OPENAI_API_KEY ?? ''),
          model: modelString,
          providerName: 'openai',
        }
      }
      // Unknown provider, use as custom with environment variable
      return {
        baseURL: overrides?.baseUrl ?? `https://api.${provider}.com/v1`,
        apiKey: overrides?.apiKey ?? (process.env[`${provider.toUpperCase()}_API_KEY`] ?? ''),
        model,
        providerName: provider,
      }
  }
}

export function getEndpointDisplay(config: OpenAIClientConfig): string {
  const url = new URL(config.baseURL)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return `${url.hostname}:${url.port || 80}`
  }
  return url.hostname
}
