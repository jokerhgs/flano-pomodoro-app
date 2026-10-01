import { isTauri } from "./os";

export function isDemoMode(): boolean {
  return !isTauri();
}
