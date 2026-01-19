import ProfitCalculator from '@/components/ProfitCalculator';
import LoginGate from '@/components/LoginGate';

export default function Home() {
  return (
    <LoginGate>
      <ProfitCalculator />
    </LoginGate>
  );
}
