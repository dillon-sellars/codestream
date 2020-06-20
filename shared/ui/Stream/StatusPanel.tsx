import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { CodeStreamState } from "../store";
import { HostApi } from "../webview-api";
import Icon from "./Icon";
import { Checkbox } from "../src/components/Checkbox";
import styled from "styled-components";
import { Button } from "../src/components/Button";
import { setUserStatus, setUserPreference } from "./actions";
import { closePanel } from "../store/context/actions";
import { CSMe } from "@codestream/protocols/api";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { useDidMount } from "../utilities/hooks";
import {
	GetBranchesRequestType,
	CreateBranchRequestType,
	SwitchBranchRequestType,
	OpenUrlRequestType,
	MoveThirdPartyCardRequestType,
	GetReposScmRequestType,
	ReposScm
} from "@codestream/protocols/agent";
import Menu from "./Menu";
import { CrossPostIssueContext } from "./CodemarkForm";
import IssueDropdown from "./CrossPostIssueControls/IssueDropdown";
import { CSText } from "../src/components/CSText";
import { ConfigureBranchNames } from "./ConfigureBranchNames";
import { VideoLink } from "./Flow";
import { MarkdownText } from "./MarkdownText";

const StyledCheckbox = styled(Checkbox)`
	color: var(--text-color-subtle);
`;

const StatusInput = styled.div`
	position: relative;
	margin-bottom: 20px;
	.ticket-icon,
	.dropdown-button {
		position: absolute;
		left: 1px;
		top: 1px;
		// border-right: 1px solid var(--base-border-color);
		font-size: 18px;
		line-height: 20px;
		display: flex;
		width: 34px;
		height: calc(100% - 2px);
		align-items: center;
		justify-content: center;
		.icon {
			margin: 2px 2px -2px -2px;
		}
	}
	.clear {
		position: absolute;
		right: 2px;
		top: 1px;
		padding: 8px 10px;
	}
	.open-card {
		position: absolute;
		right: 28px;
		top: 1px;
		padding: 8px 10px;
	}
	.dropdown-button {
		cursor: pointer;
		left: auto;
		right: 1px;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--base-border-color);
		border-right: none;
		.icon {
			margin: 4px 0 0 -2px;
			&.spin {
				margin: -2px 0 0 -1px;
			}
		}
		&:hover {
			background: var(--app-background-color);
			color: var(--text-color-highlight);
		}
		&.selected {
			background: var(--button-background-color);
			color: var(--button-foreground-color);
		}
	}
	input#status-input {
		border: 1px solid var(--base-border-color);
		font-size: 14px !important;
		// padding: 8px 40px 8px 42px !important;
		padding: 8px 40px 8px 10px !important;
		&::placeholder {
			font-size: 14px !important;
		}
	}
	.ticket-icon {
	}
	&.has-ticket-icon input#status-input {
		padding: 8px 60px 8px 32px !important;
	}
`;

const ButtonRow = styled.div`
	text-align: center;
	margin-top: 20px;
	button {
		width: 18em;
	}
`;

const MonoMenu = styled(InlineMenu)`
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	white-space: normal;
`;

const SCMError = styled.div`
	margin: 20px 0 0 0;
	font-size: smaller;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	white-space: pre-wrap;
`;

const CardDescription = styled.div`
	padding: 10px;
	border: 1px solid var(--base-border-color);
	border-top: none;
	margin-bottom: 20px;
	margin-top: -20px;
	background: var(--base-background-color);
`;

const CardLink = styled.div`
	text-align: right;
	font-size: smaller;
	margin: -18px 0 15px 0;
`;

const EMPTY_STATUS = {
	label: "",
	ticketUrl: "",
	ticketProvider: "",
	invisible: false
};

