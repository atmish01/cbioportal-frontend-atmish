import { EnrichmentEventType } from 'shared/lib/comparison/ComparisonStoreUtils';
import URLWrapper from '../../shared/lib/URLWrapper';
export default interface IComparisonURLWrapper {
    selectedEnrichmentEventTypes: EnrichmentEventType[] | undefined;
    updateSelectedEnrichmentEventTypes: (t: EnrichmentEventType[]) => void;
}
