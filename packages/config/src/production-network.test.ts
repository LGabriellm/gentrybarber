import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rootFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('production network boundary', () => {
  it('binds every application port to loopback instead of the public interface', () => {
    const compose = rootFile('compose.production.yaml');
    expect(compose).not.toMatch(/ports:\s*\[[^\]]*0\.0\.0\.0:/);
    expect(compose.match(/ports: \['127\.0\.0\.1:\$\{/g)).toHaveLength(4);
    expect(compose).not.toContain('BYPASS_HTTPS_CHECK');
  });

  it('gives reserved service hosts explicit routes before the tenant wildcard', () => {
    const caddy = rootFile('infra/vps/Caddyfile');
    for (const service of ['api', 'dashboard', 'admin', 'app']) {
      expect(caddy).toContain(`${service}.{{PLATFORM_DOMAIN}}`);
      expect(caddy.indexOf(`${service}.{{PLATFORM_DOMAIN}}`)).toBeLessThan(caddy.indexOf('http://*.{{PLATFORM_DOMAIN}}'));
    }
    expect(caddy).toContain('@private path /ready /openapi.json');
    expect(caddy).toContain('ask http://127.0.0.1:{{API_HOST_PORT}}/internal/tls/authorize');
    expect(caddy).toContain('on_demand');
    expect(caddy).toContain('redir https://{host}{uri} permanent');
    expect(caddy).not.toMatch(/Strict-Transport-Security[^\n]*includeSubDomains/);
  });

  it('uses HTTPS service URLs and key-based deployment authentication', () => {
    const environment = rootFile('.env.production.example');
    const workflow = rootFile('.github/workflows/deploy.yml');
    expect(environment).toContain('BETTER_AUTH_URL=https://api.gentryhub.tech');
    expect(environment).toContain('TRUSTED_ORIGINS=https://dashboard.gentryhub.tech,https://admin.gentryhub.tech');
    expect(workflow).toContain('key: ${{ secrets.VPS_SSH_KEY }}');
    expect(workflow).toContain('passphrase: ${{ secrets.VPS_SSH_PASSPHRASE }}');
    expect(workflow).toContain('fingerprint: SHA256:3jznb3JdQinBPNtXDIMgOq+Y5tZgB3v6t3/hRp6Kyrg');
    expect(workflow).toContain('protocol: tcp4');
    expect(workflow).not.toContain('secrets.VPS_SSH_FINGERPRINT');
    expect(workflow).not.toContain('VPS_PASSWORD');
  });
});
