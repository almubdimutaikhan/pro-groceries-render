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
