import { cookies } from "next/headers";
import {
  DEFAULT_INDUSTRY,
  INDUSTRY_COOKIE,
  parseIndustry,
  type IndustryId,
} from "@/lib/industry";

/** Read active industry from the request cookie (SSR / API routes). */
export function getActiveIndustry(): IndustryId {
  try {
    const value = cookies().get(INDUSTRY_COOKIE)?.value;
    return parseIndustry(value);
  } catch {
    return DEFAULT_INDUSTRY;
  }
}
