import DailyCheckup from '@/components/DailyCheckup';
import LoginGate from '@/components/LoginGate';

export default function DailyCheckupPage() {
  return (
    <LoginGate>
      <DailyCheckup />
    </LoginGate>
  );
}
