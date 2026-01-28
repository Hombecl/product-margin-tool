import ProductDiscovery from '@/components/ProductDiscovery';
import LoginGate from '@/components/LoginGate';

export default function ProductDiscoveryPage() {
  return (
    <LoginGate>
      <ProductDiscovery />
    </LoginGate>
  );
}