export const StatusPanel = (props: { closePanel: Function }) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		let status =
			currentUser.status && "label" in currentUser.status ? currentUser.status : EMPTY_STATUS;
		// const now = new Date().getTime();
		// if (status.expires && status.expires < now) status = EMPTY_STATUS;
		const teamId = state.context.currentTeamId;
		const team = state.teams[teamId];
		const settings = team.settings || {};
		const { preferences = {} } = state;
		const workPreferences = preferences["startWork"] || {};

		return {
			status,
			repos: state.repos,
			invisible: status.invisible || false,
			teamName: team.name,
			currentUserName: state.users[state.session.userId!].username,
			textEditorUri: state.editorContext.textEditorUri,
			branchMaxLength: settings.branchMaxLength || 40,
			branchTicketTemplate: settings.branchTicketTemplate || "feature/ticket-{id}",
			branchDescriptionTemplate: settings.branchDescriptionTemplate || "feature/{title}",
			createBranch: Object.keys(workPreferences).includes("createBranch")
				? workPreferences.createBranch
				: true,
			moveCard: Object.keys(workPreferences).includes("moveCard") ? workPreferences.moveCard : true
		};
	});

	const { status } = derivedState;
	const [loading, setLoading] = useState(false);
	const [scmError, setScmError] = useState("");
	const [label, setLabel] = useState(status.label || "");
	const [card, setCard] = useState(
		status.ticketUrl
			? ({
					url: status.ticketUrl,
					providerName: status.ticketProvider,
					title: status.label,
					moveCardLabel: "Move this card to",
					moveCardOptions: [] as any
			  } as any)
			: undefined
	);
	// const [icon, setIcon] = useState(status.icon || ":desktop_computer:");
	// const [moveCard, setMoveCard] = useState(true);
	// const [createBranch, setCreateBranch] = useState(true);
	const [manuallySelectedBranch, setManuallySelectedBranch] = useState("");
	// const [newBranch, setNewBranch] = useState("");
	const [currentBranch, setCurrentBranch] = useState("");
	const [editingBranch, setEditingBranch] = useState(false);
	const [branches, setBranches] = useState([] as string[]);
	const [customBranchName, setCustomBranchName] = useState("");
	const [configureBranchNames, setConfigureBranchNames] = useState(false);
	const [autocomplete, setAutocomplete] = useState(false);
	const [openRepos, setOpenRepos] = useState<ReposScm[]>([]);
	const [repoUri, setRepoUri] = useState("");
	const [currentRepoId, setCurrentRepoId] = useState("");
	const [fromBranch, setFromBranch] = useState("");
	const inputRef = React.useRef<HTMLInputElement>(null);

	const { moveCard, createBranch } = derivedState;

	const setMoveCard = value => dispatch(setUserPreference(["startWork", "moveCard"], value));
	const setCreateBranch = value =>
		dispatch(setUserPreference(["startWork", "createBranch"], value));

	const handleChangeStatus = value => {
		// if (card) return;
		setLabel(value || "");
		setCard(undefined);
		setAutocomplete(true);
	};

	const handleBlurStatus = () => {
		// setAutocomplete(false);
	};

	const selectCard = card => {
		if (card && card.title) {
			setLabel(card.title || "");
			setCard(card);

			if (card.moveCardOptions && card.moveCardOptions.length) {
				const index = card.moveCardOptions.findIndex(option => option.id === card.idList);
				const next = card.moveCardOptions[index + 1];
				if (next) setMoveCardDestination(next);
				else setMoveCardDestination(card.moveCardOptions[0]);
			} else {
			}
		}

		setAutocomplete(false);
	};

	const dateToken = () => {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const date = now.getDate();
		return `${year}-${month > 9 ? month : "0" + month}-${date > 9 ? date : "0" + date}`;
	};

	const replaceDescriptionTokens = (template: string, title: string = "") => {
		return template
			.replace(/\{id\}/g, "")
			.replace(/\{username\}/g, derivedState.currentUserName)
			.replace(/\{team\}/g, derivedState.teamName)
			.replace(/\{date\}/g, dateToken())
			.replace(/\{title\}/g, title.toLowerCase())
			.replace(/[\s]+/g, "-")
			.substr(0, derivedState.branchMaxLength);
	};

	const replaceTicketTokens = (template: string, id: string, title: string = "") => {
		return template
			.replace(/\{id\}/g, id)
			.replace(/\{username\}/g, derivedState.currentUserName)
			.replace(/\{team\}/g, derivedState.teamName)
			.replace(/\{date\}/g, dateToken())
			.replace(/\{title\}/g, title.toLowerCase())
			.replace(/[\s]+/g, "-")
			.substr(0, derivedState.branchMaxLength);
	};

	const makeBranchName = (value: string) =>
		replaceDescriptionTokens(derivedState.branchDescriptionTemplate, value);

	const getBranches = async (uri?: string) => {
		if (!uri && !derivedState.textEditorUri) return;
		if (uri) setRepoUri(uri);
		const branchInfo = await HostApi.instance.send(GetBranchesRequestType, {
			// stupid TS
			uri: uri || derivedState.textEditorUri || ""
		});
		if (!branchInfo.scm) return;

		setBranches(branchInfo.scm.branches);
		setCurrentBranch(branchInfo.scm.current);
		setCurrentRepoId(branchInfo.scm.repoId);

		const response = await HostApi.instance.send(GetReposScmRequestType, {});
		if (response && response.repositories) {
			setOpenRepos(response.repositories);
		}
	};

	useDidMount(() => {
		getBranches();
	});

	const same = label == status.label; // && icon == status.icon;

	const showMoveCardCheckbox = React.useMemo(() => {
		return !same && card && card.moveCardOptions && card.moveCardOptions.length > 0;
	}, [card, same]);
	const showCreateBranchCheckbox = React.useMemo(() => {
		return !same && label; // && label.startsWith("http");
	}, [label, same]);

	const newBranch = React.useMemo(() => {
		// setNewBranch(newBranch);
		if (customBranchName) return customBranchName;
		if (card)
			//@ts-ignore
			return replaceTicketTokens(derivedState.branchTicketTemplate, card.id, card.title);
		else return replaceDescriptionTokens(derivedState.branchDescriptionTemplate, label);
	}, [
		label,
		card,
		customBranchName,
		derivedState.branchTicketTemplate,
		derivedState.branchDescriptionTemplate
	]);

	const branch = React.useMemo(() => {
		if (manuallySelectedBranch) return manuallySelectedBranch;
		if (customBranchName) return customBranchName;
		if (card)
			//@ts-ignore
			return replaceTicketTokens(derivedState.branchTicketTemplate, card.id, card.title);
		else return replaceDescriptionTokens(derivedState.branchDescriptionTemplate, label);
	}, [
		label,
		card,
		manuallySelectedBranch,
		customBranchName,
		derivedState.branchTicketTemplate,
		derivedState.branchDescriptionTemplate
	]);

	const save = async () => {
		setLoading(true);

		HostApi.instance.track("Work Started", {
			"Branch Created": createBranch,
			"Ticket Selected": card ? card.providerName : ""
		});

		if (
			showCreateBranchCheckbox &&
			createBranch &&
			branch.length > 0 &&
			(repoUri || derivedState.textEditorUri)
		) {
			const uri = repoUri || derivedState.textEditorUri || "";
			const request = branches.includes(branch) ? SwitchBranchRequestType : CreateBranchRequestType;
			const result = await HostApi.instance.send(request, { branch, uri, fromBranch });
			// FIXME handle error
			if (result.error) {
				console.warn("ERROR FROM SET BRANCH: ", result.error);
				setScmError(result.error);
				setLoading(false);
				return;
			}
		}

		if (showMoveCardCheckbox && moveCard && card && moveCardDestinationId) {
			const response = await HostApi.instance.send(MoveThirdPartyCardRequestType, {
				providerId: card.providerId,
				cardId: card.id,
				listId: moveCardDestinationId
			});
		}

		const ticketUrl = card ? card.url : "";
		const ticketProvider = card ? card.providerName : "";
		await dispatch(setUserStatus(label, ticketUrl, ticketProvider, derivedState.invisible));
		dispatch(closePanel());
		setLoading(false);
	};

	const clear = () => {
		setLabel("");
		setCard(undefined);
		setScmError("");
		const input = document.getElementById("status-input");
		if (input) input.focus();
	};

	const saveLabel =
		!label || label.length === 0
			? "Clear Status"
			: !branch || branch == currentBranch || !createBranch
			? "Save Status"
			: branches.includes(branch)
			? "Switch Branch & Save Status"
			: "Create Branch & Save Status";

	const useBranchLabel =
		branch == currentBranch
			? "Use branch"
			: branches.includes(branch)
			? "Switch to branch"
			: "Create branch";

	const makeMenuItem = (branch: string, isNew?: boolean) => {
		const iconName = branch == currentBranch ? "arrow-right" : "blank";
		return {
			label: (
				<span>
					{branch == currentBranch ? "Use " : "Switch to "}
					<span className="monospace highlight">
						<b>{branch}</b>
					</span>
					{branch == currentBranch && <> (current)</>}
				</span>
			),
			key: branch,
			icon: <Icon name={iconName} />,
			action: () => setManuallySelectedBranch(branch)
		};
	};

	const makeFromMenuItem = (branch: string) => {
		const iconName = branch == currentBranch ? "arrow-right" : "blank";
		return {
			label: <span className="monospace">{branch}</span>,
			key: branch,
			icon: <Icon name={iconName} />,
			action: () => setFromBranch(branch)
		};
	};

	const branchMenuItems = branches.map(branch => makeMenuItem(branch, false)) as any;
	if (newBranch) {
		branchMenuItems.unshift(
			{
				label: "Edit Branch Name",
				key: "edit",
				icon: <Icon name="pencil" />,
				action: () => setEditingBranch(true)
			},
			{
				label: "Configure Branch Naming",
				key: "configure",
				icon: <Icon name="gear" />,
				action: () => setConfigureBranchNames(true)
			},
			{ label: "-" },
			{
				label: (
					<span>
						Create{" "}
						<span className="monospace highlight">
							<b>{newBranch}</b>
						</span>
					</span>
				),
				key: "create",
				icon: <Icon name="plus" />,
				action: () => setManuallySelectedBranch(newBranch),
				submenu: [
					{
						label: "Create Branch From....",
						disabled: true,
						noHover: true,
						icon: <Icon name="blank" />
					},
					{ label: "-" },
					...branches.map(branch => makeFromMenuItem(branch))
				]
			}
		);
	}

	if (openRepos && openRepos.length > 1) {
		branchMenuItems.unshift(
			{
				label: "Repository",
				key: "repo",
				icon: <Icon name="repo" />,
				submenu: openRepos.map(repo => {
					const repoId = repo.id || "";
					return {
						icon: <Icon name={repo.id === currentRepoId ? "arrow-right" : "blank"} />,
						label: derivedState.repos[repoId] ? derivedState.repos[repoId].name : repo.folder.name,
						key: repo.id,
						action: () => getBranches(repo.folder.uri)
					};
				})
			},
			{ label: "-" }
		);
	}

	const setMoveCardDestination = option => {
		setMoveCardDestinationId(option.id);
		setMoveCardDestinationLabel(option.name);
	};

	const [moveCardDestinationId, setMoveCardDestinationId] = React.useState("");
	const [moveCardDestinationLabel, setMoveCardDestinationLabel] = React.useState("");

	const moveCardItems = !card
		? []
		: card.moveCardOptions.map(option => {
				return {
					label: option.name,
					icon: <Icon name={card && option.id === card.idList ? "arrow-right" : "blank"} />,
					key: option.id,
					action: () => setMoveCardDestination(option)
				};
		  });

	if (configureBranchNames)
		return <ConfigureBranchNames onClose={() => setConfigureBranchNames(false)} />;

	return (
		<div className="full-height-panel">
			<form className="standard-form vscroll" style={{ padding: "10px" }}>
				<div className="panel-header">
					What are you working on?
					<CancelButton onClick={props.closePanel} placement="left" />
				</div>
				<fieldset className="form-body" style={{ padding: "10px" }}>
					<div id="controls">
						<StatusInput className={card && card.providerName ? "has-ticket-icon" : ""}>
							{card && card.providerName && (
								<div className="ticket-icon">
									<Icon name={card.providerName} />
								</div>
							)}
							{!label || (label && autocomplete) ? (
								<CrossPostIssueContext.Provider
									value={{
										selectedAssignees: [],
										setValues: values => selectCard(values),
										setSelectedAssignees: () => {}
									}}
								>
									<IssueDropdown q={label} focusInput={inputRef} />
								</CrossPostIssueContext.Provider>
							) : (
								<div className="clear" onClick={clear}>
									<Icon
										name="x"
										title="Clear Status"
										delay={1}
										placement="bottom"
										className="clickable"
									/>
								</div>
							)}
							{card && card.url && (
								<div className="open-card">
									<Icon
										title="Open on Trello"
										delay={1}
										placement="bottom"
										name="link-external"
										className="clickable"
										onClick={() =>
											HostApi.instance.send(OpenUrlRequestType, {
												url: card.url
											})
										}
									/>
								</div>
							)}
							<input
								id="status-input"
								ref={inputRef}
								name="status"
								value={label}
								className="input-text control"
								autoFocus={true}
								disabled={card ? true : false}
								type="text"
								onChange={e => handleChangeStatus(e.target.value)}
								onBlur={handleBlurStatus}
								placeholder="Enter description or select ticket"
							/>
						</StatusInput>
						{card && card.description && (
							<CardDescription>
								<MarkdownText text={card.description} />
							</CardDescription>
						)}
						<div style={{ paddingLeft: "6px" }}>
							{showCreateBranchCheckbox && (
								<StyledCheckbox
									name="create-branch"
									checked={createBranch}
									onChange={v => setCreateBranch(v)}
								>
									{useBranchLabel}{" "}
									{editingBranch ? (
										<input
											id="branch-input"
											name="branch"
											value={customBranchName || branch}
											className="input-text control"
											autoFocus={true}
											type="text"
											onChange={e => setCustomBranchName(e.target.value)}
											placeholder="Enter branch name"
											onBlur={() => setEditingBranch(false)}
											onKeyPress={e => {
												if (e.key == "Enter") setEditingBranch(false);
											}}
											style={{ width: "200px" }}
										/>
									) : (
										<>
											<MonoMenu items={branchMenuItems}>{branch}</MonoMenu>
											{fromBranch && fromBranch !== currentBranch && (
												<div>
													from <span className="highlight monospace">{fromBranch}</span>
												</div>
											)}
										</>
									)}
								</StyledCheckbox>
							)}
							{showMoveCardCheckbox && (
								<StyledCheckbox name="move-issue" checked={moveCard} onChange={v => setMoveCard(v)}>
									{card && card.moveCardLabel}{" "}
									<InlineMenu items={moveCardItems}>
										{moveCardDestinationLabel || "make selection"}
									</InlineMenu>
								</StyledCheckbox>
							)}
						</div>
						<div style={{ height: "5px" }}></div>
						{scmError && <SCMError>{scmError}</SCMError>}
						{!same && (
							<ButtonRow>
								<Button onClick={save} isLoading={loading}>
									{saveLabel}
								</Button>
							</ButtonRow>
						)}
						<div style={{ marginTop: "20px", textAlign: "center", display: "none" }}>
							<div style={{ display: "inline-block" }}>
								<VideoLink href={"step.video"}>
									<img src="https://i.imgur.com/9IKqpzf.png" />
									<span>How do I grab a ticket &amp; create a branch?</span>
								</VideoLink>
							</div>
						</div>
					</div>
				</fieldset>
			</form>
		</div>
	);
};
