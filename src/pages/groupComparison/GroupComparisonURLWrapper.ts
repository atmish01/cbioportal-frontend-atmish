import URLWrapper from '../../shared/lib/URLWrapper';
import ExtendedRouterStore from '../../shared/lib/ExtendedRouterStore';
import { computed, makeObservable } from 'mobx';
import { getTabId } from './GroupComparisonUtils';
import { GroupComparisonTab } from './GroupComparisonTabs';
import autobind from 'autobind-decorator';
import { OverlapStrategy } from '../../shared/lib/comparison/ComparisonStore';
import IComparisonURLWrapper from 'pages/groupComparison/IComparisonURLWrapper';
import {
    cnaGroup,
    CopyNumberEnrichmentEventType,
    EnrichmentEventType,
    MutationEnrichmentEventType,
    mutationGroup,
} from 'shared/lib/comparison/ComparisonStoreUtils';
import { getServerConfig } from 'config/config';
import { MapValues } from 'shared/lib/TypeScriptUtils';

export type GroupComparisonURLQuery = {
    comparisonId: string;
    groupOrder?: string; // json stringified array of names
    unselectedGroups?: string; // json stringified array of names
    overlapStrategy?: OverlapStrategy;
    patientEnrichments?: string;
    selectedEnrichmentEventTypes: string;
    mutations_gene?: string;
    mutations_transcript_id: string;
    gene_list: string;
    cancer_study_list: string;
    hide_unprofiled_samples?: string;
    case_ids: string;
    profileFilter: string;
    RPPA_SCORE_THRESHOLD?: string;
    Z_SCORE_THRESHOLD?: string;
    case_set_id: string;
    sample_list_ids?: string;
};

export enum GroupComparisonURLQueryEnum {
    mutations_gene = 'mutations_gene',
    mutations_transcript_id = 'mutations_transcript_id',
    gene_list = 'gene_list',
    case_set_id = 'case_set_id',
    RPPA_SCORE_THRESHOLD = 'RPPA_SCORE_THRESHOLD',
    Z_SCORE_THRESHOLD = 'Z_SCORE_THRESHOLD',
    cancer_study_list = 'cancer_study_list',
    hide_unprofiled_samples = 'hide_unprofiled_samples',
    case_ids = 'case_ids',
    profileFilter = 'profileFilter',
    sample_list_ids = 'sample_list_ids',
}

export default class GroupComparisonURLWrapper
    extends URLWrapper<GroupComparisonURLQuery>
    implements IComparisonURLWrapper {
    constructor(routing: ExtendedRouterStore) {
        super(
            routing,
            {
                comparisonId: { isSessionProp: true, aliases: ['sessionId'] },
                groupOrder: { isSessionProp: false },
                unselectedGroups: { isSessionProp: false },
                overlapStrategy: { isSessionProp: false },
                patientEnrichments: { isSessionProp: false },
                selectedEnrichmentEventTypes: { isSessionProp: true },
                mutations_gene: { isSessionProp: false },
                mutations_transcript_id: { isSessionProp: false },
                gene_list: { isSessionProp: true },
                cancer_study_list: { isSessionProp: true },
                hide_unprofiled_samples: { isSessionProp: true },
                case_ids: { isSessionProp: true },
                profileFilter: { isSessionProp: true },
                RPPA_SCORE_THRESHOLD: { isSessionProp: true },
                Z_SCORE_THRESHOLD: { isSessionProp: true },
                case_set_id: { isSessionProp: true },
                sample_list_ids: { isSessionProp: true },
            },
            true,
            getServerConfig().session_url_length_threshold
                ? parseInt(getServerConfig().session_url_length_threshold)
                : undefined
        );
        makeObservable(this);
    }

    @computed public get tabId() {
        return getTabId(this.pathName) || GroupComparisonTab.OVERLAP;
    }

    @autobind
    public setTabId(tabId: GroupComparisonTab, replace?: boolean) {
        this.updateURL({}, `comparison/${tabId}`, false, replace);
    }

    @computed public get selectedEnrichmentEventTypes() {
        if (this.query.selectedEnrichmentEventTypes) {
            return JSON.parse(this.query.selectedEnrichmentEventTypes) as (
                | MutationEnrichmentEventType
                | CopyNumberEnrichmentEventType
            )[];
        } else {
            return undefined;
        }
    }

    @autobind
    public updateSelectedEnrichmentEventTypes(t: EnrichmentEventType[]) {
        this.updateURL({
            selectedEnrichmentEventTypes: JSON.stringify(t),
        });
    }
}
