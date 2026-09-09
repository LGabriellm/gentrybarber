import { proxyCatalog } from '../../../../../../lib/catalog-proxy';
import type { CatalogRouteParams } from '../../../../../../lib/catalog-proxy';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<CatalogRouteParams> };
async function handle(request: Request, context: Context) {
  return proxyCatalog(request, await context.params);
}
export { handle as GET, handle as POST, handle as PATCH };
