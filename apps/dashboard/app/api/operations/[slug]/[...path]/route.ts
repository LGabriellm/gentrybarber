import { proxyOperation } from '../../../../../lib/booking-proxy';
import type { OperationRouteParams } from '../../../../../lib/booking-proxy';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<OperationRouteParams> }) { return proxyOperation(request, await context.params); }
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
