import PolicyDetailScreen from '../../../components/profile/PolicyDetailScreen';
import { policies } from '../../../content/policies';

export default function Privacy() {
  return <PolicyDetailScreen policy={policies.privacy} />;
}
