import URLWrapper, { PropertiesMap } from '../../shared/lib/URLWrapper';
import ExtendedRouterStore from '../../shared/lib/ExtendedRouterStore';
import { computed, makeObservable } from 'mobx';
import autobind from 'autobind-decorator';
import {
    LegacyResultsViewComparisonSubTab,
    oldTabToNewTabRoute,
    ResultsViewComparisonSubTab,
    ResultsViewTab,
} from 'pages/resultsView/ResultsViewPageHelpers';
import { getServerConfig } from 'config/config';
import {
    cnaGroup,
    CopyNumberEnrichmentEventType,
    EnrichmentEventType,
    MutationEnrichmentEventType,
    mutationGroup,
} from 'shared/lib/comparison/ComparisonStoreUtils';
import IComparisonURLWrapper from 'pages/groupComparison/IComparisonURLWrapper';
import _ from 'lodash';
import { MapValues } from 'shared/lib/TypeScriptUtils';
import { GroupComparisonTab } from 'pages/groupComparison/GroupComparisonTabs';
import { ClinicalTrackConfig } from 'shared/components/oncoprint/Oncoprint';

export type PlotsSelectionParam = {
    selectedGeneOption?: string;
    selectedGenesetOption?: string;
    selectedGenericAssayOption?: string;
    dataType?: string;
    selectedDataSourceOption?: string;
    mutationCountBy?: string;
    structuralVariantCountBy?: string;
    logScale?: string;
};

const PlotsSelectionParamProps: Required<PlotsSelectionParam> = {
    selectedGeneOption: '',
    selectedGenesetOption: '',
    selectedGenericAssayOption: '',
    dataType: '',
    selectedDataSourceOption: '',
    mutationCountBy: '',
    structuralVariantCountBy: '',
    logScale: '',
};

export type PlotsColoringParam = {
    selectedOption?: string;
    logScale?: string;
    colorByMutationType?: string;
    colorByCopyNumber?: string;
    colorBySv?: string;
};

const PlotsColoringParamProps: Required<PlotsColoringParam> = {
    selectedOption: '',
    logScale: '',
    colorByMutationType: '',
    colorByCopyNumber: '',
    colorBySv: '',
};

export enum ResultsViewURLQueryEnum {
    clinicallist = 'clinicallist',
    gene_list = 'gene_list',
    cancer_study_list = 'cancer_study_list',
    case_ids = 'case_ids',
    sample_list_ids = 'sample_list_ids',
    case_set_id = 'case_set_id',
    profileFilter = 'profileFilter',
    RPPA_SCORE_THRESHOLD = 'RPPA_SCORE_THRESHOLD',
    Z_SCORE_THRESHOLD = 'Z_SCORE_THRESHOLD',
    geneset_list = 'geneset_list',
    generic_assay_groups = 'generic_assay_groups',
    show_samples = 'show_samples',
    heatmap_track_groups = 'heatmap_track_groups',
    oncoprint_sortby = 'oncoprint_sortby',
    oncoprint_cluster_profile = 'oncoprint_cluster_profile',
    oncoprint_sort_by_mutation_type = 'oncoprint_sort_by_mutation_type',
    oncoprint_sort_by_drivers = 'oncoprint_sort_by_drivers',
    exclude_germline_mutations = 'exclude_germline_mutations',
    hide_unprofiled_samples = 'hide_unprofiled_samples',
    patient_enrichments = 'patient_enrichments',

    comparison_subtab = 'comparison_subtab',
    comparison_overlapStrategy = 'comparison_overlapStrategy',
    comparison_selectedGroups = 'comparison_selectedGroups',
    comparison_groupOrder = 'comparison_groupOrder',
    comparison_createdGroupsSessionId = 'comparison_createdGroupsSessionId',
    comparison_selectedEnrichmentEventTypes = 'comparison_selectedEnrichmentEventTypes',

    plots_horz_selection = 'plots_horz_selection',
    plots_vert_selection = 'plots_vert_selection',
    plots_coloring_selection = 'plots_coloring_selection',

    genetic_profile_ids_PROFILE_MUTATION_EXTENDED = 'genetic_profile_ids_PROFILE_MUTATION_EXTENDED',
    genetic_profile_ids_PROFILE_COPY_NUMBER_ALTERATION = 'genetic_profile_ids_PROFILE_COPY_NUMBER_ALTERATION',
    genetic_profile_ids_PROFILE_MRNA_EXPRESSION = 'genetic_profile_ids_PROFILE_MRNA_EXPRESSION',
    genetic_profile_ids_PROFILE_PROTEIN_EXPRESSION = 'genetic_profile_ids_PROFILE_PROTEIN_EXPRESSION',
    genetic_profile_ids_PROFILE_GENESET_SCORE = 'genetic_profile_ids_PROFILE_GENESET_SCORE',
    genetic_profile_ids_GENERIC_ASSAY = 'genetic_profile_ids_GENERIC_ASSAY',
    genetic_profile_ids = 'genetic_profile_ids',

    mutations_gene = 'mutations_gene',
    mutations_transcript_id = 'mutations_transcript_id',
}

