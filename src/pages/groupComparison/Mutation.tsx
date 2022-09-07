import * as React from 'react';
import { observer } from 'mobx-react';
import { MSKTabs, MSKTab } from 'shared/components/MSKTabs/MSKTabs';
import { AnnotatedMutation } from '../resultsView/ResultsViewPageStore';
import GroupComparisonMutationMapper from './GroupComparisonMutationMapper';
import { convertToMutationMapperProps } from 'shared/components/mutationMapper/MutationMapperConfig';
import MutationMapperUserSelectionStore from 'shared/components/mutationMapper/MutationMapperUserSelectionStore';
import { computed, action, makeObservable } from 'mobx';
import { getServerConfig } from 'config/config';
import autobind from 'autobind-decorator';
import { AppStore } from '../../AppStore';
import GroupComparisonURLWrapper from './GroupComparisonURLWrapper';
import './mutation.scss';
import {
    getMutationAlignerUrlTemplate,
    getOncoKbApiUrl,
} from 'shared/api/urls';
import { Mutation } from 'cbioportal-ts-api-client';
import _ from 'lodash';
import LoadingIndicator from 'shared/components/loadingIndicator/LoadingIndicator';
import { updateOncoKbIconStyle } from 'shared/lib/AnnotationColumnUtils';
import ComparisonStore from '../../shared/lib/comparison/ComparisonStore';
//import CaseFilterWarning from '../../shared/components/banners/CaseFilterWarning';
//import AlterationFilterWarning from '../../shared/components/banners/AlterationFilterWarning';
//import OqlStatusBanner from '../../shared/components/banners/OqlStatusBanner';

export interface IMutationsPageProps {
    routing?: any;
    store: ComparisonStore;
    appStore: AppStore;
    urlWrapper: GroupComparisonURLWrapper;
}

@observer
export default class Mutations extends React.Component<
    IMutationsPageProps,
    {}
