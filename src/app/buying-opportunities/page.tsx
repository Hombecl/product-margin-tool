import BuyingOpportunities from '@/components/BuyingOpportunities';
import LoginGate from '@/components/LoginGate';

export default function BuyingOpportunitiesPage() {
  return (
    <LoginGate>
      <BuyingOpportunities />
    </LoginGate>
  );
}