type StringValuedParams = Exclude<
    keyof typeof ResultsViewURLQueryEnum,
    'plots_horz_selection' | 'plots_vert_selection' | 'plots_coloring_selection'
>;

export type ResultsViewURLQuery = {
    [key in StringValuedParams]: string;
} & {
    plots_horz_selection: PlotsSelectionParam;
    plots_vert_selection: PlotsSelectionParam;
    plots_coloring_selection: PlotsColoringParam;
};

const shouldForceRemount: { [prop in keyof ResultsViewURLQuery]: boolean } = {
    clinicallist: false,
    show_samples: false,
    heatmap_track_groups: false,
    oncoprint_sortby: false,
    oncoprint_cluster_profile: false,
    oncoprint_sort_by_mutation_type: false,
    oncoprint_sort_by_drivers: false,
    generic_assay_groups: false,
    exclude_germline_mutations: false,
    hide_unprofiled_samples: false,
    patient_enrichments: false,

    comparison_subtab: false,
    comparison_overlapStrategy: false,
    comparison_selectedGroups: false,
    comparison_groupOrder: false,
    comparison_selectedEnrichmentEventTypes: false,

    // plots
    plots_horz_selection: false,
    plots_vert_selection: false,
    plots_coloring_selection: false,

    // mutations
    mutations_gene: false,
    mutations_transcript_id: false,

    // session props here
    gene_list: true,
    cancer_study_list: true,
    case_ids: true,
    sample_list_ids: true,
    case_set_id: true,
    profileFilter: true,
    RPPA_SCORE_THRESHOLD: true,
    Z_SCORE_THRESHOLD: true,
    geneset_list: true,
    genetic_profile_ids_PROFILE_MUTATION_EXTENDED: true,
    genetic_profile_ids_PROFILE_COPY_NUMBER_ALTERATION: true,
    genetic_profile_ids_PROFILE_MRNA_EXPRESSION: true,
    genetic_profile_ids_PROFILE_PROTEIN_EXPRESSION: true,
    genetic_profile_ids_PROFILE_GENESET_SCORE: true,
    genetic_profile_ids_GENERIC_ASSAY: true,
    genetic_profile_ids: true,
    comparison_createdGroupsSessionId: false,
};

const propertiesMap = _.mapValues(
    {
        // NON session props here
        // oncoprint props
        clinicallist: { isSessionProp: false },
        show_samples: { isSessionProp: false },
        heatmap_track_groups: { isSessionProp: false },
        oncoprint_sortby: { isSessionProp: false },
        oncoprint_cluster_profile: { isSessionProp: false },
        oncoprint_sort_by_mutation_type: {
            isSessionProp: false,
        },
        oncoprint_sort_by_drivers: { isSessionProp: false },
        generic_assay_groups: { isSessionProp: false },
        exclude_germline_mutations: { isSessionProp: false },
        hide_unprofiled_samples: { isSessionProp: false },
        patient_enrichments: { isSessionProp: false },

        comparison_subtab: { isSessionProp: false },
        comparison_overlapStrategy: { isSessionProp: false },
        comparison_selectedGroups: { isSessionProp: false },
        comparison_groupOrder: { isSessionProp: false },
        comparison_selectedEnrichmentEventTypes: {
            isSessionProp: true,
        },

        // plots
        plots_horz_selection: {
            isSessionProp: false,
            nestedObjectProps: PlotsSelectionParamProps,
        },
        plots_vert_selection: {
            isSessionProp: false,
            nestedObjectProps: PlotsSelectionParamProps,
        },
        plots_coloring_selection: {
            isSessionProp: false,
            nestedObjectProps: PlotsColoringParamProps,
        },

        // mutations
        mutations_gene: {
            isSessionProp: false,
        },
        mutations_transcript_id: {
            isSessionProp: false,
        },

        // session props here
        gene_list: {
            isSessionProp: true,
            doubleURIEncode: true,
        },
        cancer_study_list: {
            isSessionProp: true,
            aliases: ['cancer_study_id'],
        },
        case_ids: { isSessionProp: true },
        sample_list_ids: { isSessionProp: true },
        case_set_id: { isSessionProp: true },
        profileFilter: {
            isSessionProp: true,
            aliases: ['data_priority'],
        },
        RPPA_SCORE_THRESHOLD: { isSessionProp: true },
        Z_SCORE_THRESHOLD: { isSessionProp: true },
        geneset_list: { isSessionProp: true },
        genetic_profile_ids_PROFILE_MUTATION_EXTENDED: {
            isSessionProp: true,
        },
        genetic_profile_ids_PROFILE_COPY_NUMBER_ALTERATION: {
            isSessionProp: true,
        },
        genetic_profile_ids_PROFILE_MRNA_EXPRESSION: {
            isSessionProp: true,
        },
        genetic_profile_ids_PROFILE_PROTEIN_EXPRESSION: {
            isSessionProp: true,
        },
        genetic_profile_ids_PROFILE_GENESET_SCORE: {
            isSessionProp: true,
        },
        genetic_profile_ids_GENERIC_ASSAY: {
            isSessionProp: true,
        },
        genetic_profile_ids: { isSessionProp: true },
        comparison_createdGroupsSessionId: {
            isSessionProp: true,
        },
    } as PropertiesMap<ResultsViewURLQuery>,
    (propertySpec, propertyName) => {
        propertySpec.isHashedProp =
            shouldForceRemount[propertyName as keyof ResultsViewURLQuery];
        return propertySpec;
    }
) as PropertiesMap<ResultsViewURLQuery>;

