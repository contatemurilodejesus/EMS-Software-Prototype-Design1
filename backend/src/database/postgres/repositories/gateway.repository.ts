/**
 * Repositories PostgreSQL - heartbeat de gateways (secao 11).
 *
 * `identifier` e o id do dispositivo no broker (coluna UNIQUE). O filtro de
 * tenant e feito em DOIS lugares: na clausula WHERE (indice) e na RLS do
 * banco - uma mensagem MQTT forjada de outro tenant nao alcanca a linha.
 */
import type { IGatewayRepository } from "../../../domain/ports/index.ts";
import type { DatabasePort } from "../pool.ts";

export function createPostgresGatewayRepository(db: DatabasePort): IGatewayRepository {
  return {
    async heartbeat(identifier: string, at: Date): Promise<boolean> {
      const { rows } = await db.query<{ id: string }>(
        `UPDATE gateways
            SET last_seen_at = $2, status = 'online', updated_at = now()
          WHERE identifier = $1
            AND tenant_id = app_current_tenant()
            AND deleted_at IS NULL
          RETURNING id`,
        [identifier, at],
      );
      return rows.length > 0;
    },
  };
}