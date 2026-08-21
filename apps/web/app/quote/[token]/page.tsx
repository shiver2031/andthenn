import { QuoteAcceptance } from "../../../components/quote-acceptance";

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QuoteAcceptance token={token}/>;
}
