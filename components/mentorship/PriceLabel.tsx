export function formatMinor(amountMinor: number, currency: string): string {
  const amount = amountMinor / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function PriceLabel({
  pricePerSessionMinor,
  currency,
  acceptingFree,
  acceptingPaid,
}: {
  pricePerSessionMinor: number;
  currency: string;
  acceptingFree: boolean;
  acceptingPaid: boolean;
}) {
  if (acceptingFree && !acceptingPaid) return <span className="font-bold text-emce-mid">Free</span>;
  if (acceptingPaid && !acceptingFree) {
    return <span className="font-bold text-emce-text">{formatMinor(pricePerSessionMinor, currency)} <span className="text-xs font-normal text-emce-text-sec">/ session</span></span>;
  }
  return (
    <span className="font-bold text-emce-text">
      {formatMinor(pricePerSessionMinor, currency)}{" "}
      <span className="text-xs font-normal text-emce-text-sec">or free</span>
    </span>
  );
}
