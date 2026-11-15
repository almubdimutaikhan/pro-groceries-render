/** Membership pricing: the single source for every screen and the docs. Integer cents. */
export const YEAR_CENTS = 4900;
export const MONTH_CENTS = 599;
/** "Save 5× your membership or get your money back." */
export const GUARANTEE_MULTIPLE = 5;

export const YEAR_LABEL = '$49/year';
export const MONTH_LABEL = '$5.99/month';
export const PRICE_LINE = `${YEAR_LABEL} or ${MONTH_LABEL}`;

export const YEAR_PER_MONTH_CENTS = Math.round(YEAR_CENTS / 12);
export const YEAR_DISCOUNT_PCT = Math.round((1 - YEAR_CENTS / (MONTH_CENTS * 12)) * 100);
/** Savings a member should see over the year for the guarantee to hold. */
export const GUARANTEE_TARGET_CENTS = YEAR_CENTS * GUARANTEE_MULTIPLE;

/**
 * Demo shortcut: tapping "See membership" opens every member feature on this device, no payment.
 * There is no server to verify a payment (see README), so the member flag is demo-grade either way.
 * Set VITE_DEMO_UNLOCK=0 at build time to switch the shortcut off and send people to the plan page instead.
 */
export const DEMO_UNLOCK: boolean = import.meta.env.VITE_DEMO_UNLOCK !== '0';
