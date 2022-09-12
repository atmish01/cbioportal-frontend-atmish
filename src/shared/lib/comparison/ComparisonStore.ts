import {
    ClinicalDataEnrichmentWithQ,
    ComparisonGroup,
    EnrichmentAnalysisComparisonGroup,
    getGroupsDownloadData,
    getNumSamples,
    getOverlapComputations,
    getSampleIdentifiers,
    getStudyIds,
    IOverlapComputations,
    isGroupEmpty,
    partitionCasesByGroupMembership,
} from '../../../pages/groupComparison/GroupComparisonUtils';
//import URLWrapper from '../../../shared/lib/URLWrapper';
import {
    countMutations,
    mutationCountByPositionKey,
} from '../../../pages/resultsView/mutationCountHelpers';
import { GroupComparisonTab } from '../../../pages/groupComparison/GroupComparisonTabs';
import {
    findFirstMostCommonElt,
    remoteData,
    stringListToMap,
} from 'cbioportal-frontend-commons';
import {
    generateQueryStructuralVariantId,
    getProteinPositionFromProteinChange,
    IHotspotIndex,
    indexHotspotsData,
    IOncoKbData,
} from 'cbioportal-utils';
import { toSampleUuid } from '../../../shared/lib/UuidUtils';
import {
    AlterationFilter,
    CancerStudy,
    ClinicalAttribute,
    ClinicalData,
    ClinicalDataMultiStudyFilter,
    Group,
    SampleFilter,
    MolecularProfile,
    MolecularProfileCasesGroupFilter,
    MolecularProfileFilter,
    MutationMultipleStudyFilter,
    ClinicalAttributeCount,
    ClinicalAttributeCountFilter,
    ClinicalDataSingleStudyFilter,
    GenePanelData,
    SampleIdentifier,
    ReferenceGenomeGene,
    MutationCountByPosition,
    GenePanelDataMultipleStudyFilter,
    Sample,
} from 'cbioportal-ts-api-client';
import {
    StructuralVariant,
    StructuralVariantFilter,
} from 'cbioportal-ts-api-client';
//import GroupComparisonMutationMapperStore from '../../../pages/groupComparison/GroupComparisonMutationMapperStore';
import {
    action,
    autorun,
    computed,
    IReactionDisposer,
    makeObservable,
    observable,
} from 'mobx';
import client from '../../api/cbioportalClientInstance';
import comparisonClient from '../../api/comparisonGroupClientInstance';
import _ from 'lodash';
import {
    pickCopyNumberEnrichmentProfiles,
    pickGenericAssayEnrichmentProfiles,
    pickMethylationEnrichmentProfiles,
    pickMRNAEnrichmentProfiles,
    pickMutationEnrichmentProfiles,
    pickProteinEnrichmentProfiles,
    pickStructuralVariantEnrichmentProfiles,
} from '../../../pages/resultsView/enrichments/EnrichmentsUtil';
import { CancerGene, IndicatorQueryResp } from 'oncokb-ts-api-client';
import {
    CoverageInformation,
    getCoverageInformation,
} from 'shared/lib/GenePanelUtils';
import {
    makeEnrichmentDataPromise,
    makeGenericAssayEnrichmentDataPromise,
    compileMutations,
    filterAndAnnotateStructuralVariants,
    compileStructuralVariants,
    FilteredAndAnnotatedStructuralVariantsReport,
    ExtendedClinicalAttribute,
    getExtendsClinicalAttributesFromCustomData,
    FilteredAndAnnotatedMutationsReport,
    getMolecularProfiles,
    fetchPatients,
    fetchQueriedStudies,
} from '../../../pages/resultsView/ResultsViewPageStoreUtils';
import internalClient from '../../api/cbioportalInternalClientInstance';
import autobind from 'autobind-decorator';
import { PatientSurvival } from 'shared/model/PatientSurvival';
import { getPatientSurvivals } from 'pages/resultsView/SurvivalStoreHelper';
import { getDefaultMolecularProfiles } from '../../../shared/lib/getDefaultMolecularProfiles';
import { ChartTypeEnum } from 'pages/studyView/StudyViewConfig';
import {
    parseSamplesSpecifications,
    populateSampleSpecificationsFromVirtualStudies,
    ResultsViewTab,
    substitutePhysicalStudiesForVirtualStudies,
} from 'pages/resultsView/ResultsViewPageHelpers';
import ClinicalDataCache, {
    clinicalAttributeIsINCOMPARISONGROUP,
    SpecialAttribute,
} from '../../../shared/cache/ClinicalDataCache';
import {
    getFilteredMolecularProfilesByAlterationType,
    getPatientIdentifiers,
    buildSelectedDriverTiersMap,
    ChartMeta,
    ChartMetaDataTypeEnum,
    FGA_VS_MUTATION_COUNT_KEY,
    getChartMetaDataType,
    getDefaultPriorityByUniqueKey,
    getFilteredStudiesWithSamples,
    getPriorityByClinicalAttribute,
    getUniqueKey,
    getUniqueKeyFromMolecularProfileIds,
    SpecialChartsUniqueKeyEnum,
    StudyWithSamples,
} from 'pages/studyView/StudyViewUtils';
import ResultsViewURLWrapper from 'pages/resultsView/ResultsViewURLWrapper';
import { calculateQValues } from 'shared/lib/calculation/BenjaminiHochbergFDRCalculator';
import ComplexKeyMap from '../complexKeyDataStructures/ComplexKeyMap';
import ComplexKeyGroupsMap from '../complexKeyDataStructures/ComplexKeyGroupsMap';
import { AppStore } from '../../../AppStore';
import { ISurvivalDescription } from 'pages/resultsView/survival/SurvivalDescriptionTable';
import {
    fetchSurvivalDataExists,
    cancerTypeForOncoKb,
    evaluateMutationPutativeDriverInfo,
    fetchAllReferenceGenomeGenes,
    fetchGermlineConsentedSamples,
    fetchOncoKbCancerGenes,
    fetchOncoKbDataForOncoprint,
    fetchStructuralVariantOncoKbData,
    fetchStudiesForSamplesWithoutCancerTypeClinicalData,
    fetchVariantAnnotationsIndexedByGenomicLocation,
    filterAndAnnotateMutations,
    generateDataQueryFilter,
    generateUniqueSampleKeyToTumorTypeMap,
    getAllGenes,
    getSurvivalClinicalAttributesPrefix,
    groupBySampleId,
    makeGetOncoKbMutationAnnotationForOncoprint,
    makeIsHotspotForOncoprint,
    getOncoKbOncogenic,
    mapSampleIdToClinicalData,
    ONCOKB_DEFAULT,
} from 'shared/lib/StoreUtils';
import MobxPromise from 'mobxpromise';
import { fetchHotspotsData } from 'shared/lib/CancerHotspotsUtils';
import {
    AlterationTypeConstants,
    DataTypeConstants,
    ResultsViewPageStore,
} from '../../../pages/resultsView/ResultsViewPageStore';
import { getSurvivalStatusBoolean } from 'pages/resultsView/survival/SurvivalUtil';
import { onMobxPromise } from 'cbioportal-frontend-commons';
import {
    cnaEventTypeSelectInit,
    CopyNumberEnrichmentEventType,
    EnrichmentEventType,
    getCopyNumberEventTypesAPIParameter,
    getMutationEventTypesAPIParameter,
    MutationEnrichmentEventType,
    mutationEventTypeSelectInit,
    StructuralVariantEnrichmentEventType,
} from 'shared/lib/comparison/ComparisonStoreUtils';
import {
    buildDriverAnnotationSettings,
    DriverAnnotationSettings,
    IAnnotationFilterSettings,
    IDriverAnnotationReport,
    initializeCustomDriverAnnotationSettings,
} from 'shared/alterationFiltering/AnnotationFilteringSettings';
import { getServerConfig } from 'config/config';
import IComparisonURLWrapper from 'pages/groupComparison/IComparisonURLWrapper';
import sessionServiceClient from '../../../shared/api/sessionServiceInstance';
import { isSampleProfiledInMultiple } from '../../../shared/lib/isSampleProfiled';
import {
    ComparisonSession,
    SessionGroupData,
    VirtualStudy,
} from 'shared/api/session-service/sessionServiceModels';
import { Gene, Mutation } from 'cbioportal-ts-api-client';
import { Group as Group1 } from 'shared/api/session-service/sessionServiceModels';
import {
    ANNOTATED_PROTEIN_IMPACT_FILTER_TYPE,
    createAnnotatedProteinImpactTypeFilter,
    createNumericalFilter,
    createCategoricalFilter,
} from 'shared/lib/MutationUtils';
import { CanonicalMutationType } from 'cbioportal-frontend-commons';
import { IVirtualStudyProps } from 'pages/studyView/virtualStudy/VirtualStudy';
import { cached } from 'mobxpromise';
import PubMedCache from 'shared/cache/PubMedCache';
import GenomeNexusCache from 'shared/cache/GenomeNexusCache';
import GenomeNexusMutationAssessorCache from 'shared/cache/GenomeNexusMutationAssessorCache';
import CancerTypeCache from 'shared/cache/CancerTypeCache';
import MutationCountCache from 'shared/cache/MutationCountCache';
import ClinicalAttributeCache from 'shared/cache/ClinicalAttributeCache';
import DiscreteCNACache from 'shared/cache/DiscreteCNACache';
import PdbHeaderCache from 'shared/cache/PdbHeaderCache';
import ComplexKeyCounter from 'shared/lib/complexKeyDataStructures/ComplexKeyCounter';
import {
    existsSomeMutationWithAscnPropertyInCollection,
    fetchGenes,
    getGenomeNexusUrl,
    IDataQueryFilter,
    getGenomeBuildFromStudies,
} from 'shared/lib/StoreUtils';

import ResultsViewMutationMapperStore from '../../../pages/resultsView/mutation/ResultsViewMutationMapperStore';
import GeneCache from '../../../shared/cache/GeneCache';
import AccessorsForOqlFilter, {
    SimplifiedMutationType,
} from '../../../shared/lib/oql/AccessorsForOqlFilter';
import {
    doesQueryContainMutationOQL,
    filterCBioPortalWebServiceData,
    uniqueGenesInOQLQuery,
} from '../../../shared/lib/oql/oqlfilter';
import {
    convertComparisonGroupClinicalAttribute,
    makeComparisonGroupClinicalAttributes,
    makeProfiledInClinicalAttributes,
} from '../../../shared/components/oncoprint/ResultsViewOncoprintUtils';
import SampleSet from 'shared/lib/sampleDataStructures/SampleSet';

import { ErrorMessages } from '../../../shared/enums/ErrorEnums';

import { createVariantAnnotationsByMutationFetcher } from 'shared/components/mutationMapper/MutationMapperUtils';
import { getGenomeNexusHgvsgUrl } from 'shared/api/urls';
import {
    CLINICAL_ATTRIBUTE_FIELD_ENUM,
    GENOME_NEXUS_ARG_FIELD_ENUM,
    CLINICAL_ATTRIBUTE_ID_ENUM,
    REQUEST_ARG_ENUM,
} from 'shared/constants';

export interface AnnotatedMutation extends Mutation {
    hugoGeneSymbol: string;
    putativeDriver: boolean;
    oncoKbOncogenic: string;
    isHotspot: boolean;
    simplifiedMutationType: SimplifiedMutationType;
}
/*import {
    MutationTableColumnType,
    getTextForDataField,
} from 'shared/components/mutationTable/MutationTable';*/
import getClonalValue from 'shared/components/mutationTable/column/clonal/ClonalColumnFormatter';
import getCancerCellFractionValue from 'shared/components/mutationTable/column/cancerCellFraction/CancerCellFractionColumnFormatter';
import getExpectedAltCopiesValue from 'shared/components/mutationTable/column/expectedAltCopies/ExpectedAltCopiesColumnFormatter';
import TumorAlleleFreqColumnFormatter from 'shared/components/mutationTable/column/TumorAlleleFreqColumnFormatter';
import NormalAlleleFreqColumnFormatter from 'shared/components/mutationTable/column/NormalAlleleFreqColumnFormatter';
import ChromosomeColumnFormatter from 'shared/components/mutationTable/column/ChromosomeColumnFormatter';
import { getASCNMethodValue } from 'shared/components/mutationTable/column/ascnMethod/ASCNMethodColumnFormatter';
import SampleColumnFormatter from 'shared/components/mutationTable/column/SampleColumnFormatter';
import GeneColumnFormatter from 'shared/components/mutationTable/column/GeneColumnFormatter';
import ProteinChangeColumnFormatter from 'shared/components/mutationTable/column/ProteinChangeColumnFormatter';
import MutationTypeColumnFormatter from 'shared/components/mutationTable/column/MutationTypeColumnFormatter';
import VariantTypeColumnFormatter from 'shared/components/mutationTable/column/VariantTypeColumnFormatter';
import HgvsgColumnFormatter from 'shared/components/mutationTable/column/HgvsgColumnFormatter';
import ClinvarColumnFormatter from 'shared/components/mutationTable/column/ClinvarColumnFormatter';
import SignalColumnFormatter from 'shared/components/mutationTable/column/SignalColumnFormatter';
import {
    GenomeNexusAPI,
    GenomeNexusAPIInternal,
    VariantAnnotation,
} from 'genome-nexus-ts-api-client';

export enum OverlapStrategy {
    INCLUDE = 'Include',
    EXCLUDE = 'Exclude',
}

export enum SampleListCategoryType {
    'w_mut' = 'w_mut',
    'w_cna' = 'w_cna',
    'w_mut_cna' = 'w_mut_cna',
}

export type CaseAggregatedData<T> = {
    samples: { [uniqueSampleKey: string]: T[] };
    patients: { [uniquePatientKey: string]: T[] };
};

export const SampleListCategoryTypeToFullId = {
    [SampleListCategoryType.w_mut]: 'all_cases_with_mutation_data',
    [SampleListCategoryType.w_cna]: 'all_cases_with_cna_data',
    [SampleListCategoryType.w_mut_cna]: 'all_cases_with_mutation_and_cna_data',
};

export type SamplesSpecificationElement =
    | { studyId: string; sampleId: string; sampleListId: undefined }
    | { studyId: string; sampleId: undefined; sampleListId: string };

const DEFAULT_RPPA_THRESHOLD = 2;
const DEFAULT_Z_SCORE_THRESHOLD = 2;

export function buildDefaultOQLProfile(
    profilesTypes: string[],
    zScoreThreshold: number,
    rppaScoreThreshold: number
) {
    var default_oql_uniq: any = {};
    for (var i = 0; i < profilesTypes.length; i++) {
        var type = profilesTypes[i];
        switch (type) {
            case AlterationTypeConstants.MUTATION_EXTENDED:
                default_oql_uniq['MUT'] = true;
                break;
            case AlterationTypeConstants.COPY_NUMBER_ALTERATION:
                default_oql_uniq['AMP'] = true;
                default_oql_uniq['HOMDEL'] = true;
                break;
            case AlterationTypeConstants.MRNA_EXPRESSION:
                default_oql_uniq['EXP>=' + zScoreThreshold] = true;
                default_oql_uniq['EXP<=-' + zScoreThreshold] = true;
                break;
            case AlterationTypeConstants.PROTEIN_LEVEL:
                default_oql_uniq['PROT>=' + rppaScoreThreshold] = true;
                default_oql_uniq['PROT<=-' + rppaScoreThreshold] = true;
                break;
            case AlterationTypeConstants.STRUCTURAL_VARIANT:
                default_oql_uniq['FUSION'] = true;
                break;
        }
    }
    return Object.keys(default_oql_uniq).join(' ');
}