> {
    private userSelectionStore: MutationMapperUserSelectionStore;

    @computed get selectedGeneSymbol() {
        return this.props.urlWrapper.query.mutations_gene &&
            this.props.store.hugoGeneSymbols.includes(
                this.props.urlWrapper.query.mutations_gene
            )
            ? this.props.urlWrapper.query.mutations_gene
            : this.props.store.hugoGeneSymbols[0];
    }

    @computed get selectedGene() {
        return _.find(
            this.props.store.genes.result,
            gene => gene.hugoGeneSymbol === this.selectedGeneSymbol
        );
    }

    constructor(props: IMutationsPageProps) {
        super(props);
        makeObservable(this);
        this.userSelectionStore = new MutationMapperUserSelectionStore();
    }

    @autobind
    private onToggleOql() {
        this.props.store.mutationsTabFilteringSettings.useOql = !this.props
            .store.mutationsTabFilteringSettings.useOql;
    }

    @autobind
    private onToggleVUS() {
        this.props.store.mutationsTabFilteringSettings.excludeVus = !this.props
            .store.mutationsTabFilteringSettings.excludeVus;
    }

    @autobind
    private onToggleGermline() {
        this.props.store.mutationsTabFilteringSettings.excludeGermline = !this
            .props.store.mutationsTabFilteringSettings.excludeGermline;
    }

    @action
    public setSelectedGeneSymbol(hugoGeneSymbol: string) {
        this.props.urlWrapper.updateURL({
            mutations_gene: hugoGeneSymbol,
        });
    }

    public render() {
        const activeTabId = this.selectedGeneSymbol;

        return (
            <div data-test="mutationsTabDiv">
                {this.props.store.mutationsByGene.isComplete && (
                    <MSKTabs
                        id="mutationsPageTabs"
                        activeTabId={activeTabId}
                        onTabClick={(id: string) => this.handleTabChange(id)}
                        className="pillTabs resultsPageMutationsGeneTabs"
                        arrowStyle={{ 'line-height': 0.8 }}
                        tabButtonStyle="pills"
                        unmountOnHide={true}
                    >
                        {this.generateTabs(
                            this.props.store.hugoGeneSymbols,
                            this.props.store.mutationsByGene.result
                        )}
                    </MSKTabs>
                )}
                {this.props.store.mutationsByGene.isPending && (
                    <LoadingIndicator
                        center={true}
                        size="big"
                        isLoading={true}
                    />
                )}
            </div>
        );
    } // general page view + logic

    protected generateTabs(
        genes: string[],
        mutationsByGene: {
            [hugoGeneSymbol: string]: Mutation[];
        }
    ) {
        const tabs: JSX.Element[] = [];

        genes.forEach((gene: string) => {
            if (mutationsByGene[gene]) {
                const tabHasMutations = mutationsByGene[gene].length > 0;
                // gray out tab if no mutations
                const anchorStyle = tabHasMutations
                    ? undefined
                    : { color: '#bbb' };

                tabs.push(
                    <MSKTab
                        key={gene}
                        id={gene}
                        linkText={gene}
                        anchorStyle={anchorStyle}
                    >
                        {this.selectedGeneSymbol === gene &&
                            this.geneTabContent}
                    </MSKTab>
                );
            }
        });

        return tabs;
    } // tabs for each selected gene

    @autobind
    protected handleTabChange(id: string) {
        this.setSelectedGeneSymbol(id);
    }

    @action.bound
    protected handleOncoKbIconToggle(mergeIcons: boolean) {
        this.userSelectionStore.mergeOncoKbIcons = mergeIcons;
        updateOncoKbIconStyle({ mergeIcons });
    }

    @computed get geneTabContent() {
        if (
            this.selectedGene &&
            this.props.store.getMutationMapperStore(this.selectedGene)
        ) {
            const mutationMapperStore = this.props.store.getMutationMapperStore(
                this.selectedGene
            )!;
            return (
                <div>
                    <GroupComparisonMutationMapper
                        {...convertToMutationMapperProps({
                            ...getServerConfig(),
                            // override ensemblLink
                            ensembl_transcript_url: this.props.store
                                .ensemblLink,
                            // only disable oncokb and hotspots track if
                            // non-canonical transcript is selected
                            show_oncokb: mutationMapperStore.isCanonicalTranscript
                                ? getServerConfig().show_oncokb
                                : false,
                            show_hotspot: mutationMapperStore.isCanonicalTranscript
                                ? getServerConfig().show_hotspot
                                : false,
                        })}
                        oncoKbPublicApiUrl={getOncoKbApiUrl()}
                        mergeOncoKbIcons={
                            this.userSelectionStore.mergeOncoKbIcons
                        } //icons under annotation column of table
                        onOncoKbIconToggle={this.handleOncoKbIconToggle}
                        store={mutationMapperStore}
                        isPutativeDriver={
                            this.props.store.driverAnnotationSettings
                                .driversAnnotated
                                ? (m: AnnotatedMutation) => m.putativeDriver
                                : undefined
                        } // tags on L panel of plot
                        trackVisibility={
                            //req
                            this.userSelectionStore.trackVisibility
                        }
                        genomeNexusCache={this.props.store.genomeNexusCache} //req
                        userEmailAddress={this.props.appStore.userName!}
                        generateGenomeNexusHgvsgUrl={
                            this.props.store.generateGenomeNexusHgvsgUrl
                        }
                        existsSomeMutationWithAscnProperty={
                            this.props.store.existsSomeMutationWithAscnProperty
                        }
                        mutationAlignerUrlTemplate={getMutationAlignerUrlTemplate()}
                        showTranscriptDropDown={
                            getServerConfig().show_transcript_dropdown
                        } // dropdown menu for transcripts on L panel of plot
                        onTranscriptChange={this.onTranscriptChange}
                        onClickSettingMenu={this.onClickSettingMenu}
                        compactStyle={true}
                        ptmSources={getServerConfig().ptmSources}
                    />
                </div>
            );
        } else {
            return null;
        }
    }

    @action.bound
    protected onTranscriptChange(transcriptId: string) {
        this.props.urlWrapper.updateURL({
            mutations_transcript_id: transcriptId,
        });
    }

    @action.bound
    protected onClickSettingMenu(visible: boolean) {
        this.props.store.isSettingsMenuVisible = visible;
    }
}