import {
	DidChangeObservabilityDataNotificationType,
	GetNewRelicAssigneesRequestType,
	NewRelicErrorGroup,
	ResolveStackTraceResponse,
} from "@codestream/protocols/agent";
import { CSCodeError, CSPost, CSStackTraceLine, CSUser } from "@codestream/protocols/api";
import React, { PropsWithChildren, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import styled from "styled-components";

import { OpenUrlRequestType } from "@codestream/protocols/webview";
import { DelayedRender } from "@codestream/webview/Container/DelayedRender";
import { Loading } from "@codestream/webview/Container/Loading";
import { Button } from "@codestream/webview/src/components/Button";
import { CardFooter, CardProps, getCardProps } from "@codestream/webview/src/components/Card";
import { ButtonRow, Dialog } from "@codestream/webview/src/components/Dialog";
import { Headshot } from "@codestream/webview/src/components/Headshot";
import { HealthIcon } from "@codestream/webview/src/components/HealthIcon";
import { TourTip } from "@codestream/webview/src/components/TourTip";
import { CodeStreamState } from "@codestream/webview/store";
import {
	fetchCodeError,
	PENDING_CODE_ERROR_ID_PREFIX,
	setFunctionToEditFailed,
} from "@codestream/webview/store/codeErrors/actions";
import { getCodeError, getCodeErrorCreator } from "@codestream/webview/store/codeErrors/reducer";
import {
	api,
	copySymbolFromIde,
	fetchErrorGroup,
	jumpToStackLine,
	startGrokLoading,
	upgradePendingCodeError,
} from "@codestream/webview/store/codeErrors/thunks";
import {
	getGrokPostLength,
	getThreadPosts,
	getPost,
	isGrokStreamLoading,
} from "@codestream/webview/store/posts/reducer";
import { isConnected } from "@codestream/webview/store/providers/reducer";
import {
	currentUserIsAdminSelector,
	findMentionedUserIds,
	getTeamMates,
	getTeamMembers,
	isCurrentUserInternal,
} from "@codestream/webview/store/users/reducer";
import { useAppDispatch, useAppSelector, useDidMount } from "@codestream/webview/utilities/hooks";
import { isSha } from "@codestream/webview/utilities/strings";
import { emptyArray, replaceHtml } from "@codestream/webview/utils";
import { HostApi } from "@codestream/webview/webview-api";
import { createPost, deletePost, invite, markItemRead } from "../actions";
import { Attachments } from "../Attachments";
import {
	BigTitle,
	Header,
	HeaderActions,
	Meta,
	MetaLabel,
	MetaSection,
	MetaSectionCollapsed,
	MinimumWidthCard,
} from "../Codemark/BaseCodemark";
import ConfigureNewRelic from "../ConfigureNewRelic";
import { confirmPopup } from "../Confirm";
import { PROVIDER_MAPPINGS } from "../CrossPostIssueControls/types";
import { DropdownButton, DropdownButtonItems } from "../DropdownButton";
import Icon from "../Icon";
import { Link } from "../Link";
import Menu from "../Menu";
import { MessageInput, AttachmentField } from "../MessageInput";
import { Modal } from "../Modal";
import { RepliesToPost } from "../Posts/RepliesToPost";
import { AddReactionIcon, Reactions } from "../Reactions";
import { RepoMetadata } from "../Review";
import { SharingModal } from "../SharingModal";
import Timestamp from "../Timestamp";
import Tooltip from "../Tooltip";
import { ConditionalNewRelic } from "./ConditionalComponent";
import { isFeatureEnabled } from "../../store/apiVersioning/reducer";

interface SimpleError {
	/**
	 * Error message from the server
	 */
	message: string;
	/**
	 * Typed error message (to switch off of, etc.)
	 */
	type?: string;
}

export interface BaseCodeErrorProps extends CardProps {
	codeError: CSCodeError;
	errorGroup?: NewRelicErrorGroup;
	parsedStack?: ResolveStackTraceResponse;
	post?: CSPost;
	repoInfo?: RepoMetadata;
	headerError?: SimpleError;
	currentUserId?: string;
	collapsed?: boolean;
	isFollowing?: boolean;
	assignees?: CSUser[];
	renderFooter?: (
		footer: typeof CardFooter,
		inputContainer?: typeof ComposeWrapper
	) => React.ReactNode;
	setIsEditing: Function;
	onRequiresCheckPreconditions?: Function;
	stackFrameClickDisabled?: boolean;
	stackTraceTip?: any;
	resolutionTip?: any;
	setGrokRequested: () => void;
	readOnly: boolean;
}

export interface BaseCodeErrorHeaderProps {
	codeError: CSCodeError;
	errorGroup?: NewRelicErrorGroup;
	post?: CSPost;
	collapsed?: boolean;
	isFollowing?: boolean;
	assignees?: CSUser[];
	setIsEditing: Function;
	resolutionTip?: any;
}

export interface BaseCodeErrorMenuProps {
	codeError: CSCodeError;
	post?: CSPost;
	errorGroup?: NewRelicErrorGroup;
	setIsEditing: Function;
	collapsed?: boolean;
}

const ComposeWrapper = styled.div.attrs(() => ({
	className: "compose codemark-compose",
}))`
	&&& {
		padding: 0 !important;
	}
	.message-input#input-div {
		max-width: none !important;
	}
`;

export const ExpandedAuthor = styled.div`
	width: 100%;
	color: var(--text-color-subtle);
	white-space: normal;
`;

export const Description = styled.div`
	margin-bottom: 15px;
`;

const ClickLines = styled.div`
	padding: 1px !important;
	&:focus {
		border: none;
		outline: none;
	}
	,
	&.pulse {
		opacity: 1;
		background: var(--app-background-color-hover);
	}
`;

const DisabledClickLine = styled.div`
	color: var(--text-color);
	opacity: 0.4;
	text-align: right;
	direction: rtl;
	text-overflow: ellipsis;
	overflow: hidden;
	padding: 2px 0px 2px 0px;
`;

const ClickLine = styled.div`
	position: relative;
	cursor: pointer;
	padding: 2px 0px 2px 0px;
	text-align: right;
	direction: rtl;
	text-overflow: ellipsis;
	overflow: hidden;
	:hover {
		color: var(--text-color-highlight);
		background: var(--app-background-color-hover);
		opacity: 1;
	}
`;

const DataRow = styled.div`
	display: flex;
	align-items: center;
`;
const DataLabel = styled.div`
	margin-right: 5px;
`;
const DataValue = styled.div`
	color: var(--text-color-subtle);
`;

const ApmServiceTitle = styled.span`
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
	&:hover .open-external {
		visibility: visible;
	}
	padding-left: 5px;
`;

export const Message = styled.div`
	width: 100%;
	margin-bottom: 10px;
	display: flex;
	align-items: flex-start;
	font-size: 12px;
`;

export const ALERT_SEVERITY_COLORS = {
	"": "#9FA5A5",
	CRITICAL: "#F5554B",
	NOT_ALERTING: "#01B076",
	NOT_CONFIGURED: "#9FA5A5",
	WARNING: "#F0B400",
	// if not connected, we're unknown
	UNKNOWN: "transparent",
};
export const ALERT_SEVERITY_SORTING_ORDER: string[] = [
	"",
	"CRITICAL",
	"NOT_ALERTING",
	"NOT_CONFIGURED",
	"WARNING",
	"UNKNOWN",
];

/**
 * States are from NR
 */
const STATES_TO_ACTION_STRINGS = {
	RESOLVED: "Resolve",
	IGNORED: "Ignore",
	UNRESOLVED: "Unresolve",
};
/**
 * States are from NR
 */
const STATES_TO_DISPLAY_STRINGS = {
	RESOLVED: "Resolved",
	IGNORED: "Ignored",
	UNRESOLVED: "Unresolved",
	// if not connected, we're unknown, just say "Status"
	UNKNOWN: "Status",
};

// if child props are passed in, we assume they are the action buttons/menu for the header
export const BaseCodeErrorHeader = (props: PropsWithChildren<BaseCodeErrorHeaderProps>) => {
	const { codeError, collapsed } = props;
	const dispatch = useAppDispatch();

	const derivedState = useAppSelector((state: CodeStreamState) => {
		const allTeamMembers = getTeamMembers(state);
		const teamMembers = allTeamMembers.filter(_ => _.username !== "AI");

		const user = state.users[state.session.userId!];
		const teamId = state.context.currentTeamId;
		const team = state.teams[teamId];

		const eligibleJoinCompanies = user?.eligibleJoinCompanies;
		const eligibleCompany = eligibleJoinCompanies?.find(_ => team.companyId === _.id);

		const company = state.companies[team.companyId];

		return {
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" }),
			codeErrorCreator: getCodeErrorCreator(state),
			isCurrentUserInternal: isCurrentUserInternal(state),
			ideName: encodeURIComponent(state.ide.name || ""),
			teamMembers: teamMembers,
			emailAddress: state.session.userId ? state.users[state.session.userId]?.email : "",
			hideCodeErrorInstructions: state.preferences.hideCodeErrorInstructions,
			isPDIdev: isFeatureEnabled(state, "PDIdev"),
			isNonCsOrg: !company.codestreamOnly,
		};
	});

	const [items, setItems] = useState<DropdownButtonItems[]>([]);
	const [states, setStates] = useState<DropdownButtonItems[] | undefined>(undefined);
	const [openConnectionModal, setOpenConnectionModal] = useState(false);
	const [isStateChanging, setIsStateChanging] = useState(false);
	const [isAssigneeChanging, setIsAssigneeChanging] = useState(false);

	const notify = (emailAddress?: string) => {
		// if no email address or it's you
		if (!emailAddress || derivedState.emailAddress.toLowerCase() === emailAddress.toLowerCase()) {
			HostApi.instance.emit(DidChangeObservabilityDataNotificationType.method, {
				type: "Assignment",
			});
		}
	};

	type AssigneeType = "Teammate" | "Invitee";

	const setAssignee = async (emailAddress: string, assigneeType: AssigneeType) => {
		if (!props.errorGroup) return;

		const _setAssignee = async (type: AssigneeType) => {
			HostApi.instance.track("Error Assigned", {
				"Error Group ID": props.errorGroup?.guid,
				"NR Account ID": props.errorGroup?.accountId,
				Assignment: props.errorGroup?.assignee ? "Change" : "New",
				"Assignee Type": type,
			});

			setIsAssigneeChanging(true);
			await dispatch(upgradePendingCodeError(props.codeError.id, "Assignee Change"));
			await dispatch(
				api("setAssignee", {
					errorGroupGuid: props.errorGroup?.guid!,
					emailAddress: emailAddress,
				})
			);

			notify(emailAddress);
			setTimeout(_ => {
				setIsAssigneeChanging(false);
			}, 1);
		};
		// if it's me, or someone that is already on the team -- just assign them without asking to invite
		if (
			derivedState.emailAddress.toLowerCase() === emailAddress.toLowerCase() ||
			derivedState.teamMembers.find(_ => _.email.toLowerCase() === emailAddress.toLowerCase())
		) {
			_setAssignee(assigneeType);
			return;
		}

		confirmPopup({
			title: "Invite to CodeStream?",
			message: (
				<span>
					Assign the error to <b>{emailAddress}</b> and invite them to join CodeStream
				</span>
			),
			centered: true,
			buttons: [
				{
					label: "Cancel",
					className: "control-button btn-secondary",
				},
				{
					label: "Invite",
					className: "control-button",
					wait: true,
					action: () => {
						dispatch(
							invite({
								email: emailAddress,
								inviteType: "error",
							})
						);
						HostApi.instance.track("Teammate Invited", {
							"Invitee Email Address": emailAddress,
							"Invitation Method": "Error Assignment",
						});

						// "upgrade" them to an invitee
						_setAssignee("Invitee");
					},
				},
			],
		});
	};

	const removeAssignee = async (
		e: React.SyntheticEvent<Element, Event>,
		emailAddress: string | undefined,
		userId: number | undefined
	) => {
		if (!props.errorGroup) return;

		// dont allow this to bubble to the parent item which would call setAssignee
		e.stopPropagation();
		setIsAssigneeChanging(true);

		await dispatch(upgradePendingCodeError(props.codeError.id, "Assignee Change"));
		await dispatch(
			api("removeAssignee", {
				errorGroupGuid: props.errorGroup?.guid!,
				emailAddress: emailAddress,
				userId: userId,
			})
		);

		notify(emailAddress);
		setTimeout(_ => {
			setIsAssigneeChanging(false);
		}, 1);
	};

	const buildStates = () => {
		if (collapsed) return;

		if (derivedState.isConnectedToNewRelic && props.errorGroup?.states) {
			// only show states that aren't the current state
			setStates(
				props.errorGroup?.states
					.filter(_ => (props.errorGroup?.state ? _ !== props.errorGroup.state : true))
					.map(_ => {
						return {
							key: _,
							label: STATES_TO_ACTION_STRINGS[_],
							action: async e => {
								setIsStateChanging(true);
								await dispatch(upgradePendingCodeError(props.codeError.id, "Status Change"));
								await dispatch(
									api("setState", {
										errorGroupGuid: props.errorGroup?.guid!,
										state: _,
									})
								);
								notify();
								setIsStateChanging(false);

								HostApi.instance.track("Error Status Changed", {
									"Error Group ID": props.errorGroup?.guid,
									"NR Account ID": props.errorGroup?.accountId,
									"Error Status": STATES_TO_ACTION_STRINGS[_],
								});
							},
						};
					}) as DropdownButtonItems[]
			);
		} else {
			setStates([
				{
					key: "UNKNOWN",
					label: STATES_TO_DISPLAY_STRINGS["UNKNOWN"],
					action: e => {
						setOpenConnectionModal(true);
					},
				} as DropdownButtonItems,
			]);
		}
	};

	const buildAssignees = async () => {
		if (collapsed) return;

		let assigneeItems: DropdownButtonItems[] = [
			{ type: "search", label: "", placeholder: "Search...", key: "search" },
		];

		let assigneeEmail;
		if (props.errorGroup && props.errorGroup.assignee) {
			const a = props.errorGroup.assignee;
			const label = a.name || a.email;
			assigneeEmail = a.email;
			assigneeItems.push({ label: "-", key: "sep-assignee" });
			assigneeItems.push({
				label: (
					<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
						CURRENT ASSIGNEE
					</span>
				),
				noHover: true,
				disabled: true,
			});
			assigneeItems.push({
				icon: <Headshot size={16} display="inline-block" person={{ email: a.email }} />,
				key: a.email,
				label: label,
				subtext: label === a.email ? undefined : a.email,
				floatRight: {
					label: (
						<Icon
							name="x"
							onClick={e => {
								removeAssignee(e, a.email, a.id);
							}}
						/>
					),
				},
			});
		}

		if (derivedState.isConnectedToNewRelic) {
			let { users } = await HostApi.instance.send(GetNewRelicAssigneesRequestType, {});
			if (assigneeEmail) {
				users = users.filter(_ => _.email !== assigneeEmail);
			}

			let usersFromGitNotOnTeam = users.filter(ufg => {
				return !derivedState.teamMembers.some(tm => tm.email === ufg.email) && ufg.group === "GIT";
			});

			if (usersFromGitNotOnTeam.length && !derivedState.isNonCsOrg) {
				// take no more than 5
				usersFromGitNotOnTeam = usersFromGitNotOnTeam.slice(0, 5);
				assigneeItems.push({ label: "-", key: "sep-git" });
				assigneeItems.push({
					label: (
						<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
							SUGGESTIONS FROM GIT
						</span>
					),
					noHover: true,
					disabled: true,
				});
				assigneeItems = assigneeItems.concat(
					usersFromGitNotOnTeam.map(_ => {
						const label = _.displayName || _.email;
						return {
							icon: <Headshot size={16} display="inline-block" person={{ email: _.email }} />,
							key: _.id || `git-${_.email}`,
							label: label,
							searchLabel: _.displayName || _.email,
							subtext: label === _.email ? undefined : _.email,
							action: () => setAssignee(_.email, "Teammate"),
						};
					})
				);
			}

			let usersFromCodeStream = derivedState.teamMembers;

			if (assigneeEmail) {
				// if we have an assignee don't re-include them here
				usersFromCodeStream = usersFromCodeStream.filter(_ => _.email !== assigneeEmail);
			}

			if (usersFromCodeStream.length) {
				assigneeItems.push({ label: "-", key: "sep-nr" });
				assigneeItems.push({
					label: (
						<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
							MY ORGANIZATION
						</span>
					),
					noHover: true,
					disabled: true,
				});
				assigneeItems = assigneeItems.concat(
					usersFromCodeStream.map(_ => {
						const label = _.fullName || _.email;
						return {
							icon: <Headshot size={16} display="inline-block" person={{ email: _.email }} />,
							key: _.id,
							label: _.fullName || _.email,
							searchLabel: _.fullName || _.username,
							subtext: label === _.email ? undefined : _.email,
							action: () => setAssignee(_.email, "Teammate"),
						};
					})
				);
			}
			setItems(assigneeItems);
		} else {
			setItems([{ label: "-", key: "none" }]);
		}
	};

	useEffect(() => {
		buildAssignees();
	}, [props.errorGroup, props.errorGroup?.assignee, derivedState.isConnectedToNewRelic]);

	useEffect(() => {
		buildStates();
	}, [props.errorGroup, props.errorGroup?.state, derivedState.isConnectedToNewRelic]);

	useDidMount(() => {
		if (collapsed) return;

		buildStates();
		buildAssignees();
	});

	const title = (props.codeError?.title || "").split(/(\.)/).map(part => (
		<>
			{part}
			<wbr />
		</>
	));

	const resolutionDropdownOptionsWrapperOpacity = () => {
		if (
			(!derivedState.hideCodeErrorInstructions && props.resolutionTip) ||
			derivedState.hideCodeErrorInstructions
		) {
			return "1";
		}

		return ".25";
	};

	const errorGroupHasNoAssignee = () => {
		return (
			props.errorGroup &&
			(!props.errorGroup.assignee ||
				(!props.errorGroup.assignee.email && !props.errorGroup.assignee.id))
		);
	};

	const handleEntityLinkClick = (e, url) => {
		e.preventDefault();
		e.stopPropagation();
		HostApi.instance.track("Open Service Summary on NR", {
			Section: "Error",
		});
		HostApi.instance.send(OpenUrlRequestType, {
			url,
		});
	};

	return (
		<>
			{openConnectionModal && (
				<Modal
					translucent
					onClose={() => {
						setOpenConnectionModal(false);
					}}
				>
					<Dialog narrow title="">
						<div className="embedded-panel">
							<ConfigureNewRelic
								headerChildren={
									<>
										<div className="panel-header" style={{ background: "none" }}>
											<span className="panel-title">Connect to New Relic</span>
										</div>
										<div style={{ textAlign: "center" }}>
											Working with errors requires a connection to your New Relic account. If you
											don't have one, get a teammate{" "}
											{derivedState.codeErrorCreator
												? `like ${
														derivedState.codeErrorCreator.fullName ||
														derivedState.codeErrorCreator.username
												  } `
												: ""}
											to invite you.
										</div>
									</>
								}
								disablePostConnectOnboarding={true}
								showSignupUrl={false}
								providerId={"newrelic*com"}
								onClose={e => {
									setOpenConnectionModal(false);
								}}
								onSubmited={async e => {
									setOpenConnectionModal(false);
								}}
								originLocation={"Open in IDE Flow"}
							/>
						</div>
					</Dialog>
				</Modal>
			)}
			{!collapsed && (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						justifyContent: "space-between",
					}}
				>
					<div
						style={{
							paddingTop: "2px",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							marginBottom: "10px",
						}}
					>
						<HealthIcon
							color={ALERT_SEVERITY_COLORS[props.errorGroup?.entityAlertingSeverity || "UNKNOWN"]}
						/>

						<ApmServiceTitle>
							<Tooltip title="Open Entity on New Relic" placement="bottom" delay={1}>
								<span style={{ opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25" }}>
									<ConditionalNewRelic
										connected={
											<>
												{props.errorGroup && (
													<>
														<Link
															onClick={e => {
																handleEntityLinkClick(e, props.errorGroup?.entityUrl);
															}}
														>
															<span className="subtle">{props.errorGroup.entityName}</span>{" "}
															<Icon name="link-external" className="open-external"></Icon>
														</Link>
													</>
												)}
											</>
										}
										disconnected={
											<>
												{!props.errorGroup && props.codeError && (
													<>
														<Link
															href="#"
															onClick={e => {
																e.preventDefault();
																setOpenConnectionModal(true);
															}}
														>
															<span className="subtle">
																{props.codeError?.objectInfo?.entityName || "Service"}
															</span>{" "}
															<Icon name="link-external" className="open-external"></Icon>
														</Link>
													</>
												)}
											</>
										}
									/>
								</span>
							</Tooltip>
						</ApmServiceTitle>
					</div>

					<div style={{ marginLeft: "auto", alignItems: "center", whiteSpace: "nowrap" }}>
						<>
							{derivedState.isPDIdev && (
								<>
									{props.errorGroup && (
										<>
											{errorGroupHasNoAssignee() ? (
												<Icon name="person" />
											) : (
												<Headshot
													size={16}
													display="inline-block"
													className="no-right-margin"
													person={{
														fullName: props.errorGroup.assignee?.name,
														email: props.errorGroup.assignee?.email,
													}}
												/>
											)}
										</>
									)}
								</>
							)}

							{!derivedState.isPDIdev && (
								<DropdownButton
									title="Assignee"
									items={items}
									preventStopPropagation={!derivedState.isConnectedToNewRelic}
									// onChevronClick={e =>
									// 	!derivedState.isConnectedToNewRelic ? setOpenConnectionModal(true) : undefined
									// }
									variant="secondary"
									size="compact"
									noChevronDown={!errorGroupHasNoAssignee()}
								>
									<div
										style={{
											display: "inline-block",
											opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25",
										}}
									>
										<ConditionalNewRelic
											connected={
												<>
													{props.errorGroup && (
														<>
															{isAssigneeChanging ? (
																<Icon name="sync" className="spin" />
															) : (
																<>
																	{errorGroupHasNoAssignee() ? (
																		<Icon name="person" />
																	) : (
																		<Headshot
																			size={16}
																			display="inline-block"
																			className="no-right-margin"
																			person={{
																				fullName: props.errorGroup.assignee?.name,
																				email: props.errorGroup.assignee?.email,
																			}}
																		/>
																	)}
																</>
															)}
														</>
													)}
												</>
											}
											disconnected={
												<Icon
													style={{ cursor: "pointer" }}
													name="person"
													onClick={e => {
														setOpenConnectionModal(true);
													}}
												/>
											}
										/>
									</div>
								</DropdownButton>
							)}
						</>

						{states && (
							<>
								<div style={{ display: "inline-block", width: "5px" }} />
								{derivedState.isPDIdev && (
									<div
										style={{
											display: "inline-block",
											opacity: resolutionDropdownOptionsWrapperOpacity(),
										}}
									>
										{STATES_TO_DISPLAY_STRINGS[props.errorGroup?.state || "UNKNOWN"]}
									</div>
								)}

								{!derivedState.isPDIdev && (
									<DropdownButton
										items={states}
										selectedKey={props.errorGroup?.state || "UNKNOWN"}
										isLoading={isStateChanging}
										variant="secondary"
										size="compact"
										preventStopPropagation={!derivedState.isConnectedToNewRelic}
										onButtonClicked={
											derivedState.isConnectedToNewRelic
												? undefined
												: e => {
														e.preventDefault();
														e.stopPropagation();
														setOpenConnectionModal(true);
												  }
										}
										wrap
									>
										<div
											style={{
												display: "inline-block",
												opacity: resolutionDropdownOptionsWrapperOpacity(),
											}}
										>
											{STATES_TO_DISPLAY_STRINGS[props.errorGroup?.state || "UNKNOWN"]}
										</div>
									</DropdownButton>
								)}
							</>
						)}

						<>
							{props.post && <AddReactionIcon post={props.post} className="in-review" />}
							{props.children ||
								(codeError && (
									<>
										<div style={{ display: "inline-block", width: "5px" }} />
										<div
											style={{
												display: "inline-block",
												opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25",
											}}
										>
											<BaseCodeErrorMenu
												codeError={codeError}
												post={props.post}
												errorGroup={props.errorGroup}
												collapsed={collapsed}
												setIsEditing={props.setIsEditing}
											/>
										</div>
									</>
								))}
						</>
					</div>
				</div>
			)}
			<Header>
				<Icon name="alert" className="type" />
				<BigTitle>
					<HeaderActions>
						{props.post && <AddReactionIcon post={props.post} className="in-review" />}
					</HeaderActions>
					<ApmServiceTitle>
						<ConditionalNewRelic
							connected={
								<Tooltip
									title={
										derivedState.isCurrentUserInternal
											? props.codeError?.id
											: props.errorGroup?.errorGroupUrl && props.codeError?.title
											? "Open Error on New Relic"
											: ""
									}
									placement="bottom"
									delay={1}
								>
									{props.errorGroup?.errorGroupUrl && props.codeError.title ? (
										<span data-testid="code-error-title">
											<Link
												href={
													props.errorGroup.errorGroupUrl! +
													`&utm_source=codestream&utm_medium=ide-${derivedState.ideName}&utm_campaign=error_group_link`
												}
											>
												{title} <Icon name="link-external" className="open-external"></Icon>
											</Link>
										</span>
									) : (
										<span data-testid="code-error-title">{title}</span>
									)}
								</Tooltip>
							}
							disconnected={
								<>
									{props.codeError && !props.errorGroup?.errorGroupUrl && (
										<span>
											<Link
												href="#"
												onClick={e => {
													e.preventDefault();
													setOpenConnectionModal(true);
												}}
											>
												{title} <Icon name="link-external" className="open-external"></Icon>
											</Link>
										</span>
									)}
								</>
							}
						/>
					</ApmServiceTitle>
				</BigTitle>
			</Header>
		</>
	);
};

export const BaseCodeErrorMenu = (props: BaseCodeErrorMenuProps) => {
	const { codeError, collapsed } = props;
	const dispatch = useAppDispatch();
	const derivedState = useAppSelector((state: CodeStreamState) => {
		const post =
			codeError && codeError.postId
				? getPost(state.posts, codeError!.streamId, codeError.postId)
				: undefined;

		return {
			post,
			currentUserId: state.session.userId!,
			currentUser: state.users[state.session.userId!],
			author: props.codeError ? state.users[props.codeError.creatorId] : undefined,
			userIsFollowing: props.codeError
				? (props.codeError.followerIds || []).includes(state.session.userId!)
				: [],
		};
	});
	const currentUserIsAdmin = useAppSelector(currentUserIsAdminSelector);
	const [isLoading, setIsLoading] = useState(false);
	const [menuState, setMenuState] = useState<{ open: boolean; target?: any }>({
		open: false,
		target: undefined,
	});

	const [shareModalOpen, setShareModalOpen] = useState(false);

	const permalinkRef = useRef<HTMLTextAreaElement>(null);

	const menuItems = useMemo(() => {
		const items: DropdownButtonItems[] = [];

		if (props.errorGroup) {
			items.push({
				label: "Refresh",
				icon: <Icon name="refresh" />,
				key: "refresh",
				action: async () => {
					setIsLoading(true);
					await dispatch(fetchErrorGroup(props.codeError));
					setIsLoading(false);
				},
			});
		}
		if (props.codeError?.id?.indexOf(PENDING_CODE_ERROR_ID_PREFIX) === -1) {
			items.push({
				label: "Copy Link",
				icon: <Icon name="copy" />,
				key: "copy-permalink",
				action: () => {
					if (permalinkRef && permalinkRef.current) {
						permalinkRef.current.select();
						document.execCommand("copy");
					}
				},
			});
		}

		if (currentUserIsAdmin) {
			items.push({
				label: "Delete All Replies",
				icon: <Icon name="trash" />,
				key: "deleteAll-permalink",
				action: () => {
					if (derivedState.post) {
						confirmPopup({
							title: "Are you sure?",
							message:
								"This will delete all posts in this conversation. Deleting a post cannot be undone.",
							centered: true,
							buttons: [
								{ label: "Go Back", className: "control-button" },
								{
									label: "Delete Post",
									className: "delete",
									wait: true,
									action: () => {
										const post = derivedState.post;
										if (!post) return;
										// Deleting the parent post will (soft) delete the codeError
										// and all the child posts
										dispatch(deletePost(post.streamId, post.id, post.sharedTo));
									},
								},
							],
						});
					}
				},
			});
		}

		// commented out until we have back-end support as per
		// https://trello.com/c/MhAWDZNF/6886-remove-delete-and-follow-unfollow
		// {
		// 	label: derivedState.userIsFollowing ? "Unfollow" : "Follow",
		// 	key: "toggle-follow",
		// 	icon: <Icon name="eye" />,
		// 	action: () => {
		// 		const value = !derivedState.userIsFollowing;
		// 		const changeType = value ? "Followed" : "Unfollowed";
		// 		HostApi.instance.send(FollowCodeErrorRequestType, {
		// 			id: codeError.id,
		// 			value
		// 		});
		// 		HostApi.instance.track("Notification Change", {
		// 			Change: `Code Error ${changeType}`,
		// 			"Source of Change": "Code Error menu"
		// 		});
		// 	}
		// }

		// commented out until we have back-end support as per
		// https://trello.com/c/MhAWDZNF/6886-remove-delete-and-follow-unfollow
		// if (codeError?.creatorId === derivedState.currentUser.id) {
		// 	items.push({
		// 		label: "Delete",
		// 		icon: <Icon name="trash" />,
		// 		action: () => {
		// 			confirmPopup({
		// 				title: "Are you sure?",
		// 				message: "Deleting a code error cannot be undone.",
		// 				centered: true,
		// 				buttons: [
		// 					{ label: "Go Back", className: "control-button" },
		// 					{
		// 						label: "Delete Code Error",
		// 						className: "delete",
		// 						wait: true,
		// 						action: () => {
		// 							dispatch(deleteCodeError(codeError.id));
		// 							dispatch(setCurrentCodeError());
		// 						}
		// 					}
		// 				]
		// 			});
		// 		}
		// 	});
		// }

		return items;
	}, [codeError, collapsed, props.errorGroup]);

	if (shareModalOpen) {
		return (
			<SharingModal
				codeError={props.codeError!}
				post={derivedState.post}
				onClose={() => setShareModalOpen(false)}
			/>
		);
	}

	if (collapsed) {
		return (
			<DropdownButton size="compact" items={menuItems}>
				<textarea
					readOnly
					key="permalink-offscreen"
					ref={permalinkRef}
					value={codeError?.permalink}
					style={{ position: "absolute", left: "-9999px" }}
				/>
			</DropdownButton>
		);
	}

	return (
		<>
			<DropdownButton
				items={menuItems}
				selectedKey={props.errorGroup?.state || "UNKNOWN"}
				isLoading={isLoading}
				variant="secondary"
				size="compact"
				noChevronDown
				wrap
			>
				<Icon loading={isLoading} name="kebab-horizontal" />
			</DropdownButton>
			<textarea
				readOnly
				key="permalink-offscreen"
				ref={permalinkRef}
				value={codeError?.permalink}
				style={{ position: "absolute", left: "-9999px" }}
			/>
			{menuState.open && (
				<Menu
					target={menuState.target}
					action={() => setMenuState({ open: false })}
					items={menuItems}
					align="dropdownRight"
				/>
			)}
		</>
	);
};

const BaseCodeError = (props: BaseCodeErrorProps) => {
	const dispatch = useAppDispatch();
	const derivedState = useAppSelector((state: CodeStreamState) => {
		const codeError: CSCodeError = state.codeErrors[props.codeError.id] || props.codeError;
		const codeAuthorId = (props.codeError.codeAuthorIds || [])[0];

		return {
			providers: state.providers,
			isInVscode: state.ide.name === "VSC",
			author: props.codeError ? state.users[props.codeError.creatorId] : undefined,
			codeAuthor: state.users[codeAuthorId || props.codeError?.creatorId],
			codeError,
			errorGroup: props.errorGroup,
			errorGroupIsLoading: codeError.objectId
				? state.codeErrors.errorGroups[codeError.objectId]?.isLoading
				: false,
			currentCodeErrorData: state.context.currentCodeErrorData,
			hideCodeErrorInstructions: state.preferences.hideCodeErrorInstructions,
			replies: props.collapsed
				? emptyArray
				: getThreadPosts(state, codeError.streamId, codeError.postId),
			showGrok: isFeatureEnabled(state, "showGrok"),
		};
	}, shallowEqual);
	const renderedFooter = props.renderFooter && props.renderFooter(CardFooter, ComposeWrapper);
	const { codeError, errorGroup } = derivedState;
	const isPostThreadsLoading: boolean | undefined = useAppSelector(
		state => state.posts.postThreadsLoading[codeError.postId]
	);

	const [currentSelectedLine, setCurrentSelectedLineIndex] = useState<number>(
		derivedState.currentCodeErrorData?.lineIndex || 0
	);
	const [didJumpToFirstAvailableLine, setDidJumpToFirstAvailableLine] = useState(false);
	const [didCopyMethod, setDidCopyMethod] = useState(false);
	const [jumpLocation, setJumpLocation] = useState<number | undefined>();
	const [loadGrokTimeout, setLoadGrokTimeout] = useState<NodeJS.Timeout | undefined>();
	const [grokRequested, setGrokRequested] = useState(false);

	const functionToEdit = useAppSelector(state => state.codeErrors.functionToEdit);
	const functionToEditFailed = useAppSelector(state => state.codeErrors.functionToEditFailed);
	const isGrokLoading = useAppSelector(isGrokStreamLoading);
	const currentGrokRepliesLength = useAppSelector(state =>
		getGrokPostLength(state, codeError.streamId, codeError.postId)
	);

	if (derivedState.showGrok && !props.readOnly) {
		useEffect(() => {
			const submitGrok = async (codeBlock?: string) => {
				// console.debug("===--- useEffect startGrokLoading");
				props.setGrokRequested();
				setGrokRequested(true);
				dispatch(startGrokLoading(props.codeError));
				const actualCodeError = (await dispatch(
					upgradePendingCodeError(props.codeError.id, "Comment", codeBlock, true)
				)) as
					| {
							codeError: CSCodeError | undefined;
					  }
					| undefined;

				if (!actualCodeError || !actualCodeError.codeError) {
					return;
				}

				dispatch(markItemRead(props.codeError.id, actualCodeError.codeError.numReplies + 1));

				// setIsLoading(false);
				// setText("");
				// setAttachments([]);
			};
			// Case 1 - pending post, will never try to fetch replies
			if (
				codeError.postId === undefined &&
				!isGrokLoading &&
				!grokRequested &&
				(functionToEdit || functionToEditFailed)
			) {
				submitGrok(functionToEdit?.codeBlock).catch(e => {
					console.error("submitGrok failed", e);
				});
				return;
			}
			// Case 2 - give a chance for replies to load before deciding to submitGrok
			if (
				!isGrokLoading &&
				isPostThreadsLoading !== undefined && // Hasn't attempted to load yet
				!isPostThreadsLoading && // Not currently loading
				!grokRequested &&
				derivedState.replies.length === 0 && // Has loaded replies and they are empty
				(functionToEdit || functionToEditFailed)
			) {
				submitGrok(functionToEdit?.codeBlock).catch(e => {
					console.error("submitGrok failed", e);
				});
			}
		}, [functionToEdit, functionToEditFailed, isPostThreadsLoading, derivedState.replies]);
	}

	const onClickStackLine = async (event, lineIndex) => {
		event && event.preventDefault();
		if (props.collapsed) return;
		const { stackTraces } = codeError;
		const stackInfo = stackTraces?.[0];
		if (stackInfo && stackInfo.lines[lineIndex] && stackInfo.lines[lineIndex].line !== undefined) {
			setCurrentSelectedLineIndex(lineIndex);
			dispatch(
				jumpToStackLine(lineIndex, stackInfo.lines[lineIndex], stackInfo.sha!, stackInfo.repoId!)
			);
		}
	};

	const { stackTraces } = codeError as CSCodeError;
	const stackTrace = stackTraces && stackTraces[0] && stackTraces[0].lines;
	const stackTraceText = stackTraces && stackTraces[0] && stackTraces[0].text;

	// This can be incredibly complex with nested anonymous inner functions. For the current approach
	// we rely on the stack trace having a named method for us to latch on to send for error analysis.
	// An alternate approach would be to resolve with language symbols in the IDE and bubble up to the
	// appropriate scope to find the best code segment to send. (i.e. up to the method of a class, but
	// not all the way up to the class itself)
	function extractMethodName(lines: CSStackTraceLine[]): CSStackTraceLine | undefined {
		for (const line of lines) {
			if (
				line.method &&
				line.resolved &&
				line.method !== "<unknown>" &&
				line.fileFullPath !== "<anonymous>"
			) {
				return line;
			}
		}
		return undefined;
	}

	useEffect(() => {
		if (
			!props.collapsed &&
			jumpLocation !== undefined &&
			didJumpToFirstAvailableLine &&
			!didCopyMethod
		) {
			const { stackTraces } = codeError;
			const stackInfo = stackTraces?.[0];
			// console.debug(`===--- symbol useEffect`);
			if (stackInfo?.lines) {
				// This might be different from the jumpToLine lineIndex if jumpToLine is an anonymous function
				// This also might not be the best approach, but it's a start
				const line = extractMethodName(stackInfo.lines);
				if (line?.fileRelativePath) {
					const { stackTraces } = codeError;
					const stackInfo = stackTraces?.[0];
					// console.debug(`===--- symbol useEffect`, line.method);
					try {
						// console.debug(`===--- symbol useEffect calling copySymbolFromIde`);
						dispatch(copySymbolFromIde(line, stackInfo.repoId, stackInfo.sha));
					} catch (ex) {
						console.warn(ex);
					}
					setDidCopyMethod(true);
					setTimeout(() => {
						try {
							// console.debug(`===--- symbol useEffect calling jumpToStackLine`);
							dispatch(
								jumpToStackLine(
									jumpLocation,
									stackInfo.lines[jumpLocation],
									stackInfo.sha!,
									stackInfo.repoId!
								)
							);
						} catch (ex) {
							console.warn(ex);
						}
					}, 100);
				}
			}
		}
	}, [codeError, jumpLocation, didJumpToFirstAvailableLine]);

	// We keep getting events for resolved stack trace lines, so we have to wait for this to settle down
	// When there are no more events for 2 seconds, we assume we're done and we can now handle the
	// edge case when there are no user code lines in the stack trace
	useEffect(() => {
		if (functionToEdit || functionToEditFailed || currentGrokRepliesLength > 0) {
			// If any of these are true, we're not in the edge case
			console.debug("loadGrokTimeout clearing edge case", {
				functionToEdit,
				functionToEditFailed,
				isGrokLoading,
				currentGrokRepliesLength,
			});
			if (loadGrokTimeout) {
				// console.debug("loadGrokTimeout", loadGrokTimeout);
				clearTimeout(loadGrokTimeout);
				setLoadGrokTimeout(undefined);
			}
			return;
		}
		if (loadGrokTimeout || isGrokLoading) {
			console.debug("loadGrokTimeout clearing timer 2", loadGrokTimeout);
			clearTimeout(loadGrokTimeout);
			setLoadGrokTimeout(undefined);
		}
		const timeout = setTimeout(() => {
			// if (!functionToEdit && !functionToEditFailed && !isGrokLoading && currentGrokRepliesLength === 0) {
			console.debug("useEffect no user code lines in stack trace setFunctionToEditFailed", {
				functionToEdit,
				functionToEditFailed,
				isGrokLoading,
				currentGrokRepliesLength,
			});
			dispatch(setFunctionToEditFailed(true));
			// }
		}, 3000);
		setLoadGrokTimeout(timeout);
		console.debug("loadGrokTimeout timer assigned", timeout);
	}, [codeError, functionToEdit, functionToEditFailed, isGrokLoading]);

	useEffect(() => {
		if (!props.collapsed && !didJumpToFirstAvailableLine) {
			const { stackTraces } = codeError;
			const stackInfo = stackTraces?.[0];
			if (stackInfo?.lines) {
				let lineIndex = currentSelectedLine;
				const len = stackInfo.lines.length;
				while (lineIndex < len && !stackInfo.lines[lineIndex].resolved) {
					lineIndex++;
				}
				if (lineIndex < len) {
					setDidJumpToFirstAvailableLine(true);
					setJumpLocation(lineIndex);
					setCurrentSelectedLineIndex(lineIndex);
				}
			}
		}
	}, [codeError]);

	const handleKeyDown = event => {
		if (
			props.stackFrameClickDisabled ||
			props.collapsed ||
			!props.parsedStack?.resolvedStackInfo?.lines
		) {
			return;
		}

		const lines = props.parsedStack?.resolvedStackInfo?.lines;
		if (!lines) return;

		let nextLine = currentSelectedLine;
		if (event.key === "ArrowUp" || event.which === 38) {
			event.stopPropagation();
			while (currentSelectedLine >= 0) {
				nextLine--;
				if (!lines[nextLine].error) {
					onClickStackLine(event, nextLine);
					return;
				}
			}
		}
		if (event.key === "ArrowDown" || event.which === 40) {
			event.stopPropagation();
			while (currentSelectedLine <= lines.length) {
				nextLine++;
				if (!lines[nextLine].error) {
					onClickStackLine(event, nextLine);
					return;
				}
			}
		}
	};

	const renderStackTrace = () => {
		if (stackTrace?.length) {
			return (
				<MetaSection>
					<Meta id="stack-trace" className={props.stackTraceTip ? "pulse" : ""}>
						<MetaLabel>Stack Trace</MetaLabel>
						<TourTip title={props.stackTraceTip} placement="bottom">
							<ClickLines tabIndex={0} onKeyDown={handleKeyDown} className="code">
								{(stackTrace || []).map((line, i) => {
									if (!line || !line.fileFullPath) return null;

									const className = i === currentSelectedLine ? "monospace li-active" : "monospace";
									const mline = line.fileFullPath.replace(/\s\s\s\s+/g, "     ");
									return props.stackFrameClickDisabled || props.collapsed || !line.resolved ? (
										<Tooltip
											key={"tooltipline-" + i}
											title={line.error}
											placement="bottom"
											delay={1}
										>
											<DisabledClickLine key={"disabled-line" + i} className="monospace">
												<span>
													<span style={{ opacity: ".6" }}>{line.fullMethod}</span>({mline}:
													<strong>{line.line}</strong>
													{line.column ? `:${line.column}` : null})
												</span>
											</DisabledClickLine>
										</Tooltip>
									) : (
										<ClickLine
											key={"click-line" + i}
											className={className}
											onClick={e => onClickStackLine(e, i)}
										>
											<span>
												<span style={{ opacity: ".6" }}>{line.method}</span>({mline}:
												<strong>{line.line}</strong>
												{line.column ? `:${line.column}` : null})
											</span>
										</ClickLine>
									);
								})}
							</ClickLines>
						</TourTip>
					</Meta>
					{props.post && (
						<div style={{ marginBottom: "10px" }}>
							<Reactions className="reactions no-pad-left" post={props.post} />
						</div>
					)}
					{!props.collapsed && props.post && <Attachments post={props.post as CSPost} />}
				</MetaSection>
			);
		}

		if (stackTraceText) {
			return (
				<MetaSection>
					<Meta id="stack-trace">
						<MetaLabel>Stack Trace</MetaLabel>
						<TourTip title={props.stackTraceTip} placement="bottom">
							<ClickLines id="stack-trace" className="code" tabIndex={0}>
								{stackTraceText.split("\n").map((line: string, i) => {
									if (!line) return null;
									const mline = line.replace(/\s\s\s\s+/g, "     ");
									return (
										<DisabledClickLine key={"disabled-line" + i} className="monospace">
											<span style={{ opacity: ".75" }}>{mline}</span>
										</DisabledClickLine>
									);
								})}
							</ClickLines>
						</TourTip>
					</Meta>
					{props.post && (
						<div style={{ marginBottom: "10px" }}>
							<Reactions className="reactions no-pad-left" post={props.post} />
						</div>
					)}
					{!props.collapsed && props.post && <Attachments post={props.post as CSPost} />}
				</MetaSection>
			);
		}
		return null;
	};

	const repoRef = isSha(props.repoInfo?.ref)
		? props.repoInfo?.ref?.substr(0, 7)
		: props.repoInfo?.ref;
	return (
		<MinimumWidthCard {...getCardProps(props)} noCard={!props.collapsed}>
			{props.collapsed && (
				<BaseCodeErrorHeader
					codeError={codeError}
					errorGroup={errorGroup}
					post={props.post}
					collapsed={props.collapsed}
					setIsEditing={props.setIsEditing}
				/>
			)}
			{props.headerError && props.headerError.message && (
				<div
					className="color-warning"
					style={{
						display: "flex",
						padding: "10px 0",
						whiteSpace: "normal",
						alignItems: "flex-start",
						opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25",
					}}
				>
					<Icon name="alert" />
					<div style={{ paddingLeft: "10px" }}>{props.headerError.message}</div>
				</div>
			)}
			{codeError?.text && (
				<Message
					data-testid="code-error-text"
					style={{
						opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25",
					}}
				>
					{codeError.text}
				</Message>
			)}

			{/* assuming 3 items (58px) */}
			{!props.collapsed && (
				<div
					style={{
						minHeight: derivedState.errorGroupIsLoading || errorGroup ? "18px" : "initial",
						opacity: derivedState.hideCodeErrorInstructions ? "1" : ".25",
					}}
				>
					{errorGroup &&
						errorGroup.attributes &&
						Object.keys(errorGroup.attributes).map(key => {
							const value: { type: string; value: any } = errorGroup.attributes![key];
							return (
								<DataRow>
									<DataLabel>{key}:</DataLabel>
									<DataValue>
										{value.type === "timestamp" && (
											<Timestamp className="no-padding" time={value.value as number} />
										)}
										{value.type !== "timestamp" && <>{value.value}</>}
									</DataValue>
								</DataRow>
							);
						})}

					{props.repoInfo && (
						<DataRow data-testid="code-error-repo">
							<DataLabel>Repo:</DataLabel>
							<DataValue>{props.repoInfo.repoName}</DataValue>
						</DataRow>
					)}
					{repoRef && (
						<DataRow data-testid="code-error-ref">
							<DataLabel>Build:</DataLabel>
							<DataValue>{repoRef}</DataValue>
						</DataRow>
					)}
				</div>
			)}

			{renderStackTrace()}
			{props.collapsed && renderMetaSectionCollapsed(props)}
			{!props.collapsed &&
				props &&
				props.post &&
				props.post.sharedTo &&
				props.post.sharedTo.length > 0 && (
					<div className="related">
						<div className="related-label">Shared To</div>
						{props.post.sharedTo.map(target => {
							const providerDisplay = PROVIDER_MAPPINGS[target.providerId];
							return (
								<Link className="external-link" href={target.url}>
									{providerDisplay && providerDisplay.icon && (
										<span>
											<Icon name={providerDisplay.icon} />
										</span>
									)}
									{target.channelName}
								</Link>
							);
						})}
					</div>
				)}
			{renderedFooter}
		</MinimumWidthCard>
	);
};

const renderMetaSectionCollapsed = (props: BaseCodeErrorProps) => {
	if (!props.isFollowing) return null;
	return (
		<MetaSectionCollapsed>
			{props.isFollowing && (
				<span>
					<Icon
						className="detail-icon"
						title="You are following this code error"
						placement="bottomLeft"
						align={{ offset: [-18, 4] }}
						name="eye"
					/>
				</span>
			)}
			{props.codeError.numReplies > 0 && (
				<Tooltip title="Show replies" placement="bottom">
					<span className="detail-icon">
						<Icon name="comment" /> {props.codeError.numReplies}
					</span>
				</Tooltip>
			)}
		</MetaSectionCollapsed>
	);
};

const GrokSuggestion = (props: { query: string; onSelect: (text: string) => void }) => {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				marginBottom: "10px",
			}}
		>
			<div>{props.query}</div>
			<Button onClick={() => props.onSelect(`@AI ${props.query}`)}>Select</Button>
		</div>
	);
};

