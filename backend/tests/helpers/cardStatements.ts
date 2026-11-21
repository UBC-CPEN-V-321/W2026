const lines = (text: string, page: number) => text.trim().split('\n').map(text => ({ text: text.trim(), page }));
// Synthetic examples only. Never put a user's statement or identity in a fixture.
export const chase = () => [
  ...lines('chase.com\nPayable in U.S. dollars\nOpening/Closing Date 12/10/24 - 01/09/25\nPayment, Credits -$27.00\nPurchases +$30.00\nFees Charged $2.00\nInterest Charged +$1.00', 1),
  ...lines('ACCOUNT ACCOUNT ACTIVITY ACTIVITY\nPAYMENTS AND OTHER CREDITS\n01/02 Payment Thank You-Mobile -20.00\n01/03 Example merchant refund -7.00\nPURCHASE\n12/28 Example cafe 10.00', 3),
  ...lines('ACCOUNT ACTIVITY (CONTINUED)\n01/04 Example shop 20.00\n01/05 CANADIAN DOLLAR\n28.00 X 0.714285714 (EXCHG RATE)\nFEES CHARGED\n01/07 Annual fee 2.00\nINTEREST CHARGED\n01/09 PURCHASE INTEREST CHARGE 1.00\nTOTAL INTEREST FOR THIS PERIOD $1.00\n2025 Totals Year-to-Date\n01/04 Should never repeat 20.00\nPURCHASES AND REDEMPTIONS\n01/04 Example shop 20.00', 4),
];
export const amex = () => [
  ...lines('americanexpress.com\nPayable in US dollars\nClosing Date 06/12/25\nPayments/Credits -$54.00\nNew Charges +$23.00\nFees +$0.00\nInterest Charged +$1.00', 1),
  ...lines('Payments and Credits\nDetail\nPayments Amount\n06/01/25* ONLINE PAYMENT - THANK YOU -$50.00\nForeign\nCredits Spend Amount\n06/02/25 Example refund 28.00 -$4.00\nChina Yuan\nNew Charges\nDetail\n06/03/25 Example cafe $3.00', 3),
  ...lines('Detail Continued\nForeign\nSpend Amount\n06/04/25 Multiline merchant 140.00 $20.00\nChina Yuan\nMerchant description continuation\nFees\nTotal Fees for this Period $0.00', 4),
  ...lines('Interest Charged\n06/12/25 Interest Charge on Purchases $1.00\nTotal Interest Charged for this Period $1.00\n2025 Fees and Interest Totals Year-to-Date\n06/12/25 Repeated interest $1.00', 5),
];