function backwardsCompatibilityMapping(oldParams: any) {
    const newParams: MapValues<
        ResultsViewURLQuery,
        string | undefined
    > = _.cloneDeep(oldParams);
    if (
        newParams.comparison_subtab ===
        LegacyResultsViewComparisonSubTab.MUTATIONS
    ) {
        newParams.comparison_subtab = ResultsViewComparisonSubTab.ALTERATIONS;
        newParams.comparison_selectedEnrichmentEventTypes = JSON.stringify([
            ...mutationGroup,
        ]);
    } else if (
        newParams.comparison_subtab === LegacyResultsViewComparisonSubTab.CNA
    ) {
        newParams.comparison_subtab = ResultsViewComparisonSubTab.ALTERATIONS;
        newParams.comparison_selectedEnrichmentEventTypes = JSON.stringify([
            ...cnaGroup,
        ]);
    }
    return newParams;
}

const allTracksDeleted = 'null';

export default class ResultsViewURLWrapper
    extends URLWrapper<ResultsViewURLQuery>
    implements IComparisonURLWrapper {
    constructor(routing: ExtendedRouterStore) {
        super(
            routing,
            propertiesMap,
            true,
            getServerConfig().session_url_length_threshold
                ? parseInt(getServerConfig().session_url_length_threshold)
                : undefined,
            backwardsCompatibilityMapping
        );
        makeObservable(this);
    }

    pathContext = '/results';

    @computed public get tabId() {
        const tabInPath = this.pathName.split('/').pop();
        if (tabInPath && tabInPath in oldTabToNewTabRoute) {
            // map legacy tab ids
            return oldTabToNewTabRoute[tabInPath];
        } else {
            return tabInPath;
        }
    }

    /**
     * Query param clinicallist can be:
     * - url encoded json object
     * - comma seperated list (legacy)
     * - undefined: clinical tracks not configured
     * - 'null': all clinical tracks were deleted by user
     *
     * Ideally, we would like to simply give an empty string.
     * The problem is that, in order to know whether to show
     * some clinical tracks by default (such as "profiled-in",
     * "samples per patient", etc), we need to know whether
     * the clinical tracks have been updated by the user. If we
     * pass an empty string, the router just deletes that parameter
     * from the URL completely, making it indistinguishable from
     * the initialization state. So we have to use 'null' here to
     * distinguish the state of user having deleted all clinical tracks,
     * because the alternative is to make a breaking change to the router library.
     *
     * @param clinicalTracks
     */
    public convertClinicalTracksToUrlParam(
        clinicalTracks: ClinicalTrackConfig[]
    ) {
        if (clinicalTracks.length) {
            return { clinicallist: JSON.stringify(clinicalTracks) };
        } else {
            return { clinicallist: allTracksDeleted };
        }
    }

    /**
     * Clinical tracks as configured in url
     *
     * See also: {@link convertClinicalTracksToUrlParam}
     */
    @computed
    public get oncoprintSelectedClinicalTracks(): ClinicalTrackConfig[] {
        if (
            !this.query.clinicallist ||
            this.query.clinicallist === allTracksDeleted
        ) {
            return [];
        }
        try {
            return JSON.parse(this.query.clinicallist) as ClinicalTrackConfig[];
        } catch {
            return this.query.clinicallist
                .split(',')
                .map(id => new ClinicalTrackConfig(id));
        }
    }

    /**
     * Check if clinical tracks are initialized
     * See also: {@link convertClinicalTracksToUrlParam}
     */
    @computed public get oncoprintSelectedClinicalTracksConfigured(): boolean {
        return !!this.query.clinicallist;
    }

    @computed public get oncoprintSelectedClinicalTrackIds(): string[] {
        return this.oncoprintSelectedClinicalTracks.map(track =>
            _.isString(track) ? track : track.stableId
        );
    }

    @computed public get comparisonSubTabId() {
        return this.query.comparison_subtab || GroupComparisonTab.OVERLAP;
    }

    @autobind
    public setTabId(tabId: ResultsViewTab, replace?: boolean) {
        this.updateURL({}, `results/${tabId}`, false, replace);
    }

    @autobind
    public setComparisonSubTabId(tabId: GroupComparisonTab) {
        this.updateURL({ comparison_subtab: tabId });
    }

    @computed public get selectedEnrichmentEventTypes() {
        if (this.query.comparison_selectedEnrichmentEventTypes) {
            return JSON.parse(
                this.query.comparison_selectedEnrichmentEventTypes
            ) as (
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
            comparison_selectedEnrichmentEventTypes: JSON.stringify(t),
        });
    }
}
