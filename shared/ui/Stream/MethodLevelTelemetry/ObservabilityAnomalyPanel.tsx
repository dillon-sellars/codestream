import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip as ReTooltip,
	XAxis,
	YAxis,
} from "recharts";
import {
	DidChangeObservabilityDataNotificationType,
	GetMethodLevelTelemetryRequestType,
	GetMethodLevelTelemetryResponse,
	GetObservabilityErrorGroupMetadataRequestType,
	GetObservabilityErrorGroupMetadataResponse,
	ObservabilityAnomaly,
	WarningOrError,
} from "@codestream/protocols/agent";
import styled from "styled-components";

import { DelayedRender } from "@codestream/webview/Container/DelayedRender";
import {
	RefreshEditorsCodeLensRequestType,
	UpdateConfigurationRequestType,
} from "@codestream/webview/ipc/host.protocol";
import { LoadingMessage } from "@codestream/webview/src/components/LoadingMessage";
import { CodeStreamState } from "@codestream/webview/store";
import {
	closeAllPanels,
	setCurrentObservabilityAnomaly,
} from "@codestream/webview/store/context/actions";
import { useDidMount, usePrevious } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import { closePanel } from "../actions";
import CancelButton from "../CancelButton";
import { EntityAssociator } from "../EntityAssociator";
import { WarningBox } from "../WarningBox";
import { MetaLabel } from "../Codemark/BaseCodemark";
import Icon from "../Icon";
import { PanelHeader } from "../../src/components/PanelHeader";
import { ErrorRow } from "../Observability";
import { openErrorGroup } from "@codestream/webview/store/codeErrors/thunks";
import { CLMSettings } from "@codestream/protocols/api";

const Root = styled.div``;

const ApmServiceTitle = styled.span`
	opacity: 0.5;
	a {
		color: var(--text-color-highlight);
		text-decoration: none;
	}
	.open-external {
		margin-left: 5px;
		font-size: 12px;
		visibility: hidden;
		color: var(--text-color-highlight);
	}
	& .open-external {
		visibility: visible;
	}
`;

const EntityDropdownContainer = styled.div`
	margin: 0 0 4px 0;
`;

