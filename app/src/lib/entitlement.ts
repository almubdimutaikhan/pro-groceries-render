/**
 * What is free and what needs a membership. Kept in IndexedDB on this device (record `entitlement`
 * in the `app` store). There is no server, so this is a demo-grade gate, not security: see README.
 *
 *   Free    build the cheaper basket, shopping list, locks, one re-pricing
 *   Member  weekly re-pricing, savings counter, Weekly report with Price watch, the 5× guarantee
 */
export interface Entitlement {
  member: boolean;
  period: 'year' | 'month' | null;
  since: string | null;
  /** Re-pricings a free shopper has already used. */
  freeRepricesUsed: number;
}

export const NO_ENTITLEMENT: Entitlement = { member: false, period: null, since: null, freeRepricesUsed: 0 };
export const FREE_REPRICES = 1;

export const canReprice = (e: Entitlement): boolean => e.member || e.freeRepricesUsed < FREE_REPRICES;