const AskGrok = (props: { setText: (text: string) => void; onClose: () => void }) => {
	const onSelect = text => {
		props.setText(text);
		props.onClose();
	};
	return (
		<Modal translucent>
			<Dialog wide onClose={props.onClose} title="New Relic AI - Your GenAI Assistant">
				<p>
					By default the AI assistant will automatically provide an analysis of the error, and even
					a potential code fix, so that you can save time and reduce MTTR.
				</p>
				<p>
					But the conversation doesn't have to stop there! Mention AI in any reply to ask followup
					questions or have the AI assistant do some work for you.
				</p>
				<MetaLabel data-testid="grok-examples">Examples</MetaLabel>
				<GrokSuggestion query={"Write a test case for the suggested fix."} onSelect={onSelect} />
				<GrokSuggestion
					query={"Write a commit message for the suggested fix."}
					onSelect={onSelect}
				/>
			</Dialog>
		</Modal>
	);
};

const ReplyInput = (props: { codeError: CSCodeError; setGrokRequested: () => void }) => {
	const dispatch = useAppDispatch();
	const [text, setText] = useState("");
	const [isAskGrokOpen, setIsAskGrokOpen] = useState(false);
	const [attachments, setAttachments] = useState<AttachmentField[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const teamMates = useAppSelector((state: CodeStreamState) => getTeamMates(state));
	const showGrok = useAppSelector(state => isFeatureEnabled(state, "showGrok"));

	const submit = async () => {
		// don't create empty replies
		if (text.length === 0) return;

		props.setGrokRequested();

		setIsLoading(true);
		if (showGrok && text.match(/@AI/gim)) {
			dispatch(startGrokLoading(props.codeError));
		}

		const actualCodeError = (await dispatch(
			upgradePendingCodeError(props.codeError.id, "Comment")
		)) as {
			codeError: CSCodeError;
		};
		dispatch(markItemRead(props.codeError.id, actualCodeError.codeError.numReplies + 1));

		await dispatch(
			createPost(
				actualCodeError.codeError.streamId,
				actualCodeError.codeError.postId,
				replaceHtml(text)!,
				null,
				findMentionedUserIds(teamMates, text),
				{
					entryPoint: "Code Error",
					files: attachments,
				}
			)
		);

		setIsLoading(false);
		setText("");
		setAttachments([]);
	};

	return (
		<>
			{isAskGrokOpen && <AskGrok setText={setText} onClose={() => setIsAskGrokOpen(false)} />}
			<MessageInput
				multiCompose
				text={text}
				placeholder="Add a comment..."
				onChange={setText}
				onSubmit={submit}
				attachments={attachments}
				attachmentContainerType="reply"
				setAttachments={setAttachments}
				suggestGrok={showGrok}
			/>
			<ButtonRow
				style={{
					margin: 0,
					display: "flex",
					flexDirection: "row-reverse",
					justifyContent: "space-between",
				}}
			>
				<Tooltip
					title={
						<span>
							Submit Comment
							<span className="keybinding extra-pad">
								{navigator.appVersion.includes("Macintosh") ? "⌘" : "Ctrl"} ENTER
							</span>
						</span>
					}
					placement="bottomRight"
					delay={1}
				>
					<Button disabled={text.length === 0} onClick={submit} isLoading={isLoading}>
						Comment
					</Button>
				</Tooltip>
				{showGrok && (
					<Button style={{ marginLeft: 0 }} onClick={() => setIsAskGrokOpen(true)}>
						<Icon name="grok" />
						<span style={{ paddingLeft: "4px" }}>Ask AI</span>
					</Button>
				)}
			</ButtonRow>
		</>
	);
};

type FromBaseCodeErrorProps = Pick<
	BaseCodeErrorProps,
	| "collapsed"
	| "hoverEffect"
	| "onClick"
	| "className"
	| "renderFooter"
	| "stackFrameClickDisabled"
	| "stackTraceTip"
	| "resolutionTip"
>;

interface PropsWithId extends FromBaseCodeErrorProps {
	id: string;
}

interface PropsWithCodeError extends FromBaseCodeErrorProps {
	codeError: CSCodeError;
	errorGroup?: NewRelicErrorGroup;
	parsedStack?: ResolveStackTraceResponse;
	readOnly?: boolean;
}

function isPropsWithId(props: PropsWithId | PropsWithCodeError): props is PropsWithId {
	return (props as any).id != undefined;
}

export type CodeErrorProps = PropsWithId | PropsWithCodeError;

const CodeErrorForCodeError = (props: PropsWithCodeError) => {
	const { codeError, ...baseProps } = props;
	const derivedState = useAppSelector((state: CodeStreamState) => {
		const post =
			codeError && codeError.postId
				? getPost(state.posts, codeError!.streamId, codeError.postId)
				: undefined;

		return {
			post,
			currentTeamId: state.context.currentTeamId,
			currentUser: state.users[state.session.userId!],
			author: state.users[props.codeError.creatorId],
			repos: state.repos,
			userIsFollowing: (props.codeError.followerIds || []).includes(state.session.userId!),
			replies: props.collapsed
				? emptyArray
				: getThreadPosts(state, codeError.streamId, codeError.postId),
			isPDIdev: isFeatureEnabled(state, "PDIdev"),
		};
	}, shallowEqual);

	const isGrokLoading = useAppSelector(isGrokStreamLoading);
	const grokError = useAppSelector(state =>
		state.codeErrors.grokError
			? { message: state.codeErrors.grokError.errorMessage, type: "warning" }
			: undefined
	);

	const [headerError, setHeaderError] = useState<SimpleError>();
	const [isEditing, setIsEditing] = useState(false);
	const [shareModalOpen, setShareModalOpen] = useState(false);
	const [scrollNewTarget, setScrollNewTarget] = useState<RefObject<HTMLElement> | undefined>(
		undefined
	);
	const [isGrokRequested, setIsGrokRequested] = useState(false);
	const currentGrokRepliesLength = useAppSelector(state =>
		getGrokPostLength(state, props.codeError.streamId, props.codeError.postId)
	);

	function scrollToNew() {
		const target = scrollNewTarget?.current;
		if (target) {
			// console.debug("===--- scrollToNew ", target);
			target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
		} else {
			// console.debug("===--- scrollToNew no target", scrollNewTarget);
		}
	}

	useEffect(() => {
		if ((isGrokRequested || isGrokLoading) && currentGrokRepliesLength > 0) {
			// console.debug(`---=== useEffect calling scrollToNew ${currentGrokRepliesLength} ===---`);
			scrollToNew();
		}
	}, [currentGrokRepliesLength, isGrokLoading, derivedState.post]);

	function scrollNewTargetCallback(ref: RefObject<HTMLElement>) {
		// console.debug("===--- scrollNewTargetCallback setScrollNewTarget ", ref);
		setScrollNewTarget(ref);
	}

	function setGrokRequested() {
		setIsGrokRequested(true);
	}

	useDidMount(() => {
		if (!props.collapsed) {
			requestAnimationFrame(() => {
				const $stackTrace = document.getElementById("stack-trace");
				if ($stackTrace) $stackTrace.focus();
			});
		}
	});

	const renderFooter =
		props.renderFooter ||
		((Footer, InputContainer) => {
			if (props.collapsed) return null;

			// console.debug(`===--- length: ${currentGrokRepliesLength} isGrokLoading: ${isGrokLoading} ---===`);

			return (
				<Footer
					className={isGrokLoading ? "grok-loading" : "grok-not-loading" + " replies-to-review"}
					style={{ borderTop: "none", marginTop: 0 }}
				>
					{props.codeError.postId && (
						<>
							{<MetaLabel>Activity</MetaLabel>}
							<RepliesToPost
								streamId={props.codeError.streamId}
								parentPostId={props.codeError.postId}
								itemId={props.codeError.id}
								numReplies={props.codeError.numReplies}
								scrollNewTargetCallback={scrollNewTargetCallback}
								codeErrorId={props.codeError.id}
								noReply={true}
							/>
							{grokError && (
								<DelayedRender>
									<div className="color-warning">
										<div>{grokError.message}</div>
									</div>
								</DelayedRender>
							)}
						</>
					)}

					{InputContainer && !derivedState.isPDIdev && (
						<InputContainer>
							<ReplyInput codeError={codeError} setGrokRequested={setGrokRequested} />
						</InputContainer>
					)}
				</Footer>
			);
		});

	const repoInfo = useMemo(() => {
		const { stackTraces } = codeError;
		let stackInfo = stackTraces && stackTraces[0]; // TODO deal with multiple stacks
		if (!stackInfo) stackInfo = (codeError as any).stackInfo; // this is for old code, maybe can remove after a while?
		if (stackInfo && stackInfo.repoId) {
			const repo = derivedState.repos[stackInfo.repoId];
			if (!repo) return undefined;

			return { repoName: repo.name, ref: stackInfo.sha! };
		} else {
			return undefined;
		}
	}, [codeError, derivedState.repos]);

	return (
		<>
			{shareModalOpen && (
				<SharingModal
					codeError={props.codeError}
					post={derivedState.post}
					onClose={() => setShareModalOpen(false)}
				/>
			)}
			<BaseCodeError
				{...baseProps}
				parsedStack={props.parsedStack}
				codeError={props.codeError}
				post={derivedState.post}
				repoInfo={repoInfo}
				isFollowing={derivedState.userIsFollowing}
				currentUserId={derivedState.currentUser.id}
				renderFooter={renderFooter}
				setIsEditing={setIsEditing}
				headerError={headerError}
				setGrokRequested={setGrokRequested}
				readOnly={props.readOnly === true}
			/>
		</>
	);
};

const CodeErrorForId = (props: PropsWithId) => {
	const { id, ...otherProps } = props;

	const dispatch = useAppDispatch();
	const codeError = useAppSelector((state: CodeStreamState) => {
		return getCodeError(state.codeErrors, id);
	});
	const [notFound, setNotFound] = useState(false);

	useDidMount(() => {
		let isValid = true;

		if (codeError == null) {
			dispatch(fetchCodeError(id))
				.then(result => {
					if (!isValid) return;
					if (result == null) setNotFound(true);
				})
				.catch(() => setNotFound(true));
		}

		return () => {
			isValid = false;
		};
	});

	if (notFound) {
		return (
			<MinimumWidthCard>
				This code error was not found. Perhaps it was deleted by the author, or you don't have
				permission to view it.
			</MinimumWidthCard>
		);
	}

	if (codeError == null) {
		return (
			<DelayedRender>
				<Loading />
			</DelayedRender>
		);
	}

	return <CodeErrorForCodeError codeError={codeError} {...otherProps} />;
};

export const CodeError = (props: CodeErrorProps) => {
	if (isPropsWithId(props)) return <CodeErrorForId {...props} />;
	return <CodeErrorForCodeError {...props} />;
};