const EMPTY_ARRAY = [];
export const ObservabilityAnomalyPanel = () => {
	const dispatch = useDispatch<any>();

	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			showGoldenSignalsInEditor: state.configs.showGoldenSignalsInEditor,
			currentObservabilityAnomaly: (state.context.currentObservabilityAnomaly ||
				{}) as ObservabilityAnomaly,
			currentObservabilityAnomalyEntityGuid:
				state.context.currentObservabilityAnomalyEntityGuid || "",
			observabilityRepoEntities:
				(state.users[state.session.userId!].preferences || {}).observabilityRepoEntities ||
				EMPTY_ARRAY,
			clmSettings: (state.preferences.clmSettings || {}) as CLMSettings,
			sessionStart: state.context.sessionStart,
		};
	});

	const computedStyle = getComputedStyle(document.body);
	const colorSubtle = computedStyle.getPropertyValue("--text-color-subtle").trim();
	const colorPrimary = computedStyle.getPropertyValue("--text-color").trim();
	const colorLine = "#8884d8";

	const [telemetryResponse, setTelemetryResponse] = useState<
		GetMethodLevelTelemetryResponse | undefined
	>(undefined);
	const [remappedDeployments, setRemappedDeployments] = useState({});
	const [loading, setLoading] = useState<boolean>(true);
	const [isLoadingErrorGroupGuid, setIsLoadingErrorGroupGuid] = useState("");
	const [warningOrErrors, setWarningOrErrors] = useState<WarningOrError[] | undefined>(undefined);
	const previousCurrentObservabilityAnomaly = usePrevious(derivedState.currentObservabilityAnomaly);
	const [showGoldenSignalsInEditor, setshowGoldenSignalsInEditor] = useState<boolean>(
		derivedState.showGoldenSignalsInEditor || false
	);

	const loadData = async (newRelicEntityGuid: string) => {
		setLoading(true);
		try {
			// if (!derivedState.currentObservabilityAnomaly.repo?.id) {
			// 	setWarningOrErrors([{ message: "Repository missing" }]);
			// 	return;
			// }
			// if (!derivedState.currentObservabilityAnomaly.metricTimesliceNameMapping) {
			// 	setWarningOrErrors([{ message: "Repository metric timeslice names" }]);
			// 	return;
			// }

			const anomaly = derivedState.currentObservabilityAnomaly;
			const isPlural = anomaly.totalDays > 1 ? "s" : "";
			const since = `${anomaly.totalDays} day${isPlural} ago`;
			const response = await HostApi.instance.send(GetMethodLevelTelemetryRequestType, {
				newRelicEntityGuid: newRelicEntityGuid,
				metricTimesliceNameMapping: {
					source: "metric",
					duration: anomaly.metricTimesliceName,
					errorRate: anomaly.errorMetricTimesliceName,
					sampleSize: anomaly.metricTimesliceName,
				},
				since,
				includeDeployments: true,
				includeErrors: true,
				timeseriesGroup: "1 day",
			});

			response.goldenMetrics?.forEach(gm => {
				gm.result.forEach(r => {
					if (r.endTimeSeconds) {
						const midnight = new Date(r.endTimeSeconds * 1000);
						midnight.setHours(0, 0, 0, 0);
						r.endTimeSeconds = Math.ceil(midnight.getTime() / 1000);
					}
				});
			});

			const deploymentsObject = {};
			response.deployments?.forEach(item => {
				const { seconds, version } = item;

				const midnight = new Date(seconds * 1000);
				midnight.setHours(0, 0, 0, 0);
				const midnightSeconds = Math.ceil(midnight.getTime() / 1000);

				if (version !== "") {
					if (!deploymentsObject[midnightSeconds]) {
						deploymentsObject[midnightSeconds] = [version];
					} else {
						deploymentsObject[midnightSeconds].push(version);
					}
				}
			});

			if (!response.deployments || !response.deployments.length) {
				const date = new Date();
				date.setHours(0, 0, 0, 0);
				const nDaysAgo = derivedState?.clmSettings?.compareDataLastValue;
				date.setDate(date.getDate() - parseInt(nDaysAgo as string));
				const isPlural = parseInt(nDaysAgo as string) > 1 ? "s" : "";

				deploymentsObject[Math.floor(date.getTime() / 1000)] = [`${nDaysAgo} day${isPlural} ago`];
			}

			setRemappedDeployments(deploymentsObject);
			setTelemetryResponse(response);
		} catch (ex) {
			setWarningOrErrors([{ message: ex.toString() }]);
		} finally {
			setLoading(false);
		}
	};

	useDidMount(() => {
		// HostApi.instance.track("MLT Codelens Clicked", {
		// 	"NR Account ID": derivedState.currentObservabilityAnomaly?.newRelicAccountId + "",
		// 	Language: derivedState.currentObservabilityAnomaly.languageId,
		// });
		// if (!derivedState.currentMethodLevelTelemetry.error) {
		loadData(derivedState.currentObservabilityAnomalyEntityGuid);
		// }
	});

	useEffect(() => {
		if (
			!previousCurrentObservabilityAnomaly ||
			JSON.stringify(previousCurrentObservabilityAnomaly) ===
				JSON.stringify(derivedState.currentObservabilityAnomaly)
		) {
			return;
		}

		loadData(derivedState.currentObservabilityAnomalyEntityGuid);
	}, [derivedState.currentObservabilityAnomaly]);

	if (
		false
		// derivedState.currentMethodLevelTelemetry.error &&
		// derivedState.currentMethodLevelTelemetry.error.type === "NOT_ASSOCIATED" &&
		// derivedState.currentMethodLevelTelemetry.repo
	) {
		return (
			<Root className="full-height-codemark-form">
				<div
					style={{
						display: "flex",
						alignItems: "center",
						width: "100%",
					}}
				>
					<div
						style={{ marginLeft: "auto", marginRight: "13px", whiteSpace: "nowrap", flexGrow: 0 }}
					>
						<CancelButton onClick={() => dispatch(closePanel())} />
					</div>
				</div>

				<div className="embedded-panel">
					<EntityAssociator
						title="Code-Level Metrics"
						label="Select the service on New Relic that is built from this repository to see how it's performing."
						onSuccess={async e => {
							HostApi.instance.send(RefreshEditorsCodeLensRequestType, {});
							HostApi.instance.emit(DidChangeObservabilityDataNotificationType.method, {
								type: "RepositoryAssociation",
							});
							dispatch(closeAllPanels());
						}}
						// remote={derivedState.currentMethodLevelTelemetry.repo.remote}
						// remoteName={derivedState.currentMethodLevelTelemetry.repo.name}
						remote={""}
						remoteName={""}
					>
						<div>
							<br />
							<input
								id="dontShowGoldenSignalsInEditor"
								name="dontShowGoldenSignalsInEditor"
								type="checkbox"
								checked={!showGoldenSignalsInEditor}
								onClick={e => {
									HostApi.instance.send(UpdateConfigurationRequestType, {
										name: "showGoldenSignalsInEditor",
										value: !showGoldenSignalsInEditor,
									});
									setshowGoldenSignalsInEditor(!showGoldenSignalsInEditor);
								}}
							/>
							<label htmlFor="dontShowGoldenSignalsInEditor">
								Don't show repo association prompts in my editor
							</label>
						</div>
					</EntityAssociator>
				</div>
			</Root>
		);
	}

	const renderEntityDropdownSubtext = item => {
		let subtext;
		if (item.accountName && item.accountName.length > 25) {
			subtext = item.accountName.substr(0, 25) + "...";
		} else {
			subtext = item.accountName;
		}
		if (item.domain) {
			subtext += ` ${item.domain}`;
		}
		return subtext;
	};

	const ScopeText = styled.span`
		color: var(--text-color-subtle);
	`;

	return (
		<Root className="full-height-codemark-form">
			{!loading && (
				<div
					style={{
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					<PanelHeader title={derivedState.currentObservabilityAnomaly.name}></PanelHeader>
				</div>
			)}
			<CancelButton
				onClick={() => {
					dispatch(setCurrentObservabilityAnomaly());
					dispatch(closePanel());
				}}
			/>

			<div className="plane-container" style={{ padding: "5px 20px 0px 10px" }}>
				<div className="standard-form vscroll">
					{warningOrErrors ? (
						<WarningBox items={warningOrErrors} />
					) : (
						<>
							{loading ? (
								<>
									<DelayedRender>
										<div style={{ display: "flex", alignItems: "center" }}>
											<LoadingMessage>Loading Telemetry...</LoadingMessage>
										</div>
									</DelayedRender>
								</>
							) : (
								<div>
									{telemetryResponse?.errors && telemetryResponse.errors.length > 0 && (
										<div>
											<br />
											<MetaLabel>Errors</MetaLabel>
											<div>
												{telemetryResponse.errors.map((_, index) => {
													const indexedErrorGroupGuid = `${_.errorGroupGuid}_${index}`;
													return (
														<ErrorRow
															key={`observability-error-${index}`}
															title={_.errorClass}
															tooltip={_.message}
															subtle={_.message}
															alternateSubtleRight={`${_.count}`} // we want to show count instead of timestamp
															url={_.errorGroupUrl}
															customPadding={"0"}
															isLoading={isLoadingErrorGroupGuid === indexedErrorGroupGuid}
															onClick={async e => {
																try {
																	setIsLoadingErrorGroupGuid(indexedErrorGroupGuid);
																	const response = (await HostApi.instance.send(
																		GetObservabilityErrorGroupMetadataRequestType,
																		{ errorGroupGuid: _.errorGroupGuid }
																	)) as GetObservabilityErrorGroupMetadataResponse;
																	dispatch(
																		openErrorGroup(_.errorGroupGuid, _.occurrenceId, {
																			multipleRepos: response?.relatedRepos?.length > 1,
																			relatedRepos: response?.relatedRepos || undefined,
																			timestamp: _.lastOccurrence,
																			sessionStart: derivedState.sessionStart,
																			pendingEntityId: response?.entityId || _.entityId,
																			occurrenceId: response?.occurrenceId || _.occurrenceId,
																			pendingErrorGroupGuid: _.errorGroupGuid,
																			openType: "CLM Details",
																			remote: _?.remote || undefined,
																		})
																	);
																} catch (ex) {
																	console.error(ex);
																} finally {
																	setIsLoadingErrorGroupGuid("");
																}
															}}
														/>
													);
												})}
											</div>
										</div>
									)}
									<div>
										<br />
										{telemetryResponse &&
											telemetryResponse.goldenMetrics &&
											telemetryResponse.goldenMetrics.map((_, index) => {
												// hide charts with no data.
												if (!_?.result || _.result?.length === 0) return null;
												const title = _.title + (_.extrapolated ? " (extrapolated)" : "");
												const yValues = _.result.map(o => o[_.title as any]);
												const sanitizedYValues = (yValues as (number | undefined)[]).map(_ =>
													_ != undefined ? _ : 0
												);
												const maxY = Math.max(...sanitizedYValues);
												const redHeaderText =
													derivedState.currentObservabilityAnomaly.chartHeaderTexts[title];
												return (
													<>
														<div
															key={"chart-" + index}
															style={{ marginLeft: "0px", marginBottom: "20px" }}
														>
															<MetaLabel>{title}</MetaLabel>
															<div style={{ color: "red" }}>{redHeaderText}</div>
															<ResponsiveContainer width="100%" height={300} debounce={1}>
																<LineChart
																	width={500}
																	height={300}
																	data={_.result}
																	margin={{
																		top: 25,
																		right: 0,
																		left: 0,
																		bottom: 5,
																	}}
																>
																	<CartesianGrid strokeDasharray="3 3" />
																	<XAxis
																		dataKey="endTimeSeconds"
																		tick={{ fontSize: 12 }}
																		tickFormatter={label =>
																			new Date(label * 1000).toLocaleDateString()
																		}
																	/>
																	<YAxis tick={{ fontSize: 12 }} domain={[0, maxY]} />
																	<ReTooltip
																		content={<CustomTooltip />}
																		contentStyle={{ color: colorLine, textAlign: "center" }}
																	/>
																	<Line
																		type="monotone"
																		dataKey={_.title}
																		stroke={colorLine}
																		activeDot={{ r: 8 }}
																		connectNulls={true}
																		name={title}
																		dot={{ style: { fill: colorLine } }}
																	/>
																	{Object.entries(remappedDeployments).map(
																		([key, value]: [string, any]) => {
																			return (
																				<ReferenceLine
																					x={parseInt(key)}
																					stroke={value?.length ? colorPrimary : colorSubtle}
																					label={e => renderCustomLabel(e, value.join(", "))}
																				/>
																			);
																		}
																	)}
																</LineChart>
															</ResponsiveContainer>
														</div>
														{(_.scopes?.length || 0) > 0 && (
															<div style={{ marginBottom: "30px" }}>
																<table style={{ borderCollapse: "collapse", width: "100%" }}>
																	<tr style={{ borderBottom: "1px solid #888" }}>
																		<td
																			style={{
																				width: "100%",
																				padding: "3px 1px",
																				whiteSpace: "nowrap",
																			}}
																		>
																			<ScopeText>
																				<b>Scopes</b>
																			</ScopeText>
																		</td>
																	</tr>
																	{_.scopes?.map(scope => {
																		return (
																			<tr style={{ borderBottom: "1px solid #888" }}>
																				<td
																					style={{
																						width: "75%",
																						padding: "3px 1px",
																						whiteSpace: "nowrap",
																					}}
																				>
																					<ScopeText>{scope.name}</ScopeText>
																				</td>
																				<td
																					style={{
																						width: "25%",
																						padding: "3px 1px",
																						whiteSpace: "nowrap",
																						textAlign: "right",
																					}}
																				>
																					<ScopeText>{scope.value.toFixed(3)}</ScopeText>
																				</td>
																			</tr>
																		);
																	})}
																</table>
															</div>
														)}
													</>
												);
											})}
									</div>
									{/* {telemetryResponse && telemetryResponse.newRelicUrl && (
										<div>
											<Link className="external-link" href={telemetryResponse.newRelicUrl}>
												View service summary on New Relic <Icon name="link-external" />
											</Link>
										</div>
									)} */}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</Root>
	);
};

interface CustomTooltipProps {
	active?: boolean;
	payload?: any[];
	label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
	const computedStyle = getComputedStyle(document.body);
	const colorSubtle = computedStyle.getPropertyValue("--text-color-subtle").trim();
	const colorBackgroundHover = computedStyle
		.getPropertyValue("--app-background-color-hover")
		.trim();

	if (active && payload && payload.length && label) {
		const dataValue = payload[0].value;
		const dataTime = payload[0].payload.endTimeSeconds;
		const date = new Date(dataTime * 1000); // Convert to milliseconds
		const humanReadableDate = date.toLocaleDateString();

		return (
			<div
				style={{
					zIndex: 9999,
					padding: "5px",
					border: `${colorSubtle} solid 1px`,
					background: colorBackgroundHover,
				}}
			>
				<div>{humanReadableDate}</div>
				<div style={{ marginTop: "3px" }}>{dataValue}</div>
			</div>
		);
	}
	return null;
};

// The label property in recharts must be wrapped in a <g> tag.
// To get the correct location, we have to take the  viewBox x and y coords
// and modfiy them for a transform property.
const renderCustomLabel = ({ viewBox: { x, y } }, title) => {
	const d = 20;
	const r = d / 2;

	const transform = `translate(${x - r} ${y - d - 5})`;
	return (
		<g transform={transform}>
			<foreignObject x={0} y={0} width={100} height={100}>
				<Icon
					style={{ paddingLeft: "4px" }}
					name="info"
					className="circled"
					title={title}
					placement="top"
				/>
			</foreignObject>
		</g>
	);
};
