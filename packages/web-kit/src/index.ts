export interface MembershipView { id: string; role: string; tenant: { id: string; slug: string; name: string } }
export interface AccountView { user: { id: string; name: string; email: string }; memberships: MembershipView[] }
export interface ContextView { tenant: { id: string; slug: string; name: string; status: string }; role: string; permissions: string[] }
export interface SiteView { id: string; title: string; description: string; themeId: string }
export interface FeatureView { key: string; enabled: boolean; limit: number | null }
export const featureLabels: Readonly<Record<string, string>> = {
  website: 'Site da barbearia', booking: 'Agendamento', customers: 'Clientes', advanced_site_builder: 'Editor visual avançado', custom_domain: 'Domínio próprio', custom_design: 'Design personalizado', custom_pages: 'Páginas personalizadas', custom_css: 'Estilos personalizados', premium_animations: 'Animações avançadas', white_label: 'Marca própria', finance: 'Financeiro', commissions: 'Comissões', inventory: 'Estoque', loyalty: 'Fidelidade', coupons: 'Cupons', reviews: 'Avaliações', analytics: 'Análise de resultados', whatsapp_automation: 'Automação no WhatsApp', multi_location: 'Múltiplas unidades',
};
export const roleLabels: Readonly<Record<string, string>> = { OWNER: 'Proprietário', MANAGER: 'Gerente', RECEPTIONIST: 'Recepção', BARBER: 'Barbeiro' };
export * from './booking-widget';
export * from './booking-selection';
export * from './mask';