export default abstract class ComparisonStore
    implements IAnnotationFilterSettings, IComparisonURLWrapper {
    private tabHasBeenShown = observable.map<GroupComparisonTab, boolean>();

    private tabHasBeenShownReactionDisposer: IReactionDisposer;
    @observable public newSessionPending = false;

    @observable
    driverAnnotationSettings: DriverAnnotationSettings = buildDriverAnnotationSettings(
        () => false
    );
    @observable includeGermlineMutations = true;
    @observable includeSomaticMutations = true;
    @observable includeUnknownStatusMutations = true;

    constructor(
        protected appStore: AppStore,
        protected urlWrapper: IComparisonURLWrapper,
        protected resultsViewStore?: ResultsViewPageStore,
        public selectedEnrichmentEventTypes?: EnrichmentEventType[] | undefined
    ) {
        makeObservable(this);

        (window as any).compStore = this;

        setTimeout(() => {
            // When groups in the comparison are updated by the user
            // certain tabs that were visible before might no longer be
            // supported by the data and would be hidden. Disappearing
            // tabs without explanation is considered bad UX design.
            // The logic below keeps track of tabs that were shown before
            // and keeps them visible between group updates.
            this.tabHasBeenShownReactionDisposer = autorun(() => {
                this.tabHasBeenShown.set(
                    GroupComparisonTab.SURVIVAL,
                    !!this.tabHasBeenShown.get(GroupComparisonTab.SURVIVAL) ||
                        this.showSurvivalTab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.MUTATION,
                    !!this.tabHasBeenShown.get(GroupComparisonTab.MUTATION) ||
                        this.showMutationTab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.MRNA,
                    !!this.tabHasBeenShown.get(GroupComparisonTab.MRNA) ||
                        this.showMRNATab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.PROTEIN,
                    !!this.tabHasBeenShown.get(GroupComparisonTab.PROTEIN) ||
                        this.showProteinTab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.DNAMETHYLATION,
                    !!this.tabHasBeenShown.get(
                        GroupComparisonTab.DNAMETHYLATION
                    ) || this.showMethylationTab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.GENERIC_ASSAY_PREFIX,
                    !!this.tabHasBeenShown.get(
                        GroupComparisonTab.GENERIC_ASSAY_PREFIX
                    ) || this.showGenericAssayTab
                );
                this.tabHasBeenShown.set(
                    GroupComparisonTab.ALTERATIONS,
                    !!this.tabHasBeenShown.get(
                        GroupComparisonTab.ALTERATIONS
                    ) || this.showAlterationsTab
                );
            });
        }); // do this after timeout so that all subclasses have time to construct
    }

    public destroy() {
        this.tabHasBeenShownReactionDisposer &&
            this.tabHasBeenShownReactionDisposer();
    }

    @computed get genomeNexusClient() {
        return new GenomeNexusAPI(this.referenceGenomeBuild);
    }

    @computed get hugoGeneSymbols() {
        if (
            this.urlWrapper1.query.gene_list &&
            this.urlWrapper1.query.gene_list.length > 0
        ) {
            return uniqueGenesInOQLQuery(this.urlWrapper1.query.gene_list);
        } else {
            return [];
        }
    }
    readonly genes = remoteData<Gene[]>({
        invoke: async () => {
            const genes = await fetchGenes(this.hugoGeneSymbols);

            // Check that the same genes are in the OQL query as in the API response (order doesnt matter).
            // This ensures that all the genes in OQL are valid. If not, we throw an error.
            if (
                _.isEqual(
                    _.sortBy(this.hugoGeneSymbols),
                    _.sortBy(genes.map(gene => gene.hugoGeneSymbol))
                )
            ) {
                return genes;
            } else {
                throw new Error(ErrorMessages.InvalidGenes);
            }
        },
        onResult: (genes: Gene[]) => {
            this.geneCache.addData(genes);
        },
        onError: err => {
            // throwing this allows sentry to report it
            throw err;
        },
    });

    @computed get queryExceedsLimit() {
        return (
            this.hugoGeneSymbols.length * this.sample.result.length >
            getServerConfig().query_product_limit
        );
    }

    @computed get queryContainsMutationOql() {
        return doesQueryContainMutationOQL(this.urlWrapper1.query.gene_list);
    }

    @computed get referenceGenomeBuild() {
        if (!this.studies.isComplete) {
            // undefined results this.studies.result.
            throw new Error('Failed to get studies');
        }
        if (typeof this.studies.result === 'undefined')
            throw new Error('Failed to get studies');
        return getGenomeNexusUrl(this.studies.result);
    }

    @computed get ensemblLink() {
        return this.referenceGenomeBuild ===
            getServerConfig().genomenexus_url_grch38
            ? getServerConfig().ensembl_transcript_grch38_url
            : getServerConfig().ensembl_transcript_url;
    }

    @cached @computed get discreteCNACache() {
        return new DiscreteCNACache(
            this.studyToMolecularProfileDiscreteCna.result
        );
    }

    @cached @computed get pubMedCache() {
        return new PubMedCache();
    }

    @cached @computed get cancerTypeCache() {
        return new CancerTypeCache();
    }

    @cached @computed get mutationCountCache() {
        return new MutationCountCache();
    }

    @cached @computed get clinicalAttributeCache() {
        return new ClinicalAttributeCache();
    }

    @cached @computed get genomeNexusCache() {
        return new GenomeNexusCache(
            createVariantAnnotationsByMutationFetcher(
                [GENOME_NEXUS_ARG_FIELD_ENUM.ANNOTATION_SUMMARY],
                this.genomeNexusClient
            )
        );
    }

    @cached @computed get genomeNexusMutationAssessorCache() {
        return new GenomeNexusMutationAssessorCache(
            createVariantAnnotationsByMutationFetcher(
                [
                    GENOME_NEXUS_ARG_FIELD_ENUM.ANNOTATION_SUMMARY,
                    GENOME_NEXUS_ARG_FIELD_ENUM.MUTATION_ASSESSOR,
                ],
                this.genomeNexusClient
            )
        );
    }

    @cached @computed get pdbHeaderCache() {
        return new PdbHeaderCache();
    }

    @computed get existsSomeMutationWithAscnProperty(): {
        [property: string]: boolean;
    } {
        if (this.mutations.result === undefined) {
            return existsSomeMutationWithAscnPropertyInCollection(
                [] as Mutation[]
            );
        } else {
            return existsSomeMutationWithAscnPropertyInCollection(
                this.mutations.result
            );
        }
    }

    @computed
    get cancerStudyIds() {
        return this.urlWrapper1.query.cancer_study_list.split(',');
    }

    @computed get customDataFilterAppliers() {
        return {
            [ANNOTATED_PROTEIN_IMPACT_FILTER_TYPE]: createAnnotatedProteinImpactTypeFilter(
                this.isPutativeDriver
            ),
            /*[MutationTableColumnType.CLONAL]: createNumericalFilter(
                (d: Mutation) => {
                    const val = getClonalValue(d);
                    return val ? +val : null;
                }
            ),
            [MutationTableColumnType.CANCER_CELL_FRACTION]: createNumericalFilter(
                (d: Mutation) => {
                    const val = getCancerCellFractionValue(d);
                    return val ? +val : null;
                }
            ),
            [MutationTableColumnType.EXPECTED_ALT_COPIES]: createNumericalFilter(
                (d: Mutation) => {
                    const val = getExpectedAltCopiesValue(d);
                    return val ? +val : null;
                }
            ),
            [MutationTableColumnType.TUMOR_ALLELE_FREQ]: createNumericalFilter(
                (d: Mutation) =>
                    TumorAlleleFreqColumnFormatter.getSortValue([d])
            ),
            [MutationTableColumnType.NORMAL_ALLELE_FREQ]: createNumericalFilter(
                (d: Mutation) =>
                    NormalAlleleFreqColumnFormatter.getSortValue([d])
            ),
            [MutationTableColumnType.REF_READS_N]: createNumericalFilter(
                (d: Mutation) => d.normalRefCount
            ),
            [MutationTableColumnType.VAR_READS_N]: createNumericalFilter(
                (d: Mutation) => d.normalAltCount
            ),
            [MutationTableColumnType.REF_READS]: createNumericalFilter(
                (d: Mutation) => d.tumorRefCount
            ),
            [MutationTableColumnType.VAR_READS]: createNumericalFilter(
                (d: Mutation) => d.tumorAltCount
            ),
            [MutationTableColumnType.START_POS]: createNumericalFilter(
                (d: Mutation) => {
                    const val = getTextForDataField([d], 'startPosition');
                    return val ? +val : null;
                }
            ),
            [MutationTableColumnType.END_POS]: createNumericalFilter(
                (d: Mutation) => {
                    const val = getTextForDataField([d], 'endPosition');
                    return val ? +val : null;
                }
            ),
            [MutationTableColumnType.SAMPLE_ID]: createCategoricalFilter(
                (d: Mutation) => SampleColumnFormatter.getTextValue([d])
            ),
            [MutationTableColumnType.GENE]: createCategoricalFilter(
                (d: Mutation) => GeneColumnFormatter.getTextValue([d])
            ),
            [MutationTableColumnType.PROTEIN_CHANGE]: createCategoricalFilter(
                (d: Mutation) => ProteinChangeColumnFormatter.getTextValue([d])
            ),
            [MutationTableColumnType.CHROMOSOME]: createCategoricalFilter(
                (d: Mutation) => ChromosomeColumnFormatter.getData([d]) || ''
            ),
            [MutationTableColumnType.REF_ALLELE]: createCategoricalFilter(
                (d: Mutation) => getTextForDataField([d], 'referenceAllele')
            ),
            [MutationTableColumnType.VAR_ALLELE]: createCategoricalFilter(
                (d: Mutation) => getTextForDataField([d], 'variantAllele')
            ),
            [MutationTableColumnType.MUTATION_TYPE]: createCategoricalFilter(
                (d: Mutation) =>
                    MutationTypeColumnFormatter.getDisplayValue([d])
            ),
            [MutationTableColumnType.VARIANT_TYPE]: createCategoricalFilter(
                (d: Mutation) => VariantTypeColumnFormatter.getTextValue([d])
            ),
            [MutationTableColumnType.CENTER]: createCategoricalFilter(
                (d: Mutation) => getTextForDataField([d], 'center')
            ),
            [MutationTableColumnType.HGVSG]: createCategoricalFilter(
                (d: Mutation) => HgvsgColumnFormatter.download([d])
            ),
            [MutationTableColumnType.ASCN_METHOD]: createCategoricalFilter(
                (d: Mutation) => getASCNMethodValue(d)
            ),
            [MutationTableColumnType.CLINVAR]: createCategoricalFilter(
                (d: Mutation) =>
                    ClinvarColumnFormatter.download(
                        [d],
                        this.indexedVariantAnnotations
                    )
            ),
            [MutationTableColumnType.SIGNAL]: createCategoricalFilter(
                (d: Mutation) =>
                    SignalColumnFormatter.download(
                        [d],
                        this.indexedVariantAnnotations
                    )
            ),*/
        };
    }

    @computed get genomeBuild() {
        if (!this.studies.isComplete) {
            throw new Error('Failed to get studies');
        }
        if (typeof this.studies.result === 'undefined')
            throw new Error('Failed to get studies');
        return getGenomeBuildFromStudies(this.studies.result);
    }

    @computed
    public get hideUnprofiledSamples() {
        const value = this.urlWrapper1.query.hide_unprofiled_samples;
        if (value === 'any' || value === 'totally') {
            return value;
        } else {
            return false;
        }
    }

    @computed get selectedCopyNumberEnrichmentEventTypes() {
        if (this.urlWrapper.selectedEnrichmentEventTypes) {
            return stringListToMap(
                this.urlWrapper.selectedEnrichmentEventTypes.filter(
                    // get copy number enrichment types
                    t => t in CopyNumberEnrichmentEventType
                ),
                t => true
            );
        } else {
            // default
            return cnaEventTypeSelectInit(
                this.alterationEnrichmentProfiles.result
                    ?.copyNumberEnrichmentProfiles || []
            );
        }
    }

    @computed get selectedMutationEnrichmentEventTypes() {
        if (this.urlWrapper.selectedEnrichmentEventTypes) {
            return stringListToMap(
                this.urlWrapper.selectedEnrichmentEventTypes.filter(
                    // get mutation enrichment types
                    t => t in MutationEnrichmentEventType
                ),
                t => true
            );
        } else {
            // default
            return mutationEventTypeSelectInit(
                this.alterationEnrichmentProfiles.result?.mutationProfiles || []
            );
        }
    }

    @computed get isStructuralVariantEnrichmentSelected() {
        if (this.urlWrapper.selectedEnrichmentEventTypes) {
            return this.urlWrapper.selectedEnrichmentEventTypes.includes(
                StructuralVariantEnrichmentEventType.structural_variant
            );
        }
        return !!(
            this.alterationEnrichmentProfiles.result &&
            this.alterationEnrichmentProfiles.result.structuralVariantProfiles
                .length > 0
        );
    }

    @autobind
    generateGenomeNexusHgvsgUrl(hgvsg: string) {
        return getGenomeNexusHgvsgUrl(hgvsg, this.referenceGenomeBuild);
    }

    @autobind
    public updateSelectedEnrichmentEventTypes(t: EnrichmentEventType[]) {
        this.urlWrapper.updateSelectedEnrichmentEventTypes(t);
    }

    // < To be implemented in subclasses: >
    public isGroupSelected(name: string): boolean {
        throw new Error('isGroupSelected must be implemented in subclass');
    }
    public setUsePatientLevelEnrichments(s: boolean) {
        throw new Error(
            'setUsePatientLevelEnrichments must be implemented in subclass'
        );
    }
    public toggleGroupSelected(groupName: string) {
        throw new Error(`toggleGroupSelected must be implemented in subclass`);
    }
    public updateGroupOrder(oldIndex: number, newIndex: number) {
        throw new Error(`updateGroupOrder must be implemented in subclass`);
    }
    public selectAllGroups() {
        throw new Error(`selectAllGroups must be implemented in subclass`);
    }
    public deselectAllGroups() {
        throw new Error(`deselectAllGroups must be implemented in subclass`);
    }
    protected async saveAndGoToSession(newSession: ComparisonSession) {
        throw new Error(`saveAndGoToSession must be implemented in subclass`);
    }
    abstract get _session(): MobxPromise<ComparisonSession>;
    abstract _originalGroups: MobxPromise<ComparisonGroup[]>;
    abstract get overlapStrategy(): OverlapStrategy;
    abstract get usePatientLevelEnrichments(): boolean;
    abstract get samples(): MobxPromise<Sample[]>;
    abstract get studies(): MobxPromise<CancerStudy[]>;
    // < / >

    public get isLoggedIn() {
        return this.appStore.isLoggedIn;
    }

    public async addGroup(group: SessionGroupData, saveToUser: boolean) {
        this.newSessionPending = true;
        if (saveToUser && this.isLoggedIn) {
            await comparisonClient.addGroup(group);
        }
        const newSession = _.cloneDeep(this._session.result!);
        newSession.groups.push(group);

        this.saveAndGoToSession(newSession);
    }

    public async deleteGroup(name: string) {
        this.newSessionPending = true;
        const newSession = _.cloneDeep(this._session.result!);
        newSession.groups = newSession.groups.filter(g => g.name !== name);

        this.saveAndGoToSession(newSession);
    }

    public mutationsTabFilteringSettings = this.makeMutationsTabFilteringSettings();

    private mutationMapperStoreByGeneWithDriverKey: {
        [hugoGeneSymbolWithDriver: string]: ResultsViewMutationMapperStore;
    } = {};

    // Need to add "DRIVER" into key because mutation mapper store is cached
    // if we don't do this, starting with no driver then switch to driver will get wrong filter results
    private getGeneWithDriverKey(gene: Gene) {
        return `${gene.hugoGeneSymbol}_${
            this.isPutativeDriver ? 'DRIVER' : 'NO_DRIVER'
        }`;
    }

    @computed get isPutativeDriver() {
        return this.driverAnnotationSettings.driversAnnotated
            ? (m: AnnotatedMutation) => m.putativeDriver
            : undefined;
    }

    public getMutationMapperStore(
        gene: Gene
    ): ResultsViewMutationMapperStore | undefined {
        if (
            this.genes.isComplete &&
            this.oncoKbCancerGenes.isComplete &&
            this.mutations.isComplete &&
            this.mutationsByGene.isComplete
        ) {
            return (
                this.mutationMapperStoreByGeneWithDriverKey[
                    this.getGeneWithDriverKey(gene)
                ] || this.createMutationMapperStoreForSelectedGene(gene)
            );
        }
        return undefined;
    }

    // Mutation annotation
    // genome nexus
    readonly indexedVariantAnnotations = remoteData<
        { [genomicLocation: string]: VariantAnnotation } | undefined
    >(
        {
            await: () => [this.mutations],
            invoke: async () =>
                getServerConfig().show_transcript_dropdown &&
                this.mutations.result
                    ? await fetchVariantAnnotationsIndexedByGenomicLocation(
                          this.mutations.result,
                          [
                              GENOME_NEXUS_ARG_FIELD_ENUM.ANNOTATION_SUMMARY,
                              GENOME_NEXUS_ARG_FIELD_ENUM.HOTSPOTS,
                              GENOME_NEXUS_ARG_FIELD_ENUM.CLINVAR,
                              getServerConfig().show_signal
                                  ? GENOME_NEXUS_ARG_FIELD_ENUM.SIGNAL
                                  : '',
                          ].filter(f => f),
                          getServerConfig().isoformOverrideSource,
                          this.genomeNexusClient
                      )
                    : undefined,
            onError: (err: Error) => {
                // fail silently, leave the error handling responsibility to the data consumer
            },
        },
        undefined
    );

    readonly unprofiledSamples = remoteData({
        await: () => [
            this.samples,
            this.coverageInformation,
            this.genes,
            this.selectedMolecularProfiles,
        ],
        invoke: () => {
            // Samples that are unprofiled for at least one (gene, profile)
            const genes = this.genes.result!;
            const coverageInfo = this.coverageInformation.result!;
            const studyToSelectedMolecularProfileIds = _.mapValues(
                _.groupBy(
                    this.selectedMolecularProfiles.result!,
                    p => p.studyId
                ),
                profiles => profiles.map(p => p.molecularProfileId)
            );

            return Promise.resolve(
                this.samples.result!.filter(sample => {
                    // Only look at profiles for this sample's study - doesn't
                    //  make sense to look at profiles for other studies, which
                    //  the sample certainly is not part of.
                    const profileIds =
                        studyToSelectedMolecularProfileIds[sample.studyId];

                    // Sample that is unprofiled for some gene
                    return _.some(genes, gene => {
                        // for some profile
                        return !_.every(
                            isSampleProfiledInMultiple(
                                sample.uniqueSampleKey,
                                profileIds,
                                coverageInfo,
                                gene.hugoGeneSymbol
                            )
                        );
                    });
                })
            );
        },
    });

    readonly unprofiledSampleKeyToSample = remoteData({
        await: () => [this.unprofiledSamples],
        invoke: () =>
            Promise.resolve(
                _.keyBy(this.unprofiledSamples.result!, s => s.uniqueSampleKey)
            ),
    });

    readonly totallyUnprofiledSamples = remoteData({
        await: () => [
            this.unprofiledSamples,
            this.coverageInformation,
            this.genes,
            this.selectedMolecularProfiles,
        ],
        invoke: () => {
            const genes = this.genes.result!;
            const coverageInfo = this.coverageInformation.result!;
            const studyToSelectedMolecularProfileIds = _.mapValues(
                _.groupBy(
                    this.selectedMolecularProfiles.result!,
                    p => p.studyId
                ),
                profiles => profiles.map(p => p.molecularProfileId)
            );

            return Promise.resolve(
                this.unprofiledSamples.result!.filter(sample => {
                    // Only look at profiles for this sample's study - doesn't
                    //  make sense to look at profiles for other studies, which
                    //  the sample certainly is not part of.
                    const profileIds =
                        studyToSelectedMolecularProfileIds[sample.studyId];

                    // Among unprofiled samples, pick out samples that are unprofiled for EVERY gene ...(gene x profile)
                    return _.every(genes, gene => {
                        // for EVERY profile
                        return !_.some(
                            isSampleProfiledInMultiple(
                                sample.uniqueSampleKey,
                                profileIds,
                                coverageInfo,
                                gene.hugoGeneSymbol
                            )
                        );
                    });
                })
            );
        },
    });

    readonly filteredSamples = remoteData({
        await: () => [
            this.samples,
            this.unprofiledSampleKeyToSample,
            this.totallyUnprofiledSamples,
        ],
        invoke: () => {
            if (this.hideUnprofiledSamples) {
                let unprofiledSampleKeys: { [key: string]: Sample };
                if (this.hideUnprofiledSamples === 'any') {
                    unprofiledSampleKeys = this.unprofiledSampleKeyToSample
                        .result!;
                } else if (this.hideUnprofiledSamples === 'totally') {
                    unprofiledSampleKeys = _.keyBy(
                        this.totallyUnprofiledSamples.result!,
                        s => s.uniqueSampleKey
                    );
                }
                return Promise.resolve(
                    this.samples.result!.filter(
                        s => !(s.uniqueSampleKey in unprofiledSampleKeys)
                    )
                );
            } else {
                return Promise.resolve(this.samples.result!);
            }
        },
    });

    public createMutationMapperStoreForSelectedGene(gene: Gene) {
        const store = new ResultsViewMutationMapperStore(
            getServerConfig(),
            {
                filterMutationsBySelectedTranscript: true,
                filterAppliersOverride: this.customDataFilterAppliers,
                genomeBuild: this.genomeBuild,
            },
            gene,
            this.filteredSamples,
            this.oncoKbCancerGenes,
            () => this.mutationsByGene.result![gene.hugoGeneSymbol] || [],
            () => this.mutationCountCache,
            () => this.clinicalAttributeCache,
            () => this.genomeNexusCache,
            () => this.genomeNexusMutationAssessorCache,
            () => this.discreteCNACache,
            this.studyToMolecularProfileDiscreteCna.result!,
            this.studyIdToStudy,
            this.queriedStudies,
            this.molecularProfileIdToMolecularProfile,
            this.clinicalDataForSamples,
            this.studiesForSamplesWithoutCancerTypeClinicalData,
            this.germlineConsentedSamples,
            this.indexedHotspotData,
            this.indexedVariantAnnotations,
            this.uniqueSampleKeyToTumorType.result!,
            this.generateGenomeNexusHgvsgUrl,
            this.clinicalDataGroupedBySampleMap,
            this.mutationsTabClinicalAttributes,
            this.clinicalAttributeIdToAvailableFrequency,
            this.genomeNexusClient,
            this.genomeNexusInternalClient,
            () => this.urlWrapper1.query.mutations_transcript_id
        );
        this.mutationMapperStoreByGeneWithDriverKey[
            this.getGeneWithDriverKey(gene)
        ] = store;
        return store;
    }

    readonly uniqueSampleKeyToTumorType = remoteData<{
        [uniqueSampleKey: string]: string;
    }>({
        await: () => [
            this.clinicalDataForSamples,
            this.studiesForSamplesWithoutCancerTypeClinicalData,
            this.samplesWithoutCancerTypeClinicalData,
        ],
        invoke: () => {
            return Promise.resolve(
                generateUniqueSampleKeyToTumorTypeMap(
                    this.clinicalDataForSamples,
                    this.studiesForSamplesWithoutCancerTypeClinicalData,
                    this.samplesWithoutCancerTypeClinicalData
                )
            );
        },
    });

    readonly oncoKbCancerGenes = remoteData(
        {
            invoke: () => {
                if (getServerConfig().show_oncokb) {
                    return fetchOncoKbCancerGenes();
                } else {
                    return Promise.resolve([]);
                }
            },
        },
        []
    );

    readonly sample = remoteData(
        {
            await: () => [this.studyToDataQueryFilter],
            invoke: async () => {
                const customSampleListIds = new SampleSet();
                const customSampleListStudyIds: string[] = [];
                const sampleListIds: string[] = [];
                _.each(
                    this.studyToDataQueryFilter.result,
                    (dataQueryFilter: IDataQueryFilter, studyId: string) => {
                        if (dataQueryFilter.sampleIds) {
                            customSampleListIds.add(
                                studyId,
                                dataQueryFilter.sampleIds
                            );
                            customSampleListStudyIds.push(studyId);
                        } else if (dataQueryFilter.sampleListId) {
                            sampleListIds.push(dataQueryFilter.sampleListId);
                        }
                    }
                );

                const promises: Promise<Sample[]>[] = [];

                if (customSampleListStudyIds.length > 0) {
                    promises.push(
                        client
                            .fetchSamplesUsingPOST({
                                sampleFilter: {
                                    sampleListIds: customSampleListStudyIds.map(
                                        studyId => `${studyId}_all`
                                    ),
                                } as SampleFilter,
                                projection:
                                    REQUEST_ARG_ENUM.PROJECTION_DETAILED,
                            })
                            .then(samples => {
                                return samples.filter(s =>
                                    customSampleListIds.has(s)
                                );
                            })
                    );
                }
                if (sampleListIds.length) {
                    promises.push(
                        client.fetchSamplesUsingPOST({
                            sampleFilter: {
                                sampleListIds,
                            } as SampleFilter,
                            projection: REQUEST_ARG_ENUM.PROJECTION_DETAILED,
                        })
                    );
                }
                return _.flatten(await Promise.all(promises));
            },
        },
        []
    );

    readonly molecularProfileIdToMolecularProfile = remoteData<{
        [molecularProfileId: string]: MolecularProfile;
    }>(
        {
            await: () => [this.molecularProfilesInStudies],
            invoke: () => {
                return Promise.resolve(
                    this.molecularProfilesInStudies.result.reduce(
                        (
                            map: {
                                [molecularProfileId: string]: MolecularProfile;
                            },
                            next: MolecularProfile
                        ) => {
                            map[next.molecularProfileId] = next;
                            return map;
                        },
                        {}
                    )
                );
            },
        },
        {}
    );

    readonly everyStudyIdToStudy = remoteData({
        await: () => [this.allStudies],
        invoke: () =>
            Promise.resolve(_.keyBy(this.allStudies.result!, s => s.studyId)),
    });

    readonly queriedStudies = remoteData({
        await: () => [this.everyStudyIdToStudy, this.queriedVirtualStudies],
        invoke: async () => {
            if (!_.isEmpty(this.cancerStudyIds)) {
                return fetchQueriedStudies(
                    this.everyStudyIdToStudy.result!,
                    this.cancerStudyIds,
                    this.queriedVirtualStudies.result
                        ? this.queriedVirtualStudies.result
                        : []
                );
            } else {
                return [];
            }
        },
        default: [],
    });

    readonly queriedVirtualStudies = remoteData(
        {
            await: () => [this.allStudies],
            invoke: async () => {
                const allCancerStudies = this.allStudies.result;
                const cancerStudyIds = this.cancerStudyIds;

                const missingFromCancerStudies = _.differenceWith(
                    cancerStudyIds,
                    allCancerStudies,
                    (id: string, study: CancerStudy) => id === study.studyId
                );
                let ret: VirtualStudy[] = [];

                for (const missingId of missingFromCancerStudies) {
                    try {
                        const vs = await sessionServiceClient.getVirtualStudy(
                            missingId
                        );
                        ret = ret.concat(vs);
                    } catch (error) {
                        // ignore missing studies
                        continue;
                    }
                }
                return Promise.resolve(ret);
            },
            onError: () => {
                // fail silently when an error occurs with the virtual studies
            },
            // just return empty array if session service is disabled
        },
        []
    );

    readonly studyToMolecularProfileDiscreteCna = remoteData<{
        [studyId: string]: MolecularProfile;
    }>(
        {
            await: () => [this.molecularProfilesInStudies],
            invoke: async () => {
                const ret: { [studyId: string]: MolecularProfile } = {};
                for (const molecularProfile of this.molecularProfilesInStudies
                    .result) {
                    if (
                        molecularProfile.datatype ===
                            DataTypeConstants.DISCRETE &&
                        molecularProfile.molecularAlterationType ===
                            AlterationTypeConstants.COPY_NUMBER_ALTERATION
                    ) {
                        ret[molecularProfile.studyId] = molecularProfile;
                    }
                }
                return ret;
            },
        },
        {}
    );

    readonly studyIdToStudy = remoteData(
        {
            await: () => [this.studies],
            invoke: () =>
                Promise.resolve(_.keyBy(this.studies.result, x => x.studyId)),
        },
        {}
    );

    private makeMutationsTabFilteringSettings() {
        const self = this;
        let _excludeVus = observable.box<boolean | undefined>(undefined);
        let _excludeGermline = observable.box<boolean | undefined>(undefined);
        return observable({
            useOql: true,
            get excludeVus() {
                if (_excludeVus.get() === undefined) {
                    return !self.driverAnnotationSettings.includeVUS;
                } else {
                    return _excludeVus.get()!;
                }
            },
            get excludeGermline() {
                if (_excludeGermline.get() === undefined) {
                    return !self.includeGermlineMutations;
                } else {
                    return _excludeGermline.get()!;
                }
            },
            set excludeVus(s: boolean) {
                _excludeVus.set(s);
            },
            set excludeGermline(s: boolean) {
                _excludeGermline.set(s);
            },
        });
    }

    readonly origin = remoteData({
        // the studies that the comparison groups come from
        await: () => [this._session],
        invoke: () => Promise.resolve(this._session.result!.origin),
    });

    readonly existingGroupNames = remoteData({
        await: () => [this._originalGroups, this.origin],
        invoke: async () => {
            const ret = {
                session: this._originalGroups.result!.map(g => g.name),
                user: [] as string[],
            };
            if (this.isLoggedIn) {
                // need to add all groups belonging to this user for this origin
                ret.user = (
                    await comparisonClient.getGroupsForStudies(
                        this.origin.result!
                    )
                ).map(g => g.data.name);
            }
            return ret;
        },
    });

    readonly mutationsByGene = remoteData<{
        [hugoGeneSymbol: string]: Mutation[];
    }>({
        await: () => {
            const promises: MobxPromise<any>[] = [
                this.selectedMolecularProfiles,
                this.defaultOQLQuery,
                this.mutationsReportByGene,
                this.structuralVariantsReportByGene,
            ];
            if (this.hideUnprofiledSamples) {
                promises.push(this.filteredSampleKeyToSample);
            }
            return promises;
        },
        invoke: () => {
            const mutationsByGene = _.mapValues(
                this.mutationsReportByGene.result!,
                (mutationGroups: FilteredAndAnnotatedMutationsReport) => {
                    if (
                        this.mutationsTabFilteringSettings.useOql &&
                        this.queryContainsMutationOql
                    ) {
                        // use oql filtering in mutations tab only if query contains mutation oql
                        mutationGroups = _.mapValues(
                            mutationGroups,
                            mutations =>
                                filterCBioPortalWebServiceData(
                                    this.oqlText,
                                    mutations,
                                    new AccessorsForOqlFilter(
                                        this.selectedMolecularProfiles.result!
                                    ),
                                    this.defaultOQLQuery.result!
                                )
                        );
                    }
                    const filteredMutations = compileMutations(
                        mutationGroups,
                        this.mutationsTabFilteringSettings.excludeVus,
                        this.mutationsTabFilteringSettings.excludeGermline
                    );
                    if (this.hideUnprofiledSamples) {
                        // filter unprofiled samples
                        const sampleMap = this.filteredSampleKeyToSample
                            .result!;
                        return filteredMutations.filter(
                            m => m.uniqueSampleKey in sampleMap
                        );
                    } else {
                        return filteredMutations;
                    }
                }
            );

            //TODO: remove once SV/Fusion tab is merged
            _.forEach(
                this.structuralVariantsReportByGene.result,
                (structuralVariantsGroups, hugoGeneSymbol) => {
                    if (mutationsByGene[hugoGeneSymbol] === undefined) {
                        mutationsByGene[hugoGeneSymbol] = [];
                    }

                    if (
                        this.mutationsTabFilteringSettings.useOql &&
                        this.queryContainsMutationOql
                    ) {
                        // use oql filtering in mutations tab only if query contains mutation oql
                        structuralVariantsGroups = _.mapValues(
                            structuralVariantsGroups,
                            structuralVariants =>
                                filterCBioPortalWebServiceData(
                                    this.oqlText,
                                    structuralVariants,
                                    new AccessorsForOqlFilter(
                                        this.selectedMolecularProfiles.result!
                                    ),
                                    this.defaultOQLQuery.result!
                                )
                        );
                    }
                    let filteredStructuralVariants = compileStructuralVariants(
                        structuralVariantsGroups,
                        this.mutationsTabFilteringSettings.excludeVus,
                        this.mutationsTabFilteringSettings.excludeGermline
                    );
                    if (this.hideUnprofiledSamples) {
                        // filter unprofiled samples
                        const sampleMap = this.filteredSampleKeyToSample
                            .result!;
                        filteredStructuralVariants = filteredStructuralVariants.filter(
                            m => m.uniqueSampleKey in sampleMap
                        );
                    }

                    filteredStructuralVariants.forEach(structuralVariant => {
                        const mutation = {
                            center: 'N/A',
                            chr: structuralVariant.site1Chromosome,
                            entrezGeneId: structuralVariant.site1EntrezGeneId,
                            keyword: structuralVariant.comments,
                            molecularProfileId:
                                structuralVariant.molecularProfileId,
                            mutationType: CanonicalMutationType.FUSION,
                            ncbiBuild: structuralVariant.ncbiBuild,
                            patientId: structuralVariant.patientId,
                            proteinChange: structuralVariant.eventInfo,
                            sampleId: structuralVariant.sampleId,
                            startPosition: structuralVariant.site1Position,
                            studyId: structuralVariant.studyId,
                            uniquePatientKey:
                                structuralVariant.uniquePatientKey,
                            uniqueSampleKey: structuralVariant.uniqueSampleKey,
                            variantType: structuralVariant.variantClass,
                            gene: {
                                entrezGeneId:
                                    structuralVariant.site1EntrezGeneId,
                                hugoGeneSymbol:
                                    structuralVariant.site1HugoSymbol,
                            },
                            hugoGeneSymbol: structuralVariant.site1HugoSymbol,
                            putativeDriver: structuralVariant.putativeDriver,
                            oncoKbOncogenic: structuralVariant.oncoKbOncogenic,
                            isHotspot: structuralVariant.isHotspot,
                            simplifiedMutationType:
                                CanonicalMutationType.FUSION,
                        } as AnnotatedMutation;

                        mutationsByGene[hugoGeneSymbol].push(mutation);
                    });
                }
            );
            //TODO: remove once SV/Fusion tab is merged

            return Promise.resolve(mutationsByGene);
        },
    });

    readonly mutations = remoteData<Mutation[]>({
        await: () => [this.mutations_preload, this.sampleKeyToSample],
        invoke: () => {
            const sampleKeys = this.sampleKeyToSample.result!;
            return Promise.resolve(
                this.mutations_preload.result!.filter(
                    m => m.uniqueSampleKey in sampleKeys
                )
            );
        },
    });

    readonly geneCache = new GeneCache();
    @observable public isSettingsMenuVisible = false;

    readonly overlapComputations = remoteData<
        IOverlapComputations<ComparisonGroup>
    >({
        await: () => [this._originalGroups],
        invoke: () => {
            return Promise.resolve(
                getOverlapComputations(
                    this._originalGroups.result!,
                    this.isGroupSelected
                )
            );
        },
    });

    readonly availableGroups = remoteData<ComparisonGroup[]>({
        await: () => [this._originalGroups, this._originalGroupsOverlapRemoved],
        invoke: () => {
            let ret: ComparisonGroup[];
            switch (this.overlapStrategy) {
                case OverlapStrategy.INCLUDE:
                    ret = this._originalGroups.result!;
                    break;
                case OverlapStrategy.EXCLUDE:
                default:
                    ret = this._originalGroupsOverlapRemoved.result!;
                    break;
            }
            return Promise.resolve(ret);
        },
    });

    readonly activeGroups = remoteData<ComparisonGroup[]>({
        await: () => [this.availableGroups],
        invoke: () =>
            Promise.resolve(
                this.availableGroups.result!.filter(
                    group =>
                        this.isGroupSelected(group.name) && !isGroupEmpty(group)
                )
            ),
    });

    readonly enrichmentAnalysisGroups = remoteData({
        await: () => [this.activeGroups, this.sampleMap],
        invoke: () => {
            const sampleSet =
                this.sampleMap.result || new ComplexKeyMap<Sample>();
            const groups = this.activeGroups.result!.map(group => {
                const samples: Sample[] = [];
                group.studies.forEach(studyEntry => {
                    const studyId = studyEntry.id;
                    studyEntry.samples.forEach(sampleId => {
                        if (sampleSet.has({ studyId: studyId, sampleId })) {
                            const sample = sampleSet.get({
                                studyId: studyId,
                                sampleId,
                            })!;
                            samples.push(sample);
                        }
                    });
                });
                return {
                    name: group.nameWithOrdinal,
                    description: '',
                    count: getNumSamples(group),
                    color: group.color,
                    samples,
                    nameOfEnrichmentDirection: group.nameOfEnrichmentDirection,
                };
            });
            return Promise.resolve(groups);
        },
    });

    readonly _originalGroupsOverlapRemoved = remoteData<ComparisonGroup[]>({
        await: () => [this.overlapComputations, this._originalGroups],
        invoke: () => Promise.resolve(this.overlapComputations.result!.groups),
    });

    readonly _activeGroupsOverlapRemoved = remoteData<ComparisonGroup[]>({
        await: () => [this._originalGroupsOverlapRemoved],
        invoke: () =>
            Promise.resolve(
                this._originalGroupsOverlapRemoved.result!.filter(
                    group =>
                        this.isGroupSelected(group.name) && !isGroupEmpty(group)
                )
            ),
    });

    readonly _activeGroupsNotOverlapRemoved = remoteData({
        await: () => [this._originalGroups, this.overlapComputations],
        invoke: () => {
            let excludedGroups = this.overlapComputations.result!
                .excludedFromAnalysis;
            if (this.overlapStrategy === OverlapStrategy.INCLUDE) {
                excludedGroups = {};
            }
            return Promise.resolve(
                this._originalGroups.result!.filter(
                    group =>
                        this.isGroupSelected(group.name) &&
                        !(group.uid in excludedGroups)
                )
            );
        },
    });

    readonly _selectedGroups = remoteData({
        await: () => [this._originalGroups],
        invoke: () =>
            Promise.resolve(
                this._originalGroups.result!.filter(group =>
                    this.isGroupSelected(group.name)
                )
            ),
    });

    readonly activeSamplesNotOverlapRemoved = remoteData({
        await: () => [this.sampleMap, this._activeGroupsNotOverlapRemoved],
        invoke: () => {
            const activeSampleIdentifiers = getSampleIdentifiers(
                this._activeGroupsNotOverlapRemoved.result!
            );
            const sampleSet = this.sampleMap.result!;
            return Promise.resolve(
                activeSampleIdentifiers.map(
                    sampleIdentifier => sampleSet.get(sampleIdentifier)!
                )
            );
        },
    });

    readonly activePatientKeysNotOverlapRemoved = remoteData({
        await: () => [this.activeSamplesNotOverlapRemoved],
        invoke: () =>
            Promise.resolve(
                _.uniq(
                    this.activeSamplesNotOverlapRemoved.result!.map(
                        s => s.uniquePatientKey
                    )
                )
            ),
    });

    readonly activeStudyIds = remoteData({
        await: () => [this.activeGroups],
        invoke: () => Promise.resolve(getStudyIds(this.activeGroups.result!)),
    });

    readonly molecularProfilesInActiveStudies = remoteData<MolecularProfile[]>(
        {
            await: () => [this.activeStudyIds, this.molecularProfilesInStudies],
            invoke: async () => {
                return _.filter(this.molecularProfilesInStudies.result!, s =>
                    this.activeStudyIds.result!.includes(s.studyId)
                );
            },
        },
        []
    );

    readonly referenceGenes = remoteData<ReferenceGenomeGene[]>({
        await: () => [this.studies],
        invoke: () => {
            if (this.studies.result!.length > 0) {
                return fetchAllReferenceGenomeGenes(
                    this.studies.result![0].referenceGenome
                );
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly hugoGeneSymbolToReferenceGene = remoteData<{
        [hugoSymbol: string]: ReferenceGenomeGene;
    }>({
        await: () => [this.referenceGenes],
        invoke: () => {
            // build reference gene map
            return Promise.resolve(
                _.keyBy(this.referenceGenes.result!, g => g.hugoGeneSymbol)
            );
        },
    });

    public readonly alterationEnrichmentProfiles = remoteData({
        await: () => [this.molecularProfilesInActiveStudies],
        invoke: () => {
            return Promise.resolve({
                mutationProfiles: pickMutationEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                ),
                structuralVariantProfiles: pickStructuralVariantEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                ),
                copyNumberEnrichmentProfiles: pickCopyNumberEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                ),
            });
        },
    });

    public readonly mutationEnrichmentProfiles = remoteData({
        await: () => [this.alterationEnrichmentProfiles],
        invoke: () =>
            Promise.resolve(
                this.alterationEnrichmentProfiles.result!.mutationProfiles
            ),
    });
    //
    public readonly structuralVariantProfiles = remoteData({
        await: () => [this.alterationEnrichmentProfiles],
        invoke: () =>
            Promise.resolve(
                this.alterationEnrichmentProfiles.result!
                    .structuralVariantProfiles
            ),
    });

    public readonly structuralVariantEnrichmentProfiles = remoteData({
        await: () => [this.molecularProfilesInActiveStudies],
        invoke: () =>
            Promise.resolve(
                pickStructuralVariantEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                )
            ),
    });

    public readonly copyNumberEnrichmentProfiles = remoteData({
        await: () => [this.alterationEnrichmentProfiles],
        invoke: () =>
            Promise.resolve(
                this.alterationEnrichmentProfiles.result!
                    .copyNumberEnrichmentProfiles
            ),
    });

    public readonly mRNAEnrichmentProfiles = remoteData({
        await: () => [this.molecularProfilesInActiveStudies],
        invoke: () =>
            Promise.resolve(
                pickMRNAEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                )
            ),
    });

    public readonly proteinEnrichmentProfiles = remoteData({
        await: () => [this.molecularProfilesInActiveStudies],
        invoke: () =>
            Promise.resolve(
                pickProteinEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                )
            ),
    });

    public readonly methylationEnrichmentProfiles = remoteData({
        await: () => [this.molecularProfilesInActiveStudies],
        invoke: () =>
            Promise.resolve(
                pickMethylationEnrichmentProfiles(
                    this.molecularProfilesInActiveStudies.result!
                )
            ),
    });

    public readonly genericAssayEnrichmentProfilesGroupedByGenericAssayType = remoteData(
        {
            await: () => [this.molecularProfilesInActiveStudies],
            invoke: () =>
                Promise.resolve(
                    _.groupBy(
                        pickGenericAssayEnrichmentProfiles(
                            this.molecularProfilesInActiveStudies.result!
                        ),
                        profile => profile.genericAssayType
                    )
                ),
        }
    );

    @observable.ref private _mutationEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref private _structuralVariantEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref private _copyNumberEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref private _mRNAEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref private _proteinEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref private _methylationEnrichmentProfileMap: {
        [studyId: string]: MolecularProfile;
    } = {};
    @observable.ref
    private _selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType: {
        [geneircAssayType: string]: {
            [studyId: string]: MolecularProfile;
        };
    } = {};

    readonly selectedStudyMutationEnrichmentProfileMap = remoteData({
        await: () => [this.mutationEnrichmentProfiles],
        invoke: () => {
            //Only return Mutation profile if any mutation type is selected, otherwise return {}
            if (
                _(this.selectedMutationEnrichmentEventTypes)
                    .values()
                    .some()
            ) {
                // set default enrichmentProfileMap if not selected yet
                if (_.isEmpty(this._mutationEnrichmentProfileMap)) {
                    const molecularProfilesbyStudyId = _.groupBy(
                        this.mutationEnrichmentProfiles.result!,
                        profile => profile.studyId
                    );
                    // Select only one molecular profile for each study
                    return Promise.resolve(
                        _.mapValues(
                            molecularProfilesbyStudyId,
                            molecularProfiles => molecularProfiles[0]
                        )
                    );
                } else {
                    return Promise.resolve(this._mutationEnrichmentProfileMap);
                }
            } else {
                return Promise.resolve({});
            }
        },
    });

    readonly selectedStudyStructuralVariantEnrichmentProfileMap = remoteData({
        await: () => [this.structuralVariantEnrichmentProfiles],
        invoke: () => {
            // set default enrichmentProfileMap if not selected yet
            if (this.isStructuralVariantEnrichmentSelected) {
                if (_.isEmpty(this._structuralVariantEnrichmentProfileMap)) {
                    const structuralVariantProfiles = getFilteredMolecularProfilesByAlterationType(
                        _.groupBy(
                            this.structuralVariantEnrichmentProfiles.result!,
                            profile => profile.studyId
                        ),
                        AlterationTypeConstants.STRUCTURAL_VARIANT,
                        [DataTypeConstants.FUSION, DataTypeConstants.SV]
                    );

                    return Promise.resolve(
                        _.keyBy(
                            structuralVariantProfiles,
                            profile => profile.studyId
                        )
                    );
                } else {
                    return Promise.resolve(
                        this._structuralVariantEnrichmentProfileMap
                    );
                }
            } else {
                return Promise.resolve({});
            }
        },
    });

    readonly selectedStudyCopyNumberEnrichmentProfileMap = remoteData({
        await: () => [this.copyNumberEnrichmentProfiles],
        invoke: () => {
            //Only return Copy Number profile if any copy number type is selected, otherwise return {}
            if (
                _(this.selectedCopyNumberEnrichmentEventTypes)
                    .values()
                    .some()
            ) {
                // set default enrichmentProfileMap if not selected yet
                if (_.isEmpty(this._copyNumberEnrichmentProfileMap)) {
                    const molecularProfilesbyStudyId = _.groupBy(
                        this.copyNumberEnrichmentProfiles.result!,
                        profile => profile.studyId
                    );
                    // Select only one molecular profile for each study
                    return Promise.resolve(
                        _.mapValues(
                            molecularProfilesbyStudyId,
                            molecularProfiles => molecularProfiles[0]
                        )
                    );
                } else {
                    return Promise.resolve(
                        this._copyNumberEnrichmentProfileMap
                    );
                }
            } else {
                return Promise.resolve({});
            }
        },
    });

    readonly selectedmRNAEnrichmentProfileMap = remoteData({
        await: () => [this.mRNAEnrichmentProfiles],
        invoke: () => {
            // set default enrichmentProfileMap if not selected yet
            if (_.isEmpty(this._mRNAEnrichmentProfileMap)) {
                const molecularProfilesbyStudyId = _.groupBy(
                    this.mRNAEnrichmentProfiles.result!,
                    profile => profile.studyId
                );
                // Select only one molecular profile for each study
                return Promise.resolve(
                    _.mapValues(
                        molecularProfilesbyStudyId,
                        molecularProfiles => molecularProfiles[0]
                    )
                );
            } else {
                return Promise.resolve(this._mRNAEnrichmentProfileMap);
            }
        },
    });

    readonly selectedProteinEnrichmentProfileMap = remoteData({
        await: () => [this.proteinEnrichmentProfiles],
        invoke: () => {
            // set default enrichmentProfileMap if not selected yet
            if (_.isEmpty(this._proteinEnrichmentProfileMap)) {
                const molecularProfilesbyStudyId = _.groupBy(
                    this.proteinEnrichmentProfiles.result!,
                    profile => profile.studyId
                );
                // Select only one molecular profile for each study
                return Promise.resolve(
                    _.mapValues(
                        molecularProfilesbyStudyId,
                        molecularProfiles => molecularProfiles[0]
                    )
                );
            } else {
                return Promise.resolve(this._proteinEnrichmentProfileMap);
            }
        },
    });

    readonly selectedMethylationEnrichmentProfileMap = remoteData({
        await: () => [this.methylationEnrichmentProfiles],
        invoke: () => {
            // set default enrichmentProfileMap if not selected yet
            if (_.isEmpty(this._methylationEnrichmentProfileMap)) {
                const molecularProfilesbyStudyId = _.groupBy(
                    this.methylationEnrichmentProfiles.result!,
                    profile => profile.studyId
                );
                // Select only one molecular profile for each study
                return Promise.resolve(
                    _.mapValues(
                        molecularProfilesbyStudyId,
                        molecularProfiles => molecularProfiles[0]
                    )
                );
            } else {
                return Promise.resolve(this._methylationEnrichmentProfileMap);
            }
        },
    });

    readonly selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType = remoteData(
        {
            await: () => [
                this.genericAssayEnrichmentProfilesGroupedByGenericAssayType,
            ],
            invoke: () => {
                if (
                    _.isEmpty(
                        this
                            ._selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                    )
                ) {
                    return Promise.resolve(
                        _.mapValues(
                            this
                                .genericAssayEnrichmentProfilesGroupedByGenericAssayType
                                .result!,
                            genericAssayEnrichmentProfiles => {
                                const molecularProfilesbyStudyId = _.groupBy(
                                    genericAssayEnrichmentProfiles,
                                    profile => profile.studyId
                                );
                                // Select only one molecular profile for each study
                                return _.mapValues(
                                    molecularProfilesbyStudyId,
                                    molecularProfiles => molecularProfiles[0]
                                );
                            }
                        )
                    );
                } else {
                    return Promise.resolve(
                        this
                            ._selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                    );
                }
            },
        }
    );

    @action
    public setMutationEnrichmentProfileMap(profileMap: {
        [studyId: string]: MolecularProfile;
    }) {
        this._mutationEnrichmentProfileMap = profileMap;
    }

    @action
    public setStructuralVariantEnrichmentProfileMap(profileMap: {
        [studyId: string]: MolecularProfile;
    }) {
        this._structuralVariantEnrichmentProfileMap = profileMap;
    }

    @action
    public setCopyNumberEnrichmentProfileMap(profileMap: {
        [studyId: string]: MolecularProfile;
    }) {
        this._copyNumberEnrichmentProfileMap = profileMap;
    }

    @action
    public setMRNAEnrichmentProfileMap(profiles: {
        [studyId: string]: MolecularProfile;
    }) {
        this._mRNAEnrichmentProfileMap = profiles;
    }

    @action
    public setProteinEnrichmentProfileMap(profileMap: {
        [studyId: string]: MolecularProfile;
    }) {
        this._proteinEnrichmentProfileMap = profileMap;
    }

    @action
    public setMethylationEnrichmentProfileMap(profileMap: {
        [studyId: string]: MolecularProfile;
    }) {
        this._methylationEnrichmentProfileMap = profileMap;
    }

    @action
    public setGenericAssayEnrichmentProfileMap(
        profileMap: {
            [studyId: string]: MolecularProfile;
        },
        genericAssayType: string
    ) {
        const clonedMap = _.clone(
            this
                .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                .result!
        );
        clonedMap[genericAssayType] = profileMap;
        // trigger the function to recompute
        this._selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType = clonedMap;
    }

    readonly alterationsEnrichmentAnalysisGroups = remoteData({
        await: () => [
            this.enrichmentAnalysisGroups,
            this.selectedStudyMutationEnrichmentProfileMap,
            this.selectedStudyCopyNumberEnrichmentProfileMap,
            this.selectedStudyStructuralVariantEnrichmentProfileMap,
        ],
        invoke: () => {
            return Promise.resolve(
                this.enrichmentAnalysisGroups.result!.map(group => {
                    return {
                        ...group,
                        description: `Number (percentage) of ${
                            this.usePatientLevelEnrichments
                                ? 'patients'
                                : 'samples'
                        } in ${
                            group.name
                        } that have an alteration in the listed gene.`,
                    };
                })
            );
        },
    });

    readonly alterationsEnrichmentDataRequestGroups = remoteData({
        await: () => [
            this.alterationsEnrichmentAnalysisGroups,
            this.selectedStudyMutationEnrichmentProfileMap,
            this.selectedStudyCopyNumberEnrichmentProfileMap,
            this.selectedStudyStructuralVariantEnrichmentProfileMap,
        ],
        invoke: () => {
            if (
                _(this.selectedMutationEnrichmentEventTypes)
                    .values()
                    .some() ||
                _(this.selectedCopyNumberEnrichmentEventTypes)
                    .values()
                    .some() ||
                this.isStructuralVariantEnrichmentSelected
            ) {
                return Promise.resolve(
                    this.enrichmentAnalysisGroups.result!.reduce(
                        (acc: MolecularProfileCasesGroupFilter[], group) => {
                            let molecularProfileCaseIdentifiers: {
                                caseId: string;
                                molecularProfileId: string;
                            }[] = [];
                            group.samples.forEach(sample => {
                                if (
                                    this
                                        .selectedStudyMutationEnrichmentProfileMap
                                        .result![sample.studyId]
                                ) {
                                    molecularProfileCaseIdentifiers.push({
                                        caseId: this.usePatientLevelEnrichments
                                            ? sample.patientId
                                            : sample.sampleId,
                                        molecularProfileId: this
                                            .selectedStudyMutationEnrichmentProfileMap
                                            .result![sample.studyId]
                                            .molecularProfileId,
                                    });
                                }
                                if (
                                    this
                                        .selectedStudyCopyNumberEnrichmentProfileMap
                                        .result![sample.studyId]
                                ) {
                                    molecularProfileCaseIdentifiers.push({
                                        caseId: this.usePatientLevelEnrichments
                                            ? sample.patientId
                                            : sample.sampleId,
                                        molecularProfileId: this
                                            .selectedStudyCopyNumberEnrichmentProfileMap
                                            .result![sample.studyId]
                                            .molecularProfileId,
                                    });
                                }
                                if (
                                    this
                                        .selectedStudyStructuralVariantEnrichmentProfileMap
                                        .result![sample.studyId]
                                ) {
                                    molecularProfileCaseIdentifiers.push({
                                        caseId: this.usePatientLevelEnrichments
                                            ? sample.patientId
                                            : sample.sampleId,
                                        molecularProfileId: this
                                            .selectedStudyStructuralVariantEnrichmentProfileMap
                                            .result![sample.studyId]
                                            .molecularProfileId,
                                    });
                                }
                            });

                            if (molecularProfileCaseIdentifiers.length > 0) {
                                acc.push({
                                    name: group.name,
                                    molecularProfileCaseIdentifiers,
                                });
                            }
                            return acc;
                        },
                        []
                    )
                );
            } else {
                return Promise.resolve([]);
            }
        },
    });

    public readonly alterationsEnrichmentData = makeEnrichmentDataPromise({
        await: () => [this.alterationsEnrichmentDataRequestGroups],
        resultsViewPageStore: this.resultsViewStore,
        getSelectedProfileMaps: () => [
            this.selectedStudyMutationEnrichmentProfileMap.result!,
            this.selectedStudyCopyNumberEnrichmentProfileMap.result!,
            this.selectedStudyStructuralVariantEnrichmentProfileMap.result!,
        ],
        referenceGenesPromise: this.hugoGeneSymbolToReferenceGene,
        fetchData: () => {
            if (
                (this.alterationsEnrichmentDataRequestGroups.result &&
                    this.alterationsEnrichmentDataRequestGroups.result.length >
                        1 &&
                    (_(this.selectedMutationEnrichmentEventTypes)
                        .values()
                        .some() ||
                        _(this.selectedCopyNumberEnrichmentEventTypes)
                            .values()
                            .some())) ||
                this.isStructuralVariantEnrichmentSelected
            ) {
                const groupsAndAlterationTypes = {
                    molecularProfileCasesGroupFilter: this
                        .alterationsEnrichmentDataRequestGroups.result!,
                    alterationEventTypes: ({
                        copyNumberAlterationEventTypes: getCopyNumberEventTypesAPIParameter(
                            this.selectedCopyNumberEnrichmentEventTypes
                        ),
                        mutationEventTypes: getMutationEventTypesAPIParameter(
                            this.selectedMutationEnrichmentEventTypes
                        ),
                        structuralVariants: !!this
                            .isStructuralVariantEnrichmentSelected,
                        includeDriver: this.driverAnnotationSettings
                            .includeDriver,
                        includeVUS: this.driverAnnotationSettings.includeVUS,
                        includeUnknownOncogenicity: this
                            .driverAnnotationSettings
                            .includeUnknownOncogenicity,
                        tiersBooleanMap: this.selectedDriverTiersMap,
                        includeUnknownTier: this.driverAnnotationSettings
                            .includeUnknownTier,
                        includeGermline: this.includeGermlineMutations,
                        includeSomatic: this.includeSomaticMutations,
                        includeUnknownStatus: this
                            .includeUnknownStatusMutations,
                    } as unknown) as AlterationFilter,
                };

                return internalClient.fetchAlterationEnrichmentsUsingPOST({
                    enrichmentType: this.usePatientLevelEnrichments
                        ? 'PATIENT'
                        : 'SAMPLE',
                    groupsAndAlterationTypes,
                });
            }
            return Promise.resolve([]);
        },
    });

    readonly mrnaEnrichmentAnalysisGroups = remoteData({
        await: () => [
            this.selectedmRNAEnrichmentProfileMap,
            this.enrichmentAnalysisGroups,
        ],
        invoke: () => {
            let studyIds = Object.keys(
                this.selectedmRNAEnrichmentProfileMap.result!
            );
            // assumes single study for now
            if (studyIds.length === 1) {
                return Promise.resolve(
                    this.enrichmentAnalysisGroups.result!.reduce(
                        (acc: EnrichmentAnalysisComparisonGroup[], group) => {
                            // filter samples having mutation profile
                            const filteredSamples = group.samples.filter(
                                sample =>
                                    this.selectedmRNAEnrichmentProfileMap
                                        .result![sample.studyId] !== undefined
                            );
                            if (filteredSamples.length > 0) {
                                acc.push({
                                    ...group,
                                    samples: filteredSamples,
                                    description: `samples in ${group.name}`,
                                });
                            }
                            return acc;
                        },
                        []
                    )
                );
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly mrnaEnrichmentDataRequestGroups = remoteData({
        await: () => [
            this.mrnaEnrichmentAnalysisGroups,
            this.selectedmRNAEnrichmentProfileMap,
        ],
        invoke: () => {
            return Promise.resolve(
                this.mrnaEnrichmentAnalysisGroups.result!.map(group => {
                    const molecularProfileCaseIdentifiers = group.samples.map(
                        sample => ({
                            caseId: sample.sampleId,
                            molecularProfileId: this
                                .selectedmRNAEnrichmentProfileMap.result![
                                sample.studyId
                            ].molecularProfileId,
                        })
                    );
                    return {
                        name: group.name,
                        molecularProfileCaseIdentifiers,
                    };
                })
            );
        },
    });

    readonly mRNAEnrichmentData = makeEnrichmentDataPromise({
        await: () => [this.mrnaEnrichmentDataRequestGroups],
        getSelectedProfileMaps: () => [
            // returns an empty array if the selected study doesn't have any mRNA profiles
            this.selectedmRNAEnrichmentProfileMap.result!,
        ],
        referenceGenesPromise: this.hugoGeneSymbolToReferenceGene,
        fetchData: () => {
            if (
                this.mrnaEnrichmentDataRequestGroups.result &&
                this.mrnaEnrichmentDataRequestGroups.result.length > 1
            ) {
                return internalClient.fetchGenomicEnrichmentsUsingPOST({
                    enrichmentType: 'SAMPLE',
                    groups: this.mrnaEnrichmentDataRequestGroups.result!,
                });
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly proteinEnrichmentAnalysisGroups = remoteData({
        await: () => [
            this.selectedProteinEnrichmentProfileMap,
            this.enrichmentAnalysisGroups,
        ],
        invoke: () => {
            let studyIds = Object.keys(
                this.selectedProteinEnrichmentProfileMap.result!
            );
            // assumes single study for now
            if (studyIds.length === 1) {
                return Promise.resolve(
                    this.enrichmentAnalysisGroups.result!.reduce(
                        (acc: EnrichmentAnalysisComparisonGroup[], group) => {
                            // filter samples having mutation profile
                            const filteredSamples = group.samples.filter(
                                sample =>
                                    this.selectedProteinEnrichmentProfileMap
                                        .result![sample.studyId] !== undefined
                            );
                            if (filteredSamples.length > 0) {
                                acc.push({
                                    ...group,
                                    samples: filteredSamples,
                                    description: `samples in ${group.name}`,
                                });
                            }
                            return acc;
                        },
                        []
                    )
                );
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly proteinEnrichmentDataRequestGroups = remoteData({
        await: () => [
            this.proteinEnrichmentAnalysisGroups,
            this.selectedProteinEnrichmentProfileMap,
        ],
        invoke: () => {
            return Promise.resolve(
                this.proteinEnrichmentAnalysisGroups.result!.map(group => {
                    const molecularProfileCaseIdentifiers = group.samples.map(
                        sample => ({
                            caseId: sample.sampleId,
                            molecularProfileId: this
                                .selectedProteinEnrichmentProfileMap.result![
                                sample.studyId
                            ].molecularProfileId,
                        })
                    );
                    return {
                        name: group.name,
                        molecularProfileCaseIdentifiers,
                    };
                })
            );
        },
    });

    readonly proteinEnrichmentData = makeEnrichmentDataPromise({
        await: () => [this.proteinEnrichmentDataRequestGroups],
        referenceGenesPromise: this.hugoGeneSymbolToReferenceGene,
        getSelectedProfileMaps: () => [
            // returns an empty array if the selected study doesn't have any protein profiles
            this.selectedProteinEnrichmentProfileMap.result!,
        ],
        fetchData: () => {
            if (
                this.proteinEnrichmentDataRequestGroups.result &&
                this.proteinEnrichmentDataRequestGroups.result.length > 1
            ) {
                return internalClient.fetchGenomicEnrichmentsUsingPOST({
                    enrichmentType: 'SAMPLE',
                    groups: this.proteinEnrichmentDataRequestGroups.result!,
                });
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly methylationEnrichmentAnalysisGroups = remoteData({
        await: () => [
            this.selectedMethylationEnrichmentProfileMap,
            this.enrichmentAnalysisGroups,
        ],
        invoke: () => {
            let studyIds = Object.keys(
                this.selectedMethylationEnrichmentProfileMap.result!
            );
            // assumes single study for now
            if (studyIds.length === 1) {
                return Promise.resolve(
                    this.enrichmentAnalysisGroups.result!.reduce(
                        (acc: EnrichmentAnalysisComparisonGroup[], group) => {
                            // filter samples having mutation profile
                            const filteredSamples = group.samples.filter(
                                sample =>
                                    this.selectedMethylationEnrichmentProfileMap
                                        .result![sample.studyId] !== undefined
                            );
                            if (filteredSamples.length > 0) {
                                acc.push({
                                    ...group,
                                    samples: filteredSamples,
                                    description: `samples in ${group.name}`,
                                });
                            }
                            return acc;
                        },
                        []
                    )
                );
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly methylationEnrichmentDataRequestGroups = remoteData({
        await: () => [
            this.methylationEnrichmentAnalysisGroups,
            this.selectedMethylationEnrichmentProfileMap,
        ],
        invoke: () => {
            return Promise.resolve(
                this.methylationEnrichmentAnalysisGroups.result!.map(group => {
                    const molecularProfileCaseIdentifiers = group.samples.map(
                        sample => ({
                            caseId: sample.sampleId,
                            molecularProfileId: this
                                .selectedMethylationEnrichmentProfileMap
                                .result![sample.studyId].molecularProfileId,
                        })
                    );
                    return {
                        name: group.name,
                        molecularProfileCaseIdentifiers,
                    };
                })
            );
        },
    });

    readonly methylationEnrichmentData = makeEnrichmentDataPromise({
        await: () => [this.methylationEnrichmentDataRequestGroups],
        referenceGenesPromise: this.hugoGeneSymbolToReferenceGene,
        getSelectedProfileMaps: () => [
            // returns an empty array if the selected study doesn't have any methylation profiles
            this.selectedMethylationEnrichmentProfileMap.result!,
        ],
        fetchData: () => {
            if (
                this.methylationEnrichmentDataRequestGroups.result &&
                this.methylationEnrichmentDataRequestGroups.result.length > 1
            ) {
                return internalClient.fetchGenomicEnrichmentsUsingPOST({
                    enrichmentType: 'SAMPLE',
                    groups: this.methylationEnrichmentDataRequestGroups.result!,
                });
            } else {
                return Promise.resolve([]);
            }
        },
    });

    readonly gaEnrichmentGroupsByAssayType = remoteData({
        await: () => [
            this
                .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType,
            this.enrichmentAnalysisGroups,
        ],
        invoke: () => {
            return Promise.resolve(
                _.mapValues(
                    this
                        .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                        .result!,
                    selectedGenericAssayEnrichmentProfileMap => {
                        let studyIds = Object.keys(
                            selectedGenericAssayEnrichmentProfileMap
                        );
                        // assumes single study for now
                        if (studyIds.length === 1) {
                            return this.enrichmentAnalysisGroups.result!.reduce(
                                (
                                    acc: EnrichmentAnalysisComparisonGroup[],
                                    group
                                ) => {
                                    // filter samples having mutation profile
                                    const filteredSamples = group.samples.filter(
                                        sample =>
                                            selectedGenericAssayEnrichmentProfileMap[
                                                sample.studyId
                                            ] !== undefined
                                    );
                                    if (filteredSamples.length > 0) {
                                        acc.push({
                                            ...group,
                                            samples: filteredSamples,
                                            description: `samples in ${group.name}`,
                                        });
                                    }
                                    return acc;
                                },
                                []
                            );
                        } else {
                            return [];
                        }
                    }
                )
            );
        },
    });

    readonly gaEnrichmentDataQueryByAssayType = remoteData({
        await: () => [
            this.gaEnrichmentGroupsByAssayType,
            this
                .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType,
        ],
        invoke: () => {
            return Promise.resolve(
                _.mapValues(
                    this.gaEnrichmentGroupsByAssayType.result!,
                    (
                        genericAssayEnrichmentAnalysisGroups,
                        genericAssayType
                    ) => {
                        return genericAssayEnrichmentAnalysisGroups.map(
                            group => {
                                const molecularProfileCaseIdentifiers = group.samples.map(
                                    sample => ({
                                        caseId: sample.sampleId,
                                        molecularProfileId: this
                                            .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                                            .result![genericAssayType][
                                            sample.studyId
                                        ].molecularProfileId,
                                    })
                                );
                                return {
                                    name: group.name,
                                    molecularProfileCaseIdentifiers,
                                };
                            }
                        );
                    }
                )
            );
        },
    });

    readonly gaEnrichmentDataByAssayType = remoteData({
        await: () => [this.gaEnrichmentDataQueryByAssayType],
        invoke: () => {
            return Promise.resolve(
                _.mapValues(
                    this.gaEnrichmentDataQueryByAssayType.result!,
                    (
                        genericAssayEnrichmentDataRequestGroups,
                        genericAssayType
                    ) => {
                        return makeGenericAssayEnrichmentDataPromise({
                            await: () => [],
                            getSelectedProfileMap: () =>
                                this
                                    .selectedGenericAssayEnrichmentProfileMapGroupedByGenericAssayType
                                    .result![genericAssayType], // returns an empty array if the selected study doesn't have any generic assay profiles
                            fetchData: () => {
                                if (
                                    genericAssayEnrichmentDataRequestGroups &&
                                    genericAssayEnrichmentDataRequestGroups.length >
                                        1
                                ) {
                                    return internalClient.fetchGenericAssayEnrichmentsUsingPOST(
                                        {
                                            enrichmentType: 'SAMPLE',
                                            groups: genericAssayEnrichmentDataRequestGroups,
                                        }
                                    );
                                } else {
                                    return Promise.resolve([]);
                                }
                            },
                        });
                    }
                )
            );
        },
    });

    @computed get survivalTabShowable() {
        return (
            this.survivalClinicalDataExists.isComplete &&
            this.survivalClinicalDataExists.result
        );
    }

    @computed get showSurvivalTab() {
        return !!(
            this.survivalTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.SURVIVAL))
        );
    }

    @computed get mutationTabShowable() {
        return (
            this.survivalClinicalDataExists.isComplete &&
            this.survivalClinicalDataExists.result
        );
    }

    @computed get showMutationTab() {
        return !!(
            this.survivalTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.MUTATION))
        );
    }

    @computed get survivalTabUnavailable() {
        // grey out if more than 10 active groups
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length > 10) ||
            !this.survivalTabShowable
        );
    }

    @computed get clinicalTabUnavailable() {
        // grey out if active groups is less than 2
        return (
            this.activeGroups.isComplete && this.activeGroups.result.length < 2
        );
    }

    @computed get mRNATabShowable() {
        return (
            this.mRNAEnrichmentProfiles.isComplete &&
            this.mRNAEnrichmentProfiles.result!.length > 0
        );
    }

    @computed get showMRNATab() {
        return !!(
            this.mRNATabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.MRNA))
        );
    }

    @computed get mRNATabUnavailable() {
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length < 2) || //less than two active groups
            (this.activeStudyIds.isComplete &&
                this.activeStudyIds.result.length > 1) || //more than one active study
            !this.mRNATabShowable
        );
    }

    @computed get proteinTabShowable() {
        return (
            this.proteinEnrichmentProfiles.isComplete &&
            this.proteinEnrichmentProfiles.result!.length > 0
        );
    }

    @computed get showProteinTab() {
        return !!(
            this.proteinTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.PROTEIN))
        );
    }

    @computed get proteinTabUnavailable() {
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length < 2) || //less than two active groups
            (this.activeStudyIds.isComplete &&
                this.activeStudyIds.result.length > 1) || //more than one active study
            !this.proteinTabShowable
        );
    }

    @computed get methylationTabShowable() {
        return (
            this.methylationEnrichmentProfiles.isComplete &&
            this.methylationEnrichmentProfiles.result!.length > 0
        );
    }

    @computed get showMethylationTab() {
        return !!(
            this.methylationTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.DNAMETHYLATION))
        );
    }

    @computed get methylationTabUnavailable() {
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length < 2) || //less than two active groups
            (this.activeStudyIds.isComplete &&
                this.activeStudyIds.result.length > 1) || //more than one active study
            !this.methylationTabShowable
        );
    }

    @computed get alterationsTabShowable() {
        return (
            this.mutationEnrichmentProfiles.isComplete &&
            this.copyNumberEnrichmentProfiles.isComplete &&
            (this.mutationEnrichmentProfiles.result!.length > 0 ||
                this.copyNumberEnrichmentProfiles.result!.length > 0)
        );
    }

    @computed get showAlterationsTab() {
        return !!(
            this.alterationsTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(GroupComparisonTab.ALTERATIONS))
        );
    }

    @computed get alterationsTabUnavailable() {
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length < 2) || //less than two active groups
            !this.alterationsTabShowable
        );
    }

    @computed get genericAssayTabShowable() {
        return (
            this.genericAssayEnrichmentProfilesGroupedByGenericAssayType
                .isComplete &&
            _.size(
                this.genericAssayEnrichmentProfilesGroupedByGenericAssayType
                    .result!
            ) > 0
        );
    }

    @computed get showGenericAssayTab() {
        return !!(
            this.genericAssayTabShowable ||
            (this.activeGroups.isComplete &&
                this.activeGroups.result!.length === 0 &&
                this.tabHasBeenShown.get(
                    GroupComparisonTab.GENERIC_ASSAY_PREFIX
                ))
        );
    }

    @computed get genericAssayTabUnavailable() {
        return (
            (this.activeGroups.isComplete &&
                this.activeGroups.result.length < 2) || //less than two active groups
            (this.activeStudyIds.isComplete &&
                this.activeStudyIds.result.length > 1) || //more than one active study
            !this.genericAssayTabShowable
        );
    }

    public readonly sampleMap = remoteData({
        await: () => [this.samples],
        invoke: () => {
            const sampleSet = new ComplexKeyMap<Sample>();
            for (const sample of this.samples.result!) {
                sampleSet.set(
                    { studyId: sample.studyId, sampleId: sample.sampleId },
                    sample
                );
            }
            return Promise.resolve(sampleSet);
        },
    });

    readonly patientKeys = remoteData({
        await: () => [this.samples],
        invoke: () => {
            return Promise.resolve(
                _.uniq(this.samples.result!.map(s => s.uniquePatientKey))
            );
        },
    });

    public readonly patientToSamplesSet = remoteData({
        await: () => [this.samples],
        invoke: () => {
            const ret = new ComplexKeyGroupsMap<Sample>();
            for (const sample of this.samples.result!) {
                ret.add(
                    { studyId: sample.studyId, patientId: sample.patientId },
                    sample
                );
            }
            return Promise.resolve(ret);
        },
    });

    public readonly patientKeyToSamples = remoteData({
        await: () => [this.samples],
        invoke: () => {
            return Promise.resolve(
                _.groupBy(
                    this.samples.result!,
                    sample => sample.uniquePatientKey
                )
            );
        },
    });

    public readonly sampleKeyToSample = remoteData({
        await: () => [this.samples],
        invoke: () => {
            let sampleSet = _.reduce(
                this.samples.result!,
                (acc, sample) => {
                    acc[sample.uniqueSampleKey] = sample;
                    return acc;
                },
                {} as { [uniqueSampleKey: string]: Sample }
            );
            return Promise.resolve(sampleSet);
        },
    });

    public readonly sampleKeyToGroups = remoteData({
        await: () => [this._originalGroups, this.sampleMap],
        invoke: () => {
            const sampleSet = this.sampleMap.result!;
            const groups = this._originalGroups.result!;
            const ret: {
                [uniqueSampleKey: string]: { [groupUid: string]: boolean };
            } = {};
            for (const group of groups) {
                for (const studyObject of group.studies) {
                    const studyId = studyObject.id;
                    for (const sampleId of studyObject.samples) {
                        const sample = sampleSet.get({ sampleId, studyId });
                        if (sample) {
                            ret[sample.uniqueSampleKey] =
                                ret[sample.uniqueSampleKey] || {};
                            ret[sample.uniqueSampleKey][group.uid] = true;
                        }
                    }
                }
            }
            return Promise.resolve(ret);
        },
    });

    public readonly patientsVennPartition = remoteData({
        await: () => [
            this._activeGroupsNotOverlapRemoved,
            this.patientToSamplesSet,
            this.activePatientKeysNotOverlapRemoved,
        ],
        invoke: () => {
            const patientToSamplesSet = this.patientToSamplesSet.result!;
            return Promise.resolve(
                partitionCasesByGroupMembership(
                    this._activeGroupsNotOverlapRemoved.result!,
                    group => getPatientIdentifiers([group]),
                    patientIdentifier =>
                        patientToSamplesSet.get({
                            studyId: patientIdentifier.studyId,
                            patientId: patientIdentifier.patientId,
                        })![0].uniquePatientKey,
                    this.activePatientKeysNotOverlapRemoved.result!
                ) as { key: { [uid: string]: boolean }; value: string[] }[]
            );
        },
    });

    readonly survivalClinicalDataExists = remoteData<boolean>({
        await: () => [
            this.activeSamplesNotOverlapRemoved,
            this.survivalClinicalAttributesPrefix,
        ],
        invoke: () =>
            fetchSurvivalDataExists(
                this.activeSamplesNotOverlapRemoved.result!,
                this.survivalClinicalAttributesPrefix.result!
            ),
    });

    readonly survivalClinicalData = remoteData<ClinicalData[]>(
        {
            await: () => [
                this.activeSamplesNotOverlapRemoved,
                this.survivalClinicalAttributesPrefix,
            ],
            invoke: () => {
                if (this.activeSamplesNotOverlapRemoved.result!.length === 0) {
                    return Promise.resolve([]);
                }
                const attributeNames: string[] = _.reduce(
                    this.survivalClinicalAttributesPrefix.result!,
                    (attributeNames, prefix: string) => {
                        attributeNames.push(prefix + '_STATUS');
                        attributeNames.push(prefix + '_MONTHS');
                        return attributeNames;
                    },
                    [] as string[]
                );

                if (attributeNames.length === 0) {
                    return Promise.resolve([]);
                }
                const filter: ClinicalDataMultiStudyFilter = {
                    attributeIds: attributeNames,
                    identifiers: this.activeSamplesNotOverlapRemoved.result!.map(
                        (s: any) => ({
                            entityId: s.patientId,
                            studyId: s.studyId,
                        })
                    ),
                };
                return client.fetchClinicalDataUsingPOST({
                    clinicalDataType: 'PATIENT',
                    clinicalDataMultiStudyFilter: filter,
                });
            },
        },
        []
    );

    readonly activeStudiesClinicalAttributes = remoteData<ClinicalAttribute[]>(
        {
            await: () => [this.activeStudyIds],
            invoke: () => {
                if (this.activeStudyIds.result!.length === 0) {
                    return Promise.resolve([]);
                }
                return client.fetchClinicalAttributesUsingPOST({
                    studyIds: this.activeStudyIds.result!,
                });
            },
        },
        []
    );

    readonly survivalClinicalAttributesPrefix = remoteData({
        await: () => [this.activeStudiesClinicalAttributes],
        invoke: () => {
            return Promise.resolve(
                getSurvivalClinicalAttributesPrefix(
                    this.activeStudiesClinicalAttributes.result!
                )
            );
        },
    });

    readonly survivalClinicalDataGroupByUniquePatientKey = remoteData<{
        [key: string]: ClinicalData[];
    }>({
        await: () => [this.survivalClinicalData],
        invoke: async () => {
            return _.groupBy(
                this.survivalClinicalData.result,
                'uniquePatientKey'
            );
        },
    });

    readonly patientSurvivals = remoteData<{
        [prefix: string]: PatientSurvival[];
    }>({
        await: () => [
            this.survivalClinicalDataGroupByUniquePatientKey,
            this.activePatientKeysNotOverlapRemoved,
            this.survivalClinicalAttributesPrefix,
        ],
        invoke: () => {
            return Promise.resolve(
                _.reduce(
                    this.survivalClinicalAttributesPrefix.result!,
                    (acc, key) => {
                        acc[key] = getPatientSurvivals(
                            this.survivalClinicalDataGroupByUniquePatientKey
                                .result!,
                            this.activePatientKeysNotOverlapRemoved.result!,
                            `${key}_STATUS`,
                            `${key}_MONTHS`,
                            s => getSurvivalStatusBoolean(s, key)
                        );
                        return acc;
                    },
                    {} as { [prefix: string]: PatientSurvival[] }
                )
            );
        },
    });

    readonly uidToGroup = remoteData({
        await: () => [this._originalGroups],
        invoke: () => {
            return Promise.resolve(
                _.keyBy(this._originalGroups.result!, group => group.uid)
            );
        },
    });

    public readonly clinicalDataEnrichments = remoteData(
        {
            await: () => [this.activeGroups],
            invoke: () => {
                if (this.clinicalTabUnavailable) {
                    return Promise.resolve([]);
                }
                let groups: Group[] = _.map(this.activeGroups.result, group => {
                    const sampleIdentifiers = [];
                    for (const studySpec of group.studies) {
                        const studyId = studySpec.id;
                        for (const sampleId of studySpec.samples) {
                            sampleIdentifiers.push({
                                studyId,
                                sampleId,
                            });
                        }
                    }
                    return {
                        name: group.nameWithOrdinal || group.uid,
                        sampleIdentifiers: sampleIdentifiers,
                    };
                });
                if (groups.length > 1) {
                    return internalClient.fetchClinicalEnrichmentsUsingPOST({
                        groupFilter: {
                            groups: groups,
                        },
                    });
                } else {
                    return Promise.resolve([]);
                }
            },
            onError: () => {
                // suppress failsafe error handler
            },
        },
        []
    );

    readonly clinicalDataEnrichmentsWithQValues = remoteData<
        ClinicalDataEnrichmentWithQ[]
    >(
        {
            await: () => [this.clinicalDataEnrichments],
            invoke: () => {
                const clinicalDataEnrichments = this.clinicalDataEnrichments
                    .result!;
                const sortedByPvalue = _.sortBy(
                    clinicalDataEnrichments,
                    c => c.pValue
                );
                const qValues = calculateQValues(
                    sortedByPvalue.map(c => c.pValue)
                );
                qValues.forEach((qValue, index) => {
                    (sortedByPvalue[
                        index
                    ] as ClinicalDataEnrichmentWithQ).qValue = qValue;
                });
                return Promise.resolve(
                    sortedByPvalue as ClinicalDataEnrichmentWithQ[]
                );
            },
            onError: () => {
                // suppress failsafe error handler
            },
        },
        []
    );

    readonly activeStudyIdToStudy = remoteData(
        {
            await: () => [this.studies, this.activeStudyIds],
            invoke: () =>
                Promise.resolve(
                    _.keyBy(
                        _.filter(this.studies.result, study =>
                            this.activeStudyIds.result!.includes(study.studyId)
                        ),
                        x => x.studyId
                    )
                ),
        },
        {}
    );

    readonly survivalXAxisLabelGroupByPrefix = remoteData({
        await: () => [
            this.activeStudiesClinicalAttributes,
            this.survivalClinicalAttributesPrefix,
        ],
        invoke: () => {
            const survivalXAxisLabelGroupByPrefix = _.reduce(
                this.survivalClinicalAttributesPrefix.result!,
                (acc, prefix) => {
                    const clinicalAttributeId = `${prefix}_MONTHS`;
                    const clinicalAttributes = _.filter(
                        this.activeStudiesClinicalAttributes.result,
                        attr => attr.clinicalAttributeId === clinicalAttributeId
                    );
                    if (clinicalAttributes.length > 0) {
                        const xLabels = clinicalAttributes.map(
                            attr => attr.displayName
                        );
                        // find the most common text as the label
                        // findFirstMostCommonElt require a sorted array as the input
                        acc[prefix] = findFirstMostCommonElt(xLabels.sort())!;
                    }
                    return acc;
                },
                {} as { [prefix: string]: string }
            );
            return Promise.resolve(survivalXAxisLabelGroupByPrefix);
        },
    });

    readonly survivalDescriptions = remoteData({
        await: () => [
            this.activeStudiesClinicalAttributes,
            this.activeStudyIdToStudy,
            this.survivalClinicalAttributesPrefix,
        ],
        invoke: () => {
            const survivalDescriptions = _.reduce(
                this.survivalClinicalAttributesPrefix.result!,
                (acc, prefix) => {
                    const clinicalAttributeId = `${prefix}_STATUS`;
                    const clinicalAttributes = _.filter(
                        this.activeStudiesClinicalAttributes.result,
                        attr => attr.clinicalAttributeId === clinicalAttributeId
                    );
                    if (clinicalAttributes.length > 0) {
                        clinicalAttributes.map(attr => {
                            if (!acc[prefix]) {
                                acc[prefix] = [];
                            }
                            acc[prefix].push({
                                studyName: this.activeStudyIdToStudy.result[
                                    attr.studyId
                                ].name,
                                description: attr.description,
                                displayName: attr.displayName,
                            } as ISurvivalDescription);
                        });
                    }
                    return acc;
                },
                {} as { [prefix: string]: ISurvivalDescription[] }
            );
            return Promise.resolve(survivalDescriptions);
        },
    });

    @autobind
    public getGroupsDownloadDataPromise() {
        return new Promise<string>(resolve => {
            onMobxPromise<any>(
                [this._originalGroups, this.samples, this.sampleKeyToGroups],
                (
                    groups: ComparisonGroup[],
                    samples: Sample[],
                    sampleKeyToGroups: {
                        [uniqueSampleKey: string]: {
                            [groupUid: string]: boolean;
                        };
                    }
                ) => {
                    resolve(
                        getGroupsDownloadData(
                            samples,
                            groups,
                            sampleKeyToGroups
                        )
                    );
                }
            );
        });
    }

    readonly molecularProfilesInStudies = remoteData<MolecularProfile[]>(
        {
            await: () => [this.studies],
            invoke: () => {
                const studyIds = _.map(
                    this.studies.result,
                    (s: CancerStudy) => s.studyId
                );
                return client.fetchMolecularProfilesUsingPOST({
                    molecularProfileFilter: {
                        studyIds: studyIds,
                    } as MolecularProfileFilter,
                });
            },
        },
        []
    );

    readonly customDriverAnnotationProfiles = remoteData<MolecularProfile[]>(
        {
            await: () => [this.molecularProfilesInStudies],
            invoke: () => {
                return Promise.resolve(
                    _.filter(
                        this.molecularProfilesInStudies.result,
                        (molecularProfile: MolecularProfile) =>
                            // discrete CNA's
                            (molecularProfile.molecularAlterationType ===
                                AlterationTypeConstants.COPY_NUMBER_ALTERATION &&
                                molecularProfile.datatype ===
                                    DataTypeConstants.DISCRETE) ||
                            // mutations
                            molecularProfile.molecularAlterationType ===
                                AlterationTypeConstants.MUTATION_EXTENDED ||
                            // structural variants
                            molecularProfile.molecularAlterationType ===
                                AlterationTypeConstants.STRUCTURAL_VARIANT
                    )
                );
            },
        },
        []
    );

    readonly customDriverAnnotationReport = remoteData<IDriverAnnotationReport>(
        {
            await: () => [this.customDriverAnnotationProfiles],
            invoke: async () => {
                const molecularProfileIds = _.map(
                    this.customDriverAnnotationProfiles.result,
                    (p: MolecularProfile) => p.molecularProfileId
                );
                const report = await internalClient.fetchAlterationDriverAnnotationReportUsingPOST(
                    {
                        molecularProfileIds,
                    }
                );
                return {
                    ...report,
                    hasCustomDriverAnnotations:
                        report.hasBinary || report.tiers.length > 0,
                };
            },
            onResult: result => {
                initializeCustomDriverAnnotationSettings(
                    result!,
                    this.driverAnnotationSettings,
                    this.driverAnnotationSettings.customTiersDefault
                );
            },
            default: {
                hasBinary: false,
                tiers: [],
            },
        }
    );

    readonly allStudies = remoteData(
        {
            invoke: async () =>
                await client.getAllStudiesUsingGET({
                    projection: REQUEST_ARG_ENUM.PROJECTION_SUMMARY,
                }),
        },
        []
    );

    readonly _filteredAndAnnotatedStructuralVariantsReport = remoteData({
        await: () => [
            this.structuralVariants,
            this.getStructuralVariantPutativeDriverInfo,
        ],
        invoke: () => {
            return Promise.resolve(
                filterAndAnnotateStructuralVariants(
                    this.structuralVariants.result!,
                    this.getStructuralVariantPutativeDriverInfo.result!
                )
            );
        },
    });

    readonly oncoKbAnnotatedGenes = remoteData(
        {
            await: () => [this.oncoKbCancerGenes],
            invoke: () => {
                if (getServerConfig().show_oncokb) {
                    return Promise.resolve(
                        _.reduce(
                            this.oncoKbCancerGenes.result,
                            (
                                map: { [entrezGeneId: number]: boolean },
                                next: CancerGene
                            ) => {
                                if (next.oncokbAnnotated) {
                                    map[next.entrezGeneId] = true;
                                }
                                return map;
                            },
                            {}
                        )
                    );
                } else {
                    return Promise.resolve({});
                }
            },
        },
        {}
    );

    readonly structuralVariantOncoKbDataForOncoprint = remoteData<
        IOncoKbData | Error
    >(
        {
            await: () => [this.structuralVariants, this.oncoKbAnnotatedGenes],
            invoke: async () => {
                if (getServerConfig().show_oncokb) {
                    let result;
                    try {
                        result = await fetchStructuralVariantOncoKbData(
                            {},
                            this.oncoKbAnnotatedGenes.result!,
                            this.structuralVariants
                        );
                    } catch (e) {
                        result = new Error();
                    }
                    return result;
                } else {
                    return ONCOKB_DEFAULT;
                }
            },
            onError: (err: Error) => {
                // fail silently, leave the error handling responsibility to the data consumer
            },
        },
        ONCOKB_DEFAULT
    );

    readonly oncoKbStructuralVariantAnnotationForOncoprint = remoteData<
        | Error
        | ((
              structuralVariant: StructuralVariant
          ) => IndicatorQueryResp | undefined)
    >({
        await: () => [this.structuralVariantOncoKbDataForOncoprint],
        invoke: () => {
            const structuralVariantOncoKbDataForOncoprint = this
                .structuralVariantOncoKbDataForOncoprint.result!;
            if (structuralVariantOncoKbDataForOncoprint instanceof Error) {
                return Promise.resolve(new Error());
            } else {
                return Promise.resolve(
                    (structuralVariant: StructuralVariant) => {
                        const id = generateQueryStructuralVariantId(
                            structuralVariant.site1EntrezGeneId,
                            structuralVariant.site2EntrezGeneId,
                            cancerTypeForOncoKb(
                                structuralVariant.uniqueSampleKey,
                                {}
                            ),
                            structuralVariant.variantClass.toUpperCase() as any
                        );
                        return structuralVariantOncoKbDataForOncoprint.indicatorMap![
                            id
                        ];
                    }
                );
            }
        },
    });

    readonly getStructuralVariantPutativeDriverInfo = remoteData({
        await: () => {
            const toAwait = [];
            if (this.driverAnnotationSettings.oncoKb) {
                toAwait.push(
                    this.oncoKbStructuralVariantAnnotationForOncoprint
                );
            }
            return toAwait;
        },
        invoke: () => {
            return Promise.resolve((structualVariant: StructuralVariant): {
                oncoKb: string;
                hotspots: boolean;
                cbioportalCount: boolean;
                cosmicCount: boolean;
                customDriverBinary: boolean;
                customDriverTier?: string;
            } => {
                const getOncoKbStructuralVariantAnnotationForOncoprint = this
                    .oncoKbStructuralVariantAnnotationForOncoprint.result!;
                const oncoKbDatum:
                    | IndicatorQueryResp
                    | undefined
                    | null
                    | false =
                    this.driverAnnotationSettings.oncoKb &&
                    getOncoKbStructuralVariantAnnotationForOncoprint &&
                    !(
                        getOncoKbStructuralVariantAnnotationForOncoprint instanceof
                        Error
                    ) &&
                    getOncoKbStructuralVariantAnnotationForOncoprint(
                        structualVariant
                    );

                let oncoKb: string = '';
                if (oncoKbDatum) {
                    oncoKb = getOncoKbOncogenic(oncoKbDatum);
                }
                return {
                    oncoKb,
                    hotspots: false,
                    cbioportalCount: false,
                    cosmicCount: false,
                    customDriverBinary: false,
                    customDriverTier: undefined,
                };
            });
        },
    });

    readonly studyToStructuralVariantMolecularProfile = remoteData<{
        [studyId: string]: MolecularProfile;
    }>(
        {
            await: () => [this.structuralVariantProfiles],
            invoke: () => {
                return Promise.resolve(
                    _.keyBy(
                        this.structuralVariantProfiles.result,
                        (profile: MolecularProfile) => profile.studyId
                    )
                );
            },
        },
        {}
    );

    readonly structuralVariants = remoteData<StructuralVariant[]>({
        await: () => [
            this.genes,
            this.samples,
            this.studyToStructuralVariantMolecularProfile,
        ],
        invoke: async () => {
            if (
                _.isEmpty(this.studyToStructuralVariantMolecularProfile.result)
            ) {
                return [];
            }
            const studyIdToProfileMap = this
                .studyToStructuralVariantMolecularProfile.result;
            if (typeof this.samples.result === 'undefined')
                throw new Error('Failed to get studies');
            const filters = this.samples.result.reduce(
                (memo, sample: Sample) => {
                    if (sample.studyId in studyIdToProfileMap) {
                        memo.push({
                            molecularProfileId:
                                studyIdToProfileMap[sample.studyId]
                                    .molecularProfileId,
                            sampleId: sample.sampleId,
                        });
                    }
                    return memo;
                },
                [] as StructuralVariantFilter['sampleMolecularIdentifiers']
            );
            // filters can be an empty list
            // when all selected samples are coming from studies that don't have structural variant profile
            // in this case, we should not fetch structural variants data
            if (_.isEmpty(filters)) {
                return [];
            } else {
                const data = {
                    entrezGeneIds: _.map(
                        this.genes.result,
                        (gene: Gene) => gene.entrezGeneId
                    ),
                    sampleMolecularIdentifiers: filters,
                } as StructuralVariantFilter;

                return await internalClient.fetchStructuralVariantsUsingPOST({
                    structuralVariantFilter: data,
                });
            }
        },
    });

    readonly entrezGeneIdToGeneAll = remoteData<{
        [entrezGeneId: string]: Gene;
    }>({
        await: () => [this.allGenes],
        invoke: () => {
            // build reference gene map
            return Promise.resolve(
                _.keyBy(this.allGenes.result!, g => g.entrezGeneId)
            );
        },
    });

    readonly allGenes = remoteData<Gene[]>({
        invoke: () => {
            return getAllGenes();
        },
    });

    readonly structuralVariantsReportByGene = remoteData<{
        [hugeGeneSymbol: string]: FilteredAndAnnotatedStructuralVariantsReport;
    }>({
        await: () => [
            this._filteredAndAnnotatedStructuralVariantsReport,
            this.genes,
        ],
        invoke: () => {
            let structuralVariantsGroups = this
                ._filteredAndAnnotatedStructuralVariantsReport.result!;
            const ret: {
                [hugoGeneSymbol: string]: FilteredAndAnnotatedStructuralVariantsReport;
            } = {};
            for (const gene of this.genes.result!) {
                ret[gene.hugoGeneSymbol] = {
                    data: [],
                    vus: [],
                    germline: [],
                    vusAndGermline: [],
                };
            }
            for (const structuralVariant of structuralVariantsGroups.data) {
                ret[structuralVariant.site1HugoSymbol].data.push(
                    structuralVariant
                );
            }
            for (const structuralVariant of structuralVariantsGroups.vus) {
                ret[structuralVariant.site1HugoSymbol].vus.push(
                    structuralVariant
                );
            }
            for (const structuralVariant of structuralVariantsGroups.germline) {
                ret[structuralVariant.site1HugoSymbol].germline.push(
                    structuralVariant
                );
            }
            for (const structuralVariant of structuralVariantsGroups.vusAndGermline) {
                ret[structuralVariant.site1HugoSymbol].vusAndGermline.push(
                    structuralVariant
                );
            }
            return Promise.resolve(ret);
        },
    });

    readonly filteredSampleKeyToSample = remoteData({
        await: () => [this.filteredSamples],
        invoke: () =>
            Promise.resolve(
                _.keyBy(this.filteredSamples.result!, s => s.uniqueSampleKey)
            ),
    });

    @computed get oqlText() {
        return this.urlWrapper1.query.gene_list;
    }

    readonly entrezGeneIdToGene = remoteData<{ [entrezGeneId: number]: Gene }>({
        await: () => [this.genes],
        invoke: () =>
            Promise.resolve(
                _.keyBy(this.genes.result!, gene => gene.entrezGeneId)
            ),
    });

    readonly _filteredAndAnnotatedMutationsReport = remoteData({
        await: () => [
            this.mutations,
            this.getMutationPutativeDriverInfo,
            this.entrezGeneIdToGene,
        ],
        invoke: () => {
            return Promise.resolve(
                filterAndAnnotateMutations(
                    this.mutations.result!,
                    this.getMutationPutativeDriverInfo.result!,
                    this.entrezGeneIdToGene.result!
                )
            );
        },
    });

    readonly oncoKbDataForOncoprint = remoteData<IOncoKbData | Error>(
        {
            await: () => [this.mutations, this.oncoKbAnnotatedGenes],
            invoke: async () =>
                fetchOncoKbDataForOncoprint(
                    this.oncoKbAnnotatedGenes,
                    this.mutations
                ),
            onError: (err: Error) => {
                // fail silently, leave the error handling responsibility to the data consumer
            },
        },
        ONCOKB_DEFAULT
    );

    readonly oncoKbMutationAnnotationForOncoprint = remoteData<
        Error | ((mutation: Mutation) => IndicatorQueryResp | undefined)
    >({
        await: () => [this.oncoKbDataForOncoprint],
        invoke: () =>
            makeGetOncoKbMutationAnnotationForOncoprint(
                this.oncoKbDataForOncoprint
            ),
    });

    public readonly isHotspotForOncoprint = remoteData<
        ((m: Mutation) => boolean) | Error
    >({
        invoke: () => makeIsHotspotForOncoprint(this.indexedHotspotData),
    });

    readonly getCBioportalCount: MobxPromise<
        (mutation: Mutation) => number
    > = remoteData({
        await: () => [this.cbioportalMutationCountData],
        invoke: () => {
            return Promise.resolve((mutation: Mutation): number => {
                const key = mutationCountByPositionKey(mutation);
                return this.cbioportalMutationCountData.result![key] || -1;
            });
        },
    });

    readonly cbioportalMutationCountData = remoteData<{
        [mutationCountByPositionKey: string]: number;
    }>({
        await: () => [this.mutations],
        invoke: async () => {
            const mutationPositionIdentifiers = _.values(
                countMutations(this.mutations.result!)
            );

            if (mutationPositionIdentifiers.length > 0) {
                const data = await internalClient.fetchMutationCountsByPositionUsingPOST(
                    {
                        mutationPositionIdentifiers,
                    }
                );
                return _.mapValues(
                    _.groupBy(data, mutationCountByPositionKey),
                    (counts: MutationCountByPosition[]) =>
                        _.sumBy(counts, c => c.count)
                );
            } else {
                return {};
            }
        },
    });

    readonly cosmicCountsByKeywordAndStart = remoteData<ComplexKeyCounter>({
        await: () => [this.mutations],
        invoke: async () => {
            const keywords = _.uniq(
                this.mutations
                    .result!.filter((m: Mutation) => {
                        // keyword is what we use to query COSMIC count with, so we need
                        //  the unique list of mutation keywords to query. If a mutation has
                        //  no keyword, it cannot be queried for.
                        return !!m.keyword;
                    })
                    .map((m: Mutation) => m.keyword)
            );

            if (keywords.length > 0) {
                const data = await internalClient.fetchCosmicCountsUsingPOST({
                    keywords,
                });
                const map = new ComplexKeyCounter();
                for (const d of data) {
                    const position = getProteinPositionFromProteinChange(
                        d.proteinChange
                    );
                    if (position) {
                        map.add(
                            {
                                keyword: d.keyword,
                                start: position.start,
                            },
                            d.count
                        );
                    }
                }
                return map;
            } else {
                return new ComplexKeyCounter();
            }
        },
    });

    readonly getCosmicCount: MobxPromise<
        (mutation: Mutation) => number
    > = remoteData({
        await: () => [this.cosmicCountsByKeywordAndStart],
        invoke: () => {
            return Promise.resolve((mutation: Mutation): number => {
                const targetPosObj = getProteinPositionFromProteinChange(
                    mutation.proteinChange
                );
                if (targetPosObj) {
                    const keyword = mutation.keyword;
                    const cosmicCount = this.cosmicCountsByKeywordAndStart.result!.get(
                        {
                            keyword,
                            start: targetPosObj.start,
                        }
                    );
                    return cosmicCount;
                } else {
                    return -1;
                }
            });
        },
    });

    readonly getMutationPutativeDriverInfo = remoteData({
        await: () => {
            const toAwait = [];
            if (this.driverAnnotationSettings.oncoKb) {
                toAwait.push(this.oncoKbMutationAnnotationForOncoprint);
            }
            if (this.driverAnnotationSettings.hotspots) {
                toAwait.push(this.isHotspotForOncoprint);
            }
            if (this.driverAnnotationSettings.cbioportalCount) {
                toAwait.push(this.getCBioportalCount);
            }
            if (this.driverAnnotationSettings.cosmicCount) {
                toAwait.push(this.getCosmicCount);
            }
            return toAwait;
        },
        invoke: () => {
            return Promise.resolve((mutation: Mutation): {
                oncoKb: string;
                hotspots: boolean;
                cbioportalCount: boolean;
                cosmicCount: boolean;
                customDriverBinary: boolean;
                customDriverTier?: string;
            } => {
                const getOncoKbMutationAnnotationForOncoprint = this
                    .oncoKbMutationAnnotationForOncoprint.result!;
                const oncoKbDatum:
                    | IndicatorQueryResp
                    | undefined
                    | null
                    | false =
                    this.driverAnnotationSettings.oncoKb &&
                    getOncoKbMutationAnnotationForOncoprint &&
                    !(
                        getOncoKbMutationAnnotationForOncoprint instanceof Error
                    ) &&
                    getOncoKbMutationAnnotationForOncoprint(mutation);

                const isHotspotDriver =
                    this.driverAnnotationSettings.hotspots &&
                    !(this.isHotspotForOncoprint.result instanceof Error) &&
                    this.isHotspotForOncoprint.result!(mutation);
                const cbioportalCountExceeded =
                    this.driverAnnotationSettings.cbioportalCount &&
                    this.getCBioportalCount.isComplete &&
                    this.getCBioportalCount.result!(mutation) >=
                        this.driverAnnotationSettings.cbioportalCountThreshold;
                const cosmicCountExceeded =
                    this.driverAnnotationSettings.cosmicCount &&
                    this.getCosmicCount.isComplete &&
                    this.getCosmicCount.result!(mutation) >=
                        this.driverAnnotationSettings.cosmicCountThreshold;

                // Note: custom driver annotations are part of the incoming datum
                return evaluateMutationPutativeDriverInfo(
                    mutation,
                    oncoKbDatum,
                    this.driverAnnotationSettings.hotspots,
                    isHotspotDriver,
                    this.driverAnnotationSettings.cbioportalCount,
                    cbioportalCountExceeded,
                    this.driverAnnotationSettings.cosmicCount,
                    cosmicCountExceeded,
                    this.driverAnnotationSettings.customBinary,
                    this.driverAnnotationSettings.driverTiers
                );
            });
        },
    });

    readonly mutationsReportByGene = remoteData<{
        [hugeGeneSymbol: string]: FilteredAndAnnotatedMutationsReport;
    }>({
        await: () => [this._filteredAndAnnotatedMutationsReport, this.genes],
        invoke: () => {
            let mutationGroups: FilteredAndAnnotatedMutationsReport = this
                ._filteredAndAnnotatedMutationsReport.result!;
            const ret: {
                [hugoGeneSymbol: string]: FilteredAndAnnotatedMutationsReport;
            } = {};
            for (const gene of this.genes.result!) {
                ret[gene.hugoGeneSymbol] = {
                    data: [],
                    vus: [],
                    germline: [],
                    vusAndGermline: [],
                };
            }
            for (const mutation of mutationGroups.data) {
                ret[mutation.gene.hugoGeneSymbol].data.push(mutation);
            }
            for (const mutation of mutationGroups.vus) {
                ret[mutation.gene.hugoGeneSymbol].vus.push(mutation);
            }
            for (const mutation of mutationGroups.germline) {
                ret[mutation.gene.hugoGeneSymbol].germline.push(mutation);
            }
            for (const mutation of mutationGroups.vusAndGermline) {
                ret[mutation.gene.hugoGeneSymbol].vusAndGermline.push(mutation);
            }
            return Promise.resolve(ret);
        },
    });

    readonly mutationProfiles = remoteData({
        await: () => [this.selectedMolecularProfiles],
        invoke: async () => {
            return this.selectedMolecularProfiles.result!.filter(
                profile =>
                    profile.molecularAlterationType ===
                    AlterationTypeConstants.MUTATION_EXTENDED
            );
        },
        onError: error => {},
        default: [],
    });

    readonly mutations_preload = remoteData<Mutation[]>({
        // fetch all mutation data for profiles
        // We do it this way - fetch all data for profiles, then filter based on samples -
        //  because
        //  (1) this means sending less data as parameters
        //  (2) this means the requests can be cached on the server based on the molecular profile id
        //  (3) We can initiate the mutations call before the samples call completes, thus
        //      putting more response waiting time in parallel
        await: () => [this.genes, this.mutationProfiles],
        invoke: () => {
            if (
                this.genes.result!.length === 0 ||
                this.mutationProfiles.result!.length === 0
            ) {
                return Promise.resolve([]);
            }

            return client.fetchMutationsInMultipleMolecularProfilesUsingPOST({
                projection: REQUEST_ARG_ENUM.PROJECTION_DETAILED,
                mutationMultipleStudyFilter: {
                    entrezGeneIds: this.genes.result!.map(g => g.entrezGeneId),
                    molecularProfileIds: this.mutationProfiles.result!.map(
                        p => p.molecularProfileId
                    ),
                } as MutationMultipleStudyFilter,
            });
        },
    });

    readonly defaultOQLQuery = remoteData({
        await: () => [this.selectedMolecularProfiles],
        invoke: () => {
            const profileTypes = _.uniq(
                _.map(
                    this.selectedMolecularProfiles.result,
                    profile => profile.molecularAlterationType
                )
            );
            return Promise.resolve(
                buildDefaultOQLProfile(
                    profileTypes,
                    this.zScoreThreshold,
                    this.rppaScoreThreshold
                )
            );
        },
    });

    @computed
    get rppaScoreThreshold() {
        return this.urlWrapper1.query.RPPA_SCORE_THRESHOLD
            ? parseFloat(this.urlWrapper1.query.RPPA_SCORE_THRESHOLD)
            : DEFAULT_RPPA_THRESHOLD;
    }

    @computed get zScoreThreshold() {
        return this.urlWrapper1.query.Z_SCORE_THRESHOLD
            ? parseFloat(this.urlWrapper1.query.Z_SCORE_THRESHOLD)
            : DEFAULT_Z_SCORE_THRESHOLD;
    }

    @computed get genomeNexusInternalClient() {
        return new GenomeNexusAPIInternal(this.referenceGenomeBuild);
    }

    @computed get sampleListCategory(): SampleListCategoryType | undefined {
        if (
            this.urlWrapper1.query.case_set_id &&
            [
                SampleListCategoryType.w_mut,
                SampleListCategoryType.w_cna,
                SampleListCategoryType.w_mut_cna,
            ].includes(this.urlWrapper1.query.case_set_id as any)
        ) {
            return this.urlWrapper1.query.case_set_id as SampleListCategoryType;
        } else {
            return undefined;
        }
    }

    @computed get samplesSpecificationParams() {
        return parseSamplesSpecifications(
            this.urlWrapper1.query.case_ids,
            this.urlWrapper1.query.sample_list_ids,
            this.urlWrapper1.query.case_set_id,
            this.cancerStudyIds
        );
    }

    readonly samplesSpecification = remoteData({
        await: () => [this.queriedVirtualStudies],
        invoke: async () => {
            // is this a sample list category query?
            // if YES, we need to derive the sample lists by:
            // 1. looking up all sample lists in selected studies
            // 2. using those with matching category
            if (!this.sampleListCategory) {
                if (this.queriedVirtualStudies.result!.length > 0) {
                    return populateSampleSpecificationsFromVirtualStudies(
                        this.samplesSpecificationParams,
                        this.queriedVirtualStudies.result!
                    );
                } else {
                    return this.samplesSpecificationParams;
                }
            } else {
                // would be nice to have an endpoint that would return multiple sample lists
                // but this will only ever happen one for each study selected (and in queries where a sample list is specified)
                let samplesSpecifications = [];
                // get sample specifications from physical studies if we are querying virtual study
                if (this.queriedVirtualStudies.result!.length > 0) {
                    samplesSpecifications = populateSampleSpecificationsFromVirtualStudies(
                        this.samplesSpecificationParams,
                        this.queriedVirtualStudies.result!
                    );
                } else {
                    samplesSpecifications = this.samplesSpecificationParams;
                }
                // get unique study ids to reduce the API requests
                const uniqueStudyIds = _.chain(samplesSpecifications)
                    .map(specification => specification.studyId)
                    .uniq()
                    .value();
                const allSampleLists = await Promise.all(
                    uniqueStudyIds.map(studyId => {
                        return client.getAllSampleListsInStudyUsingGET({
                            studyId: studyId,
                            projection: REQUEST_ARG_ENUM.PROJECTION_SUMMARY,
                        });
                    })
                );

                const category =
                    SampleListCategoryTypeToFullId[this.sampleListCategory!];
                const specs = allSampleLists.reduce(
                    (
                        aggregator: SamplesSpecificationElement[],
                        sampleLists
                    ) => {
                        //find the sample list matching the selected category using the map from shortname to full category name :(
                        const matchingList = _.find(
                            sampleLists,
                            list => list.category === category
                        );
                        if (matchingList) {
                            aggregator.push({
                                studyId: matchingList.studyId,
                                sampleListId: matchingList.sampleListId,
                                sampleId: undefined,
                            } as SamplesSpecificationElement);
                        }
                        return aggregator;
                    },
                    []
                );

                return specs;
            }
        },
    });

    readonly studyToCustomSampleList = remoteData<{
        [studyId: string]: string[];
    }>(
        {
            await: () => [this.samplesSpecification],
            invoke: () => {
                const ret: {
                    [studyId: string]: string[];
                } = {};
                for (const sampleSpec of this.samplesSpecification.result!) {
                    if (sampleSpec.sampleId) {
                        // add sample id to study
                        ret[sampleSpec.studyId] = ret[sampleSpec.studyId] || [];
                        ret[sampleSpec.studyId].push(sampleSpec.sampleId);
                    }
                }
                return Promise.resolve(ret);
            },
        },
        {}
    );

    readonly studyIds = remoteData(
        {
            await: () => [this.queriedVirtualStudies],
            invoke: () => {
                let physicalStudies: string[];
                if (this.queriedVirtualStudies.result!.length > 0) {
                    // we want to replace virtual studies with their underlying physical studies
                    physicalStudies = substitutePhysicalStudiesForVirtualStudies(
                        this.cancerStudyIds,
                        this.queriedVirtualStudies.result!
                    );
                } else {
                    physicalStudies = this.cancerStudyIds.slice();
                }
                return Promise.resolve(physicalStudies);
            },
        },
        []
    );

    readonly studyToDataQueryFilter = remoteData<{
        [studyId: string]: IDataQueryFilter;
    }>(
        {
            await: () => [
                this.studyToCustomSampleList,
                this.studyIds,
                this.studyToSampleListId,
            ],
            invoke: () => {
                const studies = this.studyIds.result!;
                const ret: { [studyId: string]: IDataQueryFilter } = {};
                for (const studyId of studies) {
                    ret[studyId] = generateDataQueryFilter(
                        this.studyToSampleListId.result![studyId],
                        this.studyToCustomSampleList.result![studyId]
                    );
                }
                return Promise.resolve(ret);
            },
        },
        {}
    );

    readonly studyToSampleListId = remoteData<{ [studyId: string]: string }>({
        await: () => [this.samplesSpecification],
        invoke: async () => {
            return this.samplesSpecification.result!.reduce((map, next) => {
                if (next.sampleListId) {
                    map[next.studyId] = next.sampleListId;
                }
                return map;
            }, {} as { [studyId: string]: string });
        },
    });

    readonly samplesWithoutCancerTypeClinicalData = remoteData<Sample[]>(
        {
            await: () => [this.samples, this.clinicalDataForSamples],
            invoke: () => {
                const sampleHasData: { [sampleUid: string]: boolean } = {};
                for (const data of this.clinicalDataForSamples.result) {
                    sampleHasData[
                        toSampleUuid(data.studyId, data.sampleId)
                    ] = true;
                }
                if (typeof this.samples.result === 'undefined')
                    throw new Error('Failed to get studies');
                return Promise.resolve(
                    this.samples.result.filter(sample => {
                        return !sampleHasData[
                            toSampleUuid(sample.studyId, sample.sampleId)
                        ];
                    })
                );
            },
        },
        []
    );

    private getClinicalData(
        clinicalDataType: 'SAMPLE' | 'PATIENT',
        studies: any[],
        entities: any[],
        attributeIds: string[]
    ): Promise<Array<ClinicalData>> {
        // single study query endpoint is optimal so we should use it
        // when there's only one study
        if (studies.length === 1) {
            if (typeof this.studies.result === 'undefined')
                throw new Error('Failed to get studies');
            const study = this.studies.result[0];
            const filter: ClinicalDataSingleStudyFilter = {
                attributeIds: attributeIds,
                ids: _.map(
                    entities,
                    clinicalDataType === 'SAMPLE' ? 'sampleId' : 'patientId'
                ),
            };
            return client.fetchAllClinicalDataInStudyUsingPOST({
                studyId: study.studyId,
                clinicalDataSingleStudyFilter: filter,
                clinicalDataType: clinicalDataType,
            });
        } else {
            const filter: ClinicalDataMultiStudyFilter = {
                attributeIds: attributeIds,
                identifiers: entities.map((s: any) =>
                    clinicalDataType === 'SAMPLE'
                        ? { entityId: s.sampleId, studyId: s.studyId }
                        : { entityId: s.patientId, studyId: s.studyId }
                ),
            };
            return client.fetchClinicalDataUsingPOST({
                clinicalDataType: clinicalDataType,
                clinicalDataMultiStudyFilter: filter,
            });
        }
    }

    readonly clinicalDataForSamples = remoteData<ClinicalData[]>(
        {
            await: () => [this.studies, this.samples],
            invoke: () => {
                if (typeof this.studies.result === 'undefined')
                    throw new Error('Failed to get studies');
                if (typeof this.samples.result === 'undefined')
                    throw new Error('Failed to get studies');
                return this.getClinicalData(
                    REQUEST_ARG_ENUM.CLINICAL_DATA_TYPE_SAMPLE,
                    this.studies.result!,
                    this.samples.result,
                    [
                        CLINICAL_ATTRIBUTE_ID_ENUM.CANCER_TYPE,
                        CLINICAL_ATTRIBUTE_ID_ENUM.CANCER_TYPE_DETAILED,
                    ]
                );
            },
        },
        []
    );

    readonly clinicalAttributeIdToAvailableFrequency = remoteData({
        await: () => [
            this.clinicalAttributeIdToAvailableSampleCount,
            this.samples,
        ],
        invoke: () => {
            const numSamples = this.samples.result!.length;
            return Promise.resolve(
                _.mapValues(
                    this.clinicalAttributeIdToAvailableSampleCount.result!,
                    count => (100 * count) / numSamples
                )
            );
        },
    });

    readonly genePanelDataForAllProfiles = remoteData<GenePanelData[]>({
        // fetch all gene panel data for profiles
        // We do it this way - fetch all data for profiles, then filter based on samples -
        //  because
        //  (1) this means sending less data as parameters
        //  (2) this means the requests can be cached on the server based on the molecular profile id
        //  (3) We can initiate the gene panel data call before the samples call completes, thus
        //      putting more response waiting time in parallel
        await: () => [this.molecularProfilesInStudies],
        invoke: () =>
            client.fetchGenePanelDataInMultipleMolecularProfilesUsingPOST({
                genePanelDataMultipleStudyFilter: {
                    molecularProfileIds: this.molecularProfilesInStudies.result.map(
                        p => p.molecularProfileId
                    ),
                } as GenePanelDataMultipleStudyFilter,
            }),
    });

    readonly coverageInformation = remoteData<CoverageInformation>({
        await: () => [
            this.genePanelDataForAllProfiles,
            this.sampleKeyToSample,
            this.patients,
            this.genes,
        ],
        invoke: () =>
            getCoverageInformation(
                this.genePanelDataForAllProfiles.result!,
                this.sampleKeyToSample.result!,
                this.patients.result!,
                this.genes.result!
            ),
    });

    readonly patients = remoteData({
        await: () => [this.samples],
        invoke: () => fetchPatients(this.samples.result!),
        default: [],
    });

    readonly studyToMolecularProfiles = remoteData({
        await: () => [this.molecularProfilesInStudies],
        invoke: () => {
            return Promise.resolve(
                _.groupBy(
                    this.molecularProfilesInStudies.result!,
                    profile => profile.studyId
                )
            );
        },
    });

    @computed
    get selectedMolecularProfileIds() {
        //use profileFilter when both profileFilter and MolecularProfileIds are present in query
        if (isNaN(parseInt(this.urlWrapper1.query.profileFilter, 10))) {
            return [];
        }
        return getMolecularProfiles(this.urlWrapper1.query);
    }

    @computed get profileFilter() {
        return this.urlWrapper1.query.profileFilter || '0';
    }

    readonly selectedMolecularProfiles = remoteData<MolecularProfile[]>({
        await: () => [
            this.studyToMolecularProfiles,
            this.studies,
            this.molecularProfileIdToMolecularProfile,
        ],
        invoke: () => {
            // if there are multiple studies or if there are no selected molecular profiles in query
            // derive default profiles based on profileFilter (refers to old data priority)
            if (typeof this.studies.result === 'undefined')
                throw new Error('Failed to get studies');
            else if (
                this.studies.result.length > 1 ||
                this.selectedMolecularProfileIds.length === 0
            ) {
                return Promise.resolve(
                    getDefaultMolecularProfiles(
                        this.studyToMolecularProfiles.result!,
                        this.profileFilter
                    )
                );
            } else {
                // if we have only one study, then consult the selectedMolecularProfileIds because
                // user can directly select set
                const idLookupMap = _.keyBy(
                    this.selectedMolecularProfileIds,
                    (id: string) => id
                ); // optimization

                const hasMutationProfileInQuery = _.some(
                    this.selectedMolecularProfileIds,
                    molecularProfileId => {
                        const molecularProfile = this
                            .molecularProfileIdToMolecularProfile.result[
                            molecularProfileId
                        ];
                        return (
                            molecularProfile !== undefined &&
                            molecularProfile.molecularAlterationType ===
                                AlterationTypeConstants.MUTATION_EXTENDED
                        );
                    }
                );

                if (hasMutationProfileInQuery) {
                    const structuralVariantProfile = _.find(
                        this.molecularProfilesInStudies.result!,
                        molecularProfile => {
                            return (
                                molecularProfile.molecularAlterationType ===
                                AlterationTypeConstants.STRUCTURAL_VARIANT
                            );
                        }
                    );
                    if (structuralVariantProfile) {
                        idLookupMap[
                            structuralVariantProfile.molecularProfileId
                        ] = structuralVariantProfile.molecularProfileId;
                    }
                }
                return Promise.resolve(
                    this.molecularProfilesInStudies.result!.filter(
                        (profile: MolecularProfile) =>
                            profile.molecularProfileId in idLookupMap
                    )
                );
            }
        },
    });

    readonly clinicalAttributes_profiledIn = remoteData<
        (ClinicalAttribute & { molecularProfileIds: string[] })[]
    >({
        await: () => [
            this.coverageInformation,
            this.molecularProfileIdToMolecularProfile,
            this.selectedMolecularProfiles,
            this.studyIds,
        ],
        invoke: () => {
            return Promise.resolve(
                makeProfiledInClinicalAttributes(
                    this.coverageInformation.result!.samples,
                    this.molecularProfileIdToMolecularProfile.result!,
                    this.selectedMolecularProfiles.result!,
                    this.studyIds.result!.length === 1
                )
            );
        },
    });

    readonly clinicalAttributes_comparisonGroupMembership = remoteData<
        (ClinicalAttribute & { comparisonGroup: Group1 })[]
    >({
        await: () => [this.savedComparisonGroupsForStudies],
        invoke: () =>
            Promise.resolve(
                makeComparisonGroupClinicalAttributes(
                    this.savedComparisonGroupsForStudies.result!
                )
            ),
    });

    readonly savedComparisonGroupsForStudies = remoteData<Group1[]>({
        await: () => [this.queriedStudies],
        invoke: async () => {
            let ret: Group1[] = [];
            if (this.appStore.isLoggedIn) {
                try {
                    ret = ret.concat(
                        await comparisonClient.getGroupsForStudies(
                            this.queriedStudies.result!.map(x => x.studyId)
                        )
                    );
                } catch (e) {
                    // fail silently
                }
            }
            /* add any groups that are referenced in URL
            for (const id of this.comparisonGroupsReferencedInURL) {
                try {
                    ret.push(await comparisonClient.getGroup(id));
                } catch (e) {
                    // ignore any errors with group ids that don't exist
                }
            }
            */
            return ret;
        },
    });

    public urlWrapper1: ResultsViewURLWrapper;
    /*
    @computed.struct get comparisonGroupsReferencedInURL() {
        // The oncoprint can have tracks which indicate comparison group membership per sample.
        //  We want to know which comparison groups are referenced in these tracks, if any
        //  are currently visible.

        // Start by getting all the selected clinical attribute tracks
        const groupIds = this.urlWrapper1.oncoprintSelectedClinicalTracks
            .filter((clinicalAttributeId: string) =>
                clinicalAttributeIsINCOMPARISONGROUP({
                    clinicalAttributeId,
                })
            ) // filter for comparison group tracks

            .map((clinicalAttributeId: string) =>
                convertComparisonGroupClinicalAttribute(
                    clinicalAttributeId,
                    false
                )
            ); // convert track ids to group ids
        return groupIds;
    }
    */
    readonly clinicalAttributes_customCharts = remoteData({
        await: () => [this.sampleMap],
        invoke: async () => {
            let ret: ExtendedClinicalAttribute[] = [];
            if (this.appStore.isLoggedIn) {
                try {
                    //Add custom data from user profile
                    const customChartSessions = await sessionServiceClient.getCustomDataForStudies(
                        this.cancerStudyIds
                    );

                    ret = getExtendsClinicalAttributesFromCustomData(
                        customChartSessions,
                        this.sampleMap.result!
                    );
                } catch (e) {}
            }
            return ret;
        },
    });

    readonly clinicalAttributes = remoteData<ExtendedClinicalAttribute[]>({
        await: () => [
            this.studyIds,
            this.clinicalAttributes_profiledIn,
            this.clinicalAttributes_comparisonGroupMembership,
            this.clinicalAttributes_customCharts,
            this.samples,
            this.patients,
        ],
        invoke: async () => {
            const serverAttributes = await client.fetchClinicalAttributesUsingPOST(
                {
                    studyIds: this.studyIds.result!,
                }
            );
            const specialAttributes = [
                {
                    clinicalAttributeId: SpecialAttribute.MutationSpectrum,
                    datatype: CLINICAL_ATTRIBUTE_FIELD_ENUM.DATATYPE_COUNTS_MAP,
                    description:
                        'Number of point mutations in the sample counted by different types of nucleotide changes.',
                    displayName: 'Mutation spectrum',
                    patientAttribute: false,
                    studyId: '',
                    priority: '0', // TODO: change?
                } as ClinicalAttribute,
            ];
            if (this.studyIds.result!.length > 1) {
                // if more than one study, add "Study of Origin" attribute
                specialAttributes.push({
                    clinicalAttributeId: SpecialAttribute.StudyOfOrigin,
                    datatype: CLINICAL_ATTRIBUTE_FIELD_ENUM.DATATYPE_STRING,
                    description: 'Study which the sample is a part of.',
                    displayName: 'Study of origin',
                    patientAttribute: false,
                    studyId: '',
                    priority: '0', // TODO: change?
                } as ClinicalAttribute);
            }
            if (this.samples.result!.length !== this.patients.result!.length) {
                // if different number of samples and patients, add "Num Samples of Patient" attribute
                specialAttributes.push({
                    clinicalAttributeId: SpecialAttribute.NumSamplesPerPatient,
                    datatype: CLINICAL_ATTRIBUTE_FIELD_ENUM.DATATYPE_NUMBER,
                    description: 'Number of queried samples for each patient.',
                    displayName: '# Samples per Patient',
                    patientAttribute: true,
                } as ClinicalAttribute);
            }
            return [
                ...serverAttributes,
                ...specialAttributes,
                ...this.clinicalAttributes_profiledIn.result!,
                ...this.clinicalAttributes_comparisonGroupMembership.result!,
                ...this.clinicalAttributes_customCharts.result!,
            ];
        },
    });
    readonly clinicalAttributeIdToAvailableSampleCount = remoteData({
        await: () => [
            this.samples,
            this.sampleMap,
            this.studies,
            this.clinicalAttributes,
            this.studyToDataQueryFilter,
            this.clinicalAttributes_profiledIn,
            this.clinicalAttributes_comparisonGroupMembership,
            this.clinicalAttributes_customCharts,
        ],
        invoke: async () => {
            let clinicalAttributeCountFilter: ClinicalAttributeCountFilter;
            if (typeof this.studies.result === 'undefined')
                throw new Error('Failed to get studies');
            if (this.studies.result.length === 1) {
                // try using sample list id
                const studyId = this.studies.result![0].studyId;
                const dqf = this.studyToDataQueryFilter.result[studyId];
                if (dqf.sampleListId) {
                    clinicalAttributeCountFilter = {
                        sampleListId: dqf.sampleListId,
                    } as ClinicalAttributeCountFilter;
                } else {
                    clinicalAttributeCountFilter = {
                        sampleIdentifiers: dqf.sampleIds!.map(sampleId => ({
                            sampleId,
                            studyId,
                        })),
                    } as ClinicalAttributeCountFilter;
                }
            } else {
                // use sample identifiers
                clinicalAttributeCountFilter = {
                    sampleIdentifiers: this.samples.result!.map(sample => ({
                        sampleId: sample.sampleId,
                        studyId: sample.studyId,
                    })),
                } as ClinicalAttributeCountFilter;
            }

            const result = await internalClient.getClinicalAttributeCountsUsingPOST(
                {
                    clinicalAttributeCountFilter,
                }
            );
            // build map
            const ret: { [clinicalAttributeId: string]: number } = _.reduce(
                result,
                (
                    map: { [clinicalAttributeId: string]: number },
                    next: ClinicalAttributeCount
                ) => {
                    map[next.clinicalAttributeId] =
                        map[next.clinicalAttributeId] || 0;
                    map[next.clinicalAttributeId] += next.count;
                    return map;
                },
                {}
            );
            // add count = 0 for any remaining clinical attributes, since service doesnt return count 0
            for (const clinicalAttribute of this.clinicalAttributes.result!) {
                if (!(clinicalAttribute.clinicalAttributeId in ret)) {
                    ret[clinicalAttribute.clinicalAttributeId] = 0;
                }
            }
            // add counts for "special" clinical attributes
            ret[
                SpecialAttribute.NumSamplesPerPatient
            ] = this.samples.result!.length;
            ret[SpecialAttribute.StudyOfOrigin] = this.samples.result!.length;
            let samplesWithMutationData = 0,
                samplesWithCNAData = 0;
            for (const sample of this.samples.result!) {
                samplesWithMutationData += +!!sample.sequenced;
                samplesWithCNAData += +!!sample.copyNumberSegmentPresent;
            }
            ret[SpecialAttribute.MutationSpectrum] = samplesWithMutationData;
            // add counts for "ProfiledIn" clinical attributes
            for (const attr of this.clinicalAttributes_profiledIn.result!) {
                ret[attr.clinicalAttributeId] = this.samples.result!.length;
            }
            // add counts for "ComparisonGroup" clinical attributes
            const sampleMap = this.sampleMap.result!;
            for (const attr of this.clinicalAttributes_comparisonGroupMembership
                .result!) {
                ret[attr.clinicalAttributeId] = getNumSamples(
                    attr.comparisonGroup!.data,
                    (studyId, sampleId) => {
                        return sampleMap.has({ studyId, sampleId });
                    }
                );
            }
            // add counts for custom chart clinical attributes
            for (const attr of this.clinicalAttributes_customCharts.result!) {
                ret[attr.clinicalAttributeId] = attr.data!.filter(
                    d => d.value !== 'NA'
                ).length;
            }
            return ret;
        },
    });

    readonly mutationsTabClinicalAttributes = remoteData<ClinicalAttribute[]>({
        await: () => [this.studyIds],
        invoke: async () => {
            const clinicalAttributes = await client.fetchClinicalAttributesUsingPOST(
                {
                    studyIds: this.studyIds.result!,
                }
            );
            const excludeList = ['CANCER_TYPE_DETAILED', 'MUTATION_COUNT'];

            return _.uniqBy(
                clinicalAttributes.filter(
                    x => !excludeList.includes(x.clinicalAttributeId)
                ),
                x => x.clinicalAttributeId
            );
        },
    });

    readonly ascnClinicalDataForSamples = remoteData<ClinicalData[]>(
        {
            await: () => [this.studies, this.samples],
            invoke: () =>
                this.getClinicalData(
                    REQUEST_ARG_ENUM.CLINICAL_DATA_TYPE_SAMPLE,
                    this.studies.result!,
                    this.samples.result!,
                    [
                        CLINICAL_ATTRIBUTE_ID_ENUM.ASCN_WGD,
                        CLINICAL_ATTRIBUTE_ID_ENUM.ASCN_PURITY,
                    ]
                ),
        },
        []
    );

    readonly ascnClinicalDataGroupedBySample = remoteData(
        {
            await: () => [this.ascnClinicalDataForSamples],
            invoke: async () =>
                groupBySampleId(
                    this.sampleIds,
                    this.ascnClinicalDataForSamples.result
                ),
        },
        []
    );

    @computed get sampleIds(): string[] {
        if (this.samples.result) {
            return this.samples.result.map(sample => sample.sampleId);
        }
        return [];
    }

    readonly clinicalDataGroupedBySampleMap = remoteData(
        {
            await: () => [this.ascnClinicalDataGroupedBySample],
            invoke: async () =>
                mapSampleIdToClinicalData(
                    this.ascnClinicalDataGroupedBySample.result
                ),
        },
        {}
    );

    readonly hotspotData = remoteData({
        await: () => [this.mutations],
        invoke: () => {
            return fetchHotspotsData(
                this.mutations,
                undefined,
                this.genomeNexusInternalClient
            );
        },
    });

    readonly indexedHotspotData = remoteData<IHotspotIndex | undefined>({
        await: () => [this.hotspotData],
        invoke: () => Promise.resolve(indexHotspotsData(this.hotspotData)),
    });

    readonly germlineConsentedSamples = remoteData<SampleIdentifier[]>(
        {
            await: () => [this.studyIds, this.sampleMap],
            invoke: async () => {
                const germlineConsentedSamples: SampleIdentifier[] = await fetchGermlineConsentedSamples(
                    this.studyIds,
                    getServerConfig().studiesWithGermlineConsentedSamples
                );

                // do not simply return all germline consented samples,
                // only include the ones matching current sample selection
                const sampleMap = this.sampleMap.result!;
                return germlineConsentedSamples.filter(s =>
                    sampleMap.has(s, ['sampleId', 'studyId'])
                );
            },
            onError: () => {
                // fail silently
            },
        },
        []
    );

    readonly studiesForSamplesWithoutCancerTypeClinicalData = remoteData(
        {
            await: () => [this.samplesWithoutCancerTypeClinicalData],
            invoke: async () =>
                fetchStudiesForSamplesWithoutCancerTypeClinicalData(
                    this.samplesWithoutCancerTypeClinicalData
                ),
        },
        []
    );

    readonly virtualStudyParams = remoteData<IVirtualStudyProps>({
        await: () => [
            this.samples,
            this.studyIds,
            this.studyWithSamples,
            this.queriedVirtualStudies,
        ],
        invoke: () =>
            Promise.resolve({
                user: this.appStore.userName,
                name:
                    this.queriedVirtualStudies.result.length === 1
                        ? this.queriedVirtualStudies.result[0].data.name
                        : undefined,
                description:
                    this.queriedVirtualStudies.result.length === 1
                        ? this.queriedVirtualStudies.result[0].data.description
                        : undefined,
                studyWithSamples: this.studyWithSamples.result,
                selectedSamples: this.samples.result,
                filter: { studyIds: this.studyIds.result },
                attributesMetaSet: this.chartMetaSet,
            } as IVirtualStudyProps),
    });

    @computed
    get chartMetaSet(): { [id: string]: ChartMeta } {
        let _chartMetaSet: { [id: string]: ChartMeta } = {} as {
            [id: string]: ChartMeta;
        };

        // Add meta information for each of the clinical attribute
        // Convert to a Set for easy access and to update attribute meta information(would be useful while adding new features)
        _.reduce(
            this.clinicalAttributes.result,
            (acc: { [id: string]: ChartMeta }, attribute) => {
                const uniqueKey = getUniqueKey(attribute);
                acc[uniqueKey] = {
                    displayName: attribute.displayName,
                    uniqueKey: uniqueKey,
                    dataType: getChartMetaDataType(uniqueKey),
                    patientAttribute: attribute.patientAttribute,
                    description: attribute.description,
                    priority: getPriorityByClinicalAttribute(attribute),
                    renderWhenDataChange: false,
                    clinicalAttribute: attribute,
                };
                return acc;
            },
            _chartMetaSet
        );

        if (!_.isEmpty(this.mutationProfiles.result!)) {
            const uniqueKey = getUniqueKeyFromMolecularProfileIds(
                this.mutationProfiles.result.map(
                    profile => profile.molecularProfileId
                )
            );
            _chartMetaSet[uniqueKey] = {
                uniqueKey: uniqueKey,
                dataType: ChartMetaDataTypeEnum.GENOMIC,
                patientAttribute: false,
                displayName: 'Mutated Genes',
                priority: getDefaultPriorityByUniqueKey(
                    ChartTypeEnum.MUTATED_GENES_TABLE
                ),
                renderWhenDataChange: false,
                description: '',
            };
        }

        if (!_.isEmpty(this.cnaProfiles.result)) {
            const uniqueKey = getUniqueKeyFromMolecularProfileIds(
                this.cnaProfiles.result.map(
                    profile => profile.molecularProfileId
                )
            );
            _chartMetaSet[uniqueKey] = {
                uniqueKey: uniqueKey,
                dataType: ChartMetaDataTypeEnum.GENOMIC,
                patientAttribute: false,
                displayName: 'CNA Genes',
                renderWhenDataChange: false,
                priority: getDefaultPriorityByUniqueKey(
                    ChartTypeEnum.CNA_GENES_TABLE
                ),
                description: '',
            };
        }

        const scatterRequiredParams = _.reduce(
            this.clinicalAttributes.result,
            (acc, next) => {
                if (
                    SpecialChartsUniqueKeyEnum.MUTATION_COUNT ===
                    next.clinicalAttributeId
                ) {
                    acc[SpecialChartsUniqueKeyEnum.MUTATION_COUNT] = true;
                }
                if (
                    SpecialChartsUniqueKeyEnum.FRACTION_GENOME_ALTERED ===
                    next.clinicalAttributeId
                ) {
                    acc[
                        SpecialChartsUniqueKeyEnum.FRACTION_GENOME_ALTERED
                    ] = true;
                }
                return acc;
            },
            {
                [SpecialChartsUniqueKeyEnum.MUTATION_COUNT]: false,
                [SpecialChartsUniqueKeyEnum.FRACTION_GENOME_ALTERED]: false,
            }
        );

        if (
            scatterRequiredParams[SpecialChartsUniqueKeyEnum.MUTATION_COUNT] &&
            scatterRequiredParams[
                SpecialChartsUniqueKeyEnum.FRACTION_GENOME_ALTERED
            ]
        ) {
            _chartMetaSet[FGA_VS_MUTATION_COUNT_KEY] = {
                dataType: ChartMetaDataTypeEnum.GENOMIC,
                patientAttribute: false,
                uniqueKey: FGA_VS_MUTATION_COUNT_KEY,
                displayName: 'Mutation Count vs Fraction of Genome Altered',
                priority: getDefaultPriorityByUniqueKey(
                    FGA_VS_MUTATION_COUNT_KEY
                ),
                renderWhenDataChange: false,
                description: '',
            };
        }
        return _chartMetaSet;
    }

    readonly cnaProfiles = remoteData({
        await: () => [this.selectedMolecularProfiles],
        invoke: async () => {
            return this.selectedMolecularProfiles.result!.filter(
                profile =>
                    profile.molecularAlterationType ===
                        AlterationTypeConstants.COPY_NUMBER_ALTERATION &&
                    profile.datatype === DataTypeConstants.DISCRETE
            );
        },
        onError: error => {},
        default: [],
    });

    // used in building virtual study
    readonly studyWithSamples = remoteData<StudyWithSamples[]>({
        await: () => [
            this.samples,
            this.queriedStudies,
            this.queriedVirtualStudies,
        ],
        invoke: () => {
            if (typeof this.samples.result === 'undefined')
                throw new Error('Failed to get studies');
            return Promise.resolve(
                getFilteredStudiesWithSamples(
                    this.samples.result,
                    this.queriedStudies.result,
                    this.queriedVirtualStudies.result
                )
            );
        },
        onError: error => {},
        default: [],
    });

    @computed get showDriverAnnotationMenuSection() {
        return !!(
            this.customDriverAnnotationReport.isComplete &&
            this.customDriverAnnotationReport.result!.hasBinary &&
            getServerConfig()
                .oncoprint_custom_driver_annotation_binary_menu_label &&
            getServerConfig()
                .oncoprint_custom_driver_annotation_tiers_menu_label
        );
    }

    @computed get showDriverTierAnnotationMenuSection() {
        return !!(
            this.customDriverAnnotationReport.isComplete &&
            this.customDriverAnnotationReport.result!.tiers.length > 0 &&
            getServerConfig()
                .oncoprint_custom_driver_annotation_binary_menu_label &&
            getServerConfig()
                .oncoprint_custom_driver_annotation_tiers_menu_label
        );
    }

    @computed get selectedDriverTiers() {
        return this.allDriverTiers.filter(tier =>
            this.driverAnnotationSettings.driverTiers.get(tier)
        );
    }

    @computed get allDriverTiers() {
        return this.customDriverAnnotationReport.isComplete
            ? this.customDriverAnnotationReport.result!.tiers
            : [];
    }

    @computed get selectedDriverTiersMap() {
        return buildSelectedDriverTiersMap(
            this.selectedDriverTiers || [],
            this.customDriverAnnotationReport.result!.tiers
        );
    }

    @computed get hasMutationEnrichmentData(): boolean {
        return (
            this.mutationEnrichmentProfiles.isComplete &&
            this.mutationEnrichmentProfiles.result!.length > 0
        );
    }

    @computed get hasCnaEnrichmentData(): boolean {
        return (
            this.copyNumberEnrichmentProfiles.isComplete &&
            this.copyNumberEnrichmentProfiles.result!.length > 0
        );
    }

    @computed get hasStructuralVariantData(): boolean {
        return (
            this.structuralVariantEnrichmentProfiles.isComplete &&
            this.structuralVariantEnrichmentProfiles.result!.length > 0
        );
    }
}
