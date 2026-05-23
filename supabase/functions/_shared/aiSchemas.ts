/**
 * 兼容层：保留 _shared/aiSchemas.ts 的现有 import 路径。
 * 所有 schema 与类型已迁移到 packages/contracts/index.ts。
 *
 * Deno 用相对路径 + 显式 .ts 后缀；packages/contracts 内部的 `import { z } from 'zod'`
 * 通过 supabase/functions/deno.json 的 imports map 映射到 npm:zod@4.4.3。
 */
export {
  AiSourceSchema,
  EvaluateProposalOutputSchema,
  GenerateEventsOutputSchema,
  type AiSource,
} from '../../../packages/contracts/index.ts';
