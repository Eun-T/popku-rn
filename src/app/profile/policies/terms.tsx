import PolicyDetailScreen from '../../../components/profile/PolicyDetailScreen';
import { policies } from '../../../content/policies';

export default function Terms() {
  return <PolicyDetailScreen policy={policies.terms} />;
}
