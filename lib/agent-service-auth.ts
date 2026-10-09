import { timingSafeEqual } from "node:crypto";
import { isValidObjectId } from "mongoose";

import { getServerEnvironment } from "@/config/env";

function secretMatches(input: string | null, expected: string | undefined): boolean {
  if (!input || !expected) return false;
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Agent → WorkOS 的内部调用鉴权：与 WorkOS → Agent 方向共用同一组服务密钥
 *  （WORKOS_SERVICE_SECRET_*），双向都是服务到服务，无用户 cookie。 */
export function isAgentServiceAuthorized(request: Request): boolean {
  const environment = getServerEnvironment();
  if (!environment) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-workos-service-secret");
  return secretMatches(supplied, environment.WORKOS_SERVICE_SECRET_CURRENT) || secretMatches(supplied, environment.WORKOS_SERVICE_SECRET_PREVIOUS);
}

export function isAgentUserId(value: string): boolean {
  return isValidObjectId(value);
}
