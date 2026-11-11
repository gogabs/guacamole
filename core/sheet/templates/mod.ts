import type { SheetTemplate } from "../types.ts";
import { FATE_TEMPLATE } from "./fate.ts";
import { IRONSWORN_TEMPLATE } from "./ironsworn.ts";

export { FATE_TEMPLATE, IRONSWORN_TEMPLATE };

export const BUILT_IN_TEMPLATES: readonly SheetTemplate[] = [FATE_TEMPLATE, IRONSWORN_TEMPLATE];
