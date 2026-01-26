import RepricingCalculator from '@/components/RepricingCalculator';
import LoginGate from '@/components/LoginGate';

export default function RepricingPage() {
  return (
    <LoginGate>
      <RepricingCalculator />
    </LoginGate>
  );
}
