import ProfitCalculator from '@/components/ProfitCalculator';
import LoginGate from '@/components/LoginGate';

export default function ProfitScoutPage() {
  return (
    <LoginGate>
      <ProfitCalculator />
    </LoginGate>
  );
}
