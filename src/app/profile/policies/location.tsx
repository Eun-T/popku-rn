import PolicyDetailScreen from '../../../components/profile/PolicyDetailScreen';
import { policies } from '../../../content/policies';

export default function Location() {
  return <PolicyDetailScreen policy={policies.location} />;
}
